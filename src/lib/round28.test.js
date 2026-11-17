// Rodada 28: importação automática do Garmin (API pessoal, só leitura).
import { describe, expect, it, vi } from 'vitest'
import { handleGarmin, slimActivity, validKey } from '../../api/garmin.js'
import { garminDate, planGarmin, sportFromGarmin, summaryFromList, syncWindow } from './garminSync.js'
import { freeWorkout, matchActivity, resultFrom, alreadyImported } from './activityMatch.js'
import { normalizeWorkout } from './workout.js'

const req = (body, headers = {}) => ({ method: 'POST', body, headers: { host: 'app.test', 'x-forwarded-for': `1.1.1.${Math.floor(Math.random() * 200)}`, ...headers } })
const jwt = (expSec) => `h.${Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url')}.s`
const KEY = 'chave-pessoal-123456'

function garminFake({ list = [], tokenStatus = 200 } = {}) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith('/personalapitoken-service/personal-api/personal-api-key/token')) {
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe(`ApiKey ${KEY}`)
      return new Response(tokenStatus === 200 ? jwt(Math.floor(Date.now() / 1000) + 86400) : 'no', { status: tokenStatus })
    }
    expect(init.headers.Authorization).toMatch(/^Bearer h\./)
    if (String(url).includes('/activitylist-service/activities/search/activities')) return new Response(JSON.stringify(list), { status: 200 })
    if (String(url).includes('/download-service/files/activity/77')) return new Response(new Uint8Array([80, 75, 3, 4, 1, 2]), { status: 200 })
    return new Response('', { status: 404 })
  })
  return { fetchImpl, calls }
}

describe('ponte /api/garmin', () => {
  it('valida chave, origem e ação', async () => {
    expect(validKey('abc')).toBe(false)
    expect(validKey('tem espaço no meio')).toBe(false)
    expect(validKey(KEY)).toBe(true)
    expect((await handleGarmin(req({ action: 'list', key: 'x' }))).status).toBe(400)
    expect((await handleGarmin(req({ action: 'list', key: KEY, start: '2026-11-01', end: '2026-11-17' }, { origin: 'https://outro.site' }))).status).toBe(403)
    expect((await handleGarmin({ ...req({}), method: 'GET' })).status).toBe(405)
    expect((await handleGarmin(req({ action: 'list', key: KEY, start: 'ontem', end: '2026-11-17' }))).status).toBe(400)
    expect((await handleGarmin(req({ action: 'file', key: KEY, id: '../etc' }))).status).toBe(400)
  })
  it('troca a chave por token (uma vez), lista e devolve só o que o app usa', async () => {
    const list = [{ activityId: 77, activityName: 'Jundiaí Corrida', activityType: { typeKey: 'running' }, startTimeLocal: '2026-11-17 06:10:00', startTimeGMT: '2026-11-17 09:10:00', distance: 5012.3, duration: 2350.4, averageHR: 151.2, ownerFullName: 'não deve sair' }]
    const { fetchImpl, calls } = garminFake({ list })
    const r = await handleGarmin(req({ action: 'list', key: KEY, start: '2026-11-03', end: '2026-11-17' }), { fetchImpl })
    expect(r.status).toBe(200)
    expect(r.body.activities).toEqual([{ id: '77', name: 'Jundiaí Corrida', type: 'running', start: '2026-11-17 06:10:00', startGmt: '2026-11-17 09:10:00', distanceKm: 5.012, sec: 2350, avgHr: 151 }])
    expect(calls[1].url).toBe('https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=30&startDate=2026-11-03&endDate=2026-11-17')
    const f = await handleGarmin(req({ action: 'file', key: KEY, id: '77' }), { fetchImpl })
    expect(f.binary.length).toBe(6)
    expect(calls.filter((c) => c.url.endsWith('/token')).length).toBe(1) // token reaproveitado
  })
  it('chave recusada: 401 com orientação', async () => {
    const { fetchImpl } = garminFake({ tokenStatus: 401 })
    const r = await handleGarmin(req({ action: 'check', key: KEY }), { fetchImpl })
    expect(r.status).toBe(401)
    expect(r.body.error).toMatch(/recusou a chave/)
  })
  it('lista com formato inesperado não quebra', () => {
    expect(slimActivity({ activityId: 'abc' })).toBeNull()
    expect(slimActivity({ activityId: 5, distance: 'x' }).distanceKm).toBeNull()
  })
})

describe('sincronização', () => {
  it('tipo da Garmin → atividade do app', () => {
    expect(['running', 'trail_running', 'treadmill_running', 'road_biking', 'indoor_cycling', 'lap_swimming', 'walking', 'strength_training', 'yoga', 'pilates', 'golf'].map(sportFromGarmin))
      .toEqual(['corrida', 'corrida', 'corrida', 'bike', 'bike', 'natacao', 'caminhada', 'academia', 'alongamento', 'alongamento', 'outro'])
  })
  it('período: 14 dias na primeira vez; depois desde 2 dias antes da última busca; no máximo 30', () => {
    expect(syncWindow(null, '2026-11-17')).toEqual({ start: '2026-11-03', end: '2026-11-17' })
    expect(syncWindow('2026-11-16T22:00:00Z', '2026-11-17')).toEqual({ start: '2026-11-14', end: '2026-11-17' })
    expect(syncWindow('2026-08-01T10:00:00Z', '2026-11-17').start).toBe('2026-10-18')
  })
  it('ignora as já importadas; corrida no dia da prova fica para o resultado', () => {
    const list = [
      { id: '1', type: 'running', start: '2026-11-17 06:00:00', distanceKm: 5 },
      { id: '2', type: 'running', start: '2026-11-15 07:00:00', distanceKm: 5 },
      { id: '3', type: 'strength_training', start: '2026-11-16 19:00:00', sec: 2700 },
      { id: '4', type: 'running', start: '2026-11-14 06:00:00', distanceKm: 4 },
      { id: '5', type: 'running', start: null, startGmt: null }
    ]
    const workouts = [{ id: 'w', result: { garminId: '4' } }]
    const races = [{ id: 'hc', name: 'Health Care Run', date: '2026-11-15', status: 'concluida' }]
    const plan = planGarmin(list, { workouts, races, done: ['1'] })
    expect(plan.map((x) => [x.g.id, x.kind, x.sport])).toEqual([['2', 'prova', 'corrida'], ['3', 'novo', 'academia']])
    expect(plan[0].race.id).toBe('hc')
    expect(garminDate({ startGmt: '2026-11-17 02:00:00' })).toBeTruthy()
  })
  it('academia sem arquivo: vai para a academia planejada do dia; senão vira avulsa com o nome da Garmin', () => {
    const g = { id: '3', name: 'Musculação', type: 'strength_training', start: '2026-11-16 19:00:00', startGmt: '2026-11-16 22:00:00', sec: 2700, distanceKm: null }
    const a = { ...summaryFromList(g), garminId: '3', appSport: 'academia', title: g.name }
    expect(a.elapsedSec).toBe(2700)
    const acad = { ...normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 45, date: '2026-11-16' }), id: 'ac' }
    const run = { ...normalizeWorkout({ name: 'Rodagem', date: '2026-11-16', items: [{ type: 'corrida', duration: { kind: 'time', value: 600 } }] }), id: 'r' }
    expect(matchActivity([run, acad], '2026-11-16', 'academia').auto.id).toBe('ac')
    expect(resultFrom(a).garminId).toBe('3')
    const fw = freeWorkout(a)
    expect(fw.sport).toBe('academia')
    expect(fw.name).toBe('Musculação')
    expect(alreadyImported([{ ...fw, result: resultFrom(a) }], { ...a, fileName: 'outro' })).toBeTruthy()
  })
})
