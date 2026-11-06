// Decidir: provas em avaliação lado a lado, com simulação de inscrição.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { DateTile, EmptyState, StatusBadge, TopBar } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import BudgetCard from '../components/Budget.jsx'
import { DecisionActions, DecisionDetails, WishPicker, setWish } from '../components/Decision.jsx'
import { candidates, decisionFlags, decisionInfo, simulate } from '../lib/decision.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { formatKm, formatMoney } from '../lib/format.js'
import { byDateAsc } from '../lib/stats.js'

export const decideMemo = { sort: 'prazo', selected: new Set() }

const SORTS = [
  { id: 'prazo', label: 'Prazo' },
  { id: 'data', label: 'Data' },
  { id: 'vontade', label: 'Vontade' }
]

export default function Decide() {
  const { races, goals } = useStore()
  const today = todayISO()
  const [sort, setSortState] = useState(decideMemo.sort)
  const setSort = (s) => { decideMemo.sort = s; setSortState(s) }
  const [selected, setSelectedState] = useState(() => new Set(decideMemo.selected))
  const setSelected = (s) => { decideMemo.selected = s; setSelectedState(s) }

  const list = useMemo(() => {
    const items = candidates(races, today).map((r) => ({ r, d: decisionInfo(r, { races, goals, today }) }))
    const byDeadline = (x) => x.d.deadline?.date ?? x.r.date ?? '9999'
    const cmp = {
      prazo: (a, b) => (byDeadline(a) < byDeadline(b) ? -1 : byDeadline(a) > byDeadline(b) ? 1 : byDateAsc(a.r, b.r)),
      data: (a, b) => byDateAsc(a.r, b.r),
      vontade: (a, b) => (b.r.wish ?? 0) - (a.r.wish ?? 0) || byDateAsc(a.r, b.r)
    }[sort]
    return items.sort(cmp)
  }, [races, goals, today, sort])

  const chosen = list.filter((x) => selected.has(x.r.id)).map((x) => x.r)
  const sim = chosen.length ? simulate(chosen, { races, goals, today }) : null
  const toggle = (id) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  return (
    <>
      <TopBar title="Decidir" sub={list.length ? `${list.length} ${list.length === 1 ? 'prova em avaliação' : 'provas em avaliação'}` : null} back="/" />
      <div className={`page${sim ? ' has-sim' : ''}`}>
        <BudgetCard goals={goals} races={races} today={today} showEmpty />

        {list.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState
              title="Nenhuma prova em avaliação"
              text="Cadastre provas com status “Tenho interesse” ou “Inscrição aberta”. Aqui você compara custo, orçamento, prazo, calendário e objetivos antes de se inscrever."
              action={<Link to="/corridas/nova" className="btn btn-primary btn-block"><IconPlus /> Cadastrar prova</Link>}
            />
          </div>
        ) : (
          <>
            <div className="section-title">
              <h2>Em avaliação</h2>
              <div className="seg seg-sm" role="group" aria-label="Ordenar por">
                {SORTS.map((s) => <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</button>)}
              </div>
            </div>
            <p className="note" style={{ marginTop: 0 }}>Marque as que está pensando em fazer para simular o total. Tocar nas estrelas registra o quanto você quer cada uma.</p>
            {list.map(({ r, d }) => (
              <div key={r.id} className={`card cand${selected.has(r.id) ? ' picked' : ''}`} data-testid="candidate">
                <div className="cand-top">
                  <label className="cand-check" aria-label={`Simular ${r.name}`}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </label>
                  <DateTile date={r.date} />
                  <div className="cand-body">
                    <Link to={`/corridas/${r.id}`} className="t">{r.name}</Link>
                    <div className="s">{[r.distanceKm && formatKm(r.distanceKm), [r.city, r.state].filter(Boolean).join('/'), d.cost.total != null ? formatMoney(d.cost.total) : 'sem valor'].filter(Boolean).join(' · ')}</div>
                    <div className="row" style={{ marginTop: 6 }}><StatusBadge status={r.status} /><WishPicker compact value={r.wish} onChange={(v) => setWish(r.id, v)} /></div>
                  </div>
                </div>
                <ul className="flags">
                  {decisionFlags(d).map((f, i) => <li key={i} className={`fl-${f.tone}`}>{f.text}</li>)}
                </ul>
                <details className="cand-more">
                  <summary>Ver todos os fatores</summary>
                  <DecisionDetails race={r} races={races} goals={goals} today={today} />
                  <DecisionActions race={r} />
                </details>
              </div>
            ))}
            <p className="note">O app mostra os fatores; a escolha é sua. Intervalos entre provas são só informação de calendário, não recomendação de treino.</p>
          </>
        )}
      </div>

      {sim && (
        <div className="sim-bar" role="status" data-testid="sim-bar">
          <div className="sim-main">
            <b>{sim.count} {sim.count === 1 ? 'prova' : 'provas'} · {formatMoney(sim.cost)}</b>
            {sim.missingCost.length > 0 && <span className="muted"> + {sim.missingCost.length} sem valor</span>}
          </div>
          <div className="sim-sub">
            {sim.budget && <span className={sim.budget.level === 'estourou' ? 'delta-bad' : sim.budget.level === 'atencao' ? 'warn-txt' : 'delta-good'}>Orçamento: {formatMoney(sim.budget.after)} ({Math.round(sim.budget.pct * 100)}%)</span>}
            <span>{sim.yearCount} {sim.yearCount === 1 ? 'prova' : 'provas'} em {sim.year}</span>
            {sim.sameDay.length > 0 && <span className="delta-bad">{sim.sameDay.length} {sim.sameDay.length === 1 ? 'choque de data' : 'choques de data'}: {sim.sameDay.map(([a, b]) => `${a.name} × ${b.name} (${formatDateBR(a.date)})`).join('; ')}</span>}
          </div>
          <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>Limpar</button>
        </div>
      )}
    </>
  )
}
