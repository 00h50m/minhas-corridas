// Stories da rotina: conteúdo de cada modelo, com tempos e cidades opcionais.
import { describe, expect, it } from 'vitest'
import { storyContagem, storyEvolucao, storyProximas, storySemana, storyTemporada, storyTreino } from './storyData.js'
import { normalizeWorkout } from './workout.js'

const today = '2026-11-18' // quarta
const races = [
  { id: 'hc', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } },
  { id: 'cb', name: 'Corrida do Bem', date: '2026-10-26', status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
  { id: 'na', name: 'Corrida de Natal', date: '2026-12-13', status: 'inscrita', city: 'Jundiaí', state: 'SP', distanceKm: 10, startTime: '07:00', targetTime: 4500 },
  { id: 'sv', name: 'São Silvestre', date: '2026-12-31', status: 'interesse', city: 'São Paulo', state: 'SP', distanceKm: 15 }
]
const W = (id, date, status, result = null) => ({ ...normalizeWorkout({ name: id, date, status, items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }], result }), id })
const workouts = [W('Ter', '2026-11-17', 'feito', { distanceKm: 4.2, elapsedSec: 1860, laps: [] }), W('Sab', '2026-11-21', 'planejado'), W('Teste', '2026-11-12', 'feito', { distanceKm: 5.01, elapsedSec: 2330, laps: [] })]

describe('stories', () => {
  it('próximas provas: inscritas e de interesse, com ou sem cidade', () => {
    const s = storyProximas(races, today, { cities: true })
    expect(s.subtitle).toBe('1 inscritas · 2 no calendário')
    expect(s.items.map((i) => [i.day, i.month, i.name, i.line])).toEqual([['13', 'DEZ', 'Corrida de Natal', '10 km · Jundiaí/SP'], ['31', 'DEZ', 'São Silvestre', '15 km · São Paulo/SP · ainda decidindo']])
    expect(storyProximas(races, today, { cities: false }).items[0].line).toBe('10 km')
  })
  it('temporada: concluídas, próximas, km e melhores tempos só com tempos ligados', () => {
    const s = storyTemporada(races, today, { times: true })
    expect(s.stats.map((x) => x.value)).toEqual(['2', '1', '10'])
    expect(s.bests).toEqual([{ label: '5 km', value: '39:30' }])
    expect(s.next).toMatchObject({ name: 'Corrida de Natal', days: 25 })
    expect(storyTemporada(races, today, { times: false }).bests).toEqual([])
  })
  it('semana, contagem, evolução e treino', () => {
    const w = storySemana(workouts, today, {})
    expect(w.stats.map((x) => x.value)).toEqual(['1/2', '31 min', '4,2'])
    expect(w.days.map((d) => d.state)).toEqual([null, 'feito', null, null, null, 'futuro', null])
    const c = storyContagem(races, today, { times: true, cities: true })
    expect(c).toMatchObject({ big: '25', unit: 'DIAS', lead: 'Faltam', name: 'Corrida de Natal', line: '10 km · Jundiaí/SP', goal: 'Meta: 1:15:00 (7:30 /km)' })
    expect(storyContagem(races, today, { times: false }).goal).toBe(null)
    expect(storyEvolucao(races, workouts, { times: false }).ok).toBe(false)
    const e = storyEvolucao(races, workouts, { times: true })
    expect(e.points.map((p) => p.kind)).toEqual(['prova', 'teste', 'prova'])
    expect(e.best).toBe('38:45') // 5,01 km em 38:50 = 38:45 nos 5,00 km
    const t = storyTreino(workouts, today, { times: true })
    expect(t).toMatchObject({ name: 'Ter', stats: [{ value: '4,20', label: 'km' }, { value: '31:00', label: 'tempo' }, { value: '7:23', label: 'pace /km' }] })
    expect(storyTreino(workouts, today, { times: false }).stats).toEqual([{ value: '4,20', label: 'km' }])
  })
})
