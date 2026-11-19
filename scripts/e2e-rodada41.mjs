// Rodada 41: passada de UX — semana com a carga num toque, lista sem repetição, Início enxuto (perfil numa
// linha, treino de hoje + semana num cartão, sem números zerados), sem símbolos soltos, clima sem erro
// técnico, formulário com opcionais recolhidos, carga por semana no Mês e a ficha de força no relógio (.FIT).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada41.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Decoder, Stream } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'r41-dl')
fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
const cdp = await p.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })
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
p.on('request', (r) => (r.url().includes('open-meteo') ? r.abort('internetdisconnected') : r.continue()))
const T = (sel = 'body') => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '))
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })

const run = (id, date, min) => ({ id, name: 'Rodagem', date, status: 'feito', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }], notes: '', goalId: null, result: { distanceKm: min / 6, elapsedSec: min * 60, avgHr: 150 } })
const ws = [
  run('a', '2026-11-02', 40), run('b', '2026-11-09', 40), run('c', '2026-11-16', 45),
  { id: 'gym', name: 'Força', sport: 'academia', plannedMin: 60, date: '2026-11-17', status: 'feito', items: [], notes: '', goalId: null, result: { elapsedSec: 3600, distanceKm: 0, calories: 400, avgHr: 140 } },
  { id: 'hoje', name: 'Tiros', date: '2026-11-18', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 2400 }, target: { kind: 'none' } }], notes: '', goalId: null, result: null },
  { id: 'ficha', name: 'Pernas', sport: 'academia', plannedMin: 50, date: '2026-11-20', status: 'planejado', items: [], exercises: [{ cat: 28, sets: 3, reps: 12, kg: 40 }, { cat: 19, sets: 2, reps: null, kg: null }], notes: '', goalId: null, result: null }
]
const races = [{ id: 'prova', name: 'Corrida da Serra', date: '2026-11-29', status: 'inscrita', distanceKm: 10, city: 'Jundiaí', state: 'SP', result: null }]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w, r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws, races)

// 1. Início enxuto
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=profile-invite]')
const inviteH = await p.$eval('[data-testid=profile-invite]', (e) => e.getBoundingClientRect().height)
if (inviteH > 60) throw new Error('Convite do perfil alto demais: ' + inviteH)
await p.waitForSelector('.home-train [data-testid=home-workout]')
await p.waitForSelector('.home-train [data-testid=week-compact]')
if (await p.evaluate(() => [...document.querySelectorAll('h2')].some((h) => /^Seu \d{4}$/i.test(h.innerText.trim())))) throw new Error('“Seu ano” com tudo zerado')
await p.screenshot({ path: `${SHOTS}/r41-home.png` })
ok(`Início: perfil numa linha (${Math.round(inviteH)} px), treino de hoje e a semana num cartão só, sem “Seu 2026” zerado`)

// 2. Semana: carga num toque; lista sem repetição e sem símbolos soltos
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-load-sum]')
if (await p.$eval('.tw-more', (d) => d.open)) throw new Error('Detalhe da carga aberto')
await tap('[data-testid=week-load-sum]')
await p.waitForFunction(() => document.querySelector('.tw-more').open)
const load = await T('[data-testid=week-load]')
if (!load.includes('Carga da semana') || !load.includes('corrida') || !load.includes('força')) throw new Error('Carga: ' + load)
const items = await p.$$eval('[data-testid=workout-item]', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')))
const gym = items.find((x) => x.includes('Força'))
if ((gym.match(/1:00:00/g) ?? []).length !== 1 || !gym.includes('400 kcal')) throw new Error('Item repetido: ' + gym)
const body = await T()
for (const sym of ['♥', '↷', '≈', '⏱']) if (body.includes(sym)) throw new Error(`Símbolo solto “${sym}” em Treinos`)
ok(`Semana: carga resumida (detalhe num toque); item “${gym.trim()}” sem tempo repetido; sem ♥ ↷ ≈ ⏱`)

// 3. Mês: carga por semana
await tap('[data-testid=wk-view-month]')
await p.waitForSelector('[data-testid=wm-load]')
const bars = await p.$$eval('.wm-bar', (e) => e.map((x) => x.querySelector('.wm-bar-l').innerText))
if (bars.join() !== '26/10,02/11,09/11,16/11,23/11') throw new Error('Semanas: ' + bars)
ok('Mês: carga por semana em barras (26/10 a 23/11), feito e planejado')

// 4. Ficha de força → .FIT de musculação
await p.goto(BASE + '/treinos/ficha', { waitUntil: 'networkidle0' })
await tap('[data-testid=wk-send]')
await p.waitForSelector('[data-testid=wk-send-sheet] [data-testid=wk-export]')
if (await p.$('[data-testid=wk-send-sheet] [data-testid=wk-gc]')) throw new Error('Opções de corrida na academia')
await tap('[data-testid=wk-export]')
let fit = null
for (let i = 0; i < 40 && !fit; i++) { await wait(150); fit = fs.readdirSync(DL).find((n) => n.endsWith('.FIT')) }
if (!fit) throw new Error('Sem .FIT')
const d = new Decoder(Stream.fromByteArray(fs.readFileSync(path.join(DL, fit))))
const { messages } = d.read()
const st = messages.workoutStepMesgs
if (messages.workoutMesgs[0].subSport !== 'strengthTraining' || st[0].exerciseCategory !== 'squat' || st[0].durationReps !== 12 || st[0].exerciseWeight !== 40 || st[2].repeatSteps !== 3) throw new Error('FIT: ' + JSON.stringify(st.slice(0, 3)))
await has('[data-testid=wk-howto]', ['Musculação → Opções → Treinos'])
ok(`Ficha → ${fit}: musculação, Agachamento 12 reps · 40 kg × 3 séries, Prancha até o botão × 2`)

// 5. Formulário com opcionais recolhidos
await p.goto(BASE + '/treinos/novo?tipo=academia', { waitUntil: 'networkidle0' })
await p.waitForSelector('.wk-extra')
if (await p.$eval('.wk-extra', (d) => d.open)) throw new Error('Opcionais abertos num treino novo')
ok('Formulário: prova, objetivo e observações recolhidos em “opcional”')

// 6. Clima sem conexão: mensagem simples
await p.goto(BASE + '/corridas/prova', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=weather]')
await p.waitForFunction(() => !document.querySelector('[data-testid=weather]').innerText.includes('Buscando'), { timeout: 8000 })
const wx = await T('[data-testid=weather]')
if (/failed|fetch|typeerror/i.test(wx) || !wx.includes('Tentar de novo')) throw new Error('Clima: ' + wx)
ok(`Clima offline: “${wx}”`)

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of ['/', '/treinos', '/treinos?ver=mes', '/treinos/ficha', '/treinos/novo?tipo=academia', '/corridas/prova', '/ajustes']) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 41 passaram.')

async function has(sel, list) { const t = (await T(sel)).toLowerCase(); for (const x of list) if (!t.includes(x.toLowerCase())) throw new Error(`Em ${sel} faltou “${x}”: ${t}`) }
