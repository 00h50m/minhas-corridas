// Rodada 17: logística como planejador — editar parada sem excluir, caminho por trecho (alternativas e
// personalizado por pontos de passagem), horários, reordenar arrastando, totais que fecham.
// /api/route SIMULADO (formato real; números fictícios). Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada17.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { encodePolyline } from '../src/lib/polyline.js'

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
const shot = (n) => p.screenshot({ path: `${SHOTS}/r17-${String(++step).padStart(2, '0')}-${n}.png`, fullPage: true })
const T = () => p.evaluate(() => document.body.innerText.replace(/ /g, ' '))
const need = async (s) => { const t = await T(); if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 3000)}`) }
const waitText = (s, timeout = 8000) => p.waitForFunction((s) => document.body.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase()), { timeout }, s)
const click = async (sel, s) => {
  const found = await p.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find((x) => x.innerText.replace(/ /g, ' ').toLowerCase().includes(s.toLowerCase())); if (el) el.click(); return !!el }, sel, s)
  if (!found) throw new Error(`Não achei ${sel} com "${s}"`)
  await wait(250)
}
const typeIn = async (sel, v) => { await p.$eval(sel, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) }); if (v) await p.type(sel, v) }
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('minhas-corridas:v1')).races[0].logistics)
const legRows = () => p.$$eval('[data-testid=leg] .leg-main', (bs) => bs.map((b) => [...b.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim())))
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

// ---------- /api/route simulado ----------
const routeCalls = []
const altCalls = []
let failNext = false
const legOf = (a, b, k = 1, roads = ['Av. Antônio Frederico Ozanam']) => {
  const m = Math.round(Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 102000) * 1.3 * k)
  const s = Math.round(m / 13.7)
  return { distanceKm: Math.round(m / 10) / 100, durationMin: Math.round(s / 60), trafficMin: null, distanceM: m, durationSec: s, roads, polyline: encodePolyline([[a.lat, a.lon], [(a.lat + b.lat) / 2 + 0.002 * k, (a.lon + b.lon) / 2], [b.lat, b.lon]]) }
}
await p.setRequestInterception(true)
p.on('request', (r) => {
  const u = new URL(r.url())
  if (u.pathname !== '/api/route') return r.continue()
  const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(b) })
  if (r.method() === 'POST') {
    const body = JSON.parse(r.postData())
    if (body.alternativas) {
      altCalls.push(body)
      const [a, b] = body.points
      const opts = [
        { id: 'fastest', label: 'Mais rápida', choice: { preference: 'fastest', avoid: [], vias: [] }, ...legOf(a, b, 1.6, ['Rodovia Dom Gabriel Paulino Bueno Couto']) },
        { id: 'alt1', label: 'Alternativa 1', choice: { preference: 'fastest', avoid: [], vias: [{ lat: -23.193, lon: -46.99 }] }, ...legOf(a, b, 1.15, ['Avenida Guilherme Porcari', 'Estrada Eduardo Toresan']) },
        { id: 'shortest', label: 'Menor distância', choice: { preference: 'shortest', avoid: [], vias: [] }, ...legOf(a, b, 1.05, ['Avenida Guilherme Porcari']), durationSec: 1100 },
        { id: 'highways', label: 'Evitar rodovias', choice: { preference: 'fastest', avoid: ['highways'], vias: [] }, ...legOf(a, b, 1.1, ['Avenida Guilherme Porcari']), also: ['Evitar pedágios'] }
      ]
      if (body.vias?.length) opts.push({ id: 'custom', label: 'Personalizada', choice: { preference: 'fastest', avoid: [], vias: body.vias }, ...legOf(a, b, 1.2, ['Rua Personalizada']) })
      return json({ provider: 'ors', options: opts })
    }
    routeCalls.push(body)
    if (failNext) { failNext = false; return json({ error: 'O serviço de rotas recusou a consulta. (Rate limit)' }, 502) }
    const pts = body.points
    return json({ provider: 'ors', legs: pts.slice(1).map((b, i) => ({ ...legOf(pts[i], b, body.choices?.[i]?.preference === 'shortest' ? 1.05 : body.choices?.[i]?.vias?.length ? 1.2 : 1.6) })), polyline: '', points: pts.map((x) => ({ lat: x.lat, lon: x.lon })), tolls: null, traffic: false, fetchedAt: new Date().toISOString() })
  }
  const q = (u.searchParams.get('q') || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!q) return json({ provider: 'ors', traffic: false, tolls: false, geocode: true })
  if (q.includes('ozanan')) return json({ results: [{ formatted: 'Avenida Antônio Frederico Ozanan, 2111, Ponte de São João, Jundiaí - SP, 13218-000', lat: -23.1801, lon: -46.8933, partial: false, precision: 'numero', source: 'cep' }] })
  return json({ results: [] })
})

// ---------- dados: a prova com as paradas como estão hoje (sem partes, sem escolhas) ----------
const race = {
  id: 'hc', name: 'Health Care Run', status: 'inscrita', date: '2099-11-15', startTime: '07:00', distanceKm: 5, city: 'Vinhedo', state: 'SP', venueAddress: 'Avenida das Indústrias, Vinhedo - SP',
  logistics: {
    origin: { label: 'Casa', address: 'Avenida José Joaquim Pedro, 580, Jundiaí - SP', lat: -23.17092, lon: -46.87713, precision: 'manual' },
    destination: { label: 'PAC Volkswagen', address: 'Avenida das Indústrias, Vinhedo - SP', lat: -23.0451, lon: -46.9773, precision: 'ponto' },
    outbound: { stops: [
      { id: 's1', label: 'Dani', address: 'Avenida Antônio Frederico Ozanan, Jundiaí - SP', lat: -23.1758, lon: -46.89844, precision: 'rua', dwellMin: 5 },
      { id: 's2', label: 'Portal do Medeiros', address: 'Rua Beija-Flor, 250, Jundiaí - SP', lat: -23.19992, lon: -47.00953, precision: 'rua', dwellMin: 5 },
      { id: 's3', label: 'Eloy Chaves', address: 'Rua Manoel Fagundes Cotrim, 238, Jundiaí - SP', lat: -23.18347, lon: -46.95934, precision: 'rua', dwellMin: 5 }
    ] }
  }
}
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((r) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races: [r], goals: [] })); localStorage.setItem('minhas-corridas:instalar-dispensado', String(Date.now())) }, race)

// 1. Abre, calcula sozinha, nomes nos trechos, totais que fecham
await p.goto(BASE + '/corridas/hc/logistica', { waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=legs]', { timeout: 10000 })
let rows = await legRows()
if (rows.map((r) => r[0]).join(' | ') !== 'Casa → Dani | Dani → Portal do Medeiros | Portal do Medeiros → Eloy Chaves | Eloy Chaves → PAC Volkswagen') throw new Error('Nomes: ' + JSON.stringify(rows))
const totals = async () => {
  const r = await legRows()
  const km = r.reduce((a, x) => a + Number(x[1].replace(',', '.')), 0)
  const min = r.reduce((a, x) => a + Number(x[2].replace(/\D/g, '')), 0)
  const tot = await p.$eval('.route-total', (e) => e.innerText)
  return { km: Math.round(km * 100) / 100, min, tot }
}
let t = await totals()
if (!t.tot.includes(`${String(t.km.toFixed(2)).replace('.', ',')} km`.replace(',00 km', ' km')) && !t.tot.includes(`${t.km.toLocaleString('pt-BR')} km`)) throw new Error(`Soma dos km (${t.km}) não fecha com o total: ${t.tot}`)
if (!t.tot.includes(`${t.min} min`) && !t.tot.includes(`${Math.floor(t.min / 60)} h ${String(t.min % 60).padStart(2, '0')} min`)) throw new Error(`Soma dos minutos (${t.min}) não fecha: ${t.tot}`)
await need('+ 15 min nas paradas')
ok(`Rota calculada sozinha: 4 trechos com os nomes (Casa → Dani …); soma dos trechos = total (${t.km} km, ${t.min} min) + 15 min de paradas`)

// 2. Horários do trajeto (fórmula: saída = chegada desejada − direção − paradas − margem)
await p.waitForSelector('[data-testid=trip-times]')
const times = await p.$$eval('[data-testid=trip-times] li', (li) => li.map((x) => x.innerText.replace(/\s+/g, ' ')))
const hmToMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
// largada 07:00 − 45 min (chegar antes) − 10 (estacionar) = 06:05 de chegada ao estacionamento; − direção − 15 − margem 10
const expectDepart = 7 * 60 - 45 - 10 - t.min - 15 - 10
if (hmToMin(times[0]) !== expectDepart || !times[0].includes('Sair de Casa')) throw new Error(`Saída: ${times[0]} (esperado ${expectDepart})`)
if (!/Dani · sair/.test(times[1]) || !/Portal do Medeiros · sair/.test(times[2]) || !/Eloy Chaves · sair/.test(times[3]) || !/Chegar a PAC Volkswagen/.test(times[4])) throw new Error('Horários: ' + times.join(' / '))
if (hmToMin(times[4]) !== 7 * 60 - 45 - 10 - 10) throw new Error('Chegada ao destino: ' + times[4])
ok(`Horários: ${times.join(' · ')} (saída = chegada − direção − paradas − margem)`)

// 3. Alterar caminho de Portal → Eloy: alternativas com vias e diferença; escolher "Menor distância"
const before = routeCalls.length
await p.evaluate(() => document.querySelectorAll('[data-testid=leg] .leg-main')[2].click())
await p.waitForSelector('[data-testid=leg-detail]')
await need('Principais vias: Av. Antônio Frederico Ozanam')
await need('≈ só a rua, sem o número')
await p.$eval('[data-testid=leg-pick]', (b) => b.click())
await p.waitForSelector('[data-testid=opt-shortest]')
await need('Avenida Guilherme Porcari · Estrada Eduardo Toresan')
await need('vs. atual:')
await need('= Evitar pedágios')
await p.$eval('[data-testid=opt-shortest]', (b) => b.click())
await shot('alternativas')
if (await overflow() > 0) throw new Error('Rolagem lateral no seletor de caminhos')
await p.$eval('[data-testid=picker-apply]', (b) => b.click())
await waitText('Menor distância')
await wait(1000)
if (routeCalls.length !== before) throw new Error('Escolher a alternativa recalculou a rota inteira')
let log = await stored()
const choiceKeys = Object.keys(log.outbound.legChoices)
if (choiceKeys.length !== 1 || log.outbound.legChoices[choiceKeys[0]].preference !== 'shortest') throw new Error('Escolha não salva: ' + JSON.stringify(log.outbound.legChoices))
ok('Portal do Medeiros → Eloy Chaves: alternativas com km, tempo, vias (Av. Guilherme Porcari…), diferença e iguais juntadas; “Menor distância” escolhida e salva sem recalcular o resto')

// 4. Recarregar: a escolha e os valores persistem, sem nova consulta
const rowsBefore = await legRows()
const n0 = routeCalls.length
await p.reload({ waitUntil: 'networkidle0' })
await p.waitForSelector('[data-testid=legs]')
await wait(1200)
if (routeCalls.length !== n0) throw new Error('Recarregar consultou o serviço')
if (JSON.stringify(await legRows()) !== JSON.stringify(rowsBefore)) throw new Error('Valores mudaram ao recarregar')
ok('Recarregar: caminho escolhido e trechos persistem, sem nova consulta')

// 5. Rota personalizada por pontos de passagem (Dani → Portal): tocar no mapa, calcular, usar
await p.evaluate(() => document.querySelectorAll('[data-testid=leg] .leg-main')[1].click())
await p.evaluate(() => [...document.querySelectorAll('[data-testid=leg-detail] [data-testid=leg-pick]')].at(-1).click())
await p.waitForSelector('[data-testid=custom-start]')
await p.$eval('[data-testid=custom-start]', (b) => b.click())
await p.waitForSelector('[data-testid=picker-map] .leaflet-tile-container, [data-testid=picker-map].leaflet-container')
await wait(600)
await p.$eval('[data-testid=picker-map]', (e) => e.scrollIntoView({ block: 'center' }))
await wait(400)
const box = await (await p.$('[data-testid=picker-map]')).boundingBox()
await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7)
await waitText('Ponto 1:').catch(async (e) => { await shot('falha-mapa'); throw e })
await p.$eval('[data-testid=custom-calc]', (b) => b.click())
await p.waitForSelector('[data-testid=opt-custom]')
if (!altCalls.at(-1).vias?.length) throw new Error('Pontos de passagem não enviados')
await p.$eval('[data-testid=picker-apply]', (b) => b.click())
await waitText('Personalizada')
log = await stored()
const custom = Object.values(log.outbound.legChoices).find((c) => c.vias?.length)
if (!custom || custom.label !== 'Personalizada' || 'dwellMin' in custom) throw new Error('Personalizada não salva: ' + JSON.stringify(log.outbound.legChoices))
if (log.outbound.stops.length !== 3) throw new Error('Ponto de passagem virou parada')
ok('Rota personalizada: ponto de passagem tocado no mapa, calculado e salvo no trecho (não é parada, sem permanência)')

// 6. Editar parada: só o nome → sem nova consulta, mesmo id e posição
const n1 = routeCalls.length
await p.evaluate(() => document.querySelectorAll('[data-testid=stop-edit-btn]')[2].click())
await p.waitForSelector('[data-testid=stop-edit]')
await typeIn('#se-label', 'Eloy Chaves (Ana)')
await p.waitForSelector('[data-testid=unsaved]')
await p.$eval('[data-testid=se-save]', (b) => b.click())
await waitText('Portal do Medeiros → Eloy Chaves (Ana)')
await wait(1000)
log = await stored()
if (log.outbound.stops[2].id !== 's3' || log.outbound.stops[2].label !== 'Eloy Chaves (Ana)') throw new Error('Edição de nome: ' + JSON.stringify(log.outbound.stops[2]))
if (routeCalls.length !== n1) throw new Error('Mudar só o nome consultou o serviço')
ok('Editar parada (lápis): nome trocado, mesmo id (s3) e posição, “alterações não salvas” no painel, sem nova consulta')

// 7. Editar endereço da Dani pelas partes (rua, número, cidade, CEP) → busca → recalcula
await p.evaluate(() => document.querySelectorAll('[data-testid=stop-edit-btn]')[0].click())
await p.waitForSelector('[data-testid=stop-edit]')
await typeIn('#se-street', 'Avenida Antônio Frederico Ozanan')
await typeIn('#se-number', '2111')
await typeIn('#se-city', 'Jundiaí')
await typeIn('#se-cep', '13218-000')
await typeIn('#se-ref', 'portão azul')
await p.$eval('[data-testid=se-search]', (b) => b.click())
await p.waitForSelector('[data-testid=stop-edit] .geo-results button')
await p.$eval('[data-testid=stop-edit] .geo-results button', (b) => b.click())
await need('(✓ localização confirmada)')
const n2 = routeCalls.length
await p.$eval('[data-testid=se-save]', (b) => b.click())
await p.waitForFunction((n) => window.__x !== n, {}, n2)
await wait(1500)
log = await stored()
const dani = log.outbound.stops[0]
if (dani.id !== 's1' || dani.lat !== -23.1801 || dani.precision !== 'numero' || dani.parts?.number !== '2111' || dani.reference !== 'portão azul') throw new Error('Edição de endereço: ' + JSON.stringify(dani))
if (routeCalls.length !== n2 + 1) throw new Error('Mudar o endereço não recalculou (ou recalculou demais): ' + (routeCalls.length - n2))
const sentChoices = routeCalls.at(-1).choices
if (!sentChoices[2] || sentChoices[2].preference !== 'shortest') throw new Error('Escolha de Portal → Eloy não foi preservada ao recalcular: ' + JSON.stringify(sentChoices))
ok('Editar endereço da Dani pelas partes: busca acha o número, mesmo id, referência guardada; recalcula 1 vez e preserva “Menor distância” em Portal → Eloy')

// 8. Corrigir coordenadas à mão (Portal) e falha de busca
await p.evaluate(() => document.querySelectorAll('[data-testid=stop-edit-btn]')[1].click())
await p.waitForSelector('[data-testid=stop-edit]')
await typeIn('#se-street', 'Rua Que Não Existe')
await typeIn('#se-city', 'Jundiaí')
await p.$eval('[data-testid=se-search]', (b) => b.click())
await waitText('Não encontrei')
await typeIn('#se-lat', '-23.20111')
await typeIn('#se-lon', '-47.00777')
await need('(✓ ponto marcado por você)')
await p.$eval('[data-testid=se-save]', (b) => b.click())
await wait(1500)
log = await stored()
if (log.outbound.stops[1].lat !== -23.20111 || log.outbound.stops[1].precision !== 'manual') throw new Error('Coordenadas manuais: ' + JSON.stringify(log.outbound.stops[1]))
ok('Busca sem resultado avisa; coordenadas digitadas viram “ponto marcado por você” e a rota recalcula')

// 9. Permanência muda só os totais
const n3 = routeCalls.length
await typeIn('input[aria-label="Minutos em Portal do Medeiros"]', '10')
await wait(1200)
if (routeCalls.length !== n3) throw new Error('Permanência consultou o serviço')
await need('+ 20 min nas paradas')
ok('Permanência 5 → 10 min: só os totais e horários mudam, sem consulta')

// 10. Reordenar arrastando (Eloy para o 1º lugar) e erro do serviço
failNext = true
await p.$eval('[data-testid=stops]', (e) => e.scrollIntoView({ block: 'center' }))
await wait(300)
const handles = await p.$$('[data-testid=stops] .drag-handle')
const h = await handles[2].boundingBox()
const first = await (await p.$('[data-testid=stops] > li')).boundingBox()
await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
await p.mouse.down()
await p.mouse.move(h.x + h.width / 2, first.y + 10, { steps: 8 })
await p.mouse.up()
await waitText('Rate limit').catch(async (e) => { await shot('falha-arrastar'); console.log('ordem: ' + (await stored()).outbound.stops.map((x) => x.id)); throw e })
log = await stored()
if (log.outbound.stops.map((x) => x.id).join() !== 's3,s1,s2') throw new Error('Ordem após arrastar: ' + log.outbound.stops.map((x) => x.id))
if (await p.$('[data-testid=legs]')) throw new Error('Mostrou trechos antigos depois do erro')
await click('button', 'Calcular rota')
await p.waitForSelector('[data-testid=legs]')
rows = await legRows()
if (rows[0][0] !== 'Casa → Eloy Chaves (Ana)' || rows[1][0] !== 'Eloy Chaves (Ana) → Dani') throw new Error('Ordem dos trechos: ' + rows.map((r) => r[0]))
const last = routeCalls.at(-1)
if (last.choices.some(Boolean)) throw new Error('Escolhas de pares que não existem mais foram aplicadas: ' + JSON.stringify(last.choices))
t = await totals()
if (!t.tot.includes(`${t.min} min`) && !t.tot.includes(`${Math.floor(t.min / 60)} h`)) throw new Error('Totais após reordenar: ' + t.tot)
await shot('reordenado')
ok('Arrastar Eloy para o 1º lugar: erro do serviço explicado (sem 0 km); “Calcular rota” refaz na nova ordem; escolhas de pares desfeitos não se aplicam')

// 11. Celular: sem rolagem lateral, com o editor aberto
await p.evaluate(() => document.querySelectorAll('[data-testid=stop-edit-btn]')[0].click())
await p.waitForSelector('[data-testid=stop-edit]')
if (await overflow() > 0) throw new Error('Rolagem lateral com o editor aberto')
await shot('editor')
await click('[data-testid=stop-edit] button', 'Cancelar')
if (await overflow() > 0) throw new Error('Rolagem lateral na tela')
ok('390 px: tela e editor sem rolagem lateral')

await browser.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 17 passaram.')
