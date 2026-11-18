// Rodada 37: responsivo. Abre as telas novas em 6 larguras (celular pequeno ao computador) e falha se
// algum elemento passar da largura da tela. Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada37.mjs
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE || 'http://localhost:4173'
const seed = "(()=>{\nvar step = (type, min, target) => ({ kind: 'step', type, duration: { kind: 'time', value: min * 60 }, target: target ?? { kind: 'none' } })\nvar hist = new Array(32).fill(0); hist[14] = 1200; hist[22] = 600\nvar races = [\n  { id: 'cb', name: 'Corrida do Bem', date: '2026-10-20', status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, startTime: '06:30', result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },\n  { id: 'hc', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, targetTime: 2400, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true, overallPlace: 812 } },\n  { id: 'na', name: 'Corrida de Natal', date: '2026-12-04', status: 'inscrita', city: 'Jundiaí', state: 'SP', distanceKm: 10, startTime: '07:00', targetTime: 4500, kitPickupDate: '2026-12-03' }\n]\nvar ws = [\n  { id: 'ter', name: 'Tiros 6x800', date: '2026-11-17', status: 'planejado', items: [step('aquecimento', 10), { kind: 'repeat', times: 6, steps: [{ ...step('tiro', 4, { kind: 'pace', min: 400, max: 420 }) }, step('recuperacao', 2)] }, step('desaquecimento', 5)], notes: '', result: null, goalId: null },\n  { id: 'hoje', name: 'Rodagem', date: '2026-11-18', status: 'planejado', items: [step('corrida', 30)], notes: '', result: null, goalId: null },\n  { id: 'feito', name: 'Base 6x2', date: '2026-11-16', status: 'feito', moves: [{ from: '2026-11-15', to: '2026-11-16', at: '2026-11-15' }], items: [step('aquecimento', 5), step('corrida', 25)], notes: '', result: { distanceKm: 4.5, elapsedSec: 1800, avgHr: 145, laps: [{ sec: 300, distanceKm: 0.7, avgHr: 128 }, { sec: 1500, distanceKm: 3.8, avgHr: 152 }], hrHist: hist }, goalId: null },\n  { id: 'ac', name: 'Pernas', sport: 'academia', plannedMin: 50, date: '2026-11-19', status: 'planejado', items: [], notes: '', result: null, goalId: null },\n  { id: 'sab', name: 'Longão', date: '2026-11-21', status: 'planejado', items: [step('corrida', 50)], notes: '', result: null, goalId: null },\n  { id: 'p1', name: 'Rodagem', date: '2026-11-10', status: 'feito', items: [step('corrida', 30)], notes: '', result: { distanceKm: 4, elapsedSec: 1800, laps: [], hrHist: hist }, goalId: null }\n]\nvar days = {}; for (let i = 14; i >= 0; i--) { const d = new Date(Date.parse('2026-11-18') - i * 864e5).toISOString().slice(0, 10); days[d] = { sleepSec: i ? 27000 : 21000, sleepScore: i ? 80 : 58, bbWake: i ? 70 : 40, rhr: 52 } }\n\nvar r=races,w=ws;\n\n  localStorage.clear()\n  localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: r, goals: [], workouts: w }))\n  localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now()))\n  localStorage.setItem('minhas-corridas:garmin', JSON.stringify({ key: 'gk_x_123456789', done: [], pending: [], races: [], lastSync: '2026-11-18T12:30:00Z', report: { at: '2026-11-18T12:30:00Z', start: '2026-11-04', end: '2026-11-18', total: 5, imported: 2, already: 3, enriched: 1, waiting: 0, prova: 0 }, wellness: days, wellnessAt: '2026-11-18T12:30:00Z' }))\n  localStorage.setItem('minhas-corridas:ciclo', JSON.stringify({ enabled: true, consentAt: 'x', hormonal: 'nenhum', periods: [{ start: '2026-08-08', end: '2026-08-12' }, { start: '2026-09-05', end: '2026-09-09' }, { start: '2026-10-03', end: '2026-10-07' }, { start: '2026-10-31', end: '2026-11-04' }], days: { '2026-11-18': { flow: 0, symptoms: ['colica', 'sono'], energy: 2 } }, dismissed: [] }))\n  localStorage.setItem('minhas-corridas:perfil', JSON.stringify({ data: { name: 'Corredora', nickname: 'Corredora', city: 'Jundiaí', state: 'SP', birthDate: '1990-05-10', hr: { max: 190 } }, updatedAt: 'x', dirty: false }))\n\n})()"
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage()
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
await p.evaluateOnNewDocument(() => { const fixed = Date.parse('2026-11-18T13:00:00Z'); const R = Date; class F extends R { constructor(...a) { super(...(a.length ? a : [fixed])) } static now() { return fixed } } window.Date = F })
await p.setViewport({ width: 390, height: 800 })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate(seed)
const routes = ['/', '/treinos', '/treinos/feito', '/treinos/hoje', '/corridas/na', '/corridas/hc', '/ciclo', '/passaporte', '/mapa', '/provas-perto', '/stories', '/stories?modelo=mes', '/perfil', '/treinos/novo?tipo=academia']
const problems = []
for (const W of [320, 360, 390, 768, 1024, 1280]) {
  await p.setViewport({ width: W, height: 800, isMobile: W < 1000, hasTouch: W < 1000 })
  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'networkidle0' })
    await new Promise((x) => setTimeout(x, 350))
    const res = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const over = document.documentElement.scrollWidth - vw
      const bad = []
      for (const el of document.querySelectorAll('.page *')) {
        const rc = el.getBoundingClientRect()
        if (rc.width === 0) continue
        if (rc.right > vw + 1 && !el.closest('.quick-status, .seg, .chips-scroll, .st-thumb, .leaflet-container, [data-testid=story-canvas]')) {
          bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} → ${Math.round(rc.right - vw)}px "${(el.innerText || '').slice(0, 30).replace(/\s+/g, ' ')}"`)
        }
      }
      return { over, bad: [...new Set(bad)].slice(0, 6) }
    })
    if (res.over > 0 || res.bad.length) problems.push(`${W}px ${r}: rolagem ${res.over}px ${res.bad.join('; ')}`)
  }
}
await b.close()
if (problems.length) { console.log('Elementos passando da tela:\n' + problems.join('\n')); process.exit(1) }
console.log('✓ 14 telas × 6 larguras (320, 360, 390, 768, 1024, 1280 px): nada passa da tela')
console.log('\nTodos os testes da rodada 37 passaram.')
