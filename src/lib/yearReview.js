// Retrospectiva do ano: números, destaques e lugares, a partir das provas registradas.
import { byDateAsc, distanceKey, distanceLabel } from './stats.js'
import { periodCosts } from './costs.js'
import { goalProgress } from './goals.js'
import { tripSummary } from './logistics.js'
import { yearOf } from './dates.js'

const round1 = (n) => Math.round(n * 10) / 10

/** Anos com alguma prova concluída (mais recente primeiro). */
export function reviewYears(races) {
  return [...new Set(races.filter((r) => r.status === 'concluida' && r.result && r.date).map((r) => yearOf(r.date)))].sort((a, b) => b - a)
}

/**
 * Retrospectiva de `year`.
 * { year, count, km, timeSec, avgPace, months[12], topMonth, distances, prs, firsts, targets,
 *   longest, fastest, highlight, places, states, spent, kmDriven, goalsDone, nextYear, empty }
 */
export function yearReview(races, goals, year, today, people = []) {
  const all = races.filter((r) => r.status === 'concluida' && r.result?.netTime && r.result.officialDistanceKm && r.date).sort(byDateAsc)
  const done = all.filter((r) => yearOf(r.date) === year)
  const out = { year, count: done.length, empty: done.length === 0 }

  out.km = round1(done.reduce((s, r) => s + r.result.officialDistanceKm, 0))
  out.timeSec = done.reduce((s, r) => s + r.result.netTime, 0)
  out.avgPace = out.km ? out.timeSec / out.km : null

  // Provas por mês
  out.months = Array.from({ length: 12 }, () => 0)
  for (const r of done) out.months[Number(r.date.slice(5, 7)) - 1]++
  const max = Math.max(...out.months)
  out.topMonth = max > 0 ? out.months.indexOf(max) : null

  // Distâncias
  const byKey = new Map()
  for (const r of done) {
    const k = distanceKey(r.result.officialDistanceKm)
    byKey.set(k, (byKey.get(k) ?? 0) + 1)
  }
  out.distances = [...byKey].map(([key, n]) => ({ key, label: distanceLabel(key), count: n })).sort((a, b) => b.count - a.count || Number(a.key) - Number(b.key))

  // Primeiras vezes em cada distância (no ano)
  out.firsts = []
  const seen = new Set()
  for (const r of all) {
    const k = distanceKey(r.result.officialDistanceKm)
    if (seen.has(k)) continue
    seen.add(k)
    if (yearOf(r.date) === year) out.firsts.push({ race: r, key: k, label: distanceLabel(k) })
  }
  // Recordes (oficiais): melhor tempo do ano abaixo do melhor de ANTES do ano, por distância.
  out.prs = []
  const official = (list) => list.filter((r) => r.result.isOfficial)
  const before = official(all.filter((r) => yearOf(r.date) < year))
  for (const k of new Set(official(done).map((r) => distanceKey(r.result.officialDistanceKm)))) {
    const same = (r) => distanceKey(r.result.officialDistanceKm) === k
    const prev = before.filter(same).reduce((m, r) => Math.min(m, r.result.netTime), Infinity)
    const best = official(done).filter(same).reduce((b, r) => (!b || r.result.netTime < b.result.netTime ? r : b), null)
    if (prev < Infinity && best.result.netTime < prev) out.prs.push({ race: best, key: k, label: distanceLabel(k), gain: prev - best.result.netTime, pct: (prev - best.result.netTime) / prev })
  }
  out.prs.sort((a, b) => b.pct - a.pct)

  // Metas de tempo das provas
  const withTarget = done.filter((r) => r.targetTime)
  out.targets = { set: withTarget.length, hit: withTarget.filter((r) => r.result.netTime <= r.targetTime).length }

  out.longest = done.reduce((b, r) => (!b || r.result.officialDistanceKm > b.result.officialDistanceKm ? r : b), null)
  const fastPool = done.filter((r) => r.result.isOfficial && r.result.officialDistanceKm >= 3)
  out.fastest = fastPool.reduce((b, r) => (!b || r.result.netTime / r.result.officialDistanceKm < b.result.netTime / b.result.officialDistanceKm ? r : b), null)

  // Destaque: maior recorde (%); senão a meta batida com mais folga; senão a mais longa.
  const bestTarget = withTarget.filter((r) => r.result.netTime <= r.targetTime).sort((a, b) => (b.targetTime - b.result.netTime) - (a.targetTime - a.result.netTime))[0]
  out.highlight = out.prs[0]
    ? { race: out.prs[0].race, why: 'pr', gain: out.prs[0].gain, label: out.prs[0].label }
    : bestTarget
      ? { race: bestTarget, why: 'meta', gain: bestTarget.targetTime - bestTarget.result.netTime }
      : out.longest
        ? { race: out.longest, why: 'longa' }
        : null

  // Lugares
  const cities = new Map()
  for (const r of done) if (r.city) cities.set(`${r.city.trim().toLowerCase()}|${r.state}`, { city: r.city.trim(), state: r.state })
  out.places = [...cities.values()]
  out.states = [...new Set(done.map((r) => r.state).filter(Boolean))]

  // Dinheiro e deslocamento (provas inscritas e concluídas do ano)
  out.spent = periodCosts(races, `${year}-01-01`, `${year}-12-31`).total
  out.kmDriven = round1(
    races
      .filter((r) => yearOf(r.date) === year && ['inscrita', 'concluida'].includes(r.status) && r.logistics)
      .reduce((s, r) => s + ['ida', 'volta', 'kit'].reduce((t, w) => {
        const x = tripSummary(r, r.logistics, w)
        return t + (x.enabled && x.complete ? x.distanceKm : 0)
      }, 0), 0)
  )

  // Objetivos cumpridos no ano
  out.goalsDone = goals.filter((g) => {
    const p = goalProgress(g, races, today)
    const inYear = g.deadline ? yearOf(g.deadline) === year : g.startDate ? yearOf(g.startDate) <= year : true
    return inYear && (g.status === 'concluido' || (p.achieved && g.type !== 'orcamento'))
  })

  // Com quem correu (pessoas cadastradas marcadas em "Quem vai junto")
  const names = new Map(people.map((p) => [p.id, p.name]))
  const counts = new Map()
  for (const r of done) for (const id of r.companionIds ?? []) if (names.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
  out.companions = [...counts].map(([id, n]) => ({ id, name: names.get(id), count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))

  out.nextYear = races.filter((r) => yearOf(r.date) === year + 1 && ['inscrita', 'aberta', 'interesse'].includes(r.status)).length
  return out
}

/** Horas e minutos correndo: "7 h 42 min". */
export function formatHours(sec) {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

/** Mostrar o convite da retrospectiva no Início: dezembro (ano atual) e janeiro (ano anterior). */
export function reviewInviteYear(today) {
  const m = Number(today.slice(5, 7))
  const y = Number(today.slice(0, 4))
  if (m === 12) return y
  if (m === 1) return y - 1
  return null
}
