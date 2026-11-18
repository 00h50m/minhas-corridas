// Função do Vercel: ponte para a API pessoal da Garmin (só leitura). O navegador não pode chamar a
// Garmin direto (CORS), então esta função troca a chave pessoal por um token, lista as atividades e
// baixa o arquivo original. Não guarda a chave nem os dados: só repassa. Fala só com o servidor oficial.

const BASE = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'
const MAX_FILE = 30 * 1024 * 1024
const TIMEOUT_MS = 20000

const fail = (status, message) => Object.assign(new Error(message), { status })

/** Tokens por chave (hash), enquanto a função estiver quente: evita pedir um token a cada chamada. */
const tokens = new Map()
const hits = new Map()

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return Number(payload.exp) * 1000 || null
  } catch {
    return null
  }
}

export function validKey(k) {
  return typeof k === 'string' && k.length >= 8 && k.length <= 600 && /^[\x21-\x7e]+$/.test(k)
}

const isoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

function sameOrigin(req) {
  const origin = req.headers?.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function limited(ip, now, max = 120) {
  const w = hits.get(ip)
  if (!w || now - w.t > 10 * 60 * 1000) {
    hits.set(ip, { t: now, n: 1 })
    return false
  }
  w.n++
  return w.n > max
}

async function call(fetchImpl, url, init) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal, redirect: 'error' })
  } catch {
    throw fail(502, 'A Garmin não respondeu. Tente de novo em alguns minutos.')
  } finally {
    clearTimeout(timer)
  }
}

async function getToken(key, fetchImpl, now, force = false) {
  const id = await sha256(key)
  const c = tokens.get(id)
  if (!force && c && c.exp - now > 60 * 60 * 1000) return c.token
  const res = await call(fetchImpl, BASE + TOKEN_PATH, { method: 'POST', headers: { Accept: '*/*', Authorization: `ApiKey ${key}` } })
  if (res.status === 401 || res.status === 403 || res.status === 400) throw fail(401, 'A Garmin recusou a chave. Confira se copiou inteira e se ela não expirou ou foi apagada.')
  if (res.status === 429) throw fail(429, 'A Garmin pediu para esperar (muitas consultas). Tente mais tarde.')
  if (!res.ok) throw fail(502, `A Garmin não gerou o acesso agora (erro ${res.status}).`)
  const token = (await res.text()).trim()
  if (!token || token.length > 8000) throw fail(502, 'Resposta inesperada da Garmin.')
  tokens.set(id, { token, exp: jwtExp(token) ?? now + 23 * 3600 * 1000 })
  return token
}

/** GET autenticado; renova o token uma vez se a Garmin disser 401. */
async function authed(key, path, accept, fetchImpl, now) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(key, fetchImpl, now, attempt > 0)
    const res = await call(fetchImpl, BASE + path, { headers: { Accept: accept, Authorization: `Bearer ${token}` } })
    if (res.status === 401 && attempt === 0) continue
    if (res.status === 401 || res.status === 403) throw fail(401, 'A Garmin recusou o acesso. Gere uma chave nova e conecte de novo.')
    if (res.status === 404) throw fail(404, 'Atividade não encontrada na Garmin.')
    if (res.status === 429) throw fail(429, 'A Garmin pediu para esperar (muitas consultas). Tente mais tarde.')
    if (!res.ok) throw fail(502, `A Garmin respondeu com erro ${res.status}.`)
    return res
  }
  throw fail(401, 'A Garmin recusou o acesso.')
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Só o que o app usa de cada atividade da lista. */
export function slimActivity(a) {
  const id = a?.activityId
  if (!(typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)))) return null
  return {
    id: String(id),
    name: typeof a.activityName === 'string' ? a.activityName.slice(0, 80) : '',
    type: typeof a.activityType?.typeKey === 'string' ? a.activityType.typeKey.slice(0, 40) : null,
    start: typeof a.startTimeLocal === 'string' ? a.startTimeLocal.slice(0, 19) : null,
    startGmt: typeof a.startTimeGMT === 'string' ? a.startTimeGMT.slice(0, 19) : null,
    distanceKm: num(a.distance) != null ? Math.round(a.distance) / 1000 : null,
    sec: num(a.duration) != null ? Math.round(a.duration) : null,
    avgHr: num(a.averageHR) != null ? Math.round(a.averageHR) : null
  }
}


/* ---------- Bem-estar: sono, body battery e FC de repouso (por dia) ---------- */

const pick = (o, paths) => {
  for (const p of paths) {
    let v = o
    for (const k of p.split('.')) v = v == null ? undefined : v[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}
const dateOf = (o) => {
  for (const k of ['calendarDate', 'date', 'summaryDate', 'sleepDate', 'day']) {
    const v = o?.[k]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  }
  return null
}
/** Acha a lista de registros diários numa resposta (lista na raiz ou dentro de uma chave). */
function dailyList(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && dateOf(x.dailySleepDTO ?? x))) return v
    if (dateOf(data.dailySleepDTO ?? data)) return [data]
  }
  return []
}

/** Um dia de sono/bem-estar, aceitando os nomes de campo mais comuns do Garmin Connect. */
export function wellnessDay(raw) {
  const o = raw?.dailySleepDTO ?? raw
  const date = dateOf(o)
  if (!date) return null
  const d = {
    date,
    sleepSec: pick(o, ['sleepTimeSeconds', 'sleepingSeconds', 'totalSleepSeconds', 'sleepDurationInSeconds', 'durationInSeconds']),
    sleepScore: pick(o, ['sleepScores.overall.value', 'overallSleepScore.value', 'sleepScore.value', 'sleepScore', 'overallSleepScore']),
    bbWake: pick(o, ['bodyBatteryAtWakeTime', 'bodyBatteryWakeValue', 'wakeBodyBattery']),
    bbHigh: pick(o, ['bodyBatteryHighestValue', 'highestBodyBattery', 'bodyBatteryHigh']),
    bbLow: pick(o, ['bodyBatteryLowestValue', 'lowestBodyBattery']),
    rhr: pick(o, ['restingHeartRate', 'restingHeartRateValue', 'restingHR'])
  }
  // Série do dia ([[hora, valor], ...] ou [{ value }]): o pico da carga.
  const series = Array.isArray(o.bodyBatteryValuesArray) ? o.bodyBatteryValuesArray : Array.isArray(o.bodyBatteryValues) ? o.bodyBatteryValues : null
  if (series && d.bbHigh == null) {
    const vals = series.map((x) => (Array.isArray(x) ? x[1] : x?.value ?? x?.bodyBatteryLevel)).filter((v) => typeof v === 'number' && v >= 0 && v <= 100)
    if (vals.length) { d.bbHigh = Math.max(...vals); d.bbLow = d.bbLow ?? Math.min(...vals) }
  }
  return Object.entries(d).filter(([k, v]) => k !== 'date' && typeof v === 'number').length ? d : null
}

/** Junta os dias de várias respostas (o mesmo dia pode vir em mais de uma): o primeiro valor de cada campo vale. */
export function mergeWellness(...lists) {
  const by = new Map()
  for (const list of lists) for (const raw of list) {
    const d = wellnessDay(raw)
    if (!d) continue
    const cur = by.get(d.date) ?? { date: d.date }
    for (const [k, v] of Object.entries(d)) if (cur[k] == null && v != null) cur[k] = v
    by.set(d.date, cur)
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function handleGarmin(req, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Método não permitido.' } }
  if (!sameOrigin(req)) return { status: 403, body: { error: 'Origem não permitida.' } }
  const ip = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local'
  if (limited(ip, now)) return { status: 429, body: { error: 'Muitas consultas seguidas. Espere alguns minutos.' } }
  const b = req.body ?? {}
  if (!validKey(b.key)) return { status: 400, body: { error: 'Cole a chave pessoal da Garmin (Configurações → Token de API pessoal).' } }
  try {
    if (b.action === 'list') {
      if (!isoDate(b.start) || !isoDate(b.end) || b.start > b.end) return { status: 400, body: { error: 'Período inválido.' } }
      const q = new URLSearchParams({ start: '0', limit: String(Math.min(50, Math.max(1, Number(b.limit) || 30))), startDate: b.start, endDate: b.end })
      const res = await authed(b.key, `/activitylist-service/activities/search/activities?${q}`, 'application/json', fetchImpl, now)
      const data = await res.json().catch(() => null)
      const list = Array.isArray(data) ? data : Array.isArray(data?.activityList) ? data.activityList : Array.isArray(data?.activities) ? data.activities : []
      const activities = list.map(slimActivity).filter(Boolean)
      // Formato que o app não reconheceu: devolve só os NOMES dos campos (nunca os valores), para diagnóstico.
      const shape = activities.length < list.length || (!list.length && data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length)
        ? { top: Array.isArray(data) ? 'lista' : Object.keys(data ?? {}).slice(0, 12), item: list[0] && typeof list[0] === 'object' ? Object.keys(list[0]).slice(0, 15) : [], dropped: list.length - activities.length }
        : null
      return { status: 200, body: { activities, ...(shape ? { shape } : {}) } }
    }
    if (b.action === 'file') {
      const id = String(b.id ?? '')
      if (!/^\d{1,20}$/.test(id) || Number(id) <= 0) return { status: 400, body: { error: 'Atividade inválida.' } }
      const res = await authed(b.key, `/download-service/files/activity/${id}`, 'application/zip, application/x-zip-compressed, application/octet-stream', fetchImpl, now)
      const len = Number(res.headers.get('content-length') || 0)
      if (len > MAX_FILE) throw fail(413, 'Arquivo da atividade grande demais.')
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length) throw fail(502, 'A Garmin mandou o arquivo vazio.')
      if (buf.length > MAX_FILE) throw fail(413, 'Arquivo da atividade grande demais.')
      return { status: 200, binary: buf, type: 'application/zip' }
    }
    if (b.action === 'wellness') {
      if (!isoDate(b.start) || !isoDate(b.end) || b.start > b.end) return { status: 400, body: { error: 'Período inválido.' } }
      const q = new URLSearchParams({ startDate: b.start, endDate: b.end })
      // Cada fonte é opcional: se uma falhar (sem dados, sem permissão), segue com as outras.
      const get = async (path) => {
        try {
          const res = await authed(b.key, path, 'application/json', fetchImpl, now)
          return await res.json().catch(() => null)
        } catch (e) {
          if (e.status === 401 || e.status === 429) throw e
          return null
        }
      }
      const [sleep, daily, bb] = await Promise.all([
        get(`/sleep-service/sleep/dailySleepSummariesByDate?${q}`),
        get(`/usersummary-service/v2/dailysummaries?${q}`),
        get(`/wellness-service/wellness/bodyBattery/reports/daily?${q}`)
      ])
      const days = mergeWellness(dailyList(sleep), dailyList(daily), dailyList(bb))
      const keysOf = (d) => { const l = dailyList(d); const first = l[0]?.dailySleepDTO ?? l[0]; return first && typeof first === 'object' ? Object.keys(first).slice(0, 20) : d && typeof d === 'object' ? Object.keys(d).slice(0, 12) : [] }
      const shape = days.length ? null : { sleep: keysOf(sleep), daily: keysOf(daily), bb: keysOf(bb) }
      return { status: 200, body: { days, ...(shape ? { shape } : {}) } }
    }
    if (b.action === 'check') {
      await getToken(b.key, fetchImpl, now, true)
      return { status: 200, body: { ok: true } }
    }
    return { status: 400, body: { error: 'Ação inválida.' } }
  } catch (e) {
    return { status: e.status ?? 500, body: { error: e.status ? e.message : 'Não foi possível falar com a Garmin agora.' } }
  }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'POST' && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body)
    } catch {
      return res.status(400).json({ error: 'Corpo inválido.' })
    }
  }
  const out = await handleGarmin(req)
  if (out.binary) {
    res.setHeader('content-type', out.type)
    return res.status(200).send(out.binary)
  }
  return res.status(out.status).json(out.body)
}
