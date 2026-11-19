// Primeiros passos: o que vale fazer nos primeiros dias, marcado sozinho conforme a pessoa usa o app.
// Some quando tudo estiver feito ou quando a pessoa esconder.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconFlag, IconUsers, IconWatch, IconWorkout } from './Icons.jsx'
import { getLocalKV } from '../services/kv.js'

const KEY = 'paceon:primeiros-passos'

/** Passos e se cada um já foi feito (só com o que já está no aparelho). */
export function firstSteps({ races = [], workouts = [], profile = {}, garminKey = false }) {
  return [
    { id: 'prova', icon: IconFlag, title: 'Cadastre uma prova', text: 'A que você quer fazer ou em que já está inscrita. Só o nome é obrigatório.', to: '/corridas/nova', done: races.length > 0 },
    { id: 'treino', icon: IconWorkout, title: 'Monte um treino', text: 'Corrida com passos e alvos, ou a ficha da academia, para mandar ao relógio.', to: '/treinos/novo', done: workouts.length > 0 },
    { id: 'relogio', icon: IconWatch, title: 'Traga o relógio', text: 'Conecte o Garmin para os treinos feitos entrarem sozinhos, ou importe um arquivo.', to: '/treinos', done: garminKey || workouts.some((w) => w.result) },
    { id: 'perfil', icon: IconUsers, title: 'Complete o perfil', text: 'Nome, camiseta e contato de emergência. Tudo opcional.', to: '/perfil', done: !!(profile.name || profile.nickname) }
  ]
}

export function firstStepsHidden() {
  try {
    return localStorage.getItem(KEY) === 'escondido'
  } catch {
    return false
  }
}

export default function FirstSteps({ races, workouts, profile, welcome = false }) {
  const [hidden, setHidden] = useState(firstStepsHidden)
  const steps = firstSteps({ races, workouts, profile, garminKey: !!getLocalKV('garmin')?.key })
  const done = steps.filter((s) => s.done).length
  if (hidden || done === steps.length) return null
  const hide = () => {
    try { localStorage.setItem(KEY, 'escondido') } catch { /* sem armazenamento */ }
    setHidden(true)
  }
  return (
    <div className={`card fs-card${welcome ? ' fs-welcome' : ''}`} data-testid="first-steps">
      {welcome && (
        <div className="fs-hero">
          <b>Boas-vindas ao PaceOn</b>
          <span className="muted small">Suas provas, seus treinos e o seu relógio num lugar só. Comece por onde fizer sentido:</span>
        </div>
      )}
      <div className="fs-head">
        <b>Primeiros passos</b>
        <span className="muted small">{done} de {steps.length}</span>
      </div>
      <div className="fs-bar" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="fs-list">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''} data-testid={`fs-${s.id}`}>
            <Link to={s.to} className="fs-row" aria-label={`${s.title}${s.done ? ' (feito)' : ''}`}>
              <span className="fs-ic">{s.done ? <IconCheck /> : <s.icon />}</span>
              <span className="fs-t"><b>{s.title}</b>{!s.done && <span className="muted small">{s.text}</span>}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!welcome && <button type="button" className="link-btn muted-btn fs-hide" onClick={hide} data-testid="fs-hide">Esconder</button>}
    </div>
  )
}
