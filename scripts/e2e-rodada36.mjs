// Rodada 36: frequência cardíaca por zona. Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada36.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Encoder, Profile } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DIR = path.resolve(SHOTS, 'r36')
fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-18T22:00:00Z')
  const Real = Date
  class FakeDate extends Real {
    constructor(...a) { super(...(a.length ? a : [fixed])) }
    static now() { return fixed }
  }
  window.Date = FakeDate
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 3000)}`) }
const waitText = async (s, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }

/** Corrida .FIT (às 06h de Brasília): `easy` min a 130 bpm e `hard` min a 172 bpm, uma volta por bloco. */
function run(file, date, easy, hard) {
  const enc = new Encoder()
  const t0 = Date.parse(`${date}T09:00:00Z`)
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  const total = (easy + hard) * 60
  for (let s = 0; s <= total; s += 5) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: s * 2.5, heartRate: s < easy * 60 ? 130 : 172 })
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + easy * 60e3), startTime: new Date(t0), totalElapsedTime: easy * 60, totalTimerTime: easy * 60, totalDistance: easy * 150, avgHeartRate: 130 })
  if (hard) enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + total * 1000), startTime: new Date(t0 + easy * 60e3), totalElapsedTime: hard * 60, totalTimerTime: hard * 60, totalDistance: hard * 150, avgHeartRate: 172 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + total * 1000), startTime: new Date(t0), sport: 'running', totalElapsedTime: total, totalTimerTime: total, totalDistance: total * 2.5, avgHeartRate: 145 })
  const f = path.join(DIR, file)
  fs.writeFileSync(f, enc.close())
  return f
}

await p.setRequestInterception(true)
p.on('request', (r) => {
  if (!r.url().includes('/api/garmin')) return r.continue()
  const b = JSON.parse(r.postData() || '{}')
  if (b.action === 'hrzones') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ zones: { floors: [110, 128, 145, 160, 175], max: 192, rest: 52 } }) })
  return r.respond({ status: 200, contentType: 'application/json', body: '{"activities":[],"days":[]}' })
})

const step = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const ws = [
  { id: 'rod', name: 'Rodagem leve', date: '2026-11-17', status: 'planejado', items: step(30), notes: '', result: null, goalId: null },
  { id: 'reg', name: 'Regenerativo', date: '2026-11-18', status: 'planejado', items: step(30), notes: '', result: null, goalId: null }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws)

// 1. Sem zonas: o treino pede a FC máxima
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await (await p.$('[data-testid=activity-files]')).uploadFile(run('ter.fit', '2026-11-17', 20, 10), run('qua.fit', '2026-11-18', 30, 0))
await waitText('“Regenerativo” marcado como feito')
await p.goto(BASE + '/treinos/rod', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=hrz-nozones]')
ok('Sem FC máxima nem zonas: o treino explica onde informar')

// 2. Perfil → FC máxima 190 → zonas pelo padrão do Garmin (% da máxima)
await p.goto(BASE + '/perfil', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=hr-max]')
await p.type('[data-testid=hr-max]', '190')
await waitText('Em uso: FC máxima 190 (informada)')
await need('95–113')
ok('Perfil → Frequência cardíaca: FC máxima 190 → Z1 95–113 … Z5 171+')

// 3. Treino com 10 min forte numa “rodagem leve”: barra, aviso e FC de cada passo
await p.goto(BASE + '/treinos/rod', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=hrz]')
const read = await p.$eval('[data-testid=hrz-read]', (e) => e.innerText)
if (read !== '34% do tempo em Z4–Z5: mais forte do que uma rodagem leve costuma ser.') throw new Error('Leitura: ' + read)
await need('Z2 · leve')
const laps = await p.$$eval('[data-testid=lap-hr]', (e) => e.map((x) => x.innerText))
if (laps[0] !== '♥ 130 · Z2') throw new Error('FC do passo: ' + laps)
await p.screenshot({ path: `${SHOTS}/r36-treino.png`, fullPage: true })
await p.goto(BASE + '/treinos/reg', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=hrz-read]')
await need('100% em Z1–Z2: rodagem leve de verdade.')
ok(`Treino: barra das zonas, “${read}”, FC de cada passo (♥ 130 · Z2); o regenerativo: “rodagem leve de verdade”`)

// 4. Semana: intensidade somada
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-zones]')
const wk = await p.$eval('[data-testid=week-zones]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!wk.includes('Intensidade da semana (2 treinos com FC)') || !wk.includes('Leve 83% · moderado 0% · forte 17%')) throw new Error('Semana: ' + wk)
ok(`Semana: “${wk.trim()}”`)

// 5. Zonas do Garmin
await p.evaluate(() => localStorage.setItem('minhas-corridas:garmin', JSON.stringify({ key: 'gk_teste_123456789', done: [], pending: [], races: [] })))
await p.goto(BASE + '/perfil', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=hr-garmin]')
await p.$eval('[data-testid=hr-garmin]', (b) => b.click())
await waitText('Em uso: zonas do Garmin')
await need('175+')
const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
ok('“⌚ Importar zonas do Garmin”: as zonas do relógio passam a valer (Z5 175+)')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 36 passaram.')
