// Rodada 36: evolução na academia por exercício e calendário mensal de treinos.
import { describe, expect, it } from 'vitest'
import { strengthHistory, strengthRecency, strengthRecords, kgLabel } from './strength.js'
import { byDay, canDrag, cellLabel, dayStats, monthGrid, monthSummary, shiftMonth } from './monthCal.js'

const SQUAT = 28
const LUNGE = 17
const PLANK = 19
const gym = (id, date, sets, extra = {}) => ({ id, name: 'Força', sport: 'academia', date, status: 'feito', items: [], plannedMin: 60, result: { elapsedSec: 3600, distanceKm: 0, sets, ...extra } })
const s = (cat, reps, kg) => ({ cat, reps, kg, sec: 60 })

const ws = [
  gym('a', '2026-10-20', [s(SQUAT, 12, 40), s(SQUAT, 10, 40), s(LUNGE, 12, 16)]),
  gym('b', '2026-11-03', [s(SQUAT, 12, 42.5), s(SQUAT, 10, 45), s(PLANK, null, null)]),
  gym('c', '2026-11-17', [s(SQUAT, 12, 40), s(SQUAT, 10, 45), s(SQUAT, 8, 50), s(LUNGE, 12, 20), s(PLANK, null, null)]),
  { id: 'r', name: 'Rodagem', date: '2026-11-16', status: 'feito', items: [], result: { distanceKm: 5, elapsedSec: 1800, avgHr: 150, calories: 310 } },
  { id: 'p', name: 'Tiros', date: '2026-11-20', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 2400 }, target: { kind: 'none' } }], result: null },
  { id: 'x', name: 'Longo', date: '2026-11-15', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 3600 }, target: { kind: 'none' } }], result: null }
]

describe('evolução na academia', () => {
  it('histórico por exercício, carga máxima por treino e recorde', () => {
    const h = strengthHistory(ws)
    expect(h.map((x) => x.name)).toEqual(['Agachamento', 'Afundo', 'Prancha'])
    const sq = h.find((x) => x.name === 'Agachamento')
    expect(sq.sessions.map((x) => x.maxKg)).toEqual([40, 45, 50])
    expect(sq.sessions.map((x) => x.sets)).toEqual([2, 2, 3])
    expect(sq.sessions[2].reps).toBe(30)
    expect(sq.sessions[2].volume).toBe(12 * 40 + 10 * 45 + 8 * 50)
    expect(sq).toMatchObject({ bestKg: 50, bestKgDate: '2026-11-17', firstKg: 40, lastKg: 50, last: '2026-11-17' })
    const pl = h.find((x) => x.name === 'Prancha')
    expect(pl.bestKg).toBeNull()
    expect(pl.sessions).toHaveLength(2)
  })
  it('ignora treinos sem séries, não feitos e grupos sem nome', () => {
    expect(strengthHistory([{ ...ws[0], status: 'planejado' }, ws[3], gym('z', '2026-11-01', [s(null, 10, 10)])])).toEqual([])
  })
  it('recorde de carga no treino: só quando supera todos os anteriores', () => {
    expect([...strengthRecords(ws[2], ws)].sort()).toEqual(['Afundo', 'Agachamento'])
    expect([...strengthRecords(ws[1], ws)]).toEqual(['Agachamento'])
    expect(strengthRecords(ws[0], ws).size).toBe(0) // primeiro treino não é recorde
    expect(strengthRecords(ws[3], ws).size).toBe(0)
  })
  it('último treino de força e quantos nas últimas 4 semanas', () => {
    expect(strengthRecency(ws, '2026-11-18')).toEqual({ last: '2026-11-17', days: 1, in4w: 2 })
    expect(strengthRecency([ws[3]], '2026-11-18')).toBeNull()
    expect(kgLabel(42.5)).toBe('42,5 kg')
  })
})

describe('calendário mensal de treinos', () => {
  it('grade de segunda a domingo só com as semanas do mês', () => {
    const g = monthGrid('2026-11')
    expect(g[0]).toBe('2026-10-26') // segunda
    expect(g.at(-1)).toBe('2026-12-06') // domingo
    expect(g.length % 7).toBe(0)
    expect(g).toHaveLength(42)
    expect(monthGrid('2026-02')).toHaveLength(35)
  })
  it('troca de mês na virada do ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it('itens do dia e provas inscritas/concluídas', () => {
    const m = byDay(ws, [{ id: 'race', name: 'Prova', date: '2026-11-22', status: 'inscrita' }, { id: 'q', name: 'Talvez', date: '2026-11-22', status: 'interesse' }])
    expect(m.get('2026-11-17').workouts.map((w) => w.id)).toEqual(['c'])
    expect(m.get('2026-11-22').races.map((r) => r.id)).toEqual(['race'])
  })
  it('rótulo da célula: km do relógio, senão o tempo', () => {
    expect(cellLabel(ws[3])).toBe('5,0km')
    expect(cellLabel(ws[2])).toBe('1h00')
    expect(cellLabel(ws[4])).toBe('40min')
  })
  it('resumo do dia: força com séries e exercícios; corrida com km, FC e kcal; planejado com a estimativa', () => {
    expect(dayStats(ws[2])).toEqual([{ v: '1:00:00', l: 'duração' }, { v: '5', l: 'séries · 3 exerc.' }])
    expect(dayStats(ws[3]).map((x) => x.v)).toEqual(['5,00 km', '30:00', '150', '310'])
    expect(dayStats(ws[4])[0].l).toBe('planejado')
  })
  it('resumo do mês e quem pode ser arrastado', () => {
    expect(monthSummary(ws, '2026-11', '2026-11-18')).toEqual({ total: 5, done: 3, missed: 1, sec: 3600 * 2 + 1800, km: 5, activeDays: 3 })
    expect(canDrag(ws[4])).toBe(true)
    expect(canDrag(ws[2])).toBe(false)
  })
})
