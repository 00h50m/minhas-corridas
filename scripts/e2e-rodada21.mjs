// Rodada 21: importar treinos por link (#p=…) ou arquivo .json, sem repetir; guia "Montar no Garmin Connect".
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada21.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { encodePlan } from '../src/lib/workoutShare.js'
import { normalizeWorkout } from '../src/lib/workout.js'

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
const shot = (n) => p.screenshot({ path: `${SHOTS}/r21-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).workouts ?? [])

const t = (m) => ({ kind: 'time', value: m * 60 })
const plan = [
  normalizeWorkout({ name: 'S1 A Base 6x2', date: '2099-11-17', notes: 'Leve', items: [{ type: 'aquecimento', duration: t(5) }, { kind: 'repeat', times: 6, steps: [{ type: 'corrida', duration: t(2), name: 'Corrida leve' }, { type: 'recuperacao', duration: t(1), name: 'Caminhada' }] }, { type: 'desaquecimento', duration: t(5) }] }),
  normalizeWorkout({ name: 'S1 B Ritmo 8x1', date: '2099-11-21', items: [{ type: 'aquecimento', duration: t(8) }, { kind: 'repeat', times: 8, steps: [{ type: 'tiro', duration: t(1) }, { type: 'recuperacao', duration: t(2) }] }, { type: 'desaquecimento', duration: t(5) }] }),
  normalizeWorkout({ name: 'S4 B Teste 5 km', date: '2099-12-12', items: [{ type: 'aquecimento', duration: t(10) }, { type: 'corrida', duration: { kind: 'distance', value: 5000 } }, { type: 'desaquecimento', duration: t(5) }] })
]
const code = encodePlan('Bloco 5 km', plan)

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) })

// 1. Link: confere a lista com datas e adiciona
await p.goto(`${BASE}/treinos/importar#p=${code}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-import-item]')
await need('Bloco 5 km')
await need('3 treinos · nada do que já está no app é apagado')
await need('ter 17/11')
await need('6×(2 min + 1 min rec.)')
await shot('importar')
await p.$eval('[data-testid=wk-import-add]', (b) => b.click())
await p.waitForFunction(() => location.pathname === '/treinos')
let ws = await stored()
if (ws.length !== 3 || ws.some((w) => w.status !== 'planejado') || ws[0].date !== '2099-11-17' || ws[0].notes !== 'Leve') throw new Error('Importados: ' + JSON.stringify(ws.map((w) => [w.name, w.date, w.status])))
const meta = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:sync') || '{}').dirty || {})
if (Object.keys(meta).filter((k) => k.startsWith('workout:')).length !== 3) throw new Error('Importados não ficaram pendentes para sincronizar')
ok('Link de treinos: lista com datas e resumo; “Adicionar 3 treinos” salva como planejados (com observações) e pendentes para sincronizar')

// 2. Abrir o mesmo link de novo não repete
await p.goto(`${BASE}/treinos/importar#p=${code}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-import-add]')
await need('Adicionar 0 treinos')
await need('Já está no app (não será repetido)')
await p.$eval('[data-testid=wk-import-add]', (b) => b.click())
await p.waitForFunction(() => location.pathname === '/treinos')
if ((await stored()).length !== 3) throw new Error('Repetiu treinos')
ok('Mesmo link de novo: nada repetido')

// 2b. Mesmo treino com mudança (ganhou faixa de pace): atualiza no lugar, mantendo status e id
const before = (await stored()).find((w) => w.name === 'S1 A Base 6x2')
await p.evaluate((id) => { const d = JSON.parse(localStorage.getItem('minhas-corridas:v1')); d.workouts = d.workouts.map((w) => (w.id === id ? { ...w, status: 'feito' } : w)); localStorage.setItem('minhas-corridas:v1', JSON.stringify(d)) }, before.id)
const withPace = plan.map((w, i) => (i === 0 ? normalizeWorkout({ ...w, items: [{ type: 'corrida', duration: t(20), target: { kind: 'pace', min: 525, max: 570 } }] }) : w))
await p.goto(`${BASE}/treinos/importar#p=${encodePlan('Bloco 5 km', withPace)}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-import-update]')
await need('Atualizar 1 treino')
await p.$eval('[data-testid=wk-import-add]', (b) => b.click())
await p.waitForFunction(() => location.pathname === '/treinos')
const after = (await stored()).find((w) => w.name === 'S1 A Base 6x2')
if ((await stored()).length !== 3 || after.id !== before.id || after.status !== 'feito' || after.items[0].target.min !== 525) throw new Error('Atualização: ' + JSON.stringify({ n: (await stored()).length, id: after.id === before.id, st: after.status, t: after.items[0].target }))
// volta ao estado do teste
await p.evaluate((id) => { const d = JSON.parse(localStorage.getItem('minhas-corridas:v1')); d.workouts = d.workouts.map((w) => (w.id === id ? { ...w, status: 'planejado' } : w)); localStorage.setItem('minhas-corridas:v1', JSON.stringify(d)) }, before.id)
await p.goto(`${BASE}/treinos/importar#p=${code}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-import-add]')
await p.$eval('[data-testid=wk-import-add]', (b) => b.click())
await p.waitForFunction(() => location.pathname === '/treinos')
ok('Mesmo nome e data com passos novos (pace): “Atualizar 1 treino” atualiza no lugar, mantendo id e status')

// 3. Arquivo .json (mesmo formato) e link quebrado
const dir = path.resolve(SHOTS, 'r21')
fs.mkdirSync(dir, { recursive: true })
const file = path.join(dir, 'treinos.json')
fs.writeFileSync(file, JSON.stringify({ v: 1, title: 'Arquivo', workouts: [{ name: 'Rodagem 30', date: null, items: [{ type: 'corrida', duration: t(30) }] }] }))
await p.goto(`${BASE}/treinos/importar`, { waitUntil: 'networkidle0' })
await (await p.$('[data-testid=wk-import-file]')).uploadFile(file)
await p.waitForSelector('[data-testid=wk-import-item]')
await need('sem data')
await p.$eval('[data-testid=wk-import-add]', (b) => b.click())
await p.waitForFunction(() => location.pathname === '/treinos')
if ((await stored()).length !== 4) throw new Error('Arquivo não importado')
await p.goto(`${BASE}/treinos/importar#p=abc!!`, { waitUntil: 'networkidle0' })
await need('não é válido')
ok('Arquivo .json importa (sem data vai para “Sem data”); link quebrado avisa sem quebrar o app')

// 4. Montar no Garmin Connect: passos com os campos do editor da Garmin
const id = (await stored()).find((w) => w.name === 'S1 A Base 6x2').id
await p.goto(`${BASE}/treinos/${id}`, { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=wk-send]', (b) => b.click())
await p.waitForSelector('[data-testid=wk-gc]')
await p.$eval('[data-testid=wk-gc]', (b) => b.click())
await p.waitForSelector('[data-testid=wk-gc-guide]')
const lines = await p.$$eval('.gc-steps li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
const want = ['Aquecimento — Tempo · 05:00 — Sem meta', 'Repetir 6 vezes:', 'Corrida — Tempo · 02:00 — Sem meta (Corrida leve)', 'Recuperação — Tempo · 01:00 — Sem meta (Caminhada)', 'Desaquecimento — Tempo · 05:00 — Sem meta']
if (JSON.stringify(lines) !== JSON.stringify(want)) throw new Error('Passos para o Garmin Connect:\n' + lines.join('\n'))
await need('Enviar para dispositivo')
await shot('garmin-connect')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('“Montar no Garmin Connect”: ' + lines.join(' | '))

// 5. Mandar sem cabo: texto do Intervals.icu e prompt para o Claude (um treino e os próximos)
await p.$eval('[data-testid=send-auto]', (b) => b.click())
await p.waitForSelector('[data-testid=copy-intervals]')
await p.evaluate(() => document.querySelector('[data-testid=copy-intervals] button').click())
await p.waitForSelector('[data-testid=copy-intervals] textarea')
const iv = await p.$eval('[data-testid=copy-intervals] textarea', (t) => t.value)
if (iv !== 'Aquecimento\n- 5m\n\nSérie 6x\n- Corrida leve 2m\n- Caminhada 1m\n\nDesaquecimento\n- 5m') throw new Error('Intervals:\n' + iv)
await p.evaluate(() => document.querySelector('[data-testid=copy-claude] button').click())
await p.waitForSelector('[data-testid=copy-claude] textarea')
const pr = await p.$eval('[data-testid=copy-claude] textarea', (t) => t.value)
if (!pr.includes('1. "S1 A Base 6x2" — agendar para 17/11/2099') || !pr.includes('Repetir 6 vezes:') || !pr.includes('Enviar para dispositivo')) throw new Error('Prompt:\n' + pr)
await p.goto(`${BASE}/treinos`, { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelector('[data-testid=copy-claude-all] button').click())
await p.waitForSelector('[data-testid=copy-claude-all] textarea')
const all = await p.$eval('[data-testid=copy-claude-all] textarea', (t) => t.value)
if (!all.includes('estes 3 treinos de corrida') || !all.includes('3. "S4 B Teste 5 km"')) throw new Error('Prompt dos próximos:\n' + all.slice(0, 400))
const overflow2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow2 > 0) throw new Error('Rolagem lateral com o texto aberto: ' + overflow2)
ok('Sem cabo: texto do Intervals.icu (Aquecimento / Série 6x / Desaquecimento), prompt do treino e prompt dos 3 próximos para o Claude')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 21 passaram.')
