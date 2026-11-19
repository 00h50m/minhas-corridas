// Semana de treinos: segunda a domingo, planejado × feito, tempo, km e sequência de semanas cumpridas.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DOW_SHORT, weekStart, weekStreak, weekSummary, workoutState } from '../lib/trainingWeek.js'
import { addDaysISO, formatDateBR } from '../lib/dates.js'
import { IconChevronL, IconChevronR, IconFlame, IconStory } from './Icons.jsx'
import { useCycle } from '../services/cycle.js'
import { isPeriodDay, isPredictedDay } from '../lib/cycle.js'
import HrZones, { useZones } from './HrZones.jsx'
import { weekStrain } from '../lib/load.js'
import { sumHist } from '../lib/hrZones.js'

const mins = (s) => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}
const MARK = { feito: '✓', pulado: '–', passou: '!', hoje: '●', futuro: '○' }
const STATE_TXT = { feito: 'feito', pulado: 'não fez', passou: 'passou sem marcar', hoje: 'hoje', futuro: 'planejado' }

export default function TrainingWeek({ workouts, today, compact = false, embedded = false }) {
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
      <Link to="/treinos" className={`${embedded ? 'tw-embedded' : 'card'} tw tw-compact`} data-testid="week-compact">
        <div className="tw-row">{s.days.map((d, i) => <Day key={d.date} d={d} i={i} today={today} />)}</div>
        <div className="small"><b>{totals}</b>{streak > 0 && <span className="tw-streak"> · <IconFlame /> {streak} {streak === 1 ? 'semana cumprida' : 'semanas seguidas'}</span>}</div>
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
      <WeekMore workouts={workouts} start={start} today={today} s={s} />
      <div className="tw-foot">
        {!current && <button type="button" className="link-btn" onClick={() => setStart(weekStart(today))}>Voltar para esta semana</button>}
        <Link to="/treinos/planejar" className="link-btn" data-testid="week-plan">Planejar a semana</Link>
        {current && s.planned > 0 && <Link to="/stories?modelo=semana" className="link-btn" data-testid="week-story"><IconStory /> Compartilhar</Link>}
        {streak > 0 && <span className="tw-streak small" data-testid="week-streak"><IconFlame /> {streak} {streak === 1 ? 'semana cumprida' : 'semanas seguidas cumpridas'}</span>}
      </div>
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

/** Carga e intensidade num toque: a linha resume; o detalhe (barra, divisão, zonas) abre embaixo. */
function WeekMore({ workouts, start, today, s }) {
  const zones = useZones()
  const l = weekStrain(workouts, start, today, zones)
  const zonesDone = s.days.flatMap((d) => d.workouts).filter((w) => w.status === 'feito' && w.result?.hrHist)
  if (!l.total && !l.avg4) return null
  const max = Math.max(l.total, l.avg4, 1) * 1.1
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`
  const parts = [['corrida', l.parts.corrida], ['força', l.parts.forca], ['outras', l.parts.outras]].filter(([, v]) => v > 0)
  return (
    <>
      <details className="tw-more">
        <summary data-testid="week-load-sum">
          <span>Carga <b>{l.total} pts</b></span>
          {l.pct != null ? <span className={`tl-pct tl-${l.level}`}>{l.pct > 0 ? '+' : ''}{l.pct}% da média</span> : <span className="muted">detalhes</span>}
        </summary>
        <div className={`tw-load small${l.level === 'alta' ? ' warn' : ''}`} data-testid="week-load">
          <div>Carga da semana <b>{l.total} pts</b>{l.planned > 0 ? <span className="muted"> ({l.planned} planejada)</span> : null}{l.pct != null ? ` · ${l.pct > 0 ? '+' : ''}${l.pct}% da média` : ''}</div>
          <div className="tl-bar" aria-hidden="true">
            <span className="tl-done" style={{ width: pct(l.done) }} />
            <span className="tl-plan" style={{ left: pct(l.done), width: pct(l.planned) }} />
            {l.avg4 > 0 && <span className="tl-avg" style={{ left: pct(l.avg4) }} />}
          </div>
          <div className="muted">{parts.length ? parts.map(([k, v]) => `${k} ${v}`).join(' · ') : 'nada feito ainda'}{l.avg4 > 0 ? ` · média de ${l.weeks} ${l.weeks === 1 ? 'semana' : 'semanas'}: ${l.avg4}` : ''}</div>
          <p className="note" style={{ margin: '4px 0 0' }}>Pontos = minutos × intensidade. Com o arquivo do relógio, a intensidade vem do tempo em cada zona de FC (Z1 vale 1, Z5 vale 5); sem FC, um peso médio por atividade. Serve para comparar a semana com as suas semanas.</p>
        </div>
        {zonesDone.length >= 2 && <div className="tw-zones" data-testid="week-zones"><HrZones hist={sumHist(zonesDone.map((w) => w.result.hrHist))} hasIntervals title={`Intensidade da semana (${zonesDone.length} treinos com FC)`} compact /></div>}
      </details>
      {l.level === 'alta' && <div className="tw-warn small" data-testid="week-load-warn">Semana bem acima do seu normal. Se sentir cansaço fora do normal ou dor, vale segurar o volume.</div>}
    </>
  )
}
