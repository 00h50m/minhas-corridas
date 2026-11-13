// Logística: causa dos trechos de 0 km (pontos geocodificados no mesmo lugar) e a correção.
// Cenário: Health Care Run — Residencial Cenário → Dani → Eloy Chaves → Portal do Medeiros → PAC Volkswagen (Vinhedo).
// As respostas dos serviços são SIMULADAS (este ambiente não acessa ORS/BrasilAPI/OSM); os números não são da rota real.
import { describe, expect, it, vi } from 'vitest'
import { handleRoute } from '../../api/route.js'
import { geocodeAll, locateCep, parseCoords, sameStreet } from '../../api/_geocode.js'
import { collapsedPoints, isPrecise } from './geo.js'
import { normalizeLogistics, pointsKey, tripPoints, tripSummary } from './logistics.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const req = (o) => ({ method: 'GET', query: {}, headers: { host: 'app.test' }, ...o })

// Coordenadas fictícias, distintas, na ordem da sequência.
const P = {
  casa: { label: 'Casa', address: 'Avenida José Joaquim Pedro, 580, Vila Rio Branco, Jundiaí - SP, 13215-425', lat: -23.1650, lon: -46.8990, precision: 'numero' },
  dani: { id: 's1', label: 'Dani', address: 'Avenida Antônio Frederico Ozanan, 2111, Ponte de São João, Jundiaí - SP, 13218-000', lat: -23.1760, lon: -46.8920, precision: 'numero', dwellMin: 5 },
  eloy: { id: 's2', label: 'Eloy Chaves', address: 'Rua Manoel Fagundes Cotrim, 238, Jardim Tannus, Jundiaí - SP, 13212-062', lat: -23.1600, lon: -46.9400, precision: 'numero', dwellMin: 5 },
  portal: { id: 's3', label: 'Portal do Medeiros', address: 'Rua Beija-Flor, 250, Portal do Medeiros, Jundiaí - SP, 13212-812', lat: -23.1500, lon: -46.9140, precision: 'numero', dwellMin: 5 },
  pac: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0400, lon: -46.9800, precision: 'ponto' }
}
const race = { id: 'hc', name: 'Health Care Run', date: '2026-11-15', startTime: '07:00', venueAddress: P.pac.address }
const logOf = (o = {}) => normalizeLogistics({ origin: P.casa, destination: P.pac, outbound: { stops: [P.dani, P.eloy, P.portal] }, ...o })

describe('causa raiz: endereços diferentes no mesmo ponto', () => {
  it('os 4 primeiros pontos com a mesma coordenada (centro de Jundiaí) são detectados', () => {
    const centro = { lat: -23.1857, lon: -46.8978 }
    const pts = [P.casa, P.dani, P.eloy, P.portal, P.pac].map((p, i) => (i < 4 ? { ...p, ...centro } : p))
    const c = collapsedPoints(pts)
    expect(c).toHaveLength(6) // todos os pares entre 4 pontos
    expect(collapsedPoints([P.casa, P.dani, P.eloy, P.portal, P.pac])).toEqual([])
  })
  it('CEP: coordenada da BrasilAPI sem confirmar a rua fica “aproximada”, não exata', () => {
    const c = { street: 'Rua Manoel Fagundes Cotrim', city: 'Jundiaí', lat: -23.1857, lon: -46.8978 }
    // Photon devolve a própria cidade (nó "Jundiaí"): não serve.
    const cityNode = { lat: -23.1857, lon: -46.8978, precision: 'area', _street: '', _city: 'Jundiaí' }
    expect(locateCep(c, '238', [cityNode])).toEqual({ lat: -23.1857, lon: -46.8978, precision: 'cep' })
    // Mesma rua em OUTRA cidade: não serve.
    const otherCity = { lat: -22.9, lon: -47.0, precision: 'numero', _street: 'Rua Manoel Fagundes Cotrim', _city: 'Campinas', _hn: '238' }
    expect(locateCep(c, '238', [otherCity]).precision).toBe('cep')
    // Número achado na rua e na cidade certas: exato.
    const exact = { lat: -23.16, lon: -46.94, precision: 'numero', _street: 'Rua Manoel Fagundes Cotrim', _city: 'Jundiaí', _hn: '238' }
    expect(locateCep(c, '238', [cityNode, exact])).toEqual({ lat: -23.16, lon: -46.94, precision: 'numero' })
    // Só a rua: aproximado.
    const street = { lat: -23.161, lon: -46.941, precision: 'rua', _street: 'Rua Manoel Fagundes Cotrim', _city: 'Jundiaí' }
    expect(locateCep(c, '238', [street]).precision).toBe('rua')
    expect(sameStreet('Avenida Antônio Frederico Ozanan', 'Av. Antonio Frederico Ozanan')).toBe(true)
    expect(sameStreet('Rua Beija-Flor', 'Rua Bem-te-vi')).toBe(false)
  })
  it('geocodeAll com CEP: usa o ponto do número validado no OpenStreetMap', async () => {
    const fetchImpl = async (url) => {
      const u = String(url)
      if (u.includes('brasilapi')) return json({ city: 'Jundiaí', state: 'SP', street: 'Rua Manoel Fagundes Cotrim', neighborhood: 'Jardim Tannus', location: { coordinates: { latitude: '-23.1857', longitude: '-46.8978' } } })
      if (u.includes('photon')) return json({ features: [
        { properties: { countrycode: 'BR', type: 'city', name: 'Jundiaí', state: 'São Paulo' }, geometry: { coordinates: [-46.8978, -23.1857] } },
        { properties: { countrycode: 'BR', type: 'house', street: 'Rua Manoel Fagundes Cotrim', housenumber: '238', city: 'Jundiaí', state: 'São Paulo' }, geometry: { coordinates: [-46.94, -23.16] } }
      ] })
      return json([])
    }
    const r = await geocodeAll('Rua Manoel Fagundes Cotrim, 238, Jardim Tannus, Jundiaí/SP, CEP 13212-062', { fetchImpl, now: 5e12 })
    expect(r[0]).toMatchObject({ source: 'cep', lat: -23.16, lon: -46.94, precision: 'numero', partial: false })
    expect(r.every((x) => !('_city' in x))).toBe(true)
  })
  it('destino ambíguo (avenida sem número) e geocodificação inválida', async () => {
    const fetchImpl = async (url) => (String(url).includes('photon')
      ? json({ features: [{ properties: { countrycode: 'BR', type: 'street', name: 'Avenida das Indústrias', city: 'Vinhedo', state: 'São Paulo' }, geometry: { coordinates: [-46.98, -23.04] } }] })
      : json([]))
    const r = await geocodeAll('Avenida das Indústrias, Vinhedo/SP', { fetchImpl, now: 6e12 })
    expect(r[0]).toMatchObject({ precision: 'rua', partial: true })
    expect(isPrecise(r[0])).toBe(false)
    const none = await geocodeAll('Rua Que Não Existe, 1, Lugar Nenhum', { fetchImpl: async () => json({ features: [] }), now: 7e12 })
    expect(none).toEqual([])
  })
  it('coordenadas coladas do mapa viram o ponto exato', async () => {
    expect(parseCoords('-23.04123, -46.98012')).toEqual({ lat: -23.04123, lon: -46.98012 })
    expect(parseCoords('Rua 1, 23')).toBe(null)
    const r = await geocodeAll('-23.04123, -46.98012', { fetchImpl: async () => json({ features: [] }) })
    expect(r).toEqual([expect.objectContaining({ lat: -23.04123, lon: -46.98012, precision: 'ponto', partial: false })])
  })
})

describe('rota no OpenRouteService: 5 pontos, 4 trechos, na ordem', () => {
  const pts = [P.casa, P.dani, P.eloy, P.portal, P.pac].map((p) => ({ address: p.address, lat: p.lat, lon: p.lon }))
  // Valores brutos simulados (metros, segundos)
  const segs = [{ distance: 2873.4, duration: 401.7 }, { distance: 5120.9, duration: 512.2 }, { distance: 3304.1, duration: 377.9 }, { distance: 17210.6, duration: 1061.3 }]
  const ors = (over = {}) => vi.fn(async (url, init) => json({ features: [{ properties: { segments: over.segments ?? segs, summary: over.summary ?? { distance: segs.reduce((a, s) => a + s.distance, 0), duration: 2353.1 } }, geometry: { coordinates: [[-46.899, -23.165], [-46.98, -23.04]] } }] }))
  it('uma chamada, perfil driving-car, [lon, lat] na ordem informada; 4 trechos associados aos pares', async () => {
    const fetchImpl = ors()
    const r = await handleRoute(req({ method: 'POST', body: { points: pts } }), { env: { ORS_API_KEY: 'K' }, fetchImpl })
    expect(r.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('/v2/directions/driving-car/')
    expect(JSON.parse(init.body).coordinates).toEqual(pts.map((p) => [p.lon, p.lat]))
    expect(init.headers.authorization).toBe('K')
    expect(JSON.stringify(r.body)).not.toContain('"K"')
    expect(r.body.legs).toEqual([
      { distanceKm: 2.87, durationMin: 7, trafficMin: null, distanceM: 2873, durationSec: 402 },
      { distanceKm: 5.12, durationMin: 9, trafficMin: null, distanceM: 5121, durationSec: 512 },
      { distanceKm: 3.3, durationMin: 6, trafficMin: null, distanceM: 3304, durationSec: 378 },
      { distanceKm: 17.21, durationMin: 18, trafficMin: null, distanceM: 17211, durationSec: 1061 }
    ])
  })
  it('pontos no mesmo lugar: recusa ANTES de chamar o serviço e diz quais', async () => {
    const fetchImpl = vi.fn()
    const centro = { lat: -23.1857, lon: -46.8978 }
    const bad = pts.map((p, i) => (i < 4 ? { ...p, ...centro } : p))
    const r = await handleRoute(req({ method: 'POST', body: { points: bad } }), { env: { ORS_API_KEY: 'K' }, fetchImpl })
    expect(r.status).toBe(422)
    expect(r.body.error).toContain('mesmo ponto do mapa')
    expect(r.body.collapsed[0]).toEqual({ i: 0, j: 1 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('respostas inconsistentes do serviço viram erro (nunca 0 km)', async () => {
    const env = { env: { ORS_API_KEY: 'K' } }
    const few = await handleRoute(req({ method: 'POST', body: { points: pts } }), { ...env, fetchImpl: ors({ segments: segs.slice(1) }) })
    expect(few.status).toBe(502)
    const zero = await handleRoute(req({ method: 'POST', body: { points: pts } }), { ...env, fetchImpl: ors({ segments: [{}, ...segs.slice(1)] }) })
    expect(zero.status).toBe(422)
    const sum = await handleRoute(req({ method: 'POST', body: { points: pts } }), { ...env, fetchImpl: ors({ summary: { distance: 50000 } }) })
    expect(sum.status).toBe(502)
    const down = await handleRoute(req({ method: 'POST', body: { points: pts } }), { ...env, fetchImpl: async () => json({ error: { message: 'Quota exceeded' } }, 403) })
    expect(down.status).toBe(502)
    expect(down.body.error).toContain('recusou')
  })
  it('ponto sem coordenada: só aceita se o serviço achar o número (cidade não serve)', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).includes('/geocode/') ? json({ features: [{ properties: { label: 'Jundiaí, SP', layer: 'locality', confidence: 1 }, geometry: { coordinates: [-46.8978, -23.1857] } }] }) : json({})))
    const r = await handleRoute(req({ method: 'POST', body: { points: [{ address: 'Rua X, 10, Jundiaí' }, pts[4]] } }), { env: { ORS_API_KEY: 'K' }, fetchImpl })
    expect(r.status).toBe(422)
    expect(r.body.error).toContain('Não consegui confirmar')
  })
})

describe('totais, paradas, ordem e mudanças', () => {
  const route = (log, legs) => ({ ...log, outbound: { ...log.outbound, route: { provider: 'ors', legs, key: pointsKey(tripPoints(race, log, 'ida')), points: [] } } })
  const legs = [
    { distanceKm: 2.87, durationMin: 7, distanceM: 2873.4, durationSec: 401.7 },
    { distanceKm: 5.12, durationMin: 9, distanceM: 5120.9, durationSec: 512.2 },
    { distanceKm: 3.3, durationMin: 6, distanceM: 3304.1, durationSec: 377.9 },
    { distanceKm: 17.21, durationMin: 18, distanceM: 17210.6, durationSec: 1061.3 }
  ]
  it('soma pelos valores brutos e acrescenta 3 paradas de 5 min', () => {
    const log = normalizeLogistics(route(logOf(), legs))
    const s = tripSummary(race, log, 'ida')
    expect(s.complete).toBe(true)
    expect(s.legs).toHaveLength(4)
    // 2873,4 + 5120,9 + 3304,1 + 17210,6 = 28509,0 m → 28,51 km
    expect(s.distanceKm).toBe(28.51)
    // 401,7 + 512,2 + 377,9 + 1061,3 = 2353,1 s → 39 min (a soma dos arredondados daria 7+9+6+18 = 40)
    expect(s.durationMin).toBe(39)
    expect(s.dwellMin).toBe(15)
    expect(s.totalMin).toBe(54)
  })
  it('mudar só a permanência não invalida a rota; ordem e endereço de casa invalidam', () => {
    const log = normalizeLogistics(route(logOf(), legs))
    const dwell = structuredClone(log)
    dwell.outbound.stops[1].dwellMin = 10
    const sd = tripSummary(race, dwell, 'ida')
    expect(sd.stale).toBe(false)
    expect(sd.totalMin).toBe(39 + 20)
    const order = structuredClone(log)
    order.outbound.stops = [order.outbound.stops[1], order.outbound.stops[0], order.outbound.stops[2]]
    expect(tripSummary(race, order, 'ida').stale).toBe(true)
    expect(tripPoints(race, order, 'ida').map((p) => p.label)).toEqual(['Casa', 'Eloy Chaves', 'Dani', 'Portal do Medeiros', 'PAC Volkswagen'])
    const home = structuredClone(log)
    home.origin = { ...home.origin, lat: -23.17, lon: -46.9 }
    expect(tripSummary(race, home, 'ida').stale).toBe(true)
  })
  it('rota salva com trechos de 0 km (o caso do print) é descartada, e os pontos repetidos apontados', () => {
    const centro = { lat: -23.1857, lon: -46.8978 }
    const raw = logOf({ origin: { ...P.casa, ...centro, precision: undefined }, outbound: { stops: [P.dani, P.eloy, P.portal].map((p) => ({ ...p, ...centro, precision: undefined })) } })
    const bad = normalizeLogistics(route(raw, [{ distanceKm: 0, durationMin: 0 }, { distanceKm: 0, durationMin: 0 }, { distanceKm: 0, durationMin: 0 }, { distanceKm: 22.07, durationMin: 20 }]))
    const s = tripSummary(race, bad, 'ida')
    expect(s.invalid).toBe(true)
    expect(s.complete).toBe(false)
    expect(s.distanceKm).toBe(null)
    expect(s.collapsed.length).toBe(6)
  })
})

describe('correções depois do teste real', async () => {
  const { placeMatch } = await import('../../api/_geocode.js')
  it('ORS: o pedido não desliga as instruções (sem elas não vêm os trechos)', async () => {
    const fetchImpl = vi.fn(async () => json({ features: [{ properties: { summary: { distance: 1000 } }, geometry: { coordinates: [] } }] }))
    const pts = [{ address: 'A', lat: -23.16, lon: -46.9 }, { address: 'B', lat: -23.04, lon: -46.98 }]
    const r = await handleRoute(req({ method: 'POST', body: { points: pts } }), { env: { ORS_API_KEY: 'K' }, fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('instructions')
    expect(r.status).toBe(502)
    expect(r.body.error).toContain('não devolveu os trechos')
  })
  it('ponto salvo antes da precisão existir não conta como confirmado', () => {
    expect(isPrecise({ lat: -23, lon: -46 })).toBe(false)
    expect(isPrecise({ lat: -23, lon: -46, precision: 'numero' })).toBe(true)
  })
  it('lugar com nome (escola) só é exato se o nome ou a rua batem com a busca', () => {
    const escola = { precision: 'local', _name: 'EMEB José Pedro Raymundo', _street: 'Rua Hélio Antônio Lucena', partial: true }
    expect(placeMatch(escola, 'Avenida José Joaquim Pedro, 580, Vila Rio Branco, Jundiaí').precision).toBe('local')
    const cond = { precision: 'local', _name: 'Residencial Cenário', _street: 'Avenida José Joaquim Pedro', partial: true }
    expect(placeMatch(cond, 'Residencial Cenário, Jundiaí')).toMatchObject({ precision: 'numero', partial: false })
    expect(placeMatch(cond, 'Avenida José Joaquim Pedro, 580, Jundiaí').precision).toBe('numero')
  })
})
