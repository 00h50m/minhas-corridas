// Modo "dia da prova": o essencial numa tela só, funcionando sem internet.
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getRace, useStore } from '../services/store.js'
import { TopBar } from '../components/ui.jsx'
import { IconExternal, IconPin, IconStopwatch } from '../components/Icons.jsx'
import Checklist from '../components/Checklist.jsx'
import { useProfile } from '../services/profile.js'
import { ageOn } from '../lib/profile.js'
import { PaceTable } from '../components/Analysis.jsx'
import { PredictionCard } from '../components/Prediction.jsx'
import { countdownLabel, daysBetween, formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatPace } from '../lib/format.js'

/** Minutos até HH:MM de hoje (negativo se já passou). */
function minutesUntil(hm, now = new Date()) {
  if (!hm) return null
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes())
}
function untilLabel(min) {
  if (min == null) return ''
  if (min <= 0) return 'agora'
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  return `em ${h}h${String(min % 60).padStart(2, '0')}`
}

export function mapsLink(r) {
  const q = [r.venueAddress || r.venueName, r.city, r.state].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/** Mantém a tela acesa enquanto ligado (quando o navegador permite). */
function useWakeLock(on) {
  const lock = useRef(null)
  useEffect(() => {
    if (!on || !navigator.wakeLock) return
    let alive = true
    const get = () => navigator.wakeLock.request('screen').then((l) => (alive ? (lock.current = l) : l.release())).catch(() => {})
    get()
    const onVis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      lock.current?.release().catch(() => {})
      lock.current = null
    }
  }, [on])
}

export default function RaceDay() {
  const { id } = useParams()
  const { races } = useStore()
  const em = useProfile().data
  const r = getRace(id)
  const [, tick] = useState(0)
  const [awake, setAwake] = useState(false)
  useWakeLock(awake)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!r) return <Navigate to="/corridas" replace />

  const today = todayISO()
  const d = r.date ? daysBetween(today, r.date) : null
  const isToday = d === 0
  const toStart = isToday ? minutesUntil(r.startTime) : null
  const toLeave = isToday ? minutesUntil(r.leaveHomeTime) : null
  const started = isToday && toStart != null && toStart <= 0
  const map = mapsLink(r)
  const place = [r.venueName, [r.city, r.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')
  const kitPending = r.kitPickupDate && r.kitPickupDate >= today && !(r.checklist ?? []).some((i) => i.done && /kit retirado/i.test(i.text))

  return (
    <>
      <TopBar title="Dia da prova" back={`/corridas/${r.id}`} />
      <div className="page race-day">
        <div className="hero">
          <div className="eyebrow">{r.date ? formatDateBR(r.date) : 'Data a confirmar'}{r.distanceKm ? ` · ${formatKm(r.distanceKm)}` : ''}</div>
          <div className="count">{isToday ? (r.startTime ? (started ? 'Boa prova!' : `Largada ${untilLabel(toStart)}`) : 'É hoje!') : r.date ? countdownLabel(r.date, today) : ''}</div>
          <div className="name">{r.name}</div>
          {r.startTime && <div className="meta">Largada às {r.startTime}{r.leaveHomeTime ? ` · sair de casa às ${r.leaveHomeTime}${isToday && toLeave > 0 ? ` (${untilLabel(toLeave)})` : ''}` : ''}</div>}
        </div>

        {r.bibNumber && (
          <div className="card bib" aria-label={`Número de peito ${r.bibNumber}`}>
            <div className="l">Número de peito</div>
            <div className="v">{r.bibNumber}</div>
          </div>
        )}

        {(place || map) && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="list-group-title" style={{ marginTop: 0 }}>Largada</div>
            {place && <div style={{ fontWeight: 800 }}>{place}</div>}
            {r.venueAddress && <div className="muted small">{r.venueAddress}</div>}
            {map && <a className="btn btn-block" style={{ marginTop: 10 }} href={map} target="_blank" rel="noreferrer"><IconPin /> Abrir no mapa</a>}
          </div>
        )}

        {kitPending && (
          <div className="alert alert-warn" style={{ marginTop: 12 }}>
            <div><b>Kit ainda não retirado.</b> {formatDateBR(r.kitPickupDate)}{r.kitPickupTime ? ` · ${r.kitPickupTime}` : ''}{r.kitPickupAddress ? ` · ${r.kitPickupAddress}` : ''}</div>
          </div>
        )}

        {started && (
          <Link to={`/corridas/${r.id}/resultado`} className="btn btn-primary btn-block" style={{ marginTop: 12 }}><IconStopwatch /> Terminei! Registrar resultado</Link>
        )}

        <div className="section-title"><h2>Ritmo</h2></div>
        {r.targetTime && r.distanceKm ? (
          <div className="card">
            <div className="plan-head">
              <div><div className="v">{formatPace(r.targetTime / r.distanceKm)}</div><div className="l">pace da meta</div></div>
              <div><div className="v">{formatDuration(r.targetTime)}</div><div className="l">meta</div></div>
            </div>
            <PaceTable targetSec={r.targetTime} km={r.distanceKm} caption="Passagens para a meta" />
          </div>
        ) : r.distanceKm ? (
          <PredictionCard races={races} km={r.distanceKm} excludeId={r.id} />
        ) : (
          <div className="card muted small">Informe a distância e uma meta para ver o pace e as passagens. <Link to={`/corridas/${r.id}/editar`}>Editar prova</Link></div>
        )}

        <div className="section-title"><h2>Emergência</h2></div>
        {em.emergencyName || em.emergencyPhone || em.bloodType ? (
          <div className="card emergency-card" data-testid="emergency">
            <div className="em-row">
              <div style={{ minWidth: 0 }}>
                {em.emergencyName && <div style={{ fontWeight: 800 }}>{em.emergencyName}</div>}
                {em.emergencyPhone && <a href={`tel:${em.emergencyPhone.replace(/[^\d+]/g, '')}`} style={{ fontWeight: 800 }}>{em.emergencyPhone}</a>}
                {(em.name || em.nickname) && <div className="muted small">Atleta: {em.name || em.nickname}{em.birthDate ? ` · ${ageOn(em.birthDate, today)} anos` : ''}</div>}
              </div>
              {em.bloodType && <div className="blood" aria-label={`Tipo sanguíneo ${em.bloodType}`}>{em.bloodType}</div>}
            </div>
          </div>
        ) : (
          <div className="card muted small">Sem contato de emergência. <Link to="/perfil">Adicionar no perfil</Link> — aparece aqui no dia da prova.</div>
        )}

        <div className="section-title"><h2>Checklist</h2></div>
        <Checklist race={r} />

        {'wakeLock' in navigator && (
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={awake} onChange={(e) => setAwake(e.target.checked)} />
            Manter a tela acesa nesta página
          </label>
        )}
        <p className="note">Tudo aqui fica salvo no aparelho e funciona sem internet (só o mapa precisa de conexão).</p>
        {r.signupUrl && <a className="btn btn-ghost btn-block" href={r.signupUrl} target="_blank" rel="noreferrer"><IconExternal /> Página da prova</a>}
      </div>
    </>
  )
}
