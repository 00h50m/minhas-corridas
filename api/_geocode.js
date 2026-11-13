// Busca de endereços (Brasil) combinando fontes gratuitas, sem chave:
//   CEP → BrasilAPI (com coordenadas quando houver) e ViaCEP (reserva)
//   Photon (OpenStreetMap, rápido, bom para sugestões enquanto digita)
//   Nominatim (OpenStreetMap, só na busca completa; 1 consulta por segundo)
// + o serviço configurado (Google ou OpenRouteService), se houver.
// Os resultados são juntados, sem repetidos, e ordenados pelo que mais combina com o texto.

const UA = 'PaceOn/1.0 (+https://minhas-corridas-omega.vercel.app)'
const BR_BBOX = '-74.0,-34.0,-34.7,5.4' // oeste, sul, leste, norte
const TIMEOUT_MS = 6000

const UF_BY_NAME = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO'
}
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const uf = (state) => (state ? UF_BY_NAME[norm(state)] ?? (state.length === 2 ? state.toUpperCase() : state) : '')
const join = (...parts) => parts.filter(Boolean).join(', ')

async function getJson(fetchImpl, url, headers = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** CEP no texto (com ou sem hífen). */
export function findCep(q) {
  const m = /\b(\d{5})-?(\d{3})\b/.exec(q)
  return m ? m[1] + m[2] : null
}

/** Número da casa digitado (ex.: "Av. Brasil, 95" → "95"). Ignora o CEP. */
export function houseNumber(q) {
  const m = /(?:,|\bn[º°o.]?\s*)\s*(\d{1,5})\b(?![\d-])/i.exec(q.replace(/\b\d{5}-?\d{3}\b/, ''))
  return m ? m[1] : null
}

async function cepLookup(cep, fetchImpl) {
  const b = await getJson(fetchImpl, `https://brasilapi.com.br/api/cep/v2/${cep}`)
  if (b?.city) {
    const lat = Number(b.location?.coordinates?.latitude)
    const lon = Number(b.location?.coordinates?.longitude)
    return { street: b.street, district: b.neighborhood, city: b.city, uf: b.state, cep, lat: Number.isFinite(lat) && lat ? lat : null, lon: Number.isFinite(lon) && lon ? lon : null }
  }
  const v = await getJson(fetchImpl, `https://viacep.com.br/ws/${cep}/json/`)
  if (v && !v.erro && v.localidade) return { street: v.logradouro, district: v.bairro, city: v.localidade, uf: v.uf, cep, lat: null, lon: null }
  return null
}

function fromPhoton(f) {
  const p = f.properties || {}
  if (p.countrycode && p.countrycode !== 'BR') return null
  const [lon, lat] = f.geometry?.coordinates ?? []
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const street = p.street ? join(p.street, p.housenumber) : null
  const named = p.name && p.name !== p.street ? p.name : null
  const head = named && street ? `${named} - ${street}` : named || street || ''
  const cityUf = [p.city || p.locality || p.county, uf(p.state)].filter(Boolean).join(' - ')
  const precision = p.housenumber || ['house', 'building'].includes(p.type) ? 'numero' : p.type === 'street' ? 'rua' : 'area'
  return { formatted: join(head, p.district || (p.city ? p.locality : null), cityUf, p.postcode), lat, lon, partial: precision !== 'numero', precision, source: 'osm', _street: p.street || (p.type === 'street' ? p.name : ''), _city: p.city || p.locality || p.county || '', _hn: p.housenumber || '' }
}

async function photonSearch(q, fetchImpl, near) {
  const bias = near ? `&lat=${near.lat}&lon=${near.lon}` : ''
  const b = await getJson(fetchImpl, `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&bbox=${BR_BBOX}${bias}`)
  return (b?.features ?? []).map(fromPhoton).filter(Boolean)
}

function fromNominatim(r) {
  const a = r.address || {}
  const lat = Number(r.lat)
  const lon = Number(r.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const street = a.road ? join(a.road, a.house_number) : null
  const named = r.name && r.name !== a.road ? r.name : null
  const head = named && street ? `${named} - ${street}` : named || street || r.display_name?.split(',')[0] || ''
  const city = a.city || a.town || a.village || a.municipality
  const precision = a.house_number ? 'numero' : a.road ? 'rua' : 'area'
  return { formatted: join(head, a.suburb || a.neighbourhood || a.quarter, [city, uf(a.state)].filter(Boolean).join(' - '), a.postcode), lat, lon, partial: precision !== 'numero', precision, source: 'osm', _street: a.road || '', _city: city || '', _hn: a.house_number || '' }
}

let lastNominatim = 0
async function nominatimSearch(q, fetchImpl, now = Date.now()) {
  if (now - lastNominatim < 1100) return [] // política de uso: no máximo 1 consulta por segundo
  lastNominatim = now
  const b = await getJson(fetchImpl, `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`)
  return (Array.isArray(b) ? b : []).map(fromNominatim).filter(Boolean)
}

const dist2 = (a, b) => ((a.lat - b.lat) * 111000) ** 2 + ((a.lon - b.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180)) ** 2

/** Quanto o resultado combina com o texto digitado (palavras e número). */
export function score(r, q) {
  const words = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 2 || /^\d+$/.test(w))
  const text = norm(r.formatted)
  let s = words.filter((w) => text.includes(w)).length / Math.max(1, words.length)
  const n = houseNumber(q)
  if (n && new RegExp(`\\b${n}\\b`).test(text)) s += 0.5
  if (!r.partial) s += 0.2
  if (r.source === 'cep') s += r.precision === 'numero' ? 1 : 0.3
  if (r.source === 'google') s += 0.3
  return s
}

/** Junta, remove repetidos (mesmo texto ou a menos de 60 m) e ordena. */
export function mergeResults(lists, q, limit = 6) {
  const all = lists.flat().filter(Boolean)
  all.sort((a, b) => score(b, q) - score(a, q))
  const out = []
  for (const r of all) {
    const dup = out.some((o) => norm(o.formatted) === norm(r.formatted) || (r.lat != null && o.lat != null && dist2(o, r) < 3600))
    if (!dup) out.push(r)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Busca de endereço.
 * opts: { mode: 'full' | 'suggest', provider: fn(q) → resultados do serviço configurado, near: {lat, lon} }
 */
export async function geocodeAll(q, { fetchImpl = fetch, mode = 'full', provider = null, near = null, now = Date.now() } = {}) {
  const cep = findCep(q)
  const tasks = []
  const coords = parseCoords(q)
  if (coords) {
    // Coordenadas coladas do mapa (ex.: o acesso exato a um estacionamento): ponto exato.
    const r = await reverseGeocode(coords.lat, coords.lon, fetchImpl).catch(() => null)
    return [{ formatted: `${r?.formatted ? `${r.formatted} · ` : ''}${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`, lat: coords.lat, lon: coords.lon, partial: false, precision: 'ponto', source: 'coords' }]
  }
  const text = q.replace(/\b\d{5}-?\d{3}\b/, '').trim()
  if (text.length >= 3) {
    tasks.push(photonSearch(text, fetchImpl, near))
    if (mode === 'full') {
      tasks.push(nominatimSearch(text, fetchImpl, now))
      if (provider) tasks.push(provider(text).catch(() => []))
    }
  }
  const cepTask = cep ? cepLookup(cep, fetchImpl) : Promise.resolve(null)
  const [c, ...lists] = await Promise.all([cepTask, ...tasks])
  if (c) {
    const n = houseNumber(q)
    // Coordenadas do CEP só valem se um serviço de mapas achar ESTA rua NESTA cidade.
    let hits = lists.flat()
    if (c.street) hits = hits.concat(await photonSearch(join(c.street, n, c.city, c.uf), fetchImpl))
    const loc = locateCep(c, n, hits)
    lists.push([{ formatted: join(c.street ? join(c.street, n) : null, c.district, `${c.city} - ${c.uf}`, `${cep.slice(0, 5)}-${cep.slice(5)}`), lat: loc.lat, lon: loc.lon, partial: loc.precision !== 'numero' || !n, precision: loc.precision, source: 'cep' }])
  }
  return mergeResults(lists, q).filter((r) => r.lat != null).map(publicResult)
}

/** Tira os campos internos usados na validação. */
const publicResult = ({ _street, _city, _hn, ...r }) => ({ precision: r.partial ? 'area' : 'numero', ...r })

const STREET_TYPES = new Set(['rua', 'r', 'avenida', 'av', 'travessa', 'tv', 'alameda', 'al', 'estrada', 'est', 'rodovia', 'rod', 'praca', 'pc', 'largo', 'via', 'viela', 'de', 'da', 'do', 'das', 'dos', 'e'])
const streetWords = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w && !STREET_TYPES.has(w))
/** A rua do resultado é a mesma do CEP? (todas as palavras do nome, ignorando "Rua", "Avenida", "de"…) */
export function sameStreet(a, b) {
  const wa = streetWords(a)
  const wb = new Set(streetWords(b))
  return wa.length > 0 && wa.every((w) => wb.has(w))
}
export const sameCity = (a, b) => !!a && !!b && norm(a).trim() === norm(b).trim()

/**
 * Coordenadas do endereço de um CEP, validadas: { lat, lon, precision }.
 *   'numero' — um serviço de mapas achou o número nesta rua e cidade;
 *   'rua'    — achou a rua nesta cidade, sem o número (aproximado);
 *   'cep'    — só a coordenada do próprio CEP (pode ser o centro da cidade: aproximado).
 */
export function locateCep(c, n, hits) {
  const ok = hits.filter((h) => h && h.lat != null && sameCity(h._city, c.city) && c.street && sameStreet(c.street, h._street))
  const exact = ok.find((h) => h.precision === 'numero' && n && String(h._hn).split(/[^0-9]/)[0] === String(n))
  if (exact) return { lat: exact.lat, lon: exact.lon, precision: 'numero' }
  const street = ok.find((h) => h.precision === 'rua' || h.precision === 'numero')
  if (street) return { lat: street.lat, lon: street.lon, precision: 'rua' }
  if (c.lat != null) return { lat: c.lat, lon: c.lon, precision: 'cep' }
  return { lat: null, lon: null, precision: 'area' }
}

/** "-23.1234, -46.9876" (como o Google Maps copia) → { lat, lon } dentro do Brasil, ou null. */
export function parseCoords(q) {
  const m = /^\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/.exec(q)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  return lat >= -34 && lat <= 5.4 && lon >= -74 && lon <= -34.7 ? { lat, lon } : null
}

/** Endereço a partir de coordenadas (botão "Usar minha localização"). */
export async function reverseGeocode(lat, lon, fetchImpl = fetch) {
  const b = await getJson(fetchImpl, `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)
  const hit = (b?.features ?? []).map(fromPhoton).filter(Boolean)[0]
  if (hit) return publicResult(hit)
  const n = await getJson(fetchImpl, `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`)
  const r = n ? fromNominatim(n) : null
  return r ? publicResult(r) : null
}
