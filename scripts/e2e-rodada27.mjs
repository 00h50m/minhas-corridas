// Rodada 27: carona compartilhada (Logística → Custos): quem divide, parte de cada um e WhatsApp com Pix.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada27.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 8000 }, s)

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const race = {
  id: 'hc', name: 'Health Care Run', status: 'inscrita', date: '2099-11-15', startTime: '07:00', venueAddress: 'PAC Volkswagen, Vinhedo - SP', companionIds: ['p2'],
  logistics: {
    origin: { label: 'Casa', address: 'Casa, Jundiaí - SP' },
    outbound: { stops: [{ id: 's1', label: 'Buscar Dani Souza', address: 'Rua Dani, Jundiaí - SP', personId: 'p1', dwellMin: 5 }] },
    back: { enabled: true, mode: 'reverse' },
    costs: { fuelOut: { est: 30 }, fuelBack: { est: 30 }, tollsOut: { est: 9.8 }, parking: { paid: 15 }, kitFuel: { est: 20 } }
  }
}
await p.evaluate((r) => {
  localStorage.clear()
  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] }))
  localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))
  localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { people: [{ id: 'p1', name: 'Dani Souza', phone: '(11) 98888-7777', placeId: null }, { id: 'p2', name: 'Ana Lima', phone: '(11) 97777-6666', placeId: null }, { id: 'p3', name: 'Bia', phone: '', placeId: null }] }, avatar: null, updatedAt: new Date().toISOString() }))
}, race)

// 1. Dani (buscada na ida) e Ana (vai junto) já marcadas; o kit fica de fora
await p.goto(BASE + '/corridas/hc/logistica', { waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Custos').click())
await p.waitForSelector('[data-testid=carpool]')
const on = await p.$$eval('[data-testid=carpool] .chip-btn.on', (b) => b.map((x) => x.innerText))
if (on.join(',') !== 'Dani Souza,Ana Lima') throw new Error('Marcadas: ' + on)
const share = async () => p.$eval('[data-testid=carpool-share]', (e) => e.innerText.replace(/\s+/g, ' ').replace(/ /g, ' '))
if (!(await share()).includes('R$ 84,80 ÷ 3 pessoas') || !(await share()).includes('R$ 28,27 cada')) throw new Error('Divisão: ' + (await share()))
await need('A retirada do kit fica de fora')
ok('Carona: Dani (buscada) e Ana (vai junto) já marcadas; R$ 84,80 ÷ 3 = R$ 28,27 cada; kit fora da conta')

// 2. Pix e Bia a mais; WhatsApp com a parte de cada uma
await p.evaluate(() => [...document.querySelectorAll('[data-testid=carpool] .chip-btn')].find((b) => b.innerText === 'Bia').click())
await waitText('÷ 4 pessoas')
await p.$eval('#cp-pix', (el) => el.focus())
await p.type('#cp-pix', 'gi@exemplo.com')
await p.$eval('#cp-pix', (el) => el.blur())
await wait(300)
const links = await p.$$eval('[data-testid=carpool-wa]', (a) => a.map((x) => decodeURIComponent(x.href)))
if (links.length !== 3 || !links[0].startsWith('https://wa.me/5511988887777?text=Oi, Dani!') || !links[0].includes('deu R$ 84,80. Dividindo por 4, a sua parte fica R$ 21,20. Pix: gi@exemplo.com')) throw new Error('WhatsApp: ' + links[0])
if (!links[2].startsWith('https://wa.me/?text=Oi, Bia!')) throw new Error('Sem telefone: ' + links[2])
ok('Bia entra (÷ 4 = R$ 21,20); WhatsApp de cada uma com a parte e o Pix (sem telefone, escolhe o contato)')

// 3. Sem você na conta; salvo e recarregado
await p.evaluate(() => [...document.querySelectorAll('[data-testid=carpool] label.check')].find((l) => l.innerText.includes('Incluir você')).querySelector('input').click())
await waitText('÷ 3 pessoas')
await p.reload({ waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Custos').click())
await p.waitForSelector('[data-testid=carpool-share]')
if (!(await share()).includes('÷ 3 pessoas') || !(await share()).includes('R$ 28,27 cada')) throw new Error('Depois de recarregar: ' + (await share()))
await p.screenshot({ path: `${SHOTS}/r27-carona.png`, fullPage: true })
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('“Incluir você” desmarcado: ÷ 3; a divisão fica salva na prova; 390 px sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 27 passaram.')
