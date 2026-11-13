// Logística da prova: trajetos (ida, volta e retirada do kit), paradas, rota, custos e links.
// Fica em race.logistics (sincroniza e entra no backup junto com a prova). Os custos
// alimentam a categoria Transporte existente (transportEst/transportPaid), sem duplicar.
import { buildSchedule, kitSchedule, normalizePrep } from './schedule.js'
import { collapsedPoints, isPrecise } from './geo.js'

const round2 = (n) => Math.round(n * 100) / 100
const num = (v, min = 0, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const newId = () => Math.random().toString(36).slice(2, 10)

export const FUELS = [
  { id: 'gasolina', label: 'Gasolina' },
  { id: 'etanol', label: 'Etanol' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'gnv', label: 'GNV' }
]

/* ---------- Modelo ---------- */

export function normalizePlace(raw) {
  if (!raw || typeof raw !== 'object') return null
  const address = str(raw.address, 240)
  if (!address) return null
  const lat = num(raw.lat, -90, 90)
  const lon = num(raw.lon, -180, 180)
  const has = lat != null && lon != null
  const precision = has && ['numero', 'rua', 'cep', 'area', 'local', 'ponto', 'gps', 'manual'].includes(raw.precision) ? raw.precision : null
  // Partes do endereço digitado (rua, número…), referência e quando a pessoa marcou o ponto à mão.
  const pr = raw.parts && typeof raw.parts === 'object' ? raw.parts : null
  const parts = pr ? Object.fromEntries(PART_KEYS.map((k) => [k, str(pr[k], k === 'street' ? 120 : 60)]).filter(([, v]) => v)) : null
  const reference = str(raw.reference, 120)
  return {
    label: str(raw.label, 60), address, formatted: str(raw.formatted, 240), lat: has ? lat : null, lon: has ? lon : null,
    ...(precision ? { precision } : {}),
    ...(parts && Object.keys(parts).length ? { parts } : {}),
    ...(reference ? { reference } : {})
  }
}
export const PART_KEYS = ['street', 'number', 'complement', 'district', 'city', 'cep']

/** Endereço para busca a partir das partes (rua, número, bairro, cidade, CEP). O complemento não ajuda a localizar. */
export function partsToQuery(p) {
  if (!p) return ''
  return [p.street && p.number ? `${p.street}, ${p.number}` : p.street, p.district, p.city, p.cep].filter(Boolean).join(', ')
}

function normalizeStop(raw) {
  const p = normalizePlace(raw)
  if (!p) return null
  return { ...p, id: str(raw.id, 20) || newId(), dwellMin: Math.round(num(Number(raw.dwellMin), 0, 600) ?? 5), personId: str(raw.personId, 20) || null }
}

function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.legs) || !raw.legs.length) return null
  const legs = raw.legs.map((l) => ({
    distanceKm: num(Number(l?.distanceKm), 0, 5000),
    durationMin: num(Number(l?.durationMin), 0, 6000),
    trafficMin: l?.trafficMin == null ? null : num(Number(l.trafficMin), 0, 6000),
    // Valores brutos do serviço (metros e segundos), para somar sem arredondar antes.
    ...(num(Number(l?.distanceM), 0, 5e6) != null && l?.distanceM != null ? { distanceM: Number(l.distanceM) } : {}),
    ...(num(Number(l?.durationSec), 0, 360000) != null && l?.durationSec != null ? { durationSec: Number(l.durationSec) } : {}),
    ...(num(Number(l?.trafficSec), 0, 360000) != null && l?.trafficSec != null ? { trafficSec: Number(l.trafficSec) } : {}),
    ...(typeof l?.polyline === 'string' && l.polyline ? { polyline: l.polyline.slice(0, 20000) } : {}),
    ...(Array.isArray(l?.roads) && l.roads.length ? { roads: l.roads.filter((x) => typeof x === 'string').slice(0, 3).map((x) => x.slice(0, 80)) } : {})
  }))
  if (legs.some((l) => l.distanceKm == null || l.durationMin == null)) return null
  const tolls = raw.tolls && num(Number(raw.tolls.amount), 0, 100000) != null ? { amount: Number(raw.tolls.amount), currency: str(raw.tolls.currency, 3) || 'BRL' } : null
  return {
    provider: ['google', 'ors', 'manual'].includes(raw.provider) ? raw.provider : 'manual',
    legs,
    polyline: typeof raw.polyline === 'string' ? raw.polyline.slice(0, 60000) : '',
    points: Array.isArray(raw.points) ? raw.points.filter((p) => num(p?.lat, -90, 90) != null && num(p?.lon, -180, 180) != null).map((p) => ({ lat: p.lat, lon: p.lon })).slice(0, 12) : [],
    tolls,
    traffic: !!raw.traffic,
    departureAt: str(raw.departureAt, 40) || null,
    fetchedAt: str(raw.fetchedAt, 40) || null,
    key: str(raw.key, 2000)
  }
}

const money = (raw) => ({ est: num(Number(raw?.est ?? NaN), 0, 1e6), paid: num(Number(raw?.paid ?? NaN), 0, 1e6) })

function normalizeTrip(raw, { withMode = false, withDepart = false, withKit = false } = {}) {
  const t = raw && typeof raw === 'object' ? raw : {}
  const out = { stops: (Array.isArray(t.stops) ? t.stops : []).map(normalizeStop).filter(Boolean).slice(0, 8), route: normalizeRoute(t.route), legChoices: normalizeChoices(t.legChoices) }
  if (withMode) {
    out.enabled = t.enabled !== false
    out.mode = t.mode === 'custom' ? 'custom' : 'reverse'
  }
  if (withDepart) out.departTime = /^\d{2}:\d{2}$/.test(t.departTime || '') ? t.departTime : ''
  if (withKit) {
    out.enabled = !!t.enabled
    out.origin = normalizePlace(t.origin)
    out.destination = normalizePlace(t.destination)
    out.roundTrip = t.roundTrip !== false
  }
  return out
}

export function emptyLogistics() {
  return normalizeLogistics({})
}

export function normalizeLogistics(raw) {
  if (!raw || typeof raw !== 'object') return null
  const c = raw.costs && typeof raw.costs === 'object' ? raw.costs : {}
  const v = raw.vehicle && typeof raw.vehicle === 'object' ? raw.vehicle : {}
  return {
    origin: normalizePlace(raw.origin),
    destination: normalizePlace(raw.destination),
    outbound: normalizeTrip(raw.outbound),
    back: normalizeTrip(raw.back, { withMode: true, withDepart: true }),
    kit: normalizeTrip(raw.kit, { withKit: true }),
    costs: {
      fuelOut: money(c.fuelOut),
      fuelBack: money(c.fuelBack),
      tollsOut: money(c.tollsOut),
      tollsBack: money(c.tollsBack),
      parking: money(c.parking),
      extras: { ...money(c.extras), desc: str(c.extras?.desc, 80) },
      kitFuel: money(c.kitFuel),
      kitTolls: money(c.kitTolls),
      kitParking: money(c.kitParking)
    },
    // Veículo desta viagem (vem do perfil e pode ser ajustado aqui)
    vehicle: { kmPerL: num(Number(v.kmPerL), 1, 100), fuel: FUELS.some((f) => f.id === v.fuel) ? v.fuel : 'gasolina', pricePerL: num(Number(v.pricePerL), 0.1, 50) },
    prep: raw.prep ? normalizePrep(raw.prep) : null, // preferências usadas na agenda desta prova
    scheduleInFeed: !!raw.scheduleInFeed
  }
}

/* ---------- Endereços e trajetos ---------- */

/** Endereço da largada a partir do cadastro da prova. */
/** Acrescenta "Cidade/UF" ao endereço se a cidade ainda não aparece depois da primeira vírgula. */
function withCity(address, race) {
  const city = [race.city, race.state].filter(Boolean).join('/')
  if (!city || !race.city) return address
  const tail = address.split(',').slice(1).join(',').toLowerCase()
  return tail.includes(race.city.toLowerCase()) ? address : `${address}, ${city}`
}

export function venueAddress(race) {
  const street = race.venueAddress || race.venueName
  return street ? withCity(street, race) : ''
}

/** Endereço da retirada do kit (completa com a cidade da prova se faltar). */
export function kitAddress(race) {
  return race.kitPickupAddress ? withCity(race.kitPickupAddress, race) : ''
}

/** Destino efetivo: o geocodificado, se ainda corresponder ao endereço do cadastro. */
function placeFor(saved, address, label) {
  if (!address) return null
  if (saved && saved.address === address) return { ...saved, label: saved.label || label }
  return { label, address, formatted: '', lat: null, lon: null }
}

export function destinationPlace(race, log) {
  return placeFor(log?.destination, venueAddress(race), race.venueName || 'Local da prova')
}
export function kitPlace(race, log) {
  return placeFor(log?.kit?.destination, kitAddress(race), 'Retirada do kit')
}

/**
 * Pontos de um trajeto: [{ label, address, lat, lon, dwellMin, role }].
 * which: 'ida' | 'volta' | 'kit'. Retorna [] se faltar origem ou destino.
 */
export function tripPoints(race, log, which) {
  if (!log) return []
  const home = log.origin ? { ...log.origin, label: log.origin.label || 'Casa' } : null
  if (which === 'kit') {
    const from = log.kit.origin ? { ...log.kit.origin, label: log.kit.origin.label || 'Saída' } : home
    const to = kitPlace(race, log)
    if (!from || !to) return []
    const pts = [{ ...from, role: 'origin' }, ...log.kit.stops.map((s) => ({ ...s, role: 'stop' })), { ...to, role: 'dest', dwellMin: 0 }]
    if (log.kit.roundTrip) pts.push({ ...from, role: 'origin', label: from.label })
    return pts
  }
  const dest = destinationPlace(race, log)
  if (!home || !dest) return []
  if (which === 'ida') return [{ ...home, role: 'origin' }, ...log.outbound.stops.map((s) => ({ ...s, role: 'stop' })), { ...dest, role: 'dest', dwellMin: 0 }]
  const stops = log.back.mode === 'reverse' ? [...log.outbound.stops].reverse() : log.back.stops
  return [{ ...dest, role: 'origin' }, ...stops.map((s) => ({ ...s, role: 'stop' })), { ...home, role: 'dest', dwellMin: 0 }]
}

/* ---------- Escolha de caminho por trecho ---------- */

/**
 * Escolha de caminho de um trecho, guardada pelo par de pontos (sobrevive a reordenar as paradas
 * enquanto o par existir): { label, preference: 'fastest'|'shortest', avoid: ['highways'|'tollways'], vias: [{lat, lon}] }.
 * Pontos de passagem só desenham o caminho: não são paradas e não têm permanência.
 */
export function normalizeChoice(raw) {
  if (!raw || typeof raw !== 'object') return null
  const preference = raw.preference === 'shortest' ? 'shortest' : 'fastest'
  const avoid = [...new Set((Array.isArray(raw.avoid) ? raw.avoid : []).filter((a) => a === 'highways' || a === 'tollways'))]
  const vias = (Array.isArray(raw.vias) ? raw.vias : []).filter((v) => num(v?.lat, -90, 90) != null && num(v?.lon, -180, 180) != null).slice(0, 5).map((v) => ({ lat: v.lat, lon: v.lon }))
  if (preference === 'fastest' && !avoid.length && !vias.length) return null // padrão
  return { label: str(raw.label, 40) || 'Personalizada', preference, avoid, vias }
}
function normalizeChoices(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw).slice(0, 30)) {
    const c = normalizeChoice(v)
    if (c && k.length <= 2000) out[k] = c
  }
  return out
}
/** Identificador de um trecho: o par de pontos (endereço + coordenada). */
export const legKey = (a, b) => pointsKey([a, b])
/** Escolha de cada trecho do trajeto (null = mais rápida, o padrão). */
export function tripChoices(trip, points) {
  return points.slice(1).map((b, i) => trip?.legChoices?.[legKey(points[i], b)] ?? null)
}
const choiceSig = (c) => (c ? `${c.preference}/${c.avoid.join('+')}/${c.vias.map((v) => `${v.lat.toFixed(5)},${v.lon.toFixed(5)}`).join(';')}` : '')
/** Chave da rota: pontos + escolhas (mudar o caminho de um trecho desatualiza a rota). */
export function routeKey(points, choices = []) {
  const base = pointsKey(points)
  return choices.some(Boolean) ? `${base} #${choices.map(choiceSig).join('|')}` : base
}

/**
 * Arredondamento que fecha a conta: cada trecho arredondado de modo que a soma dê o total
 * arredondado (maiores restos). Evita "6 + 16 + 20 + 20 = 62" com total de 61.
 */
export function roundToTotal(values, unit = 1) {
  const exact = values.map((v) => v / unit)
  const total = Math.round(exact.reduce((a, v) => a + v, 0))
  const floors = exact.map(Math.floor)
  let rest = total - floors.reduce((a, v) => a + v, 0)
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f)
  const out = [...floors]
  for (const { i } of order) {
    if (rest <= 0) break
    out[i]++
    rest--
  }
  return { parts: out, total }
}

/** Identifica o conjunto de pontos de uma rota (para saber se ela ficou desatualizada). */
export const pointsKey = (points) => points.map((p) => `${p.address.toLowerCase()}${p.lat != null ? `@${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : ''}`).join(' | ')
/** Chave antiga (só endereços), de rotas calculadas antes das coordenadas entrarem na chave. */
const legacyKey = (points) => points.map((p) => p.address.toLowerCase()).join(' | ')

export function tripOf(log, which) {
  return which === 'ida' ? log.outbound : which === 'volta' ? log.back : log.kit
}

/**
 * Resumo de um trajeto: { points, route, stale, legs, distanceKm, durationMin, trafficMin, complete }.
 * `complete`: há rota (calculada ou informada) para os pontos atuais.
 */
export function tripSummary(race, log, which) {
  const points = tripPoints(race, log, which)
  const trip = log ? tripOf(log, which) : null
  const route = trip?.route ?? null
  const legsNeeded = Math.max(0, points.length - 1)
  // Rota calculada com algum trecho de 0 km: pontos caíram no mesmo lugar (geocodificação errada). Não vale.
  const invalid = !!route && route.provider !== 'manual' && route.legs.some((l) => !(l.distanceKm > 0))
  const choices = tripChoices(trip, points)
  const rkey = routeKey(points, choices)
  const noChoices = !choices.some(Boolean)
  const stale = !!route && (invalid || (route.key !== rkey && !(noChoices && route.key === legacyKey(points))) || route.legs.length !== legsNeeded)
  const legs = route && !stale ? route.legs : []
  const complete = legs.length > 0 && legs.length === legsNeeded
  // Totais a partir dos valores brutos (metros/segundos) quando o serviço os forneceu.
  const raw = complete && legs.every((l) => l.distanceM != null && l.durationSec != null)
  // Apresentação: trechos arredondados para fechar com o total (que vem da soma dos valores brutos).
  const kmR = complete ? (raw ? roundToTotal(legs.map((l) => l.distanceM), 10) : roundToTotal(legs.map((l) => l.distanceKm * 100))) : null
  const minR = complete ? (raw ? roundToTotal(legs.map((l) => l.durationSec), 60) : roundToTotal(legs.map((l) => l.durationMin))) : null
  const legKm = kmR ? kmR.parts.map((v) => v / 100) : []
  const legMin = minR ? minR.parts : []
  const distanceKm = kmR ? kmR.total / 100 : null
  const durationMin = minR ? minR.total : null
  const trafficMin = complete && legs.every((l) => l.trafficMin != null) ? (legs.every((l) => l.trafficSec != null) ? Math.round(legs.reduce((s, l) => s + l.trafficSec, 0) / 60) : Math.round(legs.reduce((s, l) => s + l.trafficMin, 0))) : null
  // Paradas: tempo parado em cada uma (não muda a rota; só os totais).
  const dwellMin = points.filter((p) => p.role === 'stop').reduce((s, p) => s + Math.max(0, Math.round(p.dwellMin || 0)), 0)
  const totalMin = durationMin == null ? null : (trafficMin ?? durationMin) + dwellMin
  // Problemas de localização: endereços diferentes no mesmo ponto; pontos aproximados ou sem verificação.
  const collapsed = collapsedPoints(points)
  const approx = points.map((p, i) => ({ p, i })).filter(({ p }) => p.lat != null && !isPrecise(p)).map(({ i }) => i)
  const unverified = points.map((p, i) => ({ p, i })).filter(({ p }) => p.lat == null).map(({ i }) => i)
  return { points, route: stale ? null : route, stale, invalid, legs, legKm, legMin, choices, routeKey: rkey, distanceKm, durationMin, trafficMin, dwellMin, totalMin, complete, collapsed, approx, unverified, key: rkey, enabled: which === 'volta' ? log?.back.enabled !== false : which === 'kit' ? !!log?.kit.enabled : true }
}

/* ---------- Custos ---------- */

/** Custo de combustível = distância ÷ consumo × preço por litro. */
export function fuelCost(km, vehicle) {
  if (!(km > 0) || !(vehicle?.kmPerL > 0) || !(vehicle?.pricePerL > 0)) return null
  return round2((km / vehicle.kmPerL) * vehicle.pricePerL)
}

/**
 * Itens de custo do deslocamento: [{ id, label, est, paid, source, trip }].
 * est: combustível calculado; pedágio informado ou, na falta, o da rota (quando o serviço fornece).
 */
export function costItems(race, log) {
  if (!log) return []
  const c = log.costs
  const ida = tripSummary(race, log, 'ida')
  const volta = tripSummary(race, log, 'volta')
  const kit = tripSummary(race, log, 'kit')
  const items = []
  const add = (id, label, est, paid, source, trip) => items.push({ id, label, est: est ?? null, paid: paid ?? null, source, trip })
  const fuelEst = (s, manual) => manual ?? (s.complete ? fuelCost(s.distanceKm, log.vehicle) : null)
  const routeToll = (s) => (s.complete && s.route?.tolls?.currency === 'BRL' ? s.route.tolls.amount : null)
  add('fuelOut', 'Combustível (ida)', fuelEst(ida, c.fuelOut.est), c.fuelOut.paid, c.fuelOut.est != null ? 'manual' : 'calc', 'ida')
  add('tollsOut', 'Pedágios (ida)', c.tollsOut.est ?? routeToll(ida), c.tollsOut.paid, c.tollsOut.est != null ? 'manual' : routeToll(ida) != null ? 'rota' : null, 'ida')
  if (volta.enabled) {
    add('fuelBack', 'Combustível (volta)', fuelEst(volta, c.fuelBack.est), c.fuelBack.paid, c.fuelBack.est != null ? 'manual' : 'calc', 'volta')
    add('tollsBack', 'Pedágios (volta)', c.tollsBack.est ?? routeToll(volta), c.tollsBack.paid, c.tollsBack.est != null ? 'manual' : routeToll(volta) != null ? 'rota' : null, 'volta')
  }
  add('parking', 'Estacionamento', c.parking.est, c.parking.paid, 'manual', 'ida')
  add('extras', c.extras.desc ? `Outras: ${c.extras.desc}` : 'Outras despesas', c.extras.est, c.extras.paid, 'manual', 'ida')
  if (kit.enabled) {
    add('kitFuel', 'Kit: combustível', fuelEst(kit, c.kitFuel.est), c.kitFuel.paid, c.kitFuel.est != null ? 'manual' : 'calc', 'kit')
    add('kitTolls', 'Kit: pedágios', c.kitTolls.est ?? routeToll(kit), c.kitTolls.paid, c.kitTolls.est != null ? 'manual' : routeToll(kit) != null ? 'rota' : null, 'kit')
    add('kitParking', 'Kit: estacionamento', c.kitParking.est, c.kitParking.paid, 'manual', 'kit')
  }
  return items
}

/**
 * Totais para a categoria Transporte. Vale o pago quando informado; senão, o estimado.
 * transportPaid só é preenchido quando TODOS os itens com valor estão pagos (para o
 * resto do app tratar o total como pago); senão fica null e transportEst leva a soma.
 */
export function transportTotals(items) {
  const withValue = items.filter((i) => i.est != null || i.paid != null)
  if (!withValue.length) return { transportEst: null, transportPaid: null, total: 0, paid: 0, allPaid: false, any: false }
  const total = round2(withValue.reduce((s, i) => s + (i.paid ?? i.est), 0))
  const paid = round2(withValue.reduce((s, i) => s + (i.paid ?? 0), 0))
  const allPaid = withValue.every((i) => i.paid != null)
  return { transportEst: total, transportPaid: allPaid ? paid : null, total, paid, allPaid, any: true }
}

/** A logística controla o Transporte da prova (o formulário mostra o valor só para leitura). */
export function logisticsManagesTransport(race) {
  return !!race.logistics && transportTotals(costItems(race, race.logistics)).any
}

/**
 * Aplica a logística à prova: atualiza Transporte (estimado e pago) a partir dos custos e,
 * se a pessoa pediu, os horários para a agenda por assinatura (sem endereços).
 */
export function applyLogistics(race) {
  if (!race.logistics) return race.scheduleFeed ? { ...race, scheduleFeed: null } : race
  const out = { ...race, scheduleFeed: race.logistics.scheduleInFeed ? scheduleEvents(race) : null }
  const t = transportTotals(costItems(race, race.logistics))
  if (!t.any) return out
  return { ...out, transportEst: t.transportEst, transportPaid: t.transportPaid }
}

/* ---------- Agenda a partir da logística ---------- */

export function raceSchedule(race, profilePrep) {
  const log = race.logistics
  if (!log || !race.startTime) return null
  const ida = tripSummary(race, log, 'ida')
  if (!ida.complete) return null
  const stops = ida.points.filter((p) => p.role === 'stop')
  // Mesmos minutos por trecho que a tela mostra (arredondados para fechar com o total).
  const legs = ida.legs.map((l, i) => ({ ...l, durationMin: ida.legMin[i] }))
  return buildSchedule({ startTime: race.startTime, prep: log.prep ?? profilePrep, legs, stops, destLabel: ida.points.at(-1)?.label || 'Local da prova' })
}

export function raceKitSchedule(race, profilePrep) {
  const log = race.logistics
  if (!log?.kit.enabled || !race.kitPickupTime) return null
  const kit = tripSummary(race, log, 'kit')
  if (!kit.complete) return null
  const prep = normalizePrep(log.prep ?? profilePrep)
  return kitSchedule({ time: race.kitPickupTime, legs: kit.legs, stops: kit.points.filter((p) => p.role === 'stop'), bufferMin: prep.bufferMin, roundTrip: log.kit.roundTrip, trafficExtraPct: prep.trafficExtraPct })
}

/** Data ISO deslocada em dias (sem fuso). */
function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const toEvent = (key, title, date, min) => {
  const day = Math.floor(min / 1440)
  const r = ((min % 1440) + 1440) % 1440
  return { key, title, date: shiftDate(date, day), time: `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
}

/** Horários-chave para a agenda (.ics): acordar, sair de casa e sair para o kit. Sem endereços. */
export function scheduleEvents(race, profilePrep) {
  if (!race.date || !['inscrita', 'interesse', 'aberta'].includes(race.status)) return []
  const out = []
  const s = raceSchedule(race, profilePrep)
  if (s) {
    out.push(toEvent('acordar', `Acordar – ${race.name}`, race.date, s.wake))
    out.push(toEvent('sair', `Sair de casa – ${race.name} (largada ${race.startTime})`, race.date, s.depart))
  }
  const k = raceKitSchedule(race, profilePrep)
  if (k && race.kitPickupDate) out.push(toEvent('kit-sair', `Sair para retirar o kit – ${race.name}`, race.kitPickupDate, k.depart))
  const log = race.logistics
  const back = log?.back
  if (back?.enabled && /^\d{2}:\d{2}$/.test(back.departTime || '')) {
    const [h, m] = back.departTime.split(':').map(Number)
    out.push(toEvent('volta', `Sair de volta para casa – ${race.name}`, race.date, h * 60 + m))
  }
  return out
}

/* ---------- Navegação ---------- */

const enc = encodeURIComponent
const target = (p) => (p.lat != null ? `${p.lat},${p.lon}` : p.formatted || p.address)

/** Google Maps com todas as paradas; Waze só aceita um destino por vez (um link por trecho). */
export function navLinks(points) {
  if (points.length < 2) return null
  const origin = points[0]
  const dest = points[points.length - 1]
  const mids = points.slice(1, -1)
  const google = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${enc(target(origin))}&destination=${enc(target(dest))}${mids.length ? `&waypoints=${enc(mids.map(target).join('|'))}` : ''}`
  const waze = points.slice(1).map((p) => ({ label: p.label || p.address, url: p.lat != null ? `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes` : `https://waze.com/ul?q=${enc(p.address)}&navigate=yes` }))
  return { google, waze }
}
