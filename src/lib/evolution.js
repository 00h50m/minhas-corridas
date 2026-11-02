// Números para a aba Evolução: comparação entre anos, provas por mês e pace por distância.
import { byDateAsc, distanceKey, recordsByDistance } from './stats.js'
import { periodCosts } from './costs.js'
import { yearOf } from './dates.js'

function yearStats(races, y) {
  const done = races.filter((r) => r.status === 'concluida' && yearOf(r.date) === y)
  const km = done.reduce((s, r) => s + (r.result?.officialDistanceKm ?? r.distanceKm ?? 0), 0)
  const bests = {}
  for (const r of done) {
    const res = r.result
    if (!res?.isOfficial || !res.netTime || !res.officialDistanceKm) continue
    const k = distanceKey(res.officialDistanceKm)
    if (!bests[k] || res.netTime < bests[k]) bests[k] = res.netTime
  }
  return { year: y, count: done.length, km: Math.round(km * 1000) / 1000, spent: periodCosts(races, `${y}-01-01`, `${y}-12-31`).total, bests }
}

/** Este ano x anterior. `sameWindow`: compara o ano anterior só até o mesmo dia do ano (comparação justa). */
export function compareYears(races, today) {
  const y = Number(today.slice(0, 4))
  const cutoff = today.slice(4) // -MM-DD
  const prevRaces = races.map((r) => (r.date && yearOf(r.date) === y - 1 && r.date.slice(4) > cutoff ? { ...r, status: 'fora' } : r))
  const cur = yearStats(races, y)
  const prevFull = yearStats(races, y - 1)
  const prevSame = yearStats(prevRaces, y - 1)
  const keys = [...new Set([...Object.keys(cur.bests), ...Object.keys(prevFull.bests)])].sort((a, b) => Number(a) - Number(b))
  return { cur, prevFull, prevSame, keys }
}

/** Provas por mês no ano: concluídas e planejadas (inscrita com data). */
export function monthly(races, y) {
  const out = Array.from({ length: 12 }, (_, m) => ({ month: m, done: 0, planned: 0 }))
  for (const r of races) {
    if (yearOf(r.date) !== y) continue
    const m = Number(r.date.slice(5, 7)) - 1
    if (r.status === 'concluida') out[m].done++
    else if (r.status === 'inscrita') out[m].planned++
  }
  return out
}

/** Séries de pace por distância (só distâncias com 2+ resultados). */
export function paceSeries(races) {
  return recordsByDistance(races)
    .filter((g) => g.evolution.length >= 2)
    .map((g) => ({ key: g.key, km: g.km, points: g.evolution.filter((p) => p.pace).sort(byDateAsc) }))
}
