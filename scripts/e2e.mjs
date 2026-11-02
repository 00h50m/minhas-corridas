// Teste ponta a ponta dos fluxos de conclusão (fase 1) no Chrome headless.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const DL = path.resolve(SHOTS, 'downloads')
fs.mkdirSync(DL, { recursive: true })

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const cdp = await page.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })

const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
page.on('dialog', (d) => d.dismiss())

let step = 0
const ok = (msg) => console.log(`✓ ${msg}`)
const shot = async (name) => page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '))
async function expectText(s) {
  const t = await text()
  if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava encontrar "${s}" na tela.\n---\n${t.slice(0, 1500)}`)
}
async function clickText(sel, s) {
  const ok = await page.evaluate((sel, s) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.innerText.trim().includes(s))
    if (!el) return false
    el.click()
    return true
  }, sel, s)
  if (!ok) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(150)
}
async function type(sel, value) {
  await page.$eval(sel, (el) => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    setter.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  if (value) await page.type(sel, value)
}
async function setDate(sel, iso) {
  await page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, iso)
}
const go = (p) => page.goto(BASE + p, { waitUntil: 'networkidle0' })

// Datas relativas a hoje, sem fuso
const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const br = (s) => s.split('-').reverse().join('/')

await go('/')
await page.evaluate(() => localStorage.clear())
await go('/')
await expectText('Cadastrar primeira corrida')
await shot('inicio-vazio')
ok('Estado vazio na página inicial, sem números fictícios')

// 1. Prova de interesse só com dados básicos
await clickText('a', 'Cadastrar primeira corrida')
await page.waitForSelector('#name')
await clickText('button', 'Salvar corrida') // sem nada
await expectText('Informe o nome da prova')
ok('Validação: nome obrigatório e data ou "a confirmar"')
await type('#name', 'Meia de Jundiaí')
await setDate('#date', iso(40))
await type('#city', 'Jundiaí')
await page.select('#state', 'SP')
await clickText('.seg button', '21,1')
await shot('form-basico')
await clickText('button', 'Salvar corrida')
await page.waitForFunction(() => location.pathname.match(/^\/corridas\/[^/]+$/))
await expectText('Tenho interesse')
await expectText(br(iso(40)))
const raceUrl = new URL(page.url()).pathname
await shot('detalhe-interesse')
ok('1. Prova de interesse cadastrada só com dados básicos')

// 2. Atualizar para Inscrita e preencher kit e custos
await go(raceUrl + '/editar')
await clickText('.form > .card .seg button', 'Inscrita')
await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await type('#fee', 'abc')
await clickText('button', 'Salvar alterações')
await expectText('Valor inválido')
ok('Validação de valor em reais')
await type('#fee', '149,90')
await type('#extraFees', '14,99')
await page.$eval('#shirtIncluded', (el) => el.click())
await wait(100)
await type('#shirtSize', 'Baby look M')
await type('#kitItems', 'Camiseta, medalha, sacochila')
await setDate('#kitPickupDate', iso(38))
await setDate('#kitPickupTime', '10:00')
await type('#kitPickupAddress', 'Shopping Maxi')
await type('#bibNumber', '1234')
await setDate('#startTime', '07:00')
await type('#targetTime', '2:05:00')
await shot('form-kit-custos')
await clickText('button', 'Salvar alterações')
await page.waitForFunction(() => !location.pathname.endsWith('/editar'))
await expectText('Inscrita')
await expectText('R$ 164,89')
await expectText('Baby look M')
await expectText('1234')
await shot('detalhe-inscrita')
ok('2. Atualizada para Inscrita com kit e custos (total R$ 164,89)')

// Outras provas para calendário, mesma data e dia seguido, e uma sem data
async function quickRace(name, date, city, km, status) {
  await go('/corridas/nova')
  await type('#name', name)
  if (date) await setDate('#date', date)
  else await page.$eval('.check input', (el) => el.click())
  if (city) await type('#city', city)
  if (km) await type('#distanceKm', km)
  if (status) await clickText('.form > .card .seg button', status)
  await clickText('button', 'Salvar corrida')
  await page.waitForFunction(() => /^\/corridas\/[^/]+$/.test(location.pathname))
}
await go('/corridas/nova')
await type('#name', 'Night Run')
await setDate('#date', iso(41))
await wait(100)
await expectText('Dia seguido')
await expectText('É só um aviso')
ok('Aviso informativo de dias consecutivos, sem bloquear')
await type('#city', 'São Paulo')
await type('#distanceKm', '5')
await clickText('button', 'Salvar corrida')
await page.waitForFunction(() => /^\/corridas\/[^/]+$/.test(location.pathname))
await quickRace('Corrida das Flores', iso(40), 'Campinas', '10', 'Tenho interesse')
await quickRace('Maratona do Rio', null, 'Rio de Janeiro', '42,195', 'Tenho interesse')
// Provas já corridas, para histórico/recordes
await quickRace('5K do Parque', iso(-60), 'Jundiaí', '5', 'Inscrita')
await quickRace('Track & Field 5K', iso(-20), 'São Paulo', '5', 'Inscrita')

// 3. Encontrar no calendário e pelos filtros
await go('/corridas')
await expectText('Data a confirmar')
await expectText('Maratona do Rio')
await expectText('Mesma data')
await shot('lista')
await type('input[type=search]', 'jundi')
await wait(150)
await expectText('Meia de Jundiaí')
let t = await text()
if (t.includes('Night Run')) throw new Error('Busca não filtrou')
ok('Busca por nome')
await type('input[type=search]', '')
await page.click('button[aria-label^="Filtros"]')
await wait(150)
await clickText('.sheet .seg button', 'Inscrita')
await page.select('#f-city', 'Jundiaí')
await clickText('.sheet .seg button', '21,1 km')
await shot('filtros')
await clickText('.sheet button', 'Aplicar')
await wait(150)
t = await text()
if (!t.includes('Meia de Jundiaí') || t.includes('5K do Parque') || t.includes('Corrida das Flores')) throw new Error('Filtros status/cidade/distância falharam:\n' + t)
await expectText('1 resultado')
ok('Filtros por status, cidade e distância')
await clickText('button', 'Limpar filtros')
await page.click('button[aria-label^="Filtros"]')
await wait(100)
await setDate('.sheet input[aria-label="De"]', iso(39))
await setDate('.sheet input[aria-label="Até"]', iso(41))
await clickText('.sheet button', 'Aplicar')
await wait(150)
t = await text()
if (!t.includes('Night Run') || t.includes('5K do Parque') || t.includes('Maratona do Rio')) throw new Error('Filtro de período falhou')
ok('Filtro por período (provas sem data não entram)')
await clickText('button', 'Limpar filtros')
await clickText('[role=tab]', 'Mês')
// Navegar até o mês da prova
const target = iso(40).slice(0, 7)
for (let i = 0; i < 3; i++) {
  const label = await page.$eval('[role=grid]', (g) => g.getAttribute('aria-label'))
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const [m, , y] = label.split(' ')
  if (`${y}-${String(months.indexOf(m) + 1).padStart(2, '0')}` === target) break
  await page.click('button[aria-label="Próximo mês"]')
  await wait(100)
}
await page.click(`.cal button[aria-label^="${br(iso(40))}"]`)
await wait(150)
await expectText('Meia de Jundiaí')
await expectText('Corrida das Flores')
await shot('calendario-mes')
ok('3. Prova encontrada no calendário mensal (com destaque de mesma data)')

// .ics
await page.click('button[aria-label^="Exportar provas"]')
await wait(800)
const ics = fs.readdirSync(DL).find((f) => f.endsWith('.ics'))
if (!ics) throw new Error('.ics não baixado')
const icsText = fs.readFileSync(path.join(DL, ics), 'utf8')
if (!icsText.includes(`DTSTART:${iso(40).replace(/-/g, '')}T070000`) || icsText.includes('Maratona do Rio')) throw new Error('.ics incorreto')
ok(`Exportação .ics (${(icsText.match(/BEGIN:VEVENT/g) || []).length} eventos, sem a prova sem data)`)

// 5. Concluir prova e registrar resultado
await go('/')
await expectText('Como foi?')
await expectText('Próxima prova confirmada')
await expectText('Faltam 40 dias')
await shot('inicio-com-dados')
ok('Início: próxima confirmada com contagem regressiva e aviso de resultado pendente')
await go('/corridas?concluir=1')
await clickText('a', '5K do Parque')
await page.waitForSelector('#netTime')
await type('#netTime', '31:20')
await type('#watchDistanceKm', '5,08')
await clickText('.effort button', '7')
await clickText('button', 'Concluir prova')
await page.waitForFunction(() => !location.pathname.endsWith('/resultado'))
await expectText('6:16') // pace 31:20/5km
ok('5. Prova concluída com resultado; pace 6:16 /km calculado pela distância oficial')
await go('/corridas?concluir=1')
await clickText('a', 'Track & Field 5K')
await page.waitForSelector('#netTime')
await type('#netTime', '1:75')
await clickText('button', 'Concluir prova')
await expectText('Use mm:ss ou h:mm:ss')
ok('Validação de tempo')
await type('#netTime', '29:40')
await clickText('button', 'Concluir prova')
await page.waitForFunction(() => !location.pathname.endsWith('/resultado'))
await expectText('5:56')

// Resultado acima de 1 hora (prova longa, registro pessoal)
await quickRace('Longão Serra do Japi', iso(-5), 'Jundiaí', '21,1', 'Inscrita')
await page.goto(page.url() + '/resultado', { waitUntil: 'networkidle0' })
await type('#netTime', '2:08:45')
await page.$eval('.check input', (el) => el.click()) // desmarca oficial
await clickText('button', 'Concluir prova')
await page.waitForFunction(() => !location.pathname.endsWith('/resultado'))
await expectText('2:08:45')
await expectText('Registro pessoal')
ok('Tempo acima de 1 hora e registro pessoal sem resultado oficial')

// 6. Conferir pace, histórico e recordes
await go('/historico')
await expectText('3 provas concluídas')
await expectText('6:16 /km')
await shot('historico')
await clickText('[role=tab]', 'Recordes')
await expectText('29:40')
await expectText('Distâncias diferentes não são comparadas')
await expectText('Sem resultado oficial nesta distância')
await shot('recordes')
ok('6. Histórico, recordes por distância oficial e evolução nos 5 km')
await go('/')
await expectText('3')
await expectText('31,1')
await expectText('R$ 164') // só inscrições pagas/inscritas
ok('Indicadores do ano: 3 provas, 31,1 km, gastos com inscrições')

// 7. Editar e excluir
await go(raceUrl + '/editar')
await type('#name', 'Meia Maratona de Jundiaí')
await clickText('button', 'Salvar alterações')
await page.waitForFunction(() => !location.pathname.endsWith('/editar'))
await expectText('Meia Maratona de Jundiaí')
await go('/corridas')
await clickText('a', 'Corrida das Flores')
await page.waitForFunction(() => /^\/corridas\/[^/]+$/.test(location.pathname))
await clickText('button', 'Excluir')
await expectText('Excluir esta corrida?')
await shot('confirmar-exclusao')
await clickText('.dialog button', 'Cancelar')
await expectText('Corrida das Flores')
await clickText('button', 'Excluir')
await clickText('.dialog button', 'Excluir')
await page.waitForFunction(() => location.pathname === '/corridas')
t = await text()
if (t.includes('Corrida das Flores')) throw new Error('Exclusão falhou')
ok('7. Edição e exclusão com confirmação')

// 8. Fechar e reabrir
const before = await page.evaluate(() => localStorage.getItem('minhas-corridas:v1'))
await page.close()
const page2 = await browser.newPage()
await page2.setViewport({ width: 390, height: 844, isMobile: true })
await page2.goto(BASE + '/historico', { waitUntil: 'networkidle0' })
const t2 = await page2.evaluate(() => document.body.innerText)
if (!t2.includes('3 provas concluídas')) throw new Error('Dados perdidos ao reabrir')
ok('8. Dados mantidos ao fechar e reabrir')

// 9. Backup e restauração
const cdp2 = await page2.createCDPSession()
await cdp2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })
await page2.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
await page2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Baixar backup')).click())
await wait(800)
const bkName = fs.readdirSync(DL).find((f) => f.endsWith('.json'))
const bkPath = path.join(DL, bkName)
const bk = JSON.parse(fs.readFileSync(bkPath, 'utf8'))
if (bk.races.length !== 6) throw new Error('Backup com quantidade errada: ' + bk.races.length)
await page2.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Apagar todos')).click())
await wait(150)
await page2.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.innerText.includes('Apagar tudo')).click())
await wait(200)
if (!(await page2.evaluate(() => document.body.innerText)).includes('0 corridas salvas')) throw new Error('Não apagou')
const input = await page2.$('input[type=file]')
// Arquivo inválido primeiro
const badPath = path.join(DL, 'ruim.json')
fs.writeFileSync(badPath, '{"foo": 1}')
await input.uploadFile(badPath)
await wait(300)
if (!(await page2.evaluate(() => document.body.innerText)).includes('não parece ser um backup')) throw new Error('Arquivo inválido aceito')
await input.uploadFile(bkPath)
await wait(300)
await page2.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.innerText.includes('Restaurar')).click())
await wait(300)
const after = await page2.evaluate(() => localStorage.getItem('minhas-corridas:v1'))
if (JSON.parse(after).races.length !== JSON.parse(before).races.length) throw new Error('Restauração incompleta')
await page2.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-ajustes.png`, fullPage: true })
ok('9. Backup exportado, dados apagados, arquivo inválido recusado e backup restaurado')

// Rota direta (refresh) numa página interna
await page2.goto(BASE + raceUrl, { waitUntil: 'networkidle0' })
if (!(await page2.evaluate(() => document.body.innerText)).toLowerCase().includes('meia maratona de jundiaí')) throw new Error('Rota direta falhou')
ok('Abrir link direto de uma corrida funciona')

await browser.close()
if (errors.length) {
  console.log('\nErros no console:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nTodos os fluxos passaram.')
