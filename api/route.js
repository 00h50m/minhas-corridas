// Rotas e endereços para a logística da prova. As chaves ficam só aqui (variáveis do Vercel):
//   GOOGLE_MAPS_API_KEY  → Google Routes API (trânsito previsto + pedágios) e Geocoding API
//   ORS_API_KEY          → OpenRouteService (sem trânsito e sem pedágios)
// Sem nenhuma chave, o app usa distância e tempo informados à mão.
//
// GET  /api/route              → { provider, traffic, tolls }
// GET  /api/route?q=endereço[&modo=sugestao]   → { results: [{ formatted, lat, lon, partial, source }] }
// GET  /api/route?lat=..&lon=..                → endereço do local (minha localização)
// POST /api/route { points: [{ address, lat?, lon? }], departureAt? } → rota
import { encodePolyline } from '../src/lib/polyline.js'
import { geocodeAll, reverseGeocode } from './_geocode.js'

const MAX_POINTS = 10
const TIMEOUT_MS = 10000

export function routeEnv(env = process.env) {
  if (env.GOOGLE_MAPS_API_KEY) return { provider: 'google', key: env.GOOGLE_MAPS_API_KEY, traffic: true, tolls: true }
  if (env.ORS_API_KEY) return { provider: 'ors', key: env.ORS_API_KEY, traffic: false, tolls: false }
  return { provider: null, traffic: false, tolls: false }
}

const fail = (status, message) => Object.assign(new Error(message), { status })

async function getJson(fetchImpl, url, init = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetchImpl(url, { ...init, signal: ctrl.signal })
  } catch {
    throw fail(504, 'O serviço de rotas não respondeu. Tente de novo em instantes.')
  } finally {
    clearTimeout(timer)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 429) throw fail(429, 'Limite de consultas de rota atingido (cota do dia). Tente mais tarde.')
    const why = body?.error?.message || body?.error_message || ''
    console.error('Serviço de rotas recusou:', res.status, why)
    throw fail(502, explain(why, 'O serviço de rotas recusou a consulta.'))
  }
  return body
}

/** Traduz os motivos mais comuns do Google para o que a pessoa precisa fazer. */
export function explain(why, fallback) {
  const w = String(why || '')
  if (/billing/i.test(w)) return 'O Google recusou: o faturamento não está ativo no projeto do Google Cloud. Vincule uma conta de faturamento ao projeto.'
  if (/not authorized to use this API|has not been used|is disabled|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|blocked/i.test(w)) return `O Google recusou: a API não está ativada ou a chave não tem permissão para ela. Ative a Routes API e a Geocoding API e inclua as duas nas restrições da chave. (${w.slice(0, 160)})`
  if (/referer|IP address|API key not valid|API_KEY_INVALID|invalid/i.test(w)) return `O Google recusou a chave: confira se a chave está correta e sem restrição de sites/IPs. (${w.slice(0, 160)})`
  return w ? `${fallback} (${w.slice(0, 200)})` : fallback
}

/* ---------- Google ---------- */

async function googleGeocode(q, cfg, fetchImpl) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=br&language=pt-BR&key=${encodeURIComponent(cfg.key)}`
  const body = await getJson(fetchImpl, url)
  if (body.status === 'ZERO_RESULTS') return []
  if (body.status === 'OVER_QUERY_LIMIT' || body.status === 'OVER_DAILY_LIMIT') throw fail(429, 'Limite de consultas de endereço atingido (cota do dia). Tente mais tarde.')
  if (body.status !== 'OK') {
    console.error('Geocoding recusou:', body.status, body.error_message)
    throw fail(502, explain(body.error_message || body.status, 'O serviço de endereços recusou a consulta.'))
  }
  return body.results.slice(0, 5).map((r) => ({ formatted: r.formatted_address, lat: r.geometry.location.lat, lon: r.geometry.location.lng, partial: !!r.partial_match }))
}

const secs = (d) => (typeof d === 'string' ? Number(d.replace(/s$/, '')) : null)
const wp = (p) => (p.lat != null && p.lon != null ? { location: { latLng: { latitude: p.lat, longitude: p.lon } } } : { address: p.address })

async function googleRoute(points, departureAt, cfg, fetchImpl, now = Date.now()) {
  // Trânsito previsto só vale para saídas no futuro.
  const future = departureAt && Date.parse(departureAt) > now + 60000
  const body = {
    origin: wp(points[0]),
    destination: wp(points[points.length - 1]),
    intermediates: points.slice(1, -1).map(wp),
    travelMode: 'DRIVE',
    routingPreference: future ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
    ...(future ? { departureTime: new Date(departureAt).toISOString() } : {}),
    extraComputations: ['TOLLS'],
    languageCode: 'pt-BR',
    regionCode: 'BR',
    units: 'METRIC'
  }
  const res = await getJson(fetchImpl, 'https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': cfg.key,
      'x-goog-fieldmask': 'routes.legs.distanceMeters,routes.legs.duration,routes.legs.staticDuration,routes.legs.startLocation,routes.legs.endLocation,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo'
    },
    body: JSON.stringify(body)
  })
  const r = res.routes?.[0]
  if (!r?.legs?.length) throw fail(422, 'Não encontrei rota entre esses endereços. Confira se estão completos.')
  const legs = r.legs.map((l) => {
    const stat = secs(l.staticDuration) ?? secs(l.duration)
    const dur = secs(l.duration)
    return { distanceKm: Math.round((l.distanceMeters ?? 0) / 10) / 100, durationMin: Math.round(stat / 60), trafficMin: future && dur != null ? Math.round(dur / 60) : null }
  })
  const pts = [r.legs[0].startLocation, ...r.legs.map((l) => l.endLocation)].map((x) => x?.latLng).filter(Boolean).map((x) => ({ lat: x.latitude, lon: x.longitude }))
  // Pedágio: só quando o Google informa a tarifa (em reais).
  const price = r.travelAdvisory?.tollInfo?.estimatedPrice?.find((p) => p.currencyCode === 'BRL')
  const tolls = price ? { amount: Math.round((Number(price.units || 0) + (price.nanos || 0) / 1e9) * 100) / 100, currency: 'BRL' } : null
  return { provider: 'google', legs, polyline: r.polyline?.encodedPolyline ?? '', points: pts, tolls, hasTolls: !!r.travelAdvisory?.tollInfo, traffic: !!future }
}

/* ---------- OpenRouteService ---------- */

async function orsGeocode(q, cfg, fetchImpl) {
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(cfg.key)}&text=${encodeURIComponent(q)}&boundary.country=BR&size=5`
  const body = await getJson(fetchImpl, url)
  return (body.features ?? []).map((f) => ({ formatted: f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], partial: (f.properties.confidence ?? 1) < 0.8 }))
}

async function orsRoute(points, cfg, fetchImpl) {
  const coords = []
  for (const p of points) {
    if (p.lat != null && p.lon != null) coords.push([p.lon, p.lat])
    else {
      const [g] = await orsGeocode(p.address, cfg, fetchImpl)
      if (!g) throw fail(422, `Não encontrei o endereço “${p.address}”. Complete com número, bairro e cidade.`)
      coords.push([g.lon, g.lat])
    }
  }
  const body = await getJson(fetchImpl, 'https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: cfg.key },
    body: JSON.stringify({ coordinates: coords, language: 'pt' })
  })
  const f = body.features?.[0]
  const segs = f?.properties?.segments
  if (!segs?.length) throw fail(422, 'Não encontrei rota entre esses endereços.')
  return {
    provider: 'ors',
    legs: segs.map((s) => ({ distanceKm: Math.round(s.distance / 10) / 100, durationMin: Math.round(s.duration / 60), trafficMin: null })),
    polyline: encodePolyline((f.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon])),
    points: coords.map(([lon, lat]) => ({ lat, lon })),
    tolls: null,
    hasTolls: null,
    traffic: false
  }
}

/* ---------- Entrada ---------- */

export function validatePoints(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_POINTS) throw fail(400, `Informe de 2 a ${MAX_POINTS} pontos.`)
  return raw.map((p) => {
    const address = typeof p?.address === 'string' ? p.address.trim().slice(0, 240) : ''
    const lat = Number.isFinite(p?.lat) && Math.abs(p.lat) <= 90 ? p.lat : null
    const lon = Number.isFinite(p?.lon) && Math.abs(p.lon) <= 180 ? p.lon : null
    if (!address && (lat == null || lon == null)) throw fail(400, 'Ponto sem endereço.')
    return { address, lat: lat != null && lon != null ? lat : null, lon: lat != null && lon != null ? lon : null }
  })
}

// Proteção simples contra uso indevido da chave (por instância): 60 consultas a cada 10 min por IP.
const hits = new Map()
function limited(key, now = Date.now(), max = 60) {
  const list = (hits.get(key) ?? []).filter((t) => now - t < 600000)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 5000) hits.clear()
  return list.length > max
}

function sameOrigin(req) {
  const origin = req.headers?.origin || req.headers?.referer
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

export async function handleRoute(req, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const cfg = routeEnv(env)
  const q = req.query ?? {}
  const isGeo = req.method === 'GET' && (q.q || (q.lat && q.lon))
  // Capacidades: a busca de endereço funciona sempre (fontes gratuitas); a rota depende da chave.
  if (req.method === 'GET' && !isGeo) return { status: 200, body: { provider: cfg.provider, traffic: cfg.traffic, tolls: cfg.tolls, geocode: true } }
  if (!isGeo && !cfg.provider) return { status: 503, body: { error: 'Cálculo de rotas não configurado. Informe distância e tempo à mão.' } }
  if (!sameOrigin(req)) return { status: 403, body: { error: 'Origem não permitida.' } }
  const ip = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() || 'local'
  const suggest = q.modo === 'sugestao'
  if (limited(`${suggest ? 's' : 'f'}:${ip}`, now, suggest ? 240 : 60)) return { status: 429, body: { error: 'Muitas consultas seguidas. Espere alguns minutos.' } }
  try {
    if (isGeo && q.lat && q.lon) {
      const lat = Number(q.lat)
      const lon = Number(q.lon)
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return { status: 400, body: { error: 'Coordenadas inválidas.' } }
      const r = await reverseGeocode(lat, lon, fetchImpl)
      return { status: 200, body: { results: r ? [r] : [] } }
    }
    if (isGeo) {
      const text = String(q.q).trim().slice(0, 240)
      if (text.length < 3) return { status: 400, body: { error: 'Digite o endereço completo ou o CEP.' } }
      const near = Number.isFinite(Number(q.perto_lat)) && Number.isFinite(Number(q.perto_lon)) && q.perto_lat ? { lat: Number(q.perto_lat), lon: Number(q.perto_lon) } : null
      let providerError = null
      const provider = suggest || !cfg.provider ? null : async (t) => {
        try {
          return (await (cfg.provider === 'google' ? googleGeocode(t, cfg, fetchImpl) : orsGeocode(t, cfg, fetchImpl))).map((r) => ({ ...r, source: cfg.provider }))
        } catch (e) {
          providerError = e
          return []
        }
      }
      const results = await geocodeAll(text, { fetchImpl, mode: suggest ? 'suggest' : 'full', provider, near, now })
      // Nenhuma fonte achou e o serviço configurado recusou: mostra o motivo (ex.: chave/API do Google).
      if (!results.length && providerError) throw providerError
      return { status: 200, body: { results } }
    }
    if (req.method === 'POST') {
      const points = validatePoints(req.body?.points)
      const departureAt = typeof req.body?.departureAt === 'string' ? req.body.departureAt : null
      const route = cfg.provider === 'google' ? await googleRoute(points, departureAt, cfg, fetchImpl, now) : await orsRoute(points, cfg, fetchImpl)
      return { status: 200, body: { ...route, fetchedAt: new Date(now).toISOString() } }
    }
    return { status: 405, body: { error: 'Método não permitido.' } }
  } catch (e) {
    return { status: e.status ?? 500, body: { error: e.status ? e.message : 'Não foi possível calcular a rota agora.' } }
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
  const out = await handleRoute(req)
  return res.status(out.status).json(out.body)
}
