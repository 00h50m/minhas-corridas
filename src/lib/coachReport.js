// Relatório para o treinador: o período da ficha (ou outro) com quantas vezes cada treino foi feito, as
// cargas de cada exercício ao longo das semanas, as séries que faltaram, as corridas e a carga semanal.
// É um retrato só do que o app sabe (o que foi marcado como feito/anotado); nada é inventado.
import { addDaysISO } from './dates.js'
import { doneSec, isRun, sportOf } from './workout.js'
import { weekStart } from './trainingWeek.js'
import { activityLoad } from './load.js'
import { gymDurationSec } from './gymSession.js'
import { groupSets, exLabel } from './strength.js'

const r1 = (n) => Math.round(n * 10) / 10

/** Período padrão: o da ficha ativa (até hoje); sem datas na ficha, os últimos 30 dias. */
export function defaultPeriod(program, today) {
  if (program?.from) return { from: program.from, to: program.to && program.to < today ? program.to : today }
  return { from: addDaysISO(today, -29), to: today }
}

/** Séries de um treino de academia feito, por exercício (anotadas no app; senão, as do relógio). */
function exerciseRows(w) {
  const out = []
  const ex = w.exercises ?? []
  if (w.gymLog?.entries?.length) {
    ex.forEach((x, i) => {
      const es = w.gymLog.entries.filter((e) => e.i === i).sort((a, b) => a.n - b.n)
      out.push({ name: exLabel(x), planned: x.sets ?? 1, done: es.length, kgs: es.map((e) => e.kg).filter((v) => v != null), reps: es.map((e) => e.reps).filter((v) => v != null), source: 'app' })
    })
    return out
  }
  if (w.result?.sets?.length) {
    for (const g of groupSets(w.result.sets).groups) out.push({ name: g.name, planned: null, done: g.sets, kgs: g.maxKg != null ? [g.maxKg] : [], reps: g.reps, source: 'relogio' })
    return out
  }
  return ex.map((x) => ({ name: exLabel(x), planned: x.sets ?? 1, done: null, kgs: [], reps: [], source: null }))
}

/**
 * { period, program, gym: { sessions, bySheet, perWeek, missedSets, plannedSets, exercises }, runs, other,
 *   races, weeks }
 */
export function buildReport({ program = null, workouts = [], races = [], from, to }) {
  const inP = (d) => d && d >= from && d <= to
  const done = workouts.filter((w) => w.status === 'feito' && inP(w.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const skipped = workouts.filter((w) => w.status === 'pulado' && inP(w.date))
  const gym = done.filter((w) => w.sport === 'academia')
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1)

  // Por treino da ficha (A, B, C…)
  const bySheet = (program?.sheets ?? []).map((s) => {
    const ws = gym.filter((w) => w.ficha?.programId === program.id && w.ficha.sheetId === s.id)
    return { label: s.label, count: ws.length, dates: ws.map((w) => w.date) }
  })
  const loose = gym.filter((w) => !(program && w.ficha?.programId === program.id)).length

  // Exercícios: sessão a sessão (data, carga máxima, repetições, séries feitas/planejadas)
  const exMap = new Map()
  let missedSets = 0
  let plannedSets = 0
  for (const w of gym) {
    for (const row of exerciseRows(w)) {
      if (row.planned != null && row.done != null) { plannedSets += row.planned; missedSets += Math.max(0, row.planned - row.done) }
      if (!row.done && !row.kgs.length) continue
      const key = row.name.toLowerCase()
      const e = exMap.get(key) ?? { name: row.name, sessions: [] }
      e.sessions.push({ date: w.date, sheet: w.ficha?.label ?? null, maxKg: row.kgs.length ? Math.max(...row.kgs) : null, kgs: row.kgs, reps: row.reps, done: row.done, planned: row.planned })
      exMap.set(key, e)
    }
  }
  const exercises = [...exMap.values()].map((e) => {
    const kg = e.sessions.filter((s) => s.maxKg != null)
    return { ...e, firstKg: kg[0]?.maxKg ?? null, lastKg: kg.at(-1)?.maxKg ?? null, bestKg: kg.length ? Math.max(...kg.map((s) => s.maxKg)) : null }
  })

  // Corridas e outras atividades
  const runs = done.filter(isRun)
  const km = r1(runs.reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0))
  const runSec = runs.reduce((a, w) => a + (w.result?.elapsedSec ?? 0), 0)
  const timed = runs.filter((w) => w.result?.distanceKm > 0 && w.result?.elapsedSec > 0)
  const paceSec = timed.length ? timed.reduce((a, w) => a + w.result.elapsedSec, 0) / timed.reduce((a, w) => a + w.result.distanceKm, 0) : null
  const longest = runs.reduce((m, w) => Math.max(m, w.result?.distanceKm ?? 0), 0)
  const other = {}
  for (const w of done.filter((x) => !isRun(x) && x.sport !== 'academia')) other[sportOf(w).label] = (other[sportOf(w).label] ?? 0) + 1

  // Semanas (seg–dom) que tocam o período: sessões e carga feita
  const weeks = []
  for (let s = weekStart(from); s <= to; s = addDaysISO(s, 7)) {
    const e = addDaysISO(s, 6)
    const ws = done.filter((w) => w.date >= s && w.date <= e && inP(w.date))
    weeks.push({ start: s, gym: ws.filter((w) => w.sport === 'academia').length, runs: ws.filter(isRun).length, km: r1(ws.filter(isRun).reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0)), load: ws.reduce((a, w) => a + activityLoad(w), 0), min: Math.round(ws.reduce((a, w) => a + doneSec(w), 0) / 60) })
  }

  const gymMin = gym.map((w) => gymDurationSec(w.gymLog) ?? w.result?.elapsedSec ?? null).filter((v) => v)
  return {
    period: { from, to, days },
    program: program ? { title: program.title, goal: program.goal, coach: program.coach, from: program.from, to: program.to } : null,
    gym: { sessions: gym.length, bySheet, loose, perWeek: r1((gym.length / days) * 7), missedSets, plannedSets, avgMin: gymMin.length ? Math.round(gymMin.reduce((a, b) => a + b, 0) / gymMin.length / 60) : null, exercises },
    runs: { count: runs.length, km, min: Math.round(runSec / 60), paceSec: paceSec ? Math.round(paceSec) : null, longestKm: r1(longest) },
    other,
    skipped: skipped.length,
    races: races.filter((r) => r.status === 'concluida' && inP(r.date) && r.result).map((r) => ({ name: r.name, date: r.date, km: r.result.officialDistanceKm ?? r.distanceKm ?? null, netTime: r.result.netTime ?? null })),
    weeks
  }
}

const br = (iso) => iso.split('-').reverse().join('/')
const pace = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
const kg = (v) => `${String(v).replace('.', ',')} kg`

/** Resumo em texto (para mandar por mensagem). */
export function reportText(r) {
  const L = []
  L.push(`Relatório de treinos · ${br(r.period.from)} a ${br(r.period.to)}`)
  if (r.program) L.push([r.program.title, r.program.goal].filter(Boolean).join(' · '))
  L.push('')
  L.push(`Academia: ${r.gym.sessions} ${r.gym.sessions === 1 ? 'treino' : 'treinos'} (${String(r.gym.perWeek).replace('.', ',')} por semana)${r.gym.avgMin ? ` · média de ${r.gym.avgMin} min` : ''}`)
  if (r.gym.bySheet.length) L.push(r.gym.bySheet.map((s) => `Treino ${s.label}: ${s.count}×`).join(' · '))
  if (r.gym.plannedSets) L.push(`Séries feitas: ${r.gym.plannedSets - r.gym.missedSets} de ${r.gym.plannedSets}${r.gym.missedSets ? ` (faltaram ${r.gym.missedSets})` : ''}`)
  const withKg = r.gym.exercises.filter((e) => e.firstKg != null)
  if (withKg.length) {
    L.push('')
    L.push('Cargas (primeira → última):')
    for (const e of withKg) L.push(`- ${e.name}: ${e.firstKg === e.lastKg ? kg(e.lastKg) : `${kg(e.firstKg)} → ${kg(e.lastKg)}`} (${e.sessions.length}×)`)
  }
  L.push('')
  L.push(`Corrida: ${r.runs.count} ${r.runs.count === 1 ? 'treino' : 'treinos'} · ${String(r.runs.km).replace('.', ',')} km${r.runs.paceSec ? ` · pace médio ${pace(r.runs.paceSec)}` : ''}${r.runs.longestKm ? ` · mais longo ${String(r.runs.longestKm).replace('.', ',')} km` : ''}`)
  const o = Object.entries(r.other)
  if (o.length) L.push(`Outras: ${o.map(([k, v]) => `${k} ${v}×`).join(' · ')}`)
  if (r.races.length) L.push(`Provas: ${r.races.map((x) => `${x.name} (${br(x.date)})`).join(', ')}`)
  if (r.skipped) L.push(`Treinos marcados como “não fiz”: ${r.skipped}`)
  return L.join('\n')
}
