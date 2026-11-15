// Rodada 25: objetivo ligado ao plano de treino — criar a partir dos treinos, progresso do plano,
// teste do plano como marca, escolher treinos e campo "Objetivo" no treino.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada25.mjs
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
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v) }

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const d = (n) => { const [y, m, dd] = today.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const time = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, n, items = time(30)) => ({ id, name: id, date: d(n), status: 'planejado', items, notes: '', result: null, goalId: null, createdAt: null, updatedAt: null })
const workouts = [W('S1 A', 2), W('S1 B', 6), W('S2 A', 9), W('S4 B Teste 5 km', 27, [{ kind: 'step', type: 'corrida', duration: { kind: 'distance', value: 5000 }, target: { kind: 'none' } }])]
await p.evaluate((ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [{ id: 'r', name: 'Prova', date: '2099-01-01', status: 'inscrita' }], goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, workouts)

// 1. Treinos: atalho "Criar objetivo com estes treinos" já preenche 5 km e o prazo do último treino
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=plan-goal-hint]')
await need('4 treinos planejados sem objetivo')
await p.$eval('[data-testid=plan-goal-create]', (a) => a.click())
await p.waitForSelector('form')
await wait(300)
const km = await p.$eval('#g-distance', (i) => i.value).catch(() => null)
const dl = await p.$eval('#g-deadline', (i) => i.value).catch(() => null)
if (km !== '5' || dl !== d(27)) throw new Error(`Pré-preenchimento: km=${km} prazo=${dl}`)
await typeIn('#g-target', '3830')
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Criar objetivo|Salvar/.test(b.innerText)).click())
await p.waitForFunction(() => /^\/objetivos\/[^/]+$/.test(location.pathname))
let db = await data()
const g = db.goals[0]
if (g.distanceKm !== 5 || g.targetValue !== 2310 || db.workouts.filter((w) => w.goalId === g.id).length !== 4) throw new Error('Objetivo/ligação: ' + JSON.stringify({ g, linked: db.workouts.map((w) => w.goalId) }))
ok('Atalho em Treinos: objetivo “5 km” com prazo do último treino; ao salvar, os 4 treinos planejados ficam ligados')

// 2. Objetivo: plano 0 de 4, semana, próximo treino
await p.waitForSelector('[data-testid=goal-plan]')
await need('0 de 4 treinos feitos')
await need('Próximo: S1 A')
await need('Quando você importar o arquivo do relógio de um treino de 5 km deste plano')
ok('Objetivo: “Plano de treino” com 0 de 4 feitos e “Próximo: S1 A”')

// 3. Teste feito com arquivo do relógio (simulado no armazenamento): vira a marca do objetivo
await p.evaluate((gid) => {
  const d = JSON.parse(localStorage.getItem('minhas-corridas:v1'))
  d.workouts = d.workouts.map((w) => (w.name === 'S1 A' ? { ...w, status: 'feito' } : w.name.includes('Teste') ? { ...w, status: 'feito', result: { distanceKm: 5.02, elapsedSec: 2320, laps: [] } } : w))
  localStorage.setItem('minhas-corridas:v1', JSON.stringify(d))
}, g.id)
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=goal-plan]')
await need('2 de 4 treinos feitos')
await need('Melhor: 38:40 (teste em treino)')
await need('Faltam 0:10 para ficar abaixo de 38:30')
await need('Teste em treino: 38:40')
await p.screenshot({ path: `${SHOTS}/r25-objetivo.png`, fullPage: true })
ok('Teste do plano (5,02 km em 38:40) vira a marca: “Melhor: 38:40 (teste em treino)”, faltam 0:10; 2 de 4 feitos')

// 4. Escolher treinos: tirar um do plano
await p.$eval('[data-testid=goal-plan-pick]', (b) => b.click())
await p.waitForSelector('[data-testid=goal-plan-sheet]')
await p.evaluate(() => [...document.querySelectorAll('.gp-pick label')].find((l) => l.innerText.includes('S2 A')).querySelector('input').click())
await p.$eval('[data-testid=goal-plan-save]', (b) => b.click())
await wait(300)
await need('2 de 3 treinos feitos')
ok('“Escolher treinos do plano”: desmarcar S2 A deixa o plano com 3')

// 5. Lista de objetivos mostra o plano; o treino tem o campo Objetivo
await p.goto(BASE + '/objetivos', { waitUntil: 'networkidle0' })
const chip = await p.$eval('[data-testid=goal-plan-chip]', (e) => e.innerText)
if (!chip.includes('Plano: 2 de 3 treinos')) throw new Error('Chip: ' + chip)
db = await data()
const s2 = db.workouts.find((w) => w.name === 'S2 A')
await p.goto(`${BASE}/treinos/${s2.id}/editar`, { waitUntil: 'networkidle0' })
await p.select('#wk-goal', g.id)
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Salvar').click())
await p.waitForFunction(() => !location.pathname.endsWith('/editar'))
db = await data()
if (db.workouts.find((w) => w.name === 'S2 A').goalId !== g.id) throw new Error('Campo Objetivo no treino não salvou')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Objetivos: “🏃 Plano: 2 de 3 treinos”; no treino, o campo “Objetivo” liga de volta')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 25 passaram.')
