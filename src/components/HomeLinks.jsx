// Cards do Início que dependem do passaporte (conquistas, mapa) e da semana de treinos.
// Ficam num arquivo à parte para não pesar a abertura do app.
import { Link } from 'react-router-dom'
import { passport } from '../lib/passport.js'
import { weekRecap } from '../lib/trainingWeek.js'
import { finalStretch, showStretch, stretchToday } from '../lib/finalStretch.js'
import { dayLabel } from '../lib/reschedule.js'
import { daysBetween } from '../lib/dates.js'

export default function HomeLinks({ races, workouts, goals, today }) {
  return (
    <>
      <StretchCard races={races} workouts={workouts} today={today} />
      <WeekRecapCard workouts={workouts} today={today} />
      <PassportLink races={races} workouts={workouts} goals={goals} today={today} />
    </>
  )
}

/** Domingo e segunda: a semana que fechou, com atalho para o story. */
function WeekRecapCard({ workouts, today }) {
  const r = weekRecap(workouts, today)
  if (!r) return null
  return (
    <Link to={`/stories?modelo=semana&semana=${r.start}`} className="card decide-link week-recap" data-testid="week-recap" style={{ marginTop: 16 }}>
      <span style={{ fontSize: 26 }} aria-hidden="true">{r.complete ? '🔥' : '📲'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b>{r.complete ? `Semana fechada: ${r.done} de ${r.planned} treinos` : `Sua semana: ${r.done} de ${r.planned} treinos`}</b><br /><span className="muted small">{r.streak >= 2 ? `${r.streak} semanas seguidas · ` : ''}Postar no story</span></span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}

function PassportLink({ races, workouts, goals, today }) {
  const p = passport({ races, workouts, goals, today })
  const fresh = p.badges.find((b) => b.isNew)
  return (
    <Link to="/passaporte" className="card decide-link" data-testid="passport-link" style={{ marginTop: 16 }}>
      <span style={{ fontSize: 26 }} aria-hidden="true">{fresh ? fresh.icon : '🏅'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b>Passaporte de corredora</b><br /><span className="muted small">{fresh ? <>Nova: <b>{fresh.title}</b></> : `${p.badges.length} ${p.badges.length === 1 ? 'conquista' : 'conquistas'} · mapa · provas perto`}</span></span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}


/** Reta final da próxima prova inscrita: o item de hoje (ou o próximo). */
function StretchCard({ races, workouts, today }) {
  const race = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  if (!race || !showStretch(race, today)) return null
  const items = finalStretch(race, { workouts, today })
  const it = stretchToday(items, today)
  if (!it) return null
  const d = daysBetween(today, race.date)
  const late = items.filter((i) => i.state === 'passou').length
  return (
    <Link to={`/corridas/${race.id}`} className="card decide-link" data-testid="stretch-home" style={{ marginTop: 16 }}>
      <span style={{ fontSize: 26 }} aria-hidden="true">🏁</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>Reta final · {race.name}</b>{' '}<span className="muted small">({d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `faltam ${d} dias`})</span><br />
        <span className="small">{it.date === today ? 'Hoje' : dayLabel(it.date)}: {it.title}</span>
        {late > 0 && <span className="small muted"> · {late} {late === 1 ? 'item pendente' : 'itens pendentes'}</span>}
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}
