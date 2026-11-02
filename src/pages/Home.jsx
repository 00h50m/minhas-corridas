import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { EmptyState, RaceItem, TopBar } from '../components/ui.jsx'
import { IconPlus, IconSettings, IconStopwatch, IconTarget } from '../components/Icons.jsx'
import SyncBadge from '../components/SyncBadge.jsx'
import { GoalCard } from './Goals.jsx'
import { memo as historyMemo } from './History.jsx'
import { activeGoals, goalProgress } from '../lib/goals.js'
import { upcomingAlerts, whenLabel } from '../lib/alerts.js'
import { countdownLabel, daysBetween, formatDateBR, todayISO } from '../lib/dates.js'
import { formatKm, formatMoney } from '../lib/format.js'
import { nextConfirmed, pendingResults, sameDateGroups, upcoming, yearSummary } from '../lib/stats.js'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Home() {
  const { races, goals } = useStore()
  const settings = (
    <>
      <SyncBadge />
      <Link to="/ajustes" className="icon-btn" aria-label="Ajustes e backup"><IconSettings /></Link>
    </>
  )
  const today = todayISO()
  const year = Number(today.slice(0, 4))

  if (races.length === 0) {
    return (
      <>
        <TopBar title="Minhas Corridas" sub={greeting()} right={settings} />
        <div className="page">
          <EmptyState
            title="Bora para a primeira?"
            text="Cadastre uma prova que você quer fazer ou em que já está inscrita. Só o nome é obrigatório — o resto você completa depois."
            action={<Link to="/corridas/nova" className="btn btn-primary btn-block"><IconPlus /> Cadastrar primeira corrida</Link>}
          />
          <p className="note">Já usa o app em outro aparelho? <Link to="/conta">Entre na sua conta</Link> para trazer suas corridas.</p>
        </div>
      </>
    )
  }

  const next = nextConfirmed(races, today)
  const list = upcoming(races, today, 6).filter((r) => r.id !== next?.id).slice(0, 4)
  const pending = pendingResults(races, today)
  const summary = yearSummary(races, year)
  const sameDates = sameDateGroups(races)
  // Objetivos já atingidos (aguardando confirmação) aparecem primeiro.
  const alerts = upcomingAlerts(races, today, 7)
  const active = activeGoals(goals)
    .map((g, i) => ({ g, i, hit: goalProgress(g, races, today).achieved }))
    .sort((a, b) => (a.hit === b.hit ? a.i - b.i : a.hit ? -1 : 1))
    .map((x) => x.g)
  const undatedCount = races.filter((r) => !r.date && ['interesse', 'aberta', 'inscrita'].includes(r.status)).length

  return (
    <>
      <TopBar title="Minhas Corridas" sub={greeting()} right={settings} />
      <div className="page">
        {pending.length > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 12 }}>
            <IconStopwatch />
            <div>
              <b>Como foi?</b> {pending.length === 1 ? `"${pending[0].name}" já aconteceu.` : `${pending.length} provas já aconteceram.`}{' '}
              <Link to={`/corridas/${pending[0].id}/resultado`}>Registrar resultado</Link>
            </div>
          </div>
        )}

        {next ? (
          <Link to={`/corridas/${next.id}`} className="hero">
            <div className="eyebrow">Próxima prova confirmada</div>
            <div className="count">{countdownLabel(next.date, today)}</div>
            <div className="name">{next.name}</div>
            <div className="meta">{[formatDateBR(next.date), next.startTime && `largada ${next.startTime}`, [next.city, next.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</div>
            <div className="chips">
              {next.distanceKm != null && <span className="chip">{formatKm(next.distanceKm)}</span>}
              {next.bibNumber && <span className="chip">Peito {next.bibNumber}</span>}
              {next.kitPickupDate && daysBetween(today, next.kitPickupDate) >= 0 && <span className="chip">Kit: {formatDateBR(next.kitPickupDate)}</span>}
              {next.checklist?.length > 0 && <span className="chip">Checklist {next.checklist.filter((i) => i.done).length}/{next.checklist.length}</span>}
            </div>
          </Link>
        ) : (
          <div className="card">
            <b>Nenhuma inscrição confirmada à frente.</b>
            <div className="muted small" style={{ marginTop: 4 }}>Quando marcar uma prova como “Inscrita”, a contagem regressiva aparece aqui.</div>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <Link to="/corridas/nova" className="btn btn-primary"><IconPlus /> Corrida</Link>
          <Link to={pending[0] ? `/corridas/${pending[0].id}/resultado` : '/corridas?concluir=1'} className="btn btn-dark"><IconStopwatch /> Resultado</Link>
        </div>

        {alerts.length > 0 && (
          <>
            <div className="section-title"><h2>Próximos 7 dias</h2></div>
            <div className="card alerts-card">
              <ul>
                {alerts.map((a) => (
                  <li key={a.key} className={`al-${a.type}${a.daysLeft <= 1 ? ' soon' : ''}`}>
                    <Link to={`/corridas/${a.race.id}`}>
                      <span className="when">{whenLabel(a.daysLeft)}</span>
                      <span className="what">
                        <b>{a.label}</b>
                        <span>{a.race.name} · {formatDateBR(a.date)}{a.time ? ` · ${a.time}` : ''}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="section-title"><h2>Em {year}</h2></div>
        <div className="stats">
          <div className="stat"><div className="v">{summary.doneCount}</div><div className="l">{summary.doneCount === 1 ? 'prova concluída' : 'provas concluídas'}</div></div>
          <div className="stat"><div className="v">{formatKm(summary.km, { unit: false })}</div><div className="l">km em provas</div></div>
          <Link to="/historico" onClick={() => { historyMemo.tab = 'gastos' }} className="stat stat-link"><div className="v" style={{ fontSize: summary.spent >= 10000 ? 20 : 24 }}>{formatMoney(summary.spent).replace(',00', '')}</div><div className="l">em inscrições ›</div></Link>
        </div>
        <p className="note">
          Quilômetros somam só as provas concluídas registradas aqui — não representam todo o seu volume de treino. Gastos com inscrição usam o valor pago ou, na falta dele, inscrição + taxas, das provas inscritas e concluídas (desistências só com valor pago).
          {summary.missingCost > 0 && ` ${summary.missingCost} ${summary.missingCost === 1 ? 'prova está' : 'provas estão'} sem valor informado.`}
        </p>

        <div className="section-title">
          <h2>Objetivos</h2>
          <Link to="/objetivos">{goals.length ? 'Ver todos' : ''}</Link>
        </div>
        {active.length === 0 ? (
          <Link to="/objetivos/novo" className="card goal-empty">
            <IconTarget />
            <span><b>{goals.length ? 'Nenhum objetivo em andamento.' : 'Defina um objetivo.'}</b><br /><span className="muted small">Ex.: 5 km abaixo de 30:00, primeira meia, orçamento do ano.</span></span>
          </Link>
        ) : (
          active.slice(0, 3).map((g) => <GoalCard key={g.id} goal={g} races={races} today={today} compact />)
        )}
        {active.length > 3 && <p className="note"><Link to="/objetivos">+{active.length - 3} em andamento</Link></p>}

        <div className="section-title">
          <h2>Próximas provas</h2>
          <Link to="/corridas">Ver calendário</Link>
        </div>
        {list.length === 0 ? (
          <div className="card muted small">Nenhuma outra prova com data à frente.{undatedCount > 0 && ` ${undatedCount} com data a confirmar.`}</div>
        ) : (
          list.map((r) => (
            <RaceItem key={r.id} race={r} extra={sameDates.has(r.date) && <span className="flag flag-warn">Mesma data</span>} />
          ))
        )}
        {undatedCount > 0 && list.length > 0 && (
          <p className="note"><Link to="/corridas?semdata=1">{undatedCount} {undatedCount === 1 ? 'prova' : 'provas'} com data a confirmar</Link></p>
        )}
      </div>
    </>
  )
}

