// Calendário mensal de treinos: cada dia com o ícone de cada atividade (cor pela situação), a prova do
// dia e, no computador, o tempo/distância. Um toque mostra o resumo do dia; no computador, dá para
// arrastar um treino planejado para outro dia (no celular, “Remanejar” no resumo).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { saveWorkout } from '../services/store.js'
import { useUI } from './ui.jsx'
import Reschedule from './Reschedule.jsx'
import { IconChevronL, IconChevronR, IconFlag, IconPlus, IconStory, SportIcon } from './Icons.jsx'
import { byDay, canDrag, cellLabel, dayStats, monthGrid, monthSummary, shiftMonth } from '../lib/monthCal.js'
import { workoutState } from '../lib/trainingWeek.js'
import { dayLabel, moveWorkout } from '../lib/reschedule.js'
import { fmtSec } from '../lib/workout.js'
import { addDaysISO, formatDateBR, monthName } from '../lib/dates.js'
import { weekStrain } from '../lib/load.js'
import { useZones } from './HrZones.jsx'

const memo = {}
const STATE_LABEL = { feito: 'feito', pulado: 'não fiz', passou: 'passou sem marcar', hoje: 'hoje', futuro: 'planejado' }

export default function WorkoutMonth({ workouts, races, today }) {
  const { notify } = useUI()
  const [month, setMonthState] = useState(memo.month ?? today.slice(0, 7))
  const [sel, setSelState] = useState(memo.sel ?? today)
  const [over, setOver] = useState(null)
  const [moving, setMoving] = useState(null)
  const setMonth = (m) => { memo.month = m; setMonthState(m) }
  const setSel = (d) => { memo.sel = d; setSelState(d) }
  const [y, m] = month.split('-').map(Number)
  const days = monthGrid(month)
  const map = byDay(workouts, races)
  const sum = monthSummary(workouts, month, today)
  const selDay = map.get(sel) ?? { workouts: [], races: [] }

  const drop = (e, d) => {
    e.preventDefault()
    setOver(null)
    const w = workouts.find((x) => x.id === e.dataTransfer.getData('text/plain'))
    if (!w || !canDrag(w) || w.date === d) return
    saveWorkout(moveWorkout(w, d, today))
    setSel(d)
    notify(`“${w.name}” remanejado para ${dayLabel(d)}`)
  }

  return (
    <div data-testid="wk-month">
      <div className="month-head">
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior"><IconChevronL /></button>
        <div style={{ textAlign: 'center' }}>
          <h2>{monthName(m - 1)} {y}</h2>
          <div className="small muted" data-testid="wm-summary">
            {sum.total ? `${sum.done} de ${sum.total} ${sum.total === 1 ? 'treino feito' : 'treinos feitos'}` : 'nenhum treino'}
            {sum.sec > 0 ? ` · ${fmtSec(sum.sec)}` : ''}{sum.km > 0 ? ` · ${String(sum.km).replace('.', ',')} km` : ''}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês"><IconChevronR /></button>
      </div>

      <div className="cal wm-cal" role="grid" aria-label={`Treinos de ${monthName(m - 1)} de ${y}`}>
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <div key={i} className="wd" aria-hidden="true">{d}</div>)}
        {days.map((d) => {
          const it = map.get(d) ?? { workouts: [], races: [] }
          const cls = ['day', d.slice(0, 7) !== month && 'other', d === today && 'today', d === sel && 'sel', over === d && 'drop'].filter(Boolean).join(' ')
          const label = `${formatDateBR(d)}${it.workouts.length ? `: ${it.workouts.map((w) => `${w.name} (${STATE_LABEL[workoutState(w, today)]})`).join(', ')}` : ''}${it.races.length ? `; prova: ${it.races.map((r) => r.name).join(', ')}` : ''}`
          return (
            <button key={d} type="button" className={cls} onClick={() => setSel(d)} aria-label={label} aria-pressed={d === sel} data-testid={`wm-day-${d}`}
              onDragOver={(e) => { e.preventDefault(); if (over !== d) setOver(d) }} onDragLeave={() => setOver((o) => (o === d ? null : o))} onDrop={(e) => drop(e, d)}>
              <span className="wm-n">{Number(d.slice(8))}</span>
              <span className="wm-icons">
                {it.races.length > 0 && <span className="wm-ic wm-race" title="Prova"><IconFlag /></span>}
                {it.workouts.slice(0, it.races.length ? 2 : 3).map((w) => (
                  <span key={w.id} className={`wm-ic ws-${workoutState(w, today)}`} draggable={canDrag(w)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', w.id); e.dataTransfer.effectAllowed = 'move' }} data-testid="wm-item">
                    <SportIcon sport={w.sport} />
                  </span>
                ))}
              </span>
              {it.workouts[0] && <span className="wm-lab">{cellLabel(it.workouts[0])}</span>}
            </button>
          )
        })}
      </div>
      {sum.done > 0 && <Link to={`/stories?modelo=mes&mes=${month}`} className="link-btn wm-story" data-testid="wm-story"><IconStory /> Story do mês</Link>}
      <div className="wm-legend small muted">
        <span><i className="wm-key ws-feito" /> feito</span>
        <span><i className="wm-key ws-futuro" /> planejado</span>
        <span><i className="wm-key ws-passou" /> passou</span>
        <span><i className="wm-key ws-pulado" /> não fiz</span>
        <span className="wm-drag-hint">Arraste um treino planejado para outro dia</span>
      </div>

      <MonthLoad workouts={workouts} days={days} today={today} />

      <div className="list-group-title">{dayLabel(sel)}</div>
      <div data-testid="wm-day">
        {selDay.races.map((r) => (
          <Link key={r.id} to={`/corridas/${r.id}`} className="card wm-card">
            <span className="wm-card-ic wm-race"><IconFlag /></span>
            <span className="wm-card-body"><b>{r.name}</b><span className="muted small">prova · {r.status === 'concluida' ? 'concluída' : 'inscrita'}</span></span>
          </Link>
        ))}
        {selDay.workouts.map((w) => {
          const st = workoutState(w, today)
          const stats = dayStats(w)
          return (
            <div key={w.id} className="card wm-card" draggable={canDrag(w)} onDragStart={(e) => e.dataTransfer.setData('text/plain', w.id)} data-testid="wm-card">
              <span className={`wm-card-ic ws-${st}`}><SportIcon sport={w.sport} /></span>
              <div className="wm-card-body">
                <Link to={`/treinos/${w.id}`} className="wm-card-title"><b>{w.name}</b><span className={`wm-tag ws-${st}`}>{STATE_LABEL[st]}</span></Link>
                {stats.length > 0 && (
                  <div className="wm-stats">
                    {stats.map((s) => <span key={s.l}><b>{s.v}</b> {s.l}</span>)}
                  </div>
                )}
                {canDrag(w) && <button type="button" className="link-btn" onClick={() => setMoving(w)} data-testid="wm-move">Remanejar</button>}
              </div>
            </div>
          )
        })}
        {!selDay.workouts.length && !selDay.races.length && <div className="card muted small">Nada neste dia.</div>}
        {sel >= today && (
          <Link to={`/treinos/novo?data=${sel}`} className="btn btn-sm" style={{ marginTop: 8 }} data-testid="wm-new"><IconPlus /> Treino em {formatDateBR(sel).slice(0, 5)}</Link>
        )}
      </div>
      {moving && <Reschedule w={moving} onClose={() => setMoving(null)} onMoved={(d) => setSel(d)} />}
    </div>
  )
}

/** Carga de cada semana do mês (corrida + força + outras), para ver o ritmo das semanas lado a lado. */
function MonthLoad({ workouts, days, today }) {
  const zones = useZones()
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    const start = days[i]
    if (start > addDaysISO(today, 7)) break
    weeks.push({ start, ...weekStrain(workouts, start, today, zones) })
  }
  if (!weeks.some((w) => w.total > 0)) return null
  const max = Math.max(...weeks.map((w) => w.total), 1)
  return (
    <div className="card wm-load" data-testid="wm-load">
      <div className="wm-load-head small"><b>Carga por semana</b><span className="muted">pontos (minutos × intensidade)</span></div>
      <div className="wm-bars">
        {weeks.map((w) => (
          <div key={w.start} className={`wm-bar${w.level === 'alta' ? ' alta' : ''}`} title={`${w.total} pts`}>
            <span className="wm-bar-v">{w.total || ''}</span>
            <span className="wm-bar-col">
              <span className="wm-bar-plan" style={{ height: `${((w.done + w.planned) / max) * 100}%` }} />
              <span className="wm-bar-done" style={{ height: `${(w.done / max) * 100}%` }} />
            </span>
            <span className="wm-bar-l">{w.start.slice(8)}/{w.start.slice(5, 7)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
