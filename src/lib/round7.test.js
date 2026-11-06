import { describe, it, expect } from 'vitest'
import { compareToTarget, cumulativeFn } from './targetCompare.js'
import { emptyRace, emptyResult } from './model.js'

const race = (target, km, net, splits) => ({
  ...emptyRace(),
  id: 'r',
  name: 'Prova',
  status: 'concluida',
  targetTime: target,
  result: { ...emptyResult(), officialDistanceKm: km, netTime: net, watch: splits ? { distanceKm: km, elapsedSec: net, splits } : null }
})

describe('meta x realizado', () => {
  it('acumulado pelas parciais, com interpolação e trecho final parcial', () => {
    const f = cumulativeFn([{ km: 1, sec: 300 }, { km: 2, sec: 310 }, { km: 2.5, sec: 160, partial: 500 }])
    expect(f.km).toBe(2.5)
    expect(f.sec).toBe(770)
    expect(f.at(1)).toBe(300)
    expect(f.at(1.5)).toBe(455)
    expect(f.at(2.25)).toBe(690)
    expect(f.at(3)).toBe(null)
    expect(cumulativeFn([{ km: 1, sec: 300 }])).toBe(null)
  })
  it('sem meta ou sem resultado: nada a comparar', () => {
    expect(compareToTarget(race(null, 10, 3000))).toBe(null)
    expect(compareToTarget({ ...race(3000, 10, 3000), result: null })).toBe(null)
  })
  it('só a chegada quando não há parciais', () => {
    const c = compareToTarget(race(3000, 10, 3060))
    expect(c).toMatchObject({ diff: 60, status: 'perto', hasSplits: false, halves: null })
    expect(c.paceDiff).toBe(6)
    const end = c.checkpoints.at(-1)
    expect(end).toMatchObject({ km: 10, planned: 3000, actual: 3060, diff: 60, end: true })
    expect(c.checkpoints.find((x) => x.half)).toMatchObject({ km: 5, actual: null })
    expect(compareToTarget(race(3000, 10, 2990)).status).toBe('batida')
    expect(compareToTarget(race(3000, 10, 3200)).status).toBe('acima')
  })
  it('passagens, metade e onde ganhou/perdeu, com parciais ajustadas à distância e tempo oficiais', () => {
    // 10 km oficiais; relógio marcou 10,2 km. Saída forte e quebra no fim.
    const secs = [290, 292, 295, 298, 300, 305, 310, 318, 325, 330]
    const splits = [...secs.map((sec, i) => ({ km: i + 1, sec })), { km: 10.2, sec: 66, partial: 200 }]
    const watchTotal = secs.reduce((a, b) => a + b, 0) + 66 // 3129
    const c = compareToTarget(race(3000, 10, 3110, splits))
    expect(c.hasSplits).toBe(true)
    expect(c.checkpoints.map((x) => x.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const half = c.checkpoints.find((x) => x.half)
    expect(half.km).toBe(5)
    // km 5 oficial = 5,1 km do relógio; tempo escalado por 3110/3129
    const at51 = 290 + 292 + 295 + 298 + 300 + 0.1 * 305
    expect(half.actual).toBe(Math.round(at51 * (3110 / watchTotal)))
    expect(c.halves.first).toBe(half.actual)
    expect(c.halves.second).toBe(3110 - half.actual)
    expect(c.halves.firstDiff).toBeLessThan(0) // à frente do plano na 1ª metade
    expect(c.halves.secondDiff).toBeGreaterThan(0)
    expect(c.best.to).toBe(1) // saída mais rápida que o plano
    expect(c.worst.from).toBeGreaterThanOrEqual(8) // perdeu mais no fim
    expect(c.checkpoints.at(-1)).toMatchObject({ actual: 3110, diff: 110 })
  })
  it('meia maratona: passagens a cada 2,5 km e metade em 10,55', () => {
    const c = compareToTarget(race(6600, 21.1, 6500))
    expect(c.checkpoints.map((x) => x.km)).toEqual([2.5, 5, 7.5, 10, 10.55, 12.5, 15, 17.5, 20, 21.1])
    expect(c.checkpoints.find((x) => x.half).km).toBe(10.55)
  })
})
