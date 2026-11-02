// Testa as telas de conta com o Supabase SIMULADO (respostas falsas no navegador).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-conta.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://localhost:4173'
const SB = 'https://yovlefpwtcahmgqkbwsr.supabase.co'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 390, height: 844 })
const txt = () => p.evaluate(() => document.body.innerText)
const click = (sel, s) => p.evaluate((sel, s) => [...document.querySelectorAll(sel)].find((x) => x.innerText.includes(s)).click(), sel, s)

let rpcExists = false
const calls = []
let googleOn = false
await p.setRequestInterception(true)
p.on('request', (req) => {
  const u = req.url()
  if (!u.startsWith(SB)) return req.continue()
  const path = new URL(u).pathname
  calls.push(`${req.method()} ${path}`)
  const json = (status, body) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return json(200, {})
  if (path === '/auth/v1/settings') return json(200, { external: { email: true, google: googleOn } })
  if (path === '/auth/v1/logout') return json(204, {})
  if (path.startsWith('/rest/v1/records')) return json(200, [])
  if (path === '/storage/v1/object/list/anexos') return json(200, calls.filter((c) => c === 'POST /storage/v1/object/list/anexos').length === 1 ? [{ name: 'f1' }, { name: 'f2' }] : [])
  if (path === '/storage/v1/object/anexos') return json(200, [])
  if (path === '/rest/v1/rpc/delete_my_account') return rpcExists ? json(204, null) : json(404, { code: 'PGRST202', message: 'Could not find the function public.delete_my_account' })
  return json(404, { message: 'não simulado: ' + path })
})

// Sem Google ativo: botão não aparece
await p.goto(BASE + '/conta', { waitUntil: 'networkidle0' })
await p.evaluate(() => localStorage.clear())
await p.goto(BASE + '/conta', { waitUntil: 'networkidle0' })
await wait(300)
if ((await txt()).includes('Entrar com Google')) throw new Error('Botão do Google sem provedor ativo')
ok('Sem Google ativo no Supabase, o botão não aparece')

// Com Google ativo: botão aparece e leva ao Google com retorno para /conta
googleOn = true
await p.goto(BASE + '/conta', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => document.body.innerText.includes('Entrar com Google'))
const nav = new Promise((res) => p.on('request', (r) => r.isNavigationRequest() && r.url().includes('/auth/v1/authorize') && res(r.url())))
await click('button', 'Entrar com Google')
const authUrl = await nav
if (!authUrl.includes('provider=google') || !decodeURIComponent(authUrl).includes('/conta')) throw new Error('URL do Google errada: ' + authUrl)
ok('Com Google ativo, o botão leva ao login do Google e volta para /conta')

// Sessão falsa (não expirada) para testar a exclusão
const exp = Math.floor(Date.now() / 1000) + 3600
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const user = { id: '11111111-2222-3333-4444-555555555555', email: 'teste@exemplo.com', aud: 'authenticated', role: 'authenticated' }
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated', email: user.email })}.assinatura`
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((s, uid) => {
  localStorage.clear()
  localStorage.setItem('minhas-corridas:auth', JSON.stringify(s))
  localStorage.setItem('minhas-corridas:sync', JSON.stringify({ ownerId: uid, cursor: null, dirty: {}, tombstones: {} }))
  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [{ id: 'r1', name: 'Prova da Nuvem', status: 'interesse', date: null }], goals: [] }))
}, { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }, user.id)
await p.goto(BASE + '/conta', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => document.body.innerText.includes('teste@exemplo.com'))
ok('Sessão reconhecida: tela da conta com o e-mail')

await click('button', 'Excluir minha conta')
await p.waitForSelector('#confirm-delete')
if (!(await p.$eval('.danger-card .btn-danger', (e) => e.disabled))) throw new Error('Excluir habilitado sem digitar EXCLUIR')
await p.type('#confirm-delete', 'excluir')
await click('.danger-card button', 'Excluir tudo')
await p.waitForFunction(() => document.body.innerText.includes('ainda não foi ativada no banco'))
if (!(await txt()).includes('teste@exemplo.com')) throw new Error('Saiu da conta mesmo com erro')
if (calls.some((c) => c.includes('/storage/v1/object'))) throw new Error('Mexeu nos anexos antes de confirmar a função no banco')
ok('Sem a função no banco: nada é apagado, a mensagem explica o que rodar e a conta continua')

rpcExists = true
await click('.danger-card button', 'Excluir tudo')
await p.waitForFunction(() => document.body.innerText.includes('Entrar') && document.body.innerText.includes('Criar conta'))
const left = await p.evaluate(() => ({ races: JSON.parse(localStorage.getItem('minhas-corridas:v1') || '{"races":[]}').races.length, auth: localStorage.getItem('minhas-corridas:auth') }))
if (left.races !== 0 || left.auth) throw new Error('Dados ou sessão ficaram no aparelho: ' + JSON.stringify(left))
const removes = calls.filter((c) => c === 'DELETE /storage/v1/object/anexos').length
if (removes < 1 || !calls.includes('POST /rest/v1/rpc/delete_my_account')) throw new Error('Chamadas esperadas não feitas: ' + calls.join(', '))
ok('Conta excluída: anexos removidos, função chamada, aparelho limpo e de volta à tela de login')

await b.close()
console.log('\nTodos os testes de conta passaram.')
