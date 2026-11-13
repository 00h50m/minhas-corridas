// Rodada 16: logística — o caso dos trechos de 0 km (Health Care Run). /api/route SIMULADO: as distâncias
// abaixo são fictícias; o teste confere o comportamento do app, não a rota real.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada16.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r16-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s, timeout = 8000) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout }, s)
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v) }
const legRows = () => p.$$eval('[data-testid=legs] tbody tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].logistics)

// Endereços → coordenadas confirmadas (fictícias, distintas)
const GEO = {
  'jose joaquim pedro': [-23.1650, -46.8990],
  'frederico ozanan': [-23.1760, -46.8920],
  'manoel fagundes cotrim': [-23.1600, -46.9400],
  'beija-flor': [-23.1500, -46.9140]
}
// Distância simulada de cada trecho: depende só do par de pontos (para conferir a associação aos pares).
const fakeLeg = (a, b) => {
  const m = Math.round(Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 102000) * 1.3)
  return { distanceKm: Math.round(m / 10) / 100, durationMin: Math.round(m / 13.5 / 60), trafficMin: null, distanceM: m, durationSec: Math.round(m / 13.5) }
}
const posts = []
let slowNext = 0
let failNext = false
await p.setRequestInterception(true)
p.on('request', async (r) => {
  const u = new URL(r.url())
  if (u.pathname !== '/api/route') return r.continue()
  const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(b) })
  if (r.method() === 'POST') {
    const body = JSON.parse(r.postData())
    posts.push(body.points)
    if (failNext) { failNext = false; return json({ error: 'O serviço de rotas recusou a consulta. (Quota exceeded)' }, 502) }
    const delay = slowNext
    slowNext = 0
    if (delay) await wait(delay)
    const pts = body.points
    return json({ provider: 'ors', legs: pts.slice(1).map((b, i) => fakeLeg(pts[i], b)), polyline: '', points: pts.map((x) => ({ lat: x.lat, lon: x.lon })), tolls: null, traffic: false, fetchedAt: new Date().toISOString() })
  }
  const q = (u.searchParams.get('q') || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!q) return json({ provider: 'ors', traffic: false, tolls: false, geocode: true })
  const coords = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/.exec(q)
  if (coords) return json({ results: [{ formatted: `Acesso ao estacionamento · ${coords[1]}, ${coords[2]}`, lat: Number(coords[1]), lon: Number(coords[2]), partial: false, precision: 'ponto', source: 'coords' }] })
  const hit = Object.entries(GEO).find(([k]) => q.includes(k))
  return json({ results: hit ? [{ formatted: u.searchParams.get('q'), lat: hit[1][0], lon: hit[1][1], partial: false, precision: 'numero', source: 'cep' }] : [] })
})

// Estado do print: os 4 primeiros pontos com a MESMA coordenada (centro de Jundiaí) e uma rota com 0 km.
const centro = { lat: -23.1857, lon: -46.8978 }
const A = {
  casa: 'Avenida José Joaquim Pedro, 580, Vila Rio Branco, Jundiaí - SP, 13215-425',
  dani: 'Avenida Antônio Frederico Ozanan, 2111, Ponte de São João, Jundiaí - SP, 13218-000',
  eloy: 'Rua Manoel Fagundes Cotrim, 238, Jardim Tannus, Jundiaí - SP, 13212-062',
  portal: 'Rua Beija-Flor, 250, Portal do Medeiros, Jundiaí - SP, 13212-812',
  pac: 'Avenida Indústrias, Vinhedo, SP, Brazil'
}
const race = {
  id: 'hc', name: 'Health Care Run', status: 'inscrita', date: '2099-11-15', startTime: '07:00', distanceKm: 5, city: 'Vinhedo', state: 'SP', venueAddress: A.pac,
  logistics: {
    origin: { label: 'Casa', address: A.casa, formatted: A.casa, ...centro },
    destination: { label: 'estacionamento de ônibus da PAC Volkswagen', address: A.pac, formatted: A.pac, lat: -23.0400, lon: -46.9800, precision: 'rua' },
    outbound: {
      stops: [['s1', 'Dani', A.dani], ['s2', 'Eloy Chaves', A.eloy], ['s3', 'Portal do Medeiros', A.portal]].map(([id, label, address]) => ({ id, label, address, formatted: address, ...centro, dwellMin: 5 })),
      route: { provider: 'ors', legs: [{ distanceKm: 0, durationMin: 0 }, { distanceKm: 0, durationMin: 0 }, { distanceKm: 0, durationMin: 0 }, { distanceKm: 22.07, durationMin: 20 }], key: [A.casa, A.dani, A.eloy, A.portal, A.pac].map((x) => x.toLowerCase()).join(' | '), fetchedAt: '2026-11-13T03:46:00Z' }
    }
  }
}
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { favorites: [{ id: 'f1', label: 'Casa', address: r.logistics.origin.address, formatted: r.logistics.origin.address, lat: -23.1857, lon: -46.8978 }] }, avatar: null, updatedAt: new Date().toISOString() })) }, race)

// 1. O estado do print: nada de "0 km / 0 min"; aponta os pontos repetidos
await p.goto(BASE + '/corridas/hc/logistica', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=collapsed]')
await need('Casa, Dani, Eloy Chaves e Portal do Medeiros estão no mesmo ponto do mapa')
if (await p.$('[data-testid=legs]')) throw new Error('Mostrou a tabela de trechos com a rota inválida')
await wait(1200)
if (posts.length) throw new Error('Chamou o serviço de rotas com pontos repetidos')
await shot('pontos-repetidos')
ok('Rota salva com 0 km descartada; aviso: “Casa, Dani, Eloy Chaves e Portal do Medeiros estão no mesmo ponto do mapa”; sem chamar o serviço')

// 2. Localizar de novo → coordenadas confirmadas → rota recalculada sozinha, 5 pontos na ordem
await p.$eval('[data-testid=relocate]', (b) => b.click())
await p.waitForSelector('[data-testid=legs]', { timeout: 10000 })
if (posts.length !== 1) throw new Error('Esperava 1 chamada de rota, houve ' + posts.length)
const sent = posts[0]
const want = [GEO['jose joaquim pedro'], GEO['frederico ozanan'], GEO['manoel fagundes cotrim'], GEO['beija-flor'], [-23.04, -46.98]]
if (JSON.stringify(sent.map((x) => [x.lat, x.lon])) !== JSON.stringify(want)) throw new Error('Pontos enviados: ' + JSON.stringify(sent))
let rows = await legRows()
if (rows.length !== 4 || !rows[0].startsWith('Casa → Dani') || !rows[1].startsWith('Dani → Eloy Chaves') || !rows[2].startsWith('Eloy Chaves → Portal do Medeiros') || !rows[3].startsWith('Portal do Medeiros → estacionamento')) throw new Error('Trechos: ' + rows.join(' / '))
if (rows.some((r) => / 0 0 min$/.test(r) || /\b0 min$/.test(r))) throw new Error('Trecho com 0: ' + rows.join(' / '))
const legs = sent.slice(1).map((b, i) => fakeLeg(sent[i], b))
const totM = legs.reduce((a, l) => a + l.distanceM, 0)
const totMin = Math.round(legs.reduce((a, l) => a + l.durationSec, 0) / 60)
await need(`${(Math.round(totM / 10) / 100).toLocaleString('pt-BR')} km`)
await need(`+ 15 min nas paradas = ${totMin + 15 >= 60 ? `${Math.floor((totMin + 15) / 60)} h ${String((totMin + 15) % 60).padStart(2, '0')} min` : `${totMin + 15} min`} de deslocamento`)
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).data.favorites[0])
if (prof.lat !== GEO['jose joaquim pedro'][0]) throw new Error('Favorito Casa não foi corrigido')
await shot('rota-4-trechos')
ok(`Localizar de novo: 4 coordenadas confirmadas, 1 chamada com 5 pontos na ordem, 4 trechos associados aos pares; total ${totM} m e ${totMin} min + 15 min de paradas; favorito “Casa” corrigido`)

// 3. Destino aproximado (avenida sem número): aviso e ponto exato pelas coordenadas do mapa
await need('Localização aproximada: estacionamento de ônibus da PAC Volkswagen')
await typeIn('[data-testid=destination-fix] input[aria-label]', '-23.04512, -46.97733')
await p.evaluate(() => [...document.querySelectorAll('[data-testid=destination-fix] button')].find((b) => b.innerText === 'Buscar').click())
await p.waitForSelector('[data-testid=destination-fix] .geo-results button')
await p.$eval('[data-testid=destination-fix] .geo-results button', (b) => b.click())
await p.waitForFunction(() => !document.querySelector('[data-testid=approx]'))
await p.waitForFunction((n) => document.querySelectorAll('[data-testid=legs] tbody tr').length === 4 && window.__n !== n, {}, posts.length)
await wait(800)
if (posts.length !== 2 || posts[1][4].lat !== -23.04512) throw new Error('Não recalculou com o ponto exato do destino: ' + JSON.stringify(posts.at(-1)))
ok('Destino “Avenida Indústrias, Vinhedo” marcado como aproximado; coordenadas coladas do mapa viram o ponto exato e a rota recalcula')

// 4. Só a permanência muda → totais mudam, sem chamar o serviço
const before = posts.length
await typeIn('input[aria-label="Minutos em Dani"]', '10')
await wait(1200)
if (posts.length !== before) throw new Error('Mudar a permanência chamou o serviço de rotas')
await need('+ 20 min nas paradas')
ok('Permanência de Dani 5 → 10 min: total atualizado (20 min de paradas) sem nova consulta')

// 5. Ordem muda duas vezes seguidas; a 1ª resposta chega DEPOIS da 2ª e é descartada
slowNext = 2500
await p.evaluate(() => document.querySelectorAll('[data-testid=stops] button[aria-label=Subir]')[1].click()) // Eloy sobe
await wait(900) // a 1ª consulta (lenta) já saiu
await p.evaluate(() => document.querySelectorAll('[data-testid=stops] button[aria-label=Descer]')[0].click()) // volta Dani, Eloy
await wait(4000)
const orderOf = (pts) => pts.slice(1, 4).map((x) => x.lat)
// Ao desfazer, a rota salva já é a da ordem atual: não precisa de nova consulta.
if (posts.length !== before + 1) throw new Error('Esperava 1 consulta nova, houve ' + (posts.length - before))
if (orderOf(posts[before])[0] !== GEO['manoel fagundes cotrim'][0]) throw new Error('1ª consulta não tinha Eloy primeiro')
rows = await legRows()
if (!rows[0].startsWith('Casa → Dani') || !rows[1].startsWith('Dani → Eloy Chaves')) throw new Error('A resposta antiga sobrescreveu: ' + rows.join(' / '))
const log = await stored()
if (!log.outbound.route.key.startsWith(A.casa.toLowerCase()) || log.outbound.route.key.indexOf('ozanan') > log.outbound.route.key.indexOf('cotrim')) throw new Error('Rota salva é da ordem antiga')
ok('Ordem alterada (Eloy antes de Dani) e desfeita antes da resposta: a resposta atrasada da ordem antiga é descartada; vale a rota da ordem atual')

// 6. Erro do serviço: mensagem específica, sem 0 km; tentar de novo
failNext = true
await p.evaluate(() => document.querySelectorAll('[data-testid=stops] button[aria-label=Subir]')[2].click()) // Portal sobe
await waitText('Quota exceeded')
if (await p.$('[data-testid=legs]')) throw new Error('Mostrou trechos antigos depois do erro')
await need('4 trechos a calcular')
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Calcular rota').click())
await p.waitForSelector('[data-testid=legs]')
rows = await legRows()
if (!rows[1].startsWith('Dani → Portal do Medeiros') || !rows[2].startsWith('Portal do Medeiros → Eloy Chaves')) throw new Error('Ordem após erro: ' + rows.join(' / '))
ok('Erro do serviço: mensagem do motivo, nenhum trecho “0 km”; “Calcular rota” refaz na ordem atual')

// 7. Recarregar a tela: rota e paradas persistem, sem nova consulta; layout de celular sem rolagem lateral
const n = posts.length
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=legs]')
await wait(1200)
if (posts.length !== n) throw new Error('Recarregar recalculou a rota sem necessidade')
if ((await legRows()).length !== 4) throw new Error('Trechos não persistiram')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral no celular: ' + overflow + ' px')
await shot('recarregado')
ok('Recarregar: 4 trechos persistem sem nova consulta; 390 px sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 16 passaram.')
