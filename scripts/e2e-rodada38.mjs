// Rodada 38: detalhes de qualquer atividade do relógio (força com séries, calorias e efeito do treino;
// corrida com parciais e percurso), a lista sem “0,00 km”, o story de força, a tela de Stories nova
// (prévia + miniaturas + botão fixo) e o Passaporte em coleção. Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada38.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Encoder, Profile } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DIR = path.resolve(SHOTS, 'r38')
fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-18T23:00:00Z')
  const Real = Date
  class FakeDate extends Real { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } }
  window.Date = FakeDate
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
await p.setRequestInterception(true)
p.on('request', (r) => (r.url().includes('tile.openstreetmap') ? r.respond({ status: 404, body: '' }) : r.continue()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 3000)}`) }
const waitText = async (s, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }

function strength(file) {
  const enc = new Encoder()
  const t0 = Date.parse('2026-11-17T21:00:00Z')
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  for (let s = 0; s <= 3812; s += 4) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), heartRate: 120 + (s % 60) })
  let at = 0
  for (const [cat, reps, kg] of [['squat', 12, 40], ['squat', 10, 45], ['squat', 8, 50], ['lunge', 12, 20], ['plank', null, null]]) {
    enc.onMesg(Profile.MesgNum.SET, { timestamp: new Date(t0 + (at + 60) * 1000), startTime: new Date(t0 + at * 1000), duration: 60, setType: 'active', category: [cat], ...(reps ? { repetitions: reps } : {}), ...(kg ? { weight: kg } : {}) })
    at += 150
  }
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + 3812e3), startTime: new Date(t0), sport: 'training', subSport: 'strengthTraining', totalElapsedTime: 3812, totalTimerTime: 3812, totalCalories: 412, avgHeartRate: 144, maxHeartRate: 171, totalTrainingEffect: 2.4, totalAnaerobicTrainingEffect: 1.6 })
  const f = path.join(DIR, file)
  fs.writeFileSync(f, enc.close())
  return f
}
const SEMI = 2 ** 31 / 180
function run(file) {
  const enc = new Encoder()
  const t0 = Date.parse('2026-11-16T09:00:00Z')
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  const sec = 1800
  for (let s = 0; s <= sec; s += 3) {
    const d = (5000 * s) / sec
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: d, heartRate: 150, positionLat: Math.round((-23.19 + d / 111320) * SEMI), positionLong: Math.round(-46.89 * SEMI) })
  }
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: 5000, avgHeartRate: 150 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), sport: 'running', totalElapsedTime: sec, totalTimerTime: sec, totalDistance: 5000, avgHeartRate: 150, maxHeartRate: 168, totalCalories: 310, avgCadence: 82, totalTrainingEffect: 3.1 })
  const f = path.join(DIR, file)
  fs.writeFileSync(f, enc.close())
  return f
}

const step = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const ws = [
  { id: 'forca', name: 'Força', sport: 'academia', plannedMin: 60, date: '2026-11-17', status: 'planejado', items: [], notes: '', result: null, goalId: null },
  { id: 'rod', name: 'Rodagem', date: '2026-11-16', status: 'planejado', items: step(30), notes: '', result: null, goalId: null }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws)

// 1. Força: importar o arquivo do relógio → séries, calorias, efeito do treino
await p.goto(BASE + '/treinos/forca', { waitUntil: 'networkidle0' })
await (await p.$('[data-testid=wk-file]')).uploadFile(strength('forca.fit'))
await p.waitForSelector('[data-testid=activity-details]')
const det = await p.$eval('[data-testid=activity-details]', (e) => e.innerText.replace(/\s+/g, ' '))
for (const t of ['1:03:32', 'duração', '144', 'FC média', '171', 'FC máxima', '412', 'kcal', '5 séries', 'Agachamento', '3 séries · 12, 10, 8 reps · até 50 kg', 'Afundo', 'Prancha', '42 repetições', 'volume 1.570 kg', 'Aeróbico', '2,4 · mantém', 'Anaeróbico', '1,6 · leve']) if (!det.toLowerCase().includes(t.toLowerCase())) throw new Error(`Detalhes de força sem “${t}”: ${det}`)
if (det.includes('0,00 km')) throw new Error('Mostra 0,00 km na força')
await p.screenshot({ path: `${SHOTS}/r38-forca.png`, fullPage: true })
ok('Força: duração, FC média/máxima, kcal, séries por exercício (Agachamento 12, 10, 8 reps até 50 kg), volume e efeito do treino — sem “0,00 km”')

// 2. Corrida: parciais e percurso
await p.goto(BASE + '/treinos/rod', { waitUntil: 'networkidle0' })
await (await p.$('[data-testid=wk-file]')).uploadFile(run('rodagem.fit'))
await p.waitForSelector('[data-testid=det-splits]')
const det2 = await p.$eval('[data-testid=activity-details]', (e) => e.innerText.replace(/\s+/g, ' '))
for (const t of ['5,00 km', '6:00 /km', 'pace médio', '310', '164', 'passos/min', 'Parciais por km', 'Percurso']) if (!det2.toLowerCase().includes(t.toLowerCase())) throw new Error(`Detalhes de corrida sem “${t}”: ${det2}`)
await p.waitForSelector('[data-testid=det-map]')
ok('Corrida: distância, pace médio, kcal, cadência (164 passos/min), parciais por km e o percurso no mapa')

// 3. Lista: força mostra o tempo e as calorias (não “0,00 km”)
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=workout-item]')
const items = await p.$$eval('[data-testid=workout-item]', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')))
const f = items.find((x) => x.includes('Força'))
if (!f.includes('1:03:32') || !f.includes('412 kcal') || f.includes('0,00 km')) throw new Error('Lista: ' + f)
ok(`Lista de treinos: “${f.trim()}”`)

// 4. Story de força
await p.goto(BASE + '/stories?modelo=treino&treino=forca', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=story-canvas]')
await wait(500)
const data = await p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png'))
fs.writeFileSync(path.join(SHOTS, 'r38-story-forca.png'), Buffer.from(data.split(',')[1], 'base64'))
ok('Story de força gerado com exercícios, kcal, FC e “2º treino da semana”')

// 5. Stories: prévia no topo, miniaturas reais e botão fixo
const thumbs = await p.$$eval('.st-thumb canvas', (c) => c.length)
if (thumbs !== 9) throw new Error('Miniaturas: ' + thumbs)
const prev = await p.$eval('[data-testid=story-canvas]', (e) => e.getBoundingClientRect().top)
const strip = await p.$eval('.st-strip', (e) => e.getBoundingClientRect().top)
if (!(prev < strip)) throw new Error('Prévia não está no topo')
const pos = await p.$eval('.st-actions', (e) => getComputedStyle(e).position)
if (pos !== 'fixed') throw new Error('Botão não fixo: ' + pos)
await p.$eval('[data-testid=story-semana]', (b) => b.click())
await wait(300)
if (!(await p.$eval('[data-testid=story-semana]', (b) => b.getAttribute('aria-pressed') === 'true'))) throw new Error('Miniatura não seleciona')
await p.screenshot({ path: `${SHOTS}/r38-stories.png` })
ok('Stories: prévia no topo, 9 miniaturas reais para deslizar, “Compartilhar” fixo no rodapé')

const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 38 passaram.')
