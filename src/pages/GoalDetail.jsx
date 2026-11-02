import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { deleteGoal, getGoal, saveGoal, useStore } from '../services/store.js'
import { GoalStatusBadge, Progress, TopBar, useUI } from '../components/ui.jsx'
import { IconEdit, IconInfo, IconTrash, IconCheck } from '../components/Icons.jsx'
import { GOAL_STATUSES, GOAL_TYPE_BY_ID, goalUnit } from '../lib/model.js'
import { formatGoalTarget, goalProgress } from '../lib/goals.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, kmToInput, parseNumber } from '../lib/format.js'
import { inscriptionSpent } from '../lib/costs.js'
import { GoalPlan } from '../components/Analysis.jsx'
import { formatMoney } from '../lib/format.js'

export default function GoalDetail() {
  const { id } = useParams()
  const { races } = useStore()
  const nav = useNavigate()
  const { confirm, notify } = useUI()
  const g = getGoal(id)
  const [manual, setManual] = useState(() => kmToInput(g?.manualValue ?? 0))
  const [manualErr, setManualErr] = useState(null)
  if (!g) return <Navigate to="/objetivos" replace />

  const today = todayISO()
  const p = goalProgress(g, races, today)
  const tone = p.over ? 'danger' : p.achieved || g.status === 'concluido' ? 'ok' : 'brand'

  const setStatus = (status) => {
    saveGoal({ ...g, status })
    notify(status === 'concluido' ? 'Objetivo concluído. Parabéns!' : 'Status atualizado')
  }

  const saveManual = (value) => {
    const n = parseNumber(value)
    if (n == null || Number.isNaN(n) || n < 0) {
      setManualErr('Use um número maior ou igual a zero.')
      return
    }
    setManualErr(null)
    setManual(kmToInput(n))
    saveGoal({ ...g, manualValue: n })
    notify('Progresso atualizado')
  }

  const onDelete = async () => {
    const ok = await confirm({ title: 'Excluir este objetivo?', message: `“${g.title}” será apagado. As corridas não são afetadas.`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    deleteGoal(g.id)
    notify('Objetivo excluído')
    nav('/objetivos', { replace: true })
  }

  const raceLine = (r) => {
    if (g.type === 'orcamento') return formatMoney(inscriptionSpent(r))
    if (!r.result) return ''
    if (g.type === 'km') return formatKm(r.result.officialDistanceKm)
    return `${formatDuration(r.result.netTime)}${r.result.isOfficial ? '' : ' · registro pessoal'}`
  }

  return (
    <>
      <TopBar title="Objetivo" back="/objetivos" right={<Link to={`/objetivos/${g.id}/editar`} className="icon-btn" aria-label="Editar objetivo"><IconEdit /></Link>} />
      <div className="page">
        <div className="card detail-head">
          <GoalStatusBadge status={g.status} />
          <div className="name" style={{ marginTop: 10 }}>{g.title}</div>
          <div className="muted small" style={{ marginTop: 6, fontWeight: 700 }}>
            {GOAL_TYPE_BY_ID[g.type]?.label} · alvo {formatGoalTarget(g)}
          </div>
          <div className="muted small" style={{ fontWeight: 700 }}>
            {g.startDate || g.deadline
              ? `Período: ${g.startDate ? formatDateBR(g.startDate) : 'início'} a ${g.deadline ? formatDateBR(g.deadline) : 'sem prazo'}`
              : 'Sem período definido'}
            {p.daysLeft != null && p.daysLeft >= 0 && g.status === 'andamento' && ` · ${p.daysLeft === 0 ? 'prazo termina hoje' : `${p.daysLeft} ${p.daysLeft === 1 ? 'dia restante' : 'dias restantes'}`}`}
          </div>

          <div className="goal-big">
            <div className="v">{p.label}</div>
            <div className="pct">{Math.round(p.pct * 100)}%</div>
          </div>
          <Progress pct={p.pct} tone={tone} label="Progresso" />
          <p className="small" style={{ margin: '10px 0 0' }}>{p.detail}</p>
          {g.type === 'tempo' && <p className="note">Percentual = proximidade da marca (alvo ÷ melhor tempo oficial). Chega a 100% quando o tempo fica abaixo do alvo.</p>}
        </div>

        {p.note && <div className="alert alert-info small" style={{ marginTop: 12 }}><IconInfo /><div>{p.note}</div></div>}
        {p.expired && g.status === 'andamento' && !p.achieved && (
          <div className="alert alert-warn small" style={{ marginTop: 12 }}><div>O prazo terminou em {formatDateBR(g.deadline)}. Você pode ajustar o prazo, pausar ou marcar como concluído.</div></div>
        )}
        {p.achieved && g.status === 'andamento' && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setStatus('concluido')}><IconCheck /> Marcar como concluído</button>
        )}

        {g.type === 'tempo' && g.status !== 'concluido' && (
          <>
            <div className="section-title"><h2>Plano</h2></div>
            <GoalPlan goal={g} races={races} />
          </>
        )}

        {g.type === 'manual' && (
          <>
            <div className="section-title"><h2>Atualizar progresso</h2></div>
            <div className="card">
              <div className="grid-2-1">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="manual-value">Progresso atual{goalUnit(g) ? ` (${goalUnit(g)})` : ''}</label>
                  <input id="manual-value" className="input" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} aria-invalid={manualErr ? 'true' : 'false'} />
                </div>
                <button className="btn btn-dark" style={{ alignSelf: 'end' }} onClick={() => saveManual(manual)}>Salvar</button>
              </div>
              {manualErr && <div className="err" role="alert">{manualErr}</div>}
              <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => saveManual(String((g.manualValue ?? 0) + 1))}>+1{goalUnit(g) ? ` ${goalUnit(g)}` : ''}</button>
            </div>
          </>
        )}

        {p.auto && (
          <>
            <div className="section-title"><h2>{g.type === 'orcamento' ? 'Inscrições consideradas' : 'Provas consideradas'}</h2></div>
            {p.races.length === 0 ? (
              <div className="card muted small">Nenhuma prova registrada conta para este objetivo ainda.</div>
            ) : (
              <div className="card">
                <ul className="plain-list">
                  {p.races.map((r) => (
                    <li key={r.id}>
                      <Link to={`/corridas/${r.id}`}>{r.name}</Link>
                      <span className="muted small"> · {formatDateBR(r.date)}</span>
                      <span className="right">{raceLine(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="section-title"><h2>Status</h2></div>
        <div className="seg" role="group" aria-label="Alterar status do objetivo">
          {GOAL_STATUSES.map((s) => (
            <button key={s.id} type="button" aria-pressed={g.status === s.id} onClick={() => g.status !== s.id && setStatus(s.id)}><span aria-hidden="true">{s.icon} </span>{s.label}</button>
          ))}
        </div>

        {g.notes && (
          <>
            <div className="section-title"><h2>Observações</h2></div>
            <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{g.notes}</div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <Link to={`/objetivos/${g.id}/editar`} className="btn"><IconEdit /> Editar</Link>
          <button className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>
        </div>
      </div>
    </>
  )
}
