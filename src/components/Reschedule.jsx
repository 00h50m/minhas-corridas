// Painel para remanejar um treino: dias sugeridos pela regra (com os avisos) ou outro dia à escolha.
import { useState } from 'react'
import { Sheet, useUI } from './ui.jsx'
import { getState, saveWorkout } from '../services/store.js'
import { dayLabel, firstCandidate, moveWorkout, suggestDates } from '../lib/reschedule.js'
import { todayISO } from '../lib/dates.js'

export default function Reschedule({ w, onClose, onMoved }) {
  const { notify } = useUI()
  const today = todayISO()
  const { workouts, races, goals } = getState()
  const opts = suggestDates(w, { workouts, races, goals, today })
  const [custom, setCustom] = useState('')
  const min = firstCandidate(w, today)
  const move = (to) => {
    saveWorkout(moveWorkout(w, to, today))
    notify(`“${w.name}” remanejado para ${dayLabel(to)}`)
    onMoved?.(to)
    onClose()
  }
  return (
    <Sheet title="Remanejar treino" onClose={onClose}>
      <div data-testid="reschedule">
        <p className="small" style={{ marginTop: 0 }}><b>{w.name}</b>{w.date ? <> · era {dayLabel(w.date)}</> : null}</p>
        {opts.length ? (
          <div className="rs-opts">
            {opts.slice(0, 3).map((o, i) => (
              <button key={o.date} type="button" className={`btn btn-block rs-opt${i === 0 ? ' btn-primary' : ''}`} onClick={() => move(o.date)} data-testid="rs-opt">
                <span><b>{dayLabel(o.date)}</b>{i === 0 ? ' · sugerido' : ''}</span>
                <span className="rs-why">{o.notes.length ? o.notes.join(' · ') : 'sem conflito: dia livre, com descanso entre as corridas'}</span>
              </button>
            ))}
          </div>
        ) : <p className="small muted">Nenhum dia livre nos próximos 7 dias pela regra. Escolha outro dia abaixo.</p>}
        <div className="rs-custom">
          <label className="small" htmlFor="rs-date">Outro dia</label>
          <input id="rs-date" className="input" type="date" min={min} value={custom} onChange={(e) => setCustom(e.target.value)} data-testid="rs-date" />
          <button type="button" className="btn" disabled={!custom || custom < min} onClick={() => move(custom)} data-testid="rs-custom">Mover</button>
        </div>
        <p className="note">A regra evita outra corrida no mesmo dia, prefere um dia de descanso entre corridas, não usa o dia de prova (e avisa nos 2 dias antes), prefere a mesma semana e respeita o prazo do objetivo. Se você já mandou este treino para o Garmin ou o Intervals.icu, mude a data lá também.</p>
      </div>
    </Sheet>
  )
}
