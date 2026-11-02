import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { DateTile, EmptyState, StatusBadge, TopBar } from '../components/ui.jsx'
import { IconStopwatch } from '../components/Icons.jsx'
import { addDaysISO, formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace, paceSeconds } from '../lib/format.js'
import { periodCosts } from '../lib/costs.js'
import { distanceLabel, history, recordsByDistance } from '../lib/stats.js'

export const memo = { tab: 'provas', period: null }

export default function History() {
  const { races } = useStore()
  const [tab, setTabState] = useState(memo.tab)
  const setTab = (t) => { memo.tab = t; setTabState(t) }
  const list = history(races)
  const records = recordsByDistance(races)
  const withTarget = list.filter((r) => r.targetTime)

  const noResults = (
    <EmptyState
      title="Nenhum resultado ainda"
      text="Quando você concluir uma prova e registrar o tempo, seu histórico, recordes e evolução aparecem aqui."
      action={<Link to="/corridas?concluir=1" className="btn btn-dark btn-block"><IconStopwatch /> Registrar resultado</Link>}
    />
  )

  return (
    <>
      <TopBar title="Histórico" sub={list.length ? `${list.length} ${list.length === 1 ? 'prova concluída' : 'provas concluídas'}` : null} />
      <div className="page">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'provas'} onClick={() => setTab('provas')}>Provas</button>
          <button role="tab" aria-selected={tab === 'recordes'} onClick={() => setTab('recordes')}>Recordes</button>
          <button role="tab" aria-selected={tab === 'gastos'} onClick={() => setTab('gastos')}>Gastos</button>
        </div>

        {tab === 'gastos' ? (
          <Costs races={races} />
        ) : list.length === 0 ? (
          <div style={{ marginTop: 12 }}>{noResults}</div>
        ) : tab === 'provas' ? (
          <div style={{ marginTop: 12 }}>
            {list.map((r) => {
              const res = r.result
              const pace = paceSeconds(res.netTime, res.officialDistanceKm)
              const diff = r.targetTime ? res.netTime - r.targetTime : null
              return (
                <Link key={r.id} to={`/corridas/${r.id}`} className="race-item b-concluida">
                  <DateTile date={r.date} />
                  <div className="race-body">
                    <div className="t">{r.name}</div>
                    <div className="s">{formatKm(res.officialDistanceKm)} oficiais{res.watchDistanceKm ? ` · ${formatKm(res.watchDistanceKm)} no relógio` : ''}</div>
                    <div className="row">
                      <span className="chip" style={{ fontWeight: 800 }}>⏱ {formatDuration(res.netTime)}</span>
                      <span className="chip">{formatPace(pace)}</span>
                      {!res.isOfficial && <span className="flag flag-info">Registro pessoal</span>}
                      {diff != null && <span className={`flag ${diff <= 0 ? 'flag-ok' : 'flag-warn'}`}>{diff <= 0 ? '✓ Meta batida' : `Meta +${formatDuration(diff)}`}</span>}
                    </div>
                  </div>
                </Link>
              )
            })}
            {withTarget.length > 0 && (
              <p className="note">Meta x resultado: {withTarget.filter((r) => r.result.netTime <= r.targetTime).length} de {withTarget.length} metas de tempo batidas.</p>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p className="note" style={{ marginTop: 0 }}>Recordes por distância oficial, usando tempo líquido. Distâncias diferentes não são comparadas entre si.</p>
            {records.map((g) => <RecordCard key={g.key} g={g} />)}
          </div>
        )}
      </div>
    </>
  )
}

function Costs({ races }) {
  const today = todayISO()
  const y = Number(today.slice(0, 4))
  const presets = [
    { id: 'ano', label: String(y), from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'ant', label: String(y - 1), from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { id: '12m', label: '12 meses', from: addDaysISO(today, -365), to: today },
    { id: 'tudo', label: 'Tudo', from: '', to: '' }
  ]
  const [period, setPeriodState] = useState(memo.period ?? { id: 'ano', from: presets[0].from, to: presets[0].to })
  const setPeriod = (p) => { memo.period = p; setPeriodState(p) }
  const invalid = period.from && period.to && period.from > period.to
  const data = useMemo(() => periodCosts(races, period.from || null, period.to || null), [races, period])
  const max = Math.max(...data.byCat.map((b) => b.total), 1)

  return (
    <div style={{ marginTop: 12 }}>
      <div className="seg" role="group" aria-label="Período">
        {presets.map((p) => (
          <button type="button" key={p.id} aria-pressed={period.id === p.id} onClick={() => setPeriod({ id: p.id, from: p.from, to: p.to })}>{p.label}</button>
        ))}
        <button type="button" aria-pressed={period.id === 'custom'} onClick={() => setPeriod({ ...period, id: 'custom' })}>Personalizado</button>
      </div>
      {period.id === 'custom' && (
        <div className="grid-2" style={{ marginTop: 10 }}>
          <input type="date" className="input" aria-label="De" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} aria-invalid={invalid ? 'true' : 'false'} />
          <input type="date" className="input" aria-label="Até" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} aria-invalid={invalid ? 'true' : 'false'} />
        </div>
      )}
      {invalid ? (
        <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>A data inicial é depois da final.</div>
      ) : (
        <>
          <div className="card cost-hero" style={{ marginTop: 12 }}>
            <div className="small muted" style={{ fontWeight: 700 }}>
              {period.from || period.to ? `${period.from ? formatDateBR(period.from) : 'Início'} a ${period.to ? formatDateBR(period.to) : 'hoje e depois'}` : 'Todo o período'}
            </div>
            <div className="v">{formatMoney(data.total)}</div>
            <div className="small">
              <b>{formatMoney(data.paid)}</b> pagos{data.estimated > 0 && <> · <b>{formatMoney(data.estimated)}</b> estimados (ainda sem valor pago)</>}
            </div>
            <div className="cat-bars">
              {data.byCat.map((b) => (
                <div key={b.id} className="cat-bar">
                  <div className="lbl"><span>{b.label}</span><b>{formatMoney(b.total)}</b></div>
                  <div className="bar" aria-hidden="true">
                    <span className="paid" style={{ width: `${(b.paid / max) * 100}%` }} />
                    <span className="est" style={{ width: `${(b.estimated / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span><span className="sw paid" /> Pago</span>
              <span><span className="sw est" /> Estimado</span>
            </div>
          </div>

          {data.rows.length === 0 ? (
            <div className="card muted small" style={{ marginTop: 12 }}>Nenhum gasto registrado neste período. Informe os valores no cadastro da corrida (Inscrição e valores; Transporte, hospedagem e outros).</div>
          ) : (
            <>
              <div className="list-group-title">Por corrida</div>
              {data.rows.map((row) => (
                <Link key={row.race.id} to={`/corridas/${row.race.id}`} className={`race-item b-${row.race.status}`}>
                  <DateTile date={row.race.date} />
                  <div className="race-body">
                    <div className="t">{row.race.name}</div>
                    <div className="s">{row.lines.filter((l) => l.counted != null).map((l) => `${l.label} ${formatMoney(l.counted)}${l.isEstimate ? '*' : ''}`).join(' · ')}</div>
                    <div className="row">
                      <StatusBadge status={row.race.status} />
                      <span className="chip" style={{ fontWeight: 800 }}>{formatMoney(row.total)}</span>
                      {row.estimatedPart > 0 && <span className="flag flag-warn">inclui estimativa</span>}
                    </div>
                  </div>
                </Link>
              ))}
              <p className="note">* valor estimado, sem pagamento informado.</p>
            </>
          )}
          {data.planned > 0 && (
            <p className="note">Previsão fora do total: {formatMoney(data.planned)} em {data.plannedCount} {data.plannedCount === 1 ? 'prova' : 'provas'} de interesse ou com inscrição aberta.</p>
          )}
          {data.undatedWithCost > 0 && <p className="note">{data.undatedWithCost} {data.undatedWithCost === 1 ? 'prova com custo está' : 'provas com custo estão'} sem data e não entram em nenhum período.</p>}
          <p className="note">Entram provas inscritas e concluídas (pago ou, na falta, estimado). Desistências e cancelamentos entram só com o valor pago.</p>
        </>
      )}
    </div>
  )
}

function RecordCard({ g }) {
  const best = g.bestOfficial
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="pr-card">
        <div className="dist">{distanceLabel(g.key)}</div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          {best ? (
            <>
              <div className="time">{formatDuration(best.result.netTime)}</div>
              <div className="small muted">{formatPace(paceSeconds(best.result.netTime, best.result.officialDistanceKm))} · {best.name} · {formatDateBR(best.date)}</div>
            </>
          ) : (
            <div className="small muted">Sem resultado oficial nesta distância.</div>
          )}
        </div>
      </div>
      {g.bestPersonal && (
        <div className="alert alert-info small" style={{ marginTop: 10 }}>
          <div>
            <b>Registro pessoal (não oficial): {formatDuration(g.bestPersonal.result.netTime)}</b> em {g.bestPersonal.name}, {formatDateBR(g.bestPersonal.date)}.
          </div>
        </div>
      )}
      {g.evolution.length >= 2 ? <Evolution points={g.evolution} /> : <p className="note">Corra esta distância mais vezes para ver sua evolução.</p>}
    </div>
  )
}

function Evolution({ points }) {
  const W = 320, H = 120, P = { l: 8, r: 8, t: 14, b: 22 }
  const times = points.map((p) => p.netTime)
  const min = Math.min(...times), max = Math.max(...times)
  const span = Math.max(max - min, 30)
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (points.length - 1)
  // Tempo menor fica mais alto: melhorar = subir.
  const y = (t) => P.t + ((t - min) / span) * (H - P.t - P.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.netTime).toFixed(1)}`).join(' ')
  const first = points[0], last = points[points.length - 1]
  const delta = last.netTime - first.netTime
  return (
    <div style={{ marginTop: 12 }}>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolução: de ${formatDuration(first.netTime)} para ${formatDuration(last.netTime)}`}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b + 6} y2={H - P.b + 6} stroke="var(--line)" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.netTime)} r="5" fill={p.isOfficial ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth="2.5">
            <title>{`${p.name} · ${formatDateBR(p.date)} · ${formatDuration(p.netTime)}${p.isOfficial ? '' : ' (registro pessoal)'}`}</title>
          </circle>
        ))}
        <text x={P.l} y={H - 4} fontSize="11" fill="var(--ink-3)">{formatDateBR(first.date)}</text>
        <text x={W - P.r} y={H - 4} fontSize="11" fill="var(--ink-3)" textAnchor="end">{formatDateBR(last.date)}</text>
      </svg>
      <div className="small muted">
        {points.length} provas · {delta < 0 ? `${formatDuration(-delta)} mais rápida que a primeira` : delta > 0 ? `${formatDuration(delta)} acima da primeira` : 'mesmo tempo da primeira'}. Ponto vazado = registro pessoal.
      </div>
    </div>
  )
}
