// Gerador de agenda do dia da prova: calcula de trás para frente, a partir da largada,
// os horários de acordar, preparar, sair, cada parada, chegada, aquecimento e largada.
// Tudo em minutos desde a meia-noite do dia da prova (pode ficar negativo = dia anterior).

export const DEFAULT_PREP = {
  arriveBeforeMin: 45, // chegar ao local (a pé, já estacionado) este tempo antes da largada
  showerMin: 15,
  dressMin: 15, // vestir e organizar
  breakfastMin: 0, // 0 = sem café da manhã
  finalPrepMin: 10, // preparativos finais antes de sair
  warmupMin: 15,
  positioningMin: 10, // ir para o curral/posicionar antes da largada
  parkingMin: 10, // estacionar e caminhar até a largada
  bufferMin: 10, // margem para imprevistos no trajeto
  trafficExtraPct: 0 // acréscimo nos trechos SEM trânsito previsto (ex.: rota do OpenRouteService)
}

export const PREP_FIELDS = [
  { key: 'arriveBeforeMin', label: 'Chegar antes da largada', max: 240 },
  { key: 'showerMin', label: 'Banho', max: 120 },
  { key: 'dressMin', label: 'Vestir e organizar', max: 120 },
  { key: 'breakfastMin', label: 'Café da manhã (0 = sem)', max: 120 },
  { key: 'finalPrepMin', label: 'Preparativos finais', max: 120 },
  { key: 'warmupMin', label: 'Aquecimento', max: 120 },
  { key: 'positioningMin', label: 'Posicionar na largada', max: 60 },
  { key: 'parkingMin', label: 'Estacionar e chegar a pé', max: 120 },
  { key: 'bufferMin', label: 'Margem para imprevistos', max: 180 },
  { key: 'trafficExtraPct', label: 'Acréscimo por trânsito (%)', max: 100, hint: 'Só nos trechos sem trânsito previsto.' }
]

export function normalizePrep(raw) {
  const out = { ...DEFAULT_PREP }
  if (raw && typeof raw === 'object') {
    for (const f of PREP_FIELDS) {
      const v = Number(raw[f.key])
      if (Number.isFinite(v) && v >= 0 && v <= f.max) out[f.key] = Math.round(v)
    }
  }
  return out
}

export function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '')
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

/** "05:35" ou "23:50 (dia anterior)". */
export function minToHm(min, { withDay = true } = {}) {
  const day = Math.floor(min / 1440)
  const r = ((min % 1440) + 1440) % 1440
  const s = `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
  if (!withDay || day === 0) return s
  return day < 0 ? `${s} (dia anterior)` : `${s} (dia seguinte)`
}

/** Duração de um trecho: com trânsito previsto, se houver; senão, a normal + acréscimo (%) escolhido. */
export const legMinutes = (leg, extraPct = 0) => (leg?.trafficMin != null ? Math.round(leg.trafficMin) : Math.round((leg?.durationMin ?? 0) * (1 + (extraPct || 0) / 100)))

/**
 * Agenda da prova.
 * input: { startTime 'HH:MM', prep, legs: [{ durationMin, trafficMin? }], stops: [{ label, dwellMin }], destLabel }
 * Os trechos ligam: casa → parada 1 → … → local da prova (legs.length = stops.length + 1).
 * Retorna null se faltar a largada ou os trechos; senão
 * { items, wake, depart, arrivalPlanned, arrivalTarget, warmupStart, start, travelMin, warnings }.
 */
export function buildSchedule({ startTime, prep: rawPrep, legs = [], stops = [], destLabel = 'Local da prova' }) {
  const L = hmToMin(startTime)
  if (L == null) return null
  if (!legs.length || legs.length !== stops.length + 1) return null
  const prep = normalizePrep(rawPrep)
  const positioning = L - prep.positioningMin
  const warmupStart = positioning - prep.warmupMin
  const arrivalTarget = L - prep.arriveBeforeMin // chegada a pé ao local
  const parkArrivalTarget = arrivalTarget - prep.parkingMin
  const pct = prep.trafficExtraPct
  const travelMin = legs.reduce((s, l) => s + legMinutes(l, pct), 0)
  const dwellMin = stops.reduce((s, st) => s + Math.max(0, Math.round(st.dwellMin || 0)), 0)
  const depart = parkArrivalTarget - travelMin - dwellMin - prep.bufferMin
  // Preparação, de trás para frente a partir da saída
  const finalPrep = depart - prep.finalPrepMin
  const dress = finalPrep - prep.dressMin
  const breakfast = dress - prep.breakfastMin
  const shower = breakfast - prep.showerMin
  const wake = shower

  const items = []
  const add = (key, at, label, extra = {}) => items.push({ key, at, label, ...extra })
  add('acordar', wake, 'Acordar', { highlight: true })
  if (prep.showerMin) add('banho', shower, 'Banho', { durationMin: prep.showerMin })
  if (prep.breakfastMin) add('cafe', breakfast, 'Café da manhã', { durationMin: prep.breakfastMin })
  if (prep.dressMin) add('vestir', dress, 'Vestir e organizar', { durationMin: prep.dressMin })
  if (prep.finalPrepMin) add('finais', finalPrep, 'Preparativos finais', { durationMin: prep.finalPrepMin })
  add('sair', depart, 'Sair de casa', { highlight: true, detail: prep.bufferMin ? `inclui ${prep.bufferMin} min de margem` : null })

  // Ida, para frente a partir da saída (sem atrasos: a margem fica para o fim)
  let t = depart
  stops.forEach((st, i) => {
    t += legMinutes(legs[i], pct)
    const dwell = Math.max(0, Math.round(st.dwellMin || 0))
    add(`parada-${i}`, t, `Chegar: ${st.label || `Parada ${i + 1}`}`, { stop: i, legMin: legMinutes(legs[i], pct), detail: dwell ? `${dwell} min · sair ${minToHm(t + dwell)}` : null, leaveAt: t + dwell })
    t += dwell
  })
  t += legMinutes(legs[legs.length - 1], pct)
  const parkArrival = t
  const arrivalPlanned = parkArrival + prep.parkingMin
  add('estacionar', parkArrival, `Chegar a ${destLabel}`, { legMin: legMinutes(legs[legs.length - 1], pct), detail: prep.parkingMin ? `estacionar e caminhar ${prep.parkingMin} min` : null })
  add('chegada', arrivalPlanned, 'Chegada prevista à largada', { highlight: true, detail: prep.bufferMin ? `com margem de ${prep.bufferMin} min até ${minToHm(arrivalTarget)}` : null })
  if (prep.warmupMin) add('aquecimento', warmupStart, 'Aquecimento', { durationMin: prep.warmupMin })
  if (prep.positioningMin) add('posicionar', positioning, 'Posicionar na largada')
  add('largada', L, 'Largada', { highlight: true })

  const warnings = []
  if (arrivalTarget > warmupStart) warnings.push('A chegada desejada é depois do início do aquecimento: aumente a antecedência ou diminua o aquecimento.')
  if (wake < 0) warnings.push('O horário de acordar cai no dia anterior.')
  items.sort((a, b) => a.at - b.at || order(a.key) - order(b.key))
  const noTraffic = legs.some((l) => l.trafficMin == null)
  return { items, wake, depart, arrivalPlanned, arrivalTarget, warmupStart, start: L, travelMin, dwellMin, prep, warnings, noTraffic }
}

const ORDER = ['acordar', 'banho', 'cafe', 'vestir', 'finais', 'sair', 'parada', 'estacionar', 'chegada', 'aquecimento', 'posicionar', 'largada']
const order = (k) => ORDER.indexOf(k.startsWith('parada') ? 'parada' : k)

/**
 * Saída para retirar o kit: chegar no horário da retirada (ou início da janela) com margem.
 * { depart, arrival, travelMin } ou null.
 */
export function kitSchedule({ time, legs = [], stops = [], bufferMin = 10, roundTrip = false, trafficExtraPct = 0 }) {
  const T = hmToMin(time)
  if (T == null || !legs.length) return null
  const goingLegs = roundTrip ? legs.slice(0, -1) : legs
  const travel = goingLegs.reduce((s, l) => s + legMinutes(l, trafficExtraPct), 0) + stops.reduce((s, st) => s + Math.max(0, st.dwellMin || 0), 0)
  return { depart: T - travel - bufferMin, arrival: T - bufferMin, travelMin: travel }
}

/**
 * Horário de partida da volta: chegar em casa a partir de uma saída (HH:MM) do local.
 * { depart, arrival, travelMin } ou null.
 */
export function returnSchedule({ departTime, legs = [], stops = [], trafficExtraPct = 0 }) {
  const D = hmToMin(departTime)
  if (D == null || !legs.length) return null
  const travel = legs.reduce((s, l) => s + legMinutes(l, trafficExtraPct), 0) + stops.reduce((s, st) => s + Math.max(0, st.dwellMin || 0), 0)
  return { depart: D, arrival: D + travel, travelMin: travel }
}
