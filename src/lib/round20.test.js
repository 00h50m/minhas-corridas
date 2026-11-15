// Semana de treinos: segunda a domingo, planejado × feito, tempo/km e semanas seguidas cumpridas.
import { describe, expect, it } from 'vitest'
import { weekStart, weekStreak, weekSummary, workoutState } from './trainingWeek.js'
import { normalizeWorkout } from './workout.js'

const W = (id, date, status = 'planejado', min = 30, result = null) => ({ ...normalizeWorkout({ name: id, date, status, items: [{ type: 'corrida', duration: { kind: 'time', value: min * 60 } }], result }), id })

describe('semana de treinos', () => {
  it('a semana começa na segunda', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-09') // domingo → segunda anterior
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // segunda
    expect(weekStart('2026-11-21')).toBe('2026-11-16') // sábado
  })
  it('planejado × feito, tempo do relógio (ou estimado) e km', () => {
    const ws = [
      W('ter', '2026-11-17', 'feito', 28, { elapsedSec: 1800, distanceKm: 4.2, laps: [] }),
      W('qui', '2026-11-19', 'feito', 30),
      W('sab', '2026-11-21', 'planejado', 37),
      W('fora', '2026-11-24', 'planejado', 30)
    ]
    const s = weekSummary(ws, '2026-11-16', '2026-11-20')
    expect(s.days.map((d) => d.workouts.length)).toEqual([0, 1, 0, 1, 0, 1, 0])
    expect(s).toMatchObject({ planned: 3, done: 2, missed: 0, skipped: 0, plannedSec: (28 + 30 + 37) * 60, doneSec: 1800 + 1800, doneKm: 4.2, complete: false })
    expect(workoutState(ws[2], '2026-11-20')).toBe('futuro')
    expect(workoutState(ws[2], '2026-11-21')).toBe('hoje')
    expect(workoutState(ws[2], '2026-11-22')).toBe('passou')
  })
  it('semanas seguidas cumpridas (semana sem treino ou com treino não feito interrompe)', () => {
    const ws = [
      W('a', '2026-11-03', 'feito'), W('b', '2026-11-07', 'feito'), // semana de 02/11 cumprida
      W('c', '2026-11-10', 'feito'), W('d', '2026-11-14', 'feito'), // semana de 09/11 cumprida
      W('e', '2026-11-17', 'feito'), W('f', '2026-11-21', 'planejado') // semana atual em andamento
    ]
    expect(weekStreak(ws, '2026-11-18')).toBe(2)
    expect(weekStreak([...ws.slice(0, 5), { ...ws[5], status: 'feito' }], '2026-11-21')).toBe(3)
    expect(weekStreak([W('x', '2026-11-03', 'feito'), W('y', '2026-11-10', 'pulado')], '2026-11-18')).toBe(0)
    expect(weekStreak([], '2026-11-18')).toBe(0)
  })
})
