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
