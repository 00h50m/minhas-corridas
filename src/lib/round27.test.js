// Rodada 27: outras atividades, traçado com zona de privacidade, mapa/território, passaporte,
// provas perto de você e story de conquista.
import { describe, expect, it } from 'vitest'
import { normalizeWorkout, plannedSec, validateWorkout, workoutLine } from './workout.js'
import { weekSummary } from './trainingWeek.js'
import { paceSeriesWithTests } from './evolution.js'
import { trackFrom } from './activityFile.js'
import { decodePolyline } from './polyline.js'
import { cellsOf, collectTracks, territory } from './runMap.js'
import { passport } from './passport.js'
import { editionLink, lastYearAgain, nearCities, nextMonths, searchLinks } from './nearRaces.js'
import { matchActivity, freeWorkout, sportFromFile } from './activityMatch.js'
import { storyFor } from './storyData.js'

const R = 6371000
const metersBetween = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
/** Linha reta para o norte a partir de (lat0, lon0): n pontos a cada `step` m. */
const line = (lat0, lon0, n, step = 10) => Array.from({ length: n }, (_, i) => ({ t: 1e12 + i * 3000, d: i * step, lat: lat0 + (i * step) / 111320, lon: lon0 }))

describe('outras atividades', () => {
  it('normaliza tipo e minutos; corrida continua exigindo passos', () => {
    const a = normalizeWorkout({ name: 'Academia', sport: 'academia', plannedMin: 50, items: [{ type: 'corrida', duration: { kind: 'time', value: 600 } }] })
    expect(a.sport).toBe('academia')
    expect(a.items).toEqual([])
    expect(validateWorkout(a)).toEqual({})
    expect(plannedSec(a)).toBe(3000)
    expect(workoutLine(a)).toBe('🏋️ Academia / força · 50 min')
    expect(validateWorkout(normalizeWorkout({ name: 'X', sport: 'bike' })).plannedMin).toBeTruthy()
    expect(normalizeWorkout({ name: 'X', sport: 'patinete' }).sport).toBe('corrida')
    expect(validateWorkout(normalizeWorkout({ name: 'Rodagem' })).items).toBeTruthy()
  })
  it('entra na semana (tempo, cumprida) mas não nos km nem no pace', () => {
    const ws = [
      { ...normalizeWorkout({ name: 'Bike', sport: 'bike', plannedMin: 60, date: '2026-11-17' }), status: 'feito', result: { distanceKm: 25, elapsedSec: 3600, laps: [] } },
      { ...normalizeWorkout({ name: 'Corrida', date: '2026-11-18', items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }] }), status: 'feito', result: { distanceKm: 5, elapsedSec: 2400, laps: [] } }
    ]
    const s = weekSummary(ws, '2026-11-16', '2026-11-20')
    expect(s.done).toBe(2)
    expect(s.cross).toBe(1)
    expect(s.doneKm).toBe(5)
    expect(s.doneSec).toBe(6000)
    expect(s.complete).toBe(true)
    // bike de 5 km não vira "teste de 5 km"
    const bike5 = { ...ws[0], id: 'b5', date: '2026-11-19', result: { distanceKm: 5, elapsedSec: 600, laps: [] } }
    const series = paceSeriesWithTests([], [ws[1], bike5, { ...ws[1], id: 'c2', date: '2026-11-21' }])
    expect(series[0].points.every((p) => p.pace > 400)).toBe(true)
  })
  it('arquivo de bike vai para atividade de bike (ou vira bike avulsa)', () => {
    expect(sportFromFile({ sport: 'cycling' })).toBe('bike')
    expect(sportFromFile({ sport: 'running' })).toBe('corrida')
    expect(sportFromFile({ sport: null })).toBe('corrida')
    const ws = [normalizeWorkout({ id: 'r', name: 'Rodagem', date: '2026-11-17', items: [{ type: 'corrida', duration: { kind: 'time', value: 600 } }] }), { ...normalizeWorkout({ name: 'Bike', sport: 'bike', plannedMin: 40, date: '2026-11-17' }), id: 'b' }]
    expect(matchActivity(ws, '2026-11-17', 'bike').auto.id).toBe('b')
    expect(matchActivity(ws, '2026-11-17', 'corrida').auto.id).toBe('r')
    const free = freeWorkout({ sport: 'cycling', startTime: '2026-11-17T10:00:00Z', elapsedSec: 3600, distanceKm: 20, fileName: 'x.fit' })
    expect(free.sport).toBe('bike')
    expect(free.name).toMatch(/^Bike /)
  })
})

describe('traçado com zona de privacidade', () => {
  it('corta 200 m do começo e do fim e simplifica', () => {
    const pts = line(-23, -46.9, 301) // 3 km
    const coords = decodePolyline(trackFrom(pts))
    const start = [pts[0].lat, pts[0].lon]
    const end = [pts.at(-1).lat, pts.at(-1).lon]
    expect(metersBetween(start, coords[0])).toBeGreaterThanOrEqual(195)
    expect(metersBetween(end, coords.at(-1))).toBeGreaterThanOrEqual(195)
    expect(coords.length).toBeLessThan(10) // reta: só as pontas
  })
  it('sem GPS ou percurso curto: sem traçado; percurso longo e sinuoso: até 400 pontos', () => {
    expect(trackFrom(line(-23, -46.9, 301).map((p) => ({ ...p, lat: null, lon: null })))).toBeNull()
    expect(trackFrom(line(-23, -46.9, 50))).toBeNull()
    const zig = Array.from({ length: 4000 }, (_, i) => ({ t: i * 1000, d: i * 10, lat: -23 + (i * 10) / 111320, lon: -46.9 + (i % 2) * 0.0003 }))
    const c = decodePolyline(trackFrom(zig))
    expect(c.length).toBeLessThanOrEqual(400)
    expect(c.length).toBeGreaterThan(50)
  })
})

describe('mapa e território', () => {
  const t1 = trackFrom(line(-23, -46.9, 301))
  const t2 = trackFrom(line(-23, -46.9, 401)) // mesmo caminho, 1 km a mais
  const races = [{ id: 'p', name: 'Prova', date: '2026-10-01', status: 'concluida', result: { watch: { track: t1 } } }]
  const workouts = [
    { id: 'w', name: 'Longão', date: '2026-11-10', status: 'feito', result: { track: t2 } },
    { id: 'x', name: 'Ruim', date: '2026-11-11', status: 'feito', result: { track: 'não é polyline' } }
  ]
  it('junta provas e treinos, ignora traçado inválido e conta quarteirões novos', () => {
    const tr = collectTracks(races, workouts)
    expect(tr.map((t) => t.id)).toEqual(['p', 'w'])
    expect(tr[0].km).toBeGreaterThan(2.4)
    const terr = territory(tr)
    expect(terr.cells).toBe(cellsOf(tr[1].coords).size)
    expect(terr.last.id).toBe('w')
    expect(terr.last.newCells).toBeGreaterThan(4) // só o km a mais
    expect(terr.last.newCells).toBeLessThan(10)
    expect(collectTracks(races, workouts, 2025)).toEqual([])
  })
})

describe('passaporte', () => {
  const today = '2026-11-17'
  const races = [
    { id: 'a', name: 'Corrida do Bem', date: '2026-10-20', status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, startTime: '06:30', targetTime: 2500, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
    { id: 'b', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, startTime: '07:00', result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } }
  ]
  const run = (id, date, extra = {}) => ({ ...normalizeWorkout({ id, name: id, date, items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }] }), id, status: 'feito', ...extra })
  it('conquistas com data, novas nos últimos 14 dias e próximas com quanto falta', () => {
    const p = passport({ races, workouts: [], goals: [], today })
    const byId = Object.fromEntries(p.all.map((a) => [a.id, a]))
    expect(byId['primeira-prova'].date).toBe('2026-10-20')
    expect(byId['primeiros-5k'].date).toBe('2026-10-20')
    expect(byId['primeiros-10k'].date).toBeNull()
    expect(byId['metas-1'].date).toBe('2026-10-20')
    expect(byId['madrugadora'].date).toBe('2026-10-20')
    expect(byId['sub5k-2700'].date).toBe('2026-10-20') // sub 45
    expect(byId['sub5k-2400'].date).toBe('2026-11-15') // sub 40
    expect(byId['sub5k-2400'].title).toBe('Sub 40 nos 5 km')
    expect(p.badges[0].id).toBe('sub5k-2400')
    expect(p.badges[0].isNew).toBe(true)
    expect(p.badges.find((b) => b.id === 'primeira-prova').isNew).toBe(false)
    const sub38 = p.next.find((n) => n.family === 'sub5k')
    expect(sub38.id).toBe('sub5k-2280')
    expect(sub38.progress.text).toBe('melhor: 39:30 · faltam 1:30')
    expect(p.next.find((n) => n.family === 'cidades').progress.text).toBe('2 de 3 cidades')
    expect(p.numbers.cities).toEqual(['Jundiaí/SP', 'Vinhedo/SP'])
    expect(p.numbers.raceKm).toBe(10)
  })
  it('teste de treino com o relógio conta no sub-X; sem tempos, sem conquistas de tempo', () => {
    const ws = [run('t', '2026-11-16', { result: { distanceKm: 5.01, elapsedSec: 2270, laps: [] } })]
    const p = passport({ races, workouts: ws, goals: [], today })
    expect(p.all.find((a) => a.id === 'sub5k-2280').date).toBe('2026-11-16')
    expect(passport({ races, workouts: ws, goals: [], today, times: false }).all.some((a) => a.timed)).toBe(false)
  })
  it('semanas seguidas, treinos e treino cruzado', () => {
    const ws = []
    for (let k = 0; k < 4; k++) {
      const mon = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'][k]
      ws.push(run(`r${k}a`, mon), run(`r${k}b`, mon.slice(0, 8) + String(Number(mon.slice(8)) + 2).padStart(2, '0')))
    }
    for (let i = 0; i < 5; i++) ws.push({ ...normalizeWorkout({ name: 'Acad', sport: 'academia', plannedMin: 40, date: `2026-11-0${i + 2}` }), id: `ac${i}`, status: 'feito' })
    const p = passport({ races: [], workouts: ws, goals: [], today })
    const get = (id) => p.all.find((a) => a.id === id)
    expect(get('semanas-4').date).toBe('2026-11-15')
    expect(get('semanas-8').progress.text).toBe('melhor sequência: 4 semanas')
    expect(get('cruzado-5').date).toBe('2026-11-06')
    expect(get('treinos-10').progress.text).toBe('8 de 10 treinos')
  })
})

describe('provas perto de você', () => {
  const today = '2026-11-17'
  const races = [
    { id: 'n25', name: 'Corrida de Natal 2025', date: '2025-12-13', status: 'concluida', city: 'Jundiaí', state: 'SP' },
    { id: 'sv', name: 'São Silvestre', date: '2025-12-31', status: 'interesse', city: 'São Paulo', state: 'SP' },
    { id: 'sv26', name: 'São Silvestre', date: '2026-12-31', status: 'inscrita', city: 'São Paulo', state: 'SP' },
    { id: 'old', name: 'Antiga', date: '2025-06-01', status: 'concluida', city: 'Campinas', state: 'SP' }
  ]
  it('cidades: perfil primeiro, depois onde mais correu', () => {
    const c = nearCities({ city: 'Vinhedo', state: 'sp' }, races)
    expect(c.map((x) => x.city)).toEqual(['Vinhedo', 'Jundiaí', 'São Paulo', 'Campinas'])
    expect(c[0].state).toBe('SP')
  })
  it('do ano passado nesta época, sem as que já estão no calendário', () => {
    expect(lastYearAgain(races, today).map((r) => r.id)).toEqual(['n25'])
    expect(editionLink(races[0], 2026)).toBe('https://www.google.com/search?q=' + encodeURIComponent('Corrida de Natal 2026 inscrições'))
  })
  it('meses e buscas prontas', () => {
    const m = nextMonths('2026-11-17')
    expect(m.map((x) => x.label)).toEqual(['Novembro 2026', 'Dezembro 2026', 'Janeiro 2027'])
    const l = searchLinks({ city: 'Jundiaí', state: 'SP' }, m[1])
    expect(l[0].url).toContain(encodeURIComponent('corrida de rua Jundiaí SP dezembro 2026 inscrições'))
    expect(decodeURIComponent(l[1].url)).toContain('site:ticketsports.com.br corrida Jundiaí SP 2026')
  })
})

describe('story de conquista', () => {
  const races = [{ id: 'b', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } }]
  const base = { races, workouts: [], goals: [], today: '2026-11-17' }
  it('a mais recente ou a escolhida; de tempo só com tempos', () => {
    const s = storyFor('conquista', { ...base, opts: { times: true, cities: true } })
    expect(s.ok).toBe(true)
    expect(s.name).toBe('Sub 40 nos 5 km')
    expect(s.line).toBe('Health Care Run · Vinhedo/SP')
    const hidden = storyFor('conquista', { ...base, opts: { times: false, cities: false } })
    expect(hidden.name).toBe('Primeiros 5 km') // sem tempos: a mais recente que não é de tempo
    expect(storyFor('conquista', { ...base, opts: { times: false }, badgeId: 'sub5k-2400' }).ok).toBe(false)
    const first = storyFor('conquista', { ...base, opts: { times: false, cities: false }, badgeId: 'primeira-prova' })
    expect(first.name).toBe('Primeira prova')
    expect(first.line).toBe('Health Care Run')
    expect(storyFor('conquista', { ...base, opts: {}, badgeId: 'primeira-maratona' }).ok).toBe(false)
  })
  it('story de atividade cruzada', () => {
    const w = { ...normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 50, date: '2026-11-17' }), id: 'ac', status: 'feito' }
    const s = storyFor('treino', { ...base, workouts: [w], opts: { times: true }, workoutId: 'ac' })
    expect(s.title).toBe('Academia feita ✓')
    expect(s.plan).toBeNull()
    expect(s.icon).toBe('🏋️')
    expect(s.stats).toEqual([{ value: '50', label: 'min' }])
  })
})
