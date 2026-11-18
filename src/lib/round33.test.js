// Rodada 33: ciclo menstrual (previsão pelo histórico, prova, reta final, sinais, Garmin) e o
// registro sincronizado (kv) que nunca leva a chave do Garmin.
import { describe, expect, it, beforeEach } from 'vitest'
import { cycleSignals, cycleStats, dayOfCycle, endPeriod, isPeriodDay, isPredictedDay, logDay, mergeStarts, normalizeCycle, ongoing, phaseLabel, predictNext, raceCycleNote, startPeriod, cycleStretchItems } from './cycle.js'
import { finalStretch } from './finalStretch.js'
import { cycleFromResponse } from '../../api/garmin.js'

// Ciclos regulares de 28 dias, 5 dias de sangramento; último início 05/11/2026.
const periods = ['2026-07-16', '2026-08-13', '2026-09-10', '2026-10-08', '2026-11-05'].map((s) => ({ start: s, end: null }))
const withEnd = periods.map((p) => ({ ...p, end: new Date(Date.parse(p.start) + 4 * 864e5).toISOString().slice(0, 10) }))
const base = normalizeCycle({ enabled: true, periods: withEnd })

describe('previsão pelo histórico', () => {
  it('estatísticas e próxima menstruação', () => {
    expect(cycleStats(base.periods)).toEqual({ count: 4, avg: 28, min: 28, max: 28, bleed: 5, regular: true })
    expect(predictNext(base, '2026-11-18')).toMatchObject({ start: '2026-12-03', from: '2026-12-02', to: '2026-12-04', confidence: 'boa', len: 28 })
    expect(dayOfCycle(base, '2026-11-18')).toBe(14)
    expect(isPeriodDay(base, '2026-11-07', '2026-11-18')).toBe(true)
    expect(isPeriodDay(base, '2026-11-10', '2026-11-18')).toBe(false)
    expect(isPredictedDay(base, '2026-12-05', '2026-11-18')).toBe(true)
    expect(phaseLabel(base, '2026-11-29', '2026-11-18')).toBe('dias antes da menstruação')
    expect(phaseLabel(base, '2026-11-10', '2026-11-18')).toBe('primeira metade do ciclo')
  })
  it('com 1 só registro: aprendendo (28 dias); irregular: faixa larga', () => {
    const one = normalizeCycle({ enabled: true, periods: [{ start: '2026-11-05' }] })
    expect(predictNext(one, '2026-11-18')).toMatchObject({ start: '2026-12-03', confidence: 'aprendendo', from: '2026-11-30' })
    const irr = normalizeCycle({ enabled: true, periods: ['2026-07-01', '2026-07-25', '2026-08-30', '2026-09-24', '2026-11-01'].map((s) => ({ start: s })) })
    const n = predictNext(irr, '2026-11-18')
    expect(n.confidence).toBe('irregular')
    expect(n.to > n.from).toBe(true)
  })
  it('registrar início, fim e o dia; sem duplicar', () => {
    let c = startPeriod(normalizeCycle({ enabled: true, periods: withEnd.slice(0, 4) }), '2026-11-05')
    expect(ongoing(c, '2026-11-07').start).toBe('2026-11-05')
    expect(startPeriod(c, '2026-11-07').periods.length).toBe(5)
    c = endPeriod(c, '2026-11-09')
    expect(c.periods.at(-1).end).toBe('2026-11-09')
    c = logDay(c, '2026-11-06', { flow: 3, symptoms: ['colica', 'xyz'], energy: 2 })
    expect(c.days['2026-11-06']).toEqual({ flow: 3, symptoms: ['colica'], energy: 2 })
  })
})

describe('a prova no ciclo', () => {
  const natal = { id: 'na', name: 'Natal', date: '2026-12-12', status: 'inscrita' }
  it('prova no meio do ciclo: nada', () => {
    expect(raceCycleNote(base, natal, '2026-11-18')).toBeNull()
  })
  it('prova no dia 2 da menstruação, com fluxo intenso no histórico', () => {
    let c = base
    for (const p of base.periods.slice(-3)) c = logDay(c, new Date(Date.parse(p.start) + 864e5).toISOString().slice(0, 10), { flow: 3 })
    const race = { ...natal, date: '2026-12-04' }
    const note = raceCycleNote(c, race, '2026-11-18')
    expect(note).toMatchObject({ kind: 'menstruacao', day: 2, heavy: true })
    expect(note.text).toBe('Pela sua previsão, a prova cai no dia 2 da menstruação — pelo seu histórico, um dia de fluxo intenso.')
    const items = cycleStretchItems(race, note)
    expect(items.map((i) => [i.id, i.date])).toEqual([['ciclo-teste', '2026-11-20'], ['ciclo-banheiro', '2026-11-29'], ['ciclo-separar', '2026-12-03'], ['ciclo-conversa', '2026-11-13']])
    const st = finalStretch({ ...race, distanceKm: 10 }, { today: '2026-11-18', cycle: c })
    expect(st.filter((i) => i.id.startsWith('ciclo')).length).toBe(4)
    expect(finalStretch({ ...race, distanceKm: 10 }, { today: '2026-11-18' }).some((i) => i.id.startsWith('ciclo'))).toBe(false)
  })
  it('prova 2 dias antes do início previsto; ciclo desligado não diz nada', () => {
    expect(raceCycleNote(base, { ...natal, date: '2026-12-01' }, '2026-11-18')).toMatchObject({ kind: 'antes' })
    expect(raceCycleNote({ ...base, enabled: false }, { ...natal, date: '2026-12-04' }, '2026-11-18')).toBeNull()
  })
})

describe('sinais e Garmin', () => {
  it('3 meses sem menstruação; ciclos longos; fluxo intenso com cansaço; dispensar', () => {
    const c = normalizeCycle({ enabled: true, periods: [{ start: '2026-08-01' }] })
    expect(cycleSignals(c, '2026-11-18').map((s) => s.id)).toEqual(['amenorreia'])
    expect(cycleSignals({ ...c, dismissed: ['amenorreia'] }, '2026-11-18')).toEqual([])
    const long = normalizeCycle({ enabled: true, periods: ['2026-03-01', '2026-04-10', '2026-05-20', '2026-06-30', '2026-08-09', '2026-09-18', '2026-10-28'].map((s) => ({ start: s })) })
    expect(cycleSignals(long, '2026-11-18').map((s) => s.id)).toEqual(['duracao'])
    let h = base
    for (const d of ['2026-10-08', '2026-10-09', '2026-11-05', '2026-11-06']) h = logDay(h, d, { flow: 3, energy: 2 })
    expect(cycleSignals(h, '2026-11-18').map((s) => s.id)).toEqual(['ferro'])
  })
  it('inícios do Garmin entram sem duplicar os registrados', () => {
    const r = mergeStarts(base, ['2026-11-06', '2026-06-18'], 5)
    expect(r.added).toBe(1)
    expect(r.cycle.periods[0]).toMatchObject({ start: '2026-06-18', end: '2026-06-22', source: 'garmin' })
  })
})

describe('registro sincronizado (kv)', () => {
  const store = new Map()
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
    globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {} }
    globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail } }
  })
  it('a chave do Garmin nunca vai para a nuvem e é mantida ao receber da nuvem', async () => {
    const { applyRemoteKV, getKV, getLocalKV, setKV } = await import('../services/kv.js')
    setKV('garmin', { key: 'segredo-123', wellness: { '2026-11-18': { sleepSec: 1 } } })
    const out = getKV('garmin')
    expect(out.key).toBeUndefined()
    expect(out.wellness['2026-11-18'].sleepSec).toBe(1)
    expect(out.id).toBe('main')
    applyRemoteKV({ upserts: [{ kind: 'garmin', id: 'main', data: { wellness: { a: 1 }, key: 'da-nuvem?', updatedAt: 'x' } }] })
    expect(getLocalKV('garmin')).toEqual({ wellness: { a: 1 }, updatedAt: 'x', key: 'segredo-123' })
  })
})

describe('ciclo do Garmin (formatos)', () => {
  it('acha inícios e durações em respostas diferentes', () => {
    expect(cycleFromResponse([{ cycleStartDate: '2026-10-08', periodLength: 5, cycleLength: 28 }, { cycleStartDate: '2026-11-05' }])).toEqual({ starts: ['2026-10-08', '2026-11-05'], periodLen: 5, cycleLen: 28 })
    expect(cycleFromResponse({ menstrualCycleSummary: { cycles: [{ startDate: '2026-09-10T00:00:00' }] } }).starts).toEqual(['2026-09-10'])
    expect(cycleFromResponse({ calendarDate: '2026-11-18', startTimestamp: '2026-11-18' }).starts).toEqual([])
  })
})
