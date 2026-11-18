// Rodada 30: sono, body battery e FC de repouso do Garmin ("como você chega ao treino").
import { describe, expect, it, vi } from 'vitest'
import { handleGarmin, mergeWellness, wellnessDay } from '../../api/garmin.js'
import { fmtSleep, readiness } from './readiness.js'
import { wellnessText } from '../components/GarminConnect.jsx'
import { addDaysISO } from './dates.js'

const req = (body) => ({ method: 'POST', body, headers: { host: 'app.test', 'x-forwarded-for': `2.2.2.${Math.floor(Math.random() * 200)}` } })
const jwt = `h.${Buffer.from(JSON.stringify({ exp: 9e9 })).toString('base64url')}.s`

describe('leitura do bem-estar (formatos do Garmin Connect)', () => {
  it('sono (dailySleepDTO), resumo diário e série de body battery', () => {
    expect(wellnessDay({ dailySleepDTO: { calendarDate: '2026-11-18', sleepTimeSeconds: 22800, sleepScores: { overall: { value: 71 } } } })).toEqual({ date: '2026-11-18', sleepSec: 22800, sleepScore: 71, bbWake: null, bbHigh: null, bbLow: null, rhr: null })
    expect(wellnessDay({ calendarDate: '2026-11-18', restingHeartRate: 54, bodyBatteryHighestValue: 82, bodyBatteryAtWakeTime: 78 })).toMatchObject({ rhr: 54, bbHigh: 82, bbWake: 78 })
    expect(wellnessDay({ date: '2026-11-18', charged: 50, bodyBatteryValuesArray: [[1, 30], [2, 77], [3, 45]] })).toMatchObject({ bbHigh: 77, bbLow: 30 })
    expect(wellnessDay({ calendarDate: '2026-11-18' })).toBeNull()
    expect(wellnessDay({ sleepTimeSeconds: 100 })).toBeNull()
  })
  it('junta as fontes por dia', () => {
    const m = mergeWellness([{ calendarDate: '2026-11-18', sleepTimeSeconds: 25000 }], [{ calendarDate: '2026-11-18', restingHeartRate: 52, sleepingSeconds: 1 }, { calendarDate: '2026-11-17', restingHeartRate: 55 }])
    expect(m).toEqual([{ date: '2026-11-17', rhr: 55 }, { date: '2026-11-18', sleepSec: 25000, rhr: 52 }])
  })
  it('função: busca as três fontes, tolera falha de uma e diagnostica formato desconhecido', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url)
      if (u.endsWith('/token')) return new Response(jwt)
      if (u.includes('/sleep-service/sleep/dailySleepSummariesByDate?startDate=2026-11-10&endDate=2026-11-18')) return new Response(JSON.stringify([{ calendarDate: '2026-11-18', sleepTimeSeconds: 24000 }]))
      if (u.includes('/usersummary-service/v2/dailysummaries')) return new Response('erro', { status: 500 })
      if (u.includes('/bodyBattery/reports/daily')) return new Response(JSON.stringify([{ date: '2026-11-18', bodyBatteryValuesArray: [[1, 20], [2, 66]] }]))
      return new Response('', { status: 404 })
    })
    const r = await handleGarmin(req({ action: 'wellness', key: 'chave-bem-estar-1', start: '2026-11-10', end: '2026-11-18' }), { fetchImpl })
    expect(r.status).toBe(200)
    expect(r.body.days).toEqual([{ date: '2026-11-18', sleepSec: 24000, bbHigh: 66, bbLow: 20 }])
    const odd = await handleGarmin(req({ action: 'wellness', key: 'chave-bem-estar-2', start: '2026-11-10', end: '2026-11-18' }), { fetchImpl: vi.fn(async (url) => (String(url).endsWith('/token') ? new Response(jwt) : new Response(JSON.stringify({ entries: [{ dia: 1 }] })))) })
    expect(odd.body.days).toEqual([])
    expect(odd.body.shape.sleep).toEqual(['entries'])
  })
})

describe('como você chega ao treino', () => {
  const base = (date, n, o) => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDaysISO(date, -(i + 1)), o]))
  it('boa noite: bom', () => {
    const r = readiness({ '2026-11-18': { sleepSec: 27000, sleepScore: 84, bbWake: 78, rhr: 52 } }, '2026-11-18')
    expect(r.level).toBe('bom')
    expect(r.parts).toEqual(['sono 7h30 (nota 84)', 'body battery 78 ao acordar', 'FC repouso 52'])
    expect(r.text).toBe('Boa recuperação para treinar.')
  })
  it('um sinal: atenção; dois: cansaço (comparando com o seu normal)', () => {
    const days = { ...base('2026-11-18', 10, { sleepSec: 27000, rhr: 52 }), '2026-11-18': { sleepSec: 23000, bbHigh: 70, rhr: 53 } }
    const a = readiness(days, '2026-11-18')
    expect(a.level).toBe('atencao')
    expect(a.text).toBe('Atenção: dormiu 1 h a menos que o seu normal (7h30). Se sentir cansaço, dá para ir mais leve.')
    days['2026-11-18'] = { sleepSec: 19800, bbWake: 28, rhr: 58 }
    const c = readiness(days, '2026-11-18')
    expect(c.level).toBe('cansaco')
    expect(c.signals).toEqual(['dormiu menos de 6 h', 'body battery 28', 'FC de repouso 58 (normal 52)'])
    expect(c.text).toBe('Sinais de cansaço: dormiu menos de 6 h, body battery 28 e FC de repouso 58 (normal 52). Ouça o corpo: ir mais leve hoje é uma opção.')
    expect(readiness(days, '2026-11-19')).toBeNull()
  })
  it('sem histórico suficiente, não compara com o normal', () => {
    const r = readiness({ '2026-11-17': { sleepSec: 27000 }, '2026-11-18': { sleepSec: 23000 } }, '2026-11-18')
    expect(r.signals).toEqual([])
    expect(fmtSleep(21900)).toBe('6h05')
  })
  it('linha do cartão do Garmin', () => {
    expect(wellnessText({ wellness: { a: {}, b: {} } })).toBe('Sono e body battery: 2 dias (ficam só neste aparelho).')
    expect(wellnessText({ wellness: {}, wellnessShape: { sleep: ['entries'], daily: [], bb: [] } })).toMatch(/formato que o app não reconheceu \(campos: entries\)/)
    expect(wellnessText({ wellness: {} })).toMatch(/não mandou dados/)
  })
})
