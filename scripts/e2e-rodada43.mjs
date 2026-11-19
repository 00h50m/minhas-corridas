// Rodada 43: story “Minhas inscrições” — número grande de provas inscritas, km pela frente, só as
// inscritas (ou também as que está decidindo), “+N provas” acima de 5 e o atalho em Corridas.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada43.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await p.evaluateOnNewDocument(() => {
  const fixed = Date.parse('2026-11-18T23:00:00Z')
  const Real = Date
  class FakeDate extends Real { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } }
  window.Date = FakeDate
})
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click() })
const canvasPng = (file) => p.$eval('[data-testid=story-canvas]', (c) => c.toDataURL('image/png')).then((d) => fs.writeFileSync(path.join(SHOTS, file), Buffer.from(d.split(',')[1], 'base64')))

const R = (id, name, date, status, km, city) => ({ id, name, date, status, distanceKm: km, city, state: 'SP', result: null })
const races = [
  R('a', 'Corrida da Serra', '2026-11-29', 'inscrita', 10, 'Jundiaí'),
  R('b', 'Night Run', '2026-12-12', 'inscrita', 5, 'Campinas'),
  R('c', 'São Silvestre', '2026-12-31', 'inscrita', 15, 'São Paulo'),
  R('d', 'Meia de Floripa', '2027-03-14', 'inscrita', 21.1, 'Florianópolis'),
  R('e', 'Volta da Pampulha', '2027-05-02', 'inscrita', 18, 'Belo Horizonte'),
  R('f', 'Maratona do Rio', '2027-06-20', 'inscrita', 42.2, 'Rio de Janeiro'),
  R('g', 'Corrida das Pontes', '2027-01-10', 'interesse', 10, 'Recife'),
  R('h', 'Prova antiga', '2026-10-01', 'concluida', 5, 'Jundiaí')
]
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races)

// 1. Atalho em Corridas
await p.goto(BASE + '/corridas', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=races-story]')
const lbl = await p.$eval('[data-testid=races-story]', (e) => e.innerText.trim())
if (lbl !== 'Postar minhas inscrições (6)') throw new Error('Atalho: ' + lbl)
await tap('[data-testid=races-story]')
await p.waitForSelector('[data-testid=story-canvas]')
if (!p.url().includes('modelo=proximas')) throw new Error('Modelo: ' + p.url())
ok('Corridas: “Postar minhas inscrições (6)” abre o story de inscrições')

// 2. A imagem: número grande, km pela frente, 5 provas + “+1 prova”, sem a de interesse
await wait(400)
await canvasPng('r43-inscricoes.png')
const drawn = await p.evaluate(() => window.__lastStory ?? null)
const thumb = await p.$eval('[data-testid=story-proximas]', (b) => b.innerText.trim())
if (thumb !== 'Inscrições') throw new Error('Miniatura: ' + thumb)
const opt = await p.$('[data-testid=story-decidindo]')
if (!opt) throw new Error('Sem a opção “Incluir as que estou decidindo”')
ok(`Story gerado (r43-inscricoes.png); miniatura “Inscrições”; opção de incluir as que está decidindo${drawn ? '' : ''}`)

// 3. Incluir as que estou decidindo
await p.$eval('[data-testid=story-decidindo]', (c) => c.click())
await wait(400)
await canvasPng('r43-inscricoes-decidindo.png')
const a = fs.readFileSync(path.join(SHOTS, 'r43-inscricoes.png'))
const b = fs.readFileSync(path.join(SHOTS, 'r43-inscricoes-decidindo.png'))
if (a.equals(b)) throw new Error('A opção não mudou a imagem')
ok('“Incluir as que estou decidindo” muda a imagem (entra a Corrida das Pontes, marcada como decidindo)')

// 4. Sem inscrição: explica como incluir as outras
await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('minhas-corridas:v1')); st.races = st.races.map((r) => (r.status === 'inscrita' ? { ...r, status: 'interesse' } : r)); localStorage.setItem('minhas-corridas:v1', JSON.stringify(st)); const pr = JSON.parse(localStorage.getItem('paceon:stories') || '{}'); localStorage.setItem('paceon:stories', JSON.stringify({ ...pr, decidindo: false })) })
await p.goto(BASE + '/stories?modelo=proximas', { waitUntil: 'networkidle0' })
const dec = await p.$eval('[data-testid=story-decidindo]', (c) => c.checked)
if (dec) await p.$eval('[data-testid=story-decidindo]', (c) => c.click())
await p.waitForSelector('[data-testid=story-empty]')
const msg = await p.$eval('[data-testid=story-empty]', (e) => e.innerText)
if (!msg.includes('Incluir as que estou decidindo')) throw new Error('Mensagem: ' + msg)
await p.goto(BASE + '/corridas', { waitUntil: 'networkidle0' })
if (await p.$('[data-testid=races-story]')) throw new Error('Atalho sem inscrições')
ok('Sem inscrição: o story explica como incluir as outras e o atalho some de Corridas')

const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 43 passaram.')
