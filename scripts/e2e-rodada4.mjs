// Rodada 4: card para compartilhar, comparar km a km, agenda por assinatura e notificações push.
// Supabase e /api/push SIMULADOS no navegador; o push é entregue ao service worker pelo DevTools.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada4.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE || 'http://localhost:4173'
const SB = 'https://yovlefpwtcahmgqkbwsr.supabase.co'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'downloads-r4')
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
await browser.defaultBrowserContext().overridePermissions(BASE, ['notifications'])
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const cdp = await p.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const txt = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r4-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.includes(s))
    if (el) el.click()
    return !!el
  }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(200)
}
const expectText = async (s) => {
  const t = await txt()
  if (!t.includes(s)) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1500)}`)
}

// Push simulado no nível do navegador: o headless não alcança o serviço de push real.
await p.evaluateOnNewDocument(() => {
  const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/teste123', options: {}, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/teste123', keys: { p256dh: 'BPUBKEY', auth: 'AUTH' } }), unsubscribe: async () => { localStorage.removeItem('fake-push'); return true } }
  PushManager.prototype.subscribe = async function () { localStorage.setItem('fake-push', '1'); return fake }
  PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fake-push') ? fake : null }
})

// Supabase e /api/push simulados
const calls = []
let feedToken = null
let pushConfigured = false
await p.setRequestInterception(true)
p.on('request', (req) => {
  const u = new URL(req.url())
  const json = (status, body) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: body === undefined ? '' : JSON.stringify(body) })
  if (u.origin === new URL(BASE).origin && u.pathname === '/api/push') {
    calls.push(`${req.method()} /api/push ${req.headers().authorization ? 'auth' : ''}`.trim())
    if (!pushConfigured) return json(503, { error: 'As notificações ainda não foram configuradas no servidor.' })
    if (req.method() === 'GET') return json(200, { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' })
    return json(200, { sent: 1, devices: 1 })
  }
  if (!req.url().startsWith(SB)) return req.continue()
  calls.push(`${req.method()} ${u.pathname}${req.method() === 'POST' && req.postData() ? ' ' + req.postData() : ''}`)
  if (req.method() === 'OPTIONS') return json(200, {})
  if (u.pathname === '/auth/v1/settings') return json(200, { external: { email: true } })
  if (u.pathname.startsWith('/rest/v1/records')) return json(200, [])
  if (u.pathname === '/rest/v1/calendar_feeds') {
    if (req.method() === 'DELETE') { feedToken = null; return json(204) }
    return json(200, feedToken ? { token: feedToken } : null)
  }
  if (u.pathname === '/rest/v1/rpc/rotate_calendar_feed') { feedToken = (feedToken ? 'b' : 'a').repeat(64); return json(200, feedToken) }
  if (u.pathname === '/rest/v1/rpc/save_push_subscription') return json(204)
  if (u.pathname === '/rest/v1/rpc/delete_push_subscription') return json(204)
  return json(404, { message: 'não simulado: ' + u.pathname })
})

// Dados: duas meias com parciais, um 10K sem parciais
const splits = (base, n, drift) => Array.from({ length: n }, (_, i) => ({ km: i + 1, sec: Math.round(base + drift * i + (i % 3) * 2) }))
const sum = (s) => s.reduce((a, x) => a + x.sec, 0)
const s1 = splits(345, 21, 1.5)
const s2 = splits(340, 21, -0.6)
const res = (km, sp, extra = {}) => ({ officialDistanceKm: km, watchDistanceKm: null, netTime: sp ? sum(sp) + 30 : 3150, grossTime: null, overallPlace: 812, categoryPlace: 41, category: 'F35-39', officialUrl: '', isOfficial: true, effort: 8, report: '', watch: sp ? { source: 'fit', fileName: 'x.fit', distanceKm: km + 0.1, elapsedSec: sum(sp) + 30, avgHr: 166, maxHr: 181, elevGainM: 85, splits: [...sp, { km: km + 0.1, sec: 30, partial: 200 }] } : null, ...extra })
const races = [
  { id: 'm1', name: 'Meia Maratona de Curitiba', status: 'concluida', date: '2025-08-10', city: 'Curitiba', state: 'PR', distanceKm: 21.1, result: res(21.1, s1) },
  { id: 'm2', name: 'Meia Maratona Internacional de São Paulo', status: 'concluida', date: '2026-04-12', city: 'São Paulo', state: 'SP', distanceKm: 21.1, targetTime: 7350, result: res(21.1, s2) },
  { id: 't1', name: '10K Noturno', status: 'concluida', date: '2026-02-01', city: 'Santos', state: 'SP', distanceKm: 10, result: res(10, null) }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)

// 1. Card para compartilhar
await p.goto(BASE + '/corridas/m2', { waitUntil: 'networkidle0' })
await click('a', 'Compartilhar')
await p.waitForFunction(() => location.pathname === '/corridas/m2/compartilhar')
await p.waitForFunction(() => { const c = document.querySelector('[data-testid=share-canvas]'); return c && c.width === 1080 && c.height === 1350 })
await wait(400)
const painted = await p.$eval('[data-testid=share-canvas]', (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let bright = 0, brand = 0
  for (let i = 0; i < d.length; i += 4 * 97) { if (d[i] > 240 && d[i + 1] > 240) bright++; if (d[i] > 240 && d[i + 1] > 70 && d[i + 1] < 110 && d[i + 2] < 80) brand++ }
  return { bright, brand }
})
if (painted.bright < 50 || painted.brand < 50) throw new Error('Card parece vazio: ' + JSON.stringify(painted))
await expectText('Mostrar classificação')
await expectText('Mostrar parciais por km')
await shot('compartilhar-feed')
fs.writeFileSync(`${SHOTS}/r4-card-feed.png`, Buffer.from((await p.$eval('[data-testid=share-canvas]', (c) => c.toDataURL('image/png'))).split(',')[1], 'base64'))
await click('[role=tab]', 'Stories')
await p.waitForFunction(() => document.querySelector('[data-testid=share-canvas]').height === 1920)
await wait(200)
fs.writeFileSync(`${SHOTS}/r4-card-story.png`, Buffer.from((await p.$eval('[data-testid=share-canvas]', (c) => c.toDataURL('image/png'))).split(',')[1], 'base64'))
// Foto da prova como fundo
const photo = path.join(DL, 'chegada.jpg')
const W = 1200, H = 900
const raw = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; raw[i] = 40 + (x * 150) / W; raw[i + 1] = 120 + (y * 100) / H; raw[i + 2] = 200 - (x * 80) / W }
await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg().toFile(photo)
await p.goto(BASE + '/corridas/m2', { waitUntil: 'networkidle0' })
await (await p.$('input[data-testid=photo-input]')).uploadFile(photo)
await p.waitForFunction(() => document.querySelectorAll('.photo').length === 1)
await p.goto(BASE + '/corridas/m2/compartilhar', { waitUntil: 'networkidle0' })
await p.waitForSelector('.photo-pick [aria-label^="Foto"]')
await p.$eval('.photo-pick [aria-label^="Foto"]', (b) => b.click())
await wait(600)
if (!(await p.$('[data-testid=share-canvas]'))) throw new Error('Canvas sumiu: ' + errors.join(' | ') + ' @ ' + p.url())
fs.writeFileSync(`${SHOTS}/r4-card-foto.png`, Buffer.from((await p.$eval('[data-testid=share-canvas]', (c) => c.toDataURL('image/png'))).split(',')[1], 'base64'))
const tint = await p.$eval('[data-testid=share-canvas]', (c) => Array.from(c.getContext('2d').getImageData(540, 700, 1, 1).data))
if (!(tint[1] > tint[0])) throw new Error('Fundo com foto não aplicado: ' + tint)
ok('Card com foto da prova de fundo')
await click('[role=tab]', 'Quadrado')
await p.waitForFunction(() => document.querySelector('[data-testid=share-canvas]').height === 1080)
await click('label', 'Mostrar classificação')
await click('button', 'Baixar imagem')
for (let i = 0; i < 30 && !fs.existsSync(path.join(DL, 'meia-maratona-internacional-de-sao-paulo-2026-04-12.png')); i++) await wait(200)
const png = fs.readFileSync(path.join(DL, 'meia-maratona-internacional-de-sao-paulo-2026-04-12.png'))
if (png.readUInt32BE(16) !== 1080 || png.readUInt32BE(20) !== 1080) throw new Error('PNG baixado com tamanho errado')
ok('Card: feed 1080×1350, stories 1080×1920 e quadrado; opções e PNG baixado com nome da prova')

// 2. Comparar km a km (a partir do detalhe: sugere a meia anterior)
await p.goto(BASE + '/corridas/m2', { waitUntil: 'networkidle0' })
await click('a', 'Comparar')
await p.waitForFunction(() => location.pathname === '/comparar' && location.search.includes('a=m1') && location.search.includes('b=m2'))
await p.waitForSelector('[data-testid=km-table]')
const rows = await p.$$eval('[data-testid=km-table] tbody tr', (trs) => trs.length)
if (rows !== 21) throw new Error('Esperava 21 km na tabela, veio ' + rows)
const diffTotal = sum(s2) - sum(s1)
const t2 = await txt()
const fmt = (s) => `${s < 0 ? '−' : '+'}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`
if (!t2.includes(`(${fmt(diffTotal)} no acumulado)`)) throw new Error('Acumulado errado: esperado ' + fmt(diffTotal) + '\n' + t2.slice(0, 1200))
if (!t2.includes('mais rápida que Meia Maratona de Cu')) throw new Error('Resumo do tempo total ausente')
await shot('comparar')
// Trocar a prova 2 por uma sem parciais
await p.select('#cmp-b', 't1')
await p.waitForFunction(() => document.body.innerText.includes('não tem parciais por km'))
await expectText('Distâncias diferentes')
ok(`Comparar: 21 km lado a lado, acumulado ${fmt(diffTotal)}, aviso de distância diferente e de prova sem parciais`)

// 3. Agenda e avisos sem conta
await p.goto(BASE + '/lembretes', { waitUntil: 'networkidle0' })
await expectText('Entre na conta para usar estes recursos')
ok('Agenda e avisos sem conta: explica e leva para a conta')

// 4. Com conta (sessão falsa)
const exp = Math.floor(Date.now() / 1000) + 3600
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const user = { id: '11111111-2222-3333-4444-555555555555', email: 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated' }
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated', email: user.email })}.assinatura`
await p.evaluate((s, uid) => {
  localStorage.setItem('minhas-corridas:auth', JSON.stringify(s))
  localStorage.setItem('minhas-corridas:sync', JSON.stringify({ ownerId: uid, cursor: null, dirty: {}, tombstones: {} }))
}, { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }, user.id)
await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
await click('a', 'Agenda e avisos')
await p.waitForFunction(() => document.body.innerText.includes('Criar link da agenda'))
await click('button', 'Criar link da agenda')
await p.waitForSelector('[data-testid=feed-link]')
const link = await p.$eval('[data-testid=feed-link]', (e) => e.innerText)
if (link !== `${BASE}/agenda/${'a'.repeat(64)}/minhas-corridas.ics`) throw new Error('Link da agenda errado: ' + link)
const hrefs = await p.$$eval('.card a.btn', (as) => as.map((a) => a.href))
if (!hrefs.some((h) => h.startsWith('webcal://localhost:4173/agenda/')) || !hrefs.some((h) => h.startsWith('https://calendar.google.com/calendar/render?cid=webcal'))) throw new Error('Links de assinatura: ' + hrefs.join(' '))
await click('button', 'Trocar link')
await click('.dialog button', 'Trocar link')
await p.waitForFunction(() => document.querySelector('[data-testid=feed-link]')?.innerText.includes('bbbb'))
await shot('agenda-avisos')
ok('Agenda por assinatura: cria link secreto, links webcal/Google e troca de link')

// 5. Notificações
await p.waitForFunction(() => document.body.innerText.includes('Ativar neste aparelho'))
await click('button', 'Ativar neste aparelho')
await p.waitForFunction(() => document.body.innerText.includes('ainda não foram configuradas no servidor'))
ok('Servidor sem chaves VAPID: mensagem clara, nada é inscrito')
pushConfigured = true
await click('button', 'Ativar neste aparelho')
await p.waitForFunction(() => document.body.innerText.includes('Ativadas neste aparelho'), { timeout: 15000 })
const saved = calls.find((c) => c.startsWith('POST /rest/v1/rpc/save_push_subscription'))
if (!saved || !saved.includes('"p_endpoint":"https://fcm.googleapis.com/fcm/send/teste123"') || !saved.includes('"p_tz":"')) throw new Error('Inscrição não salva: ' + calls.join('\n'))
await click('button', 'Enviar teste')
await p.waitForFunction(() => document.body.innerText.includes('Teste enviado'))
if (!calls.includes('POST /api/push auth')) throw new Error('Teste não mandou o token de login')
await shot('notificacoes-ativas')
ok('Notificações: ativa (permissão + inscrição salva com fuso), teste enviado com o login')

// 6. O service worker mostra a notificação recebida
const swReady = await p.evaluate(async () => !!(await navigator.serviceWorker.ready))
if (!swReady) throw new Error('Service worker não ativo')
await cdp.send('ServiceWorker.enable')
const regId = await new Promise((resolve) => {
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => registrations[0] && resolve(registrations[0].registrationId))
  setTimeout(() => resolve(null), 3000)
})
if (!regId) throw new Error('Registro do service worker não encontrado')
await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(BASE).origin, registrationId: regId, data: JSON.stringify({ title: 'Amanhã é dia de prova!', body: 'Meia de SP · largada 07:00', url: '/corridas/m2', tag: 'm2:prova' }) })
let shown = []
for (let i = 0; i < 20 && !shown.length; i++) {
  await wait(250)
  shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })))
}
if (!shown.length || shown[0].title !== 'Amanhã é dia de prova!' || shown[0].url !== '/corridas/m2' || shown[0].tag !== 'm2:prova') throw new Error('Notificação não exibida: ' + JSON.stringify(shown))
ok('Service worker recebeu o push e mostrou a notificação com o link da prova')

// 7. Desativar e sair da conta remove a inscrição
await click('[data-testid=push-off]', 'Desativar')
await p.waitForFunction(() => document.body.innerText.includes('Ativar neste aparelho'))
if (!calls.some((c) => c.startsWith('POST /rest/v1/rpc/delete_push_subscription'))) throw new Error('Desativar não removeu no servidor')
ok('Desativar remove a inscrição do servidor e do aparelho')

await browser.close()
if (errors.length) {
  console.log('\nErros no console:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nTodos os testes da rodada 4 passaram.')
