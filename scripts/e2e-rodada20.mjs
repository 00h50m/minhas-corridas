// Rodada 20: clima na largada (Open-Meteo SIMULADO, formato real) e "como foi a logística" com sugestões.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada20.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { pointsKey } from '../src/lib/logistics.js'

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
const shot = (n) => p.screenshot({ path: `${SHOTS}/r20-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s, timeout = 8000) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout }, s)
const hm = (m) => { const r = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }

// ---------- Open-Meteo simulado ----------
const calls = { geo: [], fc: [] }
let fcStatus = 200
await p.setRequestInterception(true)
p.on('request', (r) => {
  const u = new URL(r.url())
  const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) })
  if (u.host === 'geocoding-api.open-meteo.com') {
    calls.geo.push(u.searchParams.get('name'))
    return json({ results: [{ name: 'Vinhedo', latitude: -1, longitude: -1, admin1: 'Minas Gerais' }, { name: 'Vinhedo', latitude: -23.0302, longitude: -46.9753, admin1: 'São Paulo' }] })
  }
  if (u.host === 'api.open-meteo.com') {
    calls.fc.push(u.search)
    if (fcStatus !== 200) return json({ error: true, reason: 'down' }, fcStatus)
    const date = u.searchParams.get('start_date')
    const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`)
    return json({ hourly: { time, temperature_2m: time.map((_, h) => 18 + h * 0.6), apparent_temperature: time.map((_, h) => 19 + h * 0.8), precipitation_probability: time.map((_, h) => (h >= 8 ? 60 : 20)), precipitation: time.map(() => 0), weather_code: time.map((_, h) => (h >= 8 ? 61 : 2)), wind_speed_10m: time.map(() => 12), relative_humidity_2m: time.map(() => 75) } })
  }
  if (u.host.includes('tile.openstreetmap.org')) return r.respond({ status: 204, body: '' })
  return r.continue()
})

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const now = await p.evaluate(() => { const d = new Date(); const f = (x) => x.toLocaleDateString('sv'); return { today: f(d), in3: f(new Date(d.getTime() + 3 * 864e5)), in20: f(new Date(d.getTime() + 20 * 864e5)), min: d.getHours() * 60 + d.getMinutes() } })
const seed = (races, profile = {}) => p.evaluate((races, profile) => {
  localStorage.clear()
  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] }))
  localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))
  localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: profile, avatar: null, updatedAt: new Date().toISOString() }))
}, races, profile)

// 1. Prova daqui a 3 dias em Vinhedo/SP, sem logística: a cidade certa (SP, não MG) e a previsão na largada
await seed([{ id: 'w1', name: 'Health Care Run', status: 'inscrita', date: now.in3, startTime: '07:00', distanceKm: 10, targetTime: 3300, city: 'Vinhedo', state: 'SP' }])
await p.goto(BASE + '/corridas/w1', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=weather] .wx-temp')
if (!calls.fc[0].includes('latitude=-23.0302&longitude=-46.9753')) throw new Error('Coordenadas: ' + calls.fc[0])
await need('Clima na largada')
await need('22°') // 18 + 7 × 0,6 = 22,2
await need('sensação 25°') // 19 + 7 × 0,8 = 24,6
await need('Parcialmente nublado na largada (07h)')
await need('chuva 60%') // às 08h (fim previsto 07:55 → 08h)
await need('Chance de chuva de 60%')
await need('Calor: hidrate bem')
await need('Previsão Open-Meteo para Vinhedo/SP (cidade)')
await shot('clima')
ok('Clima na largada: Vinhedo/SP (não a de MG), 22° (sensação 25°) às 07h, chuva 60% até o fim previsto, dicas de calor e chuva')

// 2. Cache: reabrir não consulta de novo; serviço fora do ar mostra a última previsão; prova fora do alcance não mostra
const n = calls.fc.length
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=weather] .wx-temp')
if (calls.fc.length !== n) throw new Error('Consultou de novo dentro de 1 h')
fcStatus = 503
await p.evaluate(() => [...document.querySelectorAll('[data-testid=weather] button')].find((b) => b.innerText === 'Atualizar').click())
await waitText('sem conexão, mostrando a última')
fcStatus = 200
await seed([{ id: 'w2', name: 'Longe', status: 'inscrita', date: now.in20, startTime: '07:00', city: 'Vinhedo', state: 'SP' }])
await p.goto(BASE + '/corridas/w2', { waitUntil: 'networkidle0' })
await wait(800)
if (await p.$('[data-testid=weather]')) throw new Error('Mostrou clima para prova daqui a 20 dias')
ok('Previsão guardada por 1 h (reabrir não consulta); serviço fora do ar mostra a última; daqui a 20 dias não aparece')

// 3. Como foi a logística: marcações do dia × plano, sugestões e “Aplicar”
const P = {
  casa: { label: 'Casa', address: 'Avenida José Joaquim Pedro, 580, Jundiaí - SP', lat: -23.17092, lon: -46.87713, precision: 'manual' },
  dani: { id: 's1', label: 'Buscar Dani', address: 'Avenida Antônio Frederico Ozanan, 2111, Jundiaí - SP', lat: -23.1801, lon: -46.8933, precision: 'numero', dwellMin: 5 },
  pac: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0451, lon: -46.9773, precision: 'ponto' }
}
// Largada 07:00; trechos 10 e 30 min; parada 5; margem 10 → sair de casa 05:10 (07:00 − 45 − 10 − 40 − 5 − 10)
const race = {
  id: 'hc', name: 'Health Care Run', status: 'concluida', date: now.today, startTime: '07:00', distanceKm: 5, venueAddress: P.pac.address, city: 'Vinhedo', state: 'SP',
  logistics: { origin: P.casa, destination: P.pac, prep: {}, outbound: { stops: [P.dani], route: { provider: 'manual', legs: [{ distanceKm: 3, durationMin: 10 }, { distanceKm: 25, durationMin: 30 }], key: pointsKey([P.casa, P.dani, P.pac]) } } },
  dayLog: { date: now.today, marks: { sair: '05:18', 'chegar-0': '05:32', 'sair-0': '05:41', 'chegar-destino': '06:19' } }
}
await seed([race], { favorites: [{ id: 'f1', label: 'Casa da Dani', address: P.dani.address, lat: P.dani.lat, lon: P.dani.lon, dwellMin: 5 }] })
await p.goto(BASE + '/corridas/hc', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=logi-review]')
await need('Como foi a logística')
await need('+8 min') // saída
await need('14 min além da margem') // chegada 06:19; plano 05:55; margem 10
const rows = await p.$$eval('.lr-table tbody tr', (tr) => tr.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (!rows[0].includes('Casa → Buscar Dani') || !rows[0].includes('10 min 14 min +4 min')) throw new Error('Linha 1: ' + rows[0])
if (!rows[1].includes('Parada: Buscar Dani') || !rows[1].includes('5 min 9 min +4 min')) throw new Error('Linha 2: ' + rows[1])
if (!rows[2].includes('Buscar Dani → PAC Volkswagen') || !rows[2].includes('30 min 38 min +8 min')) throw new Error('Linha 3: ' + rows[2])
const sug = await p.$$eval('[data-testid=lr-suggestion]', (s) => s.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (sug.length !== 4) throw new Error('Sugestões: ' + sug.join(' | '))
if (!sug[0].includes('de 10 para 20 min') || !sug[1].includes('Usar 30% de acréscimo') || !sug[2].includes('Usar 9 min') || !sug[3].includes('de 10 para 25 min')) throw new Error('Sugestões: ' + sug.join(' | '))
await shot('logistica')
// Aplicar a margem e o tempo da parada
await p.evaluate(() => [...document.querySelectorAll('[data-testid=lr-suggestion]')][3].querySelector('button').click())
await waitText('✓ aplicado')
await p.evaluate(() => [...document.querySelectorAll('[data-testid=lr-suggestion]')][2].querySelector('button').click())
await wait(300)
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).data)
if (prof.prep?.bufferMin !== 25 || prof.favorites[0].dwellMin !== 9) throw new Error('Perfil: ' + JSON.stringify({ prep: prof.prep, fav: prof.favorites[0] }))
const raceAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].logistics.prep)
if (raceAfter && Object.keys(raceAfter).length && raceAfter.bufferMin !== 10) throw new Error('Mudou a prova que já passou')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Como foi a logística: saída +8, trechos +4/+8, parada +4, 14 min além da margem; “Aplicar” salva margem 25 e parada da Dani 9 min no perfil (a prova passada não muda)')

// 4. Sem lugar salvo com o endereço, não sugere tempo de parada; tudo certo → mensagem de sucesso
await seed([{ ...race, dayLog: { date: now.today, marks: { sair: '05:10', 'chegar-0': '05:20', 'sair-0': '05:25', 'chegar-destino': '05:56' } } }])
await p.goto(BASE + '/corridas/hc', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=lr-ok]')
ok('Plano cumprido: “O plano funcionou: nada a ajustar”')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 20 passaram.')
