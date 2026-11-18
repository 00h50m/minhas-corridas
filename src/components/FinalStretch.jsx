// Reta final da prova (até 4 semanas antes): linha do tempo, marcar como feito e atalhos.
import { Link, useNavigate } from 'react-router-dom'
import { getState, saveRace, saveWorkout, useStore } from '../services/store.js'
import { useUI } from './ui.jsx'
import { finalStretch, paceWorkout } from '../lib/finalStretch.js'
import { dayLabel, suggestDates } from '../lib/reschedule.js'
import { addDaysISO, daysBetween, todayISO } from '../lib/dates.js'

const STATE = { feito: '✓', hoje: '●', passou: '!', futuro: '○' }

export default function FinalStretch({ race }) {
  const { workouts } = useStore()
  const { notify } = useUI()
  const nav = useNavigate()
  const today = todayISO()
  const items = finalStretch(race, { workouts, today })
  const done = items.filter((i) => i.done).length
  const toggle = (id) => {
    const set = new Set(race.stretchDone ?? [])
    set.has(id) ? set.delete(id) : set.add(id)
    saveRace({ ...race, stretchDone: [...set] })
  }
  const createPace = () => {
    const target = addDaysISO(race.date, -18) > today ? addDaysISO(race.date, -18) : today
    const s = getState()
    const draft = { ...paceWorkout(race, addDaysISO(target, -1)), id: '__novo' }
    const best = suggestDates(draft, { workouts: s.workouts, races: s.races, goals: s.goals, today }).find((o) => o.date <= addDaysISO(race.date, -9))
    const saved = saveWorkout({ ...paceWorkout(race, best?.date ?? target), id: undefined })
    notify(`Treino criado para ${dayLabel(saved.date)}`)
    nav(`/treinos/${saved.id}`)
  }
  const days = daysBetween(today, race.date)
  return (
    <div className="card stretch" data-testid="final-stretch">
      <div className="st-head">
        <b>{days > 0 ? `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}` : days === 0 ? 'É hoje!' : 'Depois da prova'}</b>
        <span className="muted small">{done} de {items.length} feitos</span>
      </div>
      <ol className="st-list">
        {items.map((it) => (
          <li key={it.id} className={`st-item st-${it.state}`} data-testid="stretch-item">
            <button type="button" className="st-mark" onClick={() => !it.auto && toggle(it.id)} disabled={it.auto} aria-pressed={it.done} aria-label={it.done ? `Desmarcar “${it.title}”` : `Marcar “${it.title}” como feito`} title={it.auto ? 'Marcado pelo app' : undefined}>{STATE[it.state]}</button>
            <div className="st-body">
              <div className="st-when small">{it.date === today ? 'hoje' : dayLabel(it.date)}{it.auto && <span className="muted"> · o app marcou</span>}</div>
              <b>{it.title}</b>
              <div className="small muted">{it.desc}</div>
              {it.note && <div className="small">{it.note}</div>}
              {it.warn && <div className="small st-warn" data-testid="stretch-warn">⚠️ {it.warn}</div>}
              {(it.link || it.action) && (
                <div className="btn-inline" style={{ marginTop: 4 }}>
                  {it.link && <Link to={it.link} className="link-btn">{it.linkLabel}</Link>}
                  {it.action === 'criar-ritmo' && !it.done && <button type="button" className="link-btn" onClick={createPace} data-testid="stretch-create-pace">+ Criar este treino</button>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="note" style={{ marginBottom: 0 }}>Roteiro de partida: toque no círculo para marcar. Alguns itens o app marca sozinho (treino no ritmo feito, kit no checklist, logística, resultado). Não muda seus treinos.</p>
    </div>
  )
}
