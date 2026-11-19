// Rodada 45: treinando agora (séries, carga da última vez, descanso da ficha, terminar), planejar a semana
// (sequência da ficha nos dias, cópia da semana anterior, carga prevista) e o desafio com amigas (sem conta:
// convite guardado; story do ranking). Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada45.mjs
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
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-18T23:00:00Z')
  const Real = Date
  let off = 0
  window.__advance = (ms) => { off += ms }
  class FakeDate extends Real { constructor(...a) { super(...(a.length ? a : [fixed + off])) } static now() { return fixed + off } }
  window.Date = FakeDate
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = (sel = 'body') => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '))
const has = async (sel, list) => { const t = (await T(sel)).toLowerCase(); for (const x of list) if (!t.includes(x.toLowerCase())) throw new Error(`Em ${sel} faltou “${x}”:\n${t.slice(0, 2500)}`) }
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1') || '{}'))
const setVal = (el, v) => el.evaluate((e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, v)

const ficha = { programs: [{ id: 'f1', title: 'Treino em academia', goal: '', from: null, to: null, coach: '', sheets: [
  { id: 'sa', label: 'A', exercises: [
    { id: 'e1', name: 'Agachamento barra livre', note: '', sets: 2, reps: '8 + diminuir o peso + 10', rest: '', withNext: true },
    { id: 'e2', name: 'Agachamento peso corporal', note: '', sets: 2, reps: '12', rest: '1 minuto e meio', withNext: false },
    { id: 'e3', name: 'Cadeira extensora', note: '', sets: 2, reps: '12', rest: '1 minuto', withNext: false }] },
  { id: 'sb', label: 'B', exercises: [{ id: 'e4', name: 'Remada', note: '', sets: 3, reps: '12', rest: '1 minuto', withNext: false }] },
  { id: 'sc', label: 'C', exercises: [{ id: 'e5', name: 'Elevação pélvica', note: '', sets: 3, reps: '12', rest: '1 minuto', withNext: false }] }] }], activeId: 'f1' }
const step = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const ws = [
  // treino A anterior com cargas anotadas (para a “última vez”)
  { id: 'antes', name: 'Treino A', sport: 'academia', date: '2026-11-11', status: 'feito', items: [], notes: '', goalId: null, result: null, ficha: { programId: 'f1', sheetId: 'sa', label: 'A' },
    exercises: [{ name: 'Agachamento barra livre', sets: 2, repsText: '8 + diminuir o peso + 10', withNext: true, cat: 28, reps: 8 }, { name: 'Agachamento peso corporal', sets: 2, repsText: '12', rest: '1 minuto e meio', cat: 28, reps: 12 }, { name: 'Cadeira extensora', sets: 2, repsText: '12', rest: '1 minuto', cat: null, reps: 12 }],
    gymLog: { startedAt: '2026-11-11T20:00:00Z', endedAt: '2026-11-11T20:50:00Z', entries: [{ i: 0, n: 1, kg: 40, reps: 8 }, { i: 0, n: 2, kg: 45, reps: 10 }, { i: 2, n: 1, kg: 30, reps: 12 }] } },
  { id: 'r1', name: 'Rodagem', date: '2026-11-17', status: 'feito', items: step(40), notes: '', goalId: null, result: { distanceKm: 6.5, elapsedSec: 2400 } },
  { id: 'r2', name: 'Longo', date: '2026-11-21', status: 'planejado', items: step(80), notes: '', goalId: null, result: null }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((w, f) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: w })); localStorage.setItem('minhas-corridas:ficha', JSON.stringify(f)); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws, ficha)

// 1. Começar o Treino B pela ficha? O próximo é B (o último foi A): começa e abre o modo treino
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await has('[data-testid=ficha-card]', ['Próximo: Treino B'])
await p.goto(BASE + '/academia', { waitUntil: 'networkidle0' })
await tap('[data-testid=ficha-start-A]')
await p.waitForSelector('[data-testid=gym-session]')
const sessionId = p.url().match(/treinos\/([^/]+)\/agora/)[1]
ok('Ficha → “Começar agora” cria o treino de hoje (planejado) e abre o modo treino')

// 2. Carga da última vez preenchida; conjugado sem descanso no 1º; descanso no 2º
const kg0 = await p.$$eval('[data-testid=gym-kg]', (e) => e.map((x) => x.value))
if (kg0[0] !== '40' || kg0[1] !== '45' || kg0[4] !== '30') throw new Error('Carga da última vez: ' + kg0)
await has('[data-testid=gym-session]', ['Última vez (11/11): 40 kg · 45 kg', 'conjugado'])
let ticks = await p.$$('[data-testid=gym-tick]')
await ticks[0].evaluate((b) => b.click())
await wait(300)
if (await p.$('[data-testid=gym-rest]')) throw new Error('Descanso depois do 1º do conjugado')
const reps = await p.$$('[data-testid=gym-reps]')
await setVal(reps[2], '11')
ticks = await p.$$('[data-testid=gym-tick]')
await ticks[2].evaluate((b) => b.click())
await p.waitForSelector('[data-testid=gym-rest]')
await has('[data-testid=gym-rest]', ['Descanso', 'Agachamento peso corporal', '1:30'])
await p.screenshot({ path: `${SHOTS}/r45-gym.png` })
await p.evaluate(() => window.__advance(91000))
await p.waitForFunction(() => !document.querySelector('[data-testid=gym-rest]'), { timeout: 5000 })
ok('Modo treino: carga da última vez já preenchida; no conjugado, sem descanso depois do 1º; depois do 2º, descanso de 1:30 da ficha, que termina sozinho')

// 3. Corrigir carga de série feita; terminar com séries faltando (confirma); detalhe mostra o anotado
const kgs = await p.$$('[data-testid=gym-kg]')
await setVal(kgs[0], '42,5')
await wait(200)
await tap('[data-testid=gym-finish]')
await p.waitForSelector('.dialog button, [role=dialog] button')
await p.evaluate(() => [...document.querySelectorAll('.dialog button, [role=dialog] button')].find((b) => b.innerText.includes('Terminar')).click())
await p.waitForSelector('[data-testid=wk-gymlog]')
const w = (await store()).workouts.find((x) => x.id === sessionId)
if (w.status !== 'feito' || w.gymLog.entries.length !== 2 || w.gymLog.entries[0].kg !== 42.5 || w.gymLog.entries[1].reps !== 11 || !w.gymLog.endedAt) throw new Error('Registro: ' + JSON.stringify(w.gymLog))
await has('[data-testid=wk-gymlog]', ['Anotado na academia', 'Agachamento barra livre', '1/2 séries · 42,5 kg · 8', 'Agachamento peso corporal', '1/2 séries · 11', 'Cadeira extensora', 'não feito'])
ok('Terminar (com confirmação de séries faltando): treino feito com as séries, cargas (42,5 kg corrigido) e repetições; o detalhe mostra o anotado')

// 4. Planejar a semana: dias da academia com a sequência e a cópia da semana anterior
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await tap('[data-testid=week-plan]')
await p.waitForSelector('[data-testid=planner]')
await tap('[data-testid=plan-next]')
for (const d of [0, 2, 4]) { const on = await p.$eval(`[data-testid=plan-day-${d}]`, (b) => b.getAttribute('aria-pressed') === 'true'); if (!on) await tap(`[data-testid=plan-day-${d}]`) }
await has('[data-testid=plan-gym]', ['seg 23/11', 'Treino B', 'qua 25/11', 'Treino C', 'sex 27/11', 'Treino A'])
await has('[data-testid=plan-copies]', ['Rodagem', 'ter 24/11', 'Longo', 'sáb 28/11'])
await has('[data-testid=plan-sum]', ['5 treinos novos', 'Carga prevista'])
await p.screenshot({ path: `${SHOTS}/r45-planner.png`, fullPage: true })
await tap('[data-testid=plan-confirm]')
await p.waitForFunction(() => location.pathname === '/treinos')
const planned = (await store()).workouts.filter((x) => x.date >= '2026-11-23' && x.date <= '2026-11-29' && x.status === 'planejado').map((x) => `${x.date}:${x.name}`).sort()
if (planned.join() !== '2026-11-23:Treino B,2026-11-24:Rodagem,2026-11-25:Treino C,2026-11-27:Treino A,2026-11-28:Longo') throw new Error('Planejados: ' + planned)
ok('Planejar a próxima semana: seg Treino B, qua Treino C, sex Treino A (a sequência da ficha) + a Rodagem e o Longo copiados da semana anterior; carga prevista antes de confirmar')

// 5. Desafios sem conta: convite guardado para depois do login
await p.goto(BASE + '/desafios/entrar/ABCD1234EF', { waitUntil: 'networkidle0' })
await has('body', ['Entrar ou criar conta', 'nunca as suas atividades'])
const inv = await p.evaluate(() => localStorage.getItem('paceon:convite'))
if (inv !== 'ABCD1234EF') throw new Error('Convite não guardado: ' + inv)
const tiles = await p.goto(BASE + '/', { waitUntil: 'networkidle0' }).then(() => p.$$eval('.home-tiles > .card', (e) => e.map((x) => x.innerText.split('\n')[0])))
if (!tiles.includes('Desafios')) throw new Error('Início sem Desafios: ' + tiles)
ok('Convite aberto sem conta: pede para entrar e guarda o convite para depois do login; “Desafios” no Início')

// 6. Story do desafio (a partir do ranking guardado pela tela do desafio)
await p.evaluate(() => localStorage.setItem('paceon:desafio-story', JSON.stringify({ id: 'c1', title: 'Km de dezembro', metric: 'km', start: '2026-12-01', end: '2026-12-31', board: [{ name: 'Ana', value: 42.5, pos: 1, me: false }, { name: 'Gi', value: 30, pos: 2, me: true }, { name: 'Bia', value: 12, pos: 3, me: false }] })))
await p.goto(BASE + '/stories?modelo=desafio&desafio=c1', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=story-desafio]')
const pressed = await p.$eval('[data-testid=story-desafio]', (b) => b.getAttribute('aria-pressed'))
if (pressed !== 'true') throw new Error('Story do desafio não selecionado')
await wait(500)
const data = await p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png'))
fs.writeFileSync(path.join(SHOTS, 'r45-story-desafio.png'), Buffer.from(data.split(',')[1], 'base64'))
await p.goto(BASE + '/stories', { waitUntil: 'networkidle0' })
if (await p.$('[data-testid=story-desafio]')) throw new Error('Story do desafio sem desafio')
ok('Story do desafio com o ranking (r45-story-desafio.png); sem desafio aberto, o modelo não aparece')

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of [`/treinos/${sessionId}/agora`, '/treinos/planejar', '/desafios', '/']) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 45 passaram.')
