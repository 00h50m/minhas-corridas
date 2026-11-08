import { describe, it, expect } from 'vitest'
import { buildSchedule, hmToMin, kitSchedule, minToHm, normalizePrep, returnSchedule } from './schedule.js'
import { applyLogistics, costItems, fuelCost, kitAddress, logisticsManagesTransport, navLinks, normalizeLogistics, pointsKey, raceSchedule, transportTotals, tripPoints, tripSummary, venueAddress } from './logistics.js'
import { decodePolyline, encodePolyline } from './polyline.js'
import { emptyRace, normalizeRace } from './model.js'
import { raceCosts } from './costs.js'
import { budgetStatus } from './budget.js'
import { normalizeProfile } from './profile.js'

// Cenário de validação (Corrida em Itatiba). Distâncias e tempos dos trechos são VALORES DE TESTE.
const home = { label: 'Casa', address: 'Residencial Cenário, Jardim Tannus, Jundiaí - SP' }
const eloy = { id: 's1', label: 'Eloy Chaves', address: 'Eloy Chaves, Jundiaí - SP', dwellMin: 5 }
const portal = { id: 's2', label: 'Portal do Medeiros', address: 'Portal do Medeiros, Jundiaí - SP', dwellMin: 5 }
const race = (logistics, o = {}) => normalizeRace({
  ...emptyRace(), id: 'it', name: 'Corrida em Itatiba', status: 'inscrita', date: '2026-11-08', startTime: '07:00', distanceKm: 10,
  venueAddress: 'Av. Maria de Lourdes Abreu, 95', city: 'Itatiba', state: 'SP', ...o, logistics
})
const prep = { arriveBeforeMin: 45, showerMin: 15, dressMin: 15, breakfastMin: 0, finalPrepMin: 10, warmupMin: 15, positioningMin: 10, parkingMin: 10, bufferMin: 10 }
const legsTeste = [{ distanceKm: 6.2, durationMin: 11 }, { distanceKm: 8.4, durationMin: 14 }, { distanceKm: 24.7, durationMin: 27, trafficMin: 29 }]

describe('agenda do dia (de trás para frente)', () => {
  it('cenário de Itatiba: acordar, sair, paradas, chegada, aquecimento e largada', () => {
    const s = buildSchedule({ startTime: '07:00', prep, legs: legsTeste, stops: [eloy, portal], destLabel: 'Itatiba' })
    // chegada a pé 06:15 → estacionar 06:05 → trajeto 11+14+29 = 54 min + paradas 10 min → 05:01 → margem 10 → sair 04:51
    expect(minToHm(s.arrivalTarget)).toBe('06:15')
    expect(minToHm(s.depart)).toBe('04:51')
    // preparação: finais 10, vestir 15, banho 15 → acordar 04:11
    expect(minToHm(s.wake)).toBe('04:11')
    const at = Object.fromEntries(s.items.map((i) => [i.key, minToHm(i.at)]))
    expect(at).toMatchObject({ banho: '04:11', vestir: '04:26', finais: '04:41', sair: '04:51', 'parada-0': '05:02', 'parada-1': '05:21', estacionar: '05:55', chegada: '06:05', aquecimento: '06:35', posicionar: '06:50', largada: '07:00' })
    expect(s.items.find((i) => i.key === 'parada-0').detail).toBe('5 min · sair 05:07')
    expect(s.items.find((i) => i.key === 'cafe')).toBeUndefined() // sem café da manhã
    expect(s.items.filter((i) => i.highlight).map((i) => i.key)).toEqual(['acordar', 'sair', 'chegada', 'largada'])
    expect(s.warnings).toEqual([])
  })
  it('recalcula quando algo muda (largada, paradas, café)', () => {
    const base = buildSchedule({ startTime: '07:00', prep, legs: legsTeste, stops: [eloy, portal] })
    const later = buildSchedule({ startTime: '07:30', prep, legs: legsTeste, stops: [eloy, portal] })
    expect(later.wake - base.wake).toBe(30)
    const oneStop = buildSchedule({ startTime: '07:00', prep, legs: [legsTeste[0], legsTeste[2]], stops: [eloy] })
    expect(oneStop.depart - base.depart).toBe(14 + 5)
    const cafe = buildSchedule({ startTime: '07:00', prep: { ...prep, breakfastMin: 20 }, legs: legsTeste, stops: [eloy, portal] })
    expect(base.wake - cafe.wake).toBe(20)
    expect(cafe.items.map((i) => i.key).slice(0, 4)).toEqual(['acordar', 'banho', 'cafe', 'vestir'])
  })
  it('avisos, dia anterior e dados faltando', () => {
    const s = buildSchedule({ startTime: '00:30', prep: { ...prep, arriveBeforeMin: 10 }, legs: [{ distanceKm: 100, durationMin: 90 }], stops: [] })
    expect(s.warnings.length).toBe(2)
    expect(minToHm(s.wake)).toMatch(/\(dia anterior\)$/)
    expect(buildSchedule({ startTime: '', prep, legs: legsTeste, stops: [eloy, portal] })).toBe(null)
    expect(buildSchedule({ startTime: '07:00', prep, legs: legsTeste, stops: [eloy] })).toBe(null)
    expect(normalizePrep({ showerMin: -3, dressMin: '20', lixo: 1 })).toMatchObject({ showerMin: 15, dressMin: 20 })
    expect(hmToMin('24:00')).toBe(null)
  })
  it('kit e volta', () => {
    expect(minToHm(kitSchedule({ time: '15:00', legs: [{ durationMin: 30 }, { durationMin: 32 }], stops: [], bufferMin: 10, roundTrip: true }).depart)).toBe('14:20')
    expect(minToHm(returnSchedule({ departTime: '09:30', legs: [{ durationMin: 40 }], stops: [] }).arrival)).toBe('10:10')
  })
})

describe('logística: trajetos, rota e custos', () => {
  const routeIda = (log) => ({ provider: 'manual', legs: legsTeste, key: pointsKey(tripPoints(race(log), normalizeLogistics(log), 'ida')) })
  const baseLog = { origin: home, outbound: { stops: [eloy, portal] }, vehicle: { kmPerL: 7, pricePerL: 4.29, fuel: 'gasolina' } }

  it('pontos da ida e da volta (volta inversa por padrão, ou com outras paradas)', () => {
    const r = race(baseLog)
    expect(venueAddress(r)).toBe('Av. Maria de Lourdes Abreu, 95, Itatiba/SP')
    expect(tripPoints(r, r.logistics, 'ida').map((p) => p.label)).toEqual(['Casa', 'Eloy Chaves', 'Portal do Medeiros', 'Local da prova'])
    expect(tripPoints(r, r.logistics, 'volta').map((p) => p.label)).toEqual(['Local da prova', 'Portal do Medeiros', 'Eloy Chaves', 'Casa'])
    const custom = race({ ...baseLog, back: { mode: 'custom', stops: [{ label: 'Padaria', address: 'Rua X, Itatiba' }] } })
    expect(tripPoints(custom, custom.logistics, 'volta').map((p) => p.label)).toEqual(['Local da prova', 'Padaria', 'Casa'])
  })
  it('rota fica desatualizada quando os pontos mudam', () => {
    const log = { ...baseLog, outbound: { ...baseLog.outbound, route: routeIda(baseLog) } }
    const r = race(log)
    const s = tripSummary(r, r.logistics, 'ida')
    expect(s).toMatchObject({ complete: true, stale: false, distanceKm: 39.3, durationMin: 52 })
    const moved = race(log, { venueAddress: 'Outra rua, 10' })
    expect(tripSummary(moved, moved.logistics, 'ida')).toMatchObject({ complete: false, stale: true })
  })
  it('combustível = distância ÷ consumo × preço; volta e kit somam; transporte sem duplicar', () => {
    expect(fuelCost(39.3, { kmPerL: 7, pricePerL: 4.29 })).toBe(24.09) // 39,3 ÷ 7 × 4,29 = 24,0853
    expect(fuelCost(39.3, { kmPerL: null, pricePerL: 4.29 })).toBe(null)
    const r0 = race(baseLog)
    const voltaKey = pointsKey(tripPoints(r0, r0.logistics, 'volta'))
    const log = {
      ...baseLog,
      outbound: { ...baseLog.outbound, route: routeIda(baseLog) },
      back: { route: { provider: 'manual', legs: [...legsTeste].reverse(), key: voltaKey } },
      costs: { tollsOut: { est: 9.8 }, tollsBack: { est: 9.8, paid: 9.8 }, parking: { est: 20 } }
    }
    const r = race(log)
    const items = costItems(r, r.logistics)
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.fuelOut.est).toBe(24.09)
    expect(by.fuelBack.est).toBe(24.09)
    expect(by.tollsBack).toMatchObject({ est: 9.8, paid: 9.8 })
    const t = transportTotals(items)
    expect(t).toMatchObject({ transportEst: 87.78, transportPaid: null, paid: 9.8, allPaid: false })
    // Aplicado à prova: categoria Transporte (o resto do app usa isso)
    const applied = applyLogistics({ ...r, transportEst: 999, transportPaid: 1 })
    expect(applied.transportEst).toBe(87.78)
    expect(applied.transportPaid).toBe(null)
    expect(raceCosts(applied).lines.find((l) => l.id === 'transporte').counted).toBe(87.78)
    expect(logisticsManagesTransport(applied)).toBe(true)
    // Tudo pago → transporte pago
    const allPaid = transportTotals(items.map((i) => ({ ...i, paid: i.est != null ? i.est : null })))
    expect(allPaid).toMatchObject({ allPaid: true, transportPaid: 87.78 })
    // Orçamento "tudo" enxerga o deslocamento
    const g = { id: 'b', type: 'orcamento', title: 'O', targetValue: 1000, startDate: '2026-01-01', deadline: '2026-12-31', status: 'andamento', budgetScope: 'total', alertPct: 80 }
    expect(budgetStatus(g, [applied], '2026-11-01').spent).toBe(87.78)
  })
  it('pedágio da rota (quando o serviço informa) entra se não houver valor manual', () => {
    const r0 = race(baseLog)
    const log = { ...baseLog, outbound: { ...baseLog.outbound, route: { ...routeIda(baseLog), provider: 'google', tolls: { amount: 6.4, currency: 'BRL' } } } }
    const r = race(log)
    expect(costItems(r, r.logistics).find((i) => i.id === 'tollsOut')).toMatchObject({ est: 6.4, source: 'rota' })
    expect(r0.logistics.costs.tollsOut.est).toBe(null)
  })
  it('kit: trajeto separado, ida e volta, com custos na mesma prova', () => {
    const r0 = race({ ...baseLog, kit: { enabled: true } }, { kitPickupAddress: 'Shopping Itatiba', kitPickupDate: '2026-11-07', kitPickupTime: '15:00' })
    expect(kitAddress(r0)).toBe('Shopping Itatiba, Itatiba/SP')
    const pts = tripPoints(r0, r0.logistics, 'kit')
    expect(pts.map((p) => p.role)).toEqual(['origin', 'dest', 'origin'])
    const log = { ...baseLog, kit: { enabled: true, route: { provider: 'manual', legs: [{ distanceKm: 25, durationMin: 30 }, { distanceKm: 25, durationMin: 30 }], key: pointsKey(pts) }, }, costs: { kitParking: { est: 10 } } }
    const r = race(log, { kitPickupAddress: 'Shopping Itatiba', kitPickupDate: '2026-11-07', kitPickupTime: '15:00' })
    const kitFuel = costItems(r, r.logistics).find((i) => i.id === 'kitFuel')
    expect(kitFuel.est).toBe(fuelCost(50, { kmPerL: 7, pricePerL: 4.29 }))
  })
  it('agenda a partir da logística salva', () => {
    const log = { ...baseLog, outbound: { ...baseLog.outbound, route: routeIda(baseLog) }, prep }
    const s = raceSchedule(race(log))
    // a rota salva mantém o tempo com trânsito do 3º trecho (29 min): mesmo resultado do cálculo direto
    expect(minToHm(s.wake)).toBe('04:11')
    expect(minToHm(s.depart)).toBe('04:51')
  })
  it('links: Google com paradas; Waze trecho a trecho', () => {
    const r = race(baseLog)
    const l = navLinks(tripPoints(r, r.logistics, 'ida'))
    expect(l.google).toContain('origin=Residencial%20Cen%C3%A1rio')
    expect(decodeURIComponent(l.google)).toContain('waypoints=Eloy Chaves, Jundiaí - SP|Portal do Medeiros, Jundiaí - SP')
    expect(l.waze).toHaveLength(3)
    expect(l.waze[0].url).toContain('waze.com/ul?q=Eloy')
  })
  it('compatibilidade: provas antigas sem logística; dados inválidos são limpos', () => {
    expect(normalizeRace({ ...emptyRace(), id: 'x', name: 'Antiga' }).logistics).toBe(null)
    const l = normalizeLogistics({ origin: { address: '' }, outbound: { stops: [{ address: 'A', dwellMin: -5 }, null] }, vehicle: { kmPerL: 0 }, costs: { parking: { est: 'abc' } } })
    expect(l.origin).toBe(null)
    expect(l.outbound.stops).toHaveLength(1)
    expect(l.outbound.stops[0].dwellMin).toBe(5)
    expect(l.vehicle.kmPerL).toBe(null)
    expect(l.costs.parking.est).toBe(null)
  })
  it('perfil guarda veículo, preparação e favoritos', () => {
    const p = normalizeProfile({ vehicle: { kmPerL: 7, pricePerL: 4.29, fuel: 'gasolina' }, prep: { showerMin: 15 }, favorites: [{ label: 'Casa', address: 'Residencial Cenário, Jundiaí' }, { address: 'sem nome' }] })
    expect(p.vehicle).toEqual({ kmPerL: 7, fuel: 'gasolina', pricePerL: 4.29 })
    expect(p.prep.showerMin).toBe(15)
    expect(p.favorites.map((f) => f.label)).toEqual(['Casa'])
  })
})

describe('polyline', () => {
  it('codifica e decodifica (exemplo da documentação do Google)', () => {
    const pts = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts)
    expect(() => decodePolyline('_p~')).toThrow()
  })
})
