// Próximo bloco a partir da marca nos 5 km.
import { describe, expect, it } from 'vitest'
import { buildNextBlock, nextStart, nextTarget, paceZones, usualDays } from './nextBlock.js'

describe('próximo bloco', () => {
  it('faixas de pace e nova meta a partir de 38:40 nos 5 km', () => {
    const z = paceZones(2320) // 7:44/km
    expect(z.race).toBe(464)
    expect(z.leve).toEqual({ min: 520, max: 560 }) // 8:40–9:20
    expect(z.forte).toEqual({ min: 435, max: 465 }) // 7:15–7:45
    expect(z.ritmo).toEqual({ min: 470, max: 490 }) // 7:50–8:10
    expect(nextTarget(2320)).toBe(2250) // 37:30 (−70 s, ~3%)
    expect(nextTarget(900)).toBe(870) // 3% seriam 27 s: vale o mínimo de 30 s
    expect(nextTarget(1200)).toBe(1160) // 3% = 36 s
  })
  it('mesmos dias do bloco anterior; começa na segunda depois do último treino', () => {
    expect(usualDays([{ date: '2026-11-17' }, { date: '2026-11-21' }, { date: '2026-11-24' }, { date: '2026-11-28' }])).toEqual([1, 5]) // ter e sáb
    expect(usualDays([])).toEqual([1, 5])
    expect(nextStart('2026-12-12', '2026-12-13')).toBe('2026-12-14')
    expect(nextStart('2026-12-12', '2026-12-20')).toBe('2026-12-21')
  })
  it('8 treinos, progressão 25 → 30 → 35 → 25 (alívio) e teste no fim', () => {
    const b = buildNextBlock({ time5k: 2320, startMonday: '2026-12-14', days: [1, 5] })
    expect(b.workouts.map((w) => [w.date, w.name])).toEqual([
      ['2026-12-15', 'B2 S1 A Continua 25'], ['2026-12-19', 'B2 S1 B Tiros 6x2'],
      ['2026-12-22', 'B2 S2 A Continua 30'], ['2026-12-26', 'B2 S2 B Ritmo 4x3'],
      ['2026-12-29', 'B2 S3 A Continua 35'], ['2027-01-02', 'B2 S3 B Ritmo 3x5'],
      ['2027-01-05', 'B2 S4 A Continua 25'], ['2027-01-09', 'B2 S4 B Teste 5 km']
    ])
    expect(b.target).toBe(2250)
    expect(b.end).toBe('2027-01-09')
    const test = b.workouts[7].items[1]
    expect(test.duration).toEqual({ kind: 'distance', value: 5000 })
    expect(test.target).toEqual({ kind: 'pace', min: 445, max: 465 }) // meta 7:30/km → 7:25–7:45
    expect(b.workouts[0].items[1].target).toEqual({ kind: 'pace', min: 520, max: 560 })
  })
})

describe('evolução do pace com testes de treino', async () => {
  const { paceSeriesWithTests } = await import('./evolution.js')
  const race = { id: 'hc', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } }
  const test = { id: 't', name: 'S4 B Teste 5 km', date: '2026-12-12', status: 'feito', result: { distanceKm: 5.02, elapsedSec: 2320 } }
  it('1 prova + 1 teste de 5 km formam a série; treino curto ou não feito fica de fora', () => {
    const s = paceSeriesWithTests([race], [test, { ...test, id: 'x', result: { distanceKm: 3, elapsedSec: 1400 } }, { ...test, id: 'y', status: 'planejado' }])
    expect(s).toHaveLength(1)
    expect(s[0].km).toBe(5)
    expect(s[0].points.map((p) => [p.kind, Math.round(p.pace)])).toEqual([['prova', 474], ['teste', 462]])
    expect(paceSeriesWithTests([race], [])).toEqual([])
  })
})
