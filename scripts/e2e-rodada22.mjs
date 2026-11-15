// Rodada 22: tela de Corridas — atalhos de status com contagem, "Em N dias", separação por mês,
// avisos que pedem ação (kit, inscrição, resultado) e anteriores recolhidas.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada22.mjs
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
const items = () => p.$$eval('.race-item', (a) => a.map((x) => x.innerText.replace(/\s+/g, ' ')))
const card = async (name) => (await items()).find((t) => t.includes(name)) ?? ''

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const d = (n) => { const [y, m, dd] = today.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const R = (id, name, n, status, extra = {}) => ({ id, name, date: n == null ? null : d(n), status, distanceKm: 5, city: 'Jundiaí', state: 'SP', startTime: '07:00', ...extra })
const races = [
  R('a', 'Hoje Run', 0, 'inscrita'),
  R('b', 'Natal Run', 3, 'inscrita', { kitPickupDate: d(1) }),
  R('c', 'Kit Feito', 4, 'inscrita', { kitPickupDate: d(1), checklist: [{ id: 'k', text: 'Kit retirado', done: true }] }),
  R('e', 'Silvestre', 46, 'aberta', { signupDeadline: d(5) }),
  R('f', 'Longe', 200, 'interesse'),
  R('g', 'Sem Data', null, 'interesse'),
  R('p1', 'Passada 1', -10, 'inscrita'),
  R('p2', 'Passada 2', -20, 'concluida', { result: { netTime: 1800 } }),
  R('p3', 'Passada 3', -30, 'concluida', { result: { netTime: 1810 } }),
  R('p4', 'Passada 4', -40, 'concluida', { result: { netTime: 1820 } }),
  R('p5', 'Passada 5', -50, 'desisti'),
  R('p6', 'Passada 6', -60, 'concluida', { result: { netTime: 1830 } }),
  R('p7', 'Passada 7', -70, 'cancelada')
]
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races)
await p.goto(BASE + '/corridas', { waitUntil: 'networkidle0' })

// 1. Quanto falta no lugar da data repetida; avisos que pedem ação
if (!(await card('Hoje Run')).includes('Hoje · 07:00')) throw new Error(await card('Hoje Run'))
if (!(await card('Natal Run')).includes('Em 3 dias') || !(await card('Natal Run')).includes('Kit amanhã')) throw new Error(await card('Natal Run'))
if ((await card('Kit Feito')).includes('Kit amanhã')) throw new Error('Aviso de kit já retirado')
const silv = await card('Silvestre')
if (!silv.includes('Em 46 dias') || !silv.includes(`Inscrição até ${d(5).slice(8, 10)}/${d(5).slice(5, 7)}`)) throw new Error(silv)
if (!(await card('Longe')).includes(`${d(200).slice(8, 10)}/${d(200).slice(5, 7)}/${d(200).slice(0, 4)}`)) throw new Error('Data longe: ' + (await card('Longe')))
if (!(await card('Passada 1')).includes('Registrar resultado')) throw new Error(await card('Passada 1'))
ok('Cartões: “Hoje”, “Em 3 dias”, “Em 46 dias” (data só quando longe); “Kit amanhã” (não se já retirado), “Inscrição até …”, “Registrar resultado”')

// 2. Próximas separadas por mês
const seps = await p.$$eval('[data-testid=month-sep]', (s) => s.map((x) => x.innerText))
if (seps.length < 2) throw new Error('Separadores: ' + seps)
ok('Próximas separadas por mês: ' + seps.join(', '))

// 3. Anteriores: as 5 mais recentes + “Ver todas”
let list = await items()
if (list.filter((t) => t.includes('Passada')).length !== 5 || list.some((t) => t.includes('Passada 6'))) throw new Error('Anteriores recolhidas: ' + list.filter((t) => t.includes('Passada')))
await p.$eval('[data-testid=all-past]', (b) => b.click())
await wait(200)
list = await items()
if (list.filter((t) => t.includes('Passada')).length !== 7) throw new Error('Ver todas não mostrou todas')
ok('Anteriores: 5 mais recentes e “Ver todas as anteriores (7)”')

// 4. Atalhos com contagem
const quick = await p.$$eval('.quick-status button', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (quick.join(' | ') !== 'Todas 13 | Inscritas 4 | Interesse 3 | Concluídas 4') throw new Error('Atalhos: ' + quick.join(' | '))
await p.$eval('[data-testid=quick-interesse]', (b) => b.click())
await wait(200)
list = await items()
if (list.length !== 3 || !list.every((t) => /Tenho interesse|Inscrição aberta/.test(t))) throw new Error('Interesse: ' + list)
await p.$eval('[data-testid=quick-todas]', (b) => b.click())
await wait(200)
if ((await items()).length < 10) throw new Error('Todas não voltou')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
await p.screenshot({ path: `${SHOTS}/r22-corridas.png`, fullPage: true })
ok('Atalhos: Todas 13 · Inscritas 4 · Interesse 3 · Concluídas 4; “Interesse” filtra; sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 22 passaram.')
