// Semana de treinos (segunda a domingo): planejado × feito, tempo e km, e sequência de semanas cumpridas.
import { addDaysISO, parseISODate, toISODate } from './dates.js'
import { doneSec as doneSecOf, isRun, plannedSec } from './workout.js'

/** Segunda-feira da semana de uma data ISO. */
export function weekStart(iso) {
  const d = parseISODate(iso)
  const dow = (d.getDay() + 6) % 7 // segunda = 0
  d.setDate(d.getDate() - dow)
  return toISODate(d)
}

/** Situação de um treino na data de hoje: feito | pulado | passou (planejado e não feito) | hoje | futuro. */
export function workoutState(w, today) {
  if (w.status === 'feito') return 'feito'
  if (w.status === 'pulado') return 'pulado'
  if (w.date < today) return 'passou'
  if (w.date === today) return 'hoje'
  return 'futuro'
}

/**
 * Resumo da semana que começa em `start` (segunda).
 * { start, end, days: [{ date, workouts }], planned, done, skipped, missed, plannedSec, doneSec, doneKm, complete }
 * Tempo feito: o do arquivo do relógio; sem arquivo, a estimativa do treino marcado como feito.
 */
export function weekSummary(workouts, start, today) {
  const end = addDaysISO(start, 6)
  const inWeek = workouts.filter((w) => w.date && w.date >= start && w.date <= end)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(start, i)
    return { date, workouts: inWeek.filter((w) => w.date === date) }
  })
  const states = inWeek.map((w) => workoutState(w, today))
  const done = inWeek.filter((w) => w.status === 'feito')
  const planSec = inWeek.reduce((a, w) => a + plannedSec(w), 0)
  const doneSec = done.reduce((a, w) => a + doneSecOf(w), 0)
  // km: só corrida (bike e caminhada não somam na quilometragem)
  const doneKm = Math.round(done.filter(isRun).reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0) * 100) / 100
  const cross = done.filter((w) => !isRun(w)).length
  return {
    start,
    end,
    days,
    planned: inWeek.length,
    done: done.length,
    skipped: states.filter((s) => s === 'pulado').length,
    missed: states.filter((s) => s === 'passou').length,
    plannedSec: planSec,
    doneSec,
    cross,
    doneKm,
    complete: inWeek.length > 0 && done.length === inWeek.length
  }
}

/**
 * Semanas seguidas cumpridas (todos os treinos com data feitos), contando para trás a partir da
 * semana passada; a semana atual entra se já estiver completa. Semanas sem treino planejado interrompem.
 */
export function weekStreak(workouts, today) {
  const current = weekStart(today)
  let n = weekSummary(workouts, current, today).complete ? 1 : 0
  let start = addDaysISO(current, -7)
  for (let i = 0; i < 104; i++) {
    const s = weekSummary(workouts, start, today)
    if (!s.complete) break
    n++
    start = addDaysISO(start, -7)
  }
  return n
}

export const DOW_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/**
 * Semana que acabou de fechar: no domingo, a semana atual; na segunda, a passada. Só se houve treino feito.
 * { start, done, planned, doneSec, doneKm, cross, complete, streak } ou null.
 */
export function weekRecap(workouts, today) {
  const dow = (parseISODate(today).getDay() + 6) % 7
  if (dow !== 6 && dow !== 0) return null
  const start = dow === 6 ? weekStart(today) : addDaysISO(weekStart(today), -7)
  const s = weekSummary(workouts, start, today)
  if (!s.done) return null
  return { start, done: s.done, planned: s.planned, doneSec: s.doneSec, doneKm: s.doneKm, cross: s.cross, complete: s.complete, streak: weekStreak(workouts, today) }
}

/**
 * Carga da semana × semanas anteriores (tempo de treino).
 * { thisSec (feito, ou planejado se ainda não terminou), plannedSec, lastSec, avg4Sec, pct (vs semana passada), warn }
 * warn: a semana (planejada ou feita, o que for maior) passa de 10% acima da passada, com pelo menos 5 min a mais.
 */
export function weekLoad(workouts, start, today) {
  const cur = weekSummary(workouts, start, today)
  const prev = [1, 2, 3, 4].map((k) => weekSummary(workouts, addDaysISO(start, -7 * k), today).doneSec)
  const lastSec = prev[0]
  const counted = prev.filter((x) => x > 0)
  const avg4Sec = counted.length ? Math.round(counted.reduce((a, b) => a + b, 0) / counted.length) : 0
  const thisSec = Math.max(cur.doneSec, cur.plannedSec)
  const pct = lastSec > 0 ? Math.round(((thisSec - lastSec) / lastSec) * 100) : null
  return { thisSec, plannedSec: cur.plannedSec, doneSec: cur.doneSec, lastSec, avg4Sec, pct, warn: lastSec > 0 && thisSec > lastSec * 1.1 && thisSec - lastSec >= 300 }
}
