// Comparação de duas provas concluídas, km a km, pelas parciais do relógio.
// A primeira prova é a referência (A); as diferenças são "B − A": negativo = B mais rápida.
import { byDateAsc, distanceKey } from './stats.js'

const fullSplits = (r) => (r.result?.watch?.splits ?? []).filter((s) => !s.partial && s.sec > 0)

export function hasSplits(r) {
  return fullSplits(r).length >= 2
}

function side(r) {
  const res = r.result
  const w = res.watch
  return {
    race: r,
    km: res.officialDistanceKm,
    net: res.netTime,
    pace: res.netTime / res.officialDistanceKm,
    avgHr: w?.avgHr ?? null,
    maxHr: w?.maxHr ?? null,
    elev: w?.elevGainM ?? null,
    effort: res.effort ?? null,
    isOfficial: !!res.isOfficial,
    splits: fullSplits(r)
  }
}

const sum = (arr) => arr.reduce((s, x) => s + x, 0)

/**
 * Compara duas provas. Retorna null se alguma não tiver resultado.
 * { a, b, sameDistance, rows, common, totalDiff, splitDiff, faster, slower, biggestGain, biggestLoss, halves }
 */
export function compareRaces(r1, r2) {
  if (!r1?.result?.netTime || !r2?.result?.netTime || !r1.result.officialDistanceKm || !r2.result.officialDistanceKm) return null
  const a = side(r1)
  const b = side(r2)
  const common = Math.min(a.splits.length, b.splits.length)
  const rows = []
  let aCum = 0
  let bCum = 0
  for (let i = 0; i < common; i++) {
    const as = a.splits[i].sec
    const bs = b.splits[i].sec
    aCum += as
    bCum += bs
    rows.push({ km: i + 1, a: as, b: bs, diff: bs - as, aCum, bCum, cumDiff: bCum - aCum })
  }
  const out = {
    a,
    b,
    sameDistance: distanceKey(a.km) === distanceKey(b.km),
    rows,
    common,
    totalDiff: b.net - a.net,
    paceDiff: b.pace - a.pace,
    splitDiff: null,
    faster: 0,
    slower: 0,
    biggestGain: null,
    biggestLoss: null,
    halves: null
  }
  if (common >= 2) {
    out.splitDiff = rows[common - 1].cumDiff
    out.faster = rows.filter((r) => r.diff < 0).length
    out.slower = rows.filter((r) => r.diff > 0).length
    const gain = rows.reduce((m, r) => (r.diff < (m?.diff ?? 0) ? r : m), null)
    const loss = rows.reduce((m, r) => (r.diff > (m?.diff ?? 0) ? r : m), null)
    out.biggestGain = gain
    out.biggestLoss = loss
    const h = Math.floor(common / 2)
    if (h >= 1) {
      out.halves = {
        first: sum(rows.slice(0, h).map((r) => r.diff)),
        second: sum(rows.slice(common - h).map((r) => r.diff)),
        size: h
      }
    }
  }
  return out
}

/** Provas que podem ser comparadas com `race`: mesma distância e com parciais primeiro, depois as mais recentes. */
export function comparableRaces(races, race) {
  const key = race?.result?.officialDistanceKm ? distanceKey(race.result.officialDistanceKm) : null
  return races
    .filter((r) => r.id !== race?.id && r.status === 'concluida' && r.result?.netTime && r.result.officialDistanceKm)
    .map((r) => ({ r, same: key != null && distanceKey(r.result.officialDistanceKm) === key, splits: hasSplits(r) }))
    .sort((x, y) => (x.same !== y.same ? (x.same ? -1 : 1) : x.splits !== y.splits ? (x.splits ? -1 : 1) : -byDateAsc(x.r, y.r)))
    .map((x) => x.r)
}

/** "−0:08", "+1:02" ou "0:00" para diferenças de tempo. */
export function formatDiff(sec) {
  const s = Math.round(Math.abs(sec))
  if (s === 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
  return (sec < 0 ? '−' : '+') + body
}
