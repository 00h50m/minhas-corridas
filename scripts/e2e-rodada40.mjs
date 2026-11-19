// Rodada 40: ficha de força (montar, comparar com o relógio, repetir), carga da semana, ciclo fase 2,
// story do mês e o layout simplificado (Treinos, detalhe, Início). Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada40.mjs
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
const has = async (sel, list) => { const t = (await T(sel)).toLowerCase(); for (const x of list) if (!t.includes(x.toLowerCase())) throw new Error(`Em ${sel} faltou “${x}”:\n${t.slice(0, 2500)}`) }
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const s = (cat, reps, kg) => ({ cat, reps, kg, sec: 60 })
const run = (id, date, min, extra = {}) => ({ id, name: 'Rodagem', date, status: 'feito', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }], notes: '', goalId: null, result: { distanceKm: min / 6, elapsedSec: min * 60, ...extra } })
const ws = [
  run('p1', '2026-11-09', 40), run('p2', '2026-11-11', 40), run('p3', '2026-11-02', 40), run('p4', '2026-11-04', 40),
  run('r1', '2026-11-16', 50), run('r2', '2026-11-17', 60),
  { id: 'forca', name: 'Pernas', sport: 'academia', plannedMin: 60, date: '2026-11-18', status: 'planejado', items: [], notes: '', goalId: null, result: null },
  { id: 'longo', name: 'Longo', date: '2026-11-21', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 5400 }, target: { kind: 'none' } }], notes: '', goalId: null, result: null }
]
for (let i = 0; i < 9; i++) ws.push(run(`old${i}`, addDays('2026-10-01', i * 2), 30))
// Ciclo: 4 ciclos de 28 dias; dias 1–2 com energia baixa e fluxo intenso
const starts = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28', '2026-10-26']
const days = {}
for (const st of starts) { days[st] = { flow: 3, symptoms: [], energy: 1 }; days[addDays(st, 1)] = { flow: 3, symptoms: [], energy: 2 }; days[addDays(st, 12)] = { flow: 0, symptoms: [], energy: 4 } }
const cycle = { enabled: true, consentAt: '2026-11-01', hormonal: 'nenhum', periods: starts.map((st) => ({ start: st, end: addDays(st, 4) })), days, dismissed: [] }
starts.slice(0, 4).forEach((st, k) => { for (const [off, pace] of [[0, 400], [1, 405], [2, 402], [9, 370], [13, 372], [20, 368], [24, 371]]) ws.push(run(`c${k}-${off}`, addDays(st, off), 30, { distanceKm: 5, elapsedSec: 5 * pace })) })

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w, c) => {
  localStorage.clear()
  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [{ id: 'prova', name: 'Corrida da Serra', date: '2026-11-29', status: 'inscrita', distanceKm: 10, city: 'Jundiaí', result: null }], goals: [], workouts: w }))
  localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))
  localStorage.setItem('minhas-corridas:ciclo', JSON.stringify(c))
}, ws, cycle)

// 1. Montar a ficha da academia
await p.goto(BASE + '/treinos/forca/editar', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-exercises]')
for (const [cat, sets, reps, kg] of [['28', '3', '12', '40'], ['17', '3', '10', '20'], ['0', '3', '10', '25,5']]) {
  await tap('[data-testid=wk-ex-add]')
  const rows = await p.$$('[data-testid=wk-ex-row]')
  const r = rows.at(-1)
  await (await r.$('[data-testid=wk-ex-cat]')).select(cat)
  for (const [id, v] of [['wk-ex-sets', sets], ['wk-ex-reps', reps], ['wk-ex-kg', kg]]) { const el = await r.$(`[data-testid=${id}]`); await el.focus(); await el.type(v) }
}
await p.screenshot({ path: `${SHOTS}/r40-ficha.png`, fullPage: true })
await tap('button[type=submit]')
await p.waitForSelector('[data-testid=wk-plan]')
await has('[data-testid=wk-plan]', ['Agachamento', '3×12 · 40 kg', 'Afundo', '3×10 · 20 kg', 'Supino', '3×10 · 25,5 kg'])
if (await p.$('[data-testid=wk-send]')) throw new Error('Academia com “Enviar ao relógio”')
ok('Ficha montada: Agachamento 3×12 · 40 kg, Afundo 3×10 · 20 kg, Supino 3×10 · 25,5 kg')

// 2. Relógio: séries feitas → planejado × feito
await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('minhas-corridas:v1'))
  const w = st.workouts.find((x) => x.id === 'forca')
  w.status = 'feito'
  w.result = { elapsedSec: 3500, distanceKm: 0, avgHr: 138, calories: 380, sets: [28, 28, 28].map((c, i) => ({ cat: c, reps: 12, kg: [40, 45, 45][i], sec: 60 })).concat([{ cat: 17, reps: 10, kg: 20, sec: 60 }, { cat: 17, reps: 6, kg: 20, sec: 60 }, { cat: 23, reps: 12, kg: 25, sec: 60 }]) }
  localStorage.setItem('minhas-corridas:v1', JSON.stringify(st))
})
await p.goto(BASE + '/treinos/forca', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-strength-cmp]')
await has('[data-testid=wk-strength-cmp]', ['Planejado × feito', '1 de 3 exercícios como planejado', 'Agachamento', 'como planejado', '3 séries · 12/12/12 · 45 kg', '+5 kg', 'Afundo', 'parcial', 'Supino', 'não feito', 'Remada', 'fora da ficha'])
const order = await p.evaluate(() => [...document.querySelectorAll('[data-testid=wk-executed], [data-testid=wk-story], .seg[aria-label="Status do treino"]')].map((e) => e.dataset.testid ?? 'status'))
if (order.join() !== 'wk-executed,wk-story,status') throw new Error('Ordem do treino feito: ' + order)
await p.screenshot({ path: `${SHOTS}/r40-cmp.png`, fullPage: true })
ok('Planejado × feito: Agachamento como planejado (+5 kg), Afundo parcial, Supino não feito, Remada fora da ficha; detalhes primeiro')

// 3. Repetir em 7 dias leva a ficha
await tap('[data-testid=wk-dup]')
await p.waitForSelector('[data-testid=wk-exercises]')
const dupDate = await p.$eval('#wk-date', (e) => e.value)
const dupRows = await p.$$('[data-testid=wk-ex-row]')
if (dupDate !== '2026-11-25' || dupRows.length !== 3) throw new Error(`Repetir: ${dupDate} · ${dupRows.length} exercícios`)
ok('“Repetir”: nova atividade em 25/11 com a mesma ficha')

// 4. Detalhe de treino planejado: duas ações e o resto num painel
await p.goto(BASE + '/treinos/longo', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-send]')
for (const id of ['wk-export', 'wk-nocable', 'copy-intervals']) if (await p.$(`[data-testid=${id}]`)) throw new Error(`${id} solto na tela`)
await tap('[data-testid=wk-send]')
await p.waitForSelector('[data-testid=wk-send-sheet] [data-testid=wk-export]')
await tap('[data-testid=send-auto]')
await p.waitForSelector('[data-testid=copy-intervals]')
await tap('[data-testid=wk-gc]')
await p.waitForSelector('[data-testid=wk-gc-guide]')
await p.screenshot({ path: `${SHOTS}/r40-send.png` })
ok('Treino planejado: “Enviar ao relógio” e “Remanejar”; cabo, Garmin Connect e Intervals/Claude num painel só')

// 5. Ciclo: remanejar o longo avisa do dia difícil (23/11 = dia 1 previsto)
await p.keyboard.press('Escape')
await p.goto(BASE + '/treinos/longo', { waitUntil: 'networkidle0' })
await tap('[data-testid=wk-move]')
await p.waitForSelector('[data-testid=reschedule]')
await p.$eval('[data-testid=rs-date]', (e, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, '2026-11-23')
await p.waitForSelector('[data-testid=rs-pick-note]')
const rs = await T('[data-testid=rs-pick-note]')
if (!rs.includes('este dia costuma ser difícil (energia baixa)')) throw new Error('Sem aviso do ciclo: ' + rs)
ok('Remanejar o longo para 23/11 (escolhido à mão): aviso “nos seus últimos ciclos, este dia costuma ser difícil (energia baixa)”')

// 6. Ciclo: padrões pessoais
await p.goto(BASE + '/ciclo', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=cycle-patterns]')
await has('[data-testid=cycle-patterns]', ['Nos dias de menstruação, suas rodagens foram em média', 's/km mais lentas (13 treinos em 4 ciclos)', 'menos energia', 'Rodagens', 'poucos'])
ok('Ciclo: “Nos dias de menstruação, suas rodagens foram em média … mais lentas (13 treinos em 4 ciclos)”, com “poucos dados” onde falta amostra')

// 7. Carga da semana e lista simplificada
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-load]')
await has('[data-testid=week-load]', ['Carga da semana', 'pts', '% da média', 'corrida', 'força', 'média de 3 semanas'])
await p.waitForSelector('[data-testid=week-load-warn]')
const vis = await p.evaluate(() => ({ rule: !document.querySelector('[data-testid=missed-rule]')?.closest('details:not([open])'), more: !!document.querySelector('[data-testid=wk-more]'), watch: !!document.querySelector('[data-testid=wk-watch]'), past: document.querySelectorAll('[data-testid=workout-item]').length }))
if (vis.rule || !vis.more || !vis.watch) throw new Error('Lista: ' + JSON.stringify(vis))
await tap('[data-testid=wk-all-past]')
const after = await p.$$eval('[data-testid=workout-item]', (e) => e.length)
if (!(after > vis.past)) throw new Error('Ver todos os anteriores')
await p.screenshot({ path: `${SHOTS}/r40-treinos.png` })
ok(`Treinos: carga da semana (corrida + força, vs. média das semanas anteriores, com aviso), relógio num cartão, ${vis.past} itens e “Ver todos”, opções raras em “Mais opções”`)

// 8. Mês: atalho para o story
await tap('[data-testid=wk-view-month]')
await p.waitForSelector('[data-testid=wm-story]')
await tap('[data-testid=wm-story]')
await p.waitForSelector('[data-testid=story-canvas]')
if (!p.url().includes('modelo=mes') || !p.url().includes('mes=2026-11')) throw new Error('Story do mês: ' + p.url())
ok('Mês → “Story do mês” abre o modelo do mês de novembro')

// 9. Início: passaporte e stories lado a lado
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('.home-tiles [data-testid=passport-link]')
const tiles = await p.$$eval('.home-tiles > .card', (e) => e.map((x) => Math.round(x.getBoundingClientRect().top)))
if (tiles.length !== 2 || tiles[0] !== tiles[1]) throw new Error('Tiles: ' + tiles)
ok('Início: Passaporte e Stories lado a lado')

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of ['/treinos', '/treinos/forca', '/treinos/longo', '/treinos/forca/editar', '/ciclo', '/']) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 40 passaram.')
