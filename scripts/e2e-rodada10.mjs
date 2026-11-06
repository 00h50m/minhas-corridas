// Rodada 10: convite para instalar o app (Android/Chrome com botão; iPhone com passo a passo).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada10.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const errors = []
const races = [{ id: 'a', name: 'Meia de Floripa', status: 'inscrita', date: '2099-05-10', distanceKm: 21.1 }]

async function open({ ua, prompt = false, standalone = false, clear = true }) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  if (ua) await p.setUserAgent(ua)
  await p.evaluateOnNewDocument((prompt, standalone) => {
    if (standalone) Object.defineProperty(navigator, 'standalone', { get: () => true })
    if (prompt) {
      // Simula o convite que o Chrome dispara quando o app pode ser instalado.
      window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true })
        e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve() }
        e.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(e)
      }, 50))
    }
  }, prompt, standalone)
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  if (clear) {
    await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  }
  await wait(300)
  return { p, ctx }
}
const text = (p) => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (p, s) => { const t = await text(p); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1500)}`) }
const clickText = (p, sel, s) => p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.includes(s)); el?.click(); return !!el }, sel, s)

// 1. Computador sem convite do navegador: nada de banner (o convite do perfil aparece)
{
  const { p, ctx } = await open({})
  if (await p.$('[data-testid=install-banner]')) throw new Error('Banner sem como instalar')
  if (!(await p.$('[data-testid=profile-invite]'))) throw new Error('Convite do perfil deveria aparecer')
  ok('Sem como instalar: sem banner; aparece o convite do perfil')
  await ctx.close()
}

// 2. Android/Chrome com convite: botão Instalar abre a instalação do navegador
{
  const { p, ctx } = await open({ ua: ANDROID, prompt: true })
  await p.waitForSelector('[data-testid=install-banner]')
  await need(p, 'Instale o PaceOn')
  if (await p.$('[data-testid=profile-invite]')) throw new Error('Dois convites ao mesmo tempo')
  await p.screenshot({ path: `${SHOTS}/r10-android.png` })
  await clickText(p, '[data-testid=install-banner] button', 'Instalar')
  await wait(300)
  if ((await p.evaluate(() => window.__prompted)) !== 1) throw new Error('Instalação do navegador não foi aberta')
  ok('Android/Chrome: banner com “Instalar” que abre a instalação do navegador (um convite por vez)')
  await ctx.close()
}

// 3. iPhone Safari: passo a passo; “Agora não” guarda por 30 dias
{
  const { p, ctx } = await open({ ua: IPHONE })
  await p.waitForSelector('[data-testid=install-banner]')
  await need(p, 'No iPhone, os avisos só funcionam com o app instalado')
  await clickText(p, '[data-testid=install-banner] button', 'Como instalar')
  await wait(150)
  await need(p, 'Adicionar à Tela de Início')
  await p.screenshot({ path: `${SHOTS}/r10-iphone.png` })
  await clickText(p, '[data-testid=install-banner] button', 'Agora não')
  await p.reload({ waitUntil: 'networkidle0' })
  await wait(200)
  if (await p.$('[data-testid=install-banner]')) throw new Error('Banner voltou depois de dispensado')
  await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
  await p.waitForSelector('[data-testid=install-section]')
  await need(p, 'Adicionar à Tela de Início')
  ok('iPhone (Safari): passo a passo com o ícone de Compartilhar; dispensar some do Início e segue em Ajustes')
  await ctx.close()
}

// 4. iPhone dentro do Instagram: pedir para abrir no Safari
{
  const { p, ctx } = await open({ ua: INSTA })
  await p.waitForSelector('[data-testid=install-banner]')
  await need(p, 'navegador de outro app')
  await need(p, 'Safari')
  await need(p, 'Copiar link do app')
  ok('Dentro do Instagram/WhatsApp: orienta abrir no Safari e oferece copiar o link')
  await ctx.close()
}

// 5. Já instalado (aberto pelo ícone): nada de convite; Ajustes confirma
{
  const { p, ctx } = await open({ ua: IPHONE, standalone: true })
  if (await p.$('[data-testid=install-banner]')) throw new Error('Banner com o app já instalado')
  await p.goto(BASE + '/ajustes', { waitUntil: 'networkidle0' })
  await need(p, 'App instalado neste aparelho')
  ok('App já instalado: sem convite, e Ajustes mostra “App instalado neste aparelho”')
  await ctx.close()
}

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 10 passaram.')
