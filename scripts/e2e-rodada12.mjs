// Rodada 12: retrospectiva do ano, atalhos do ícone (/proxima), acréscimo por trânsito e "Como foi?".
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada12.mjs
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
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2000)}`) }
const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const y = new Date().getFullYear()
const res = (km, t, o = {}) => ({ officialDistanceKm: km, netTime: t, isOfficial: true, watch: null, ...o })
const races = [
  { id: 'a', name: '10K antigo', status: 'concluida', date: `${y - 1}-05-01`, city: 'Jundiaí', state: 'SP', distanceKm: 10, result: res(10, 3100) },
  { id: 'b', name: '10K de março', status: 'concluida', date: `${y}-03-01`, city: 'Jundiaí', state: 'SP', distanceKm: 10, feePaid: 100, result: res(10, 3000) },
  { id: 'c', name: 'Meia do Rio', status: 'concluida', date: `${y}-08-20`, city: 'Rio de Janeiro', state: 'RJ', distanceKm: 21.1, feePaid: 200, result: res(21.1, 6600) },
  { id: 'd', name: 'Próxima Meia', status: 'inscrita', date: iso(10), distanceKm: 21.1, startTime: '07:00', venueAddress: 'Rua A, 1', city: 'Itatiba', state: 'SP' }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())); localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { name: 'Giovanna Pupo', nickname: 'Gi' }, avatar: null, updatedAt: new Date().toISOString(), dirty: false })) }, races)

// 1. Retrospectiva pelo Histórico
await p.goto(BASE + '/historico', { waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Evolução').click())
await p.waitForSelector('[data-testid=retro-link]')
await p.$eval('[data-testid=retro-link]', (a) => a.click())
await p.waitForFunction((y) => location.pathname === `/retrospectiva/${y}`, {}, y)
await p.waitForSelector('[data-testid=retro-numbers]')
await need('Gi, seu ano na corrida')
const nums = await p.$eval('[data-testid=retro-numbers]', (e) => e.innerText.replace(/\s+/g, ' ').toLowerCase())
if (!nums.includes('2 provas') || !nums.includes('31,1 km em provas') || !nums.includes('2 h 40 min correndo') || !nums.includes('1 recorde')) throw new Error('Números: ' + nums)
await need('Recorde nos 10 km: −1:40')
await need('Primeira vez: Meia maratona')
await need('2 cidades em 2 estados')
ok('Retrospectiva: 2 provas, 31,1 km, 2 h 40 min, recorde no 10K (−1:40), primeira meia, 2 cidades em 2 estados')

// Card da retrospectiva
await p.waitForFunction(() => { const c = document.querySelector('[data-testid=retro-canvas]'); return c && c.width === 1080 && c.height === 1350 })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText.includes('Stories')).click())
await p.waitForFunction(() => document.querySelector('[data-testid=retro-canvas]').height === 1920)
await wait(300)
fs.writeFileSync(`${SHOTS}/r12-retro-card.png`, Buffer.from((await p.$eval('[data-testid=retro-canvas]', (c) => c.toDataURL('image/png'))).split(',')[1], 'base64'))
await p.screenshot({ path: `${SHOTS}/r12-retro.png`, fullPage: true })
ok('Card da retrospectiva em feed e stories')

// 2. Convite no Início só em dezembro e janeiro
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const m = new Date().getMonth() + 1
const hasInvite = !!(await p.$('[data-testid=retro-invite]'))
if (hasInvite !== (m === 12)) throw new Error(`Convite da retrospectiva no mês ${m}: ${hasInvite}`)
ok(`Convite da retrospectiva no Início só em dezembro/janeiro (agora: ${hasInvite ? 'aparece' : 'não aparece'})`)

// 3. Atalho do ícone: /proxima abre a próxima prova inscrita; manifesto com os 3 atalhos
await p.goto(BASE + '/proxima', { waitUntil: 'networkidle0' })
await p.waitForFunction(() => location.pathname === '/corridas/d')
const manifest = await (await fetch(BASE + '/manifest.webmanifest')).json()
const names = (manifest.shortcuts || []).map((x) => `${x.short_name}→${x.url}`)
if (names.join('|') !== 'Nova corrida→/corridas/nova|Resultado→/corridas?concluir=1|Próxima→/proxima|Treinos→/treinos') throw new Error('Atalhos: ' + names)
ok('Atalhos do ícone no manifesto (Nova corrida, Resultado, Próxima) e /proxima abre a próxima prova')

// 4. Acréscimo por trânsito numa rota sem trânsito previsto (40 min informados à mão)
await p.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('minhas-corridas:v1'))
  const d = data.races.find((r) => r.id === 'd')
  d.logistics = { origin: { label: 'Casa', address: 'Rua B, 2, Jundiaí' }, outbound: { route: { provider: 'manual', legs: [{ distanceKm: 35, durationMin: 40 }], key: 'rua b, 2, jundiaí | rua a, 1, itatiba/sp' } }, prep: { arriveBeforeMin: 45, showerMin: 15, dressMin: 15, breakfastMin: 0, finalPrepMin: 10, warmupMin: 15, positioningMin: 10, parkingMin: 10, bufferMin: 10, trafficExtraPct: 0 } }
  localStorage.setItem('minhas-corridas:v1', JSON.stringify(data))
})
await p.goto(BASE + '/corridas/d/logistica', { waitUntil: 'networkidle0' })
await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.innerText === 'Agenda').click())
await p.waitForSelector('[data-testid=no-traffic]')
await need('A rota não considera trânsito')
// 07:00 − 45 = 06:15 a pé; −10 estacionar; −40 trajeto; −10 margem → sair 05:15
await need('05:15\nSair de casa')
const inp = 'input[aria-label="Acréscimo por trânsito (%)"]'
await p.$eval(inp, (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })
await p.type(inp, '20')
await p.waitForFunction(() => document.body.innerText.includes('acréscimo de 20% aplicado'))
await need('05:07\nSair de casa') // 40 min + 20% = 48 min
ok('Rota sem trânsito: aviso na agenda e acréscimo de 20% (40 → 48 min, sair 05:15 → 05:07)')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 12 passaram.')
