// Zonas de frequência cardíaca: barra com o tempo em cada zona, legenda e a leitura do treino.
import { Link } from 'react-router-dom'
import { useProfile } from '../services/profile.js'
import { useStore } from '../services/store.js'
import { ZONE_COLORS, ZONE_NAMES, timeInZones, zoneRead, zonesFor } from '../lib/hrZones.js'
import { HR_FROM, HR_STEP } from '../lib/activityFile.js'
import { todayISO } from '../lib/dates.js'

/** Zonas em uso (do perfil, do Garmin, da maior FC registrada ou da idade). */
export function useZones() {
  const prof = useProfile()
  const { races, workouts } = useStore()
  const maxes = [
    ...races.map((r) => r.result?.watch?.maxHr).filter((x) => x > 100),
    ...workouts.map((w) => {
      const h = w.result?.hrHist
      if (!h) return null
      const top = h.map((s, i) => (s >= 10 ? i : -1)).filter((i) => i >= 0).pop()
      return top != null ? HR_FROM + top * HR_STEP + HR_STEP - 1 : null
    }).filter((x) => x > 100)
  ]
  return zonesFor(prof?.data?.hr, { observedMax: maxes.length ? Math.max(...maxes) : null, observedCount: maxes.length, birthDate: prof?.data?.birthDate, today: todayISO() })
}

const mins = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}` : `${Math.round(s / 60)} min`)

/** Barra + legenda. hasIntervals: treino com tiros (muda a leitura). title: opcional. */
export default function HrZones({ hist, hasIntervals = false, title = 'Zonas de frequência cardíaca', compact = false }) {
  const zones = useZones()
  if (!hist) return null
  if (!zones) {
    return (
      <div className="hrz small" data-testid="hrz-nozones">
        <b>{title}</b>
        <div className="muted">Para ver o tempo em cada zona, informe sua FC máxima (ou importe as zonas do Garmin) em <Link to="/perfil#fc">Perfil → Frequência cardíaca</Link>.</div>
      </div>
    )
  }
  const t = timeInZones(hist, zones)
  if (!t) return null
  const read = zoneRead(t, { hasIntervals })
  return (
    <div className="hrz" data-testid="hrz">
      <div className="small">{compact ? <span className="muted">{title}</span> : <b>{title}</b>}</div>
      <div className="hrz-bar" role="img" aria-label={t.pct.map((p, i) => `Z${i + 1} ${p}%`).join(', ')}>
        {t.sec.map((s, i) => s > 0 && <span key={i} style={{ width: `${(s / t.total) * 100}%`, background: ZONE_COLORS[i] }} />)}
      </div>
      {!compact && (
        <ul className="hrz-legend small">
          {t.sec.map((s, i) => (
            <li key={i}><span className="hrz-dot" style={{ background: ZONE_COLORS[i] }} /><span>{ZONE_NAMES[i]} <span className="muted">({zones.floors[i]}{i < 4 ? `–${zones.floors[i + 1] - 1}` : '+'})</span></span><b>{t.pct[i]}%</b><span className="muted">{s ? mins(s) : '—'}</span></li>
          ))}
        </ul>
      )}
      {read && <div className={`small hrz-read hrz-${read.tone}`} data-testid="hrz-read">{read.text}</div>}
      {!compact && <div className="note" style={{ margin: '4px 0 0' }}>{zones.label}. <Link to="/perfil#fc">Ajustar</Link></div>}
    </div>
  )
}
