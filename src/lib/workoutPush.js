// Avisos de treino da rodada diária (de manhã): o treino de hoje, o de ontem que ficou sem marcar e o
// item do dia da reta final. Só o servidor usa (pushJob.js), para não pesar a abertura do app.
import { addDaysISO, daysBetween } from './dates.js'
import { fmtSec, plannedSec, workoutLine } from './workout.js'
import { finalStretch, showStretch } from './finalStretch.js'
import { weekRecap } from './trainingWeek.js'

/** prefs: { treino, reta } (normalizePushPrefs). Cada aviso tem `key` única para não repetir. */
export function workoutPushes(workouts = [], races = [], today, prefs = { treino: true, reta: true }) {
  const out = []
  if (prefs.treino) {
    const todays = workouts.filter((w) => w.status === 'planejado' && w.date === today)
    for (const w of todays.slice(0, 2)) {
      const sec = plannedSec(w)
      out.push({ key: `treino:${w.id}:${today}`, type: 'treino', raceId: null, url: `/treinos/${w.id}`, title: `Treino de hoje: ${w.name}`, body: `${workoutLine(w)}${sec ? ` · cerca de ${fmtSec(sec)}` : ''}` })
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

/**
 * Rodada da noite (20h): o treino de hoje que ainda está como planejado (“Fez?”, com os botões Fiz e
 * Remanejar onde o celular mostra botões) e, no domingo, como foi a semana, com o atalho para o story.
 * A chave do “Fez?” é a mesma do aviso “ficou sem marcar” da manhã seguinte: só um dos dois chega.
 */
export function eveningPushes(workouts = [], today, prefs = { treino: true, noite: true }) {
  const out = []
  if (!prefs.treino) return out
  const pending = workouts.filter((w) => w.status === 'planejado' && w.date === today)
  if (prefs.noite !== false && pending.length) {
    const one = pending.length === 1 ? pending[0] : null
    out.push({
      key: `treino-passou:${pending.map((w) => w.id).join(',')}:${today}`,
      type: 'treino', raceId: null,
      url: one ? `/treinos/${one.id}` : '/treinos',
      title: one ? 'Fez o treino de hoje?' : `Fez os ${pending.length} treinos de hoje?`,
      body: one ? `“${one.name}” ainda está como planejado. Marque como feito, “não fiz” ou remaneje.` : 'Ainda estão como planejados. Toque para marcar ou remanejar.',
      actions: one ? [{ action: 'feito', title: 'Fiz', url: `/treinos/${one.id}?marcar=feito` }, { action: 'remanejar', title: 'Remanejar', url: `/treinos/${one.id}?remanejar=1` }] : []
    })
  }
  const [y, m, d] = today.split('-').map(Number)
  if (new Date(y, m - 1, d).getDay() === 0) {
    const r = weekRecap(workouts, today)
    if (r) {
      const min = Math.round(r.doneSec / 60)
      const time = min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
      out.push({
        key: `treinos-semana:${r.start}`, type: 'semana', raceId: null, url: `/stories?modelo=semana&semana=${r.start}`,
        title: r.complete ? `Semana fechada: ${r.done} de ${r.planned} treinos` : `Sua semana: ${r.done} de ${r.planned} treinos`,
        body: `${time} de treino${r.doneKm ? ` · ${String(r.doneKm).replace('.', ',')} km` : ''}${r.streak >= 2 ? ` · ${r.streak} semanas seguidas` : ''}. Toque para postar no story.`
      })
    }
  }
  return out
}
