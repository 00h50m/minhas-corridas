// Rodada 29: outras atividades (academia), traçado do relógio no mapa (sem início e fim), passaporte
// com conquistas e story de conquista, provas perto de você.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada29.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Encoder, Profile } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DIR = path.resolve(SHOTS, 'r29')
fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = async (s, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))
const noOverflow = async (where) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 0) throw new Error(`${where}: rolagem lateral de ${o}px`) }
const saveCanvas = async (name) => {
  const data = await p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png'))
  fs.writeFileSync(path.join(SHOTS, `r29-${name}.png`), Buffer.from(data.split(',')[1], 'base64'))
}

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const shift = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const lastYear = `${Number(today.slice(0, 4)) - 1}${shift(today, 20).slice(4)}`

/** Corrida .FIT com GPS: volta num círculo de ~480 m de raio (≈3 km) em Jundiaí, às 09:00 de Brasília. */
const SEMI = 2 ** 31 / 180
const LAT0 = -23.1857, LON0 = -46.8978
function gpsRun(file, date, sport = 'running') {
  const enc = new Encoder()
  const t0 = new Date(`${date}T12:00:00Z`).getTime()
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(t0), type: 'activity' })
  const sec = 1200, km = 3
  for (let s = 0; s <= sec; s += 2) {
    const a = (2 * Math.PI * s) / sec
    const lat = LAT0 + (480 / 111320) * Math.sin(a)
    const lon = LON0 + ((480 / 111320) * (1 - Math.cos(a))) / Math.cos((LAT0 * Math.PI) / 180)
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: (km * 1000 * s) / sec, heartRate: 150, positionLat: Math.round(lat * SEMI), positionLong: Math.round(lon * SEMI) })
  }
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), sport, totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000, avgHeartRate: 150 })
  const f = path.join(DIR, file)
  fs.writeFileSync(f, enc.close())
  return f
}

const races = [
  { id: 'cb', name: 'Corrida do Bem', date: shift(today, -25), status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, startTime: '06:30', targetTime: 2500, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
  { id: 'hc', name: 'Health Care Run', date: shift(today, -1), status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, startTime: '07:00', result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } },
  { id: 'nat', name: `Corrida de Natal ${lastYear.slice(0, 4)}`, date: lastYear, status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 10, result: { netTime: 4900, officialDistanceKm: 10, isOfficial: true } }
]
const run = [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1200 }, target: { kind: 'none' } }]
const workouts = [{ id: 'rod', name: 'Rodagem hoje', date: today, status: 'planejado', items: run, notes: '', result: null, goalId: null }]
await p.evaluate((races, ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races, workouts)

// 1. Outra atividade: academia, 50 min, hoje
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=new-cross]')
await p.goto(`${BASE}/treinos/novo?tipo=academia&data=${today}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-min]')
if ((await p.$eval('[data-testid=wk-sport]', (s) => s.value)) !== 'academia') throw new Error('Tipo não veio do link')
if (await p.$('[data-testid=wk-templates]')) throw new Error('Academia mostra modelos de corrida')
await p.type('#wk-name', 'Pernas')
await p.$eval('[data-testid=wk-min]', (i) => { i.select() })
await p.type('[data-testid=wk-min]', '50')
await p.$eval('[data-testid=workout-form]', (f) => f.requestSubmit())
await p.waitForSelector('[data-testid=wk-cross]')
await need('Academia / força')
await need('50 min planejados')
if (await p.$('[data-testid=wk-export]')) throw new Error('Academia com botão de .FIT')
await p.$$eval('[aria-label="Status do treino"] button', (bs) => bs.find((b) => b.innerText === 'Feito').click())
await waitText('Marcado como feito')
await p.waitForSelector('[data-testid=wk-story]')
const pernas = (await stored()).workouts.find((w) => w.name === 'Pernas')
if (pernas.sport !== 'academia' || pernas.plannedMin !== 50 || pernas.items.length) throw new Error('Academia salva: ' + JSON.stringify(pernas))
ok('Outra atividade: “+ Outra atividade” → Academia, 50 min, sem passos nem .FIT; marcada como feita')

// 2. Semana conta a academia; arquivo com GPS vai para a corrida do dia (não para a academia)
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-totals]')
let totals = await p.$eval('[data-testid=week-totals]', (e) => e.innerText)
if (!totals.includes('1 de 2 treinos') || !totals.includes('1 outra atividade')) throw new Error('Semana: ' + totals)
await (await p.$('[data-testid=activity-files]')).uploadFile(gpsRun('volta.fit', today))
await waitText('“Rodagem hoje” marcado como feito')
const rod = (await stored()).workouts.find((w) => w.id === 'rod')
if (rod.status !== 'feito' || !rod.result.track || rod.result.track.length < 20) throw new Error('Traçado não salvo: ' + JSON.stringify(rod.result))
// Decodifica aqui (o build não expõe módulos): confere que o início do traçado está a ≥ 190 m da largada
const decode = (str) => { const c = []; let i = 0, lat = 0, lon = 0; const nx = () => { let s = 0, r = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5 } while (b >= 32); return r & 1 ? ~(r >> 1) : r >> 1 }; while (i < str.length) { lat += nx(); lon += nx(); c.push([lat / 1e5, lon / 1e5]) } return c }
const pts = decode(rod.result.track)
const dist = (a, b) => { const R = 6371000, rd = (x) => (x * Math.PI) / 180; const h = Math.sin(rd(b[0] - a[0]) / 2) ** 2 + Math.cos(rd(a[0])) * Math.cos(rd(b[0])) * Math.sin(rd(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
const dStart = dist([LAT0, LON0], pts[0])
const dEnd = dist([LAT0, LON0], pts.at(-1))
if (dStart < 190 || dEnd < 190) throw new Error(`Zona de privacidade: início a ${Math.round(dStart)} m, fim a ${Math.round(dEnd)} m da casa`)
if (pts.length > 400) throw new Error('Traçado com pontos demais: ' + pts.length)
totals = await p.$eval('[data-testid=week-totals]', (e) => e.innerText)
if (!totals.includes('2 de 2 treinos') || !totals.includes('3 km')) throw new Error('Semana depois do arquivo: ' + totals)
ok(`Semana: “2 de 2 treinos · … · 3 km · 1 outra atividade”; .FIT com GPS foi para “Rodagem hoje”, traçado com ${pts.length} pontos começando a ${Math.round(dStart)} m e terminando a ${Math.round(dEnd)} m da largada`)

// 3. Mapa das corridas
await p.goto(BASE + '/mapa', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=runs-map] .leaflet-overlay-pane path', { timeout: 8000 })
const paths = await p.$$eval('[data-testid=runs-map] .leaflet-overlay-pane path', (x) => x.length)
if (paths !== 1) throw new Error('Linhas no mapa: ' + paths)
const stats = await p.$eval('[data-testid=map-stats]', (e) => e.innerText.replace(/\s+/g, ' '))
const cells = Number(stats.match(/(\d+) quarteirões/)?.[1])
if (!stats.startsWith('1 percurso ')) throw new Error('Stats: ' + stats)
if (!(cells >= 15 && cells <= 40)) throw new Error('Quarteirões: ' + stats)
await need('quarteirões novos')
await noOverflow('Mapa')
await p.screenshot({ path: `${SHOTS}/r29-mapa.png` })
ok(`Mapa: 1 percurso desenhado, ${cells} quarteirões, “abriu N quarteirões novos”`)

// 4. Passaporte pelo Início
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=passport-link]')
const hl = await p.$eval('[data-testid=passport-link]', (e) => e.innerText)
if (!hl.includes('Nova:')) throw new Error('Início sem conquista nova: ' + hl)
await p.$eval('[data-testid=passport-link]', (a) => a.click())
await p.waitForSelector('[data-testid=pp-badges]')
await need('Sub 40 nos 5 km')
await need('Primeira prova')
await need('Madrugadora')
await need('Meta batida')
await need('Primeiros 10 km')
await need('Sub 38 nos 5 km')
const count = await p.$eval('[data-testid=pp-count]', (e) => e.innerText)
if (!/^\d+ de \d+ conquistas$/.test(count.trim())) throw new Error('Contagem: ' + count)
// Medalha que falta: o painel mostra quanto falta
await p.$$eval('[data-testid=pp-badge]', (b) => b.find((x) => x.innerText.includes('Sub 38 nos 5 km')).click())
await p.waitForSelector('[data-testid=pp-sheet]')
await need('melhor: 39:30 · faltam 1:30')
await p.keyboard.press('Escape')
await wait(200)
// Aba de recordes e números
await p.$eval('[data-testid=pp-tab-records]', (b) => b.click())
await p.waitForSelector('[data-testid=pp-records-tab]')
await need('Jundiaí/SP')
await need('1 atividade além da corrida')
await noOverflow('Passaporte')
await p.$eval('[data-testid=pp-tab-badges]', (b) => b.click())
await p.waitForSelector('[data-testid=pp-badges]')
await p.screenshot({ path: `${SHOTS}/r29-passaporte.png`, fullPage: true })
ok(`Passaporte: ${count}; coleção por categoria (as que faltam apagadas), painel com quanto falta (Sub 38: faltam 1:30), aba de recordes e cidades`)

// Nova conquista → painel → “Postar no story”
await p.$eval('[data-testid=pp-fresh]', (b) => b.click())
await p.waitForSelector('[data-testid=pp-share]')

// 5. Story da conquista
await p.$eval('[data-testid=pp-share]', (a) => a.click())
await p.waitForSelector('[data-testid=story-canvas]')
await wait(400)
if (!(await p.$eval('[data-testid=story-conquista]', (b) => b.getAttribute('aria-pressed') === 'true'))) throw new Error('Conquista não selecionada')
await saveCanvas('conquista')
await p.goto(`${BASE}/stories?modelo=conquista&conquista=madrugadora`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=story-canvas]')
await wait(300)
await saveCanvas('madrugadora')
await p.goto(`${BASE}/stories?modelo=treino&treino=${pernas.id}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=story-canvas]')
await wait(300)
await saveCanvas('academia')
ok('Story: “Postar no story” abre a conquista; Madrugadora e Academia feita geradas')

// 6. Provas perto de você
await p.goto(BASE + '/provas-perto', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=near-links]')
await need(`Corrida de Natal ${lastYear.slice(0, 4)}`)
const first = await p.$$eval('[data-testid=near-cities] button', (b) => b.map((x) => x.innerText))
if (first[0] !== 'Jundiaí/SP' || !first.includes('Vinhedo/SP') || first.at(-1) !== 'Outra') throw new Error('Cidades: ' + first)
let href = await p.$eval('[data-testid=near-google]', (a) => a.href)
if (!href.startsWith('https://www.google.com/search?q=') || !decodeURIComponent(href).includes('corrida de rua Jundiaí SP')) throw new Error('Busca: ' + href)
await p.$eval('[data-testid=near-other]', (b) => b.click())
await p.waitForSelector('[data-testid=near-city]')
await p.type('[data-testid=near-city]', 'Itatiba')
href = await p.$eval('[data-testid=near-google]', (a) => a.href)
if (!decodeURIComponent(href).includes('Itatiba')) throw new Error('Outra cidade: ' + href)
const tsp = await p.$eval('[data-testid=near-ticketsports]', (a) => decodeURIComponent(a.href))
if (!tsp.includes('site:ticketsports.com.br')) throw new Error('Ticket Sports: ' + tsp)
await noOverflow('Provas perto')
await p.screenshot({ path: `${SHOTS}/r29-perto.png`, fullPage: true })
ok('Provas perto: “Corrida de Natal” do ano passado, cidades (Jundiaí primeiro), buscas no Google e nos sites de inscrição, outra cidade digitada')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 29 passaram.')
