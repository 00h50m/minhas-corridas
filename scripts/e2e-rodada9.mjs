// Rodada 9: perfil opcional (nome, foto, faixa etária, camiseta, emergência) e saudação no Início.
// Supabase SIMULADO. Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada9.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const BASE = process.env.BASE || 'http://localhost:4173'
const SB = 'https://yovlefpwtcahmgqkbwsr.supabase.co'
const SHOTS = process.env.SHOTS || 'shots'
const DL = path.resolve(SHOTS, 'downloads-r9')
fs.mkdirSync(DL, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let step = 0
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const txt = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r9-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const expectText = async (s) => { const t = await txt(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1800)}`) }
const notText = async (s) => { if ((await txt()).toLowerCase().includes(s.toLowerCase())) throw new Error(`Não esperava "${s}"`) }
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const clickExact = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.trim() === s); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} = "${s}"`)
  await wait(150)
}
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); await p.type(sel, v) }
const setDate = (sel, v) => p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, v)

// Supabase simulado: tabela profiles
const calls = []
let remote = null
await p.setRequestInterception(true)
p.on('request', (req) => {
  if (!req.url().startsWith(SB)) return req.continue()
  const u = new URL(req.url())
  calls.push(`${req.method()} ${u.pathname}`)
  const json = (status, body) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: body === undefined ? '' : JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return json(200, {})
  if (u.pathname === '/auth/v1/settings') return json(200, { external: { email: true } })
  if (u.pathname.startsWith('/rest/v1/records')) return json(200, [])
  if (u.pathname === '/rest/v1/profiles') {
    if (req.method() === 'POST') { remote = JSON.parse(req.postData()); return json(201) }
    return json(200, remote ? { data: remote.data, avatar: remote.avatar, updated_at: remote.updated_at } : null)
  }
  return json(404, { message: 'não simulado: ' + u.pathname })
})

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const races = [
  { id: 'dia', name: 'Meia de Floripa', status: 'inscrita', date: iso(0), distanceKm: 21.1 },
  { id: 'feita', name: '10K do Parque', status: 'concluida', date: iso(-20), distanceKm: 10, result: { officialDistanceKm: 10, netTime: 3000, isOfficial: true, watch: null } }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)

// 1. Sem perfil: convite discreto e saudação sem nome; dispensar fica lembrado
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=profile-invite]')
await expectText('Como você quer ser chamada(o)?')
await click('[data-testid=profile-invite] button', 'Agora não')
await p.reload({ waitUntil: 'networkidle0' })
if (await p.$('[data-testid=profile-invite]')) throw new Error('Convite voltou depois de dispensado')
ok('Sem perfil: convite opcional no Início, que some ao dispensar')

// 2. Preencher o perfil pelo avatar do topo
await p.click('[data-testid=avatar-btn]')
await p.waitForSelector('#p-name')
await expectText('Tudo aqui é opcional')
await typeIn('#p-name', 'Giovanna Pupo')
await expectText('Se ficar vazio: “Giovanna”')
await typeIn('#p-nick', 'Gi')
const by = new Date().getFullYear() - 36
await setDate('#p-birth', `${by}-01-15`)
await clickExact('[role=radio]', 'Feminino')
await expectText(`Sua faixa em ${new Date().getFullYear()}: F 35-39`)
await clickExact('[role=radio]', 'M')
await typeIn('#p-ename', 'Paula (mãe)')
await typeIn('#p-ephone', '(11) 98888-7777')
await clickExact('[role=radio]', 'O+')
// foto
const photo = path.join(DL, 'eu.jpg')
const W = 900, H = 600
const raw = Buffer.alloc(W * H * 3)
for (let i = 0; i < W * H; i++) { raw[i * 3] = 220; raw[i * 3 + 1] = 120 + (i % W) / 8; raw[i * 3 + 2] = 90 }
await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg().toFile(photo)
await (await p.$('[data-testid=avatar-input]')).uploadFile(photo)
await p.waitForFunction(() => !!document.querySelector('.profile-head .avatar img'))
const avatar = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:perfil')).avatar)
const dims = await p.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = src }), avatar)
if (dims[0] !== 320 || dims[1] !== 320 || avatar.length > 60000) throw new Error('Foto não reduzida: ' + dims + ' ' + avatar.length)
await shot('perfil')
await click('button', 'Salvar perfil')
await p.waitForFunction(() => location.pathname === '/')
await p.waitForFunction(() => document.body.innerText.includes(', Gi'))
if (!(await p.$('[data-testid=avatar-btn] img'))) throw new Error('Foto não aparece no topo')
await shot('inicio-com-nome')
ok('Perfil: nome, apelido, faixa F 35-39, camiseta, emergência e foto (recortada em 320×320); Início saúda “…, Gi” com a foto')

// 3. Camiseta já preenchida no cadastro
await p.goto(BASE + '/corridas/nova', { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await p.click('#shirtIncluded')
await wait(150)
if ((await p.$eval('#shirtSize', (e) => e.value)) !== 'M') throw new Error('Camiseta não preenchida pelo perfil')
ok('Cadastro: marcar “Camiseta incluída” já preenche o tamanho M do perfil')

// 4. Faixa etária sugerida no resultado
await p.goto(BASE + '/corridas/feita/resultado', { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await p.waitForSelector('[data-testid=cat-hint]')
await click('[data-testid=cat-hint] button', 'Usar')
if ((await p.$eval('#category', (e) => e.value)) !== 'F 35-39') throw new Error('Categoria não aplicada')
ok('Resultado: categoria sugerida pelo perfil (F 35-39) com um toque')

// 5. Emergência no modo dia da prova
await p.goto(BASE + '/corridas/dia/dia', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=emergency]')
await expectText('Paula (mãe)')
await expectText('O+')
const tel = await p.$eval('[data-testid=emergency] a', (a) => a.getAttribute('href'))
if (tel !== 'tel:11988887777') throw new Error('Link de telefone: ' + tel)
ok('Modo dia da prova: contato de emergência com toque para ligar e tipo sanguíneo')

// 6. Nome no card de compartilhar
await p.goto(BASE + '/corridas/feita/compartilhar', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.innerText.includes('Mostrar meu nome')))
if (!(await p.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.innerText.includes('Mostrar meu nome')).querySelector('input').checked))) throw new Error('Nome no card deveria vir marcado')
ok('Card de compartilhar: opção “Mostrar meu nome” ligada pelo perfil')

// 7. Conta: o perfil sobe para a nuvem; num aparelho novo, desce de lá
const exp = Math.floor(Date.now() / 1000) + 3600
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const user = { id: '11111111-2222-3333-4444-555555555555', email: 'gi@exemplo.com', aud: 'authenticated', role: 'authenticated' }
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated', email: user.email })}.assinatura`
const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
await p.evaluate((s, uid) => {
  localStorage.setItem('minhas-corridas:auth', JSON.stringify(s))
  localStorage.setItem('minhas-corridas:sync', JSON.stringify({ ownerId: uid, cursor: null, dirty: {}, tombstones: {} }))
}, session, user.id)
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
for (let i = 0; i < 40 && !remote; i++) await wait(150)
if (!remote || remote.data.name !== 'Giovanna Pupo' || !remote.avatar?.startsWith('data:image/jpeg') || remote.user_id !== user.id) throw new Error('Perfil não enviado: ' + JSON.stringify(remote)?.slice(0, 200))
// "Aparelho novo": sem perfil local; a nuvem tem uma versão mais nova
remote = { ...remote, data: { ...remote.data, nickname: 'Giovana da nuvem' }, updated_at: new Date(Date.now() + 1000).toISOString() }
await p.evaluate(() => localStorage.removeItem('minhas-corridas:perfil'))
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => document.body.innerText.includes('Giovana da nuvem'), { timeout: 10000 })
ok('Com conta: perfil enviado para a nuvem (com foto) e baixado num aparelho sem perfil')

await browser.close()
if (errors.length) { console.log('\nErros no console:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 9 passaram.')
