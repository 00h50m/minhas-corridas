// Rodada 40: treinando agora (descanso, séries, carga da última vez, evolução sem relógio), planejar a
// semana (sequência da ficha nos dias, cópia da semana anterior) e o desafio com amigas.
import { describe, expect, it } from 'vitest'
import { exerciseSummary, gymDurationSec, gymSets, lastLoads, normalizeGymLog, restSeconds, toggleEntry, updateEntry } from './gymSession.js'
import { doneSec, normalizeWorkout } from './workout.js'
import { strengthHistory } from './strength.js'
import { buildPlan, copyCandidates, planGym, suggestedWeek } from './weekPlan.js'
import { normalizeProgram, parseFichaText } from './ficha.js'
import { challengeValue, formatValue, monthTitle, periodFor, phase, ranking } from './challenge.js'
import { storyFor } from './storyData.js'

describe('treinando agora', () => {
  it('descanso da ficha em segundos', () => {
    expect(['1 minuto e meio', '1 minuto', '50 seg', '2 min', '1:30', '90', '—', '', '30 segundos', '1,5 min'].map(restSeconds)).toEqual([90, 60, 50, 120, 90, 90, null, null, 30, 90])
  })
  it('marca e desmarca séries; corrige carga; duração; resumo', () => {
    let log = toggleEntry(null, 0, 1, { kg: 40, reps: 8 }, new Date('2026-11-18T20:00:00Z'))
    log = toggleEntry(log, 0, 2, { kg: 45, reps: 10 })
    log = toggleEntry(log, 1, 1, { kg: null, reps: 12 })
    log = toggleEntry(log, 1, 1) // desmarca
    log = updateEntry(log, 0, 2, { kg: 42.5 })
    expect(log.entries).toEqual([{ i: 0, n: 1, kg: 40, reps: 8 }, { i: 0, n: 2, kg: 42.5, reps: 10 }])
    expect(exerciseSummary(log, 0, 3)).toBe('2/3 séries · 40, 42,5 kg · 8/10')
    expect(exerciseSummary(log, 1, 3)).toBeNull()
    const ended = normalizeGymLog({ ...log, endedAt: '2026-11-18T21:02:00Z' })
    expect(gymDurationSec(ended)).toBe(3720)
    expect(normalizeGymLog({ entries: [{ i: 99, n: 1 }, { i: 0, n: 0 }, 'x'] })).toBeNull()
  })
  it('treino de academia: duração anotada conta na semana; cargas viram evolução sem relógio', () => {
    const ex = [{ name: 'Cadeira extensora', sets: 3, repsText: '12', cat: null }]
    const w1 = normalizeWorkout({ id: 'a', name: 'Treino C', sport: 'academia', date: '2026-11-04', status: 'feito', exercises: ex, gymLog: { startedAt: '2026-11-04T20:00:00Z', endedAt: '2026-11-04T20:50:00Z', entries: [{ i: 0, n: 1, kg: 30, reps: 12 }, { i: 0, n: 2, kg: 30, reps: 12 }] } })
    const w2 = normalizeWorkout({ id: 'b', name: 'Treino C', sport: 'academia', date: '2026-11-11', status: 'feito', exercises: ex, gymLog: { startedAt: '2026-11-11T20:00:00Z', endedAt: '2026-11-11T20:45:00Z', entries: [{ i: 0, n: 1, kg: 35, reps: 12 }, { i: 0, n: 2, kg: 35, reps: 10 }] } })
    expect(doneSec(w1)).toBe(3000)
    expect(gymSets(w1)).toEqual([{ name: 'Cadeira extensora', reps: 12, kg: 30 }, { name: 'Cadeira extensora', reps: 12, kg: 30 }])
    const h = strengthHistory([{ ...w1, id: 'a' }, { ...w2, id: 'b' }])
    expect(h[0]).toMatchObject({ name: 'Cadeira extensora', bestKg: 35, firstKg: 30, lastKg: 35 })
    const prev = lastLoads([{ ...w1, id: 'a' }, { ...w2, id: 'b' }], 'novo')
    expect(prev['cadeira extensora']).toEqual({ date: '2026-11-11', 1: { kg: 35, reps: 12 }, 2: { kg: 35, reps: 10 } })
  })
})

const program = normalizeProgram({ id: 'f1', sheets: parseFichaText('TREINO A\nAgachamento | 3 | 12\nTREINO B\nRemada | 3 | 12\nTREINO C\nElevação pélvica | 3 | 12').sheets })
const run = (id, date, extra = {}) => ({ id, name: id, date, status: 'feito', sport: 'corrida', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1800 }, target: { kind: 'none' } }], ...extra })

describe('planejar a semana', () => {
  it('semana sugerida: esta até quarta, a próxima de quinta em diante', () => {
    expect(suggestedWeek('2026-11-18')).toBe('2026-11-16')
    expect(suggestedWeek('2026-11-19')).toBe('2026-11-23')
  })
  it('academia: a sequência da ficha nos dias escolhidos, a partir do próximo; pula dia ocupado', () => {
    const ws = [{ id: 'x', status: 'feito', date: '2026-11-17', sport: 'academia', ficha: { programId: 'f1', sheetId: program.sheets[0].id, label: 'A' } }, { id: 'y', name: 'Pernas', status: 'planejado', date: '2026-11-25', sport: 'academia' }]
    const g = planGym(program, ws, '2026-11-23', [0, 2, 4], '2026-11-19')
    expect(g.map((x) => [x.date, x.sheet?.label ?? x.skip])).toEqual([['2026-11-23', 'B'], ['2026-11-25', 'já tem “Pernas”'], ['2026-11-27', 'C']])
  })
  it('copia a semana anterior 7 dias à frente; não copia a academia da ficha nem o que conflita', () => {
    const ws = [run('Rodagem', '2026-11-17'), run('Longo', '2026-11-21'), run('Tiros', '2026-11-19', { status: 'pulado' }), { id: 'g', name: 'Treino A', sport: 'academia', status: 'feito', date: '2026-11-18', ficha: { programId: 'f1', sheetId: 's', label: 'A' } }, run('Já tem', '2026-11-28', { status: 'planejado' })]
    const c = copyCandidates(ws, '2026-11-23', '2026-11-19')
    expect(c.map((x) => [x.src.id, x.date, x.skip])).toEqual([['Rodagem', '2026-11-24', null], ['Longo', '2026-11-28', 'já tem “Já tem”']])
    const plan = buildPlan({ program, gym: planGym(program, [], '2026-11-23', [0], '2026-11-19'), copies: c, picked: new Set(['Rodagem', 'Longo']) })
    expect(plan.map((w) => [w.date, w.name, w.status, w.id, w.result])).toEqual([['2026-11-23', 'Treino A', 'planejado', null, null], ['2026-11-24', 'Rodagem', 'planejado', null, null]])
  })
})

describe('desafio com amigas', () => {
  it('período do mês e título', () => {
    expect(periodFor('este', '2026-11-19')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(periodFor('proximo', '2026-12-10')).toEqual({ start: '2027-01-01', end: '2027-01-31' })
    expect(monthTitle('km', '2026-12-01')).toBe('Desafio de km de dezembro')
  })
  it('meu total: km (treinos de corrida + provas), treinos (todos + provas), horas', () => {
    const data = {
      workouts: [run('a', '2026-11-03', { result: { distanceKm: 5, elapsedSec: 1800 } }), run('b', '2026-11-20', { result: { distanceKm: 8, elapsedSec: 2700 } }), { id: 'g', sport: 'academia', status: 'feito', date: '2026-11-10', plannedMin: 60, items: [] }, run('c', '2026-10-30', { result: { distanceKm: 9, elapsedSec: 3000 } })],
      races: [{ id: 'r', status: 'concluida', date: '2026-11-15', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5 } }]
    }
    expect(challengeValue('km', '2026-11-01', '2026-11-30', data, '2026-11-19')).toBe(10) // 5 + 5 (o de 20/11 é depois de hoje)
    expect(challengeValue('treinos', '2026-11-01', '2026-11-30', data, '2026-11-30')).toBe(4)
    expect(challengeValue('horas', '2026-11-01', '2026-11-30', data, '2026-11-19')).toBe(2.2) // 30 min + 60 min + 39:30
    expect([formatValue('km', 10.5), formatValue('treinos', 1), formatValue('horas', 1.2)]).toEqual(['10,5 km', '1 treino', '1,2 h'])
  })
  it('ranking com empate e barra relativa ao 1º; fase do período', () => {
    const r = ranking([{ name: 'A', value: '30', is_me: true }, { name: 'B', value: 42.5 }, { name: 'C', value: 30 }])
    expect(r.map((x) => [x.name, x.pos, Math.round(x.pct * 100)])).toEqual([['B', 1, 100], ['A', 2, 71], ['C', 2, 71]])
    expect(phase({ start_date: '2026-12-01', end_date: '2026-12-31' }, '2026-11-29')).toEqual({ state: 'antes', days: 2 })
    expect(phase({ start_date: '2026-11-01', end_date: '2026-11-30' }, '2026-11-19').state).toBe('andamento')
  })
  it('story do desafio: título, métrica, período e as posições', () => {
    const ch = { id: 'x', title: 'Km de dezembro', metric: 'km', start: '2026-12-01', end: '2026-12-31', board: [{ name: 'Ana', value: 42.5, pos: 1 }, { name: 'Gi', value: 30, pos: 2, me: true }] }
    const s = storyFor('desafio', { races: [], workouts: [], today: '2026-12-10', opts: {}, challenge: ch })
    expect(s).toMatchObject({ ok: true, title: 'Km de dezembro', subtitle: 'km correndo · 01/12 a 31/12', more: 0 })
    expect(s.rows.map((r) => [r.pos, r.name, r.value, r.me])).toEqual([[1, 'Ana', '42,5 km', false], [2, 'Gi', '30 km', true]])
    expect(storyFor('desafio', { races: [], workouts: [], today: '2026-12-10', opts: {} }).ok).toBe(false)
  })
})
