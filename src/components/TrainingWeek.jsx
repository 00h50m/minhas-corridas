// Semana de treinos: segunda a domingo, planejado × feito, tempo, km e sequência de semanas cumpridas.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DOW_SHORT, weekLoad, weekStart, weekStreak, weekSummary, workoutState } from '../lib/trainingWeek.js'
import { addDaysISO, formatDateBR } from '../lib/dates.js'
import { IconChevronL, IconChevronR } from './Icons.jsx'
import { useCycle } from '../services/cycle.js'
import { isPeriodDay, isPredictedDay } from '../lib/cycle.js'
import HrZones from './HrZones.jsx'
import { sumHist } from '../lib/hrZones.js'

const mins = (s) => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}
const MARK = { feito: '✓', pulado: '–', passou: '!', hoje: '●', futuro: '○' }
const STATE_TXT = { feito: 'feito', pulado: 'não fez', passou: 'passou sem marcar', hoje: 'hoje', futuro: 'planejado' }

export default function TrainingWeek({ workouts, today, compact = false }) {
  const [start, setStart] = useState(() => weekStart(today))
  const s = weekSummary(workouts, start, today)
  const streak = weekStreak(workouts, today)
  const current = start === weekStart(today)
  const label = current ? 'Esta semana' : start === addDaysISO(weekStart(today), 7) ? 'Próxima semana' : start === addDaysISO(weekStart(today), -7) ? 'Semana passada' : `${formatDateBR(start).slice(0, 5)} a ${formatDateBR(s.end).slice(0, 5)}`
  const totals = s.planned
    ? `${s.done} de ${s.planned} ${s.planned === 1 ? 'treino' : 'treinos'} · ${mins(s.doneSec)} de ${mins(s.plannedSec)}${s.doneKm ? ` · ${String(s.doneKm).replace('.', ',')} km` : ''}${s.cross ? ` · ${s.cross} ${s.cross === 1 ? 'outra atividade' : 'outras atividades'}` : ''}`
    : 'Nenhum treino nesta semana'
  if (compact) {
    return (
      <Link to="/treinos" className="card tw tw-compact" data-testid="week-compact">
        <div className="tw-row">{s.days.map((d, i) => <Day key={d.date} d={d} i={i} today={today} />)}</div>
        <div className="small"><b>{totals}</b>{streak > 0 && <span className="tw-streak"> · 🔥 {streak} {streak === 1 ? 'semana cumprida' : 'semanas seguidas'}</span>}</div>
      </Link>
    )
  }
  return (
    <div className="card tw" data-testid="training-week">
      <div className="tw-head">
        <button type="button" className="icon-btn" onClick={() => setStart(addDaysISO(start, -7))} aria-label="Semana anterior"><IconChevronL /></button>
        <div style={{ textAlign: 'center' }}>
          <b>{label}</b>
          <div className="muted small">{formatDateBR(start).slice(0, 5)} – {formatDateBR(s.end).slice(0, 5)}</div>
        </div>
        <button type="button" className="icon-btn" onClick={() => setStart(addDaysISO(start, 7))} aria-label="Próxima semana"><IconChevronR /></button>
      </div>
      <div className="tw-row">{s.days.map((d, i) => <Day key={d.date} d={d} i={i} today={today} />)}</div>
      <div className="tw-totals small" data-testid="week-totals"><b>{totals}</b></div>
      {s.planned > 0 && (
        <div className="tw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={s.planned} aria-valuenow={s.done} aria-label="Treinos feitos na semana">
          <span style={{ width: `${Math.round((s.done / s.planned) * 100)}%` }} />
        </div>
      )}
      <Load workouts={workouts} start={start} today={today} />
      <WeekZones s={s} />
      {(s.missed > 0 || s.skipped > 0) && <p className="note" style={{ margin: '6px 0 0' }}>{s.missed > 0 ? `${s.missed} ${s.missed === 1 ? 'treino passou' : 'treinos passaram'} sem marcar: remaneje ou marque logo abaixo.` : ''}{s.skipped > 0 ? ` ${s.skipped} não ${s.skipped === 1 ? 'feito' : 'feitos'}.` : ''}</p>}
      {!current && <button type="button" className="link-btn" onClick={() => setStart(weekStart(today))}>Voltar para esta semana</button>}
      {current && s.planned > 0 && <Link to="/stories?modelo=semana" className="link-btn" data-testid="week-story">📲 Compartilhar a semana</Link>}
      {streak > 0 && <div className="tw-streak small" data-testid="week-streak">🔥 {streak} {streak === 1 ? 'semana cumprida' : 'semanas seguidas cumpridas'}</div>}
    </div>
  )
}

function Day({ d, i, today }) {
  const w = d.workouts[0]
  const st = w ? workoutState(w, today) : null
  const c = useCycle()
  // Ciclo (se ativado): ponto lilás nos dias de menstruação (registrada ou prevista); só aqui, nunca em stories
  const cyc = c.enabled && c.periods.length ? (isPeriodDay(c, d.date, today) && d.date <= today ? 'cyc' : isPredictedDay(c, d.date, today) ? 'cyc-pred' : '') : ''
  const inner = (
    <>
      <span className="tw-dow">{DOW_SHORT[i]}</span>
      <span className="tw-num">{Number(d.date.slice(8, 10))}</span>
      <span className={`tw-mark ${st ?? 'none'}`}>{st ? MARK[st] : ''}</span>
      {cyc && <span className={`tw-cyc ${cyc}`} aria-label={cyc === 'cyc' ? 'menstruação' : 'menstruação prevista'} data-testid="tw-cyc" />}
    </>
  )
  const cls = `tw-day${d.date === today ? ' today' : ''}`
  if (!w) return <span className={cls}>{inner}</span>
  return (
    <Link to={`/treinos/${w.id}`} className={`${cls} has`} aria-label={`${DOW_SHORT[i]} ${formatDateBR(d.date)}: ${w.name}, ${STATE_TXT[st]}${d.workouts.length > 1 ? ` (+${d.workouts.length - 1})` : ''}`}>
      {inner}
    </Link>
  )
}

/** Intensidade da semana pela FC dos treinos feitos com o arquivo do relógio (2 ou mais). */
function WeekZones({ s }) {
  const done = s.days.flatMap((d) => d.workouts).filter((w) => w.status === 'feito' && w.result?.hrHist)
  if (done.length < 2) return null
  return <div className="tw-zones" data-testid="week-zones"><HrZones hist={sumHist(done.map((w) => w.result.hrHist))} hasIntervals title={`Intensidade da semana (${done.length} treinos com FC)`} compact /></div>
}

/** Carga: esta semana × a passada (e a média de 4), com aviso acima de 10%. */
function Load({ workouts, start, today }) {
  const l = weekLoad(workouts, start, today)
  if (!l.thisSec && !l.lastSec) return null
  return (
    <div className={`tw-load small${l.warn ? ' warn' : ''}`} data-testid="week-load">
      Carga: <b>{mins(l.thisSec)}</b>{l.doneSec < l.plannedSec ? ' planejada' : ''}
      {l.lastSec > 0 ? <> · semana passada {mins(l.lastSec)} ({l.pct > 0 ? '+' : ''}{l.pct}%)</> : ' · sem treinos na semana passada'}
      {l.avg4Sec > 0 && l.avg4Sec !== l.lastSec ? <span className="muted"> · média de 4 semanas {mins(l.avg4Sec)}</span> : null}
      {l.warn && <div className="tw-warn" data-testid="week-load-warn">Mais de 10% acima da semana passada. Se sentir cansaço fora do normal ou dor, segure o volume (repita a semana em vez de aumentar).</div>}
    </div>
  )
}
