// Importação automática do Garmin (API pessoal, só leitura): o que fazer com cada atividade da lista.
// Sem rede aqui: a busca e o download ficam em services/garmin.js.
import { addDaysISO, toISODate } from './dates.js'

/** Tipo da Garmin (activityType.typeKey) → atividade do app. */
export function sportFromGarmin(type) {
  const t = String(type ?? '').toLowerCase()
  if (/run/.test(t)) return 'corrida' // running, trail_running, treadmill_running, track_running…
  if (/cycl|bik|ride|spinning/.test(t)) return 'bike'
  if (/swim/.test(t)) return 'natacao'
  if (/walk|hik/.test(t)) return 'caminhada'
  if (/strength|weight|hiit|cardio|crossfit|functional/.test(t)) return 'academia'
  if (/yoga|pilates|stretch|breath|mobility/.test(t)) return 'alongamento'
  return 'outro'
}

/** Esportes em que vale baixar o arquivo (voltas, parciais e traçado). */
export const WITH_FILE = new Set(['corrida', 'bike', 'caminhada'])

/** Data local da atividade da lista (AAAA-MM-DD). */
export const garminDate = (g) => (g.start ? g.start.slice(0, 10) : g.startGmt ? toISODate(new Date(`${g.startGmt.replace(' ', 'T')}Z`)) : null)

/** Período a buscar: desde 2 dias antes da última busca (atividades sincronizadas tarde), no máximo 30 dias. */
export function syncWindow(lastSync, today) {
  const floor = addDaysISO(today, -30)
  const from = lastSync ? addDaysISO(String(lastSync).slice(0, 10), -2) : addDaysISO(today, -14)
  return { start: from < floor ? floor : from, end: today }
}

/** Resumo no formato de readActivityFile a partir só da lista (academia, ioga, ou se o arquivo falhar). */
export function summaryFromList(g) {
  const startTime = g.startGmt ? new Date(`${g.startGmt.replace(' ', 'T')}Z`).toISOString() : new Date(`${(g.start ?? '').replace(' ', 'T')}`).toISOString()
  return {
    source: 'garmin',
    fileName: `garmin-${g.id}`,
    sport: g.type,
    startTime,
    distanceKm: g.distanceKm ?? 0,
    elapsedSec: g.sec ?? 0,
    avgHr: g.avgHr ?? null,
    maxHr: null,
    elevGainM: null,
    splits: [],
    laps: [],
    track: null
  }
}

/** Corrida no dia de uma prova inscrita ou concluída: fica para o resultado da prova, não vira treino. */
export function raceOnDay(races, date, sport) {
  if (sport !== 'corrida' || !date) return null
  return races.find((r) => r.date === date && ['inscrita', 'concluida'].includes(r.status)) ?? null
}

/**
 * Separa a lista da Garmin: [{ g, sport, date, kind: 'novo' | 'prova', race? }]. Ignora as já importadas
 * (garminId num treino ou na lista local) e as sem data. Mais antigas primeiro.
 */
export function planGarmin(list, { workouts = [], races = [], done = [] }) {
  const seen = new Set([...done, ...workouts.map((w) => w.result?.garminId).filter(Boolean)])
  return list
    .filter((g) => g && g.id && !seen.has(g.id))
    .map((g) => {
      const sport = sportFromGarmin(g.type)
      const date = garminDate(g)
      const race = raceOnDay(races, date, sport)
      return { g, sport, date, kind: race ? 'prova' : 'novo', race }
    })
    .filter((x) => x.date)
    .sort((a, b) => ((a.g.startGmt ?? a.g.start ?? '') < (b.g.startGmt ?? b.g.start ?? '') ? -1 : 1))
}
