// Rodada 47: Decidir com a nota “vale a pena” — ordem pela nota, selo na melhor, motivos, nota provisória
// sem preço, perfis (equilíbrio, economia, desempenho) e os critérios em barras. Data fixa: 25/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada47.mjs
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
  const fixed = Date.parse('2026-11-25T15:00:00Z')
  const Real = Date
  class FakeDate extends Real { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } }
  window.Date = FakeDate
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = (sel = 'body') => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '))
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
const cards = () => p.$$eval('[data-testid=candidate]', (e) => e.map((x) => ({ name: x.querySelector('.t').innerText, score: x.querySelector('.worth-score').innerText, top: !!x.querySelector('[data-testid=worth-top]'), why: x.querySelector('[data-testid=worth]').innerText.replace(/\s+/g, ' ') })))

const R = (o) => ({ id: o.name, state: 'SP', result: null, ...o })
const races = [
  R({ name: 'Antiga A', date: '2026-10-05', status: 'concluida', distanceKm: 5, fee: 100, city: 'Jundiaí', result: { netTime: 2300, officialDistanceKm: 5, isOfficial: true } }),
  R({ name: 'Antiga B', date: '2026-10-19', status: 'concluida', distanceKm: 5, fee: 90, city: 'Jundiaí', result: { netTime: 2350, officialDistanceKm: 5, isOfficial: true } }),
  R({ name: 'São Silveira', date: '2026-12-13', status: 'inscrita', distanceKm: 7.5, fee: 110, city: 'Barueri' }),
  R({ name: 'Corre Sunset', date: '2026-12-19', status: 'interesse', distanceKm: 5, fee: 149.9, city: 'Jundiaí' }),
  R({ name: 'Rústica 10K', date: '2027-01-24', status: 'aberta', distanceKm: 10, fee: 260, city: 'Campinas', wish: 3 }),
  R({ name: 'Corrida do Parque', date: '2027-01-10', status: 'interesse', distanceKm: 5, fee: 45, city: 'Jundiaí', wish: 2 }),
  R({ name: 'Corrida do Chaves', date: '2027-04-25', status: 'interesse', distanceKm: 5, city: 'Campinas' })
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { city: 'Jundiaí', name: 'Gi' } })) }, races)

// 1. Decidir: ordenado pela nota, selo na melhor, motivos
await p.goto(BASE + '/decidir', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=worth]')
let c = await cards()
const scores = c.map((x) => parseInt(x.score, 10)).filter((n) => !Number.isNaN(n))
if (scores.join() !== [...scores].sort((a, b) => b - a).join()) throw new Error('Fora de ordem: ' + JSON.stringify(c))
const top = c.find((x) => x.top)
if (!top || top.name !== c[0].name || top.score.includes('*')) throw new Error('Selo: ' + JSON.stringify(c))
const chaves = c.find((x) => x.name === 'Corrida do Chaves')
if (!chaves.score.includes('*') || chaves.top || !/Falta: preço/.test(chaves.why)) throw new Error('Sem preço: ' + JSON.stringify(chaves))
const sunset = c.find((x) => x.name === 'Corre Sunset')
if (!/acima do que você costuma pagar/.test(sunset.why)) throw new Error('Sunset: ' + JSON.stringify(sunset))
await p.screenshot({ path: `${SHOTS}/r47-decidir.png`, fullPage: true })
ok(`Decidir pela nota: ${c.map((x) => `${x.name} ${x.score}`).join(' · ')}; selo “Vale mais a pena” em ${top.name}; Chaves sem preço com nota provisória (*); Sunset acima do que você costuma pagar`)

// 2. Perfis mudam a ordem
await tap('[data-testid=worth-economia]')
await wait(200)
const eco = (await cards())[0].name
await tap('[data-testid=worth-desempenho]')
await wait(200)
const des = (await cards())[0].name
if (eco !== 'Corrida do Parque' || des !== 'Rústica 10K') throw new Error(`Perfis: economia ${eco}, desempenho ${des}`)
const kept = await p.evaluate(() => localStorage.getItem('paceon:perfil-decisao'))
if (kept !== 'desempenho') throw new Error('Perfil não guardado')
ok('Perfis: Economia põe a barata (Corrida do Parque) no topo; Desempenho, a distância nova (Rústica 10K); a escolha fica guardada')

// 3. Critérios em barras
await p.$eval('[data-testid=candidate] details summary', (s) => s.click())
await p.waitForSelector('[data-testid=worth-parts]')
const parts = await T('[data-testid=worth-parts]')
for (const x of ['Custo por km', 'Calendário', 'Desafio', 'Vontade', 'Perto de casa']) if (!parts.includes(x)) throw new Error('Critério ausente: ' + x)
ok('“Ver todos os fatores” mostra cada critério com barra e o motivo')

// 4. Outras ordens continuam
await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.innerText === 'Data').click())
await wait(200)
c = await cards()
if (c[0].name !== 'Corre Sunset') throw new Error('Ordem por data: ' + c.map((x) => x.name))
if (await p.$('[data-testid=worth-profile]')) throw new Error('Perfil aparece fora da ordem pela nota')
ok('Ordenar por Data/Prazo/Vontade continua funcionando (a nota segue visível em cada prova)')

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  await p.goto(BASE + '/decidir', { waitUntil: 'networkidle0' })
  const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (o > 0) throw new Error(`Rolagem lateral ${W}px: ${o}`)
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 47 passaram.')
