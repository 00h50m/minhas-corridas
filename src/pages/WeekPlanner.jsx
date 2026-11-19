// Planejar a semana: escolher os dias da academia (a ficha distribui A → B → C…), copiar as corridas da
// semana anterior e ver a carga prevista antes de confirmar.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import { SportIcon } from '../components/Icons.jsx'
import { useZones } from '../components/HrZones.jsx'
import { saveWorkout, useStore } from '../services/store.js'
import { useFicha } from '../services/ficha.js'
import { activeProgram, sheetName } from '../lib/ficha.js'
import { DOW, buildPlan, copyCandidates, planGym, suggestedWeek } from '../lib/weekPlan.js'
import { weekStrain } from '../lib/load.js'
import { addDaysISO, formatDateBR, todayISO } from '../lib/dates.js'
import { weekStart } from '../lib/trainingWeek.js'
import { dayLabel } from '../lib/reschedule.js'
import { fmtSec, isRun, plannedSec, workoutLine } from '../lib/workout.js'

const DAYS_KEY = 'paceon:dias-academia'
const readDays = () => { try { const v = JSON.parse(localStorage.getItem(DAYS_KEY)); return Array.isArray(v) ? v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [0, 2, 4] } catch { return [0, 2, 4] } }

export default function WeekPlanner() {
  const { workouts } = useStore()
  const ficha = useFicha()
  const program = activeProgram(ficha)
  const nav = useNavigate()
  const { notify } = useUI()
  const zones = useZones()
  const today = todayISO()
  const thisWeek = weekStart(today)
  const [start, setStart] = useState(() => suggestedWeek(today))
  const [days, setDays] = useState(readDays)
  const copies = useMemo(() => copyCandidates(workouts, start, today, { withFicha: !!program }), [workouts, start, today, program])
  const [picked, setPicked] = useState(() => new Set(copyCandidates(workouts, suggestedWeek(today), today, { withFicha: !!program }).filter((c) => !c.skip).map((c) => c.src.id)))
  const gym = program ? planGym(program, workouts, start, days, today) : []
  const plan = buildPlan({ program, gym, copies, picked })
  const now = weekStrain(workouts, start, today, zones)
  const after = weekStrain([...workouts, ...plan.map((w, i) => ({ ...w, id: `novo-${i}` }))], start, today, zones)

  const toggleDay = (d) => { const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(); setDays(next); try { localStorage.setItem(DAYS_KEY, JSON.stringify(next)) } catch { /* ok */ } }
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const changeWeek = (s) => { setStart(s); setPicked(new Set(copyCandidates(workouts, s, today, { withFicha: !!program }).filter((c) => !c.skip).map((c) => c.src.id))) }
  const confirm = () => {
    for (const w of plan) saveWorkout(w)
    notify(`${plan.length} ${plan.length === 1 ? 'treino planejado' : 'treinos planejados'}`)
    nav('/treinos', { replace: true })
  }

  return (
    <>
      <TopBar title="Planejar a semana" back="/treinos" />
      <div className="page planner" data-testid="planner">
        <div className="seg" role="group" aria-label="Semana">
          {[thisWeek, addDaysISO(thisWeek, 7)].map((s) => (
            <button key={s} type="button" aria-pressed={start === s} onClick={() => changeWeek(s)} data-testid={s === thisWeek ? 'plan-this' : 'plan-next'}>
              {s === thisWeek ? 'Esta semana' : 'Próxima'} · {formatDateBR(s).slice(0, 5)}–{formatDateBR(addDaysISO(s, 6)).slice(0, 5)}
            </button>
          ))}
        </div>

        <div className="section-title"><h2>Academia</h2>{program && <Link to="/academia">Ficha</Link>}</div>
        {program ? (
          <div className="card">
            <p className="small muted" style={{ marginTop: 0 }}>Em quais dias você vai? A ficha distribui a sequência a partir do próximo treino.</p>
            <div className="plan-days" role="group" aria-label="Dias da academia">
              {DOW.map((d, i) => <button key={d} type="button" aria-pressed={days.includes(i)} className={days.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)} data-testid={`plan-day-${i}`}>{d}</button>)}
            </div>
            <ul className="plan-list" data-testid="plan-gym">
              {gym.map((g) => (
                <li key={g.date} className={g.skip ? 'skip' : ''}>
                  <span>{dayLabel(g.date)}</span>
                  <b>{g.sheet ? sheetName(g.sheet) : <span className="muted small">{g.skip}</span>}</b>
                </li>
              ))}
              {!gym.length && <li className="muted small">Nenhum dia escolhido.</li>}
            </ul>
          </div>
        ) : (
          <Link to="/academia" className="card small plan-nofile">Cadastre a ficha da academia para o app distribuir os treinos A, B, C… nos dias que você escolher.</Link>
        )}

        <div className="section-title"><h2>Da semana anterior</h2></div>
        {copies.length ? (
          <div className="card" data-testid="plan-copies">
            {copies.map((c) => (
              <label key={c.src.id} className={`plan-copy${c.skip ? ' skip' : ''}`}>
                <input type="checkbox" checked={!c.skip && picked.has(c.src.id)} disabled={!!c.skip} onChange={() => togglePick(c.src.id)} data-testid="plan-copy" />
                <span className="plan-copy-ic"><SportIcon sport={c.src.sport} /></span>
                <span className="plan-copy-t"><b>{c.src.name}</b><span className="muted small">{dayLabel(c.date)} · {c.skip ?? workoutLine(c.src)}{!c.skip && !isRun(c.src) && plannedSec(c.src) ? ` · ${fmtSec(plannedSec(c.src))}` : ''}</span></span>
              </label>
            ))}
          </div>
        ) : <div className="card muted small">Nada na semana anterior para copiar.</div>}

        <div className="card plan-sum" data-testid="plan-sum">
          <div><b>{plan.length}</b> {plan.length === 1 ? 'treino novo' : 'treinos novos'}</div>
          <div className="small">
            Carga prevista <b>{after.total} pts</b>{now.total ? <span className="muted"> (hoje {now.total})</span> : null}
            {after.avg4 > 0 && <> · <span className={after.level === 'alta' ? 'warn-t' : ''}>{after.pct > 0 ? '+' : ''}{after.pct}% da sua média</span></>}
          </div>
          {after.level === 'alta' && <div className="tw-warn small" data-testid="plan-heavy">Fica bem acima do seu normal. Talvez valha tirar um treino ou deixar um mais leve.</div>}
        </div>
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={confirm} disabled={!plan.length} data-testid="plan-confirm">
          {plan.length ? `Planejar ${plan.length} ${plan.length === 1 ? 'treino' : 'treinos'}` : 'Nada para planejar'}
        </button>
        <p className="note">Os treinos entram como planejados; dá para mover, editar ou apagar cada um depois.</p>
      </div>
    </>
  )
}
