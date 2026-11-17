// Cards do Início que dependem do passaporte (conquistas, mapa) e da semana de treinos.
// Ficam num arquivo à parte para não pesar a abertura do app.
import { Link } from 'react-router-dom'
import { passport } from '../lib/passport.js'
import { weekRecap } from '../lib/trainingWeek.js'

export default function HomeLinks({ races, workouts, goals, today }) {
  return (
    <>
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

