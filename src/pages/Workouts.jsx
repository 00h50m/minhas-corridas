// Lista de treinos: próximos, sem data e já feitos.
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { DateTile, EmptyState, TopBar } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import { WORKOUT_STATUSES, estimate, fmtSec, summary } from '../lib/workout.js'
import { todayISO } from '../lib/dates.js'

const STATUS_LABEL = Object.fromEntries(WORKOUT_STATUSES.map((s) => [s.id, s.label]))

export default function Workouts() {
  const { workouts } = useStore()
  const today = todayISO()
  if (workouts.length === 0) {
    return (
      <>
        <TopBar title="Treinos" back="/" />
        <div className="page">
          <EmptyState
            title="Seus treinos no relógio"
            text="Monte os treinos da sua planilha (ou os que o seu treinador passou) com aquecimento, tiros, recuperação e alvos de pace. Depois, baixe o arquivo para o Garmin e compare o planejado com o que você fez."
            action={<Link to="/treinos/novo" className="btn btn-primary btn-block"><IconPlus /> Criar treino</Link>}
          />
        </div>
      </>
    )
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const upcoming = workouts.filter((w) => w.date && w.date >= today && w.status === 'planejado').sort(byDate)
  const undated = workouts.filter((w) => !w.date && w.status === 'planejado').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const past = workouts.filter((w) => !upcoming.includes(w) && !undated.includes(w)).sort((a, b) => -byDate(a, b))
  return (
    <>
      <TopBar title="Treinos" sub={`${upcoming.length} ${upcoming.length === 1 ? 'planejado' : 'planejados'}`} back="/" right={<Link to="/treinos/novo" className="icon-btn" aria-label="Novo treino"><IconPlus /></Link>} />
      <div className="page">
        {upcoming.length === 0 && <div className="card muted small">Nenhum treino com data à frente.</div>}
        {upcoming.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        {undated.length > 0 && <div className="list-group-title">Sem data</div>}
        {undated.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        {past.length > 0 && <div className="list-group-title">Anteriores</div>}
        {past.map((w) => <WorkoutItem key={w.id} w={w} today={today} />)}
        <Link to="/treinos/novo" className="btn btn-primary btn-block" style={{ marginTop: 16 }}><IconPlus /> Novo treino</Link>
        <p className="note">O PaceOn guarda e envia os treinos que <b>você</b> monta; ele não cria nem recomenda treinos.</p>
      </div>
    </>
  )
}

export function WorkoutItem({ w, today }) {
  const est = estimate(w.items)
  const missed = w.status === 'planejado' && w.date && w.date < today
  return (
    <Link to={`/treinos/${w.id}`} className={`race-item wk-item wk-${w.status}`} data-testid="workout-item">
      <DateTile date={w.date} />
      <div className="race-body">
        <div className="t">{w.name}</div>
        <div className="s wk-sum">{summary(w.items)}</div>
        <div className="chips" style={{ marginTop: 6 }}>
          <span className="chip">≈ {fmtSec(est.sec)}</span>
          {w.date === today && w.status === 'planejado' && <span className="chip chip-hot">Hoje</span>}
          {w.status !== 'planejado' && <span className="chip">{STATUS_LABEL[w.status]}{w.status === 'feito' && w.result?.distanceKm ? ` · ${String(w.result.distanceKm.toFixed(2)).replace('.', ',')} km` : ''}</span>}
          {missed && <span className="chip chip-dim">Passou</span>}
        </div>
      </div>
    </Link>
  )
}
