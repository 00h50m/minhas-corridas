import { describe, it, expect } from 'vitest'
import { analyzeRace, goalPlan, pacingFrom, paceTable } from './analysis.js'
import { emptyRace, emptyResult, emptyGoal } from './model.js'

const race = (o) => ({ ...emptyRace(), id: Math.random().toString(36).slice(2), name: 'Prova', status: 'concluida', ...o })
const res = (km, t, o = {}) => ({ ...emptyResult(), officialDistanceKm: km, netTime: t, ...o })
const splits = (secs) => secs.map((sec, i) => ({ km: i + 1, sec }))

describe('ritmo pelas parciais', () => {
  it('identifica saída forte e quebra', () => {
    const p = pacingFrom(splits([330, 350, 360, 380, 395]))
    expect(p.type).toBe('positivo')
    expect(p.fastStart).toBe(true)
    expect(p.slowest.km).toBe(5)
  })
  it('split negativo e ritmo uniforme', () => {
    expect(pacingFrom(splits([370, 365, 360, 350, 340])).type).toBe('negativo')
    expect(pacingFrom(splits([360, 362, 359, 361, 360])).type).toBe('uniforme')
    expect(pacingFrom(splits([360, 360]))).toBe(null)
  })
})

describe('análise da prova', () => {
  const old = race({ name: 'Antiga', date: '2026-03-01', result: res(5, 1900) })
  it('compara meta, ritmo, esforço, relógio e provas anteriores', () => {
    const r = race({ name: 'Nova', date: '2026-06-01', targetTime: 1800, result: res(5, 1815, { effort: 9, watchDistanceKm: 5.12, watch: { splits: splits([330, 350, 365, 380, 390]) } }) })
    const goal = { ...emptyGoal('tempo'), id: 'g', title: 'Sub 30', distanceKm: 5, targetValue: 1800 }
    const a = analyzeRace(r, [old, r], [goal])
    const titles = a.items.map((i) => i.title)
    expect(a.verdict).toBe('perto')
    expect(titles[0]).toBe('Faltaram 0:15 para a meta')
    expect(a.items[0].text).toContain('+0:03/km')
    expect(titles).toContain('Objetivo “Sub 30”')
    expect(titles).toContain('Segunda metade mais lenta')
    expect(a.items.find((i) => i.title === 'Segunda metade mais lenta').text).toContain('saída forte')
    expect(titles).toContain('Esforço 9/10')
    expect(titles).toContain('120 m a mais no relógio')
    const cmp = a.items.find((i) => i.title === 'Em relação às suas provas')
    expect(cmp.text).toContain('1:25 mais rápida que Antiga')
    expect(cmp.text).toContain('Novo recorde pessoal')
  })
  it('meta batida e primeira prova da distância', () => {
    const r = race({ date: '2026-06-01', targetTime: 3600, result: res(10, 3550) })
    const a = analyzeRace(r, [r])
    expect(a.verdict).toBe('meta-batida')
    expect(a.items[0].title).toBe('Meta batida por 0:50')
    expect(a.items.map((i) => i.title)).toContain('Primeira prova de 10 km registrada')
    expect(a.items.map((i) => i.title)).toContain('Sem parciais por km')
  })
})

describe('plano', () => {
  it('passagens a cada km (5 km) e a cada 5 km com metade (maratona)', () => {
    expect(paceTable(1800, 5).map((r) => r.at)).toEqual([360, 720, 1080, 1440, 1800])
    const m = paceTable(4 * 3600, 42.195)
    expect(m.find((r) => r.half).km).toBeCloseTo(21.0975)
    expect(m.at(-1)).toMatchObject({ km: 42.195, at: 14400 })
  })
  it('objetivo: diferença, degrau intermediário, tendência e provas candidatas', () => {
    const list = [
      race({ date: '2026-01-10', result: res(5, 2000) }),
      race({ date: '2026-04-10', result: res(5, 1960) }),
      race({ date: '2026-07-10', result: res(5, 1920) }),
      race({ date: '2026-08-10', result: res(5, 1850, { isOfficial: false }) }),
      race({ name: 'Próxima 5K', status: 'inscrita', date: '2026-12-01', distanceKm: 5 }),
      race({ name: 'Depois do prazo', status: 'interesse', date: '2027-06-01', distanceKm: 5 }),
      race({ name: 'Outra distância', status: 'inscrita', date: '2026-12-05', distanceKm: 10 })
    ]
    const g = { ...emptyGoal('tempo'), title: 'Sub 30', distanceKm: 5, targetValue: 1800, deadline: '2026-12-31' }
    const p = goalPlan(g, list, '2026-11-02')
    expect(p.best.result.netTime).toBe(1920) // registro pessoal não conta
    expect(p.gap).toBe(120)
    expect(p.perKm).toBe(24)
    expect(p.milestone.time).toBe(1860)
    expect(p.trend).toMatchObject({ perRace: -40, improving: true })
    expect(p.candidates.map((r) => r.name)).toEqual(['Próxima 5K'])
    expect(p.table.at(-1).at).toBe(1799)
  })
})
