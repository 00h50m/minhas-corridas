// Rodada 23: semana de treinos (Treinos e Início): dias com treino, planejado × feito, tempo e km, sequência.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada23.mjs
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
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2000)}`) }

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const shift = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const dow = await p.evaluate(() => (new Date().getDay() + 6) % 7) // segunda = 0
const mon = shift(today, -dow)
const item = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, date, status, min, result = null) => ({ id, name: id, date, status, items: item(min), notes: '', result, createdAt: null, updatedAt: null })
const workouts = [
  // Semana passada cumprida (terça e sábado) e esta semana: terça feita com relógio, sábado planejado
  W('Passada Ter', shift(mon, -6), 'feito', 28), W('Passada Sab', shift(mon, -2), 'feito', 37),
  W('Ter', shift(mon, 1), 'feito', 28, { distanceKm: 4.2, elapsedSec: 1800, laps: [] }),
  W('Sab', shift(mon, 5), 'planejado', 37),
  W('Proxima Ter', shift(mon, 8), 'planejado', 30)
]
await p.evaluate((ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [{ id: 'r', name: 'Prova', date: '2099-01-01', status: 'inscrita' }], goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, workouts)

// 1. Treinos: esta semana
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=training-week]')
await need('Esta semana')
const totals = await p.$eval('[data-testid=week-totals]', (e) => e.innerText)
if (totals !== '1 de 2 treinos · 30 min de 1 h 05 · 4,2 km') throw new Error('Totais: ' + totals)
const days = await p.$$eval('[data-testid=training-week] .tw-day', (d) => d.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (days.length !== 7 || !days[0].toLowerCase().startsWith('seg') || !days[1].includes('✓') || !/[●○!]/.test(days[5])) throw new Error('Dias: ' + days.join(' | '))
const streak = await p.$eval('[data-testid=week-streak]', (e) => e.innerText)
if (!streak.includes('1 semana cumprida')) throw new Error('Sequência: ' + streak)
await p.screenshot({ path: `${SHOTS}/r23-semana.png`, fullPage: true })
ok(`Esta semana: ${totals}; Ter ✓, Sáb planejado; 🔥 1 semana cumprida (a passada)`)

// 2. Navegar: semana passada (completa) e próxima; tocar no dia abre o treino
await p.click('button[aria-label="Semana anterior"]')
await need('Semana passada')
if ((await p.$eval('[data-testid=week-totals]', (e) => e.innerText)) !== '2 de 2 treinos · 1 h 05 de 1 h 05') throw new Error('Semana passada: ' + (await p.$eval('[data-testid=week-totals]', (e) => e.innerText)))
await p.click('button[aria-label="Próxima semana"]')
await p.click('button[aria-label="Próxima semana"]')
await need('Próxima semana')
await need('0 de 1 treino')
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Voltar para esta semana').click())
await need('Esta semana')
await p.evaluate(() => document.querySelectorAll('[data-testid=training-week] .tw-day.has')[0].click())
await p.waitForSelector('[data-testid=workout-detail]')
await need('Ter')
ok('Semana passada 2 de 2 (1 h 05); próxima 0 de 1; “Voltar para esta semana”; tocar no dia abre o treino')

// 3. Início: resumo compacto da semana
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-compact]')
const home = await p.$eval('[data-testid=week-compact]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!home.includes('1 de 2 treinos') || !home.includes('🔥 1 semana cumprida')) throw new Error('Início: ' + home)
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Início: semana compacta (1 de 2 treinos · 🔥 1 semana cumprida); 390 px sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 23 passaram.')
