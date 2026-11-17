// Rodada 30: importação automática do Garmin (API pessoal), com a Garmin simulada dentro do navegador:
// conectar, importar (treino do dia, academia avulsa, escolha do treino, corrida no dia da prova),
// usar no resultado da prova, busca automática ao abrir, chave só no aparelho e desconectar.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada30.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { Encoder, Profile } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.emulateTimezone('America/Sao_Paulo')
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2500)}`) }
const waitText = async (s, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await T()).toLowerCase().includes(s.toLowerCase())) return; await wait(100) } await need(s) }
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')))
const garminLS = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:garmin') || 'null'))
const clickText = async (sel, text) => { await p.$$eval(sel, (els, text) => { const el = els.find((e) => e.innerText.trim().startsWith(text)); if (!el) throw new Error('Sem ' + text); el.click() }, text) }

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const shift = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const yest = shift(today, -1)
const raceDay = shift(today, -2)

/** .FIT de corrida com GPS (o “Exportar original” da Garmin vem dentro de um .ZIP). */
const SEMI = 2 ** 31 / 180
function fitRun(date, hourUtc, km, min) {
  const enc = new Encoder()
  const t0 = new Date(`${date}T${String(hourUtc).padStart(2, '0')}:00:00Z`).getTime()
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  const sec = min * 60
  for (let s = 0; s <= sec; s += 3) {
    const d = (km * 1000 * s) / sec
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: d, heartRate: 152, positionLat: Math.round((-23.19 + d / 111320) * SEMI), positionLong: Math.round(-46.89 * SEMI) })
  }
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), sport: 'running', totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000, avgHeartRate: 152 })
  return Buffer.from(enc.close())
}
function zip(name, content) {
  const comp = deflateRawSync(content)
  const nameB = Buffer.from(name)
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameB.length, 26)
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(nameB.length, 28); central.writeUInt32LE(0, 42)
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + nameB.length, 12); eocd.writeUInt32LE(local.length + nameB.length + comp.length, 16)
  return Buffer.concat([local, nameB, comp, central, nameB, eocd])
}

// Garmin simulada: hoje 06:10 corrida 4 km; ontem 20:00 corrida 5 km; hoje 19:00 musculação; dia da prova 07:00 corrida 5 km.
const at = (date, h) => ({ start: `${date} ${String(h).padStart(2, '0')}:00:00`, startGmt: `${date} ${String(h + 3).padStart(2, '0')}:00:00` })
let LIST = [
  { id: '101', name: 'Jundiaí Corrida', type: 'running', ...at(today, 6), distanceKm: 4, sec: 1800, avgHr: 150 },
  { id: '102', name: 'Corrida noturna', type: 'running', ...at(yest, 20), distanceKm: 5, sec: 2400, avgHr: 148 },
  { id: '103', name: 'Musculação', type: 'strength_training', ...at(today, 19), distanceKm: null, sec: 2700, avgHr: 110 },
  { id: '104', name: 'Health Care Run', type: 'running', ...at(raceDay, 7), distanceKm: 5.01, sec: 2370, avgHr: 165 },
  { id: '106', name: 'Longão', type: 'running', ...at(shift(today, -4), 7), distanceKm: 6.02, sec: 2900, avgHr: 145 }
]
const FILES = { 106: zip('106_ACTIVITY.fit', fitRun(shift(today, -4), 10, 6.02, 48)), 101: zip('101_ACTIVITY.fit', fitRun(today, 9, 4, 30)), 102: zip('102_ACTIVITY.fit', fitRun(yest, 23, 5, 40)), 104: zip('104_ACTIVITY.fit', fitRun(raceDay, 10, 5.01, 39.5)) }
const KEY = 'gk_TESTE_chave_pessoal_0123456789'
const apiCalls = []
await p.setRequestInterception(true)
p.on('request', (r) => {
  if (!r.url().includes('/api/garmin')) return r.continue()
  const b = JSON.parse(r.postData() || '{}')
  apiCalls.push(b.action)
  if (b.key !== KEY) return r.respond({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'A Garmin recusou a chave. Confira se copiou inteira e se ela não expirou ou foi apagada.' }) })
  if (b.action === 'check') return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  if (b.action === 'list') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ activities: LIST.filter((g) => g.start.slice(0, 10) >= b.start && g.start.slice(0, 10) <= b.end) }) })
  if (b.action === 'file') return FILES[b.id] ? r.respond({ status: 200, contentType: 'application/zip', body: FILES[b.id] }) : r.respond({ status: 404, contentType: 'application/json', body: '{"error":"Atividade não encontrada na Garmin."}' })
  return r.respond({ status: 400, body: '{}' })
})

const run = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, name, date) => ({ id, name, date, status: 'planejado', items: run(30), notes: '', result: null, goalId: null })
const workouts = [W('rod', 'Rodagem hoje', today), W('tir', 'Tiros', shift(today, 1)), { ...W('lon', 'Longão', shift(today, -4)), status: 'feito', result: { distanceKm: 6.0, elapsedSec: 2880, fileName: 'importado-a-mao.fit', laps: [] } }]
const races = [{ id: 'hc', name: 'Health Care Run', date: raceDay, status: 'inscrita', city: 'Vinhedo', state: 'SP', distanceKm: 5 }]
await p.evaluate((races, ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, races, workouts)

// 1. Conectar: chave errada é recusada; a certa conecta e já busca
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=garmin-open]')
await p.$eval('[data-testid=garmin-open]', (b) => b.click())
await p.type('[data-testid=garmin-key]', 'chave-errada-123')
await p.$eval('[data-testid=garmin-connect-btn]', (b) => b.click())
await waitText('A Garmin recusou a chave')
if (await garminLS()) throw new Error('Chave recusada ficou salva')
await p.$eval('[data-testid=garmin-key]', (i) => { i.select() })
await p.type('[data-testid=garmin-key]', KEY)
await p.$eval('[data-testid=garmin-connect-btn]', (b) => b.click())
await p.waitForSelector('[data-testid=garmin-on]')
await p.waitForSelector('[data-testid=activity-pick]', { timeout: 10000 })
ok('Conectar: chave errada recusada com orientação; a certa conecta e já busca as atividades')

// 2. O que a busca fez
await need('“Rodagem hoje” marcado como feito (4,00 km, 30:00)')
await need('“Musculação” registrado')
await need('é o dia de “Health Care Run”')
await need('Garmin: Corrida noturna')
let st = await stored()
const rod = st.workouts.find((w) => w.id === 'rod')
if (rod.status !== 'feito' || rod.result.garminId !== '101' || !rod.result.track || rod.result.laps.length !== 1) throw new Error('Rodagem: ' + JSON.stringify(rod.result))
const mus = st.workouts.find((w) => w.name === 'Musculação')
if (!mus || mus.sport !== 'academia' || mus.status !== 'feito' || mus.result.elapsedSec !== 2700) throw new Error('Musculação: ' + JSON.stringify(mus))
if (st.workouts.some((w) => w.result?.garminId === '104')) throw new Error('Corrida da prova virou treino')
const lon = st.workouts.filter((w) => w.result?.garminId === '106')
if (lon.length !== 1 || lon[0].id !== 'lon' || !lon[0].result.track || lon[0].result.fileName !== 'importado-a-mao.fit') throw new Error('Longão: ' + JSON.stringify(lon))
if (st.workouts.length !== 4) throw new Error('Treinos a mais: ' + st.workouts.map((w) => w.name))
const rep = await p.$eval('[data-testid=garmin-report]', (e) => e.innerText)
if (!rep.includes('A Garmin mandou 5 atividades') || !rep.includes('1 já estava no app') || !rep.includes('1 ganhou o percurso') || !rep.includes('1 no dia de prova')) throw new Error('Relatório: ' + rep)
// Corrida de ontem: escolhe “Tiros” (o único candidato)
const cands = await p.$$eval('[data-testid=activity-pick] .ai-cands button', (b) => b.map((x) => x.innerText))
if (cands.length !== 1 || !cands[0].startsWith('Tiros')) throw new Error('Candidatos: ' + cands)
await p.screenshot({ path: `${SHOTS}/r30-escolher.png` })
await p.$eval('[data-testid=activity-pick] .ai-cands button', (b) => b.click())
await wait(300)
st = await stored()
if (st.workouts.find((w) => w.id === 'tir').result?.garminId !== '102') throw new Error('Tiros não recebeu a corrida de ontem')
if (await p.$('[data-testid=activity-pick]')) throw new Error('Fila não andou')
let g = await garminLS()
if (g.pending.length || !g.done.includes('104') || g.races[0]?.raceId !== 'hc') throw new Error('Estado Garmin: ' + JSON.stringify({ ...g, key: '…' }))
ok(`Busca: “${rep}”; o “Longão” importado à mão antes não duplicou e ganhou o percurso; corrida de hoje → “Rodagem hoje” (com voltas e percurso); musculação → atividade avulsa de academia; corrida de ontem → escolhida “Tiros”; corrida do dia da prova não virou treino`)

// 3. Chave só no aparelho
const raw = await p.evaluate(() => localStorage.getItem('minhas-corridas:v1'))
if (raw.includes(KEY)) throw new Error('Chave foi para os dados sincronizados')
ok('A chave fica só em “minhas-corridas:garmin” (fora dos dados que vão para a conta e o backup)')

// 4. Resultado da prova: “Buscar no Garmin”
await p.goto(`${BASE}/corridas/hc/resultado`, { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=watch-garmin]')
await p.$eval('[data-testid=watch-garmin]', (b) => b.click())
await waitText('Corrida do Garmin “Health Care Run” lida.')
const net = await p.$eval('#netTime', (i) => i.value)
if (!net.startsWith('39:3')) throw new Error('Tempo líquido do relógio: ' + net)
g = await garminLS()
if (g.races.length) throw new Error('Aviso da prova não saiu')
ok(`Resultado da prova: “⌚ Buscar no Garmin” lê a corrida do dia (tempo ${net}, distância e parciais)`)

// 5. Busca automática ao abrir (no máximo a cada 30 min)
const before = apiCalls.length
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await wait(800)
if (apiCalls.length !== before) throw new Error('Buscou de novo antes de 30 min')
LIST = [...LIST, { id: '105', name: 'Bike', type: 'road_biking', ...at(today, 17), distanceKm: 20, sec: 3600 }]
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('minhas-corridas:garmin')); s.lastSync = new Date(Date.now() - 3600e3).toISOString(); localStorage.setItem('minhas-corridas:garmin', JSON.stringify(s)) })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await waitText('1 atividade nova do Garmin')
st = await stored()
const bike = st.workouts.find((w) => w.result?.garminId === '105')
if (!bike || bike.sport !== 'bike') throw new Error('Bike: ' + JSON.stringify(bike))
ok('Busca automática: não repete antes de 30 min; depois, ao abrir o app, importa a bike nova (“⌚ 1 atividade nova do Garmin”)')

// 6. Desconectar
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=garmin-off]')
await p.$eval('[data-testid=garmin-off]', (b) => b.click())
await p.waitForSelector('.dialog')
await clickText('.dialog button', 'Desconectar')
await p.waitForSelector('[data-testid=garmin-connect]')
if (await garminLS()) throw new Error('Chave ficou depois de desconectar')
if ((await stored()).workouts.filter((w) => w.result?.garminId).length !== 5) throw new Error('Treinos importados sumiram')
const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (o > 0) throw new Error('Rolagem lateral: ' + o)
await p.screenshot({ path: `${SHOTS}/r30-treinos.png`, fullPage: true })
ok('Desconectar: a chave sai do aparelho; os treinos importados continuam')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 30 passaram.')
