import { describe, it, expect, vi } from 'vitest'
import { compareRaces, comparableRaces, formatDiff } from './compare.js'
import { resultBadges, shareCardInfo, distanceTitle, cardFileName } from './shareCard.js'
import { pushNotificationsFor } from './alerts.js'
import { runPushJob } from './pushJob.js'
import { buildICS, feedRaces } from './ics.js'
import { todayInTimeZone } from './dates.js'
import { emptyRace, emptyResult } from './model.js'
import agenda from '../../api/agenda.js'
import pushCron from '../../api/push-cron.js'
import pushApi from '../../api/push.js'
import { adminDb } from '../../api/_supabaseAdmin.js'

let n = 0
const race = (o) => ({ ...emptyRace(), id: 'r' + ++n, name: 'Prova ' + n, status: 'concluida', ...o })
const res = (km, t, o = {}) => ({ ...emptyResult(), officialDistanceKm: km, netTime: t, ...o })
const watch = (secs, extra = {}) => ({ distanceKm: secs.length, elapsedSec: secs.reduce((a, b) => a + b, 0), splits: secs.map((sec, i) => ({ km: i + 1, sec })), ...extra })

describe('comparar provas km a km', () => {
  const a = race({ name: 'Antiga', date: '2026-03-01', result: res(5, 1800, { watch: watch([350, 355, 360, 365, 370], { avgHr: 165 }) }) })
  const b = race({ name: 'Nova', date: '2026-06-01', result: res(5, 1760, { watch: watch([352, 350, 350, 352, 356, 50].map((s, i) => s), { avgHr: 162 }) }) })
  b.result.watch.splits[5] = { km: 5.08, sec: 50, partial: 80 }

  it('diferença por km e acumulada, ignorando o trecho parcial', () => {
    const c = compareRaces(a, b)
    expect(c.common).toBe(5)
    expect(c.rows.map((r) => r.diff)).toEqual([2, -5, -10, -13, -14])
    expect(c.rows[4].cumDiff).toBe(-40)
    expect(c.totalDiff).toBe(-40)
    expect(c.faster).toBe(4)
    expect(c.slower).toBe(1)
    expect(c.biggestGain.km).toBe(5)
    expect(c.biggestLoss.km).toBe(1)
    expect(c.halves.first).toBe(-3)
    expect(c.halves.second).toBe(-27)
    expect(c.sameDistance).toBe(true)
  })
  it('mantém a ordem escolhida (prova 1 é a referência)', () => {
    const c = compareRaces(b, a)
    expect(c.a.race.name).toBe('Nova')
    expect(c.totalDiff).toBe(40)
  })
  it('sem parciais: só os totais; distâncias diferentes avisam', () => {
    const c10 = race({ date: '2026-07-01', result: res(10, 3700) })
    const c = compareRaces(a, c10)
    expect(c.common).toBe(0)
    expect(c.splitDiff).toBe(null)
    expect(c.sameDistance).toBe(false)
    expect(compareRaces(a, race({ result: null }))).toBe(null)
  })
  it('lista de comparáveis: mesma distância e com parciais primeiro', () => {
    const tenNoSplits = race({ date: '2026-09-01', result: res(10, 3700) })
    const fiveNoSplits = race({ date: '2026-08-01', result: res(5, 1790) })
    const planned = race({ status: 'inscrita', date: '2026-12-01' })
    const list = comparableRaces([a, b, tenNoSplits, fiveNoSplits, planned], a)
    expect(list.map((r) => r.id)).toEqual([b.id, fiveNoSplits.id, tenNoSplits.id])
  })
  it('formata diferenças', () => {
    expect(formatDiff(-8)).toBe('−0:08')
    expect(formatDiff(62)).toBe('+1:02')
    expect(formatDiff(0.3)).toBe('0:00')
    expect(formatDiff(3725)).toBe('+1:02:05')
  })
})

describe('card de compartilhamento', () => {
  const old = race({ date: '2026-01-10', result: res(21.0975, 7600) })
  it('recorde pessoal, meta batida e primeira prova', () => {
    const pr = race({ date: '2026-05-10', targetTime: 7300, result: res(21.1, 7250) })
    expect(resultBadges(pr, [old, pr]).map((b) => b.id)).toEqual(['recorde', 'meta'])
    expect(resultBadges(pr, [old, pr])[0].label).toBe('Recorde pessoal (−5:50)')
    const first = race({ date: '2026-05-10', result: res(42.195, 15000) })
    expect(resultBadges(first, [old, first])[0].label).toBe('Primeira maratona')
    // Registro pessoal não vira recorde
    const personal = race({ date: '2026-06-10', result: res(21.1, 7000, { isOfficial: false }) })
    expect(resultBadges(personal, [old, personal])).toEqual([])
  })
  it('monta textos e respeita as opções', () => {
    const r = race({ name: 'Meia de SP', city: 'São Paulo', state: 'SP', date: '2026-05-10', result: res(21.1, 7250, { overallPlace: 312, categoryPlace: 20, category: 'F35-39', watch: watch(Array(21).fill(340), { avgHr: 170 }) }) })
    const info = shareCardInfo(r, [r])
    expect(info.distance).toBe('MEIA MARATONA')
    expect(info.time).toBe('2:00:50')
    expect(info.place).toBe('São Paulo/SP')
    expect(info.stats.map((s) => s.value)).toEqual(['5:44/km', '312º', '20º'])
    expect(info.splits).toHaveLength(21)
    const lean = shareCardInfo(r, [r], { places: false, splits: false, hr: true })
    expect(lean.stats.map((s) => s.label)).toEqual(['PACE', 'FC MÉDIA'])
    expect(lean.splits).toBe(null)
    expect(shareCardInfo(race({ result: null }), [])).toBe(null)
    expect(distanceTitle(10)).toBe('10 KM')
    expect(cardFileName(r)).toBe('meia-de-sp-2026-05-10.png')
  })
})

describe('notificações push de prazos', () => {
  const today = '2026-11-04'
  const rs = [
    race({ id: 'a', name: 'Aberta', status: 'aberta', signupDeadline: '2026-11-07', lotChangeDate: '2026-11-05' }),
    race({ id: 'b', name: 'Inscrita', status: 'inscrita', date: '2026-11-05', startTime: '07:00', kitPickupDate: '2026-11-04', kitPickupTime: '10:00' }),
    race({ id: 'c', name: 'Kit retirado', status: 'inscrita', date: '2026-11-20', kitPickupDate: '2026-11-05', checklist: [{ id: 'x', text: 'Kit retirado', done: true }] }),
    race({ id: 'd', name: 'Interesse longe', status: 'interesse', signupDeadline: '2026-11-06' })
  ]
  it('só nos dias combinados, com chave única', () => {
    const out = pushNotificationsFor(rs, today)
    expect(out.map((x) => x.key)).toEqual(['b:kit:2026-11-04:0', 'b:prova:2026-11-05:1', 'a:lote:2026-11-05:1', 'a:inscricao:2026-11-07:3'])
    expect(out[1]).toMatchObject({ title: 'Amanhã é dia de prova!', body: 'Inscrita · largada 07:00', url: '/corridas/b' })
    expect(out[0]).toMatchObject({ title: 'Hoje: retirar o kit', body: 'Inscrita · 10:00' })
    expect(out[3].title).toBe('Inscrição termina em 3 dias')
  })
  it('rodada diária: não repete, remove inscrição expirada e libera em erro temporário', async () => {
    const claimed = new Set()
    const released = []
    const removed = []
    const db = {
      subscriptions: async () => [
        { endpoint: 'https://push/1', user_id: 'u1', tz: 'America/Sao_Paulo' },
        { endpoint: 'https://push/gone', user_id: 'u1', tz: 'America/Sao_Paulo' },
        { endpoint: 'https://push/2', user_id: 'u2', tz: 'Fuso/Invalido' }
      ],
      races: async (u) => (u === 'u1' ? rs : [race({ id: 'z', status: 'inscrita', date: '2026-11-05' })]),
      claim: async (u, keys) => keys.filter((k) => !claimed.has(u + k) && claimed.add(u + k)),
      release: async (u, keys) => { released.push(...keys); keys.forEach((k) => claimed.delete(u + k)) },
      removeSubscription: async (e) => removed.push(e),
      cleanup: vi.fn(async () => {})
    }
    const sent = []
    const send = async (d, p) => {
      if (d.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      if (d.endpoint.endsWith('2')) throw Object.assign(new Error('timeout'), { statusCode: 500 })
      sent.push(`${d.endpoint} ${p.tag}`)
    }
    const now = new Date('2026-11-04T11:00:00Z')
    const r1 = await runPushJob({ db, send, now })
    expect(r1).toMatchObject({ users: 2, devices: 3, notifications: 5, sent: 4, removed: 1, failed: 1 })
    expect(removed).toEqual(['https://push/gone'])
    expect(released).toEqual(['z:prova:2026-11-05:1'])
    expect(db.cleanup).toHaveBeenCalled()
    // Segunda rodada no mesmo dia: nada repetido para u1; u2 tenta de novo.
    sent.length = 0
    const r2 = await runPushJob({ db: { ...db, subscriptions: async () => [{ endpoint: 'https://push/1', user_id: 'u1', tz: 'America/Sao_Paulo' }] }, send, now })
    expect(r2.notifications).toBe(0)
    expect(sent).toEqual([])
  })
  it('"hoje" no fuso da pessoa', () => {
    const t = new Date('2026-11-05T01:30:00Z')
    expect(todayInTimeZone('America/Sao_Paulo', t)).toBe('2026-11-04')
    expect(todayInTimeZone('Europe/Lisbon', t)).toBe('2026-11-05')
    expect(todayInTimeZone('nada', t)).toBe('2026-11-04')
  })
})

describe('agenda por assinatura', () => {
  it('cabeçalho de atualização e filtro de provas', () => {
    const rs = [
      race({ status: 'inscrita', date: '2026-12-01', name: 'Futura' }),
      race({ status: 'cancelada', date: '2026-12-02', name: 'Cancelada' }),
      race({ status: 'concluida', date: '2024-01-01', name: 'Muito antiga' }),
      race({ status: 'interesse', date: null, name: 'Sem data' })
    ]
    const sel = feedRaces(rs, '2026-11-04')
    expect(sel.map((r) => r.name)).toEqual(['Futura'])
    const { text } = buildICS(sel, { feed: true })
    expect(text).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H')
    expect(text).toContain('X-PUBLISHED-TTL:PT6H')
    expect(buildICS(sel).text).not.toContain('REFRESH-INTERVAL')
  })

  const mockRes = () => {
    const r = { code: 0, headers: {}, body: null }
    r.status = (c) => ((r.code = c), r)
    r.setHeader = (k, v) => (r.headers[k] = v)
    r.send = (b) => ((r.body = b), r)
    r.json = (b) => ((r.body = b), r)
    return r
  }
  const token = 'a'.repeat(64)

  it('função /api/agenda: token, link desativado e .ics', async () => {
    const calls = []
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      const t = JSON.parse(init.body).feed_token
      const payload = t === token ? { races: [{ id: 'r1', name: 'Meia do Rio', date: '2099-06-01', startTime: '06:30', status: 'inscrita', city: 'Rio de Janeiro', state: 'RJ', kitPickupDate: '2099-05-30' }] } : t === 'b'.repeat(64) ? { races: [] } : null
      return new Response(JSON.stringify(payload), { status: 200 })
    })
    let r = mockRes()
    await agenda({ method: 'GET', query: { t: 'curto' } }, r)
    expect(r.code).toBe(404)
    expect(calls).toHaveLength(0)

    r = mockRes()
    await agenda({ method: 'GET', query: { t: 'c'.repeat(64) } }, r)
    expect(r.code).toBe(404)

    r = mockRes()
    await agenda({ method: 'GET', query: { t: 'b'.repeat(64) } }, r)
    expect(r.code).toBe(200)
    expect(r.body).toContain('BEGIN:VCALENDAR')
    expect(r.body).not.toContain('BEGIN:VEVENT')

    r = mockRes()
    await agenda({ method: 'GET', query: { t: token.toUpperCase() } }, r)
    expect(r.code).toBe(200)
    expect(r.headers['content-type']).toMatch(/text\/calendar/)
    expect(r.body).toContain('SUMMARY:Meia do Rio')
    expect(r.body).toContain('Retirar kit – Meia do Rio')
    expect(calls.at(-1).url).toMatch(/\/rest\/v1\/rpc\/calendar_feed$/)
    expect(calls.at(-1).body.feed_token).toBe(token)
  })

  it('cron e teste de push exigem configuração e autorização', async () => {
    const env = { ...process.env }
    delete process.env.CRON_SECRET
    let r = mockRes()
    await pushCron({ headers: {} }, r)
    expect(r.code).toBe(503)
    process.env.CRON_SECRET = 'segredo'
    r = mockRes()
    await pushCron({ headers: { authorization: 'Bearer errado' } }, r)
    expect(r.code).toBe(401)
    r = mockRes()
    await pushCron({ headers: { authorization: 'Bearer segredo' } }, r)
    expect(r.code).toBe(503)
    expect(r.body.missing).toContain('VAPID_PRIVATE_KEY')
    r = mockRes()
    await pushApi({ method: 'GET', headers: {} }, r)
    expect(r.code).toBe(503)
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    r = mockRes()
    await pushApi({ method: 'GET', headers: {} }, r)
    expect(r.body).toEqual({ publicKey: 'pub' })
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 }))
    r = mockRes()
    await pushApi({ method: 'POST', headers: { authorization: 'Bearer x' } }, r)
    expect(r.code).toBe(401)
    process.env = env
  })

  it('adaptador do banco: claim ignora duplicados e release apaga só as chaves', async () => {
    const calls = []
    const f = vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', prefer: init.headers?.prefer, body: init.body })
      return new Response(init.method === 'POST' ? JSON.stringify([{ key: 'k1' }]) : '', { status: 200 })
    })
    const db = adminDb({ url: 'https://x.supabase.co', serviceKey: 'srv' }, f)
    expect(await db.claim('u1', ['k1', 'k2'])).toEqual(['k1'])
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/push_log?on_conflict=user_id,key&select=key')
    expect(calls[0].prefer).toBe('resolution=ignore-duplicates,return=representation')
    await db.release('u1', ['r1:kit:2026-11-04:0'])
    expect(decodeURIComponent(calls[1].url)).toBe('https://x.supabase.co/rest/v1/push_log?user_id=eq.u1&key=in.("r1:kit:2026-11-04:0")')
    expect(calls[1].method).toBe('DELETE')
  })
})
