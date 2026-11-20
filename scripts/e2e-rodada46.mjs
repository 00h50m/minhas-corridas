// Rodada 46: relatório para o treinador (período da ficha, cargas, PDF por impressão, texto, link só de
// leitura que abre sem conta e sem o menu do app) e o painel “Está tudo ligado?”. O banco é simulado
// interceptando a chamada da função get_shared_report. Data fixa: sexta, 20/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada46.mjs
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
  const fixed = Date.parse('2026-11-20T23:00:00Z')
  const Real = Date
  class FakeDate extends Real { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } }
  window.Date = FakeDate
  window.print = () => { window.__printed = (window.__printed || 0) + 1 }
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|supabase|ERR_/.test(m.text()) && errors.push(m.text()))
let shared = null
await p.setRequestInterception(true)
p.on('request', (r) => {
  const u = r.url()
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
  if (/\/rest\/v1\/rpc\/get_shared_report/.test(u)) return r.method() === 'OPTIONS' ? r.respond({ status: 204, headers: cors }) : r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(shared ? [shared] : []) })
  if (/supabase\.co|\/api\/push/.test(u)) return r.respond({ status: 503, contentType: 'application/json', body: '{}' })
  r.continue()
})
const T = (sel = 'body') => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '))
const has = async (sel, list) => { const t = (await T(sel)).toLowerCase(); for (const x of list) if (!t.includes(x.toLowerCase())) throw new Error(`Em ${sel} faltou “${x}”:\n${t.slice(0, 2500)}`) }
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })

const ficha = { programs: [{ id: 'f1', title: 'Treino em academia', goal: 'Definição', from: '2026-11-02', to: '2026-12-04', coach: 'Treinador Exemplo', sheets: [
  { id: 'sa', label: 'A', exercises: [{ id: 'e1', name: 'Agachamento', note: '', sets: 3, reps: '12', rest: '1 minuto', withNext: false }, { id: 'e2', name: 'Cadeira extensora', note: '', sets: 2, reps: '12', rest: '1 minuto', withNext: false }] },
  { id: 'sb', label: 'B', exercises: [{ id: 'e3', name: 'Remada', note: '', sets: 3, reps: '12', rest: '1 minuto', withNext: false }] }] }], activeId: 'f1' }
const ex = [{ name: 'Agachamento', sets: 3, repsText: '12', cat: 28, reps: 12 }, { name: 'Cadeira extensora', sets: 2, repsText: '12', cat: null, reps: 12 }]
const gym = (id, date, entries) => ({ id, name: 'Treino A', sport: 'academia', date, status: 'feito', items: [], notes: '', goalId: null, result: null, exercises: ex, ficha: { programId: 'f1', sheetId: 'sa', label: 'A' }, gymLog: { startedAt: `${date}T20:00:00Z`, endedAt: `${date}T20:50:00Z`, entries } })
const ws = [
  gym('a1', '2026-11-04', [{ i: 0, n: 1, kg: 40, reps: 12 }, { i: 0, n: 2, kg: 40, reps: 12 }, { i: 0, n: 3, kg: 45, reps: 10 }, { i: 1, n: 1, kg: 30, reps: 12 }]),
  gym('a2', '2026-11-11', [{ i: 0, n: 1, kg: 45, reps: 12 }, { i: 0, n: 2, kg: 50, reps: 10 }, { i: 0, n: 3, kg: 50, reps: 8 }, { i: 1, n: 1, kg: 30, reps: 12 }, { i: 1, n: 2, kg: 35, reps: 12 }]),
  { id: 'r1', name: 'Rodagem', date: '2026-11-05', status: 'feito', items: [], notes: '', goalId: null, result: { distanceKm: 5, elapsedSec: 1800 } },
  { id: 'r2', name: 'Longo', date: '2026-11-09', status: 'feito', items: [], notes: '', goalId: null, result: { distanceKm: 10, elapsedSec: 3900 } }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w, f) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: w })); localStorage.setItem('minhas-corridas:ficha', JSON.stringify(f)); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws, ficha)

// 1. Ficha → Relatório: período da ficha, contagens e cargas
await p.goto(BASE + '/academia', { waitUntil: 'networkidle0' })
await tap('[data-testid=ficha-report]')
await p.waitForSelector('[data-testid=report]')
await has('[data-testid=report]', ['02/11/2026 a 20/11/2026', 'Treino em academia', 'Definição', 'Treinador Exemplo', 'academia', 'km em 2 corridas', '90%', 'Treino A', '2×', '04/11 · 11/11', 'Treino B', 'não feito', 'Séries: 9 de 10 (faltaram 1)', 'Agachamento', '45 → 50 kg', '40/40/45 kg · 12/12/10 reps', 'Cadeira extensora', '1/2 séries', 'pace médio 6:20/km', 'Semana a semana'])
await p.screenshot({ path: `${SHOTS}/r46-relatorio.png`, fullPage: true })
ok('Relatório do período da ficha: vezes por treino (A 2×, B não feito), séries 9 de 10, cargas por exercício (Agachamento 45 → 50 kg), corridas e semanas')

// 2. PDF (impressão) e texto; sem conta, explica o link
await tap('[data-testid=rp-pdf]')
if ((await p.evaluate(() => window.__printed)) !== 1) throw new Error('Não abriu a impressão')
await p.$eval('[data-testid=rp-text] button', (b) => b.click())
await p.waitForSelector('[data-testid=rp-text] textarea')
const txt = await p.$eval('[data-testid=rp-text] textarea', (t) => t.value)
for (const x of ['Relatório de treinos · 02/11/2026 a 20/11/2026', 'Treino A: 2× · Treino B: 0×', '- Agachamento: 45 kg → 50 kg (2×)']) if (!txt.includes(x)) throw new Error('Texto sem: ' + x + '\n' + txt)
await has('[data-testid=coach-report]', ['entre na sua conta'])
const hidden = await p.evaluate(() => { const st = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules] } catch { return [] } }).filter((r) => r.media && /print/.test(r.media.mediaText)).map((r) => r.cssText).join(' '); return /\.no-print/.test(st) && /\.bottom-nav/.test(st) })
if (!hidden) throw new Error('Sem regras de impressão')
ok('“Baixar PDF” abre a impressão (sem menu e botões no papel); “Copiar resumo em texto”; sem conta, explica que o link precisa de conta')

// 3. Período: últimos 30 dias
await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.innerText.includes('Últimos 30 dias')).click())
await wait(200)
await has('[data-testid=report]', ['22/10/2026 a 20/11/2026'])
ok('Troca de período (últimos 30 dias)')

// 4. Link público: abre sem o menu do app; vencido/apagado avisa
shared = { title: 'Relatório 02/11 a 20/11/2026', created_at: '2026-11-20T23:00:00Z', expires_at: '2027-02-18T23:00:00Z' }
shared.data = { period: { from: '2026-11-02', to: '2026-11-20', days: 19 }, program: { title: 'Treino em academia', goal: 'Definição', coach: 'Treinador Exemplo' }, gym: { sessions: 2, bySheet: [{ label: 'A', count: 2, dates: ['2026-11-04', '2026-11-11'] }], loose: 0, perWeek: 0.7, missedSets: 1, plannedSets: 10, avgMin: 50, exercises: [{ name: 'Agachamento', sessions: [{ date: '2026-11-04', sheet: 'A', maxKg: 45, kgs: [40, 40, 45], reps: [12, 12, 10], done: 3, planned: 3 }], firstKg: 45, lastKg: 45, bestKg: 45 }] }, runs: { count: 2, km: 15, min: 95, paceSec: 380, longestKm: 10 }, other: {}, skipped: 0, races: [], weeks: [{ start: '2026-11-02', gym: 1, runs: 1, km: 5, load: 160, min: 80 }] }
const token = 'a'.repeat(64)
await p.goto(`${BASE}/r/${token}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=report]')
await has('body', ['relatório compartilhado', '02/11/2026 a 20/11/2026', 'Agachamento', '40/40/45 kg'])
if (await p.$('.bottom-nav, .side-nav')) throw new Error('Link público com o menu do app')
await p.screenshot({ path: `${SHOTS}/r46-publico.png` })
shared = null
await p.goto(`${BASE}/r/${token}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=sr-missing]')
ok('Link /r/…: o treinador vê o relatório sem conta e sem o menu do app; link vencido ou apagado avisa')

// 5. Está tudo ligado?
await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
await tap('[data-testid=status-link]')
await p.waitForSelector('[data-testid=setup-status]')
const st = await p.$$eval('[data-status]', (e) => Object.fromEntries(e.map((x) => [x.dataset.testid, x.dataset.status])))
if (!st['st-conta'] || st['st-cron'] !== 'check' || st['st-garmin'] !== 'off' || st['st-ficha'] !== 'ok' || st['st-ciclo'] !== 'off') throw new Error('Status: ' + JSON.stringify(st))
await has('[data-testid=setup-status]', ['Conta', 'Notificações', 'Envios automáticos (8h e 20h)', 'Cron Jobs', 'Garmin', 'Ficha da academia', 'Ciclo menstrual'])
await p.screenshot({ path: `${SHOTS}/r46-status.png`, fullPage: true })
ok(`Ajustes → “Está tudo ligado?”: conta (${st['st-conta']}), notificações (${st['st-push']}), envios para conferir na Vercel, Garmin desligado, ficha ok, ciclo desligado`)

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of ['/academia/relatorio', '/ajustes/status', `/r/${token}`]) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 46 passaram.')
