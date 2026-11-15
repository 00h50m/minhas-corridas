// Plano de treino de um objetivo: os treinos ligados a ele, quanto já foi feito, semana atual e próximo treino.
import { weekStart } from './trainingWeek.js'

/**
 * { total, done, skipped, missed, pct, weeks, week, next, last } ou null se não houver treinos ligados.
 * week: semana atual do plano (1…weeks), contando a partir da semana do primeiro treino.
 */
export function planProgress(g, workouts, today) {
  const list = workouts.filter((w) => w.goalId === g.id).sort((a, b) => ((a.date ?? '9') < (b.date ?? '9') ? -1 : 1))
  if (!list.length) return null
  const done = list.filter((w) => w.status === 'feito').length
  const skipped = list.filter((w) => w.status === 'pulado').length
  const missed = list.filter((w) => w.status === 'planejado' && w.date && w.date < today).length
  const dated = list.filter((w) => w.date)
  const weekKeys = [...new Set(dated.map((w) => weekStart(w.date)))].sort()
  const cur = weekStart(today)
  const idx = weekKeys.findIndex((k) => k >= cur)
  const week = !weekKeys.length ? null : cur < weekKeys[0] ? 0 : idx < 0 ? weekKeys.length + 1 : weekKeys[idx] === cur ? idx + 1 : idx
  const next = list.find((w) => w.status === 'planejado' && (!w.date || w.date >= today)) ?? null
  return { list, total: list.length, done, skipped, missed, pct: done / list.length, weeks: weekKeys.length, week, next, last: dated.at(-1)?.date ?? null }
}
