// Rodada 26: importar atividades do relógio na tela Treinos (vão para o treino do dia ou a pessoa escolhe),
// treino avulso, não duplicar, e carga da semana com aviso acima de 10%.
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada26.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { Encoder, Profile } from '@garmin/fitsdk'

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const DIR = path.resolve(SHOTS, 'r26')
fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })
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
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).workouts)

await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const today = await p.evaluate(() => new Date().toLocaleDateString('sv'))
const shift = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const dow = await p.evaluate(() => (new Date().getDay() + 6) % 7)
const mon = shift(today, -dow)

/** Atividade .FIT (codificador oficial): `km` em `min` minutos, às 09:00 de Brasília do dia `date`. */
function activity(file, date, km, min) {
  const enc = new Encoder()
  const t0 = new Date(`${date}T12:00:00Z`).getTime()
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(t0), type: 'activity' })
  const sec = min * 60
  for (let s = 0; s <= sec; s += 10) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: (km * 1000 * s) / sec, heartRate: 150 })
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + sec * 1000), startTime: new Date(t0), sport: 'running', totalElapsedTime: sec, totalTimerTime: sec, totalDistance: km * 1000, avgHeartRate: 150 })
  const f = path.join(DIR, file)
  fs.writeFileSync(f, enc.close())
  return f
}

// Semana passada: 58 min feitos; esta semana: terça (planejada) e sábado (planejado, mais longo) → 67 min (+16%)
const item = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, date, status, min) => ({ id, name: id, date, status, items: item(min), notes: '', result: null, goalId: null, createdAt: null, updatedAt: null })
const ws = [W('Passada A', shift(mon, -6), 'feito', 28), W('Passada B', shift(mon, -2), 'feito', 30), W('Treino Ter', shift(mon, 1), 'planejado', 30), W('Treino Sab', shift(mon, 5), 'planejado', 37)]
await p.evaluate((ws) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [{ id: 'r', name: 'Prova', date: '2099-01-01', status: 'inscrita' }], goals: [], workouts: ws })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, ws)

// 1. Carga da semana
await p.goto(BASE + '/treinos', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=week-load]')
const load = await p.$eval('[data-testid=week-load]', (e) => e.innerText.replace(/\s+/g, ' '))
if (!load.includes('Carga da semana 93 pts (93 planejada)') || !load.includes('-36% da média') || !load.includes('média de 1 semana: 145')) throw new Error('Carga: ' + load)
if (await p.$('[data-testid=week-load-warn]')) throw new Error('Aviso de carga com só 1 semana de histórico')
ok('Carga: 93 pts planejados × média de 1 semana (145), sem aviso com pouco histórico')

// 2. Dois arquivos: o de terça vai sozinho para “Treino Ter”; o de quarta pede escolha
const fTer = activity('terca.fit', shift(mon, 1), 4.1, 31)
const fQua = activity('quarta.fit', shift(mon, 2), 3.2, 25)
await (await p.$('[data-testid=activity-files]')).uploadFile(fTer, fQua)
await p.waitForSelector('[data-testid=activity-pick]')
await need('“Treino Ter” marcado como feito')
await need('quarta.fit')
// Candidatos: Treino Sab (3 dias) — Treino Ter já foi usado
const cands = await p.$$eval('[data-testid=activity-pick] .ai-cands button', (b) => b.map((x) => x.innerText))
if (cands.length !== 1 || !cands[0].startsWith('Treino Sab')) throw new Error('Candidatos: ' + cands)
await p.screenshot({ path: `${SHOTS}/r26-escolher.png`, fullPage: true })
await p.$eval('[data-testid=activity-free]', (b) => b.click())
await wait(300)
let list = await stored()
const ter = list.find((w) => w.name === 'Treino Ter')
const avulso = list.find((w) => w.name.startsWith('Corrida '))
if (ter.status !== 'feito' || Math.abs(ter.result.distanceKm - 4.1) > 0.01 || ter.result.elapsedSec !== 1860) throw new Error('Terça: ' + JSON.stringify(ter.result))
if (!avulso || avulso.status !== 'feito' || avulso.date !== shift(mon, 2)) throw new Error('Avulso: ' + JSON.stringify(avulso))
if (list.find((w) => w.name === 'Treino Sab').status !== 'planejado') throw new Error('Sábado mudou')
ok('Dois arquivos: terça vai sozinho para “Treino Ter” (4,1 km, 31:00); quarta sem treino no dia → escolhido “treino avulso”')

// 3. Reimportar o mesmo arquivo não duplica
await (await p.$('[data-testid=activity-files]')).uploadFile(fTer)
await p.waitForFunction(() => document.body.innerText.includes('já está em'))
if ((await stored()).length !== list.length) throw new Error('Duplicou')
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 0) throw new Error('Rolagem lateral: ' + overflow)
ok('Mesmo arquivo de novo: “já está em Treino Ter”, sem duplicar; 390 px sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 26 passaram.')
