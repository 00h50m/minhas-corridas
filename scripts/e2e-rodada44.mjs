// Rodada 44: ficha da academia — colar o texto (o que o Claude no Chrome faz a partir do PDF), conferir
// os campos iguais ao PDF, salvar, ver a ficha com os conjugados, “Fiz hoje” com o próximo da sequência,
// o treino feito com a ficha e o cadastro campo a campo. Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada44.mjs
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
const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1') || '{}'))
const setVal = (sel, v) => p.$eval(sel, (e, v) => { const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, v)

const TEXT = `FICHA: Treino em academia
OBJETIVO: Emagrecimento - Definição
PERÍODO: 02/11/2026 a 04/12/2026
TREINADOR: Treinador Exemplo

TREINO A
Agachamento barra livre pernas abduzidas | 3 | 8 + diminuir o peso + 10 | — | conjugado
Agachamento peso corporal | 3 | 12 (com peso) + 15 (sem peso) + 10 seg isometria final | 1 minuto e meio
Agachamento búlgaro com halter | 4 | 12 (dir.) + 12 (esq.) | — | conjugado
Leg press 45° pernas abduzidas | 4 | 12 | 1 minuto e meio
Stiff com halter | 3 | 12 - bombeando duas | — | conjugado
Abdominal infra banco declinado | 3 | 12 | 1 minuto

TREINO B
Remada fechada cavalinho máquina | 4 | 10 a 12 | 1 minuto
Remada curvada aberta barra reta (pegada pronada) | 4 | 12 | — | conjugado
Crucifixo inverso máquina (pegada neutra) | 4 | 12 | 1 minuto
Extensão de ombro no cross com barra reta | 3 | 8 + diminuir a carga + 10 | — | conjugado
Rosca bíceps com halter | 3 | 10 + descansar 5 seg + 8 | 1 minuto
Puxada alta no cross com barra romana | 4 | 8 + diminuir a carga + 10 + diminuir a carga + 12 | 1 minuto e meio

TREINO C
Agachamento barra livre pernas abduzidas | 4 | 12 | — | conjugado
Agachamento sumô com halter e step | 4 | 12 | 1 minuto
Elevação pélvica máquina | 4 | 10 seg iso + 12 rep | 1 minuto
Recuo com halter e step (usar dois steps) | 3 | 12 (dir.) + 12 (esq.) | 1 minuto
Cadeira extensora | 3 | 8 + diminuir a carga + 10 + diminuir a carga + 12 | 1 minuto
Cadeira abdutora | 3 | 10 + diminuir a carga + 10 | 50 seg

TREINO D
Abdução de ombro com halter sentada | 3 | 8 (dir.) + 8 (esq.) alternada segurando em cima + 10 (diretas) | — | conjugado
Crucifixo peitoral com halter banco reto | 3 | 12 | 1 minuto
Abdução de ombro unilateral no banco inclinado 75° | 4 | 12 (dir.) + 12 (esq.) | — | conjugado
Flexão de ombro barra reta (pegada pronada) | 4 | 12 | 1 minuto
Desenvolvimento ombro aberto com halter | 3 | 10 + diminuir o peso + 10 | 1 minuto
Rosca tríceps com barra no cross | 3 | 8 + diminuir a carga + 10 + diminuir a carga + 12 | 1 minuto`

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: [{ id: 'forca', name: 'Força', sport: 'academia', plannedMin: 50, date: '2026-11-18', status: 'planejado', items: [], notes: '', goalId: null, result: null }] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) })

// 1. Treinos → convite → ficha vazia com o prompt para o Claude no Chrome
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=ficha-card]')
await tap('[data-testid=ficha-card]')
await p.waitForSelector('[data-testid=ficha-new]')
await p.$eval('[data-testid=ficha-claude-empty] button', (b) => b.click())
await p.waitForSelector('[data-testid=ficha-claude-empty] textarea')
const prompt = await p.$eval('[data-testid=ficha-claude-empty] textarea', (t) => t.value)
for (const t of ['/academia/editar?nova=1', 'exercício (observação) | séries | repetições | descanso | conjugado', 'Colar ficha em texto', 'Ler texto', 'Salvar ficha', 'PERÍODO:']) if (!prompt.includes(t)) throw new Error(`Prompt sem “${t}”`)
ok('Treinos → “Ficha da academia” → prompt pronto para o Claude no Chrome (formato, campo, botões)')

// 2. Colar o texto (o que o Claude faz) → Ler texto → campos iguais ao PDF
await tap('[data-testid=ficha-new]')
await p.waitForSelector('[data-testid=ficha-text]')
await setVal('[data-testid=ficha-text]', TEXT)
await tap('[data-testid=ficha-parse]')
await p.waitForFunction(() => document.querySelectorAll('[data-testid=ficha-tab-D]').length === 1)
const head = await p.evaluate(() => ['ficha-title', 'ficha-goal', 'ficha-from', 'ficha-to', 'ficha-coach'].map((id) => document.getElementById(id).value))
if (head.join('|') !== 'Treino em academia|Emagrecimento - Definição|2026-11-02|2026-12-04|Treinador Exemplo') throw new Error('Cabeçalho: ' + head)
const exA = await p.$$eval('[data-testid=ficha-ex]', (rows) => rows.map((r) => [r.querySelector('[data-testid=ficha-ex-name]').value, r.querySelector('[data-testid=ficha-ex-sets]').value, r.querySelector('[data-testid=ficha-ex-reps]').value, r.querySelector('[data-testid=ficha-ex-rest]').value, r.querySelector('[data-testid=ficha-ex-pair]')?.checked ?? false]))
if (exA.length !== 6 || exA[0][2] !== '8 + diminuir o peso + 10' || exA[1][3] !== '1 minuto e meio' || exA[0][4] !== true || exA[1][4] !== false) throw new Error('Treino A: ' + JSON.stringify(exA))
await tap('[data-testid=ficha-tab-B]')
await wait(200)
const noteB = await p.$eval('#ex-1-note', (e) => e.value)
if (noteB !== 'pegada pronada') throw new Error('Observação: ' + noteB)
await p.screenshot({ path: `${SHOTS}/r44-editor.png` })
ok('Texto colado → cabeçalho, 4 treinos (A–D), 6 exercícios cada, repetições/descanso como escritos, observação e conjugados nos campos')

// 3. Campo a campo: Treino E com 2 exercícios conjugados
await tap('[data-testid=ficha-add-sheet]')
await p.waitForSelector('[data-testid=ficha-tab-E]')
await setVal('#ex-0-name', 'Prancha')
await setVal('#ex-0-sets', '3')
await setVal('#ex-0-reps', '30 seg')
await tap('[data-testid=ficha-add-ex]')
await p.waitForSelector('#ex-1-name')
await setVal('#ex-1-name', 'Abdominal remador')
await setVal('#ex-1-sets', '3')
await setVal('#ex-1-reps', '15')
await setVal('#ex-1-rest', '1 minuto')
await p.$eval('[data-testid=ficha-ex-pair]', (c) => c.click())
await tap('[data-testid=ficha-save]')
await p.waitForSelector('[data-testid=ficha]')
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:ficha')))
const prog = saved.programs[0]
if (prog.sheets.length !== 5 || prog.sheets[4].exercises[0].withNext !== true || prog.sheets[4].exercises[1].rest !== '1 minuto') throw new Error('Salvo: ' + JSON.stringify(prog.sheets[4]))
ok('Campo a campo: Treino E (Prancha 3 × 30 seg conjugado com Abdominal remador 3 × 15, descanso 1 minuto); ficha salva')

// 4. A ficha: cabeçalho, próximo, conjugados
await has('[data-testid=ficha]', ['Treino em academia', 'Emagrecimento - Definição', '02/11 a 04/12/2026', 'Treinador Exemplo', 'Próximo da sequência', 'Treino A', 'Agachamento barra livre pernas abduzidas', '8 + diminuir o peso + 10', 'descanso 1 minuto e meio', 'pegada pronada', 'conjugado'])
const pairs = await p.$$eval('.ficha-block.pair', (e) => e.length)
if (pairs !== 3 + 2 + 1 + 2 + 1) throw new Error('Blocos conjugados: ' + pairs)
await p.screenshot({ path: `${SHOTS}/r44-ficha.png`, fullPage: true })
ok(`Ficha como no PDF: ${pairs} blocos conjugados, observações, descansos; próximo da sequência: Treino A`)

// 5. Fiz hoje → aproveita a academia planejada de hoje, vira Treino A feito; próximo vira B
await tap('[data-testid=ficha-done-next]')
await wait(400)
const ws = (await store()).workouts
const done = ws.find((w) => w.id === 'forca')
if (done.status !== 'feito' || done.name !== 'Treino A' || done.ficha?.label !== 'A' || done.exercises.length !== 6 || done.exercises[0].repsText !== '8 + diminuir o peso + 10') throw new Error('Feito: ' + JSON.stringify(done).slice(0, 400))
if (ws.length !== 1) throw new Error('Criou outro treino em vez de usar o planejado')
await has('[data-testid=ficha-next]', ['Treino B'])
await tap('[data-testid=ficha-done-A]')
await wait(300)
if ((await store()).workouts.length !== 1) throw new Error('Registrou o Treino A duas vezes no mesmo dia')
ok('“Fiz hoje”: a academia planejada de hoje virou “Treino A” feito (com a ficha); o próximo passa a ser o Treino B; não duplica')

// 6. Treinos e o treino feito
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await has('[data-testid=ficha-card]', ['Hoje: Treino A feito'])
await p.goto(BASE + '/treinos/forca', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=wk-plan]')
await has('[data-testid=wk-cross]', ['da ficha · Treino A', 'Agachamento barra livre pernas abduzidas', '3 × 8 + diminuir o peso + 10', 'descanso 1 minuto e meio', 'conjugado'])
ok('Treinos: “Hoje: Treino A feito”; no treino, a ficha com repetições, descanso e conjugados e o link para a ficha')

// 7. Fiz em outro dia
await p.goto(BASE + '/academia', { waitUntil: 'networkidle0' })
const btns = await p.$$('[data-testid=ficha-sheet-view] .link-btn')
await btns[2].evaluate((b) => b.click())
await p.waitForSelector('[data-testid=ficha-other-date]')
await setVal('[data-testid=ficha-other-date]', '2026-11-16')
await tap('[data-testid=ficha-other-save]')
await wait(300)
const c = (await store()).workouts.find((w) => w.ficha?.label === 'C')
if (!c || c.date !== '2026-11-16') throw new Error('Outro dia: ' + JSON.stringify(c))
ok('“Fiz em outro dia”: Treino C registrado em 16/11')

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of ['/academia', '/academia/editar', '/treinos', '/treinos/forca']) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 44 passaram.')
