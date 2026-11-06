// Previsão de tempo para uma distância a partir das provas registradas (fórmula de Riegel).
// É estimativa: depende de treino, percurso e clima. Não prescreve treinos.
import { byDateAsc, distanceKey } from './stats.js'
import { addDaysISO, todayISO } from './dates.js'

export const RIEGEL_EXP = 1.06

export function riegel(timeSec, fromKm, toKm, exp = RIEGEL_EXP) {
  return timeSec * Math.pow(toKm / fromKm, exp)
}

/**
 * Para uma distância-alvo: { estimate, low, high, sources: [{ race, km, time, predicted, ratio, quality }] }
 * ou null se não houver resultado utilizável.
 * Usa resultados oficiais (e registros pessoais, se não houver oficiais) dos últimos 2 anos,
 * de 3 km para cima, e só extrapola até 4,5x a distância (para cima ou para baixo).
 */
export function predictTime(races, targetKm, today = todayISO(), { excludeId = null } = {}) {
  if (!(targetKm > 0)) return null
  const since = addDaysISO(today, -730)
  const done = races.filter(
    (r) => r.id !== excludeId && r.status === 'concluida' && r.date && r.date <= today && r.date >= since && r.result?.netTime > 0 && r.result.officialDistanceKm >= 3
  )
  const official = done.filter((r) => r.result.isOfficial)
  const pool = (official.length ? official : done)
    .map((r) => {
      const km = r.result.officialDistanceKm
      const ratio = Math.max(targetKm / km, km / targetKm)
      return { race: r, km, time: r.result.netTime, predicted: Math.round(riegel(r.result.netTime, km, targetKm)), ratio, quality: distanceKey(km) === distanceKey(targetKm) ? 'mesma' : ratio <= 2.5 ? 'boa' : 'aproximada', isOfficial: r.result.isOfficial }
    })
    .filter((s) => s.ratio <= 4.5)
  if (!pool.length) return null
  // Mais confiável primeiro: distância mais próxima (em faixas) e, dentro da faixa, a mais recente.
  const band = (s) => (s.quality === 'mesma' ? 0 : s.quality === 'boa' ? 1 : 2)
  pool.sort((a, b) => band(a) - band(b) || -byDateAsc(a.race, b.race))
  const sources = pool.slice(0, 3)
  // Na faixa principal, vale o melhor resultado recente (a forma atual), não só o último.
  const top = sources.filter((s) => band(s) === band(sources[0]))
  const estimate = Math.min(...top.map((s) => s.predicted))
  const all = sources.map((s) => s.predicted)
  return { estimate, low: Math.min(...all), high: Math.max(...all), sources, quality: sources[0].quality }
}

/** Arredonda uma meta para baixo em passos amigáveis (15 s até 1 h; 30 s acima). */
export function roundTarget(sec) {
  const step = sec >= 3600 ? 30 : 15
  return Math.floor(sec / step) * step
}
