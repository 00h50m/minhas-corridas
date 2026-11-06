// Rodada 6: orçamento do ano e tela Decidir.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada6.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

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
const txt = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r6-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const has = async (s) => (await txt()).toLowerCase().includes(s.toLowerCase())
const expectText = async (s) => { if (!(await has(s))) throw new Error(`Esperava "${s}"\n---\n${(await txt()).slice(0, 1800)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), {}, s)
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()))
    if (el) el.click()
    return !!el
  }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const y = new Date().getFullYear()
const res = (km, t) => ({ officialDistanceKm: km, netTime: t, isOfficial: true, watch: null })
const races = [
  { id: 'pago', name: '10K de Março', status: 'concluida', date: `${y}-03-01`, distanceKm: 10, fee: 150, feePaid: 140, transportPaid: 60, result: res(10, 3000) },
  { id: 'insc', name: 'Meia de SP', status: 'inscrita', date: iso(10), distanceKm: 21.1, fee: 200, extraFees: 20, lodgingEst: 300 },
  { id: 'cand1', name: '10K de Natal', status: 'aberta', date: iso(17), distanceKm: 10, fee: 120, transportEst: 40, lotChangeDate: iso(3), signupDeadline: iso(12) },
  { id: 'cand2', name: 'Corrida da Ponte', status: 'interesse', date: iso(10), distanceKm: 5 }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)

// 1. Início: atalho para decidir; sem orçamento ainda
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=decide-link]')
if ((await p.$eval('[data-testid=decide-link] i', (e) => e.innerText)) !== '2') throw new Error('Contador do atalho Decidir errado')
await expectText('Preço muda de lote')
if (await p.$('[data-testid=budget-card]')) throw new Error('Cartão de orçamento sem orçamento')
ok('Início: atalho Decidir com contador 2 e o prazo do lote na semana')

// 2. Definir orçamento pela aba Gastos
await p.goto(BASE + '/historico', { waitUntil: 'networkidle0' })
await click('[role=tab]', 'Gastos')
await click('[data-testid=budget-empty]', 'Definir orçamento')
await p.waitForSelector('#g-target')
if ((await p.$eval('#g-start', (e) => e.value)) !== `${y}-01-01` || (await p.$eval('#g-deadline', (e) => e.value)) !== `${y}-12-31`) throw new Error('Período do orçamento não veio preenchido')
await p.type('#g-target', '1000')
await click('[role=radio]', 'Tudo: inscrição')
await click('.seg button', '70%')
await click('button', 'Salvar objetivo')
await p.waitForFunction(() => /^\/objetivos\/[^/]+$/.test(location.pathname))
await expectText(`Gastar até R$ 1.000,00 com provas (inscrição e viagem) em ${y}`)
await expectText('R$ 720,00 de R$ 1.000,00')
await expectText('Perto do limite')
const goal = (await stored()).goals[0]
if (goal.budgetScope !== 'total' || goal.alertPct !== 70) throw new Error('Orçamento salvo errado: ' + JSON.stringify(goal))
ok('Orçamento criado pela aba Gastos: ano preenchido, “tudo”, aviso em 70% → 72% usado, perto do limite')

// 3. Início com o cartão do orçamento (e sem repetir na lista de objetivos)
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=budget-card]')
await expectText('R$ 720,00 de R$ 1.000,00')
await expectText('Com as provas em avaliação: R$ 880,00 (88%)')
await expectText('Perto do limite')
const goalCards = await p.$$eval('.goal-card', (cs) => cs.length)
if (goalCards !== 0) throw new Error('Orçamento repetido na lista de objetivos do Início')
await shot('inicio-orcamento')
ok('Início: orçamento com gasto, projeção das provas em avaliação e marca do aviso')

// 4. Decidir
await p.click('[data-testid=decide-link]')
await p.waitForFunction(() => location.pathname === '/decidir')
await p.waitForSelector('[data-testid=candidate]')
let names = await p.$$eval('[data-testid=candidate] .t', (e) => e.map((x) => x.innerText))
if (names.join('|') !== '10K de Natal|Corrida da Ponte') throw new Error('Ordem por prazo: ' + names)
await expectText('Mesmo dia de Meia de SP')
await expectText('Orçamento chega a 88%')
await expectText('Preço muda de lote em 3 dias')
await expectText('7 dias depois de Meia de SP')
// vontade
await p.evaluate(() => [...document.querySelectorAll('[data-testid=candidate]')].find((c) => c.innerText.includes('Corrida da Ponte')).querySelector('.wish button[title="Quero muito"]').click())
await wait(200)
if ((await stored()).races.find((r) => r.id === 'cand2').wish !== 3) throw new Error('Vontade não salva')
await click('.seg-sm button', 'Vontade')
names = await p.$$eval('[data-testid=candidate] .t', (e) => e.map((x) => x.innerText))
if (names[0] !== 'Corrida da Ponte') throw new Error('Ordem por vontade: ' + names)
// simulação
await p.$$eval('[data-testid=candidate] .cand-check input', (is) => is.forEach((i) => i.click()))
await p.waitForSelector('[data-testid=sim-bar]')
await waitText('2 provas · R$ 160,00')
await expectText('+ 1 sem valor')
await expectText('Orçamento: R$ 880,00 (88%)')
await expectText('1 choque de data: Corrida da Ponte × Meia de SP')
await shot('decidir')
ok('Decidir: ordem por prazo e por vontade, alertas (mesmo dia, orçamento, lote, intervalo) e simulação com choque de data')

// 5. Fatores e ação “Me inscrevi”
await p.evaluate(() => [...document.querySelectorAll('[data-testid=candidate]')].find((c) => c.innerText.includes('10K de Natal')).querySelector('details').setAttribute('open', ''))
await wait(200)
await expectText('Custo previsto')
await expectText('R$ 160,00 (inscrição R$ 120,00 + viagem e outros R$ 40,00)')
await expectText('~50:00 (5:00 /km)')
await p.evaluate(() => [...document.querySelectorAll('[data-testid=candidate]')].find((c) => c.innerText.includes('10K de Natal')).querySelector('.btn-primary').click())
await wait(300)
if ((await stored()).races.find((r) => r.id === 'cand1').status !== 'inscrita') throw new Error('Não marcou como inscrita')
await p.waitForFunction(() => document.querySelectorAll('[data-testid=candidate]').length === 1)
await expectText('Informar valor pago')
ok('“Me inscrevi”: vira inscrita, sai da lista e oferece informar o valor pago')

// 6. Detalhe da prova em avaliação: “Vale a pena?”
await p.goto(BASE + '/corridas/cand2', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=decision-card]')
await expectText('Vale a pena?')
await expectText('Mesmo dia de Meia de SP')
await expectText('Informe o valor para ver o impacto')
ok('Detalhe: “Vale a pena?” com os fatores da prova')

await browser.close()
if (errors.length) {
  console.log('\nErros no console:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nTodos os testes da rodada 6 passaram.')
