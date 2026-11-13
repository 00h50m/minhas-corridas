// Rodada 14: Pessoas e lugares (cadastro), paradas "Buscar alguém", aviso no WhatsApp com o horário,
// quem vai junto na prova. /api/route SIMULADO. Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada14.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1800)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 8000 }, s)
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v) }
const profile = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).data)
const searchPick = async (tid, text) => {
  await typeIn(`[data-testid=${tid}] input[aria-label]`, text)
  await click(`[data-testid=${tid}] button`, 'Buscar')
  await p.waitForSelector(`[data-testid=${tid}] .geo-results button`)
  await p.$eval(`[data-testid=${tid}] .geo-results button`, (b) => b.click())
  await wait(250)
}

const GEO = {
  'rua das acacias': { formatted: 'Rua das Acácias, 120, Eloy Chaves, Jundiaí - SP', lat: -23.1663, lon: -46.9529 },
  'academia': { formatted: 'Av. Nove de Julho, 1500, Jundiaí - SP', lat: -23.19, lon: -46.89 },
  'portal': { formatted: 'Rua Ipês, 45, Portal do Medeiros, Jundiaí - SP', lat: -23.1501, lon: -46.9136 },
  'maria de lourdes': { formatted: 'Av. Maria de Lourdes Abreu, 95, Itatiba - SP', lat: -23.0059, lon: -46.8389 },
  'casa': { formatted: 'Rua da Casa, 1, Jundiaí - SP', lat: -23.2, lon: -46.92 }
}
await p.setRequestInterception(true)
p.on('request', (req) => {
  const u = new URL(req.url())
  if (u.pathname !== '/api/route') return req.continue()
  const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  const q = (u.searchParams.get('q') || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (req.method() === 'POST') return json({ provider: 'ors', legs: Array.from({ length: JSON.parse(req.postData()).points.length - 1 }, (_, i) => ({ distanceKm: 10, durationMin: [12, 15, 29][i] ?? 20, trafficMin: null })), polyline: '', points: [], tolls: null, traffic: false })
  if (!q) return json({ provider: 'ors', traffic: false, tolls: false, geocode: true })
  const hit = Object.entries(GEO).find(([k]) => q.includes(k))
  return json({ results: hit ? [{ ...hit[1], partial: false, source: 'osm' }] : [] })
})

const race = { id: 'it', name: 'Corrida em Itatiba', status: 'inscrita', date: '2099-11-08', startTime: '07:00', distanceKm: 10, city: 'Itatiba', state: 'SP', venueAddress: 'Av. Maria de Lourdes Abreu, 95' }
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { name: 'Giovanna', nickname: 'Gi' }, avatar: null, updatedAt: new Date().toISOString() })) }, race)

// 1. Perfil → Pessoas e lugares
await p.goto(BASE + '/perfil', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=people-link]', (a) => a.click())
await p.waitForFunction(() => location.pathname === '/pessoas-e-lugares')
// lugar
await click('button', 'Adicionar lugar')
await typeIn('#new-place-name', 'Academia')
await typeIn('#new-place-dwell', '10')
await searchPick('new-place', 'Academia Nove de Julho')
await click('[data-testid=place-form] button', 'Salvar lugar')
await waitText('★ Academia')
// pessoa com endereço novo
await click('button', 'Adicionar pessoa')
await typeIn('#pn-novo', 'Ana Souza')
await typeIn('#pt-novo', '(11) 98888-7777')
await p.select('#pl-novo', '__novo')
await searchPick('person-place', 'Rua das Acacias, 120, Jundiai')
await click('[data-testid=person-form] button', 'Salvar')
await waitText('Ana Souza')
// pessoa sem endereço
await click('button', 'Adicionar pessoa')
await typeIn('#pn-novo', 'Bia')
await click('[data-testid=person-form] button', 'Salvar')
await waitText('Sem telefone nem endereço')
let pr = await profile()
if (pr.people.length !== 2 || pr.favorites.map((f) => f.label).join('|') !== 'Academia|Casa da Ana' || pr.people[0].placeId !== pr.favorites[1].id) throw new Error('Cadastro: ' + JSON.stringify(pr.people) + JSON.stringify(pr.favorites.map((f) => f.label)))
await p.screenshot({ path: `${SHOTS}/r14-pessoas.png`, fullPage: true })
ok('Pessoas e lugares: Academia (parada 10 min), Ana com telefone e “Casa da Ana” criada, Bia só com nome')

// 2. Salvar o perfil não apaga pessoas e lugares
await p.goto(BASE + '/perfil', { waitUntil: 'networkidle0' })
await click('button', 'Salvar perfil')
await wait(300)
pr = await profile()
if (pr.people.length !== 2 || pr.favorites.length !== 2) throw new Error('Perfil apagou pessoas/lugares')
ok('Salvar o perfil preserva pessoas e lugares')

// 3. Logística: paradas pelas pessoas e lugares
await p.goto(BASE + '/corridas/it/logistica', { waitUntil: 'networkidle0' })
await searchPick('origin', 'Casa da Gi')
await click('button', 'Adicionar parada')
await p.waitForSelector('[data-testid=stop-quick]')
await click('[data-testid=stop-quick] button', 'Ana Souza')
await waitText('1. Buscar Ana Souza')
await click('button', 'Adicionar parada')
await click('[data-testid=stop-quick] button', 'Bia')
await waitText('Onde buscar Bia')
await searchPick('stop-place', 'Rua Ipes, 45, Portal do Medeiros')
await waitText('2. Buscar Bia')
pr = await profile()
if (!pr.people.find((x) => x.name === 'Bia').placeId) throw new Error('Endereço da Bia não guardado')
const stops = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].logistics.outbound.stops)
if (stops.map((s) => `${s.label}:${s.dwellMin}:${!!s.personId}`).join('|') !== 'Buscar Ana Souza:5:true|Buscar Bia:5:true') throw new Error('Paradas: ' + JSON.stringify(stops))
ok('Paradas com um toque: “Buscar Ana Souza” (endereço salvo) e “Buscar Bia” (endereço pedido e guardado para ela)')

// 4. Agenda com aviso no WhatsApp
await click('[data-testid=route-ida] button', 'Calcular rota')
await p.waitForSelector('[data-testid=legs]')
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Agenda').click())
await p.$eval('[data-testid=gen-agenda]', (b) => b.click())
await p.waitForSelector('[data-testid=pickups]')
const links = await p.$$eval('[data-testid=wa-link]', (as) => as.map((a) => decodeURIComponent(a.href)))
// 07:00 −45 −10 −(12+15+29) −10 paradas −10 margem = sair 04:49 → Ana 05:01, Bia 05:21
if (!links[0].startsWith('https://wa.me/5511988887777?text=Oi, Ana! Passo aí às 05:01 para a Corrida em Itatiba (08/11). Largada às 07:00.')) throw new Error('Link da Ana: ' + links[0])
if (!links[1].startsWith('https://wa.me/?text=Oi, Bia! Passo aí às 05:21')) throw new Error('Link da Bia: ' + links[1])
await need('Sem telefone cadastrado')
await p.screenshot({ path: `${SHOTS}/r14-avisar.png`, fullPage: true })
ok('Agenda: “Avisar quem você vai buscar” com WhatsApp pronto (Ana às 05:01 com o número; Bia às 05:21 escolhendo o contato)')

// 5. Quem vai junto na prova
await p.goto(BASE + '/corridas/it/editar', { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await click('[data-testid=companions] button', 'Ana Souza')
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Salvar alterações')).click())
await p.waitForFunction(() => location.pathname === '/corridas/it')
await need('Companhia')
await need('Ana Souza')
ok('Prova: “Quem vai junto” com as pessoas cadastradas, mostrado no detalhe')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 14 passaram.')
