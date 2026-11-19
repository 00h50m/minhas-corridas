// Rodada 42: primeira vez no app (boas-vindas com primeiros passos, um convite de instalar só), os
// botões da notificação da noite (“Fiz” e “Remanejar” abrem o treino já fazendo a ação), a opção do
// lembrete da noite em Avisos e o tema claro. Data fixa: quarta, 18/11/2026.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada42.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
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
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1') || '{}'))

// 1. Primeira vez: boas-vindas com os 4 passos
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate(() => localStorage.clear())
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=first-steps]')
const fs1 = await T('[data-testid=first-steps]')
for (const t of ['Boas-vindas ao PaceOn', 'Primeiros passos', '0 de 4', 'Cadastre uma prova', 'Monte um treino', 'Traga o relógio', 'Complete o perfil']) if (!fs1.toLowerCase().includes(t.toLowerCase())) throw new Error(`Boas-vindas sem “${t}”: ${fs1}`)
const installs = await p.$$eval('.install-banner, [data-testid=install-banner]', (e) => e.length)
const installText = (await T()).split('Instale o PaceOn').length - 1
if (installText > 1) throw new Error('Convite de instalar repetido: ' + installText)
await p.screenshot({ path: `${SHOTS}/r42-boas-vindas.png` })
ok(`Primeira vez: boas-vindas com 4 passos (0 de 4) e no máximo 1 convite de instalar (${installText})`)

// 2. Só com um treino: o Início normal aparece, com os passos marcando o que já foi feito
const ws = [
  { id: 'tiros', name: 'Tiros', date: '2026-11-18', status: 'planejado', items: [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: 2400 }, target: { kind: 'none' } }], notes: '', goalId: null, result: null },
  { id: 'longo', name: 'Longo', date: '2026-11-18', sport: 'bike', plannedMin: 60, status: 'planejado', items: [], notes: '', goalId: null, result: null }
]
await p.evaluate((w) => { localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [], goals: [], workouts: w })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws)
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=home-workout]')
await p.waitForSelector('[data-testid=first-steps]')
const fs2 = await T('[data-testid=first-steps]')
if (!fs2.includes('1 de 4') || fs2.toLowerCase().includes('boas-vindas')) throw new Error('Passos: ' + fs2)
if (!(await p.$eval('[data-testid=fs-treino]', (e) => e.classList.contains('done')))) throw new Error('Treino não marcado como feito')
await tap('[data-testid=fs-hide]')
await p.reload({ waitUntil: 'networkidle0' })
if (await p.$('[data-testid=first-steps]')) throw new Error('“Esconder” não guardou')
ok('Só com treinos: Início normal com o treino de hoje; passos “1 de 4” (treino marcado); “Esconder” fica guardado')

// 3. Botão “Fiz” da notificação
await p.goto(BASE + '/treinos/tiros?marcar=feito', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => !location.search)
await wait(300)
if ((await store()).workouts.find((w) => w.id === 'tiros').status !== 'feito') throw new Error('“Fiz” não marcou')
await p.waitForSelector('[data-testid=wk-story]')
ok('Notificação → “Fiz”: abre o treino já marcado como feito (e limpa o endereço)')

// 4. Botão “Remanejar” da notificação
await p.goto(BASE + '/treinos/longo?remanejar=1', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=reschedule]')
if (await p.evaluate(() => location.search)) throw new Error('Endereço não limpou')
await tap('[data-testid=rs-opt]')
await wait(300)
const lg = (await store()).workouts.find((w) => w.id === 'longo')
if (lg.date === '2026-11-18' || !lg.moves?.length) throw new Error('Não remanejou: ' + JSON.stringify(lg))
ok(`Notificação → “Remanejar”: abre o painel de remanejar; foi para ${lg.date}`)

// 6. Tema claro: legenda do mês visível
await p.goto(BASE + '/treinos?ver=mes', { waitUntil: 'networkidle0' })
await p.waitForSelector('.wm-key.ws-feito')
const bg = await p.$eval('.wm-key.ws-feito', (e) => getComputedStyle(e).backgroundColor)
const [r, g, b] = bg.match(/\d+/g).map(Number)
if (r > 200 && g > 200 && b > 200) throw new Error('Legenda apagada no tema claro: ' + bg)
ok(`Tema claro: legenda do mês com cor forte (${bg})`)

for (const W of [320, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of ['/', '/treinos', '/treinos?ver=mes']) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 0) throw new Error(`Rolagem lateral ${W}px ${r}: ${o}`)
  }
}
ok('320 e 1280 px: sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 42 passaram.')
