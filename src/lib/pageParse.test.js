import { describe, it, expect } from 'vitest'
import { parseRacePage, textDistances, textDates, largadaTime } from './pageParse.js'
import { assertPublicUrl } from '../../api/preview.js'

const jsonLdPage = `<!doctype html><html><head><title>Meia de Jundiaí 2027 | Sympla</title>
<meta property="og:title" content="Meia de Jundia&iacute; 2027 | Sympla">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"Meia Maratona de Jundiaí 2027",
"startDate":"2027-04-18T07:00:00-03:00","location":{"@type":"Place","name":"Parque da Cidade","address":{"@type":"PostalAddress","streetAddress":"Av. Jundiaí, 1000","addressLocality":"Jundiaí","addressRegion":"SP"}},
"organizer":{"@type":"Organization","name":"Jundiaí Esportes"},"offers":[{"@type":"Offer","price":"149.90"},{"@type":"Offer","price":"119.90"}],
"description":"Percursos de 5 km, 10 km e meia maratona (21,1 km)."}</script></head><body><h1>Meia</h1></body></html>`

const textPage = `<html><head><title>Corrida das Flores - Ticket Sports</title>
<meta property="og:description" content="Dia 15/03/2027 em Holambra - SP. Percursos 5K e 10K.">
</head><body><div>Largada às 7h30 na praça central.</div><p>Kit: camiseta e medalha.</p><p>10K &bull; 5K</p>
<script>var x = "99 km"</script></body></html>`

describe('leitura da página de inscrição', () => {
  it('usa dados estruturados (JSON-LD) quando existem', () => {
    const { fields, sources } = parseRacePage(jsonLdPage, 'https://exemplo.com/meia')
    expect(fields).toMatchObject({
      name: 'Meia Maratona de Jundiaí 2027',
      date: '2027-04-18',
      startTime: '07:00',
      city: 'Jundiaí',
      state: 'SP',
      venueName: 'Parque da Cidade',
      organizer: 'Jundiaí Esportes',
      fee: 119.9,
      distances: [5, 10, 21.1],
      signupUrl: 'https://exemplo.com/meia'
    })
    expect(sources.date).toBe('estruturado')
  })
  it('sem dados estruturados, usa título, descrição e texto (e ignora scripts)', () => {
    const { fields, sources } = parseRacePage(textPage)
    expect(fields.name).toBe('Corrida das Flores')
    expect(fields.date).toBe('2027-03-15')
    expect(fields.city).toBe('Holambra')
    expect(fields.state).toBe('SP')
    expect(fields.distances).toEqual([5, 10])
    expect(fields.startTime).toBe('07:30')
    expect(fields.fee).toBeUndefined()
    expect(sources.date).toBe('texto')
  })
  it('página sem nada útil não inventa dados', () => {
    const { fields } = parseRacePage('<html><body>Página não encontrada</body></html>')
    expect(fields).toEqual({})
  })
  it('reconhece formatos de data, distância e largada', () => {
    expect(textDates('Será em 7 de setembro de 2027 e 31/02/2027 não existe')).toEqual(['2027-09-07'])
    expect(textDistances('Maratona de SP: 42km, também 21K')).toEqual([21.1, 42.195])
    expect(textDistances('Meia maratona apenas')).toEqual([21.1])
    expect(largadaTime('Largada: 06:45')).toBe('06:45')
    expect(largadaTime('largada às 25h')).toBe(null)
  })
})

describe('proteções do leitor de links', () => {
  it('recusa endereços internos e protocolos estranhos', async () => {
    for (const u of ['http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://localhost:3000', 'file:///etc/passwd', 'ftp://x.com', 'http://user:pw@1.1.1.1/', 'nada']) {
      await expect(assertPublicUrl(u), u).rejects.toThrow()
    }
  })
  it('aceita IP público', async () => {
    await expect(assertPublicUrl('https://1.1.1.1/')).resolves.toBeTruthy()
  })
})
