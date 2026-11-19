// Remanejar treinos: sugere o novo dia com uma regra simples e explica cada escolha.
// Regra: (1) não no dia de outra corrida; (2) de preferência com um dia de descanso entre corridas;
// (3) nunca no dia de uma prova inscrita, e evita os 2 dias antes; (4) de preferência na mesma semana;
// (5) dentro do prazo do objetivo do plano; (6) entre iguais, o mais cedo.
import { addDaysISO, formatDateBR, weekdayShort } from './dates.js'
import { isRun, plannedSec } from './workout.js'
import { easyRun, hardDayNote } from './cycle.js'
import { weekStart } from './trainingWeek.js'

export const dayLabel = (iso) => `${weekdayShort(iso)} ${formatDateBR(iso).slice(0, 5)}`

/** Primeiro dia possível: hoje para treino que já passou; o dia seguinte para o de hoje ou futuro. */
export function firstCandidate(w, today) {
  return !w.date || w.date < today ? today : addDaysISO(w.date, 1)
}

/**
 * Dias sugeridos para `w`, do melhor para o pior: [{ date, score, notes: [aviso], clean }].
 * clean: nenhum aviso (usado pelo remanejamento automático).
 */
export function suggestDates(w, { workouts = [], races = [], goals = [], today, days = 7, cycle = null } = {}) {
  const run = isRun(w)
  // Treino forte (tiros ou longo): avisa se cair num dia do ciclo que costuma ser difícil para ela
  const hard = run && (!easyRun(w) || plannedSec(w) >= 4500)
  // Treinos que passaram sem marcar não ocupam mais o dia antigo.
  const others = workouts.filter((x) => x.id !== w.id && x.date && x.status !== 'pulado' && !(x.status === 'planejado' && x.date < today))
  const sameKind = others.filter((x) => isRun(x) === run && (run || x.sport === w.sport))
  const runs = others.filter(isRun)
  const signed = races.filter((r) => r.status === 'inscrita' && r.date)
  const goal = w.goalId ? goals.find((g) => g.id === w.goalId) : null
  const origWeek = w.date ? weekStart(w.date < today ? today : w.date) : weekStart(today)
  const start = firstCandidate(w, today)
  const out = []
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i)
    if (sameKind.some((x) => x.date === d)) continue
    if (signed.some((r) => r.date === d)) continue
    if (goal?.deadline && d > goal.deadline) continue
    const notes = []
    let score = -i * 0.1
    if (run) {
      const near = runs.find((x) => x.date === addDaysISO(d, -1) || x.date === addDaysISO(d, 1))
      if (near) { score -= 2; notes.push(`fica colado com “${near.name}” (${dayLabel(near.date)}), sem dia de descanso`) }
      const race = signed.find((r) => r.date > d && r.date <= addDaysISO(d, 2))
      if (race) { score -= 3; notes.push(`a ${race.date === addDaysISO(d, 1) ? '1 dia' : '2 dias'} da prova “${race.name}”`) }
    }
    const other = others.find((x) => x.date === d && isRun(x) !== run)
    if (other) { score -= 0.5; notes.push(`mesmo dia de “${other.name}”`) }
    if (weekStart(d) !== origWeek) { score -= 1; notes.push('vai para a semana seguinte') }
    const cyc = hard && cycle ? hardDayNote(cycle, d, today) : null
    if (cyc) { score -= 1; notes.push(cyc) }
    out.push({ date: d, score, notes, clean: notes.length === 0 })
  }
  return out.sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : 1))
}

/** O treino em `to`, planejado de novo, com o histórico do remanejamento. */
export function moveWorkout(w, to, today, auto = false) {
  return { ...w, date: to, status: 'planejado', moves: [...(w.moves ?? []), { from: w.date, to, at: today, auto }].slice(-10) }
}

/** Treinos planejados cuja data passou sem marcar (mais antigos primeiro). */
export function missedWorkouts(workouts, today) {
  return workouts.filter((w) => w.status === 'planejado' && w.date && w.date < today).sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * O que a regra faz com os treinos que passaram sem marcar:
 * 'remanejar' → [{ w, to }] para o melhor dia sem avisos (no máximo 2 remanejamentos automáticos por treino);
 * 'pular' → [{ w, skip: true }]; 'perguntar' → [].
 * Treinos mais antigos que 7 dias não são mexidos sozinhos.
 */
export function applyMissedRule(rule, { workouts, races, goals, today }) {
  if (rule === 'perguntar') return []
  const missed = missedWorkouts(workouts, today).filter((w) => w.date >= addDaysISO(today, -7))
  if (rule === 'pular') return missed.map((w) => ({ w, skip: true }))
  const out = []
  let ws = workouts
  for (const w of missed) {
    if ((w.moves ?? []).filter((m) => m.auto).length >= 2) continue
    const best = suggestDates(w, { workouts: ws, races, goals, today })[0]
    if (!best?.clean) continue
    out.push({ w, to: best.date })
    ws = ws.map((x) => (x.id === w.id ? { ...x, date: best.date } : x))
  }
  return out
}

/** Texto do último remanejamento: "remanejado de ter 17/11" (ou "remanejado 2× · de …"). */
export function movedLabel(w) {
  const m = w.moves ?? []
  if (!m.length) return null
  const first = m[0].from
  return `remanejado${m.length > 1 ? ` ${m.length}×` : ''} · era ${dayLabel(first)}`
}
