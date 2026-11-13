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
import { navLinks, raceSchedule, tripSummary } from '../lib/logistics.js'
import { minToHm } from '../lib/schedule.js'
import Timeline from '../components/Timeline.jsx'
import Pickups from '../components/Pickups.jsx'
import DayGuide from '../components/DayGuide.jsx'
import { daySteps, returnSteps } from '../lib/dayPlan.js'

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
  const [tripSel, setTripSel] = useState(null) // 'ida' | 'volta' escolhido; sem escolha, segue o momento do dia
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
  // Agenda planejada na Logística (se houver)
  const sched = r.logistics?.prep ? raceSchedule(r, em.prep) : null
  const ida = r.logistics ? tripSummary(r, r.logistics, 'ida') : null
  const nav = ida?.points.length >= 2 ? navLinks(ida.points) : null
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nextAct = sched && isToday ? sched.items.find((i) => i.at > nowMin) : sched && d > 0 ? sched.items[0] : null
  const leaveLabel = sched ? minToHm(sched.depart, { withDay: false }) : r.leaveHomeTime
  const toLeaveSched = sched && isToday ? sched.depart - nowMin : toLeave
  // Passo a passo do dia: ida até a largada; depois da largada (ou chegando ao local), a volta.
  const idaSteps = isToday && sched && ida?.complete ? daySteps(sched, ida.points) : []
  const ret = isToday ? returnSteps(r, em.prep) : null
  const dayMarks = r.dayLog?.date === r.date ? r.dayLog.marks : {}
  const idaDone = idaSteps.length > 0 && idaSteps.every((x) => dayMarks[x.key])
  const showTrip = tripSel ?? (started || idaDone || !idaSteps.length ? 'volta' : 'ida')
  const kitPending = r.kitPickupDate && r.kitPickupDate >= today && !(r.checklist ?? []).some((i) => i.done && /kit retirado/i.test(i.text))

  return (
    <>
      <TopBar title="Dia da prova" back={`/corridas/${r.id}`} />
      <div className="page race-day">
        <div className="hero">
          <div className="eyebrow">{r.date ? formatDateBR(r.date) : 'Data a confirmar'}{r.distanceKm ? ` · ${formatKm(r.distanceKm)}` : ''}</div>
          <div className="count">{isToday ? (r.startTime ? (started ? 'Boa prova!' : `Largada ${untilLabel(toStart)}`) : 'É hoje!') : r.date ? countdownLabel(r.date, today) : ''}</div>
          <div className="name">{r.name}</div>
          {r.startTime && <div className="meta">Largada às {r.startTime}{leaveLabel ? ` · sair de casa às ${leaveLabel}${isToday && toLeaveSched > 0 ? ` (${untilLabel(toLeaveSched)})` : ''}` : ''}</div>}
        </div>

        {isToday && (idaSteps.length > 0 || ret?.reason !== 'off') && (
          <div style={{ marginTop: 12 }}>
            <div className="seg seg-sm dg-switch" role="group" aria-label="Trajeto">
              <button type="button" aria-pressed={showTrip === 'ida'} onClick={() => setTripSel('ida')} disabled={!idaSteps.length}>Ida</button>
              <button type="button" aria-pressed={showTrip === 'volta'} onClick={() => setTripSel('volta')} data-testid="dg-volta-tab">Volta</button>
            </div>
            {showTrip === 'ida' ? (
              <DayGuide race={r} steps={idaSteps} nowMin={nowMin} live />
            ) : ret?.steps.length ? (
              <DayGuide race={r} steps={ret.steps} nowMin={nowMin} live trip="volta" note={ret.estimated ? 'Hora de sair do local estimada (largada + 2h30). Para acertar, informe em Logística → Volta → “Sair do local às”.' : null} />
            ) : (
              <div className="card muted small" data-testid="dg-volta-missing">
                {ret?.reason === 'off' ? 'A volta não está planejada.' : ret?.reason === 'route' ? 'Falta calcular a rota da volta.' : 'Falta a hora de sair do local.'} <Link to={`/corridas/${r.id}/logistica`}>Planejar a volta na Logística</Link>
              </div>
            )}
          </div>
        )}

        {nextAct && !started && !(isToday && sched && ida?.complete) && (
          <div className="card next-act" style={{ marginTop: 12 }} data-testid="next-activity">
            <div>
              <div className="list-group-title" style={{ marginTop: 0 }}>{isToday ? 'Próxima atividade' : 'Primeira atividade do dia'}</div>
              <div className="na-label">{nextAct.label}</div>
              {isToday && <div className="muted small">{untilLabel(nextAct.at - nowMin)}</div>}
            </div>
            <div className="na-time">{minToHm(nextAct.at, { withDay: false })}</div>
          </div>
        )}

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

        {sched && (
          <>
            <div className="section-title"><h2>Agenda do dia</h2><Link to={`/corridas/${r.id}/logistica`}>Editar</Link></div>
            <div className="card">
              <Timeline schedule={sched} now={isToday ? nowMin : null} />
              <p className="note">Chegada prevista às <b>{minToHm(sched.arrivalPlanned, { withDay: false })}</b>{ida?.complete ? ` · ${formatKm(ida.distanceKm)}, ${ida.trafficMin ?? ida.durationMin} min de trajeto` : ''}.</p>
              {ida && ida.points.length > 2 && (
                <>
                  <div className="list-group-title">Paradas</div>
                  <ol className="day-stops">{ida.points.filter((p) => p.role === 'stop').map((p, i) => <li key={i}><b>{p.label}</b> <span className="muted small">{p.formatted || p.address}{p.dwellMin ? ` · ${p.dwellMin} min` : ''}</span></li>)}</ol>
                </>
              )}
              {ida && <Pickups race={r} schedule={sched} stops={ida.points.filter((p) => p.role === 'stop')} />}
              {nav && <a className="btn btn-dark btn-block" style={{ marginTop: 10 }} href={nav.google} target="_blank" rel="noreferrer" data-testid="day-route"><IconPin /> Abrir a rota no Google Maps</a>}
            </div>
          </>
        )}
        {!sched && r.date && (
          <p className="note" style={{ marginTop: 12 }}><Link to={`/corridas/${r.id}/logistica`}>Planejar a logística</Link> para ver aqui a hora de acordar, sair e cada parada.</p>
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
