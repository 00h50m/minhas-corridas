// "Agora" no dia da prova: o passo atual do trajeto, marcações reais (saí, cheguei), atraso e horários
// projetados, navegação só até o próximo ponto, aviso no WhatsApp com o horário atualizado e
// lembretes enquanto a tela estiver aberta.
import { useEffect, useState } from 'react'
import { getRace, saveRace } from '../services/store.js'
import { useProfile } from '../services/profile.js'
import { dayStatus, delayLabel, legNavLinks, onTheWayMessage } from '../lib/dayPlan.js'
import { minToHm } from '../lib/schedule.js'
import { whatsappLink } from '../lib/people.js'
import { IconPin } from './Icons.jsx'

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** steps: passos da ida (daySteps) ou da volta (returnSteps); trip: 'ida' | 'volta'; note: aviso extra (ex.: horário estimado). */
export default function DayGuide({ race, steps, nowMin, live, trip = 'ida', note = null }) {
  const people = useProfile().data.people
  const marks = race.dayLog?.date === race.date ? race.dayLog.marks : {}
  const st = dayStatus(steps, marks, live ? nowMin : null)
  useDayAlerts(st, live)
  if (!steps.length) return null
  const save = (m) => {
    const fresh = getRace(race.id)
    saveRace({ ...fresh, dayLog: { date: race.date, marks: m } })
  }
  const mark = () => save({ ...marks, [st.current.key]: hhmm() })
  const undo = () => {
    const last = [...st.steps].reverse().find((s) => s.done)
    if (!last) return
    const m = { ...marks }
    delete m[last.key]
    save(m)
  }
  const cur = st.current
  const target = cur ? (cur.kind === 'leave' ? cur.to : cur.point) : null
  const nav = cur && !st.finished ? legNavLinks(target) : null
  // Quem está no próximo ponto (busca): mensagem com a hora projetada de chegada.
  const nextArrive = cur ? st.steps.slice(st.currentIdx).find((s) => s.kind === 'arrive') : null
  // Na volta a pessoa está no carro: o aviso no WhatsApp é só para a ida (buscar).
  const person = trip === 'ida' && nextArrive?.personId ? people.find((p) => p.id === nextArrive.personId) : null
  const tone = Math.abs(st.delayMin) <= 2 ? 'ok' : st.delayMin > 0 ? 'late' : 'early'
  return (
    <div className="card day-guide" data-testid={trip === 'volta' ? 'day-guide-volta' : 'day-guide'}>
      <div className="dg-top">
        <div className="list-group-title" style={{ margin: 0 }}>{trip === 'volta' ? 'Volta' : live ? 'Agora' : 'Passo a passo do trajeto'}</div>
        {live && (st.steps.some((s) => s.done) || st.late) && <span className={`dg-status ${tone}`} data-testid="dg-status">{delayLabel(st.delayMin)}</span>}
      </div>
      {cur ? (
        <>
          <div className="dg-now">
            <div className="dg-label">{cur.label}</div>
            <div className="dg-time">
              {minToHm(cur.projected, { withDay: false })}
              {cur.projected !== cur.at && <span className="muted small"> (planejado {minToHm(cur.at, { withDay: false })})</span>}
            </div>
          </div>
          {live && <button type="button" className="btn btn-primary btn-block" onClick={mark} data-testid="dg-mark">{cur.action} ({hhmm()})</button>}
          {nav && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <a className="btn" href={nav.google} target="_blank" rel="noreferrer"><IconPin /> Google Maps</a>
              <a className="btn" href={nav.waze} target="_blank" rel="noreferrer">Waze</a>
            </div>
          )}
          {nav && <p className="note" style={{ marginTop: 4 }}>Navegar até {target?.label || 'o próximo ponto'}, a partir de onde você está.</p>}
          {person && live && (
            <a className="btn btn-block wa-wide" href={whatsappLink(person.phone, onTheWayMessage({ person, at: nextArrive.projected, leftNow: st.steps.some((s) => s.done) }))} target="_blank" rel="noreferrer" data-testid="dg-whatsapp">
              Avisar {person.name}: chego às {minToHm(nextArrive.projected, { withDay: false })}
            </a>
          )}
        </>
      ) : (
        <p className="small" style={{ margin: '6px 0' }} data-testid="dg-done">{trip === 'volta' ? <><b>Em casa.</b> Descanse e registre o resultado. 🏅</> : <><b>Você chegou.</b> Boa prova! 🏃</>}</p>
      )}
      {note && <p className="note" style={{ marginTop: 4 }}>{note}</p>}
      <ol className="dg-steps">
        {st.steps.map((s) => (
          <li key={s.key} className={s.done ? 'done' : s === cur ? 'cur' : ''}>
            <span className="dg-at">{minToHm(s.done ? s.actual : s.projected, { withDay: false })}</span>
            <span>{s.label}{s.done ? <span className="muted small"> · feito{s.actual !== s.at ? ` (plano ${minToHm(s.at, { withDay: false })})` : ''}</span> : s.projected !== s.at ? <span className="muted small"> · plano {minToHm(s.at, { withDay: false })}</span> : null}</span>
          </li>
        ))}
      </ol>
      {live && st.steps.some((s) => s.done) && <button type="button" className="link-btn muted-btn" onClick={undo} data-testid="dg-undo">Desfazer a última marcação</button>}
      {live && <AlertsToggle />}
    </div>
  )
}

/** Permissão para os lembretes desta tela (com o app aberto). */
function AlertsToggle() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  if (perm === 'unsupported') return null
  if (perm === 'granted') return <p className="note">Com esta tela aberta, o app avisa 5 minutos antes de cada saída. Para avisar com o app fechado, use a agenda com alarmes (.ics) da Logística.</p>
  return (
    <p className="note">
      <button type="button" className="link-btn" onClick={() => Notification.requestPermission().then(setPerm)}>Avisar 5 min antes de cada saída</button> (com esta tela aberta). Com o app fechado, quem avisa é a agenda com alarmes (.ics) da Logística.
    </p>
  )
}

/** Lembretes locais: 5 min antes e na hora de cada saída ainda não feita (nas próximas 3 h). */
function useDayAlerts(st, live) {
  const sig = live ? st.steps.filter((s) => !s.done && s.kind === 'leave').map((s) => `${s.key}@${s.projected}`).join('|') : ''
  useEffect(() => {
    if (!sig || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    const timers = []
    for (const s of st.steps) {
      if (s.done || s.kind !== 'leave') continue
      for (const [before, text] of [[5, `Em 5 min: ${s.label}`], [0, `Hora de ${s.label.charAt(0).toLowerCase()}${s.label.slice(1)}`]]) {
        const ms = (s.projected - before - nowMin) * 60000
        if (ms > 0 && ms < 3 * 3600000) timers.push(setTimeout(() => notify(text, s.key), ms))
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [sig])
}

function notify(text, tag) {
  const opts = { body: 'PaceOn · dia da prova', tag: `dia-${tag}`, icon: '/icon-192.png' }
  if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(text, opts)).catch(() => new Notification(text, opts))
  else new Notification(text, opts)
}
