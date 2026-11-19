// Carga da semana somando corrida, força e o resto: minutos × intensidade.
// Intensidade (nesta ordem): tempo em cada zona de FC do arquivo (Z1 = 1 … Z5 = 5, como o TRIMP de
// Edwards) → zona da FC média → esforço anotado (1–10) → um peso padrão por atividade. Planejados entram
// com o peso padrão. É uma régua para comparar a semana com as suas semanas, não uma prescrição.
import { addDaysISO } from './dates.js'
import { timeInZones, zoneOf } from './hrZones.js'
import { plannedSec } from './workout.js'
import { weekSummary } from './trainingWeek.js'

const DEFAULT = { corrida: 2.5, academia: 2, bike: 2, natacao: 2.5, caminhada: 1.5, alongamento: 1, outro: 2 }
const GROUP = { corrida: 'corrida', academia: 'forca' }

/** Pontos de carga de uma atividade (feita: pelo relógio; planejada: estimativa). */
export function activityLoad(w, zones = null) {
  const sport = w.sport ?? 'corrida'
  const base = DEFAULT[sport] ?? 2
  const r = w.status === 'feito' ? w.result : null
  const min = (r?.elapsedSec > 0 ? r.elapsedSec : plannedSec(w)) / 60
  if (!(min > 0)) return 0
  if (r && zones) {
    const t = r.hrHist ? timeInZones(r.hrHist, zones) : null
    if (t) return Math.round(t.sec.reduce((a, s, i) => a + (s / 60) * (i + 1), 0) * (min * 60 / t.total))
    const z = zoneOf(r.avgHr, zones)
    if (z) return Math.round(min * z)
  }
  if (r?.effort) return Math.round(min * (r.effort / 2))
  return Math.round(min * base)
}

const sumLoad = (list, zones) => list.reduce((a, w) => a + activityLoad(w, zones), 0)

/**
 * Carga da semana que começa em `start` × média das 4 semanas anteriores (só as que tiveram treino feito).
 * { done, planned (o que falta, planejado), total, avg4, pct, level: 'leve' | 'normal' | 'alta' | null,
 *   parts: { corrida, forca, outras } (feito), weeks (quantas entraram na média) }
 */
export function weekStrain(workouts, start, today, zones = null) {
  const cur = weekSummary(workouts, start, today).days.flatMap((d) => d.workouts)
  const doneList = cur.filter((w) => w.status === 'feito')
  const ahead = cur.filter((w) => w.status === 'planejado' && w.date >= today)
  const parts = { corrida: 0, forca: 0, outras: 0 }
  for (const w of doneList) parts[GROUP[w.sport ?? 'corrida'] ?? 'outras'] += activityLoad(w, zones)
  const done = parts.corrida + parts.forca + parts.outras
  const planned = sumLoad(ahead, zones)
  const prev = [1, 2, 3, 4].map((k) => sumLoad(weekSummary(workouts, addDaysISO(start, -7 * k), today).days.flatMap((d) => d.workouts).filter((w) => w.status === 'feito'), zones)).filter((x) => x > 0)
  const avg4 = prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : 0
  const total = done + planned
  const pct = avg4 > 0 ? Math.round(((total - avg4) / avg4) * 100) : null
  // Alta: 30%+ acima da média e pelo menos 60 pontos (≈ 25 min de corrida) a mais
  const level = avg4 > 0 && prev.length >= 2 ? (total > avg4 * 1.3 && total - avg4 >= 60 ? 'alta' : total < avg4 * 0.7 ? 'leve' : 'normal') : null
  return { done, planned, total, avg4, pct, level, parts, weeks: prev.length }
}
