// Rodada 39: evolução na academia (por exercício, recorde, histórico) e calendário mensal de treinos
// (ícones por esporte, resumo do dia, arrastar no computador, remanejar no celular). Data fixa: 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada39.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
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
const T = (sel = 'body') => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '))
const has = async (sel, list) => { const t = (await T(sel)).toLowerCase(); for (const s of list) if (!t.includes(s.toLowerCase())) throw new Error(`Em ${sel} faltou “${s}”:\n${t.slice(0, 2000)}`) }

const s = (cat, reps, kg) => ({ cat, reps, kg, sec: 60 })
const gym = (id, date, sets) => ({ id, name: 'Força', sport: 'academia', date, status: 'feito', items: [], plannedMin: 60, notes: '', goalId: null, result: { source: 'garmin', elapsedSec: 3600, distanceKm: 0, avgHr: 140, calories: 400, sets } })
const step = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const ws = [
  gym('g1', '2026-10-20', [s(28, 12, 40), s(28, 10, 40), s(17, 12, 16)]),
  gym('g2', '2026-11-03', [s(28, 12, 42.5), s(28, 10, 45), s(19, null, null)]),
  gym('g3', '2026-11-17', [s(28, 12, 40), s(28, 10, 45), s(28, 8, 50), s(17, 12, 20), s(19, null, null)]),
  { id: 'rod', name: 'Rodagem', date: '2026-11-16', status: 'feito', items: step(30), notes: '', goalId: null, result: { distanceKm: 5, elapsedSec: 1800, avgHr: 150, calories: 310 } },
  { id: 'tiros', name: 'Tiros', date: '2026-11-20', status: 'planejado', items: step(40), notes: '', goalId: null, result: null },
  { id: 'bike', name: 'Bike', sport: 'bike', plannedMin: 50, date: '2026-11-21', status: 'planejado', items: [], notes: '', goalId: null, result: null }
]
const races = [{ id: 'prova', name: 'Corrida da Serra', date: '2026-11-22', status: 'inscrita', distanceKm: 10, city: 'Jundiaí', result: null }]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w, r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws, races)

// 1. Evolução na academia
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=strength-progress]')
await has('[data-testid=strength-progress]', ['Evolução na academia', 'Último treino de força ontem', '2 nas últimas 4 semanas', 'Agachamento', '3 treinos', 'recorde 50 kg', '40 → 50 kg', 'Afundo', '16 → 20 kg', 'Prancha', '1 série'])
await p.$eval('[data-testid=sp-row]', (e) => e.click())
await p.waitForSelector('[data-testid=sp-sheet]')
await has('[data-testid=sp-sheet]', ['3 treinos', '50 kg', 'recorde de carga', '17/11/2026', '3 séries · 30 reps', '03/11/2026', '45 kg', '20/10/2026', '40 kg'])
await p.screenshot({ path: `${SHOTS}/r39-sheet.png` })
await p.keyboard.press('Escape')
await wait(300)
if (await p.$('[data-testid=sp-sheet]')) await p.$eval('.sheet-backdrop, .backdrop', (e) => e.click()).catch(() => {})
await p.screenshot({ path: `${SHOTS}/r39-progress.png` })
ok('Evolução na academia: último treino de força, carga por exercício (Agachamento 40 → 50 kg, recorde), histórico num toque')

// 2. Recorde no treino e no Passaporte
await p.goto(BASE + '/treinos/g3', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=det-pr]')
const prs = await p.$$eval('[data-testid=det-pr]', (e) => e.map((x) => x.closest('li').innerText.split('\n')[0]))
if (prs.length !== 2 || !prs.join().includes('Agachamento') || !prs.join().includes('Afundo')) throw new Error('Recordes: ' + prs)
await p.goto(BASE + '/treinos/g1', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=det-sets]')
if (await p.$('[data-testid=det-pr]')) throw new Error('Primeiro treino marcado como recorde')
await p.goto(BASE + '/passaporte', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=pp-tab-records]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await p.waitForSelector('[data-testid=pp-lifts]')
await has('[data-testid=pp-lifts]', ['Agachamento', '50 kg', '17/11/2026', 'Afundo', '20 kg'])
ok('Selo “recorde” no exercício que superou a carga anterior; recordes de força no Passaporte')

// 3. Calendário mensal
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=wk-view-month]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await p.waitForSelector('[data-testid=wk-month]')
if (!p.url().includes('ver=mes')) throw new Error('Visão do mês não fica na URL')
await has('[data-testid=wm-summary]', ['3 de 5 treinos feitos', '2:30:00', '5 km'])
const cell = async (d) => p.$eval(`[data-testid=wm-day-${d}]`, (e) => ({ icons: e.querySelectorAll('.wm-ic').length, cls: [...e.querySelectorAll('.wm-ic')].map((x) => x.className).join(' '), lab: e.querySelector('.wm-lab')?.innerText ?? '', aria: e.getAttribute('aria-label') }))
const d17 = await cell('2026-11-17')
if (d17.icons !== 1 || !d17.cls.includes('ws-feito') || d17.lab !== '1h00') throw new Error('Dia 17: ' + JSON.stringify(d17))
const d16 = await cell('2026-11-16')
if (d16.lab !== '5,0km') throw new Error('Dia 16: ' + JSON.stringify(d16))
const d22 = await cell('2026-11-22')
if (!d22.cls.includes('wm-race') || !d22.aria.includes('Corrida da Serra')) throw new Error('Dia 22: ' + JSON.stringify(d22))
const d21 = await cell('2026-11-21')
if (!d21.cls.includes('ws-futuro')) throw new Error('Dia 21: ' + JSON.stringify(d21))
await p.$eval('[data-testid=wm-day-2026-11-17]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await has('[data-testid=wm-day]', ['Força', 'feito', '1:00:00', 'duração', '140', 'FC média', '400', 'kcal', '5', 'séries · 3 exerc.'])
await p.$eval('[data-testid=wm-day-2026-11-16]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await has('[data-testid=wm-day]', ['Rodagem', '5,00 km', '30:00', '150', '310'])
await p.screenshot({ path: `${SHOTS}/r39-month.png`, fullPage: true })
ok('Mês: ícone por esporte e cor pela situação, km/tempo no dia, prova marcada; toque mostra duração, FC, kcal e séries')

// 4. Celular: remanejar pelo resumo do dia
await p.$eval('[data-testid=wm-day-2026-11-20]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await p.$eval('[data-testid=wm-move]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await p.waitForSelector('[data-testid=reschedule]')
await p.$eval('[data-testid=rs-opt]', (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
await wait(400)
const moved = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).workouts.find((w) => w.id === 'tiros'))
if (moved.date === '2026-11-20' || !moved.moves?.length) throw new Error('Não remanejou: ' + JSON.stringify(moved))
ok(`Celular: “Remanejar” no resumo do dia → Tiros foi para ${moved.date}, com o histórico`)

// 5. Computador: arrastar um treino planejado para outro dia
await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
await p.goto(BASE + '/treinos?ver=mes', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-month]')
const hint = await p.$eval('.wm-drag-hint', (e) => getComputedStyle(e).display)
if (hint === 'none') throw new Error('Dica de arrastar escondida no computador')
await p.evaluate(() => {
  const src = document.querySelector('[data-testid=wm-day-2026-11-21] .wm-ic[draggable=true]')
  const dst = document.querySelector('[data-testid=wm-day-2026-11-24]')
  const dt = new DataTransfer()
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
  dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await wait(400)
const bike = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).workouts.find((w) => w.id === 'bike'))
if (bike.date !== '2026-11-24' || bike.moves?.at(-1)?.from !== '2026-11-21') throw new Error('Arrastar: ' + JSON.stringify(bike))
const done = await p.$eval('[data-testid=wm-day-2026-11-17] .wm-ic', (e) => e.getAttribute('draggable'))
if (done !== 'false') throw new Error('Treino feito arrastável')
await p.screenshot({ path: `${SHOTS}/r39-month-desktop.png` })
ok('Computador: arrastar a Bike de 21 para 24/11 remaneja (com histórico); treino feito não arrasta')

// 6. Sem rolagem lateral no celular pequeno
await p.setViewport({ width: 320, height: 700, isMobile: true, hasTouch: true })
for (const r of ['/treinos', '/treinos?ver=mes']) {
  await p.goto(BASE + r, { waitUntil: 'networkidle0' })
  const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (o > 0) throw new Error(`Rolagem lateral em ${r}: ${o}`)
}
ok('320 px: lista e mês sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 39 passaram.')
