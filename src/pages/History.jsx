import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { DateTile, EmptyState, TopBar } from '../components/ui.jsx'
import { IconStopwatch } from '../components/Icons.jsx'
import { formatDateBR } from '../lib/dates.js'
import { formatDuration, formatKm, formatPace, paceSeconds } from '../lib/format.js'
import { distanceLabel, history, recordsByDistance } from '../lib/stats.js'

const memo = { tab: 'provas' }

export default function History() {
  const { races } = useStore()
  const [tab, setTabState] = useState(memo.tab)
  const setTab = (t) => { memo.tab = t; setTabState(t) }
  const list = history(races)
  const records = recordsByDistance(races)

  if (list.length === 0) {
    return (
      <>
        <TopBar title="Histórico" />
        <div className="page">
          <EmptyState
            title="Nenhum resultado ainda"
            text="Quando você concluir uma prova e registrar o tempo, seu histórico, recordes e evolução aparecem aqui."
            action={<Link to="/corridas?concluir=1" className="btn btn-dark btn-block"><IconStopwatch /> Registrar resultado</Link>}
          />
        </div>
      </>
    )
  }

  const withTarget = list.filter((r) => r.targetTime)

  return (
    <>
      <TopBar title="Histórico" sub={`${list.length} ${list.length === 1 ? 'prova concluída' : 'provas concluídas'}`} />
      <div className="page">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'provas'} onClick={() => setTab('provas')}>Provas</button>
          <button role="tab" aria-selected={tab === 'recordes'} onClick={() => setTab('recordes')}>Recordes</button>
        </div>

        {tab === 'provas' ? (
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
                      {diff != null && <span className={`flag ${diff <= 0 ? 'flag-info' : 'flag-warn'}`} style={diff <= 0 ? { color: 'var(--ok)', background: 'var(--ok-soft)' } : undefined}>{diff <= 0 ? '✓ Meta batida' : `Meta +${formatDuration(diff)}`}</span>}
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
