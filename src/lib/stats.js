import { daysBetween, todayISO, yearOf } from './dates.js'
import { PLANNING_STATUSES, SIGNED_UP_STATUSES } from './model.js'
import { inscriptionSpent } from './costs.js'
import { paceSeconds } from './format.js'

export function byDateAsc(a, b) {
  if (a.date === b.date) return a.name.localeCompare(b.name, 'pt-BR')
  if (!a.date) return 1
  if (!b.date) return -1
  return a.date < b.date ? -1 : 1
}

export function inscriptionCost(r) {
  if (r.fee == null && r.extraFees == null) return null
  return (r.fee ?? 0) + (r.extraFees ?? 0)
}

/** Próxima prova com inscrição confirmada, a partir de hoje. */
export function nextConfirmed(races, today = todayISO()) {
  return races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort(byDateAsc)[0] ?? null
}

/** Próximas provas do planejamento (interesse, aberta, inscrita) com data a partir de hoje. */
export function upcoming(races, today = todayISO(), limit = 5) {
  return races.filter((r) => PLANNING_STATUSES.includes(r.status) && r.date && r.date >= today).sort(byDateAsc).slice(0, limit)
}

/** Provas inscritas cuja data já passou e ainda sem resultado. */
export function pendingResults(races, today = todayISO()) {
  return races.filter((r) => r.status === 'inscrita' && r.date && r.date < today).sort(byDateAsc)
}

export function yearSummary(races, year) {
  const done = races.filter((r) => r.status === 'concluida' && yearOf(r.date) === year)
  const km = done.reduce((s, r) => s + (r.result?.officialDistanceKm ?? r.distanceKm ?? 0), 0)
  const inYear = races.filter((r) => yearOf(r.date) === year)
  let spent = 0
  let spentCount = 0
  for (const r of inYear) {
    const v = inscriptionSpent(r)
    if (v != null) {
      spent += v
      spentCount++
    }
  }
  const signedUp = inYear.filter((r) => SIGNED_UP_STATUSES.includes(r.status))
  return {
    doneCount: done.length,
    km: Math.round(km * 1000) / 1000,
    spent: Math.round(spent * 100) / 100,
    spentCount,
    missingCost: signedUp.filter((r) => inscriptionSpent(r) == null).length
  }
}

/** Agrupa distâncias equivalentes (oficiais) por chave arredondada a 0,1 km. */
export function distanceKey(km) {
  return (Math.round(km * 10) / 10).toFixed(1)
}

export function distanceLabel(key) {
  const n = Number(key)
  if (Math.abs(n - 42.2) < 0.05) return 'Maratona (42,195 km)'
  if (Math.abs(n - 21.1) < 0.05) return 'Meia maratona (21,1 km)'
  return `${n.toLocaleString('pt-BR')} km`
}

/** Provas concluídas com resultado, mais recentes primeiro. */
export function history(races) {
  return races.filter((r) => r.status === 'concluida' && r.result).sort((a, b) => -byDateAsc(a, b))
}

/**
 * Por distância oficial: melhor tempo líquido entre resultados oficiais,
 * e melhor registro pessoal quando não houver oficial melhor.
 */
export function recordsByDistance(races) {
  const groups = new Map()
  for (const r of history(races)) {
    const res = r.result
    if (!res.officialDistanceKm || !res.netTime) continue
    const key = distanceKey(res.officialDistanceKm)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const official = list.filter((r) => r.result.isOfficial)
    const personal = list.filter((r) => !r.result.isOfficial)
    const best = (arr) => arr.reduce((b, r) => (!b || r.result.netTime < b.result.netTime ? r : b), null)
    const bestOfficial = best(official)
    const bestPersonal = best(personal)
    const evolution = [...list].sort(byDateAsc).map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name,
      netTime: r.result.netTime,
      isOfficial: r.result.isOfficial,
      pace: paceSeconds(r.result.netTime, r.result.officialDistanceKm)
    }))
    out.push({
      key,
      km: Number(key),
      count: list.length,
      bestOfficial,
      // Só mostramos o pessoal quando é melhor que o oficial (ou não há oficial).
      bestPersonal: bestPersonal && (!bestOfficial || bestPersonal.result.netTime < bestOfficial.result.netTime) ? bestPersonal : null,
      evolution
    })
  }
  return out.sort((a, b) => a.km - b.km)
}

/** Datas com mais de uma prova ativa (não cancelada/desistida). */
export function sameDateGroups(races) {
  const map = new Map()
  for (const r of races) {
    if (!r.date || r.status === 'cancelada' || r.status === 'desisti') continue
    map.set(r.date, [...(map.get(r.date) ?? []), r])
  }
  return new Map([...map].filter(([, l]) => l.length > 1))
}

/** Outras provas ativas no mesmo dia ou em dias consecutivos à data informada. */
export function nearbyRaces(races, date, excludeId) {
  if (!date) return { sameDay: [], adjacent: [] }
  const active = races.filter((r) => r.id !== excludeId && r.date && r.status !== 'cancelada' && r.status !== 'desisti')
  return {
    sameDay: active.filter((r) => r.date === date),
    adjacent: active.filter((r) => Math.abs(daysBetween(date, r.date)) === 1)
  }
}

/** Filtro usado no calendário e na lista. */
export function applyFilters(races, f) {
  const q = (f.query ?? '').trim().toLocaleLowerCase('pt-BR')
  return races.filter((r) => {
    if (q && !r.name.toLocaleLowerCase('pt-BR').includes(q)) return false
    if (f.statuses?.length && !f.statuses.includes(r.status)) return false
    if (f.city && r.city.trim().toLocaleLowerCase('pt-BR') !== f.city.toLocaleLowerCase('pt-BR')) return false
    if (f.distance != null && (r.distanceKm == null || distanceKey(r.distanceKm) !== distanceKey(f.distance))) return false
    if (f.from || f.to) {
      if (!r.date) return false // provas sem data não entram em filtro de período
      if (f.from && r.date < f.from) return false
      if (f.to && r.date > f.to) return false
    }
    return true
  })
}

export function distinctCities(races) {
  const set = new Map()
  for (const r of races) {
    const c = r.city.trim()
    if (c) set.set(c.toLocaleLowerCase('pt-BR'), c)
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function distinctDistances(races) {
  const set = new Set(races.filter((r) => r.distanceKm).map((r) => Number(distanceKey(r.distanceKm))))
  return [...set].sort((a, b) => a - b)
}
