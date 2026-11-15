// Semana de treinos (segunda a domingo): planejado × feito, tempo e km, e sequência de semanas cumpridas.
import { addDaysISO, parseISODate, toISODate } from './dates.js'
import { estimate } from './workout.js'

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
  const plannedSec = inWeek.reduce((a, w) => a + estimate(w.items).sec, 0)
  const doneSec = done.reduce((a, w) => a + (w.result?.elapsedSec ?? estimate(w.items).sec), 0)
  const doneKm = Math.round(done.reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0) * 100) / 100
  return {
    start,
    end,
    days,
    planned: inWeek.length,
    done: done.length,
    skipped: states.filter((s) => s === 'pulado').length,
    missed: states.filter((s) => s === 'passou').length,
    plannedSec,
    doneSec,
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
