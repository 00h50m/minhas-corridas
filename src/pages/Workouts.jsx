// Lista de treinos: próximos, sem data e já feitos.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getState, saveWorkout, useStore } from '../services/store.js'
import { saveProfile, useProfile } from '../services/profile.js'
import { useUI } from '../components/ui.jsx'
import Reschedule from '../components/Reschedule.jsx'
import { dayLabel, missedWorkouts, moveWorkout, movedLabel, suggestDates } from '../lib/reschedule.js'
import { DateTile, EmptyState, TopBar } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import { WORKOUT_STATUSES, fmtSec, isRun, plannedSec, sportOf, workoutLine } from '../lib/workout.js'
import { todayISO } from '../lib/dates.js'
import TrainingWeek from '../components/TrainingWeek.jsx'
import ActivityImport from '../components/ActivityImport.jsx'
import GarminConnect from '../components/GarminConnect.jsx'
import Readiness from '../components/Readiness.jsx'
import CopyBox from '../components/CopyBox.jsx'
import { claudePrompt } from '../lib/workoutShare.js'

const STATUS_LABEL = Object.fromEntries(WORKOUT_STATUSES.map((s) => [s.id, s.label]))

export default function Workouts() {
  const { workouts, goals } = useStore()
  const today = todayISO()
  if (workouts.length === 0) {
    return (
      <>
        <TopBar title="Treinos" back="/" />
        <div className="page">
          <EmptyState
            title="Seus treinos no relógio"
            text="Monte os treinos da sua planilha (ou os que o seu treinador passou) com aquecimento, tiros, recuperação e alvos de pace. Depois, baixe o arquivo para o Garmin e compare o planejado com o que você fez."
            action={<><Link to="/treinos/novo" className="btn btn-primary btn-block"><IconPlus /> Criar treino</Link><Link to="/treinos/importar" className="link-btn" style={{ display: 'inline-block', marginTop: 8 }}>Importar treinos (link ou arquivo)</Link></>}
          />
        </div>
      </>
    )
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const upcoming = workouts.filter((w) => w.date && w.date >= today && w.status === 'planejado').sort(byDate)
  const upcomingRuns = upcoming.filter(isRun)
  const undated = workouts.filter((w) => !w.date && w.status === 'planejado').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const past = workouts.filter((w) => !upcoming.includes(w) && !undated.includes(w)).sort((a, b) => -byDate(a, b))
  return (
    <>
      <TopBar title="Treinos" sub={`${upcoming.length} ${upcoming.length === 1 ? 'planejado' : 'planejados'}`} back="/" right={<Link to="/treinos/novo" className="icon-btn" aria-label="Novo treino"><IconPlus /></Link>} />
      <div className="page">
        <TrainingWeek workouts={workouts} today={today} />
        <Readiness date={today} style={{ marginTop: 10 }} />
        <MissedCard workouts={workouts} today={today} />
        <div style={{ marginTop: 10 }}><GarminConnect /></div>
        <div style={{ marginTop: 10 }}><ActivityImport /></div>
        <PlanGoalHint workouts={upcoming} goals={goals} />
        <div className="list-group-title">Próximos</div>
        {upcoming.length === 0 && <div className="card muted small">Nenhum treino com data à frente.</div>}
        {upcoming.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        {undated.length > 0 && <div className="list-group-title">Sem data</div>}
        {undated.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        {past.length > 0 && <div className="list-group-title">Anteriores</div>}
        {past.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link to="/treinos/novo" className="btn btn-primary"><IconPlus /> Novo treino</Link>
          <Link to="/treinos/novo?tipo=academia" className="btn" data-testid="new-cross">+ Outra atividade</Link>
        </div>
        <Link to="/treinos/importar" className="link-btn" style={{ display: 'inline-block', marginTop: 8 }}>Importar treinos (link ou arquivo)</Link>
        {upcomingRuns.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <CopyBox label={`Copiar prompt dos ${upcomingRuns.length} próximos treinos para o Claude`} text={claudePrompt(upcomingRuns)} done="Prompt copiado: cole no Claude" testid="copy-claude-all"
              hint="Cole no Claude com acesso ao navegador (Claude no Chrome), com o Garmin Connect aberto e logado: ele cria todos, agenda nas datas e envia para o relógio." />
          </div>
        )}
        <p className="note">O PaceOn guarda e envia os treinos que <b>você</b> monta; ele não cria nem recomenda treinos.</p>
      </div>
    </>
  )
}

export function WorkoutItem({ w, today }) {
  const sec = plannedSec(w)
  const missed = w.status === 'planejado' && w.date && w.date < today
  return (
    <Link to={`/treinos/${w.id}`} className={`race-item wk-item wk-${w.status}`} data-testid="workout-item">
      <DateTile date={w.date} />
      <div className="race-body">
        <div className="t">{w.name}</div>
        <div className="s wk-sum">{workoutLine(w)}</div>
        <div className="chips" style={{ marginTop: 6 }}>
          <span className="chip">≈ {fmtSec(sec)}</span>
          {w.date === today && w.status === 'planejado' && <span className="chip chip-hot">Hoje</span>}
          {w.status !== 'planejado' && <span className="chip">{STATUS_LABEL[w.status]}{w.status === 'feito' && w.result?.distanceKm > 0 ? ` · ${String(w.result.distanceKm.toFixed(2)).replace('.', ',')} km` : w.status === 'feito' && w.result?.elapsedSec ? ` · ${fmtSec(w.result.elapsedSec)}` : ''}</span>}
          {w.status === 'feito' && w.result?.avgHr ? <span className="chip">♥ {w.result.avgHr}</span> : null}
          {w.status === 'feito' && w.result?.calories ? <span className="chip">{w.result.calories} kcal</span> : null}
          {missed && <span className="chip chip-dim">Passou</span>}
          {w.moves?.length > 0 && <span className="chip chip-moved" data-testid="wk-moved-chip">↷ {movedLabel(w)}</span>}
        </div>
      </div>
    </Link>
  )
}

/** Treinos que passaram sem marcar: remanejar (sugestão da regra), escolher dia, não fiz ou fiz; e a regra. */
function MissedCard({ workouts, today }) {
  const prof = useProfile()
  const { notify } = useUI()
  const [moving, setMoving] = useState(null)
  const rule = prof?.data?.missedRule ?? 'perguntar'
  const missed = missedWorkouts(workouts, today)
  const setRule = (r) => { saveProfile({ ...prof.data, missedRule: r }); notify(r === 'remanejar' ? 'Treinos que passarem vão para o próximo dia livre' : r === 'pular' ? 'Treinos que passarem serão marcados como “não fiz”' : 'O app vai perguntar') }
  const ruleSelect = (
    <label className="small mc-rule">
      Treino que passar sem marcar:{' '}
      <select className="input" value={rule} onChange={(e) => setRule(e.target.value)} data-testid="missed-rule">
        <option value="perguntar">perguntar</option>
        <option value="remanejar">remanejar sozinho</option>
        <option value="pular">marcar como “não fiz”</option>
      </select>
    </label>
  )
  if (!missed.length) return <div className="mc-rule-only">{ruleSelect}</div>
  const { races, goals } = getState()
  return (
    <div className="card small missed-card" style={{ marginTop: 10 }} data-testid="missed-card">
      <b>{missed.length === 1 ? 'Treino que passou sem marcar' : `${missed.length} treinos passaram sem marcar`}</b>
      {missed.map((w) => {
        const best = suggestDates(w, { workouts, races, goals, today })[0]
        return (
          <div key={w.id} className="mc-row" data-testid="missed-row">
            <div><b>{w.name}</b> <span className="muted">· {dayLabel(w.date)}</span></div>
            {best && (
              <button type="button" className="btn btn-sm mc-move" onClick={() => { saveWorkout(moveWorkout(w, best.date, today)); notify(`“${w.name}” remanejado para ${dayLabel(best.date)}`) }} data-testid="missed-move">↷ Para {dayLabel(best.date)}</button>
            )}
            {best?.notes.length > 0 && <div className="note" style={{ margin: '4px 0 0' }}>{best.notes.join(' · ')}</div>}
            <div className="btn-inline mc-other">
              <button type="button" className="link-btn" onClick={() => setMoving(w)} data-testid="missed-pick">Outro dia</button>
              <button type="button" className="link-btn muted-btn" onClick={() => saveWorkout({ ...w, status: 'pulado' })} data-testid="missed-skip">Não fiz</button>
              <button type="button" className="link-btn muted-btn" onClick={() => saveWorkout({ ...w, status: 'feito' })} data-testid="missed-done">Fiz</button>
            </div>
          </div>
        )
      })}
      {ruleSelect}
      {moving && <Reschedule w={moving} onClose={() => setMoving(null)} />}
    </div>
  )
}

/** Treinos planejados sem objetivo: sugere ligar a um objetivo (ou criar um com eles). */
function PlanGoalHint({ workouts, goals }) {
  const free = workouts.filter((w) => !w.goalId && isRun(w))
  if (free.length < 2) return null
  const active = goals.filter((g) => g.status === 'andamento' && ['tempo', 'primeira', 'manual'].includes(g.type))
  // Distância do teste do plano (o passo por distância mais longo), para já sugerir o objetivo.
  const testM = Math.max(0, ...free.flatMap((w) => w.items.flatMap((it) => (it.kind === 'repeat' ? [] : it.duration.kind === 'distance' ? [it.duration.value] : []))))
  const last = free.map((w) => w.date).sort().at(-1)
  const q = new URLSearchParams({ tipo: 'tempo', plano: '1', ...(testM >= 1000 ? { km: String(testM / 1000) } : {}), ...(last ? { ate: last } : {}) })
  return (
    <div className="card small plan-hint" data-testid="plan-goal-hint">
      <b>{free.length} treinos planejados sem objetivo.</b> Ligue a um objetivo para ver o progresso do plano{testM >= 1000 ? ' e usar o teste como marca' : ''}.
      <div className="btn-inline" style={{ marginTop: 6 }}>
        <Link to={`/objetivos/novo?${q}`} className="link-btn" data-testid="plan-goal-create">Criar objetivo com estes treinos</Link>
        {active.map((g) => <Link key={g.id} to={`/objetivos/${g.id}`} className="link-btn">Ligar a “{g.title}”</Link>)}
      </div>
    </div>
  )
}
