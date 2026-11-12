import { describe, it, expect, vi } from 'vitest'
import { findCep, geocodeAll, houseNumber, mergeResults, reverseGeocode, score } from '../../api/_geocode.js'
import { handleRoute } from '../../api/route.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

// Respostas no formato real de cada serviço (valores de teste).
const PHOTON = {
  features: [
    { geometry: { coordinates: [-46.9216, -23.2014] }, properties: { name: 'Residencial Cenário', street: 'Rua Ângelo Pianta', district: 'Jardim Tannus', city: 'Jundiaí', state: 'São Paulo', postcode: '13214-000', countrycode: 'BR', type: 'house' } },
    { geometry: { coordinates: [-46.95, -23.18] }, properties: { name: 'Jardim Tannus', city: 'Jundiaí', state: 'São Paulo', countrycode: 'BR', type: 'district' } },
    { geometry: { coordinates: [-58.4, -34.6] }, properties: { name: 'Cenario', city: 'Buenos Aires', countrycode: 'AR', type: 'house' } }
  ]
}
const NOMINATIM = [{ lat: '-23.2015', lon: '-46.9217', name: 'Residencial Cenário', address: { road: 'Rua Ângelo Pianta', suburb: 'Jardim Tannus', city: 'Jundiaí', state: 'São Paulo', postcode: '13214-000' } }]

function router(map) {
  return vi.fn(async (url) => {
    const u = String(url)
    for (const [k, v] of Object.entries(map)) if (u.includes(k)) return typeof v === 'function' ? v(u) : json(v)
    return json({}, 404)
  })
}

describe('busca de endereço', () => {
  it('reconhece CEP e número da casa', () => {
    expect(findCep('Rua X, 95, Itatiba 13253-500')).toBe('13253500')
    expect(findCep('13253500')).toBe('13253500')
    expect(findCep('Av. Brasil, 1500')).toBe(null)
    expect(houseNumber('Av. Maria de Lourdes Abreu, 95, Itatiba')).toBe('95')
    expect(houseNumber('Rua X nº 12')).toBe('12')
    expect(houseNumber('Rua X, Itatiba 13253-500')).toBe(null)
  })

  it('CEP com coordenadas (BrasilAPI) vem primeiro, com o número digitado', async () => {
    const fetchImpl = router({
      'brasilapi.com.br/api/cep/v2/13253500': { cep: '13253500', state: 'SP', city: 'Itatiba', neighborhood: 'Centro', street: 'Avenida Maria de Lourdes Abreu', location: { coordinates: { latitude: '-23.0059', longitude: '-46.8389' } } },
      'photon.komoot.io': { features: [] },
      nominatim: []
    })
    const r = await geocodeAll('13253-500, 95', { fetchImpl, now: 1e12 })
    expect(r[0]).toEqual({ formatted: 'Avenida Maria de Lourdes Abreu, 95, Centro, Itatiba - SP, 13253-500', lat: -23.0059, lon: -46.8389, partial: false, source: 'cep' })
  })

  it('CEP sem coordenadas: ViaCEP de reserva e a rua localizada no OpenStreetMap', async () => {
    const fetchImpl = router({
      brasilapi: () => json({ message: 'not found' }, 404),
      'viacep.com.br/ws/13214000': { logradouro: 'Rua Ângelo Pianta', bairro: 'Jardim Tannus', localidade: 'Jundiaí', uf: 'SP' },
      'photon.komoot.io': PHOTON,
      nominatim: []
    })
    const r = await geocodeAll('13214-000', { fetchImpl, mode: 'suggest' })
    expect(r[0]).toMatchObject({ source: 'cep', formatted: 'Rua Ângelo Pianta, Jardim Tannus, Jundiaí - SP, 13214-000', lat: -23.2014, partial: true })
  })

  it('Photon e Nominatim: formata no padrão brasileiro, ignora outro país e tira repetidos', async () => {
    const fetchImpl = router({ 'photon.komoot.io': PHOTON, 'nominatim.openstreetmap.org': NOMINATIM })
    const r = await geocodeAll('Residencial Cenário, Jardim Tannus, Jundiaí', { fetchImpl, now: 2e12 })
    expect(r.map((x) => x.formatted)).toEqual([
      'Residencial Cenário - Rua Ângelo Pianta, Jardim Tannus, Jundiaí - SP, 13214-000',
      'Jardim Tannus, Jundiaí - SP'
    ])
    expect(r.some((x) => x.formatted.includes('Buenos Aires'))).toBe(false)
    // sugestões: só Photon (rápido), sem Nominatim
    const f2 = router({ 'photon.komoot.io': PHOTON, nominatim: () => { throw new Error('não devia chamar') } })
    expect((await geocodeAll('Residencial Cenário', { fetchImpl: f2, mode: 'suggest' })).length).toBe(2)
  })

  it('ordena pelo que mais combina (palavras, número, exatidão)', () => {
    const q = 'Rua das Flores, 120, Itatiba'
    const a = { formatted: 'Rua das Flores, Centro, Itatiba - SP', partial: true, source: 'osm', lat: 1, lon: 1 }
    const b = { formatted: 'Rua das Flores, 120, Centro, Itatiba - SP', partial: false, source: 'osm', lat: 1.5, lon: 1 }
    const c = { formatted: 'Rua das Palmeiras, Campinas - SP', partial: true, source: 'osm', lat: 2, lon: 2 }
    expect(score(b, q)).toBeGreaterThan(score(a, q))
    expect(mergeResults([[c, a], [b]], q).map((x) => x.formatted)).toEqual([b.formatted, a.formatted, c.formatted])
  })

  it('serviço fora do ar: sem resultados, sem erro', async () => {
    const r = await geocodeAll('Rua Tal, 10, Jundiaí', { fetchImpl: async () => { throw new Error('rede') }, now: 3e12 })
    expect(r).toEqual([])
  })

  it('minha localização: endereço pelas coordenadas', async () => {
    const r = await reverseGeocode(-23.2014, -46.9216, router({ 'photon.komoot.io/reverse': { features: [PHOTON.features[0]] } }))
    expect(r.formatted).toBe('Residencial Cenário - Rua Ângelo Pianta, Jardim Tannus, Jundiaí - SP, 13214-000')
  })

  it('a função busca endereços mesmo sem chave de rotas; sugestão e localização', async () => {
    const req = (query) => ({ method: 'GET', query, headers: { host: 'app.test' } })
    const fetchImpl = router({ 'photon.komoot.io/api': PHOTON, 'photon.komoot.io/reverse': { features: [PHOTON.features[0]] }, nominatim: [] })
    const s = await handleRoute(req({ q: 'Residencial Cenário', modo: 'sugestao' }), { env: {}, fetchImpl })
    expect(s.status).toBe(200)
    expect(s.body.results[0].source).toBe('osm')
    const loc = await handleRoute(req({ lat: '-23.2014', lon: '-46.9216' }), { env: {}, fetchImpl })
    expect(loc.body.results[0].formatted).toContain('Rua Ângelo Pianta')
    expect((await handleRoute(req({ lat: '999', lon: '0' }), { env: {}, fetchImpl })).status).toBe(400)
    expect((await handleRoute({ method: 'POST', body: { points: [] }, headers: { host: 'app.test' } }, { env: {}, fetchImpl })).status).toBe(503)
  })
})
