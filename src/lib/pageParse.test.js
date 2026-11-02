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

import { nameFromUrl } from './pageParse.js'
describe('nome pelo link (páginas montadas no navegador)', () => {
  it('transforma o final do link em nome', () => {
    expect(nameFromUrl('https://www.ravelisports.com.br/evento/corrida-encantada-itupeva-2026')).toBe('Corrida Encantada Itupeva 2026')
    expect(nameFromUrl('https://site.com/eventos/meia-maratona-de-sao-paulo/12345678')).toBe('Meia Maratona de Sao Paulo')
    expect(nameFromUrl('https://site.com/e/night-run-10k-3f9a8b7c6d5e')).toBe('Night Run 10K')
    expect(nameFromUrl('https://site.com/evento?id=99')).toBe(null)
  })
  it('página vazia (app montado no navegador) usa o link e marca a origem', () => {
    const shell = '<html><head><title>Raveli Sports</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>'
    const { fields, sources } = parseRacePage(shell, 'https://www.ravelisports.com.br/evento/corrida-encantada-itupeva-2026')
    expect(fields.name).toBe('Corrida Encantada Itupeva 2026')
    expect(sources.name).toBe('link')
    expect(fields.date).toBeUndefined()
  })
  it('não troca um título real pelo link', () => {
    const page = '<html><head><title>Corrida Encantada de Itupeva | Raveli Sports</title></head></html>'
    expect(parseRacePage(page, 'https://www.ravelisports.com.br/evento/xyz-abc').fields.name).toBe('Corrida Encantada de Itupeva')
  })
})

import { cityFromWords, urlWords } from './cities.js'
describe('cidade pelo link', () => {
  const city = (u) => cityFromWords(urlWords(u))
  it('acha o município (com acento e UF oficiais)', () => {
    expect(city('https://www.ravelisports.com.br/evento/corrida-encantada-itupeva-2026')).toMatchObject({ city: 'Itupeva', state: 'SP' })
    expect(city('https://x.com/e/meia-maratona-de-sao-paulo-2027')).toMatchObject({ city: 'São Paulo', state: 'SP' })
    expect(city('https://x.com/corrida-rio-de-janeiro')).toMatchObject({ city: 'Rio de Janeiro', state: 'RJ' })
  })
  it('não confunde palavras comuns em nomes de prova com cidades', () => {
    expect(city('https://x.com/e/corrida-de-natal-2026')).toBe(null)
    expect(city('https://x.com/e/maratona-do-rio-2027')).toBe(null)
    expect(city('https://x.com/e/corrida-da-vitoria-10k')).toBe(null)
  })
  it('nome repetido em vários estados: sugere a cidade e deixa a UF para escolher', () => {
    expect(city('https://x.com/e/night-run-bom-jesus')).toMatchObject({ city: 'Bom Jesus', state: '' })
  })
  it('entra na leitura da página quando ela não traz a cidade', () => {
    const shell = '<html><head><title>Raveli Sports</title></head><body><div id="root"></div></body></html>'
    const { fields, sources } = parseRacePage(shell, 'https://www.ravelisports.com.br/evento/corrida-encantada-itupeva-2026')
    expect(fields).toMatchObject({ name: 'Corrida Encantada Itupeva 2026', city: 'Itupeva', state: 'SP' })
    expect(sources.city).toBe('link')
  })
  it('a cidade da própria página tem prioridade sobre a do link', () => {
    const page = '<html><head><meta property="og:description" content="Dia 10/05/2027 em Jundiaí - SP"></head></html>'
    expect(parseRacePage(page, 'https://x.com/e/corrida-itupeva').fields.city).toBe('Jundiaí')
  })
})
