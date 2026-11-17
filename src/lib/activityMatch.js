// Atividade do relógio → treino planejado: o do mesmo dia (se for um só) ou candidatos próximos para escolher.
import { daysBetween, toISODate } from './dates.js'
import { normalizeWorkout } from './workout.js'

/** Esporte do arquivo do relógio → tipo de atividade do app. */
export function sportFromFile(a) {
  const s = String(a?.sport ?? '').toLowerCase()
  if (/cycl|bik|ride/.test(s)) return 'bike'
  if (/walk|hik/.test(s)) return 'caminhada'
  if (/swim/.test(s)) return 'natacao'
  return 'corrida'
}

/** Resultado do treino a partir do resumo da atividade (readActivityFile). */
export function resultFrom(a, prev = null) {
  return { distanceKm: a.distanceKm, elapsedSec: a.elapsedSec, avgHr: a.avgHr, fileName: a.fileName, laps: a.laps ?? [], track: a.track ?? null, effort: prev?.effort ?? null, notes: prev?.notes ?? '' }
}

/** Data local da atividade (AAAA-MM-DD). */
export const activityDate = (a) => toISODate(new Date(a.startTime))

/**
 * { auto: treino | null, candidates: [treinos] }
 * auto: único treino ainda sem resultado no mesmo dia. candidates: sem resultado, até 3 dias de diferença, mais perto primeiro.
 */
export function matchActivity(workouts, date, sport = 'corrida') {
  const open = workouts.filter((w) => w.date && w.status !== 'feito' && !w.result && (w.sport ?? 'corrida') === sport)
  const sameDay = open.filter((w) => w.date === date)
  const candidates = open
    .map((w) => ({ w, d: Math.abs(daysBetween(date, w.date)) }))
    .filter((x) => x.d <= 3)
    .sort((a, b) => a.d - b.d || (a.w.date < b.w.date ? -1 : 1))
    .map((x) => x.w)
  return { auto: sameDay.length === 1 ? sameDay[0] : null, candidates }
}

/** Atividade já importada (mesmo arquivo e mesma data)? */
export function alreadyImported(workouts, a) {
  const date = activityDate(a)
  return workouts.find((w) => w.result?.fileName === a.fileName && w.date === date && Math.abs((w.result.elapsedSec ?? 0) - a.elapsedSec) < 5) ?? null
}

/** Treino avulso (não planejado) a partir da atividade. */
export function freeWorkout(a) {
  const date = activityDate(a)
  const min = Math.max(1, Math.round(a.elapsedSec / 60))
  const sport = sportFromFile(a)
  const label = { corrida: 'Corrida', bike: 'Bike', caminhada: 'Caminhada', natacao: 'Natação' }[sport]
  return {
    ...normalizeWorkout({ name: `${label} ${date.slice(8, 10)}/${date.slice(5, 7)}`, date, status: 'feito', sport, plannedMin: min, items: [{ type: 'corrida', duration: { kind: 'time', value: min * 60 } }] }),
    status: 'feito',
    result: resultFrom(a)
  }
}
