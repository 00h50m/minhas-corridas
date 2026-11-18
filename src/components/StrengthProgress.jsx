// Evolução na academia: por exercício, a carga máxima (ou o volume, sem carga) ao longo dos treinos com
// séries do relógio, o recorde e o histórico num toque. Mais “último treino de força: há N dias”.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from './ui.jsx'
import { IconDumbbell } from './Icons.jsx'
import { kgLabel, strengthHistory, strengthRecency } from '../lib/strength.js'
import { formatDateBR } from '../lib/dates.js'

const nf = (n) => n.toLocaleString('pt-BR')
const ago = (d) => (d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`)

/** Linha da evolução (carga máxima, ou volume quando não há carga). */
function Spark({ values, w = 96, h = 30 }) {
  if (values.length < 2) return <svg width={w} height={h} aria-hidden="true" className="sp-spark" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [3 + (i * (w - 6)) / (values.length - 1), h - 4 - ((v - min) / span) * (h - 8)])
  const last = pts.at(-1)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="sp-spark">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  )
}

export default function StrengthProgress({ workouts, today }) {
  const [open, setOpen] = useState(null)
  const hist = strengthHistory(workouts)
  const rec = strengthRecency(workouts, today)
  if (!hist.length && !rec) return null
  const shown = hist.slice(0, 6)
  const ex = open ? hist.find((h) => h.name === open) : null
  return (
    <div className="card sp-card" style={{ marginTop: 10 }} data-testid="strength-progress">
      <div className="sp-head">
        <span className="sp-ic"><IconDumbbell /></span>
        <div>
          <b>Evolução na academia</b>
          {rec && <div className="small muted" data-testid="sp-recency">Último treino de força {ago(rec.days)} · {rec.in4w} nas últimas 4 semanas</div>}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>Importe o arquivo do relógio de um treino de força (ou use “Rever os últimos 30 dias” no Garmin) para ver a evolução de cada exercício.</p>
      ) : (
        <div className="sp-list">
          {shown.map((h) => {
            const useKg = h.bestKg != null
            const vals = h.sessions.map((s) => (useKg ? s.maxKg : s.volume || s.reps)).filter((v) => v != null)
            const up = useKg && h.firstKg != null && h.lastKg > h.firstKg
            return (
              <button key={h.name} type="button" className="sp-row" onClick={() => setOpen(h.name)} data-testid="sp-row">
                <span className="sp-name"><b>{h.name}</b><span className="muted small">{h.sessions.length} {h.sessions.length === 1 ? 'treino' : 'treinos'}{useKg ? ` · recorde ${kgLabel(h.bestKg)}` : ''}</span></span>
                <Spark values={vals} />
                <span className={`sp-delta${up ? ' up' : ''}`}>
                  {useKg ? (h.sessions.length > 1 && h.firstKg !== h.lastKg ? `${String(h.firstKg).replace('.', ',')} → ${kgLabel(h.lastKg)}` : kgLabel(h.lastKg)) : `${h.sessions.at(-1).reps} reps`}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {ex && (
        <Sheet title={ex.name} onClose={() => setOpen(null)}>
          <div data-testid="sp-sheet">
            <div className="stats" style={{ marginBottom: 10 }}>
              <div className="stat"><div className="v">{ex.sessions.length}</div><div className="l">{ex.sessions.length === 1 ? 'treino' : 'treinos'}</div></div>
              <div className="stat"><div className="v">{ex.bestKg != null ? kgLabel(ex.bestKg) : '—'}</div><div className="l">recorde de carga</div></div>
              <div className="stat"><div className="v">{ex.bestVolume ? nf(ex.bestVolume) : '—'}</div><div className="l">maior volume (kg)</div></div>
            </div>
            <div className="sp-table">
              {[...ex.sessions].reverse().map((s) => (
                <Link key={s.workoutId + s.date} to={`/treinos/${s.workoutId}`} className="sp-trow">
                  <span>{formatDateBR(s.date)}</span>
                  <span>{s.sets} {s.sets === 1 ? 'série' : 'séries'}{s.reps ? ` · ${s.reps} reps` : ''}</span>
                  <b>{s.maxKg && s.maxKg === ex.bestKg && s.date === ex.bestKgDate && <span className="sp-pr">recorde</span>}{s.maxKg ? kgLabel(s.maxKg) : ''}</b>
                </Link>
              ))}
            </div>
            <p className="note">Carga máxima por treino, das séries registradas no relógio. O app mostra sua evolução; ele não prescreve cargas.</p>
          </div>
        </Sheet>
      )}
    </div>
  )
}
