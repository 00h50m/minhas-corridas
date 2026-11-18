// Atividade do relógio → treino planejado: o do mesmo dia (se for um só) ou candidatos próximos para escolher.
import { daysBetween, toISODate } from './dates.js'
import { normalizeWorkout, sportOf } from './workout.js'

/** Esporte do arquivo do relógio → tipo de atividade do app. */
export function sportFromFile(a) {
  if (a?.appSport) return a.appSport
  const s = String(a?.sport ?? '').toLowerCase()
  if (/cycl|bik|ride/.test(s)) return 'bike'
  if (/walk|hik/.test(s)) return 'caminhada'
  if (/swim/.test(s)) return 'natacao'
  if (/train|strength|fitness/.test(s)) return 'academia'
  return 'corrida'
}

/** Resultado do treino a partir do resumo da atividade (readActivityFile). */
export function resultFrom(a, prev = null) {
  return {
    distanceKm: a.distanceKm, elapsedSec: a.elapsedSec, avgHr: a.avgHr, maxHr: a.maxHr ?? null, fileName: a.fileName, laps: a.laps ?? [], splits: a.splits ?? [],
    track: a.track ?? null, hrHist: a.hrHist ?? null, elevGainM: a.elevGainM ?? null, calories: a.calories ?? null, aerobicTE: a.aerobicTE ?? null,
    anaerobicTE: a.anaerobicTE ?? null, cadence: a.cadence ?? null, sets: a.sets ?? [], garminId: a.garminId ?? prev?.garminId ?? null,
    effort: prev?.effort ?? null, notes: prev?.notes ?? ''
  }
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
  if (a.garminId) { const g = workouts.find((w) => w.result?.garminId === a.garminId); if (g) return g }
  return workouts.find((w) => w.result?.fileName === a.fileName && w.date === date && Math.abs((w.result.elapsedSec ?? 0) - a.elapsedSec) < 5) ?? null
}

/** Treino avulso (não planejado) a partir da atividade. */
export function freeWorkout(a) {
  const date = activityDate(a)
  const min = Math.max(1, Math.round(a.elapsedSec / 60))
  const sport = sportFromFile(a)
  const label = sport === 'corrida' ? 'Corrida' : sportOf({ sport }).label.split(' /')[0]
  return {
    ...normalizeWorkout({ name: (a.title || `${label} ${date.slice(8, 10)}/${date.slice(5, 7)}`).slice(0, 60), date, status: 'feito', sport, plannedMin: min, items: [{ type: 'corrida', duration: { kind: 'time', value: min * 60 } }] }),
    status: 'feito',
    result: resultFrom(a)
  }
}
