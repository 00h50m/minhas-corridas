// Rodada 5: modo dia da prova, previsão de tempo, preferências das notificações e carregamento sob demanda.
// Supabase SIMULADO no navegador. Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada5.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SB = 'https://yovlefpwtcahmgqkbwsr.supabase.co'
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
const txt = () => p.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r5-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.includes(s))
    if (el) el.click()
    return !!el
  }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const expectText = async (s) => {
  const t = await txt()
  if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1500)}`)
}

// Supabase simulado
const calls = []
let prefsRow = null
let prefsTable = false
await p.setRequestInterception(true)
p.on('request', (req) => {
  if (!req.url().startsWith(SB)) return req.continue()
  const u = new URL(req.url())
  calls.push(`${req.method()} ${u.pathname}${req.postData() ? ' ' + req.postData() : ''}`)
  const json = (status, body) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: body === undefined ? '' : JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return json(200, {})
  if (u.pathname === '/auth/v1/settings') return json(200, { external: { email: true } })
  if (u.pathname.startsWith('/rest/v1/records')) return json(200, [])
  if (u.pathname === '/rest/v1/calendar_feeds') return json(200, null)
  if (u.pathname === '/rest/v1/push_prefs') {
    if (!prefsTable) return json(404, { code: 'PGRST205', message: "Could not find the table 'public.push_prefs' in the schema cache" })
    if (req.method() === 'POST') { prefsRow = JSON.parse(req.postData()); return json(201) }
    return json(200, prefsRow ? { prefs: prefsRow.prefs } : null)
  }
  return json(404, { message: 'não simulado: ' + u.pathname })
})

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const later = new Date(Date.now() + 3 * 3600e3)
const startTime = `${String(later.getHours()).padStart(2, '0')}:00`
const done = (id, name, date, km, t) => ({ id, name, status: 'concluida', date, distanceKm: km, result: { officialDistanceKm: km, netTime: t, isOfficial: true, watch: null } })
const races = [
  done('d1', '10K da Ponte', iso(-60), 10, 3000),
  done('d2', '5K do Parque', iso(-30), 5, 1440),
  { id: 'hoje', name: 'Meia de Floripa', status: 'inscrita', date: iso(0), startTime: later.getHours() >= 1 && later.getDate() === new Date().getDate() ? startTime : '', distanceKm: 21.1, bibNumber: '4821', venueName: 'Beira-Mar Norte', venueAddress: 'Av. Beira-Mar Norte, 1000', city: 'Florianópolis', state: 'SC', leaveHomeTime: '' },
  { id: 'futura', name: 'Maratona do Rio', status: 'aberta', date: iso(120), distanceKm: 42.195 },
  { id: 'futura10', name: '10K Noturno', status: 'interesse', date: iso(40), distanceKm: 10 }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)

// 1. Início no dia da prova → modo prova
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await expectText('Dia de prova')
await click('a.hero', 'Meia de Floripa')
await p.waitForFunction(() => location.pathname === '/corridas/hoje/dia')
await p.waitForSelector('.race-day .bib')
await expectText('4821')
await expectText('Abrir no mapa')
const map = await p.$eval('a[href*="google.com/maps"]', (a) => a.href)
if (!decodeURIComponent(map).includes('Av. Beira-Mar Norte, 1000, Florianópolis, SC')) throw new Error('Mapa errado: ' + map)
await p.waitForSelector('[data-testid=predict-card]')
await expectText('tempo estimado')
await shot('dia-da-prova')
ok('Dia da prova: Início leva ao modo prova, com peito, mapa, checklist e previsão (sem meta)')

// 2. Meta no detalhe: previsão sugere, “Usar” preenche e “Definir meta” salva
await p.goto(BASE + '/corridas/futura10', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=target-set] [data-testid=predict-hint]')
await expectText('Meta de tempo')
const mesma = await txt()
if (!mesma.includes('10K da Ponte')) throw new Error('Fonte da previsão ausente')
await click('[data-testid=predict-hint] button', 'Usar')
await click('[data-testid=target-set] button', 'Definir meta')
await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('plano de prova'))
const target = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races.find((r) => r.id === 'futura10').targetTime)
if (target !== 3000) throw new Error('Meta salva errada: ' + target)
ok('Meta no detalhe: 10K estimado pelo 10K anterior (50:00), usado e salvo como meta')

// Maratona: 42,195/10 = 4,2x → aproximada; ainda mostra, com aviso
await p.goto(BASE + '/corridas/futura', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=predict-hint]')
await expectText('estimativa aproximada')
ok('Maratona estimada por provas curtas aparece marcada como aproximada')

// 3. Previsão no formulário
await p.goto(BASE + '/corridas/nova', { waitUntil: 'networkidle0' })
await p.waitForSelector('#name')
await p.type('#name', 'Meia de Teste')
await p.type('#distanceKm', '21,1')
await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await p.waitForSelector('[data-testid=predict-hint]')
await click('[data-testid=predict-hint] button', 'Usar')
const tv = await p.$eval('#targetTime', (e) => e.value)
if (tv !== '1:50:00') throw new Error('Meta preenchida errada: ' + tv)
ok(`Formulário: previsão preenche a meta (${tv})`)

// 4. Preferências das notificações (conta simulada)
const exp = Math.floor(Date.now() / 1000) + 3600
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const user = { id: '11111111-2222-3333-4444-555555555555', email: 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated' }
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated', email: user.email })}.assinatura`
await p.evaluate((s, uid) => {
  localStorage.setItem('minhas-corridas:auth', JSON.stringify(s))
  localStorage.setItem('minhas-corridas:sync', JSON.stringify({ ownerId: uid, cursor: null, dirty: {}, tombstones: {} }))
}, { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }, user.id)
await p.goto(BASE + '/lembretes', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=push-prefs]')
await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('rode o trecho 8'))
ok('Sem a tabela de preferências: explica qual trecho do SQL rodar')
prefsTable = true
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForFunction(() => document.querySelector('[data-testid=push-prefs]')?.getAttribute('aria-busy') === 'false')
const pressed = await p.$$eval('.pref-days button[aria-pressed=true]', (bs) => bs.map((b) => b.closest('.pref-row').querySelector('.pref-name').innerText + ':' + b.innerText))
if (pressed.join('|') !== 'Fim da inscrição:3 dias antes|Fim da inscrição:No dia|Mudança de lote:Véspera|Retirada do kit:Véspera|Retirada do kit:No dia|Dia da prova:Véspera') throw new Error('Padrão errado: ' + pressed.join('|'))
await p.evaluate(() => [...document.querySelectorAll('.pref-row')].find((r) => r.innerText.includes('Fim da inscrição')).querySelector('button').click()) // 7 dias
await p.waitForFunction(() => document.querySelector('[data-testid=push-prefs]').getAttribute('aria-busy') === 'false')
await click('label', 'Resumo da semana')
await p.waitForFunction(() => document.querySelector('[data-testid=push-prefs]').getAttribute('aria-busy') === 'false')
if (!prefsRow || prefsRow.user_id !== user.id || prefsRow.prefs.weekly !== true || prefsRow.prefs.inscricao.join() !== '7,3,0') throw new Error('Preferências não salvas: ' + JSON.stringify(prefsRow))
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForFunction(() => document.querySelector('[data-testid=push-prefs]')?.getAttribute('aria-busy') === 'false')
if (!(await p.$eval('.prefs input[type=checkbox]', (i) => i.checked))) throw new Error('Resumo semanal não voltou marcado')
await shot('preferencias')
ok('Preferências: padrão, escolher antecedência e resumo da semana, salvos na conta e lidos de volta')

// 5. Carregamento sob demanda: a biblioteca do Supabase não está no arquivo principal
const html = await (await fetch(BASE + '/')).text()
const main = html.match(/src="(\/assets\/index-[^"]+\.js)"/)[1]
const code = await (await fetch(BASE + main)).text()
if (code.length > 400_000) throw new Error('Arquivo principal ainda grande: ' + code.length)
if (code.includes('GoTrueClient')) throw new Error('Supabase ainda no arquivo principal')
ok(`Arquivo principal com ${Math.round(code.length / 1024)} kB; conta e telas pesadas carregam à parte`)

await browser.close()
if (errors.length) {
  console.log('\nErros no console:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nTodos os testes da rodada 5 passaram.')
