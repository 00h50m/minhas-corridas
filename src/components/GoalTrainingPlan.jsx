// Plano de treino de um objetivo: progresso dos treinos ligados, semana, próximo treino, testes e
// escolha de quais treinos fazem parte do plano.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { saveWorkout, useStore } from '../services/store.js'
import { Progress, Sheet, useUI } from './ui.jsx'
import { planProgress } from '../lib/goalPlan.js'
import { workoutTests } from '../lib/goals.js'
import { formatDateBR, weekdayShort } from '../lib/dates.js'
import { formatDuration } from '../lib/format.js'

export default function GoalTrainingPlan({ goal: g, today }) {
  const { workouts, goals } = useStore()
  const [picking, setPicking] = useState(false)
  const plan = planProgress(g, workouts, today)
  const tests = workoutTests(g, workouts)
  return (
    <div className="card" data-testid="goal-plan">
      {plan ? (
        <>
          <div className="gp-head">
            <b>{plan.done} de {plan.total} treinos feitos</b>
            {plan.weeks > 0 && <span className="muted small">{plan.week === 0 ? 'começa ' + (plan.list.find((w) => w.date)?.date ? formatDateBR(plan.list.find((w) => w.date).date).slice(0, 5) : '') : plan.week > plan.weeks ? 'plano encerrado' : `semana ${plan.week} de ${plan.weeks}`}</span>}
          </div>
          <Progress pct={plan.pct} tone="ok" label="Treinos do plano feitos" />
          {(plan.missed > 0 || plan.skipped > 0) && <p className="note" style={{ margin: '6px 0 0' }}>{[plan.missed ? `${plan.missed} passou sem marcar` : null, plan.skipped ? `${plan.skipped} não feito${plan.skipped > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}</p>}
          {plan.next && (
            <Link to={`/treinos/${plan.next.id}`} className="gp-next small" data-testid="goal-plan-next">
              Próximo: <b>{plan.next.name}</b>{plan.next.date ? ` · ${weekdayShort(plan.next.date)} ${formatDateBR(plan.next.date).slice(0, 5)}` : ''} ›
            </Link>
          )}
          {tests.length > 0 && <p className="small" style={{ margin: '8px 0 0' }}>Teste em treino: <b>{formatDuration(tests[0].sec)}</b> em “{tests[0].workout.name}”. Conta como sua melhor marca neste objetivo.</p>}
          {g.type === 'tempo' && !tests.length && <p className="note" style={{ margin: '8px 0 0' }}>Quando você importar o arquivo do relógio de um treino de {g.distanceKm ? `${String(g.distanceKm).replace('.', ',')} km` : 'teste'} deste plano, o tempo entra aqui como sua marca.</p>}
        </>
      ) : (
        <p className="small" style={{ marginTop: 0 }}>Ligue os treinos do seu plano a este objetivo para acompanhar quantos você já fez{g.type === 'tempo' ? ' e usar o teste final como marca' : ''}.</p>
      )}
      <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setPicking(true)} data-testid="goal-plan-pick">{plan ? 'Escolher treinos do plano' : 'Ligar treinos a este objetivo'}</button>
      {picking && <PickWorkouts goal={g} workouts={workouts} goals={goals} today={today} onClose={() => setPicking(false)} />}
    </div>
  )
}

function PickWorkouts({ goal: g, workouts, goals, today, onClose }) {
  const { notify } = useUI()
  // Treinos com data a partir do início do objetivo (ou dos últimos 60 dias) e os já ligados.
  const from = g.startDate ?? ''
  const list = workouts
    .filter((w) => w.goalId === g.id || (w.date && (!from || w.date >= from)))
    .sort((a, b) => ((a.date ?? '9') < (b.date ?? '9') ? -1 : 1))
  const [sel, setSel] = useState(() => new Set(list.filter((w) => w.goalId === g.id).map((w) => w.id)))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const untilDeadline = () => setSel(new Set(list.filter((w) => w.goalId === g.id || (!w.goalId && w.date && w.date >= today && (!g.deadline || w.date <= g.deadline))).map((w) => w.id)))
  const save = () => {
    let n = 0
    for (const w of list) {
      const want = sel.has(w.id)
      if (want && w.goalId !== g.id) { saveWorkout({ ...w, goalId: g.id }); n++ }
      if (!want && w.goalId === g.id) { saveWorkout({ ...w, goalId: null }); n++ }
    }
    notify(n ? 'Plano atualizado' : 'Nada mudou')
    onClose()
  }
  const goalName = (id) => goals.find((x) => x.id === id)?.title
  return (
    <Sheet title="Treinos do plano" onClose={onClose}>
      <div data-testid="goal-plan-sheet">
        {list.length === 0 ? (
          <p className="small">Nenhum treino com data. <Link to="/treinos">Crie ou importe os treinos</Link> primeiro.</p>
        ) : (
          <>
            <button type="button" className="link-btn" onClick={untilDeadline}>Marcar todos os planejados{g.deadline ? ` até ${formatDateBR(g.deadline).slice(0, 5)}` : ''}</button>
            <ul className="gp-pick">
              {list.map((w) => (
                <li key={w.id}>
                  <label className="check">
                    <input type="checkbox" checked={sel.has(w.id)} onChange={() => toggle(w.id)} />
                    <span><b>{w.name}</b> <span className="muted small">{w.date ? `${weekdayShort(w.date)} ${formatDateBR(w.date).slice(0, 5)}` : 'sem data'}{w.status === 'feito' ? ' · feito' : ''}{w.goalId && w.goalId !== g.id ? ` · hoje em “${goalName(w.goalId) ?? 'outro objetivo'}”` : ''}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} data-testid="goal-plan-save" disabled={!list.length}>Salvar ({sel.size})</button>
        </div>
      </div>
    </Sheet>
  )
}
