// Treinando agora: a ficha do dia exercício por exercício. Cada série com a carga e as repetições (vem a
// da última vez) e ✓; ao marcar, o descanso da ficha começa sozinho (nos conjugados, só depois do último
// do bloco) e vibra no fim. Tudo é salvo a cada toque; “Terminar” marca o treino como feito.
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconCheck } from '../components/Icons.jsx'
import { saveWorkout, useStore } from '../services/store.js'
import { entryOf, lastLoads, restSeconds, toggleEntry, updateEntry } from '../lib/gymSession.js'
import { exLabel } from '../lib/strength.js'
import { firstReps } from '../lib/ficha.js'

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`
const kgTxt = (v) => (v == null ? '' : String(v).replace('.', ','))

export default function GymSession() {
  const { id } = useParams()
  const { workouts } = useStore()
  const w = workouts.find((x) => x.id === id)
  if (!w) return <Navigate to="/treinos" replace />
  if (!w.exercises?.length) return <Navigate to={`/treinos/${id}`} replace />
  return <Session w={w} workouts={workouts} />
}

function Session({ w, workouts }) {
  const nav = useNavigate()
  const { notify, confirm } = useUI()
  const [log, setLog] = useState(w.gymLog)
  const [rest, setRest] = useState(null) // { until, total, label }
  const [now, setNow] = useState(Date.now())
  const [draft, setDraft] = useState({}) // `${i}-${n}` → { kg, reps } antes de marcar
  const prev = useRef(lastLoads(workouts, w.id)).current
  const save = (l) => { setLog(l); saveWorkout({ ...w, gymLog: l }) }

  // Relógio (descanso e tempo de treino) e tela acesa enquanto treina
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  useEffect(() => {
    let lock = null
    navigator.wakeLock?.request?.('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [])
  const left = rest ? Math.ceil((rest.until - now) / 1000) : null
  useEffect(() => {
    if (rest && left <= 0) {
      try { navigator.vibrate?.([250, 120, 250]) } catch { /* sem vibração */ }
      setRest(null)
      notify('Descanso terminou')
    }
  }, [left])

  const valueOf = (i, n, field) => {
    const k = `${i}-${n}`
    if (draft[k]?.[field] !== undefined) return draft[k][field]
    const e = entryOf(log, i, n)
    if (e) return field === 'kg' ? kgTxt(e.kg) : e.reps ?? ''
    const p = prev[(w.exercises[i].name || '').toLowerCase()]?.[n] ?? prev[(w.exercises[i].name || '').toLowerCase()]?.[1]
    if (field === 'kg') return kgTxt(p?.kg)
    return ''
  }
  const parseKg = (v) => { const n = Number(String(v).replace(',', '.')); return String(v).trim() !== '' && Number.isFinite(n) ? n : null }
  const parseReps = (v, x) => { const n = Number(String(v).replace(/\D/g, '')); return String(v).trim() !== '' && Number.isFinite(n) ? n : firstReps(x.repsText) ?? x.reps ?? null }

  const tick = (i, n) => {
    const x = w.exercises[i]
    const done = !!entryOf(log, i, n)
    const kg = parseKg(valueOf(i, n, 'kg'))
    const reps = parseReps(valueOf(i, n, 'reps'), x)
    const next = toggleEntry(log, i, n, { kg, reps })
    save(next)
    setDraft((d) => { const c = { ...d }; delete c[`${i}-${n}`]; return c })
    if (done) return
    // Descanso: do último exercício do bloco conjugado (ou do próprio, se solto)
    let j = i
    while (w.exercises[j]?.withNext && j < w.exercises.length - 1) j++
    if (j !== i) return // primeiro do conjugado: vai direto para o próximo
    const secs = restSeconds(w.exercises[j].rest) ?? restSeconds(w.exercises[i].rest)
    if (secs) setRest({ until: Date.now() + secs * 1000, total: secs, label: exLabel(w.exercises[j]) })
  }
  const edit = (i, n, field, v) => {
    setDraft((d) => ({ ...d, [`${i}-${n}`]: { ...(d[`${i}-${n}`] ?? {}), [field]: v } }))
    if (entryOf(log, i, n)) save(updateEntry(log, i, n, field === 'kg' ? { kg: parseKg(v) } : { reps: parseReps(v, w.exercises[i]) }))
  }

  const total = w.exercises.reduce((a, x) => a + (x.sets ?? 1), 0)
  const doneN = log?.entries.length ?? 0
  const elapsed = log?.startedAt ? Math.round((now - Date.parse(log.startedAt)) / 1000) : 0

  const finish = async () => {
    if (doneN < total && !(await confirm({ title: 'Terminar o treino?', message: `${doneN} de ${total} séries marcadas. O que faltou fica registrado como não feito.`, confirmLabel: 'Terminar' }))) return
    const l = { ...(log ?? { entries: [], startedAt: new Date().toISOString() }), endedAt: new Date().toISOString() }
    saveWorkout({ ...w, gymLog: l, status: 'feito' })
    notify('Treino registrado')
    nav(`/treinos/${w.id}`, { replace: true })
  }

  return (
    <>
      <TopBar title={w.name} sub={log?.startedAt ? `treinando há ${mmss(elapsed)}` : 'toque ✓ a cada série'} back={`/treinos/${w.id}`} />
      <div className="page gym" data-testid="gym-session">
        <div className="gym-progress small"><b>{doneN} de {total}</b> séries<div className="gym-bar"><span style={{ width: `${(doneN / Math.max(total, 1)) * 100}%` }} /></div></div>
        {w.exercises.map((x, i) => {
          const pairedPrev = i > 0 && w.exercises[i - 1].withNext
          const p = prev[(x.name || '').toLowerCase()]
          return (
            <div key={i} className={`card gym-ex${x.withNext ? ' paired-next' : ''}${pairedPrev ? ' paired-prev' : ''}`} data-testid="gym-ex">
              <div className="gym-ex-head">
                <span className="ficha-n">{String(i + 1).padStart(2, '0')}</span>
                <div className="gym-ex-t">
                  <b>{exLabel(x)}</b>
                  {x.note && <span className="muted small ficha-note">{x.note}</span>}
                  <span className="small">{x.sets} × {x.repsText || x.reps || '—'}{x.rest ? <span className="muted"> · descanso {x.rest}</span> : null}</span>
                  {(x.withNext || pairedPrev) && <span className="ficha-pair-tag" style={{ marginLeft: 0 }}>{x.withNext ? 'conjugado: depois vá para o próximo' : 'conjugado: descanse depois deste'}</span>}
                  {p?.date && <span className="muted small">Última vez ({p.date.slice(8)}/{p.date.slice(5, 7)}): {Object.entries(p).filter(([k]) => k !== 'date').map(([, v]) => (v.kg != null ? `${kgTxt(v.kg)} kg` : '—')).join(' · ')}</span>}
                </div>
              </div>
              <div className="gym-sets">
                {Array.from({ length: x.sets ?? 1 }, (_, k) => k + 1).map((n) => {
                  const done = !!entryOf(log, i, n)
                  return (
                    <div key={n} className={`gym-set${done ? ' done' : ''}`}>
                      <span className="gym-set-n">{n}ª</span>
                      <label className="gym-in"><input className="input" inputMode="decimal" value={valueOf(i, n, 'kg')} onChange={(e) => edit(i, n, 'kg', e.target.value.replace(/[^\d,.]/g, '').slice(0, 6))} onFocus={(e) => e.target.select()} aria-label={`${exLabel(x)}, série ${n}: carga em kg`} data-testid="gym-kg" /><span>kg</span></label>
                      <label className="gym-in"><input className="input" inputMode="numeric" value={valueOf(i, n, 'reps')} placeholder={String(firstReps(x.repsText) ?? x.reps ?? '')} onChange={(e) => edit(i, n, 'reps', e.target.value.replace(/\D/g, '').slice(0, 3))} onFocus={(e) => e.target.select()} aria-label={`${exLabel(x)}, série ${n}: repetições`} data-testid="gym-reps" /><span>reps</span></label>
                      <button type="button" className={`gym-tick${done ? ' on' : ''}`} onClick={() => tick(i, n)} aria-pressed={done} aria-label={`${exLabel(x)}: série ${n} ${done ? 'feita (toque para desfazer)' : 'feita'}`} data-testid="gym-tick"><IconCheck /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={finish} data-testid="gym-finish">Terminar treino</button>
        <p className="note">Tudo fica salvo a cada toque: dá para sair e voltar. As cargas viram a sua evolução na academia, com ou sem relógio. <Link to={`/treinos/${w.id}`}>Ver o treino</Link></p>
      </div>
      {rest && left > 0 && (
        <div className="gym-rest" role="timer" aria-live="polite" data-testid="gym-rest">
          <div className="gym-rest-t"><span className="muted small">Descanso · {rest.label}</span><b>{mmss(left)}</b></div>
          <div className="gym-rest-bar"><span style={{ width: `${(left / rest.total) * 100}%` }} /></div>
          <div className="gym-rest-b">
            <button type="button" className="btn btn-sm" onClick={() => setRest((r) => ({ ...r, until: r.until + 15000, total: r.total + 15 }))}>+15 s</button>
            <button type="button" className="btn btn-sm" onClick={() => setRest(null)} data-testid="gym-rest-skip">Pular</button>
          </div>
        </div>
      )}
    </>
  )
}
