// Rodada 33: remanejar treinos. Data fixa: quarta, 18/11/2026, 10h em Brasília.
// Corre terça (17/11, passou sem marcar) e sábado (21/11).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada33.mjs
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
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = async (s, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).workouts)
const get = async (id) => (await stored()).find((w) => w.id === id)

const run = (id, date) => ({ id, name: id, date, status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1800 } , target: { kind: 'none' } }], notes: '', result: null, goalId: null })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, [run('Tiros', '2026-11-17'), run('Longão', '2026-11-21')])

// 1. Passou sem marcar: um toque remaneja para o dia sugerido
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=missed-card]')
const label = await p.$eval('[data-testid=missed-move]', (b) => b.innerText)
if (label !== '↷ Para qua 18/11') throw new Error('Sugestão: ' + label)
await p.screenshot({ path: `${SHOTS}/r33-passou.png` })
await p.$eval('[data-testid=missed-move]', (b) => b.click())
await waitText('“Tiros” remanejado para qua 18/11')
let t = await get('Tiros')
if (t.date !== '2026-11-18' || t.status !== 'planejado' || t.moves[0].from !== '2026-11-17' || t.moves[0].auto) throw new Error('Tiros: ' + JSON.stringify(t))
await p.waitForSelector('[data-testid=wk-moved-chip]')
await need('remanejado · era ter 17/11')
if (await p.$('[data-testid=missed-card]')) throw new Error('Cartão continuou')
ok('Passou sem marcar: “↷ Para qua 18/11” (a regra), o treino vai para hoje e fica com “remanejado · era ter 17/11”')

// 2. Remanejar pelo detalhe: sugestões com motivo
await p.goto(BASE + '/treinos/' + encodeURIComponent('Longão'), { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=wk-move]', (b) => b.click())
await p.waitForSelector('[data-testid=reschedule]')
const opts = await p.$$eval('[data-testid=rs-opt]', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (!opts[0].startsWith('dom 22/11 · sugerido') || !opts[0].includes('sem conflito')) throw new Error('Opções: ' + opts)
if (!opts.some((o) => o.includes('vai para a semana seguinte'))) throw new Error('Sem aviso de semana: ' + opts)
await p.screenshot({ path: `${SHOTS}/r33-sheet.png` })
await p.$eval('[data-testid=rs-opt]', (b) => b.click())
await waitText('“Longão” remanejado para dom 22/11')
await p.waitForSelector('[data-testid=wk-moves]')
await need('de sáb 21/11 para dom 22/11')
ok(`Detalhe: “📅 Remanejar” sugere ${opts.length} dias com o motivo (1º: “${opts[0]}”) e guarda “de sáb 21/11 para dom 22/11”`)

// 3. Outro dia à escolha
await p.$eval('[data-testid=wk-move]', (b) => b.click())
await p.waitForSelector('[data-testid=rs-date]')
await p.$eval('[data-testid=rs-date]', (i) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2026-11-25'); i.dispatchEvent(new Event('input', { bubbles: true })) })
await p.$eval('[data-testid=rs-custom]', (b) => b.click())
await waitText('remanejado para qua 25/11')
const l = await get('Longão')
if (l.date !== '2026-11-25' || l.moves.length !== 2) throw new Error('Longão: ' + JSON.stringify(l))
await need('de dom 22/11 para qua 25/11')
ok('Outro dia: escolhido qua 25/11; histórico com os 2 remanejamentos')

// 4. Regra “remanejar sozinho”: ao abrir o app, o treino perdido vai para o melhor dia sem avisos
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.select('[data-testid=missed-rule]', 'remanejar')
await waitText('Treinos que passarem vão para o próximo dia livre')
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).data.missedRule)
if (prof !== 'remanejar') throw new Error('Regra não salva: ' + prof)
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('minhas-corridas:v1')); s.workouts.push({ id: 'Rodagem', name: 'Rodagem', date: '2026-11-16', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 1200 }, target: { kind: 'none' } }], notes: '', result: null, goalId: null }); localStorage.setItem('minhas-corridas:v1', JSON.stringify(s)) })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await waitText('“Rodagem” remanejado para')
const r = await get('Rodagem')
if (!r.moves[0].auto || r.date <= '2026-11-18' || ['2026-11-19', '2026-11-17'].includes(r.date)) throw new Error('Rodagem: ' + JSON.stringify(r))
ok(`Regra “remanejar sozinho”: “Rodagem” (seg 16/11) foi para ${r.date.slice(8)}/${r.date.slice(5, 7)} — longe de “Tiros” (qua 18/11), marcado como automático`)

// 5. Regra “marcar como não fiz”
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.select('[data-testid=missed-rule]', 'pular')
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('minhas-corridas:v1')); s.workouts.push({ id: 'Educativos', name: 'Educativos', date: '2026-11-15', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 900 }, target: { kind: 'none' } }], notes: '', result: null, goalId: null }); localStorage.setItem('minhas-corridas:v1', JSON.stringify(s)) })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await waitText('“Educativos” marcado como não feito')
if ((await get('Educativos')).status !== 'pulado') throw new Error('Não marcou')
const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
ok('Regra “marcar como não fiz”: “Educativos” marcado ao abrir o app')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 33 passaram.')
