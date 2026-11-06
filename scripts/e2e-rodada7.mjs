// Rodada 7: meta definida antes da prova e comparada com o resultado (chegada, metade e passagens).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada7.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

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
const txt = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const shot = (n) => p.screenshot({ path: `${SHOTS}/r7-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const expectText = async (s) => { const t = await txt(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 1800)}`) }
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))
const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Meia com parciais: saída forte e quebra no fim
const secs = Array.from({ length: 21 }, (_, i) => 300 + (i < 10 ? -8 + i : 10 + (i - 10) * 3))
const splits = [...secs.map((sec, i) => ({ km: i + 1, sec })), { km: 21.2, sec: 60, partial: 200 }]
const watchSec = secs.reduce((a, b) => a + b, 0) + 60
const races = [
  { id: 'futura', name: 'Meia de Floripa', status: 'inscrita', date: iso(20), distanceKm: 21.1 },
  { id: 'feita', name: 'Meia do Rio', status: 'concluida', date: iso(-10), distanceKm: 21.1, targetTime: 6300, result: { officialDistanceKm: 21.1, netTime: watchSec - 20, isOfficial: true, watch: { source: 'fit', fileName: 'x.fit', distanceKm: 21.2, elapsedSec: watchSec, splits } } },
  { id: 'sem-relogio', name: '10K Sem Relógio', status: 'concluida', date: iso(-30), distanceKm: 10, targetTime: 3000, result: { officialDistanceKm: 10, netTime: 2950, isOfficial: true, watch: null } }
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [] })) }, races)

// 1. Definir a meta antes da prova, direto no detalhe
await p.goto(BASE + '/corridas/futura', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=target-set]')
await click('[data-testid=target-set] button', 'Definir meta')
await expectText('Digite o tempo')
await p.type('[data-testid=target-set] input', '15500')
await expectText('= 1:55:00')
await expectText('Pace: 5:27 /km')
await click('[data-testid=target-set] button', 'Definir meta')
await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('plano de prova'))
if ((await stored()).races.find((r) => r.id === 'futura').targetTime !== 6900) throw new Error('Meta não salva')
await expectText('Metade (10,55 km)')
// trocar a meta inline
await click('.section-title button', 'Mudar meta')
await p.$eval('[data-testid=target-set] input', (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })
await p.type('[data-testid=target-set] input', '15000')
await click('[data-testid=target-set] button', 'Salvar')
await wait(200)
if ((await stored()).races.find((r) => r.id === 'futura').targetTime !== 6600) throw new Error('Meta não trocada')
ok('Meta definida e trocada no detalhe, sem abrir o formulário (1:55:00 → 1:50:00, com pace e passagens)')

// 2. Depois da prova: meta x realizado com passagens e metade
await p.goto(BASE + '/corridas/feita', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=target-compare]')
await expectText('Meta x realizado')
await expectText('Acima da meta')
const rows = await p.$$eval('[data-testid=target-table] tbody tr', (trs) => trs.map((tr) => tr.querySelector('th').innerText))
if (rows.join('|') !== 'km 2,5|km 5|km 7,5|km 10|Metade (10,55)|km 12,5|km 15|km 17,5|km 20|Chegada') throw new Error('Passagens: ' + rows.join('|'))
const t = await txt()
if (!/Metade \(10,55 km\): 1ª em [\d:]+ \(−[\d:]+\), 2ª em [\d:]+ \(\+[\d:]+\)/.test(t)) throw new Error('Resumo da metade ausente\n' + t.slice(0, 2000))
await expectText('Onde mais perdeu tempo')
await expectText('Onde mais ganhou: até o km 2,5')
await shot('meta-x-realizado')
ok('Meta x realizado: meta/feito/diferença, metade (1ª à frente, 2ª atrás), passagens e onde ganhou/perdeu')

// 3. Sem arquivo do relógio: só a chegada, com convite para anexar
await p.goto(BASE + '/corridas/sem-relogio', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=target-compare]')
await expectText('Meta batida')
await expectText('−0:50 abaixo')
await expectText('Anexe o arquivo do relógio')
ok('Sem relógio: compara a chegada e convida a anexar o arquivo')

await browser.close()
if (errors.length) { console.log('\nErros no console:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 7 passaram.')
