// Peças da tomada de decisão: vontade (1–3), fatores de uma prova e ações rápidas.
import { Link, useNavigate } from 'react-router-dom'
import { getRace, saveRace } from '../services/store.js'
import { useUI } from './ui.jsx'
import { decisionInfo } from '../lib/decision.js'
import { formatDateBR, yearOf } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace } from '../lib/format.js'

export const WISH = [
  { v: 1, label: 'Talvez' },
  { v: 2, label: 'Quero' },
  { v: 3, label: 'Quero muito' }
]

/** Quanto quero esta prova. `onChange(v)`; tocar no valor atual limpa. */
export function WishPicker({ value, onChange, compact }) {
  return (
    <div className={`wish${compact ? ' compact' : ''}`} role="radiogroup" aria-label="Quanto quero esta prova">
      {WISH.map((w) => (
        <button key={w.v} type="button" role="radio" aria-checked={value === w.v} title={w.label} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(value === w.v ? null : w.v) }}>
          <span aria-hidden="true">{'★'.repeat(w.v)}</span>
          {!compact && <span className="wl">{w.label}</span>}
          {compact && <span className="sr-only">{w.label}</span>}
        </button>
      ))}
    </div>
  )
}

export function setWish(id, wish) {
  const r = getRace(id)
  if (r) saveRace({ ...r, wish })
}

/** Ações: inscrevi-me / não vou, com desfazer. */
export function DecisionActions({ race }) {
  const { notify } = useUI()
  const nav = useNavigate()
  const change = (status, msg, extra) => {
    const before = getRace(race.id)
    if (!before) return
    saveRace({ ...before, status })
    notify(msg, {
      actionLabel: extra?.label ?? 'Desfazer',
      onAction: extra?.onAction ?? (() => saveRace({ ...getRace(race.id), status: before.status }))
    })
  }
  return (
    <div className="btn-row" style={{ marginTop: 12 }}>
      <button type="button" className="btn btn-primary" onClick={() => change('inscrita', 'Marcada como inscrita', { label: 'Informar valor pago', onAction: () => nav(`/corridas/${race.id}/editar#custos`) })}>Me inscrevi</button>
      <button type="button" className="btn" onClick={() => change('desisti', 'Marcada como “Desisti”')}>Não vou</button>
    </div>
  )
}

const pct = (x) => `${Math.round(x * 100)}%`

/** Lista de fatores de uma prova em avaliação. */
export function DecisionDetails({ race, races, goals, today, hidePrediction }) {
  const d = decisionInfo(race, { races, goals, today })
  const rows = []
  // Custo
  if (d.cost.total != null) {
    const viagem = d.cost.inscription != null && d.cost.total > d.cost.inscription ? ` (inscrição ${formatMoney(d.cost.inscription)} + viagem e outros ${formatMoney(d.cost.total - d.cost.inscription)})` : ''
    rows.push({ k: 'Custo previsto', v: <>{formatMoney(d.cost.total)}{viagem}{d.cost.perKm != null && <span className="muted"> · {formatMoney(d.cost.perKm)}/km</span>}</> })
  } else rows.push({ k: 'Custo previsto', v: <>Sem valor informado. <Link to={`/corridas/${race.id}/editar#custos`}>Adicionar</Link></>, tone: 'warn' })
  // Orçamento
  if (d.budget?.missing) rows.push({ k: 'Orçamento', v: 'Informe o valor para ver o impacto.', tone: 'warn' })
  else if (d.budget) rows.push({ k: 'Orçamento', v: <>Fica em <b>{formatMoney(d.budget.after)}</b> de {formatMoney(d.budget.target)} ({pct(d.budget.pct)}){d.budget.remaining < 0 ? ` — ${formatMoney(-d.budget.remaining)} acima` : ` — sobram ${formatMoney(d.budget.remaining)}`}</>, tone: d.budget.level === 'estourou' ? 'bad' : d.budget.level === 'atencao' ? 'warn' : 'good' })
  // Prazo
  if (d.deadline) rows.push({ k: 'Prazo', v: `${d.deadline.label} em ${formatDateBR(d.deadline.date)} (${d.deadline.daysLeft === 0 ? 'hoje' : d.deadline.daysLeft === 1 ? 'amanhã' : `${d.deadline.daysLeft} dias`})`, tone: d.deadline.daysLeft <= 7 ? 'warn' : null })
  else if (!race.signupDeadline && !race.lotChangeDate) rows.push({ k: 'Prazo', v: <>Sem prazo cadastrado. <Link to={`/corridas/${race.id}/editar`}>Adicionar</Link></> })
  // Calendário
  if (race.date) {
    const parts = []
    if (d.sameDay.length) parts.push(<span key="s" className="delta-bad">Mesmo dia de {d.sameDay.map((r) => r.name).join(', ')}. </span>)
    for (const x of d.near) parts.push(<span key={x.race.id}>{Math.abs(x.days)} {Math.abs(x.days) === 1 ? 'dia' : 'dias'} {x.days > 0 ? 'depois de' : 'antes de'} {x.race.name}. </span>)
    rows.push({ k: 'Calendário', v: parts.length ? parts : 'Nenhuma prova marcada até 3 semanas antes ou depois.', tone: d.sameDay.length ? 'bad' : null })
  } else rows.push({ k: 'Calendário', v: 'Data a confirmar.' })
  // Objetivos
  if (d.goals.length) rows.push({ k: 'Objetivos', v: d.goals.map((g) => <div key={g.goal.id}>{g.text}</div>), tone: 'good' })
  // Edições anteriores
  if (d.history.length) rows.push({ k: 'Já correu', v: d.history.map((r) => <div key={r.id}><Link to={`/corridas/${r.id}`}>{yearOf(r.date)}</Link>: {formatDuration(r.result.netTime)} ({formatKm(r.result.officialDistanceKm)})</div>) })
  // Previsão
  if (!hidePrediction && d.prediction && race.distanceKm) rows.push({ k: 'Previsão', v: <>~{formatDuration(d.prediction.estimate)} ({formatPace(d.prediction.estimate / race.distanceKm)}) <span className="muted small">pelas suas provas</span></> })

  return (
    <dl className="decision-kv">
      {rows.map((r) => (
        <div key={r.k} className={r.tone ? `dk-${r.tone}` : ''}>
          <dt>{r.k}</dt>
          <dd>{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}
