// Rodada 34: reta final da prova. Data fixa: quarta, 18/11/2026; Corrida de Natal (10 km, meta 1:15:00) em 12/12.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada34.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-18T13:00:00Z')
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
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 3000)}`) }
const waitText = async (s, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))

const races = [{ id: 'na', name: 'Corrida de Natal', date: '2026-12-12', status: 'inscrita', city: 'Jundiaí', state: 'SP', distanceKm: 10, startTime: '07:00', targetTime: 4500, kitPickupDate: '2026-12-11', kitPickupTime: '10:00' }]
const ws = [{ id: 'sab', name: 'Longão', date: '2026-11-21', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 2400 }, target: { kind: 'none' } }], notes: '', result: null, goalId: null }]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r, w) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races, ws)

// 1. Na prova: a linha do tempo
await p.goto(BASE + '/corridas/na', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=final-stretch]')
await need('Faltam 24 dias')
const titles = await p.$$eval('[data-testid=stretch-item] b', (b) => b.map((x) => x.innerText))
for (const t of ['Treino no ritmo da prova', 'Testar a roupa e o tênis da prova num treino', 'Último treino forte', 'Semana da prova mais leve', 'Retirar o kit', 'Separar tudo', 'Café da manhã por volta das 04:30', 'Registrar o resultado e postar a medalha']) if (!titles.includes(t)) throw new Error('Falta: ' + t + ' em ' + titles)
await need('Uns 4 km a 7:30 /km')
await p.screenshot({ path: `${SHOTS}/r34-reta.png`, fullPage: true })
ok(`Reta final na prova: ${titles.length} itens (ritmo, roupa, último forte, semana leve, stories, logística, kit, sono, separar, café às 04:30, modo prova, resultado)`)

// 2. Criar o treino “ritmo de prova” pela regra (dia livre, longe do Longão)
await p.$eval('[data-testid=stretch-create-pace]', (b) => b.click())
await waitText('Treino criado para ter 24/11')
await p.waitForSelector('[data-testid=workout-detail]')
await need('Ritmo de prova 4 km')
await need('7:25–7:35')
let d = await data()
const pw = d.workouts.find((w) => w.name === 'Ritmo de prova 4 km')
if (pw.date !== '2026-11-24' || pw.raceId !== 'na') throw new Error('Treino: ' + JSON.stringify(pw))
await p.goto(BASE + '/corridas/na', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=final-stretch]')
await need('planejado: “Ritmo de prova 4 km” (ter 24/11)')
ok('“+ Criar este treino”: “Ritmo de prova 4 km” (4 km a 7:25–7:35) em ter 24/11, ligado à prova')

// 3. Marcar à mão
const idx = titles.indexOf('Testar a roupa e o tênis da prova num treino')
await p.$$eval('[data-testid=stretch-item] .st-mark', (b, i) => b[i].click(), idx)
await wait(300)
d = await data()
if (!d.races[0].stretchDone.includes('roupa')) throw new Error('Não marcou: ' + JSON.stringify(d.races[0].stretchDone))
await need('1 de')
ok('Marcar “Testar a roupa e o tênis” guarda na prova (sincroniza)')

// 4. Início: o próximo item da reta final
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=stretch-home]')
const home = await p.$eval('[data-testid=stretch-home]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!home.includes('Reta final · Corrida de Natal') || !home.includes('faltam 24 dias') || !home.includes('ter 24/11: Treino no ritmo da prova')) throw new Error('Início: ' + home)
const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
ok(`Início: “${home.trim()}”`)

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 34 passaram.')
