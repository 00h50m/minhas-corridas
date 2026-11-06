// Cartão do orçamento do ano (Início e aba Gastos).
import { Link } from 'react-router-dom'
import { budgetStatus, currentBudget } from '../lib/budget.js'
import { formatMoney } from '../lib/format.js'
import { todayISO } from '../lib/dates.js'

const pctText = (x) => `${Math.round(x * 100)}%`

export function BudgetBar({ b }) {
  const w = (x) => `${Math.max(0, Math.min(1, x)) * 100}%`
  return (
    <div className={`budget-bar lv-${b.level}`} role="img" aria-label={`Gasto ${pctText(b.pct)} do orçamento${b.planned > 0 ? `; com as provas em avaliação, ${pctText(b.projectedPct)}` : ''}`}>
      {b.planned > 0 && <span className="planned" style={{ width: w(b.projectedPct) }} />}
      <span className="spent" style={{ width: w(b.pct) }} />
      <span className="mark" style={{ left: w(b.alertPct / 100) }} />
    </div>
  )
}

export default function BudgetCard({ goals, races, today = todayISO(), showEmpty = false, compact = false }) {
  const g = currentBudget(goals, today)
  const year = today.slice(0, 4)
  if (!g) {
    if (!showEmpty) return null
    return (
      <Link to={`/objetivos/novo?tipo=orcamento&ano=${year}`} className="card goal-empty" data-testid="budget-empty">
        <span style={{ fontSize: 26 }} aria-hidden="true">💰</span>
        <span><b>Definir orçamento de {year}</b><br /><span className="muted small">Um teto para gastar com provas, com aviso ao chegar perto e ajuda para decidir em quais se inscrever.</span></span>
      </Link>
    )
  }
  const b = budgetStatus(g, races, today)
  if (compact) {
    return (
      <Link to={`/objetivos/${g.id}`} className={`card budget-card budget-compact lv-${b.level}`} data-testid="budget-card">
        <div className="budget-head">
          <b>Orçamento {g.deadline ? g.deadline.slice(0, 4) : ''}</b>
          <span className={`flag ${b.level === 'estourou' ? 'flag-danger' : b.level === 'atencao' ? 'flag-warn' : 'flag-ok'}`}>{b.level === 'estourou' ? 'Estourou' : b.level === 'atencao' ? 'Perto do limite' : `${pctText(b.pct)} usado`}</span>
        </div>
        <div className="budget-nums">
          <span><b>{formatMoney(b.spent)}</b> de {formatMoney(b.target)}</span>
          <span className={b.remaining < 0 ? 'delta-bad' : 'muted'}>{b.remaining < 0 ? `${formatMoney(-b.remaining)} acima` : `restam ${formatMoney(b.remaining)}`}</span>
        </div>
        <BudgetBar b={b} />
        {b.planned > 0 && <div className="small muted" style={{ marginTop: 6 }}>Com as provas em avaliação: {formatMoney(b.projected)} ({pctText(b.projectedPct)})</div>}
      </Link>
    )
  }
  return (
    <div className={`card budget-card lv-${b.level}`} data-testid="budget-card">
      <div className="budget-head">
        <Link to={`/objetivos/${g.id}`}><b>{g.title}</b></Link>
        <span className={`flag ${b.level === 'estourou' ? 'flag-danger' : b.level === 'atencao' ? 'flag-warn' : 'flag-ok'}`}>{b.level === 'estourou' ? 'Estourou' : b.level === 'atencao' ? 'Perto do limite' : 'Dentro'}</span>
      </div>
      <div className="budget-nums">
        <span><b>{formatMoney(b.spent)}</b> de {formatMoney(b.target)} ({pctText(b.pct)})</span>
        <span className={b.remaining < 0 ? 'delta-bad' : 'muted'}>{b.remaining < 0 ? `${formatMoney(-b.remaining)} acima` : `restam ${formatMoney(b.remaining)}`}</span>
      </div>
      <BudgetBar b={b} />
      {(b.planned > 0 || b.plannedMissing.length > 0) && (
        <p className="small" style={{ margin: '10px 0 0' }}>
          {b.planned > 0 && <>{b.plannedRaces.length === 1 ? 'Se fizer a prova em avaliação' : `Se fizer as ${b.plannedRaces.length} provas em avaliação`}: <b>{formatMoney(b.projected)}</b> ({pctText(b.projectedPct)}). </>}
          {b.plannedMissing.length > 0 && <span className="muted">{b.plannedMissing.length} sem valor informado. </span>}
          <Link to="/decidir">Decidir ›</Link>
        </p>
      )}
      <p className="note">{b.scope === 'total' ? 'Inscrição, transporte, hospedagem e outros' : 'Só inscrições'} das provas inscritas e concluídas{b.estimatedPart > 0 ? `, incluindo ${formatMoney(b.estimatedPart)} estimados (sem valor pago)` : ''}. A marca na barra é o aviso de {b.alertPct}%.</p>
    </div>
  )
}
