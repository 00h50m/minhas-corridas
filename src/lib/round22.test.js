// Objetivo ligado ao plano de treino: progresso do plano e teste do plano como marca.
import { describe, expect, it } from 'vitest'
import { planProgress } from './goalPlan.js'
import { goalProgress, workoutTests } from './goals.js'
import { normalizeWorkout } from './workout.js'

const W = (id, date, status = 'planejado', goalId = 'g1', result = null, items = [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }]) => ({ ...normalizeWorkout({ name: id, date, status, goalId, items, result }), id })
const goal = { id: 'g1', type: 'tempo', title: '5 km abaixo de 38:30', distanceKm: 5, targetValue: 38 * 60 + 30, deadline: '2026-12-12', startDate: null, status: 'andamento' }
const plan = [
  W('S1 A', '2026-11-17', 'feito'), W('S1 B', '2026-11-21', 'feito'),
  W('S2 A', '2026-11-24', 'pulado'), W('S2 B', '2026-11-28'),
  W('S3 A', '2026-12-01'), W('S3 B', '2026-12-05'),
  W('S4 A', '2026-12-08'), W('S4 B Teste 5 km', '2026-12-12', 'planejado', 'g1', null, [{ type: 'corrida', duration: { kind: 'distance', value: 5000 } }]),
  W('Outro', '2026-11-19', 'feito', null)
]

describe('plano do objetivo', () => {
  it('feitos, pulados, semana atual e próximo treino (só os ligados)', () => {
    const p = planProgress(goal, plan, '2026-11-26')
    expect(p).toMatchObject({ total: 8, done: 2, skipped: 1, missed: 0, weeks: 4, week: 2 })
    expect(p.next.name).toBe('S2 B')
    expect(planProgress(goal, plan, '2026-11-10').week).toBe(0) // antes de começar
    expect(planProgress(goal, plan, '2026-12-20').week).toBe(5) // depois do fim (> semanas)
    expect(planProgress({ ...goal, id: 'x' }, plan, '2026-11-26')).toBe(null)
  })
  it('o teste do plano (arquivo do relógio de 5 km) vira a marca do objetivo', () => {
    expect(goalProgress(goal, [], '2026-12-01', plan)).toMatchObject({ achieved: false, label: 'Sem resultado oficial' })
    const done = plan.map((w) => (w.name.includes('Teste') ? { ...w, status: 'feito', result: { distanceKm: 5.02, elapsedSec: 2320, laps: [] } } : w))
    const p = goalProgress(goal, [], '2026-12-12', done)
    expect(p).toMatchObject({ achieved: false, label: 'Melhor: 38:40 (teste em treino)' })
    expect(p.detail).toBe('Faltam 0:10 para ficar abaixo de 38:30 (teste “S4 B Teste 5 km”).')
    const fast = done.map((w) => (w.name.includes('Teste') ? { ...w, result: { ...w.result, elapsedSec: 2280 } } : w))
    expect(goalProgress(goal, [], '2026-12-12', fast)).toMatchObject({ achieved: true, pct: 1 })
    // Treino curto (3 km) ou de outro objetivo não conta
    expect(workoutTests(goal, done.map((w) => ({ ...w, result: w.result && { ...w.result, distanceKm: 3 } })))).toEqual([])
    expect(workoutTests({ ...goal, id: 'x' }, done)).toEqual([])
  })
  it('prova oficial melhor que o teste continua valendo', () => {
    const done = plan.map((w) => (w.name.includes('Teste') ? { ...w, status: 'feito', result: { distanceKm: 5, elapsedSec: 2350, laps: [] } } : w))
    const race = { id: 'r', name: 'Prova', date: '2026-11-30', status: 'concluida', result: { netTime: 2290, officialDistanceKm: 5, isOfficial: true } }
    expect(goalProgress(goal, [race], '2026-12-12', done)).toMatchObject({ achieved: true, label: 'Melhor: 38:10' })
  })
})
