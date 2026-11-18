// Como você chega ao treino: sono, body battery e FC de repouso do Garmin, comparados com o seu normal
// (últimos 14 dias). Só informativo: o app não muda nem prescreve treinos.
import { addDaysISO } from './dates.js'

/** 25200 → "7h00"; 21900 → "6h05". */
export function fmtSleep(sec) {
  if (!(sec > 0)) return null
  const m = Math.round(sec / 60)
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/**
 * days: { 'AAAA-MM-DD': { sleepSec, sleepScore, bbWake, bbHigh, rhr } } (a noite que termina na manhã do dia).
 * Retorna null sem dados do dia; senão { date, sleep, sleepScore, bb, bbLabel, rhr, signals, level, text, parts }.
 */
export function readiness(days, date) {
  const d = days?.[date]
  if (!d) return null
  const prev = Array.from({ length: 14 }, (_, i) => days[addDaysISO(date, -(i + 1))]).filter(Boolean)
  const sleeps = prev.map((x) => x.sleepSec).filter((v) => v > 0)
  const rhrs = prev.map((x) => x.rhr).filter((v) => v > 0)
  const sleepAvg = sleeps.length >= 5 ? avg(sleeps) : null
  const rhrAvg = rhrs.length >= 5 ? avg(rhrs) : null
  const bb = d.bbWake ?? d.bbHigh ?? null
  const bbLabel = d.bbWake != null ? 'ao acordar' : d.bbHigh != null ? 'pico do dia' : null
  const signals = []
  if (d.sleepSec > 0 && d.sleepSec < 6 * 3600) signals.push('dormiu menos de 6 h')
  else if (sleepAvg && d.sleepSec > 0 && d.sleepSec <= sleepAvg - 3600) signals.push(`dormiu 1 h a menos que o seu normal (${fmtSleep(sleepAvg)})`)
  if (d.sleepScore != null && d.sleepScore < 60) signals.push(`nota do sono ${d.sleepScore}`)
  if (bb != null && bb < 35) signals.push(`body battery ${bb}`)
  if (rhrAvg && d.rhr > 0 && d.rhr - rhrAvg >= 5) signals.push(`FC de repouso ${d.rhr} (normal ${Math.round(rhrAvg)})`)
  const good = (bb != null && bb >= 60) || d.sleepSec >= 7 * 3600 || (d.sleepScore ?? 0) >= 80
  const level = signals.length >= 2 ? 'cansaco' : signals.length === 1 ? 'atencao' : good ? 'bom' : 'ok'
  const text = level === 'cansaco'
    ? `Sinais de cansaço: ${signals.slice(0, -1).join(', ')} e ${signals.at(-1)}. Ouça o corpo: ir mais leve hoje é uma opção.`
    : level === 'atencao'
      ? `Atenção: ${signals[0]}. Se sentir cansaço, dá para ir mais leve.`
      : level === 'bom' ? 'Boa recuperação para treinar.' : 'Dentro do seu normal.'
  const parts = [
    d.sleepSec > 0 && `sono ${fmtSleep(d.sleepSec)}${d.sleepScore != null ? ` (nota ${d.sleepScore})` : ''}`,
    bb != null && `body battery ${bb}${bbLabel === 'ao acordar' ? ' ao acordar' : ''}`,
    d.rhr > 0 && `FC repouso ${d.rhr}`
  ].filter(Boolean)
  return { date, sleep: d.sleepSec ?? null, sleepScore: d.sleepScore ?? null, bb, bbLabel, rhr: d.rhr ?? null, signals, level, text, parts }
}
