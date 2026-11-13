// Logística (evolução): caminho por trecho, alternativas, pontos de passagem, arredondamento que fecha,
// bairro do CEP e grafia diferente da rua. Respostas do ORS SIMULADAS (formato real da API, números fictícios).
import { describe, expect, it, vi } from 'vitest'
import { handleRoute, mainRoads, viasAlong } from '../../api/route.js'
import { districtScore, locateCep, sameStreet } from '../../api/_geocode.js'
import { legKey, normalizeChoice, normalizeLogistics, partsToQuery, roundToTotal, routeKey, tripChoices, tripPoints, tripSummary } from './logistics.js'
import { encodePolyline } from './polyline.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const req = (o) => ({ method: 'GET', query: {}, headers: { host: 'app.test' }, ...o })
const env = { env: { ORS_API_KEY: 'K' } }

/** Resposta do ORS no formato geojson: um segmento por par de coordenadas, com passos (nomes de vias). */
function orsResponse(coords, { m = 1000, s = 120, roads = ['Rua A'], alt = 0 } = {}) {
  const segments = coords.slice(1).map((_, i) => ({ distance: m + i * 10 + alt * 500, duration: s + i + alt * 60, steps: roads.map((name, k) => ({ name, distance: (m / roads.length) * (k === 0 ? 1.2 : 0.8) })) }))
  const line = coords.flatMap(([lon, lat], i) => (i ? [[lon - 0.0005, lat - 0.0005], [lon, lat]] : [[lon, lat]]))
  return { type: 'Feature', properties: { segments, summary: { distance: segments.reduce((a, x) => a + x.distance, 0) }, way_points: coords.map((_, i) => i * 2) }, geometry: { coordinates: line } }
}

const pts = [
  { address: 'Casa', lat: -23.1709, lon: -46.8771 },
  { address: 'Dani', lat: -23.1758, lon: -46.8984 },
  { address: 'Portal do Medeiros', lat: -23.1999, lon: -47.0095 },
  { address: 'Eloy Chaves', lat: -23.1835, lon: -46.9593 }
]

describe('servidor: caminho escolhido por trecho', () => {
  it('trechos no padrão vão juntos; trecho com escolha vai separado, com as opções certas', async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, init) => {
      const b = JSON.parse(init.body)
      calls.push(b)
      return json({ features: [orsResponse(b.coordinates, { roads: ['Av. Antônio Frederico Ozanam', 'Rua X'] })] })
    })
    const choices = [null, null, { preference: 'shortest', avoid: ['highways'], vias: [{ lat: -23.194, lon: -46.989 }] }]
    const r = await handleRoute(req({ method: 'POST', body: { points: pts, choices } }), { ...env, fetchImpl })
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(2)
    // 1ª consulta: Casa → Dani → Portal, na ordem, sem opções
    expect(calls[0].coordinates).toEqual(pts.slice(0, 3).map((p) => [p.lon, p.lat]))
    expect(calls[0]).not.toHaveProperty('preference')
    // 2ª: Portal → ponto de passagem → Eloy, menor distância evitando rodovias
    expect(calls[1].coordinates).toEqual([[-47.0095, -23.1999], [-46.989, -23.194], [-46.9593, -23.1835]])
    expect(calls[1].preference).toBe('shortest')
    expect(calls[1].options).toEqual({ avoid_features: ['highways'] })
    expect(r.body.legs).toHaveLength(3)
    // trecho com ponto de passagem soma os 2 segmentos (1000 + 1010 m), sem permanência
    expect(r.body.legs[2]).toMatchObject({ distanceM: 2010, durationSec: 241, roads: ['Av. Antônio Frederico Ozanam', 'Rua X'] })
    expect(r.body.legs.every((l) => typeof l.polyline === 'string' && l.polyline.length > 0)).toBe(true)
  })
  it('alternativas de um trecho: rápida (+ do ORS), menor, evitar rodovias e pedágios; iguais se juntam', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const b = JSON.parse(init.body)
      if (b.alternative_routes) return json({ features: [orsResponse(b.coordinates, { roads: ['Rodovia Dom Gabriel Paulino Bueno Couto'] }), orsResponse(b.coordinates, { alt: 1, roads: ['Avenida Guilherme Porcari', 'Estrada Eduardo Toresan'] })] })
      if (b.preference === 'shortest') return json({ features: [orsResponse(b.coordinates, { m: 800, s: 150, roads: ['Avenida Guilherme Porcari'] })] })
      if (b.options?.avoid_features?.[0] === 'tollways') return json({ features: [orsResponse(b.coordinates, { roads: ['Rodovia Dom Gabriel Paulino Bueno Couto'] })] }) // igual à rápida
      return json({ features: [orsResponse(b.coordinates, { m: 900, s: 170, roads: ['Avenida Guilherme Porcari'] })] })
    })
    const r = await handleRoute(req({ method: 'POST', body: { points: pts.slice(2, 4), alternativas: true } }), { ...env, fetchImpl })
    expect(r.status).toBe(200)
    const ids = r.body.options.map((o) => o.id)
    expect(ids).toEqual(['fastest', 'alt1', 'shortest', 'highways'])
    expect(r.body.options[0].also).toEqual(['Evitar pedágios'])
    expect(r.body.options[1].roads).toEqual(['Avenida Guilherme Porcari', 'Estrada Eduardo Toresan'])
    // a alternativa do ORS vira pontos de passagem para ser recalculada igual depois
    expect(r.body.options[1].choice.vias.length).toBeGreaterThan(0)
    expect(r.body.options[2].choice).toEqual({ preference: 'shortest', avoid: [], vias: [] })
  })
  it('personalizada pelos pontos de passagem; erro do serviço é explicado', async () => {
    const fetchImpl = vi.fn(async (url, init) => json({ features: [orsResponse(JSON.parse(init.body).coordinates)] }))
    const r = await handleRoute(req({ method: 'POST', body: { points: pts.slice(2, 4), alternativas: true, vias: [{ lat: -23.194, lon: -46.989 }] } }), { ...env, fetchImpl })
    expect(r.body.options.find((o) => o.id === 'custom')).toMatchObject({ label: 'Personalizada', choice: { vias: [{ lat: -23.194, lon: -46.989 }] } })
    const down = await handleRoute(req({ method: 'POST', body: { points: pts.slice(2, 4), alternativas: true } }), { ...env, fetchImpl: async () => json({ error: { message: 'Rate limit' } }, 429) })
    expect(down.status).toBe(429)
    const google = await handleRoute(req({ method: 'POST', body: { points: pts.slice(2, 4), alternativas: true } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl })
    expect(google.status).toBe(501)
  })
  it('principais vias e pontos ao longo do traçado', () => {
    expect(mainRoads([{ name: 'Av. Guilherme Porcari', distance: 3000 }, { name: '-', distance: 900 }, { name: 'Rua B', distance: 100 }, { name: 'Estrada Eduardo Toresan', distance: 1200 }])).toEqual(['Av. Guilherme Porcari', 'Estrada Eduardo Toresan'])
    const line = Array.from({ length: 21 }, (_, i) => [-23 - i / 1000, -46 - i / 1000])
    expect(viasAlong(line)).toEqual([{ lat: -23.007, lon: -46.007 }, { lat: -23.013, lon: -46.013 }])
  })
})

describe('endereços: grafia e bairro (dados reais do OpenStreetMap)', () => {
  it('"Cotrim" × "Contrim" é a mesma rua; "Beija-Flor" do bairro do CEP vence a homônima', () => {
    expect(sameStreet('Rua Manoel Fagundes Cotrim', 'Rua Manoel Fagundes Contrim')).toBe(true)
    expect(sameStreet('Rua Beija-Flor', 'Rua Beija Flor')).toBe(true)
    expect(sameStreet('Rua Beija-Flor', 'Rua Bem-te-vi')).toBe(false)
    expect(districtScore('Portal do Medeiros', 'Medeiros')).toBeGreaterThan(districtScore('Portal do Medeiros', 'Cecap'))
    // Ordem real do Photon: Cecap vem primeiro
    const hits = [
      { lat: -23.14804, lon: -46.91842, precision: 'rua', _street: 'Rua Beija Flor', _city: 'Jundiaí', _district: 'Cecap' },
      { lat: -23.19992, lon: -47.00953, precision: 'rua', _street: 'Rua Beija Flor', _city: 'Jundiaí', _district: 'Medeiros' }
    ]
    expect(locateCep({ street: 'Rua Beija-Flor', district: 'Portal do Medeiros', city: 'Jundiaí', lat: -23.18639, lon: -46.88417 }, '250', hits)).toEqual({ lat: -23.19992, lon: -47.00953, precision: 'rua' })
  })
  it('partes do endereço viram a busca', () => {
    expect(partsToQuery({ street: 'Rua Beija-Flor', number: '250', complement: 'casa 2', district: 'Portal do Medeiros', city: 'Jundiaí', cep: '13212-812' })).toBe('Rua Beija-Flor, 250, Portal do Medeiros, Jundiaí, 13212-812')
  })
})

describe('app: escolhas, chave da rota, arredondamento', () => {
  it('arredonda os trechos para fechar com o total (o caso 62 × 61)', () => {
    const secs = [384, 984, 1176, 1164] // 6,4 + 16,4 + 19,6 + 19,4 min = 61,8 → total 62 (arredondar cada um daria 61)
    const r1 = roundToTotal(secs, 60)
    expect(r1.total).toBe(62)
    expect(r1.parts.reduce((a, b) => a + b, 0)).toBe(62)
    r1.parts.forEach((v, i) => expect(Math.abs(v - secs[i] / 60)).toBeLessThan(1))
    const secs2 = [330, 990, 1170, 1170] // 5,5 + 16,5 + 19,5 + 19,5 = 61 → arredondando cada um daria 6+17+20+20 = 63
    const r = roundToTotal(secs2, 60)
    expect(r.total).toBe(61)
    expect(r.parts.reduce((a, b) => a + b, 0)).toBe(61)
  })
  it('a escolha fica pelo par de pontos; mudar a escolha desatualiza a rota; reordenar preserva quando o par existe', () => {
    const race = { id: 'r', venueAddress: 'PAC' }
    const P = (address, lat, lon, extra = {}) => ({ label: address, address, lat, lon, precision: 'manual', ...extra })
    const casa = P('Casa', -23.17, -46.87)
    const dani = P('Dani', -23.17, -46.89, { id: 'd' })
    const portal = P('Portal', -23.19, -47.0, { id: 'p' })
    const eloy = P('Eloy', -23.18, -46.95, { id: 'e' })
    const pac = P('PAC', -23.04, -46.98)
    let log = normalizeLogistics({ origin: casa, destination: pac, outbound: { stops: [dani, portal, eloy] } })
    const points = tripPoints(race, log, 'ida')
    const choice = normalizeChoice({ label: 'Personalizada', vias: [{ lat: -23.194, lon: -46.989 }] })
    log.outbound.legChoices = { [legKey(points[2], points[3])]: choice }
    log = normalizeLogistics(log)
    expect(tripChoices(log.outbound, points)).toEqual([null, null, choice, null])
    const legs = points.slice(1).map(() => ({ distanceKm: 1, durationMin: 2, distanceM: 1000, durationSec: 120 }))
    log.outbound.route = { provider: 'ors', legs, key: routeKey(points, tripChoices(log.outbound, points)) }
    log = normalizeLogistics(log)
    expect(tripSummary(race, log, 'ida').stale).toBe(false)
    // tirar a escolha → rota desatualizada
    const noChoice = structuredClone(log)
    noChoice.outbound.legChoices = {}
    expect(tripSummary(race, normalizeLogistics(noChoice), 'ida').stale).toBe(true)
    // reordenar Dani e Portal: o par Portal → Eloy deixa de existir; Dani → Eloy não tem escolha
    const swapped = structuredClone(log)
    swapped.outbound.stops = [swapped.outbound.stops[1], swapped.outbound.stops[0], swapped.outbound.stops[2]]
    expect(tripChoices(swapped.outbound, tripPoints(race, swapped, 'ida'))).toEqual([null, null, null, null])
    // voltar à ordem original recupera a escolha (continua válida)
    expect(tripChoices(log.outbound, tripPoints(race, log, 'ida'))[2]).toEqual(choice)
  })
  it('dados antigos (sem partes, sem escolhas, sem precisão) continuam abrindo', () => {
    const old = normalizeLogistics({ origin: { label: 'Casa', address: 'Rua X, 1', lat: -23.1, lon: -46.9 }, outbound: { stops: [{ id: 's1', label: 'Dani', address: 'Rua Y, 2', lat: -23.2, lon: -46.8, dwellMin: 5 }], route: { provider: 'ors', legs: [{ distanceKm: 1, durationMin: 2 }, { distanceKm: 3, durationMin: 4 }], key: 'x' } } })
    expect(old.outbound.legChoices).toEqual({})
    expect(old.outbound.stops[0]).toMatchObject({ id: 's1', label: 'Dani', dwellMin: 5 })
    expect(old.outbound.stops[0]).not.toHaveProperty('parts')
    const kept = normalizeLogistics({ outbound: { stops: [{ id: 's1', label: 'Dani', address: 'Rua Y, 2', parts: { street: 'Rua Y', number: '2', bogus: 'x' }, reference: 'portão azul' }] } })
    expect(kept.outbound.stops[0].parts).toEqual({ street: 'Rua Y', number: '2' })
    expect(kept.outbound.stops[0].reference).toBe('portão azul')
    expect(encodePolyline([[-23, -46]]).length).toBeGreaterThan(0)
  })
})
