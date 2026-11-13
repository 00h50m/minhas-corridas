// Rodada 18: logística no dia da prova — passo a passo com marcações (saí, cheguei), atraso,
// navegação até o próximo ponto e aviso no WhatsApp com o horário atualizado.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada18.mjs
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
const shot = (n) => p.screenshot({ path: `${SHOTS}/r18-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = (s, timeout = 8000) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout }, s)
const hm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const now = await p.evaluate(() => { const d = new Date(); return { today: d.toLocaleDateString('sv'), min: d.getHours() * 60 + d.getMinutes() } })
if (now.min > 20 * 60) console.log('(aviso: perto da meia-noite os horários podem cair no dia seguinte)')

const P = {
  casa: { label: 'Casa', address: 'Avenida José Joaquim Pedro, 580, Jundiaí - SP', lat: -23.17092, lon: -46.87713, precision: 'manual' },
  dani: { id: 's1', label: 'Dani', address: 'Avenida Antônio Frederico Ozanan, 2111, Jundiaí - SP', lat: -23.1801, lon: -46.8933, precision: 'numero', dwellMin: 5, personId: 'p1' },
  portal: { id: 's2', label: 'Portal do Medeiros', address: 'Rua Beija-Flor, 250, Jundiaí - SP', lat: -23.19992, lon: -47.00953, precision: 'rua', dwellMin: 5 },
  pac: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0451, lon: -46.9773, precision: 'ponto' }
}
const legs = [{ distanceKm: 2.1, durationMin: 6 }, { distanceKm: 14, durationMin: 30 }, { distanceKm: 25, durationMin: 40 }]
const key = pointsKey([{ ...P.casa, role: 'origin' }, P.dani, P.portal, { ...P.pac, role: 'dest' }])
// Largada daqui a 3 h: saída de casa = largada − 45 − 10 − 76 − 10 − 10 = largada − 151 → ~29 min no futuro
const seed = (startMin) => ({
  id: 'hc', name: 'Health Care Run', status: 'inscrita', date: now.today, startTime: hm(startMin), distanceKm: 5, venueAddress: P.pac.address,
  logistics: { origin: P.casa, destination: P.pac, prep: {}, outbound: { stops: [P.dani, P.portal], route: { provider: 'manual', legs, key } } }
})
const load = async (race) => {
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await p.evaluate((r) => {
    localStorage.clear()
    localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] }))
    localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))
    localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { people: [{ id: 'p1', name: 'Dani Souza', phone: '(11) 98888-7777', placeId: null }] }, avatar: null, updatedAt: new Date().toISOString() }))
  }, race)
  await p.goto(BASE + '/corridas/hc/dia', { waitUntil: 'networkidle0' })
}

// 1. No horário: o passo atual é sair de casa, com a hora planejada
const start = now.min + 180
await load(seed(start))
await p.waitForSelector('[data-testid=day-guide]')
const depart = start - 151
await need('Sair de Casa')
await need(hm(depart))
if (await p.$('[data-testid=dg-status]')) throw new Error('Mostrou atraso antes da hora')
const steps = await p.$$eval('.dg-steps li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
if (steps.length !== 6 || !steps[5].includes('Chegar a PAC Volkswagen')) throw new Error('Passos: ' + steps.join(' / '))
const navHref = await p.$eval('[data-testid=day-guide] a[href*="google.com/maps"]', (a) => a.href)
if (!navHref.includes('destination=-23.1801%2C-46.8933')) throw new Error('Navegação não vai até a Dani: ' + navHref)
if (await p.$('[data-testid=next-activity]')) throw new Error('Cartão “Próxima atividade” duplicado')
await shot('no-horario')
ok(`Agora: “Sair de Casa” às ${hm(depart)}; 6 passos até a PAC; navegação só até a Dani`)

// 2. Saí de casa antes da hora → adiantada; próximo passo: chegar na Dani; WhatsApp com o horário
await p.$eval('[data-testid=dg-mark]', (b) => b.click())
await waitText('Chegar: Dani')
const status = await p.$eval('[data-testid=dg-status]', (e) => e.innerText)
const early = depart - now.min
if (!(early > 2 ? status === `Adiantada ${early} min` : status === 'No horário')) {
  // o minuto pode virar entre a leitura e o clique
  if (!/^Adiantada \d+ min$|^No horário$/.test(status)) throw new Error('Status: ' + status)
}
const wa = await p.$eval('[data-testid=dg-whatsapp]', (a) => ({ href: a.href, text: a.innerText }))
if (!wa.href.startsWith('https://wa.me/5511988887777?text=') || !decodeURIComponent(wa.href).includes('Saí agora e chego aí por volta de')) throw new Error('WhatsApp: ' + decodeURIComponent(wa.href))
if (!wa.text.startsWith('Avisar Dani Souza: chego às')) throw new Error('Botão: ' + wa.text)
const log = await p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].dayLog)
if (log.date !== now.today || !/^\d\d:\d\d$/.test(log.marks.sair)) throw new Error('Marcação não salva: ' + JSON.stringify(log))
ok(`“Saí de casa” marcado às ${log.marks.sair} → ${status}; botão “${wa.text}” com “Saí agora…” no WhatsApp`)

// 3. Recarregar mantém; desfazer volta ao passo anterior
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=day-guide]')
await need('Chegar: Dani')
await p.$eval('[data-testid=dg-undo]', (b) => b.click())
await waitText('Saí de casa (')
ok('Recarregar mantém a marcação; “Desfazer” volta para “Sair de casa”')

// 4. Já passou da hora de sair e não saiu: atrasada, e os próximos horários andam junto
const start2 = now.min + 140 // saída planejada ~11 min atrás
await load(seed(start2))
await p.waitForSelector('[data-testid=dg-status]')
const st2 = await p.$eval('[data-testid=dg-status]', (e) => e.innerText)
const lateBy = now.min - (start2 - 151)
if (!/^Atrasada \d+ min$/.test(st2) || Math.abs(Number(st2.match(/\d+/)[0]) - lateBy) > 1) throw new Error(`Atraso: ${st2} (esperado ~${lateBy})`)
await need('(planejado ' + hm(start2 - 151) + ')')
await shot('atrasada')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok(`Sem sair na hora: “${st2}”, horários projetados (planejado ${hm(start2 - 151)}); 390 px sem rolagem lateral`)

// 5. Dias antes da prova: sem o painel “Agora” (a agenda do dia continua)
const future = seed(now.min + 180)
future.date = '2099-11-15'
await load(future)
await p.waitForSelector('[data-testid=timeline]')
if (await p.$('[data-testid=day-guide]')) throw new Error('Painel “Agora” fora do dia da prova')
ok('Antes do dia: só a agenda; o passo a passo aparece no dia da prova')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 18 passaram.')
