// Avisos de treino da rodada diária (de manhã): o treino de hoje, o de ontem que ficou sem marcar e o
// item do dia da reta final. Só o servidor usa (pushJob.js), para não pesar a abertura do app.
import { addDaysISO, daysBetween } from './dates.js'
import { fmtSec, plannedSec, workoutLine } from './workout.js'
import { finalStretch, showStretch } from './finalStretch.js'

/** prefs: { treino, reta } (normalizePushPrefs). Cada aviso tem `key` única para não repetir. */
export function workoutPushes(workouts = [], races = [], today, prefs = { treino: true, reta: true }) {
  const out = []
  if (prefs.treino) {
    const todays = workouts.filter((w) => w.status === 'planejado' && w.date === today)
    for (const w of todays.slice(0, 2)) {
      const sec = plannedSec(w)
      out.push({ key: `treino:${w.id}:${today}`, type: 'treino', raceId: null, url: `/treinos/${w.id}`, title: `Treino de hoje: ${w.name}`, body: `${workoutLine(w)}${sec ? ` · ≈ ${fmtSec(sec)}` : ''}` })
    }
    const yest = addDaysISO(today, -1)
    const missed = workouts.filter((w) => w.status === 'planejado' && w.date === yest)
    if (missed.length) {
      out.push({
        key: `treino-passou:${missed.map((w) => w.id).join(',')}:${yest}`,
        type: 'treino', raceId: null, url: missed.length === 1 ? `/treinos/${missed[0].id}` : '/treinos',
        title: missed.length === 1 ? `Ontem: “${missed[0].name}” ficou sem marcar` : `Ontem: ${missed.length} treinos ficaram sem marcar`,
        body: 'Toque para marcar como feito, “não fiz” ou remanejar para outro dia.'
      })
    }
  }
  if (prefs.reta) {
    const race = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
    if (race && showStretch(race, today)) {
      const items = finalStretch(race, { workouts, today }).filter((i) => i.date === today && !i.done && !['cafe', 'dia'].includes(i.id))
      if (items.length) {
        const d = daysBetween(today, race.date)
        out.push({
          key: `reta:${race.id}:${today}`, type: 'reta', raceId: race.id, url: `/corridas/${race.id}`,
          title: `Reta final · ${race.name} (${d === 1 ? 'amanhã' : `faltam ${d} dias`})`,
          body: items.map((i) => (i.warn ? `${i.title} — ${i.warn}` : i.title)).join('\n')
        })
      }
    }
  }
  return out
}
