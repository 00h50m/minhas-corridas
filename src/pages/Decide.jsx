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
import { useProfile } from '../services/profile.js'
import { PROFILES, rankByWorth, typicalPerKm, worthScore } from '../lib/worth.js'

const PROFILE_KEY = 'paceon:perfil-decisao'
const readProfile = () => { try { const v = localStorage.getItem(PROFILE_KEY); return PROFILES.some((p) => p.id === v) ? v : 'equilibrio' } catch { return 'equilibrio' } }

export const decideMemo = { sort: 'nota', selected: new Set() }

const SORTS = [
  { id: 'nota', label: 'Vale a pena' },
  { id: 'prazo', label: 'Prazo' },
  { id: 'data', label: 'Data' },
  { id: 'vontade', label: 'Vontade' }
]

export default function Decide() {
  const { races, goals } = useStore()
  const prof = useProfile()
  const today = todayISO()
  const [wp, setWpState] = useState(readProfile)
  const setWp = (v) => { setWpState(v); try { localStorage.setItem(PROFILE_KEY, v) } catch { /* ok */ } }
  const [sort, setSortState] = useState(decideMemo.sort)
  const setSort = (s) => { decideMemo.sort = s; setSortState(s) }
  const [selected, setSelectedState] = useState(() => new Set(decideMemo.selected))
  const setSelected = (s) => { decideMemo.selected = s; setSelectedState(s) }

  const listData = useMemo(() => {
    const typical = typicalPerKm(races)
    const items = candidates(races, today).map((r) => { const d = decisionInfo(r, { races, goals, today }); return { r, d, w: worthScore(d, { races, homeCity: prof?.data?.city ?? '', typical, profile: wp }) } })
    const byDeadline = (x) => x.d.deadline?.date ?? x.r.date ?? '9999'
    const cmp = {
      prazo: (a, b) => (byDeadline(a) < byDeadline(b) ? -1 : byDeadline(a) > byDeadline(b) ? 1 : byDateAsc(a.r, b.r)),
      data: (a, b) => byDateAsc(a.r, b.r),
      vontade: (a, b) => (b.r.wish ?? 0) - (a.r.wish ?? 0) || byDateAsc(a.r, b.r)
    }[sort]
    const ranked = rankByWorth(items)
    return { items: sort === 'nota' ? ranked.sorted : items.sort(cmp), top: ranked.top }
  }, [races, goals, today, sort, wp, prof?.data?.city])
  const list = listData.items

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
            {sort === 'nota' && (
              <div className="worth-prof" data-testid="worth-profile">
                <span className="muted small">O que pesa mais:</span>
                <div className="seg seg-sm" role="group" aria-label="Perfil da nota">
                  {PROFILES.map((p) => <button key={p.id} type="button" aria-pressed={wp === p.id} onClick={() => setWp(p.id)} data-testid={`worth-${p.id}`}>{p.label}</button>)}
                </div>
              </div>
            )}
            <p className="note" style={{ marginTop: 0 }}>Marque as que está pensando em fazer para simular o total. Tocar nas estrelas registra o quanto você quer cada uma (e entra na nota).</p>
            {list.map(({ r, d, w }) => (
              <div key={r.id} className={`card cand${selected.has(r.id) ? ' picked' : ''}${listData.top === r.id ? ' top' : ''}`} data-testid="candidate">
                {listData.top === r.id && <div className="worth-top" data-testid="worth-top">Vale mais a pena</div>}
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
                <div className="worth" data-testid="worth">
                  <span className={`worth-score${w.score == null ? ' none' : w.score >= 70 ? ' hi' : w.score >= 45 ? ' mid' : ' lo'}${w.provisional ? ' prov' : ''}`} title={w.provisional ? 'Nota provisória: falta o preço' : 'Nota de 0 a 100'}>{w.score ?? '—'}{w.provisional && w.score != null ? '*' : ''}</span>
                  <div className="worth-why small">
                    {w.score == null ? <span className="muted">Sem dados para dar nota: cadastre {w.missing.join(', ')}.</span> : (
                      <>
                        {w.best.map((t) => <span key={t} className="fl-good">{t}</span>)}
                        {w.caveat && <span className="fl-bad">{w.caveat}</span>}
                        {w.missing.length > 0 && <span className="muted">Falta: {w.missing.join(', ')}</span>}
                      </>
                    )}
                  </div>
                </div>
                <ul className="flags">
                  {decisionFlags(d).map((f, i) => <li key={i} className={`fl-${f.tone}`}>{f.text}</li>)}
                </ul>
                <details className="cand-more">
                  <summary>Ver todos os fatores</summary>
                  {w.parts.length > 0 && (
                    <ul className="worth-parts" data-testid="worth-parts">
                      {w.parts.map((p) => (
                        <li key={p.key}>
                          <span className="wp-l">{p.label}</span>
                          <span className="wp-bar"><span className={`wp-${p.tone}`} style={{ width: `${Math.round(p.value * 100)}%` }} /></span>
                          <span className="wp-t muted small">{p.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <DecisionDetails race={r} races={races} goals={goals} today={today} />
                  <DecisionActions race={r} />
                </details>
              </div>
            ))}
            <p className="note">A nota (0 a 100) junta os critérios com os pesos do perfil escolhido; o que não tem informação fica de fora. O app mostra os fatores; a escolha é sua. Intervalos entre provas são só informação de calendário, não recomendação de treino.</p>
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
