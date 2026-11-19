// Cards do Início que dependem do passaporte (conquistas, mapa) e da semana de treinos.
// Ficam num arquivo à parte para não pesar a abertura do app.
import { IconDrop, IconFlag, IconFlame, IconMedal, IconStory } from './Icons.jsx'
import { Link } from 'react-router-dom'
import { passport } from '../lib/passport.js'
import { weekRecap } from '../lib/trainingWeek.js'
import { finalStretch, showStretch, stretchToday } from '../lib/finalStretch.js'
import { dayLabel } from '../lib/reschedule.js'
import { daysBetween } from '../lib/dates.js'
import { useCycle, saveCycle } from '../services/cycle.js'
import { dayOfCycle, endPeriod, ongoing, phaseLabel, predictNext, startPeriod } from '../lib/cycle.js'
import { useUI } from './ui.jsx'

export default function HomeLinks({ races, workouts, goals, today }) {
  return (
    <>
      <StretchCard races={races} workouts={workouts} today={today} />
      <CycleCard today={today} />
      <WeekRecapCard workouts={workouts} today={today} />
      <div className="home-tiles">
        <PassportLink races={races} workouts={workouts} goals={goals} today={today} />
        <Link to="/stories" className="card home-tile" data-testid="stories-link">
          <IconStory />
          <b>Stories</b>
          <span className="muted small">semana, mês, provas e conquistas</span>
        </Link>
      </div>
    </>
  )
}

/** Domingo e segunda: a semana que fechou, com atalho para o story. */
function WeekRecapCard({ workouts, today }) {
  const r = weekRecap(workouts, today)
  if (!r) return null
  return (
    <Link to={`/stories?modelo=semana&semana=${r.start}`} className="card decide-link week-recap" data-testid="week-recap" style={{ marginTop: 16 }}>
      {r.complete ? <IconFlame /> : <IconStory />}
      <span style={{ flex: 1, minWidth: 0 }}><b>{r.complete ? `Semana fechada: ${r.done} de ${r.planned} treinos` : `Sua semana: ${r.done} de ${r.planned} treinos`}</b><br /><span className="muted small">{r.streak >= 2 ? `${r.streak} semanas seguidas · ` : ''}Postar no story</span></span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}

function PassportLink({ races, workouts, goals, today }) {
  const p = passport({ races, workouts, goals, today })
  const fresh = p.badges.find((b) => b.isNew)
  return (
    <Link to="/passaporte" className="card home-tile" data-testid="passport-link">
      <IconMedal />
      <b>Passaporte</b>
      <span className="muted small">{fresh ? <>Nova: <b>{fresh.title}</b></> : `${p.badges.length} ${p.badges.length === 1 ? 'conquista' : 'conquistas'}`}</span>
    </Link>
  )
}


/** Reta final da próxima prova inscrita: o item de hoje (ou o próximo). */
function StretchCard({ races, workouts, today }) {
  const race = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  if (!race || !showStretch(race, today)) return null
  const cycle = useCycle()
  const items = finalStretch(race, { workouts, today, cycle })
  const it = stretchToday(items, today)
  if (!it) return null
  const d = daysBetween(today, race.date)
  const late = items.filter((i) => i.state === 'passou').length
  return (
    <Link to={`/corridas/${race.id}`} className="card decide-link" data-testid="stretch-home" style={{ marginTop: 16 }}>
      <IconFlag />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>Reta final · {race.name}</b><br />
        <span className="muted small">{d === 0 ? 'É hoje' : d === 1 ? 'Amanhã' : `Faltam ${d} dias`}{late > 0 ? ` · ${late} ${late === 1 ? 'item pendente' : 'itens pendentes'}` : ''}</span><br />
        <span className="small">{it.date === today ? 'Hoje' : dayLabel(it.date)}: {it.title}</span>
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}

/** Ciclo menstrual (se ativado): dia do ciclo, próxima prevista e o registro em 1 toque. */
function CycleCard({ today }) {
  const c = useCycle()
  const { notify } = useUI()
  if (!c.enabled) return null
  const n = dayOfCycle(c, today)
  const next = predictNext(c, today)
  const now = ongoing(c, today)
  const phase = phaseLabel(c, today, today)
  const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return (
    <div className="card cy-home" data-testid="cycle-home" style={{ marginTop: 16 }}>
      <Link to="/ciclo" className="cy-home-link">
        <IconDrop />
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{n ? `Dia ${n} do ciclo` : 'Ciclo'}</b>{phase && <span className="muted small"> · {phase}</span>}<br />
          <span className="small muted">{next ? `Próxima: ${next.confidence === 'boa' ? `~${br(next.start)}` : `${br(next.from)}–${br(next.to)}`}` : 'Registre a última menstruação'}</span>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
      <div className="btn-inline" style={{ marginTop: 6 }}>
        {now
          ? <button type="button" className="link-btn" onClick={() => { saveCycle(endPeriod(c, today)); notify('Fim da menstruação registrado') }} data-testid="cycle-home-end">Terminou hoje</button>
          : <button type="button" className="link-btn" onClick={() => { saveCycle(startPeriod(c, today)); notify('Início da menstruação registrado') }} data-testid="cycle-home-start">Menstruação começou hoje</button>}
        <Link to="/ciclo" className="link-btn muted-btn">Como está hoje</Link>
      </div>
    </div>
  )
}
