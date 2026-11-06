// Agenda por assinatura: o app de calendário busca este endereço com o token secreto da pessoa
// (/agenda/<token>/paceon.ics → /api/agenda?t=<token>; o endereço antigo .../minhas-corridas.ics continua valendo). Usa a chave pública (anon):
// quem filtra as provas e os campos é a função calendar_feed no banco.
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL, cleanSupabaseUrl } from '../src/config.js'
import { buildICS, feedRaces } from '../src/lib/ics.js'
import { normalizeRace } from '../src/lib/model.js'
import { todayInTimeZone } from '../src/lib/dates.js'

const TOKEN_RE = /^[a-f0-9]{48,128}$/

export async function fetchFeed(token, { env = process.env, fetchImpl = fetch } = {}) {
  const url = cleanSupabaseUrl(env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL)
  const key = env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  const res = await fetchImpl(`${url}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ feed_token: token })
  })
  if (!res.ok) throw Object.assign(new Error('Banco indisponível.'), { status: 502 })
  const body = await res.json()
  // null = token não existe; { races } = agenda ativa (pode estar vazia).
  return body && Array.isArray(body.races) ? body.races : null
}

export default async function handler(req, res) {
  const token = String(req.query?.t ?? '').trim().toLowerCase()
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Método não permitido.')
  if (!TOKEN_RE.test(token)) return res.status(404).send('Agenda não encontrada.')
  try {
    const rows = await fetchFeed(token)
    // Link trocado ou desativado. 404 faz o calendário parar de atualizar.
    if (!rows) {
      res.setHeader('cache-control', 'no-store')
      return res.status(404).send('Agenda não encontrada. Gere um novo link no app.')
    }
    const races = rows.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string').map(normalizeRace)
    const { text } = buildICS(feedRaces(races, todayInTimeZone('America/Sao_Paulo')), { feed: true })
    res.setHeader('content-type', 'text/calendar; charset=utf-8')
    res.setHeader('content-disposition', 'inline; filename="paceon.ics"')
    res.setHeader('cache-control', 'private, max-age=900')
    res.setHeader('x-robots-tag', 'noindex')
    return res.status(200).send(text)
  } catch (e) {
    return res.status(e.status ?? 500).send('Não foi possível montar a agenda agora.')
  }
}
