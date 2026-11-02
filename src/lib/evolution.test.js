import { describe, it, expect } from 'vitest'
import { compareYears, monthly, paceSeries } from './evolution.js'
import { emptyRace, emptyResult } from './model.js'

const race = (o) => ({ ...emptyRace(), id: Math.random().toString(36).slice(2), name: 'P', ...o })
const done = (date, km, t, o = {}) => race({ status: 'concluida', date, distanceKm: km, result: { ...emptyResult(), officialDistanceKm: km, netTime: t, ...o.res }, ...o.race })

describe('evolução', () => {
  const list = [
    done('2025-03-01', 5, 1900, { race: { feePaid: 100 } }),
    done('2025-12-20', 10, 4000), // depois de hoje no ano anterior: fora da comparação justa
    done('2026-02-01', 5, 1850, { race: { feePaid: 120 } }),
    done('2026-05-01', 5, 1800),
    done('2026-06-01', 5, 1700, { res: { isOfficial: false } }),
    race({ status: 'inscrita', date: '2026-12-10' })
  ]
  it('compara este ano com o anterior até a mesma data', () => {
    const c = compareYears(list, '2026-11-02')
    expect(c.cur).toMatchObject({ count: 3, km: 15, spent: 120 })
    expect(c.prevSame).toMatchObject({ count: 1, km: 5, spent: 100 })
    expect(c.prevFull.count).toBe(2)
    expect(c.cur.bests['5.0']).toBe(1800) // registro pessoal não entra
    expect(c.prevFull.bests['5.0']).toBe(1900)
    expect(c.keys).toEqual(['5.0', '10.0'])
  })
  it('provas por mês: concluídas e inscritas', () => {
    const m = monthly(list, 2026)
    expect(m[1]).toMatchObject({ done: 1, planned: 0 })
    expect(m[11]).toMatchObject({ done: 0, planned: 1 })
  })
  it('pace só para distâncias com 2+ resultados', () => {
    const s = paceSeries(list)
    expect(s.map((x) => x.key)).toEqual(['5.0'])
    expect(s[0].points.map((p) => Math.round(p.pace))).toEqual([380, 370, 360, 340])
  })
})
