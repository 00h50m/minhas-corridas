// Meta x realizado: compara a meta definida antes da prova com o tempo feito,
// no total, na metade e nas passagens (quando há parciais do relógio).
import { paceTable } from './analysis.js'

/**
 * Tempo acumulado (s) em cada distância do relógio, a partir das parciais.
 * Devolve uma função d(km do relógio) → segundos, ou null se não houver parciais.
 */
export function cumulativeFn(splits) {
  const list = (splits ?? []).filter((s) => s.sec > 0)
  if (list.filter((s) => !s.partial).length < 2) return null
  const pts = [{ km: 0, t: 0 }]
  let t = 0
  for (const s of list) {
    t += s.sec
    pts.push({ km: s.km, t })
  }
  const total = pts[pts.length - 1]
  const at = (d) => {
    if (d <= 0) return 0
    if (d > total.km + 1e-9) return null
    for (let i = 1; i < pts.length; i++) {
      if (d <= pts[i].km + 1e-9) {
        const a = pts[i - 1]
        const b = pts[i]
        return a.t + ((d - a.km) / (b.km - a.km || 1)) * (b.t - a.t)
      }
    }
    return total.t
  }
  return { at, km: total.km, sec: total.t }
}

/** Marcas de passagem: as do plano de prova, sempre com a metade. */
function marks(km) {
  const list = paceTable(1000, km).map((r) => r.km)
  const half = Math.round((km / 2) * 1000) / 1000
  if (km >= 4 && !list.some((d) => Math.abs(d - half) < 0.01)) list.push(half)
  return [...new Set(list)].sort((a, b) => a - b)
}

/**
 * { target, net, diff, status, plannedPace, realPace, paceDiff, checkpoints, halves, worst, best, hasSplits }
 * As parciais do relógio são ajustadas proporcionalmente à distância oficial e ao tempo líquido,
 * para que a chegada bata com o resultado oficial.
 */
export function compareToTarget(race) {
  const res = race.result
  if (!race.targetTime || !res?.netTime || !res.officialDistanceKm) return null
  const km = res.officialDistanceKm
  const target = race.targetTime
  const net = res.netTime
  const diff = net - target
  const out = {
    target,
    net,
    diff,
    status: diff <= 0 ? 'batida' : diff / target <= 0.02 ? 'perto' : 'acima',
    plannedPace: target / km,
    realPace: net / km,
    paceDiff: (net - target) / km,
    checkpoints: [],
    halves: null,
    worst: null,
    best: null,
    hasSplits: false
  }
  const cum = cumulativeFn(res.watch?.splits)
  const scaleKm = cum ? cum.km / km : 1
  const scaleT = cum ? net / cum.sec : 1
  for (const d of marks(km)) {
    const planned = Math.round((target / km) * d)
    const isEnd = Math.abs(d - km) < 1e-6
    let actual = null
    if (isEnd) actual = net
    else if (cum) {
      const v = cum.at(d * scaleKm)
      actual = v == null ? null : Math.round(v * scaleT)
    }
    out.checkpoints.push({ km: d, planned, actual, diff: actual == null ? null : actual - planned, half: !isEnd && Math.abs(d - km / 2) < 0.01, end: isEnd })
  }
  out.hasSplits = !!cum
  const half = out.checkpoints.find((c) => c.half)
  if (cum && half?.actual != null) {
    const first = half.actual
    out.halves = { first, second: net - first, plannedEach: target / 2, firstDiff: first - target / 2, secondDiff: net - first - target / 2 }
  }
  // Trecho em que mais perdeu (ou ganhou) tempo em relação ao plano
  if (cum) {
    let prev = { km: 0, diff: 0 }
    for (const c of out.checkpoints) {
      if (c.diff == null) continue
      const delta = c.diff - prev.diff
      const seg = { from: prev.km, to: c.km, delta }
      if (!out.worst || delta > out.worst.delta) out.worst = seg
      if (!out.best || delta < out.best.delta) out.best = seg
      prev = c
    }
    if (out.worst && out.worst.delta <= 0) out.worst = null
    if (out.best && out.best.delta >= 0) out.best = null
  }
  return out
}
