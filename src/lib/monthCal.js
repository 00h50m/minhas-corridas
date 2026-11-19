// Calendário mensal de treinos: dias do mês (semana de segunda a domingo, como a semana de treinos),
// o que há em cada dia e o resumo do mês. Sem React: a tela fica em components/WorkoutMonth.jsx.
import { addDaysISO } from './dates.js'
import { weekStart, workoutState } from './trainingWeek.js'
import { doneSec, fmtSec, plannedSec } from './workout.js'
import { groupSets } from './strength.js'

/** Dias da grade do mês 'AAAA-MM' (semanas inteiras, segunda primeiro). */
export function monthGrid(month) {
  const first = `${month}-01`
  const start = weekStart(first)
  const days = []
  for (let d = start; days.length < 42; d = addDaysISO(d, 1)) days.push(d)
  // Só as semanas que tocam o mês
  const weeks = []
  for (let i = 0; i < 42; i += 7) if (days.slice(i, i + 7).some((d) => d.slice(0, 7) === month)) weeks.push(...days.slice(i, i + 7))
  return weeks
}

export const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Mapa data → { workouts, races } (provas inscritas e concluídas). */
export function byDay(workouts = [], races = []) {
  const map = new Map()
  const at = (d) => map.get(d) ?? (map.set(d, { workouts: [], races: [] }), map.get(d))
  for (const w of workouts) if (w.date) at(w.date).workouts.push(w)
  for (const r of races) if (r.date && ['inscrita', 'concluida'].includes(r.status)) at(r.date).races.push(r)
  return map
}

/** Tempo da atividade: o do relógio; sem arquivo, o planejado. */
export const activitySec = (w) => (w.status === 'feito' ? doneSec(w) : plannedSec(w))

/** Rótulo curto para a célula do dia (“1h03”, “45min”, “5,0km”). */
export function cellLabel(w) {
  if (w.status === 'feito' && w.result?.distanceKm > 0) return `${String(w.result.distanceKm.toFixed(1)).replace('.', ',')}km`
  const s = activitySec(w)
  if (!(s > 0)) return ''
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`
}

/** Linhas de resumo de uma atividade para o dia selecionado: [{ v, l }]. */
export function dayStats(w) {
  const r = w.status === 'feito' ? w.result : null
  if (!r) {
    const s = plannedSec(w)
    return s > 0 ? [{ v: fmtSec(s), l: 'planejado' }] : []
  }
  const out = []
  if (r.distanceKm > 0) out.push({ v: `${String(r.distanceKm.toFixed(2)).replace('.', ',')} km`, l: 'distância' })
  if (r.elapsedSec > 0) out.push({ v: fmtSec(r.elapsedSec), l: 'duração' })
  if (r.avgHr) out.push({ v: String(r.avgHr), l: 'FC média' })
  if (r.calories) out.push({ v: String(r.calories), l: 'kcal' })
  if (r.sets?.length) {
    const g = groupSets(r.sets)
    out.push({ v: String(g.totals.sets), l: g.groups.length === 1 ? '1 exercício' : `séries · ${g.groups.length} exerc.` })
  }
  return out
}

/** Resumo do mês: treinos (planejados+feitos), feitos, tempo e km feitos, dias com atividade feita. */
export function monthSummary(workouts = [], month, today) {
  const inMonth = workouts.filter((w) => w.date && w.date.slice(0, 7) === month)
  const done = inMonth.filter((w) => w.status === 'feito')
  return {
    total: inMonth.length,
    done: done.length,
    missed: inMonth.filter((w) => workoutState(w, today) === 'passou').length,
    sec: done.reduce((a, w) => a + activitySec(w), 0),
    km: Math.round(done.reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0) * 10) / 10,
    activeDays: new Set(done.map((w) => w.date)).size
  }
}

/** Pode arrastar para outro dia: só treinos planejados (inclusive os que passaram sem marcar). */
export const canDrag = (w) => w.status === 'planejado'
