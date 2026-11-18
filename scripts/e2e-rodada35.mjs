// Rodada 35: ciclo menstrual. Data fixa: quarta, 18/11/2026.
// Ativar com consentimento, histórico do Flo à mão, previsão, registro do dia, “como você chega hoje”,
// prova no ciclo (reta final), pontos na semana, importação do Garmin e apagar tudo.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada35.mjs
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
const cycle = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:ciclo') || 'null'))
const setDate = (sel, v) => p.$eval(sel, (i, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }, v)

// Garmin simulado: só o ciclo
await p.setRequestInterception(true)
p.on('request', (r) => {
  if (!r.url().includes('/api/garmin')) return r.continue()
  const b = JSON.parse(r.postData() || '{}')
  if (b.action === 'cycle') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ starts: ['2026-07-16'], periodLen: 5, cycleLen: 28 }) })
  return r.respond({ status: 200, contentType: 'application/json', body: '{"activities":[],"days":[]}' })
})

const races = [{ id: 'na', name: 'Corrida de Natal', date: '2026-12-04', status: 'inscrita', distanceKm: 10, startTime: '07:00', targetTime: 4500 }]
const ws = [{ id: 'rod', name: 'Rodagem', date: '2026-11-18', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1800 }, target: { kind: 'none' } }], notes: '', result: null, goalId: null }]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r, w) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:garmin', JSON.stringify({ key: 'gk_teste_123456789', done: [], pending: [], races: [] })) }, races, ws)

// 1. Perfil → Ciclo menstrual → ativar com consentimento
await p.goto(BASE + '/perfil', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=cycle-link]', (a) => a.click())
await p.waitForSelector('[data-testid=cycle-intro]')
if (!(await p.$eval('[data-testid=cycle-enable]', (b) => b.disabled))) throw new Error('Ativou sem consentimento')
await p.$eval('[data-testid=cycle-consent]', (c) => c.click())
await p.$eval('[data-testid=cycle-enable]', (b) => b.click())
await p.waitForSelector('[data-testid=cycle-now]')
let c = await cycle()
if (!c.enabled || !c.consentAt || !c.updatedAt) throw new Error('Ativar: ' + JSON.stringify(c))
ok('Perfil → “Ciclo menstrual”: só ativa com o consentimento marcado')

// 2. Histórico do Flo à mão (3 menstruações) → previsão
for (const [s, e] of [['2026-08-13', '2026-08-17'], ['2026-09-10', '2026-09-14'], ['2026-10-08', '2026-10-12'], ['2026-11-05', '2026-11-09']]) {
  await setDate('[data-testid=cycle-past-start]', s)
  await setDate('[data-testid=cycle-past-end]', e)
  await p.$eval('[data-testid=cycle-past-add]', (b) => b.click())
  await wait(150)
}
await waitText('Dia 14 do ciclo')
await need('Próxima menstruação: ~03/12')
await need('ciclo médio 28 dias · menstruação 5 dias')
ok('Histórico (como do Flo): 4 menstruações → “Dia 14 do ciclo”, próxima ~03/12, ciclo médio 28 dias')

// 3. Prova no ciclo
await need('Corrida de Natal')
await need('a prova cai no dia 2 da menstruação')
ok('Próxima prova: “Pela sua previsão, a prova cai no dia 2 da menstruação”')

// 4. Registro do dia → “como você chega hoje” no Treinos (sem Garmin de sono)
await p.$eval('[data-testid=cycle-sym-colica]', (b) => b.click())
await p.$eval('[data-testid=cycle-energy-2]', (b) => b.click())
await wait(200)
c = await cycle()
if (c.days['2026-11-18']?.energy !== 2 || !c.days['2026-11-18'].symptoms.includes('colica')) throw new Error('Registro: ' + JSON.stringify(c.days))
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=readiness-cycle]')
const rc = await p.$eval('[data-testid=readiness]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!rc.includes('dia 14 do ciclo · cólica · energia 2/5') || !rc.includes('ir mais leve é uma opção')) throw new Error('Prontidão: ' + rc)
ok(`Registro do dia em 2 toques → Treinos: “${rc.trim()}”`)

// 5. Pontos na semana (semana da menstruação prevista)
await p.$$eval('.tw-head .icon-btn', (b) => b[1].click())
await p.$$eval('.tw-head .icon-btn', (b) => b[1].click())
await wait(200)
const dots = await p.$$eval('[data-testid=tw-cyc]', (d) => d.length)
if (dots < 4) throw new Error('Pontos do ciclo na semana: ' + dots)
ok(`Semana de 30/11: ${dots} dias com o ponto lilás de menstruação prevista`)

// 6. Reta final da prova com os itens do ciclo
await p.goto(BASE + '/corridas/na', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=stretch-cycle]')
await need('Testar no longão o absorvente, coletor ou calcinha que vai usar')
await need('Ver onde ficam os banheiros')
await need('Separar o kit do ciclo')
await p.screenshot({ path: `${SHOTS}/r35-reta.png` })
ok('Reta final: aviso do ciclo + testar absorvente/coletor no longão, banheiros e kit do ciclo')

// 7. Início: cartão do ciclo; importar do Garmin
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=cycle-home]')
await need('Dia 14 do ciclo')
await p.goto(BASE + '/ciclo', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=cycle-garmin]', (b) => b.click())
await waitText('1 menstruação importada do Garmin')
c = await cycle()
if (!c.periods.some((x) => x.start === '2026-07-16' && x.source === 'garmin' && x.end === '2026-07-20')) throw new Error('Garmin: ' + JSON.stringify(c.periods))
await p.screenshot({ path: `${SHOTS}/r35-ciclo.png`, fullPage: true })
const o1 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o1 > 0) throw new Error('Rolagem lateral na página do ciclo: ' + o1)
ok('Importar do Garmin: 1 menstruação nova (16/07), sem duplicar as do Flo')

// 8. Nunca em stories; apagar tudo
await p.goto(BASE + '/stories?modelo=semana', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=story-canvas]')
const storyText = await p.evaluate(() => document.body.innerText)
if (/ciclo|menstrua/i.test(storyText)) throw new Error('Ciclo na tela de stories')
await p.goto(BASE + '/ciclo', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=cycle-delete]', (b) => b.click())
await p.waitForSelector('.dialog')
await p.$$eval('.dialog button', (b) => b.find((x) => x.innerText.trim() === 'Apagar').click())
await waitText('Dados do ciclo apagados')
if (await cycle()) throw new Error('Não apagou')
await p.waitForSelector('[data-testid=cycle-intro]')
const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
ok('Nada do ciclo nos stories; “Apagar tudo” remove do aparelho (e da conta)')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 35 passaram.')
