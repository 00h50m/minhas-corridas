// Atividade do relógio → treino planejado; carga da semana.
import { describe, expect, it } from 'vitest'
import { alreadyImported, freeWorkout, matchActivity } from './activityMatch.js'
import { weekLoad } from './trainingWeek.js'
import { normalizeWorkout } from './workout.js'

const W = (id, date, status = 'planejado', min = 30, result = null) => ({ ...normalizeWorkout({ name: id, date, status, items: [{ type: 'corrida', duration: { kind: 'time', value: min * 60 } }], result }), id })

describe('atividade do relógio → treino', () => {
  const ws = [W('Ter', '2026-11-17'), W('Sab', '2026-11-21'), W('Feito', '2026-11-18', 'feito', 30, { fileName: 'a.fit', elapsedSec: 1800, distanceKm: 4 })]
  it('um treino no mesmo dia: automático; outro dia: candidatos mais perto primeiro', () => {
    expect(matchActivity(ws, '2026-11-17').auto.id).toBe('Ter')
    const m = matchActivity(ws, '2026-11-19')
    expect(m.auto).toBe(null)
    expect(m.candidates.map((w) => w.id)).toEqual(['Ter', 'Sab'])
    expect(matchActivity(ws, '2026-12-10').candidates).toEqual([])
    // treino já feito não é candidato
    expect(matchActivity(ws, '2026-11-18').candidates.map((w) => w.id)).toEqual(['Ter', 'Sab'])
  })
  it('mesmo arquivo já importado; treino avulso', () => {
    const a = { fileName: 'a.fit', startTime: '2026-11-18T09:00:00-03:00', elapsedSec: 1802, distanceKm: 4 }
    expect(alreadyImported(ws, a)?.id).toBe('Feito')
    const f = freeWorkout({ fileName: 'b.fit', startTime: '2026-11-19T07:00:00-03:00', elapsedSec: 1500, distanceKm: 3.4, avgHr: 150, laps: [] })
    expect(f).toMatchObject({ name: 'Corrida 19/11', date: '2026-11-19', status: 'feito', result: { distanceKm: 3.4, elapsedSec: 1500 } })
    expect(f.items[0].duration.value).toBe(1500)
  })
})

describe('carga da semana', () => {
  it('compara com a semana passada e avisa acima de 10% (com ao menos 5 min a mais)', () => {
    const ws = [
      W('a', '2026-11-10', 'feito', 28), W('b', '2026-11-14', 'feito', 30), // semana de 09/11: 58 min
      W('c', '2026-11-17', 'feito', 30), W('d', '2026-11-21', 'planejado', 37) // semana de 16/11: 67 min
    ]
    const l = weekLoad(ws, '2026-11-16', '2026-11-18')
    expect(l).toMatchObject({ thisSec: 67 * 60, lastSec: 58 * 60, pct: 16, warn: true })
    const ok = weekLoad([...ws.slice(0, 3), W('d', '2026-11-21', 'planejado', 32)], '2026-11-16', '2026-11-18')
    expect(ok).toMatchObject({ pct: 7, warn: false })
    expect(weekLoad(ws.slice(2), '2026-11-16', '2026-11-18')).toMatchObject({ lastSec: 0, pct: null, warn: false })
  })
})
