// Rodada 31: semana que fechou (card no Início na segunda, story da semana passada), story de prova
// concluída (medalha) e resumo do mês. Data fixa: segunda, 23/11/2026, 10h em Brasília.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada31.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-23T13:00:00Z')
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
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const save = async (name) => {
  const data = await p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png'))
  fs.writeFileSync(path.join(SHOTS, `r31-${name}.png`), Buffer.from(data.split(',')[1], 'base64'))
}
const pressed = (id) => p.$eval(`[data-testid=story-${id}]`, (b) => b.getAttribute('aria-pressed') === 'true')

const run = (id, date, status, result = null) => ({ id, name: id, date, status, items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1800 }, target: { kind: 'none' } }], notes: '', result, goalId: null })
const workouts = [
  run('Base 6x2', '2026-11-17', 'feito', { distanceKm: 4.2, elapsedSec: 1860, laps: [] }),
  run('Ritmo 8x1', '2026-11-21', 'feito', { distanceKm: 4.6, elapsedSec: 2040, laps: [] }),
  run('Antiga A', '2026-11-10', 'feito'), run('Antiga B', '2026-11-13', 'feito'),
  { id: 'ac', name: 'Pernas', sport: 'academia', plannedMin: 50, date: '2026-11-19', status: 'feito', items: [], notes: '', result: null, goalId: null }
]
const races = [
  { id: 'cb', name: 'Corrida do Bem', date: '2026-10-20', status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
  { id: 'hc', name: 'Health Care Run - PAC Volkswagen', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, targetTime: 2400, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true, overallPlace: 812, categoryPlace: 45, category: 'F30-34' } }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races, ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races, workouts)

// 1. Segunda-feira: card da semana que fechou → story da semana passada
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-recap]')
const card = await p.$eval('[data-testid=week-recap]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!card.includes('Semana fechada: 3 de 3 treinos') || !card.includes('2 semanas seguidas')) throw new Error('Card: ' + card)
await p.$eval('[data-testid=week-recap]', (a) => a.click())
await p.waitForSelector('[data-testid=story-canvas]')
await wait(400)
if (!(await pressed('semana'))) throw new Error('Semana não selecionada')
await save('semana-passada')
ok(`Segunda: “${card.trim()}” → story da semana 16/11 a 22/11`)

// 2. Prova concluída: atalho no detalhe da prova
await p.goto(BASE + '/corridas/hc', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=race-result-story]')
await p.$eval('[data-testid=race-result-story]', (a) => a.click())
await p.waitForSelector('[data-testid=story-canvas]')
await wait(400)
if (!(await pressed('resultado'))) throw new Error('Prova concluída não selecionada')
await save('resultado')
await p.$eval('[data-testid=story-times]', (c) => c.click())
await wait(300)
await save('resultado-sem-tempo')
await p.$eval('[data-testid=story-times]', (c) => c.click())
ok('Prova concluída: “📲 Story da prova (medalha)” abre o modelo; com e sem tempos')

// 3. Resumo do mês
await p.$eval('[data-testid=story-mes]', (b) => b.click())
await p.waitForSelector('[data-testid=story-canvas]')
await wait(400)
await save('mes')
const size = await p.$eval('[data-testid=story-canvas]', (c) => [c.width, c.height].join('x'))
if (size !== '1080x1920') throw new Error(size)
ok('Resumo do mês: calendário de novembro com corridas, prova e academia')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 31 passaram.')
