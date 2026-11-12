// Rodada 13: política de privacidade e busca de endereço (sugestões ao digitar, CEP, minha localização).
// /api/route SIMULADO. Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada13.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
await browser.defaultBrowserContext().overridePermissions(BASE, ['geolocation'])
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1500)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 8000 }, s)

const calls = []
await p.setRequestInterception(true)
p.on('request', (req) => {
  const u = new URL(req.url())
  if (u.pathname !== '/api/route') return req.continue()
  const json = (body) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  calls.push(u.search)
  const q = u.searchParams.get('q') || ''
  if (u.searchParams.get('lat')) return json({ results: [{ formatted: 'Residencial Cenário - Rua Ângelo Pianta, Jardim Tannus, Jundiaí - SP', lat: -23.2014, lon: -46.9216, partial: false, source: 'osm' }] })
  if (!q) return json({ provider: 'ors', traffic: false, tolls: false, geocode: true })
  if (q.includes('13253')) return json({ results: [{ formatted: 'Avenida Maria de Lourdes Abreu, 95, Centro, Itatiba - SP, 13253-500', lat: -23.0059, lon: -46.8389, partial: false, source: 'cep' }] })
  if (q.toLowerCase().includes('eloy')) return json({ results: [{ formatted: 'Eloy Chaves, Jundiaí - SP', lat: -23.1663, lon: -46.9529, partial: true, source: 'osm' }] })
  return json({ results: [] })
})

const race = { id: 'it', name: 'Corrida em Itatiba', status: 'inscrita', date: '2099-11-08', startTime: '07:00', distanceKm: 10, city: 'Itatiba', state: 'SP' }
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, race)

// 1. Política de privacidade: pública, ligada em Ajustes e no cadastro
await p.goto(BASE + '/privacidade', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=privacy]')
for (const s of ['Política de privacidade do PaceOn', 'Sem conta, tudo fica no seu aparelho', 'Dados sensíveis', 'não vende dados', 'Supabase', 'BrasilAPI', 'Excluir minha conta', 'ANPD']) await need(s)
await p.screenshot({ path: `${SHOTS}/r13-privacidade.png`, fullPage: true })
await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
await p.waitForSelector('a[href="/privacidade"]')
ok('Política de privacidade pública em /privacidade, com link em Ajustes')

// 2. Logística: CEP do destino, sugestão enquanto digita (parada) e minha localização (casa)
await p.goto(BASE + '/corridas/it/logistica', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=destination] input')
await p.type('[data-testid=destination] input', '13253-500, 95')
await p.keyboard.press('Enter')
await p.waitForSelector('[data-testid=destination] .geo-results button')
await need('CEP')
await p.$eval('[data-testid=destination] .geo-results button', (b) => b.click())
await waitText('✓ Avenida Maria de Lourdes Abreu, 95, Centro, Itatiba - SP')
const venue = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].venueAddress)
if (!venue.startsWith('Avenida Maria de Lourdes Abreu, 95')) throw new Error('Endereço da prova: ' + venue)
ok('Destino pelo CEP (13253-500, 95) → endereço completo, salvo no cadastro da prova')

await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Adicionar parada')).click())
await p.type('#stop-label', 'Eloy Chaves')
await p.type('[data-testid=stop-place] input', 'Eloy Chaves Jundiaí')
await p.waitForSelector('[data-testid=stop-place] .geo-results button', { timeout: 5000 })
if (!calls.some((c) => c.includes('modo=sugestao'))) throw new Error('Sem sugestão automática ao digitar')
await need('aproximado')
await p.$eval('[data-testid=stop-place] .geo-results button', (b) => b.click())
await waitText('1. Eloy Chaves')
ok('Parada: sugestões aparecem enquanto digita (sem apertar Buscar), marcadas como aproximadas')

await p.setGeolocation({ latitude: -23.2014, longitude: -46.9216 })
await p.evaluate(() => [...document.querySelectorAll('[data-testid=origin] button')].find((b) => b.innerText.includes('Usar minha localização')).click())
await waitText('✓ Residencial Cenário - Rua Ângelo Pianta')
if (!calls.some((c) => c.includes('lat=-23.201400'))) throw new Error('Localização não consultada')
await p.screenshot({ path: `${SHOTS}/r13-endereco.png`, fullPage: true })
ok('Saída (casa): “Usar minha localização” encontra o endereço')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 13 passaram.')
