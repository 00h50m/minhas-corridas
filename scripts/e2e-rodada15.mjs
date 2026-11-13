// Rodada 15: treinos estruturados — editor com repetição e alvo de pace, arquivo .FIT para o relógio
// (conferido com o leitor oficial da Garmin), treino de hoje na Início e planejado × executado pelas voltas.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada15.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Decoder, Encoder, Profile, Stream } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'downloads-r15')
fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const cdp = await p.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r15-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1800)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 8000 }, s)
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v); await wait(100) }
const setValue = (sel, v, ev = 'change') => p.$eval(sel, (el, v, ev) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event(ev, { bubbles: true })) }, v, ev)
const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))

const race = { id: 'r1', name: 'Meia de Campinas', status: 'inscrita', date: '2099-11-08', startTime: '07:00', distanceKm: 21.1, city: 'Campinas', state: 'SP' }
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, race)
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))

// 1. Atalho na Início → lista vazia → novo treino
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.$eval('[data-testid=workouts-link]', (a) => a.click())
await p.waitForFunction(() => location.pathname === '/treinos')
await need('Seus treinos no relógio')
await click('a', 'Criar treino')
await p.waitForSelector('[data-testid=wk-templates]')
await need('não recomendações de treino')
ok('Início → Treinos: lista vazia explica; novo treino começa por estruturas de exemplo (sem prescrição)')

// 2. Validação, estrutura "Intervalado", alvo de pace no tiro
await click('[data-testid=wk-templates] button', 'Intervalado')
await typeIn('#wk-name', '')
await p.$eval('[data-testid=workout-form]', (f) => f.requestSubmit())
await waitText('Dê um nome ao treino')
await typeIn('#wk-name', 'Tiros 6×800')
await setValue('#wk-date', today, 'input')
await setValue('#wk-race', 'r1')
if ((await p.$$('[data-testid=wk-step]')).length !== 4) throw new Error('Esperava 4 passos (aquec., tiro, rec., desaq.)')
await p.evaluate(() => { const s = document.querySelector('[data-testid=wk-repeat] [data-testid=wk-step] select[aria-label=Alvo]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'pace'); s.dispatchEvent(new Event('change', { bubbles: true })) })
await wait(200)
await typeIn('[data-testid=wk-repeat] input[aria-label="Pace mais rápido"]', '450') // teclado numérico: 450 = 4:50
await typeIn('[data-testid=wk-repeat] input[aria-label="Pace mais lento"]', '5:10')
await p.$eval('[data-testid=wk-repeat] input[aria-label="Pace mais lento"]', (el) => el.blur())
await waitText('6×(800 m @ 4:50–5:10/km + 2 min rec.)')
await need('10 min aquec. + 6×(800 m @ 4:50–5:10/km + 2 min rec.) + 10 min desaq.')
// 600 + 6 × (800 m a 5:00/km = 240 s + 120 s) + 600 = 3360 s = 56:00
await need('Estimativa: 56:00')
await shot('editor')
ok('Editor: nome obrigatório; repetição 6× com tiro de 800 m a 4:50–5:10/km (digitado só com números); resumo e estimativa 56:00')

// 3. Reordenar e repetição: muda para 8× e volta para 6×
await typeIn('[data-testid=wk-times]', '8')
await waitText('8×(800 m')
await typeIn('[data-testid=wk-times]', '6')
await click('button', 'Criar treino')
await p.waitForFunction(() => /^\/treinos\/[^/]+$/.test(location.pathname) && !location.pathname.endsWith('novo'))
await p.waitForSelector('[data-testid=workout-detail]')
await need('Repetir 6×')
await need('Preparação para Meia de Campinas')
await need('≈ 56:00')
const saved = (await store()).workouts
if (saved.length !== 1 || saved[0].items[1].steps[0].target.min !== 290 || saved[0].items[1].steps[0].target.max !== 310) throw new Error('Treino salvo errado: ' + JSON.stringify(saved))
const pending = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:sync') || '{}').dirty || {})
if (!pending[`workout:${saved[0].id}`]) throw new Error('Treino não ficou pendente para sincronizar')
await shot('detalhe')
ok('Treino salvo (pace guardado em s/km: 290–310), ligado à prova e pendente para sincronizar com a conta')

// 4. Arquivo .FIT para o relógio (lido de volta com o SDK oficial da Garmin)
await p.$eval('[data-testid=wk-export]', (b) => b.click())
let fitPath = null
for (let i = 0; i < 40 && !fitPath; i++) { await wait(150); const f = fs.readdirSync(DL).find((n) => n.endsWith('.FIT')); if (f) fitPath = path.join(DL, f) }
if (!fitPath) throw new Error('O .FIT não foi baixado')
if (path.basename(fitPath) !== 'PACEON-TIROS-6-800.FIT') throw new Error('Nome do arquivo: ' + path.basename(fitPath))
const dec = new Decoder(Stream.fromByteArray(fs.readFileSync(fitPath)))
if (!dec.isFIT() || !dec.checkIntegrity()) throw new Error('FIT inválido')
const { messages, errors: fitErrs } = dec.read()
if (fitErrs.length) throw new Error('Erros no FIT: ' + fitErrs.map((e) => e.message))
const st = messages.workoutStepMesgs
if (messages.fileIdMesgs[0].type !== 'workout' || messages.workoutMesgs[0].wktName !== 'Tiros 6×800' || st.length !== 5) throw new Error('FIT: ' + JSON.stringify(messages.workoutMesgs))
if (st[3].durationType !== 'repeatUntilStepsCmplt' || st[3].repeatSteps !== 6 || st[3].durationStep !== 1) throw new Error('Repetição: ' + JSON.stringify(st[3]))
if (st[1].durationDistance !== 800 || st[1].targetType !== 'speed' || Math.abs(st[1].customTargetSpeedHigh - 1000 / 290) > 0.01) throw new Error('Tiro: ' + JSON.stringify(st[1]))
await need('GARMIN/NewFiles')
ok(`Baixar para o relógio: ${path.basename(fitPath)} é um FIT de treino válido para o SDK oficial (5 passos, repetir 6×, 800 m a 4:50–5:10/km) + instruções do cabo`)

// 5. Início: treino de hoje
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=home-workout]')
await need('Treino de hoje')
const badge = await p.$eval('[data-testid=workouts-link] i', (i) => i.innerText)
if (badge !== '1') throw new Error('Contador do atalho: ' + badge)
await shot('home')
ok('Início: cartão “Treino de hoje” com o resumo e contador no atalho Treinos')

// 6. Planejado × executado: atividade com uma volta por passo (gerada pelo codificador oficial)
const laps = [[600, 1700]]
for (let i = 0; i < 6; i++) laps.push([i === 4 ? 265 : 236, 800], [120, 300]) // 5º tiro a 5:31/km: fora da faixa
laps.push([600, 1600])
const enc = new Encoder()
const t0 = new Date(today + 'T09:00:00Z').getTime()
enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(t0), type: 'activity' })
let t = t0
let d = 0
for (const [sec, m] of laps) {
  const start = t
  for (let s = 0; s < sec; s += 10) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t + s * 1000), distance: d + (m * s) / sec, heartRate: 150 })
  t += sec * 1000
  d += m
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t), startTime: new Date(start), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: m })
}
enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t), distance: d, heartRate: 150 })
const total = laps.reduce((s, l) => s + l[0], 0)
enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t), startTime: new Date(t0), sport: 'running', totalElapsedTime: total, totalTimerTime: total, totalDistance: d, avgHeartRate: 152 })
const actPath = path.join(DL, 'atividade-tiros.fit')
fs.writeFileSync(actPath, enc.close())
await p.goBack({ waitUntil: 'networkidle0' }).catch(() => {})
await p.goto(BASE + `/treinos/${saved[0].id}`, { waitUntil: 'networkidle0' })
await (await p.$('[data-testid=wk-file]')).uploadFile(actPath)
await p.waitForSelector('[data-testid=wk-executed]')
await need('Atividade importada')
// 6 tiros com alvo de pace: 5 a 4:55/km (dentro), 1 a 5:31/km (fora)
await need('5 de 6 passos com pace dentro da faixa')
const rows = await p.$$eval('.wk-table tbody tr', (trs) => trs.map((tr) => tr.className))
if (rows.length !== 14 || rows.filter((c) => c === 'off').length !== 1 || rows.filter((c) => c === 'ok').length !== 5) throw new Error('Tabela: ' + rows.join(','))
await need('4:55/km ✓')
await need('5:31/km ✗')
const after = (await store()).workouts[0]
if (after.status !== 'feito' || after.result.laps.length !== 14 || Math.abs(after.result.distanceKm - 9.9) > 0.01) throw new Error('Resultado: ' + JSON.stringify(after.result).slice(0, 300))
await shot('executado')
ok('Planejado × executado: 14 voltas casadas com os 14 passos; 5 de 6 tiros na faixa (4:55 ✓, 5:31 ✗); treino marcado como feito')

// 7. Duplicar, lista e excluir
await click('a', 'Duplicar')
await p.waitForSelector('[data-testid=workout-form]')
const copyName = await p.$eval('#wk-name', (i) => i.value)
if (copyName !== 'Tiros 6×800 (cópia)') throw new Error('Nome da cópia: ' + copyName)
await click('button', 'Criar treino')
await p.waitForSelector('[data-testid=workout-detail]')
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
const items = await p.$$('[data-testid=workout-item]')
if (items.length !== 2) throw new Error('Esperava 2 treinos na lista')
await need('Sem data')
await need('Anteriores')
await need('não cria nem recomenda treinos')
await shot('lista')
await click('[data-testid=workout-item]', '(cópia)')
await p.waitForSelector('[data-testid=workout-detail]')
await click('button', 'Excluir')
await click('.dialog button, [role=dialog] button', 'Excluir')
await p.waitForFunction(() => location.pathname === '/treinos')
if ((await store()).workouts.length !== 1) throw new Error('Cópia não foi excluída')
ok('Duplicar (sem data e sem resultado), lista com “Sem data” e “Anteriores”, excluir com confirmação')

// 8. Backup leva os treinos
await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
await click('button', 'Baixar backup')
let bk = null
for (let i = 0; i < 40 && !bk; i++) { await wait(150); const f = fs.readdirSync(DL).find((n) => n.startsWith('paceon-backup') && n.endsWith('.json')); if (f) bk = path.join(DL, f) }
if (!bk) throw new Error('Backup não baixou')
const data = JSON.parse(fs.readFileSync(bk, 'utf8'))
if (data.workouts?.length !== 1 || data.workouts[0].name !== 'Tiros 6×800') throw new Error('Backup sem treinos')
ok('Backup inclui os treinos')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 15 passaram.')
