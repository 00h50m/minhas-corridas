// Rodada 11: logística (rota com paradas, custos, kit, agenda, modo dia, .ics, offline e modo manual).
// Cenário: Corrida em Itatiba. O serviço de rotas (/api/route) é SIMULADO: distâncias e tempos são de teste.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada11.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'downloads-r11')
fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const errors = []

// Respostas simuladas do serviço de rotas
const GEO = {
  'residencial cenário': { formatted: 'Residencial Cenário - Jardim Tannus, Jundiaí - SP', lat: -23.2014, lon: -46.9216 },
  'eloy chaves': { formatted: 'Eloy Chaves, Jundiaí - SP', lat: -23.1663, lon: -46.9529 },
  'portal do medeiros': { formatted: 'Portal do Medeiros, Jundiaí - SP', lat: -23.1501, lon: -46.9136 },
  'maria de lourdes abreu': { formatted: 'Av. Maria de Lourdes Abreu, 95 - Itatiba - SP', lat: -23.0059, lon: -46.8389 },
  'shopping': { formatted: 'Itatiba Shopping - Itatiba - SP', lat: -23.0122, lon: -46.8466 }
}
const LEGS_IDA = [{ distanceKm: 6.2, durationMin: 11, trafficMin: 12 }, { distanceKm: 8.4, durationMin: 14, trafficMin: 15 }, { distanceKm: 24.7, durationMin: 27, trafficMin: 29 }]
const routeCalls = []
function mockRoutes(p, { provider = 'google' } = {}) {
  p.on('request', (req) => {
    const u = new URL(req.url())
    if (u.pathname !== '/api/route') return req.continue()
    const json = (status, body) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (!provider) return json(200, { provider: null, traffic: false, tolls: false })
    if (req.method() === 'GET' && !u.searchParams.get('q')) return json(200, { provider, traffic: true, tolls: true })
    if (req.method() === 'GET') {
      const q = u.searchParams.get('q').toLowerCase()
      const hit = Object.entries(GEO).find(([k]) => q.includes(k))
      return json(200, { results: hit ? [{ ...hit[1], partial: false }] : [] })
    }
    const body = JSON.parse(req.postData())
    routeCalls.push(body)
    const n = body.points.length - 1
    const ida = n === 3 && !body.points[0].address.includes('Maria de Lourdes')
    const legs = ida ? LEGS_IDA : Array.from({ length: n }, () => ({ distanceKm: 20, durationMin: 25, trafficMin: null }))
    const pts = body.points.map((x, i) => ({ lat: x.lat ?? -23.1 + i * 0.03, lon: x.lon ?? -46.9 + i * 0.02 }))
    return json(200, { provider: 'google', legs, polyline: '', points: pts, tolls: ida ? { amount: 6.4, currency: 'BRL' } : null, hasTolls: ida, traffic: true, fetchedAt: new Date().toISOString() })
  })
}

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const race = { id: 'it', name: 'Corrida em Itatiba', status: 'inscrita', date: iso(1), startTime: '07:00', distanceKm: 10, city: 'Itatiba', state: 'SP', venueAddress: 'Av. Maria de Lourdes Abreu, 95', bibNumber: '321', kitPickupAddress: 'Itatiba Shopping', kitPickupDate: iso(0), kitPickupTime: '18:00', fee: 120 }

async function newPage(opts = {}) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_/.test(m.text()) && errors.push(m.text()))
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await p.setRequestInterception(true)
  mockRoutes(p, opts)
  const cdp = await p.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id })
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, race)
  return { p, ctx }
}
const T = (p) => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (p, s) => { const t = await T(p); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (p, s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 10000 }, s)
const click = async (p, sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.replace(/ /g, ' ').trim().toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const typeIn = async (p, sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v) }
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0])
const tab = (p, name) => click(p, '[role=tab]', name)
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/r11-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })

const { p } = await newPage()

// 1. Do detalhe da prova para a logística
await p.goto(BASE + '/corridas/it', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=logistics-cta]')
await p.$eval('[data-testid=logistics-cta]', (a) => a.click())
await p.waitForFunction(() => location.pathname === '/corridas/it/logistica')
await p.waitForSelector('[data-testid=origin]')
ok('Detalhe da prova → Planejar como chegar → Logística')

// 2. Origem verificada e salva como favorita
await typeIn(p, '[data-testid=origin] input[aria-label]', 'Residencial Cenário, Jardim Tannus, Jundiaí')
await click(p, '[data-testid=origin] button', 'Verificar')
await p.waitForSelector('[data-testid=origin] .geo-results button')
await p.$eval('[data-testid=origin] .geo-results button', (b) => b.click())
await waitText(p, '✓ Residencial Cenário - Jardim Tannus')
await click(p, '[data-testid=origin] button', 'Salvar nos favoritos')
await typeIn(p, '[data-testid=origin] .fav-name input', 'Casa')
await click(p, '[data-testid=origin] .fav-name button', 'Salvar')
const fav = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).data.favorites)
if (fav.length !== 1 || fav[0].label !== 'Casa' || fav[0].lat == null) throw new Error('Favorito não salvo: ' + JSON.stringify(fav))
ok('Origem verificada (endereço completo) e salva nos favoritos como “Casa”')

// 3. Duas paradas, com reordenação
async function addStop(label, address) {
  await click(p, 'button', 'Adicionar parada')
  await typeIn(p, '#stop-label', label)
  await typeIn(p, '[data-testid=stop-place] input[aria-label]', address)
  await click(p, '[data-testid=stop-place] button', 'Verificar')
  await p.waitForSelector('[data-testid=stop-place] .geo-results button')
  await p.$eval('[data-testid=stop-place] .geo-results button', (b) => b.click())
  await wait(250)
}
await addStop('Portal do Medeiros', 'Portal do Medeiros, Jundiaí')
await addStop('Eloy Chaves', 'Eloy Chaves, Jundiaí')
let order = await p.$$eval('[data-testid=stops] li b', (bs) => bs.map((b) => b.innerText))
if (order.join('|') !== '1. Portal do Medeiros|2. Eloy Chaves') throw new Error('Ordem inicial: ' + order)
await p.$$eval('[data-testid=stops] li', (lis) => lis[1].querySelector('[aria-label=Subir]').click())
await wait(250)
order = await p.$$eval('[data-testid=stops] li b', (bs) => bs.map((b) => b.innerText))
if (order.join('|') !== '1. Eloy Chaves|2. Portal do Medeiros') throw new Error('Reordenar falhou: ' + order)
ok('Paradas: Eloy Chaves e Portal do Medeiros, reordenadas (5 min em cada)')

// 4. Destino = local da prova (confirmado) e rota calculada
await need(p, 'Av. Maria de Lourdes Abreu, 95, Itatiba/SP')
await p.$eval('[data-testid=destination] input[aria-label]', (el) => el.focus())
await click(p, '[data-testid=destination] button', 'Verificar')
await p.waitForSelector('[data-testid=destination] .geo-results button')
await p.$eval('[data-testid=destination] .geo-results button', (b) => b.click())
await waitText(p, '✓ Av. Maria de Lourdes Abreu, 95 - Itatiba')
await click(p, '[data-testid=route-ida] button', 'Calcular rota')
await p.waitForSelector('[data-testid=legs]')
const call = routeCalls.at(-1)
if (call.points.length !== 4 || call.points[1].address !== 'Eloy Chaves, Jundiaí - SP' || !call.departureAt) throw new Error('Pedido de rota errado: ' + JSON.stringify(call))
await need(p, '39,3 km')
await need(p, '56 min com trânsito previsto')
await need(p, 'pedágios estimados: R$ 6,40')
await p.waitForSelector('[data-testid=route-map] .leaflet-marker-icon')
const markers = await p.$$eval('[data-testid=route-map] .leaflet-marker-icon', (m) => m.length)
if (markers !== 4) throw new Error('Marcadores no mapa: ' + markers)
const gmaps = await p.$eval('a[href^="https://www.google.com/maps/dir/"]', (a) => decodeURIComponent(a.href))
if (!gmaps.includes('waypoints=-23.1663,-46.9529|-23.1501,-46.9136')) throw new Error('Link do Google Maps: ' + gmaps)
await shot(p, 'ida')
ok('Rota da ida: 3 trechos (39,3 km, 56 min com trânsito), pedágio da rota, mapa com 4 pontos e link do Google Maps com as paradas')

// 5. Volta (mesmas paradas, ao contrário)
await tab(p, 'Volta')
await waitText(p, 'As mesmas da ida, ao contrário: Portal do Medeiros → Eloy Chaves')
await p.$eval('#back-depart', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, '09:30')
await wait(200)
await click(p, '[data-testid=route-volta] button', 'Calcular rota')
await waitText(p, 'chegada prevista em casa às 10:55')
ok('Volta: paradas na ordem inversa, saindo 09:30 → em casa 10:55 (3 trechos de 25 min + 10 min de paradas)')

// 6. Kit em outro dia
await tab(p, 'Kit')
await p.$eval('[data-testid=kit-enable]', (el) => el.click())
await wait(250)
await click(p, '[data-testid=route-kit] button', 'Calcular rota')
await waitText(p, 'saia às 17:25')
ok('Kit: trajeto separado (ida e volta) em outro dia; para chegar às 18:00 com margem, sair 17:25')

// 7. Custos: veículo e fórmula; Transporte da prova
await tab(p, 'Custos')
await typeIn(p, '#v-kml', '7')
await p.$eval('#v-kml', (el) => el.blur())
await typeIn(p, '#v-price', '4,29')
await p.$eval('#v-price', (el) => el.blur())
await wait(300)
await need(p, 'Ida: 39,3 km ÷ 7 km/l × R$ 4,29 = R$ 24,09')
const priceIn = await p.$$eval('.logi-costs tbody tr', (trs) => trs.map((tr) => [tr.querySelector('th').innerText, tr.querySelectorAll('input')[0].placeholder]))
const ph = Object.fromEntries(priceIn.map(([k, v]) => [k.split(' · ')[0], v]))
if (ph['Combustível (ida)'] !== '24,09' || ph['Pedágios (ida)'] !== '6,40' || ph['Combustível (volta)'] !== '36,77' || ph['Kit: combustível'] !== '24,51') throw new Error('Estimativas: ' + JSON.stringify(ph))
// estacionamento estimado e pedágio da volta pago
const setMoney = async (label, v) => { await p.$eval(`input[aria-label="${label}"]`, (el) => el.focus()); await p.type(`input[aria-label="${label}"]`, v); await p.$eval(`input[aria-label="${label}"]`, (el) => el.blur()); await wait(250) }
await setMoney('Estacionamento estimado', '20')
await setMoney('Pedágios (volta) estimado', '6,40')
await setMoney('Pedágios (volta) pago', '6,40')
const total = 24.09 + 6.4 + 36.77 + 6.4 + 20 + 24.51
await waitText(p, `R$ ${total.toFixed(2).replace('.', ',')}`)
const saved = await stored(p)
if (Math.abs(saved.transportEst - total) > 0.001 || saved.transportPaid !== null) throw new Error('Transporte da prova: ' + saved.transportEst + ' / ' + saved.transportPaid)
await shot(p, 'custos')
ok(`Custos: combustível pela fórmula (ida R$ 24,09), pedágio da rota, estacionamento e pago; Transporte da prova = R$ ${total.toFixed(2)}`)

// 8. Agenda
await tab(p, 'Agenda')
for (const [label, v] of [['Banho', '15'], ['Vestir e organizar', '15'], ['Café da manhã (0 = sem)', '0'], ['Preparativos finais', '10']]) await typeIn(p, `input[aria-label="${label}"]`, v)
await p.$eval('#arrive-at', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, '06:15')
await wait(200)
await p.$eval('[data-testid=gen-agenda]', (b) => b.click())
await p.waitForSelector('[data-testid=timeline]')
const tl = await p.$$eval('[data-testid=timeline] li', (lis) => lis.map((li) => li.querySelector('.tl-time').innerText + ' ' + li.querySelector('b').innerText))
// 07:00 − 45 = 06:15 a pé; −10 estacionar = 06:05; −(12+15+29) trânsito −10 paradas = 04:59; −10 margem = 04:49 sair; −10 −15 −15 = 04:09 acordar
const expected = ['04:09 Acordar', '04:09 Banho', '04:24 Vestir e organizar', '04:39 Preparativos finais', '04:49 Sair de casa', '05:01 Chegar: Eloy Chaves', '05:21 Chegar: Portal do Medeiros', '05:55 Chegar a Local da prova', '06:05 Chegada prevista à largada', '06:35 Aquecimento', '06:50 Posicionar na largada', '07:00 Largada']
if (tl.join('|') !== expected.join('|')) throw new Error('Agenda:\n' + tl.join('\n'))
await shot(p, 'agenda')
ok('Agenda: acordar 04:09, sair 04:49, paradas 05:01 e 05:21, chegada 06:05 (margem até 06:15), aquecimento 06:35, largada 07:00')

// Recalcula sozinha: largada 07:30
await p.$eval('#start-time', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, '07:30')
await waitText(p, '04:39\nAcordar')
await p.$eval('#start-time', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, '07:00')
await waitText(p, '04:09\nAcordar')
ok('Agenda recalculada sozinha ao mudar a largada')

// .ics com alarmes
await click(p, 'button', 'Baixar agenda com alarmes')
let icsFile
for (let i = 0; i < 30 && !icsFile; i++) { await wait(200); icsFile = fs.readdirSync(DL).find((f) => f.endsWith('.ics')) }
const ics = fs.readFileSync(path.join(DL, icsFile), 'utf8')
const d = iso(1).replace(/-/g, '')
for (const s of [`DTSTART:${d}T040900`, 'SUMMARY:Acordar – Corrida em Itatiba', `DTSTART:${d}T044900`, 'Sair de casa – Corrida em Itatiba', 'TRIGGER:PT0M', `DTSTART:${iso(0).replace(/-/g, '')}T172500`]) if (!ics.includes(s)) throw new Error('.ics sem ' + s + '\n' + ics.slice(0, 1500))
if (ics.includes('Residencial')) throw new Error('.ics não deveria ter o endereço de casa')
ok('.ics com eventos Acordar (04:09), Sair de casa (04:49) e Sair para o kit (17:25), com alarme e sem endereços')

// 9. Resumo no detalhe, Transporte só leitura no formulário
await p.goto(BASE + '/corridas/it', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=logistics-summary]')
await need(p, 'Acordar\n04:09')
await p.goto(BASE + '/corridas/it/editar', { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelectorAll('details').forEach((x) => (x.open = true)))
await p.waitForSelector('[data-testid=transport-from-logistics]')
ok('Detalhe mostra acordar/sair/chegar; no formulário o Transporte vem da Logística (sem duplicar)')

// 10. Modo dia da prova
await p.goto(BASE + '/corridas/it/dia', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=next-activity]')
await need(p, 'Primeira atividade do dia')
await need(p, 'sair de casa às 04:49')
await need(p, 'Chegada prevista às 06:05')
await p.waitForSelector('[data-testid=day-route]')
await need(p, 'Número de peito')
await shot(p, 'modo-dia')
ok('Modo dia da prova: primeira atividade, saída, agenda, paradas, rota e chegada prevista (peito e demais itens mantidos)')

// 11. Offline: o planejamento continua; recalcular pede conexão
await p.goto(BASE + '/corridas/it/logistica', { waitUntil: 'networkidle0' })
await tab(p, 'Ida')
await p.setOfflineMode(true)
await need(p, '39,3 km')
await click(p, '[data-testid=route-ida] button', 'Recalcular rota')
await waitText(p, 'Sem internet')
await p.setOfflineMode(false)
ok('Sem internet: rota e agenda salvas continuam; recalcular avisa que precisa de conexão')

// 12. Sem serviço de rotas: trechos informados à mão (sem estimativas inventadas)
{
  const { p: m } = await newPage({ provider: null })
  await m.goto(BASE + '/corridas/it/logistica', { waitUntil: 'networkidle0' })
  await m.waitForSelector('[data-testid=manual-mode]')
  await typeIn(m, '[data-testid=origin] input[aria-label]', 'Rua das Flores, 10, Jundiaí')
  await click(m, '[data-testid=origin] button', 'Usar')
  await m.waitForSelector('[data-testid=manual-legs]')
  const before = await m.$$eval('[data-testid=legs]', (x) => x.length)
  if (before) throw new Error('Mostrou trechos sem dados')
  await typeIn(m, 'input[aria-label="km do trecho 1"]', '38,5')
  await typeIn(m, 'input[aria-label="minutos do trecho 1"]', '45')
  await click(m, '[data-testid=manual-legs] button', 'Salvar trechos')
  await m.waitForSelector('[data-testid=legs]')
  await need(m, 'Fonte: informado por você')
  ok('Sem serviço de rotas: aviso claro e trechos informados à mão (38,5 km, 45 min)')
}

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 11 passaram.')
