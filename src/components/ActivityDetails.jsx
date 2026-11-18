// Detalhes da atividade do relógio para qualquer esporte: números principais, efeito do treino,
// séries de força, parciais por km e o percurso no mapa.
import { lazy, Suspense } from 'react'
import { fmtSec, isRun } from '../lib/workout.js'
import { groupSets, speedLabel, teLabel } from '../lib/strength.js'

const RouteMap = lazy(() => import('./RouteMap.jsx'))
const nf = (n, d = 2) => String(Number(n).toFixed(d)).replace('.', ',')

function Stat({ v, l }) {
  return <div className="det-stat"><b>{v}</b><span>{l}</span></div>
}

function Effect({ label, v }) {
  if (!(v > 0)) return null
  return (
    <div className="det-te">
      <div className="small"><b>{label}</b> <span className="muted">{nf(v, 1)} · {teLabel(v)}</span></div>
      <div className="det-te-bar" role="img" aria-label={`${label} ${nf(v, 1)} de 5`}><span style={{ width: `${Math.min(100, (v / 5) * 100)}%` }} /></div>
    </div>
  )
}

export default function ActivityDetails({ w }) {
  const r = w.result
  const sport = w.sport ?? 'corrida'
  const hasKm = r.distanceKm > 0
  const speed = hasKm ? speedLabel(sport, r.distanceKm, r.elapsedSec) : null
  const strength = r.sets?.length ? groupSets(r.sets) : null
  const splits = (r.splits ?? []).filter((s) => !s.partial)
  const best = splits.length ? Math.min(...splits.map((s) => s.sec)) : null
  const worst = splits.length ? Math.max(...splits.map((s) => s.sec)) : null
  return (
    <div className="activity-details" data-testid="activity-details">
      <div className="det-grid">
        {r.elapsedSec > 0 && <Stat v={fmtSec(r.elapsedSec)} l="duração" />}
        {hasKm && <Stat v={`${nf(r.distanceKm)} km`} l="distância" />}
        {speed && <Stat v={speed} l={sport === 'bike' ? 'velocidade média' : 'pace médio'} />}
        {r.avgHr && <Stat v={r.avgHr} l="FC média" />}
        {r.maxHr && <Stat v={r.maxHr} l="FC máxima" />}
        {r.calories && <Stat v={r.calories} l="kcal" />}
        {r.elevGainM > 0 && <Stat v={`${r.elevGainM} m`} l="subida" />}
        {r.cadence && <Stat v={r.cadence} l={isRun(w) ? 'passos/min' : 'cadência'} />}
        {strength && <Stat v={strength.totals.sets} l="séries" />}
      </div>

      {(r.aerobicTE > 0 || r.anaerobicTE > 0) && (
        <div className="det-block" data-testid="det-te">
          <div className="det-title">Efeito do treino</div>
          <Effect label="Aeróbico" v={r.aerobicTE} />
          <Effect label="Anaeróbico" v={r.anaerobicTE} />
        </div>
      )}

      {strength && (
        <div className="det-block" data-testid="det-sets">
          <div className="det-title">Séries</div>
          <ul className="det-sets">
            {strength.groups.map((g, i) => (
              <li key={i}>
                <b>{g.name}</b>
                <span className="muted small">{g.sets} {g.sets === 1 ? 'série' : 'séries'}{g.reps.length ? ` · ${g.reps.join(', ')} reps` : ''}{g.maxKg ? ` · até ${String(g.maxKg).replace('.', ',')} kg` : ''}</span>
              </li>
            ))}
          </ul>
          <div className="small muted">{strength.totals.reps} repetições{strength.totals.volume ? ` · volume ${strength.totals.volume.toLocaleString('pt-BR')} kg` : ''}</div>
        </div>
      )}

      {splits.length > 1 && (
        <div className="det-block" data-testid="det-splits">
          <div className="det-title">Parciais por km</div>
          <table className="splits">
            <tbody>
              {splits.map((s) => (
                <tr key={s.km} className={s.sec === best && best !== worst ? 'fast' : s.sec === worst && best !== worst ? 'slow' : ''}>
                  <th scope="row">{s.km}</th>
                  <td>{fmtSec(s.sec)}</td>
                  <td className="bar-cell" aria-hidden="true"><span style={{ width: `${30 + 70 * (1 - (s.sec - best) / Math.max(1, worst - best))}%` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.track && (
        <div className="det-block">
          <div className="det-title">Percurso</div>
          <Suspense fallback={null}><RouteMap polyline={r.track} height={220} testid="det-map" /></Suspense>
          <div className="note" style={{ margin: '4px 0 0' }}>Sem os primeiros e os últimos 200 m.</div>
        </div>
      )}
    </div>
  )
}
