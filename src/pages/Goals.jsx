import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { EmptyState, GoalStatusBadge, Progress, TopBar } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import { GOAL_TYPE_BY_ID } from '../lib/model.js'
import { activeGoals, formatGoalTarget, goalProgress } from '../lib/goals.js'
import { formatDateBR, todayISO } from '../lib/dates.js'

export default function Goals() {
  const { goals, races } = useStore()
  const today = todayISO()

  if (goals.length === 0) {
    return (
      <>
        <TopBar title="Objetivos" />
        <div className="page">
          <EmptyState
            title="Qual é a próxima meta?"
            text="Cadastre objetivos como baixar seu tempo nos 5 km, completar a primeira meia ou manter as inscrições dentro do orçamento. O progresso é calculado com as provas que você registra."
            action={<Link to="/objetivos/novo" className="btn btn-primary btn-block"><IconPlus /> Criar objetivo</Link>}
          />
        </div>
      </>
    )
  }

  const active = activeGoals(goals)
  const paused = goals.filter((g) => g.status === 'pausado')
  const done = goals.filter((g) => g.status === 'concluido').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  return (
    <>
      <TopBar
        title="Objetivos"
        sub={`${active.length} em andamento`}
        right={<Link to="/objetivos/novo" className="icon-btn" aria-label="Novo objetivo"><IconPlus /></Link>}
      />
      <div className="page">
        {active.length === 0 && <div className="card muted small">Nenhum objetivo em andamento.</div>}
        {active.map((g) => <GoalCard key={g.id} goal={g} races={races} today={today} />)}
        {paused.length > 0 && <div className="list-group-title">Pausados</div>}
        {paused.map((g) => <GoalCard key={g.id} goal={g} races={races} today={today} />)}
        {done.length > 0 && <div className="list-group-title">Concluídos</div>}
        {done.map((g) => <GoalCard key={g.id} goal={g} races={races} today={today} />)}
        <Link to="/objetivos/novo" className="btn btn-primary btn-block" style={{ marginTop: 16 }}><IconPlus /> Novo objetivo</Link>
        <p className="note">O progresso automático usa apenas as provas registradas no app — não representa todo o seu volume de treino.</p>
      </div>
    </>
  )
}

export function GoalCard({ goal: g, races, today, compact }) {
  const p = goalProgress(g, races, today)
  const tone = p.over ? 'danger' : p.achieved || g.status === 'concluido' ? 'ok' : 'brand'
  return (
    <Link to={`/objetivos/${g.id}`} className={`goal-card g-${g.status}`}>
      <div className="goal-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t">{g.title}</div>
          <div className="s">
            {GOAL_TYPE_BY_ID[g.type]?.label} · alvo {formatGoalTarget(g)}
            {g.deadline && ` · até ${formatDateBR(g.deadline)}`}
          </div>
        </div>
        {!compact && <GoalStatusBadge status={g.status} />}
      </div>
      <Progress pct={p.pct} tone={tone} label={`Progresso de ${g.title}`} />
      <div className="goal-foot">
        <b>{p.label}</b>
        <span>
          {p.over ? <span className="flag flag-danger">Acima do orçamento</span>
            : p.achieved && g.status === 'andamento' ? <span className="flag flag-ok">✓ Atingido</span>
            : p.expired && g.status === 'andamento' ? <span className="flag flag-warn">Prazo encerrado</span>
            : p.daysLeft != null && g.status === 'andamento' ? `${p.daysLeft} ${p.daysLeft === 1 ? 'dia' : 'dias'}` : !p.auto ? 'manual' : ''}
        </span>
      </div>
    </Link>
  )
}
