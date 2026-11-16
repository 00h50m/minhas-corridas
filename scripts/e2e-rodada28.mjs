// Rodada 28: stories da rotina (1080×1920) — 6 modelos, tempos e cidades opcionais, foto de fundo,
// baixar a imagem. Salva cada story em SHOTS/r28-*.png para conferência visual.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada28.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'downloads-r28')
fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
const cdp = await p.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2000)}`) }
const save = async (name) => {
  const data = await p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png'))
  fs.writeFileSync(path.join(SHOTS, `r28-${name}.png`), Buffer.from(data.split(',')[1], 'base64'))
}

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const d = (n) => { const [y, m, dd] = today.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const dow = await p.evaluate(() => (new Date().getDay() + 6) % 7)
const mon = d(-dow)
const shift = (iso, n) => { const [y, m, dd] = iso.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const races = [
  { id: 'hc', name: 'Health Care Run - PAC Volkswagen', date: d(-1), status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } },
  { id: 'cb', name: 'Corrida do Bem', date: d(-25), status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
  { id: 'na', name: 'Corrida de Natal Jundiaí', date: d(26), status: 'inscrita', city: 'Jundiaí', state: 'SP', distanceKm: 10, startTime: '07:00', targetTime: 4500 },
  { id: 'nr', name: 'Night Run Campinas', date: d(40), status: 'inscrita', city: 'Campinas', state: 'SP', distanceKm: 5 },
  { id: 'sv', name: 'São Silvestre', date: d(45), status: 'interesse', city: 'São Paulo', state: 'SP', distanceKm: 15 }
]
const item = (min) => [{ kind: 'step', type: 'aquecimento', duration: { kind: 'time', value: 300 }, target: { kind: 'none' } }, { kind: 'repeat', times: 6, steps: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 120 }, target: { kind: 'pace', min: 525, max: 570 } }, { kind: 'step', type: 'recuperacao', duration: { kind: 'time', value: 60 }, target: { kind: 'none' } }] }, { kind: 'step', type: 'desaquecimento', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, date, status, result = null) => ({ id, name: id, date, status, items: item(5), notes: '', result, goalId: null, createdAt: null, updatedAt: null })
const workouts = [
  W('S0 A', shift(mon, -6), 'feito'), W('S0 B', shift(mon, -2), 'feito'),
  W('S1 A Base 6x2', shift(mon, 0), 'feito', { distanceKm: 4.2, elapsedSec: 1860, laps: [] }), W('S1 B Ritmo 8x1', shift(mon, 5), 'planejado'),
  W('Teste 5 km', d(-10), 'feito', { distanceKm: 5.01, elapsedSec: 2330, laps: [] })
]
await p.evaluate((races, ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races, workouts)

// 1. Início → Stories
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=stories-link]', (a) => a.click())
await p.waitForSelector('[data-testid=story-canvas]')
await wait(500)
ok('Início → “Stories da sua rotina”')

// 2. Cada modelo gera um 1080×1920
for (const id of ['proximas', 'temporada', 'semana', 'contagem', 'evolucao', 'treino']) {
  await p.$eval(`[data-testid=story-${id}]`, (b) => b.click())
  await p.waitForSelector('[data-testid=story-canvas]')
  await wait(300)
  const size = await p.$eval('[data-testid=story-canvas]', (c) => [c.width, c.height])
  if (size.join('x') !== '1080x1920') throw new Error(`${id}: ${size}`)
  await save(id)
}
ok('6 modelos geram 1080×1920 (próximas, temporada, semana, contagem, evolução, treino)')

// 3. Sem tempos: evolução avisa; contagem sem meta
await p.$eval('[data-testid=story-times]', (c) => c.click())
await p.$eval('[data-testid=story-evolucao]', (b) => b.click())
await p.waitForSelector('[data-testid=story-empty]')
await need('ative “Mostrar tempos e pace”')
await p.$eval('[data-testid=story-proximas]', (b) => b.click())
await p.waitForSelector('[data-testid=story-canvas]')
await p.$eval('[data-testid=story-cities]', (c) => c.click())
await wait(300)
await save('proximas-sem-cidades')
await p.$eval('[data-testid=story-times]', (c) => c.click())
await p.$eval('[data-testid=story-cities]', (c) => c.click())
ok('Sem tempos: evolução explica o motivo; próximas sem cidades gerado')

// 4. Baixar a imagem
await p.$eval('[data-testid=story-download]', (b) => b.click())
let file = null
for (let i = 0; i < 40 && !file; i++) { await wait(150); file = fs.readdirSync(DL).find((f) => f.startsWith('paceon-story-proximas-') && f.endsWith('.png')) }
if (!file || fs.statSync(path.join(DL, file)).size < 20000) throw new Error('PNG não baixado')
ok(`Baixar: ${file}`)

// 5. Atalhos: semana (Treinos), treino feito, contagem (prova)
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-story]')
const wid = 'S1 A Base 6x2'
await p.goto(`${BASE}/treinos/${encodeURIComponent(wid)}`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-story]')
await p.goto(`${BASE}/corridas/na`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=race-story]')
await p.$eval('[data-testid=race-story]', (a) => a.click())
await p.waitForSelector('[data-testid=story-canvas]')
if (!(await p.$eval('[data-testid=story-contagem]', (b) => b.getAttribute('aria-pressed') === 'true'))) throw new Error('Contagem não selecionada')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Atalhos: “Compartilhar a semana”, “Compartilhar este treino”, “Story da contagem” (abre no modelo certo); 390 px sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 28 passaram.')
