import { describe, it, expect, vi } from 'vitest'
import { handleRoute, routeEnv, validatePoints } from '../../api/route.js'
import { decodePolyline } from './polyline.js'

const req = (o) => ({ method: 'GET', query: {}, headers: { host: 'app.test' }, ...o })
const pts = [{ address: 'Residencial Cenário, Jardim Tannus, Jundiaí' }, { address: 'Eloy Chaves, Jundiaí' }, { address: 'Av. Maria de Lourdes Abreu, 95, Itatiba/SP' }]
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

describe('função de rotas', () => {
  it('sem chave: avisa e não inventa rota', async () => {
    expect(routeEnv({})).toEqual({ provider: null, traffic: false, tolls: false })
    const cap = await handleRoute(req(), { env: {} })
    expect(cap.body).toEqual({ provider: null, traffic: false, tolls: false })
    const r = await handleRoute(req({ method: 'POST', body: { points: pts } }), { env: {} })
    expect(r.status).toBe(503)
  })
  it('valida pontos e bloqueia outra origem', async () => {
    expect(() => validatePoints([pts[0]])).toThrow()
    expect(() => validatePoints([{ address: '' }, pts[1]])).toThrow()
    const r = await handleRoute(req({ method: 'POST', body: { points: pts }, headers: { host: 'app.test', origin: 'https://outro.site' } }), { env: { ORS_API_KEY: 'k' }, fetchImpl: vi.fn() })
    expect(r.status).toBe(403)
  })
  it('Google: trânsito previsto para saída futura, pedágio em reais e coordenadas', async () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    const fetchImpl = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body)
      expect(init.headers['x-goog-api-key']).toBe('G')
      expect(body.routingPreference).toBe('TRAFFIC_AWARE')
      expect(body.intermediates).toEqual([{ address: 'Eloy Chaves, Jundiaí' }])
      expect(body.extraComputations).toEqual(['TOLLS'])
      return json({ routes: [{
        legs: [
          { distanceMeters: 6200, duration: '700s', staticDuration: '660s', startLocation: { latLng: { latitude: -23.2, longitude: -46.9 } }, endLocation: { latLng: { latitude: -23.15, longitude: -46.95 } } },
          { distanceMeters: 33100, duration: '2580s', staticDuration: '2460s', endLocation: { latLng: { latitude: -23.0, longitude: -46.84 } } }
        ],
        polyline: { encodedPolyline: '_p~iF~ps|U' },
        travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: 'BRL', units: '9', nanos: 800000000 }] } }
      }] })
    })
    const r = await handleRoute(req({ method: 'POST', body: { points: [pts[0], pts[1], pts[2]], departureAt: '2026-11-08T07:51:00Z' } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl, now })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ provider: 'google', traffic: true, tolls: { amount: 9.8, currency: 'BRL' } })
    expect(r.body.legs).toEqual([{ distanceKm: 6.2, durationMin: 11, trafficMin: 12 }, { distanceKm: 33.1, durationMin: 41, trafficMin: 43 }])
    expect(r.body.points).toHaveLength(3)
  })
  it('Google: saída no passado → sem trânsito; sem tarifa → pedágio desconhecido', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(JSON.parse(init.body).routingPreference).toBe('TRAFFIC_UNAWARE')
      return json({ routes: [{ legs: [{ distanceMeters: 1000, duration: '120s' }], travelAdvisory: { tollInfo: {} } }] })
    })
    const r = await handleRoute(req({ method: 'POST', body: { points: pts.slice(0, 2), departureAt: '2020-01-01T00:00:00Z' } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl })
    expect(r.body).toMatchObject({ traffic: false, tolls: null, hasTolls: true })
    expect(r.body.legs[0].trafficMin).toBe(null)
  })
  it('OpenRouteService: geocodifica, calcula e devolve o traçado codificado', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/geocode/search')) return json({ features: [{ properties: { label: 'X', confidence: 1 }, geometry: { coordinates: [-46.9, -23.2] } }] })
      return json({ features: [{ properties: { segments: [{ distance: 6200, duration: 660 }] }, geometry: { coordinates: [[-46.9, -23.2], [-46.95, -23.15]] } }] })
    })
    const r = await handleRoute(req({ method: 'POST', body: { points: pts.slice(0, 2) } }), { env: { ORS_API_KEY: 'O' }, fetchImpl })
    expect(r.body).toMatchObject({ provider: 'ors', traffic: false, tolls: null })
    expect(r.body.legs).toEqual([{ distanceKm: 6.2, durationMin: 11, trafficMin: null }])
    expect(decodePolyline(r.body.polyline)).toEqual([[-23.2, -46.9], [-23.15, -46.95]])
  })
  it('endereço: sugestões e falhas tratadas', async () => {
    const ok = await handleRoute(req({ query: { q: 'Av. Maria de Lourdes Abreu, 95, Itatiba' } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl: async () => json({ status: 'OK', results: [{ formatted_address: 'Av. Maria de Lourdes Abreu, 95 - Itatiba/SP', geometry: { location: { lat: -23.0, lng: -46.8 } }, partial_match: false }] }) })
    expect(ok.body.results[0]).toEqual({ formatted: 'Av. Maria de Lourdes Abreu, 95 - Itatiba/SP', lat: -23.0, lon: -46.8, partial: false })
    const down = await handleRoute(req({ query: { q: 'Rua Tal, 10, Jundiaí' } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl: async () => { throw new Error('rede') } })
    expect(down.status).toBe(504)
    const quota = await handleRoute(req({ query: { q: 'Rua Tal, 10, Jundiaí' } }), { env: { GOOGLE_MAPS_API_KEY: 'G' }, fetchImpl: async () => json({}, 429) })
    expect(quota.status).toBe(429)
  })
  it('mostra o motivo da recusa do Google (sem expor a chave)', async () => {
    const g = (body, status = 200) => ({ env: { GOOGLE_MAPS_API_KEY: 'SEGREDO' }, fetchImpl: async () => json(body, status) })
    const notEnabled = await handleRoute(req({ query: { q: 'Residencial Cenário' } }), g({ status: 'REQUEST_DENIED', error_message: 'This API project is not authorized to use this API.' }))
    expect(notEnabled.status).toBe(502)
    expect(notEnabled.body.error).toContain('Ative a Routes API e a Geocoding API')
    const billing = await handleRoute(req({ query: { q: 'Residencial Cenário' } }), g({ status: 'REQUEST_DENIED', error_message: 'You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable' }))
    expect(billing.body.error).toContain('faturamento não está ativo')
    const routes = await handleRoute(req({ method: 'POST', body: { points: pts.slice(0, 2) } }), g({ error: { code: 403, message: 'Routes API has not been used in project 123 before or it is disabled.', status: 'PERMISSION_DENIED' } }, 403))
    expect(routes.body.error).toContain('Ative a Routes API')
    const daily = await handleRoute(req({ query: { q: 'Residencial Cenário' } }), g({ status: 'OVER_DAILY_LIMIT' }))
    expect(daily.status).toBe(429)
    for (const r of [notEnabled, billing, routes]) expect(JSON.stringify(r.body)).not.toContain('SEGREDO')
  })
})
