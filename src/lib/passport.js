// Passaporte de corredora: conquistas (com a data em que vieram), as próximas com quanto falta,
// recordes e números da carreira. Tudo calculado dos dados que já estão no app.
import { history, recordsByDistance } from './stats.js'
import { addDaysISO, daysBetween } from './dates.js'
import { formatDuration } from './format.js'
import { weekStart, weekSummary } from './trainingWeek.js'
import { isRun } from './workout.js'
import { cellsOf, collectTracks } from './runMap.js'

const raceKm = (r) => r.result?.officialDistanceKm ?? r.distanceKm ?? 0
const nf = (n) => String(n).replace('.', ',')

/** Famílias com níveis: a conquista de cada nível é a data do N-ésimo evento. */
function counterFamily({ id, icon, events, tiers, title, desc, unit, accumulate = null }) {
  // events: [{ date, value? }] em ordem de data. accumulate: soma value (km) em vez de contar.
  const out = []
  let total = 0
  const reachedAt = new Map()
  for (const e of events) {
    total += accumulate ? e.value : 1
    for (const t of tiers) if (!reachedAt.has(t) && total >= t) reachedAt.set(t, e)
  }
  for (const t of tiers) {
    out.push({ id: `${id}-${t}`, family: id, icon, title: title(t), desc: desc(t), date: reachedAt.get(t)?.date ?? null, raceId: reachedAt.get(t)?.raceId ?? null, progress: { cur: Math.round(total * 10) / 10, need: t, text: reachedAt.has(t) ? null : `${nf(Math.round(total * 10) / 10)} de ${t} ${unit}` } })
  }
  return out
}

/** 2400 → "40"; 5400 → "1h30"; 7200 → "2h". */
const subLabel = (t) => (t < 3600 ? String(t / 60) : `${Math.floor(t / 3600)}h${t % 3600 ? String((t % 3600) / 60).padStart(2, '0') : ''}`)

/** Tempos abaixo de limites (sub-X) numa distância: data em que o melhor ficou abaixo de cada um. */
function subFamily({ id, km, label, marks, tiers }) {
  // marks: [{ date, sec }] em ordem de data (tempo equivalente na distância)
  const out = []
  let best = Infinity
  const at = new Map()
  for (const m of marks) {
    best = Math.min(best, m.sec)
    for (const t of tiers) if (!at.has(t) && best < t) at.set(t, m)
  }
  for (const t of tiers) {
    const reached = at.has(t)
    out.push({
      id: `${id}-${t}`, family: id, icon: '⏱️', timed: true,
      title: `Sub ${subLabel(t)} nos ${label}`,
      desc: `Correu ${label} em menos de ${formatDuration(t)}.`,
      date: at.get(t)?.date ?? null,
      raceId: at.get(t)?.raceId ?? null,
      progress: { cur: best, need: t, text: reached ? null : best < Infinity ? `melhor: ${formatDuration(Math.round(best))} · faltam ${formatDuration(Math.max(1, Math.ceil(best - t)))}` : `ainda sem marca nos ${label}` }
    })
  }
  return out
}

/** Marcas numa distância: provas (tempo líquido) e testes de treino com o arquivo do relógio. */
function marksAt(races, workouts, km, lo, hi) {
  const m = []
  for (const r of history(races)) {
    const d = r.result.officialDistanceKm
    if (d >= km * lo && d <= km * hi && r.result.netTime > 0) m.push({ date: r.date, sec: r.result.netTime, raceId: r.id })
  }
  for (const w of workouts) {
    const r = w.result
    if (!isRun(w) || w.status !== 'feito' || !w.date || !(r?.elapsedSec > 0)) continue
    if (r.distanceKm >= km * 0.98 && r.distanceKm <= km * 1.05) m.push({ date: w.date, sec: (r.elapsedSec * km) / r.distanceKm })
  }
  return m.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Maior sequência de semanas cumpridas, com a data em que cada tamanho foi alcançado. */
function streakEvents(workouts, today) {
  const dated = workouts.filter((w) => w.date).map((w) => w.date).sort()
  if (!dated.length) return []
  const out = []
  let start = weekStart(dated[0])
  let run = 0
  const lastWeek = weekStart(today)
  for (let i = 0; i < 260 && start <= lastWeek; i++) {
    const s = weekSummary(workouts, start, today)
    if (s.complete) {
      run++
      out.push({ date: s.end < today ? s.end : today, run })
    } else if (start !== lastWeek) run = 0
    start = addDaysISO(start, 7)
  }
  return out
}

/**
 * { badges: conquistas alcançadas (mais recentes primeiro, com `isNew` nos últimos 14 dias),
 *   next: a próxima de cada família (com progresso), all, numbers, records }
 */
export function passport({ races = [], workouts = [], goals = [], today, times = true }) {
  const done = [...history(races)].reverse() // mais antigas primeiro
  const runs = workouts.filter((w) => isRun(w) && w.status === 'feito' && w.date).sort((a, b) => (a.date < b.date ? -1 : 1))
  const cross = workouts.filter((w) => !isRun(w) && w.status === 'feito' && w.date).sort((a, b) => (a.date < b.date ? -1 : 1))
  const all = []

  // Primeiras vezes
  const firsts = [
    { id: 'primeira-prova', icon: '🎽', title: 'Primeira prova', desc: 'Cruzou a primeira linha de chegada.', min: 0 },
    { id: 'primeiros-5k', icon: '🥉', title: 'Primeiros 5 km', desc: 'Completou uma prova de 5 km ou mais.', min: 4.9 },
    { id: 'primeiros-10k', icon: '🥈', title: 'Primeiros 10 km', desc: 'Completou uma prova de 10 km ou mais.', min: 9.8 },
    { id: 'primeira-meia', icon: '🥇', title: 'Primeira meia maratona', desc: 'Completou 21,1 km numa prova.', min: 21 },
    { id: 'primeira-maratona', icon: '🏆', title: 'Primeira maratona', desc: 'Completou os 42,195 km.', min: 42 }
  ]
  const longest = done.reduce((m, r) => Math.max(m, raceKm(r)), 0)
  for (const f of firsts) {
    const r = done.find((x) => raceKm(x) >= f.min)
    all.push({ id: f.id, family: f.id, icon: f.icon, title: f.title, desc: f.desc, date: r?.date ?? null, raceId: r?.id ?? null, progress: { cur: longest, need: f.min, text: r ? null : longest ? `prova mais longa: ${nf(longest)} km` : 'nenhuma prova concluída ainda' } })
  }

  all.push(...counterFamily({ id: 'provas', icon: '🏅', events: done.map((r) => ({ date: r.date, raceId: r.id })), tiers: [5, 10, 25, 50], unit: 'provas', title: (t) => `${t} provas`, desc: (t) => `Completou ${t} provas.` }))
  all.push(...counterFamily({ id: 'km-provas', icon: '🛣️', events: done.map((r) => ({ date: r.date, raceId: r.id, value: raceKm(r) })), accumulate: true, tiers: [50, 100, 250, 500], unit: 'km', title: (t) => `${t} km em provas`, desc: (t) => `Somou ${t} km correndo provas.` }))
  const seenCity = new Set()
  const cityEvents = []
  for (const r of done) {
    if (!r.city) continue
    const k = `${r.city.toLowerCase()}|${r.state ?? ''}`
    if (!seenCity.has(k)) { seenCity.add(k); cityEvents.push({ date: r.date, raceId: r.id }) }
  }
  all.push(...counterFamily({ id: 'cidades', icon: '📍', events: cityEvents, tiers: [3, 5, 10, 20], unit: 'cidades', title: (t) => `${t} cidades`, desc: (t) => `Correu provas em ${t} cidades diferentes.` }))
  all.push(...counterFamily({ id: 'treinos', icon: '👟', events: runs.map((w) => ({ date: w.date })), tiers: [10, 25, 50, 100, 200], unit: 'treinos', title: (t) => `${t} treinos de corrida`, desc: (t) => `Marcou ${t} treinos de corrida como feitos.` }))
  all.push(...counterFamily({ id: 'cruzado', icon: '💪', events: cross.map((w) => ({ date: w.date })), tiers: [5, 20, 50], unit: 'atividades', title: (t) => `${t} treinos cruzados`, desc: (t) => `Fez ${t} atividades além da corrida (academia, bike, natação…).` }))

  const st = streakEvents(workouts, today)
  for (const t of [2, 4, 8, 12]) {
    const hit = st.find((e) => e.run >= t)
    const best = st.reduce((m, e) => Math.max(m, e.run), 0)
    all.push({ id: `semanas-${t}`, family: 'semanas', icon: '🔥', title: `${t} semanas seguidas`, desc: `Cumpriu todos os treinos de ${t} semanas seguidas.`, date: hit?.date ?? null, progress: { cur: best, need: t, text: hit ? null : `melhor sequência: ${best} ${best === 1 ? 'semana' : 'semanas'}` } })
  }

  const metas = done.filter((r) => r.targetTime && r.result.netTime && r.result.netTime <= r.targetTime)
  all.push(...counterFamily({ id: 'metas', icon: '🎯', events: metas.map((r) => ({ date: r.date, raceId: r.id })), tiers: [1, 3, 5], unit: 'metas', title: (t) => (t === 1 ? 'Meta batida' : `${t} metas batidas`), desc: (t) => (t === 1 ? 'Bateu a meta de tempo de uma prova.' : `Bateu a meta de tempo em ${t} provas.`) }))
  const goalsDone = goals.filter((g) => g.status === 'concluido').map((g) => ({ date: (g.completedAt ?? g.updatedAt ?? g.deadline ?? today).slice(0, 10) })).sort((a, b) => (a.date < b.date ? -1 : 1))
  all.push(...counterFamily({ id: 'objetivos', icon: '🏁', events: goalsDone, tiers: [1, 3], unit: 'objetivos', title: (t) => (t === 1 ? 'Objetivo cumprido' : `${t} objetivos cumpridos`), desc: (t) => (t === 1 ? 'Concluiu um objetivo.' : `Concluiu ${t} objetivos.`) }))

  const early = done.find((r) => r.startTime && r.startTime <= '06:30')
  all.push({ id: 'madrugadora', family: 'madrugadora', icon: '🌅', title: 'Madrugadora', desc: 'Largou numa prova às 6h30 ou antes.', date: early?.date ?? null, raceId: early?.id ?? null, progress: { cur: 0, need: 1, text: early ? null : 'uma largada até 6h30' } })

  // Território (traçados do relógio)
  const tracks = collectTracks(races, workouts)
  const seen = new Set()
  const terr = []
  for (const t of tracks) {
    let n = 0
    for (const c of cellsOf(t.coords)) if (!seen.has(c)) { seen.add(c); n++ }
    if (n) terr.push({ date: t.date, value: n })
  }
  all.push(...counterFamily({ id: 'territorio', icon: '🗺️', events: terr, accumulate: true, tiers: [50, 200, 500, 1000], unit: 'quarteirões', title: (t) => `${t} quarteirões`, desc: (t) => `Seus percursos já passaram por ${t} quarteirões diferentes.` }))

  // Tempos (só com "mostrar tempos")
  if (times) {
    all.push(...subFamily({ id: 'sub5k', km: 5, label: '5 km', marks: marksAt(races, workouts, 5, 0.99, 1.05), tiers: [45, 40, 38, 35, 32, 30, 28, 25].map((m) => m * 60) }))
    all.push(...subFamily({ id: 'sub10k', km: 10, label: '10 km', marks: marksAt(races, workouts, 10, 0.99, 1.05), tiers: [90, 80, 75, 70, 65, 60, 55, 50].map((m) => m * 60) }))
    all.push(...subFamily({ id: 'sub21k', km: 21.1, label: '21 km', marks: marksAt(races, workouts, 21.0975, 0.995, 1.04), tiers: [180, 165, 150, 135, 120, 105].map((m) => m * 60) }))
  }

  // Mais recentes primeiro; no mesmo dia, a mais difícil (que vem depois na lista) primeiro.
  const badges = all.map((a, i) => ({ a, i })).filter(({ a }) => a.date).sort((x, y) => (x.a.date < y.a.date ? 1 : x.a.date > y.a.date ? -1 : y.i - x.i)).map(({ a }) => ({ ...a, isNew: daysBetween(a.date, today) <= 14 && a.date <= today }))
  // Próxima de cada família (a primeira não alcançada); sub-X só a próxima abaixo do melhor.
  const next = []
  const fams = new Set()
  for (const a of all) {
    if (a.date || fams.has(a.family)) continue
    fams.add(a.family)
    next.push(a)
  }
  const ratio = (a) => (a.timed ? (a.progress.cur < Infinity ? a.progress.need / a.progress.cur : 0) : a.progress.need ? Math.min(1, a.progress.cur / a.progress.need) : 0)
  next.sort((a, b) => ratio(b) - ratio(a))

  const cities = [...new Map(done.filter((r) => r.city).map((r) => [`${r.city.toLowerCase()}|${r.state ?? ''}`, `${r.city}${r.state ? `/${r.state}` : ''}`])).values()]
  return {
    badges,
    next,
    all,
    numbers: {
      races: done.length,
      raceKm: Math.round(done.reduce((s, r) => s + raceKm(r), 0) * 10) / 10,
      runs: runs.length,
      runKm: Math.round(runs.reduce((s, w) => s + (w.result?.distanceKm ?? 0), 0) * 10) / 10,
      cross: cross.length,
      cities,
      cells: seen.size,
      since: done[0]?.date ?? runs[0]?.date ?? null
    },
    records: times ? recordsByDistance(races) : []
  }
}
