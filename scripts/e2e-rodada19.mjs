// Rodada 19: volta da prova passo a passo (dia da prova, depois da largada) e horários da volta na Logística.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada19.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { pointsKey } from '../src/lib/logistics.js'

const BASE = process.env.BASE || 'http://localhost:4173'
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
const shot = (n) => p.screenshot({ path: `${SHOTS}/r19-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s, timeout = 8000) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout }, s)
const hm = (m) => { const r = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
// Se faltar pouco para a meia-noite, os horários da volta passariam para o dia seguinte: evita.
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const now = await p.evaluate(() => { const d = new Date(); return { today: d.toLocaleDateString('sv'), min: d.getHours() * 60 + d.getMinutes() } })
if (now.min < 60 || now.min > 22 * 60) { console.log('Pulado: horário perto da meia-noite.'); process.exit(0) }

const P = {
  casa: { label: 'Casa', address: 'Avenida José Joaquim Pedro, 580, Jundiaí - SP', lat: -23.17092, lon: -46.87713, precision: 'manual' },
  dani: { id: 's1', label: 'Buscar Dani Souza', address: 'Avenida Antônio Frederico Ozanan, 2111, Jundiaí - SP', lat: -23.1801, lon: -46.8933, precision: 'numero', dwellMin: 5, personId: 'p1' },
  portal: { id: 's2', label: 'Portal do Medeiros', address: 'Rua Beija-Flor, 250, Jundiaí - SP', lat: -23.19992, lon: -47.00953, precision: 'rua', dwellMin: 3 },
  pac: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0451, lon: -46.9773, precision: 'ponto' }
}
const idaKey = pointsKey([P.casa, P.dani, P.portal, P.pac])
const voltaKey = pointsKey([P.pac, P.portal, P.dani, P.casa])
const legsIda = [{ distanceKm: 2.1, durationMin: 6 }, { distanceKm: 14, durationMin: 30 }, { distanceKm: 25, durationMin: 40 }]
const legsVolta = [{ distanceKm: 25, durationMin: 35 }, { distanceKm: 14, durationMin: 30 }, { distanceKm: 2.1, durationMin: 6 }]
// Largada há 50 min; sair do local daqui a 10 min.
const leave = now.min + 10
const race = {
  id: 'hc', name: 'Health Care Run', status: 'inscrita', date: now.today, startTime: hm(now.min - 50), distanceKm: 5, venueAddress: P.pac.address,
  logistics: { origin: P.casa, destination: P.pac, prep: {}, outbound: { stops: [P.dani, P.portal], route: { provider: 'manual', legs: legsIda, key: idaKey } }, back: { enabled: true, mode: 'reverse', departTime: hm(leave), route: { provider: 'manual', legs: legsVolta, key: voltaKey } } }
}
await p.evaluate((r) => {
  localStorage.clear()
  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] }))
  localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))
  localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { people: [{ id: 'p1', name: 'Dani Souza', phone: '(11) 98888-7777', placeId: null }] }, avatar: null, updatedAt: new Date().toISOString() }))
}, race)

// 1. Depois da largada, a volta aparece sozinha, com os horários de cada parada
await p.goto(BASE + '/corridas/hc/dia', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=day-guide-volta]')
const steps = await p.$$eval('[data-testid=day-guide-volta] .dg-steps li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
const want = [`${hm(leave)} Sair de PAC Volkswagen`, `${hm(leave + 35)} Chegar: Portal do Medeiros`, `${hm(leave + 38)} Sair: Portal do Medeiros`, `${hm(leave + 68)} Chegar: Deixar Dani Souza`, `${hm(leave + 73)} Sair: Deixar Dani Souza`, `${hm(leave + 79)} Chegar em Casa`]
if (JSON.stringify(steps) !== JSON.stringify(want)) throw new Error('Passos da volta:\n' + steps.join('\n') + '\nesperado:\n' + want.join('\n'))
if (await p.$('[data-testid=dg-whatsapp]')) throw new Error('WhatsApp na volta (a pessoa está no carro)')
await need('Terminei! Registrar resultado')
await shot('volta')
ok(`Depois da largada: volta automática — ${want.join(' · ')}; “Buscar Dani” vira “Deixar Dani”`)

// 2. Marcar a saída do local: status e próximos horários; navegação até o Portal
await p.$eval('[data-testid=day-guide-volta] [data-testid=dg-mark]', (b) => b.click())
await waitText('Chegar: Portal do Medeiros')
const st = await p.$eval('[data-testid=day-guide-volta] [data-testid=dg-status]', (e) => e.innerText)
if (!/^Adiantada \d+ min$|^No horário$/.test(st)) throw new Error('Status: ' + st)
const nav = await p.$eval('[data-testid=day-guide-volta] a[href*="google.com/maps"]', (a) => a.href)
if (!nav.includes('destination=-23.19992%2C-47.00953')) throw new Error('Navegação: ' + nav)
const log = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].dayLog)
if (!log.marks['v-sair']) throw new Error('Marcação da volta não salva: ' + JSON.stringify(log))
ok(`“Saí do local” marcado (${log.marks['v-sair']}) → ${st}; navegação até o Portal do Medeiros`)

// 3. Alternar para a ida e voltar; recarregar mantém
await p.evaluate(() => [...document.querySelectorAll('.dg-switch button')].find((b) => b.innerText === 'Ida').click())
await p.waitForSelector('[data-testid=day-guide]')
await p.$eval('[data-testid=dg-volta-tab]', (b) => b.click())
await p.waitForSelector('[data-testid=day-guide-volta]')
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=day-guide-volta]')
await need('Chegar: Portal do Medeiros')
ok('Ida/Volta alternáveis; recarregar mantém a volta e a marcação')

// 4. Sem hora de sair do local: estimativa (largada + 2h30) com aviso; volta desligada: link para planejar
const noTime = structuredClone(race)
noTime.logistics.back.departTime = ''
noTime.dayLog = null
await p.evaluate((r) => localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })), noTime)
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=day-guide-volta]')
await need('Hora de sair do local estimada (largada + 2h30)')
const firstStep = await p.$eval('[data-testid=day-guide-volta] .dg-steps li', (li) => li.innerText.replace(/\s+/g, ' '))
if (firstStep !== `${hm(now.min - 50 + 150)} Sair de PAC Volkswagen`) throw new Error('Saída estimada: ' + firstStep)
const off = structuredClone(race)
off.logistics.back.enabled = false
await p.evaluate((r) => localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })), off)
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=dg-volta-missing]')
await need('A volta não está planejada.')
ok('Sem hora de sair: estima largada + 2h30 e avisa; volta desligada: link “Planejar a volta na Logística”')

// 5. Logística → Volta: horários da volta para conferir antes do dia
await p.evaluate((r) => localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })), race)
await p.evaluate(() => { window.__m = 1 })
await p.goto(BASE + '/corridas/hc/logistica', { waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Volta').click())
await p.waitForSelector('[data-testid=return-times]')
const rt = await p.$$eval('[data-testid=return-times] li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (rt.join(' / ') !== `${hm(leave)} Sair de PAC Volkswagen / ${hm(leave + 35)} Portal do Medeiros · sair ${hm(leave + 38)} / ${hm(leave + 68)} Deixar Dani Souza · sair ${hm(leave + 73)} / ${hm(leave + 79)} Chegar em Casa`) throw new Error('Horários da volta: ' + rt.join(' / '))
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok(`Logística → Volta: ${rt.join(' · ')}; 390 px sem rolagem lateral`)

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 19 passaram.')
