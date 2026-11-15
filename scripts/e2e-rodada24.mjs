// Rodada 24: retirada do kit no dia da prova — cadastro (1 h antes da largada), aba Kit da Logística,
// agenda do dia e passo "Retirar o kit" (que marca o checklist).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada24.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { pointsKey } from '../src/lib/logistics.js'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
fs.mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
// Horário local fixo entre 4h e 5h, para a largada de hoje às 07:00 ainda não ter passado.
{
  const off = ((4 - new Date().getUTCHours() + 36) % 24) - 12
  await p.emulateTimezone(off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`)
}
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout: 8000 }, s)
const race = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0])

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const P = { casa: { label: 'Casa', address: 'Casa, Jundiaí - SP', lat: -23.17, lon: -46.88, precision: 'manual' }, pac: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0451, lon: -46.9773, precision: 'ponto' } }
const seed = {
  id: 'hc', name: 'Corrida de Natal', status: 'inscrita', date: today, startTime: '07:00', distanceKm: 10, venueAddress: P.pac.address, city: 'Vinhedo', state: 'SP',
  checklist: [{ id: 'c1', text: 'Kit retirado', done: false }],
  logistics: { origin: P.casa, destination: P.pac, prep: {}, outbound: { stops: [], route: { provider: 'manual', legs: [{ distanceKm: 20, durationMin: 30 }], key: pointsKey([P.casa, P.pac]) } } }
}
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, seed)

// 1. Cadastro: “Retirada no dia da prova” sugere 1 h antes; 45 min antes também
await p.goto(BASE + '/corridas/hc/editar', { waitUntil: 'networkidle0' })
await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
await p.$eval('[data-testid=kit-race-day]', (c) => c.click())
await wait(200)
if ((await p.$eval('#kitPickupTime', (i) => i.value)) !== '06:00') throw new Error('Sugestão de horário: ' + (await p.$eval('#kitPickupTime', (i) => i.value)))
if (await p.$('#kitPickupDate')) throw new Error('Data da retirada ainda visível')
await need('Geralmente 1 h antes da largada')
await p.evaluate(() => [...document.querySelectorAll('.kit-time button')].find((b) => b.innerText === '45 min antes').click())
await wait(100)
if ((await p.$eval('#kitPickupTime', (i) => i.value)) !== '06:15') throw new Error('45 min antes')
await p.evaluate(() => [...document.querySelectorAll('.kit-time button')].find((b) => b.innerText === '1 h antes').click())
await p.screenshot({ path: `${SHOTS}/r24-cadastro.png`, fullPage: true })
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Salvar alterações')).click())
await p.waitForFunction(() => location.pathname === '/corridas/hc')
let r = await race()
if (!r.kitOnRaceDay || r.kitPickupDate !== today || r.kitPickupTime !== '06:00') throw new Error('Salvo: ' + JSON.stringify({ on: r.kitOnRaceDay, d: r.kitPickupDate, t: r.kitPickupTime }))
ok('Cadastro: “Retirada no dia da prova” sugere 06:00 (1 h antes da largada 07:00), atalhos 45/30 min; data = a da prova')

// 2. Logística → Kit: sem trajeto separado; a agenda chega até 06:00
await p.goto(BASE + '/corridas/hc/logistica', { waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Kit').click())
await p.waitForSelector('[data-testid=kit-on-day]')
// 07:00 − 45 min = 06:15 (padrão), mas o kit pede chegar até 06:00 → estacionar 05:50 − 30 − margem 10 = sair 05:10
await need('Retirada no dia da prova, às 06:00')
await need('sair de casa às 05:10, retirar o kit às 06:00, largada às 07:00')
ok('Logística → Kit: “no local da largada”, sem trajeto separado; sair 05:10, kit 06:00, largada 07:00')

// 3. Dia da prova: “Retirar o kit” na agenda e no passo a passo; marcar também marca o checklist
await p.goto(BASE + '/corridas/hc/dia', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=day-guide]')
const steps = await p.$$eval('[data-testid=day-guide] .dg-steps li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (steps.length !== 3 || !steps[2].includes('06:00 Retirar o kit')) throw new Error('Passos: ' + steps.join(' | '))
const tl = await p.$$eval('[data-testid=timeline] li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (!tl.some((x) => x.startsWith('06:00 Retirar o kit'))) throw new Error('Agenda: ' + tl.join(' | '))
for (let i = 0; i < 3; i++) {
  await p.$eval('[data-testid=dg-mark]', (b) => b.click())
  await wait(250)
}
await p.waitForFunction(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].dayLog?.marks?.kit, { timeout: 8000 })
r = await race()
if (!r.dayLog.marks.kit || !r.checklist.find((i) => /kit retirado/i.test(i.text)).done) throw new Error('Kit não marcado: ' + JSON.stringify({ marks: r.dayLog.marks, cl: r.checklist }))
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Dia da prova: “06:00 Retirar o kit” na agenda e no passo a passo; “Retirei o kit” marca “Kit retirado” no checklist')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 24 passaram.')
