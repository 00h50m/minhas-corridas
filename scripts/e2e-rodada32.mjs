// Rodada 32: layout de computador (≥ 1024 px): menu lateral, Início em duas colunas, conteúdo até 1120 px,
// stories com prévia ao lado, sem rolagem lateral; no celular continua o menu de baixo.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada32.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await p.emulateTimezone('America/Sao_Paulo')
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const visible = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0 }, sel)
const box = (sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })
const noOverflow = async (where) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 0) throw new Error(`${where}: rolagem lateral de ${o}px`) }

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const sh = (n) => { const [y, m, d] = today.split('-').map(Number); return new Date(y, m - 1, d + n).toLocaleDateString('sv') }
const races = [
  { id: 'hc', name: 'Health Care Run', date: sh(-2), status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } },
  { id: 'na', name: 'Corrida de Natal Jundiaí', date: sh(25), status: 'inscrita', city: 'Jundiaí', state: 'SP', distanceKm: 10, startTime: '07:00' }
]
const ws = [{ id: 'r', name: 'Rodagem', date: today, status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1800 }, target: { kind: 'none' } }], notes: '', result: null, goalId: null }]
await p.evaluate((r, w) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:perfil-convite', String(Date.now())) }, races, ws)

// 1. Menu lateral no lugar do de baixo; Início em duas colunas
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=passport-link]')
if (!(await visible('.side-nav'))) throw new Error('Sem menu lateral')
if (await visible('.bottom-nav')) throw new Error('Menu de baixo aparecendo no computador')
const main = await box('.home-main')
const side = await box('.home-side')
if (!(side.x > main.x + main.w - 5 && Math.abs(side.y - main.y) < 40)) throw new Error(`Colunas: ${JSON.stringify({ main, side })}`)
const nav = await box('.side-nav')
if (main.x < nav.w) throw new Error('Conteúdo embaixo do menu')
await noOverflow('Início')
ok(`Computador: menu lateral (${nav.w}px), menu de baixo escondido, Início em duas colunas (${main.w}px + ${side.w}px)`)

// 2. Navegar pelo menu lateral
for (const [label, path, sel] of [['Treinos', '/treinos', '[data-testid=training-week]'], ['Passaporte', '/passaporte', '[data-testid=pp-badges]'], ['Corridas', '/corridas', '.race-item'], ['Provas perto', '/provas-perto', '[data-testid=near-links]'], ['Stories', '/stories', '[data-testid=story-canvas]']]) {
  await p.$$eval('.side-nav a', (as, label) => as.find((a) => a.innerText.trim().endsWith(label)).click(), label)
  await p.waitForSelector(sel, { timeout: 8000 })
  if (!(await p.evaluate(() => location.pathname)).startsWith(path)) throw new Error('Foi para ' + (await p.evaluate(() => location.pathname)))
  const active = await p.$eval('.side-nav .side-item.active', (a) => a.innerText.trim())
  if (!active.endsWith(label)) throw new Error(`Ativo: ${active}, esperado ${label}`)
  await noOverflow(label)
}
ok('Menu lateral: Treinos, Passaporte, Corridas, Provas perto e Stories abrem e ficam marcados; nenhuma com rolagem lateral')

// 3. Stories: prévia à esquerda, opções à direita
await wait(300)
const prev = await box('.card-preview')
const share = await box('[data-testid=story-share]')
if (!(share.x > prev.x + prev.w)) throw new Error(`Stories: ${JSON.stringify({ prev, share })}`)
ok('Stories: prévia ao lado das opções')

// 4. Formulário com largura de leitura, alinhado ao título
await p.$eval('.side-new', (a) => a.click())
await p.waitForSelector('form')
const form = await box('.page')
if (form.w > 900) throw new Error('Formulário largo demais: ' + form.w)
const title = await box('.topbar h1')
if (Math.abs(form.x + 32 - title.x) > 70) throw new Error(`Formulário desalinhado do título: ${form.x} × ${title.x}`)
await p.screenshot({ path: `${SHOTS}/r32-form.png` })
ok(`“Cadastrar corrida”: formulário com ${form.w}px, alinhado ao título`)

// 5. Celular: continua igual
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=passport-link]')
if (await visible('.side-nav')) throw new Error('Menu lateral no celular')
if (!(await visible('.bottom-nav'))) throw new Error('Sem menu de baixo no celular')
const m2 = await box('.home-main')
const s2 = await box('.home-side')
if (!(s2.y > m2.y + m2.h - 5)) throw new Error('Celular: colunas lado a lado')
await noOverflow('Início (celular)')
ok('Celular: menu de baixo, sem menu lateral, Início em uma coluna')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 32 passaram.')
