// Rodada 42: “Vale a pena?” — nota de 0 a 100 das provas em avaliação, com critérios e perfis.
import { describe, expect, it } from 'vitest'
import { decisionInfo } from './decision.js'
import { rankByWorth, typicalPerKm, worthScore } from './worth.js'
import { normalizeRace } from './model.js'

const R = (o) => normalizeRace({ id: o.id ?? o.name, ...o })
const done = [
  R({ name: 'A', date: '2026-10-05', status: 'concluida', distanceKm: 5, fee: 100, city: 'Jundiaí', result: { netTime: 2300, officialDistanceKm: 5 } }),
  R({ name: 'B', date: '2026-10-19', status: 'concluida', distanceKm: 5, fee: 90, city: 'Jundiaí', result: { netTime: 2350, officialDistanceKm: 5 } }),
  R({ name: 'C', date: '2026-11-02', status: 'concluida', distanceKm: 5, fee: 0, city: 'Jundiaí', result: { netTime: 2320, officialDistanceKm: 5 } }),
  R({ name: 'Marcada', date: '2026-12-13', status: 'inscrita', distanceKm: 5, fee: 110, city: 'Barueri' })
]
const today = '2026-11-25'
const sp = (x) => String(x).replace(/\u00a0/g, ' ')
const score = (race, extra = {}, races = [...done, race]) => worthScore(decisionInfo(race, { races, goals: [], today }), { races, homeCity: 'Jundiaí', typical: typicalPerKm(races), ...extra })

describe('vale a pena?', () => {
  it('quanto você costuma pagar: mediana das provas pagas (gratuitas fora)', () => {
    expect(typicalPerKm(done)).toBe(20) // 100/5, 90/5, 110/5 → 18, 20, 22
  })
  it('barata, na cidade, longe de outras provas, distância nova e muita vontade → nota alta', () => {
    const w = score(R({ name: 'Nova 7k', date: '2027-01-17', status: 'interesse', distanceKm: 7, fee: 70, city: 'Jundiaí', wish: 3 }))
    expect(w.score).toBeGreaterThanOrEqual(85)
    expect(Object.fromEntries(w.parts.map((p) => [p.key, sp(p.text)]))).toMatchObject({ custo: 'R$ 10,00/km · abaixo do que você costuma pagar (R$ 20,00/km)', calendario: 'Sem outra prova num raio de 3 semanas', desafio: 'Distância nova: seus primeiros 7 km', vontade: 'Quero muito', perto: 'Na sua cidade (Jundiaí)' })
    expect(w.best.length).toBe(2)
    expect(w.provisional).toBe(false)
  })
  it('cara, colada em outra prova e em outra cidade → nota baixa, com o principal problema', () => {
    const w = score(R({ name: 'Cara', date: '2026-12-15', status: 'aberta', distanceKm: 5, fee: 180, city: 'São Paulo' }))
    expect(w.score).toBeLessThan(35)
    expect(sp(w.caveat)).toMatch(/R\$ 36,00\/km · acima|2 dias depois de Marcada/)
  })
  it('mesmo dia de uma prova marcada zera o calendário', () => {
    const w = score(R({ name: 'Choque', date: '2026-12-13', status: 'interesse', distanceKm: 5, fee: 60, city: 'Jundiaí' }))
    expect(w.parts.find((p) => p.key === 'calendario')).toMatchObject({ value: 0, text: 'Mesmo dia de Marcada' })
  })
  it('sem preço: nota provisória, nunca “vale mais a pena”; o selo exige nota 55+ e diferença clara', () => {
    const a = R({ name: 'Sem preço', date: '2027-02-07', status: 'interesse', distanceKm: 5, city: 'Jundiaí', wish: 3 })
    const b = R({ name: 'Com preço', date: '2027-03-07', status: 'interesse', distanceKm: 5, fee: 60, city: 'Jundiaí', wish: 2 })
    const races = [...done, a, b]
    const items = [a, b].map((r) => ({ r, w: worthScore(decisionInfo(r, { races, goals: [], today }), { races, homeCity: 'Jundiaí', typical: typicalPerKm(races) }) }))
    expect(items[0].w.provisional).toBe(true)
    expect(items[0].w.missing).toContain('preço')
    expect(rankByWorth(items).top).toBe(b.id)
    const lowOnly = [{ r: { id: 'x' }, w: { score: 30, provisional: false } }]
    expect(rankByWorth(lowOnly).top).toBeNull()
    const tie = [{ r: { id: 'x' }, w: { score: 70 } }, { r: { id: 'y' }, w: { score: 68 } }]
    expect(rankByWorth(tie).top).toBeNull()
  })
  it('o perfil muda o peso: economia valoriza a barata, desempenho a distância nova', () => {
    const barata = R({ name: 'Barata', date: '2027-01-10', status: 'interesse', distanceKm: 5, fee: 40, city: 'Jundiaí' })
    const desafio = R({ name: 'Desafio', date: '2027-01-24', status: 'interesse', distanceKm: 10, fee: 160, city: 'Campinas' })
    const races = [...done, barata, desafio]
    const run = (profile) => rankByWorth([barata, desafio].map((r) => ({ r, w: worthScore(decisionInfo(r, { races, goals: [], today }), { races, homeCity: 'Jundiaí', typical: typicalPerKm(races), profile }) })))
    expect(run('economia').sorted[0].r.name).toBe('Barata')
    expect(run('desempenho').sorted[0].r.name).toBe('Desafio')
  })
})

describe('rota recusada: o motivo sempre aparece', async () => {
  const { explain, reasonOf } = await import('../../api/route.js')
  it('lê o motivo em qualquer formato', () => {
    expect(reasonOf({ error: 'Access to this API has been disallowed' })).toBe('Access to this API has been disallowed')
    expect(reasonOf({ error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters' } })).toMatch(/^\[2010\] Could not find routable point/)
    expect(reasonOf({ message: 'Bad gateway' })).toBe('Bad gateway')
    expect(reasonOf({}, '<html><body>502 Bad Gateway</body></html>')).toBe('502 Bad Gateway')
  })
  it('traduz os casos do OpenRouteService', () => {
    expect(explain('[2010] Could not find routable point', 'x', 404)).toMatch(/longe de uma rua/)
    expect(explain('Access to this API has been disallowed', 'x', 403)).toMatch(/ORS_API_KEY/)
    expect(explain('', 'x', 401)).toMatch(/recusou a chave/)
    expect(explain('Quota exceeded', 'x', 403)).toMatch(/Limite de consultas/)
    expect(explain('[2009] Route could not be found', 'x', 404)).toMatch(/caminho de carro/)
    expect(explain('Deprecated HeiGIT API URL', 'x', 410)).toMatch(/mudou de endereço/)
    expect(explain('algo novo', 'Recusou (código 500).', 500)).toBe('Recusou (código 500). (algo novo)')
  })
})

describe('OpenRouteService no endereço novo (api.heigit.org)', () => {
  it('rota e busca usam api.heigit.org, nunca o endereço desligado', async () => {
    const { handleRoute } = await import('../../api/route.js')
    const urls = []
    const fetchImpl = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ features: [] }), { status: 200 }) }
    const req = { method: 'POST', headers: {}, query: {}, body: { points: [{ address: 'A', lat: -23.3, lon: -46.7 }, { address: 'B', lat: -23.2, lon: -46.6 }] } }
    await handleRoute(req, { env: { ORS_API_KEY: 'K' }, fetchImpl }).catch(() => {})
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith('https://api.heigit.org/openrouteservice/v2/'))).toBe(true)
  })
})
