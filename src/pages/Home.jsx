import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarButton } from '../components/Avatar.jsx'
import { useProfile } from '../services/profile.js'
import { greeting } from '../lib/profile.js'
import { InstallBanner } from '../components/Install.jsx'
import { reviewInviteYear, reviewYears } from '../lib/yearReview.js'
import { installAvailable, useInstall } from '../services/install.js'
import { useStore } from '../services/store.js'
import { EmptyState, RaceItem, TopBar } from '../components/ui.jsx'
import { IconBell, IconPlus, IconScale, IconSettings, IconShare, IconStopwatch, IconTarget, IconTrophy } from '../components/Icons.jsx'
import SyncBadge from '../components/SyncBadge.jsx'
import { GoalCard } from './Goals.jsx'
import { memo as historyMemo } from './History.jsx'
import { activeGoals, goalProgress } from '../lib/goals.js'
import BudgetCard from '../components/Budget.jsx'
import { currentBudget } from '../lib/budget.js'
import { candidates } from '../lib/decision.js'
import { resultBadges } from '../lib/shareCard.js'
import { compareToTarget } from '../lib/targetCompare.js'
import { formatDiff } from '../lib/compare.js'
import { upcomingAlerts, whenLabel } from '../lib/alerts.js'
import { countdownLabel, daysBetween, formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace } from '../lib/format.js'
import { history, nextConfirmed, pendingResults, sameDateGroups, upcoming, yearSummary } from '../lib/stats.js'

function Brand() {
  return (
    <span className="brand" aria-label="PaceOn">
      <img src="/logo-256.png" alt="" width="34" height="34" />
      <span aria-hidden="true">PACE<span className="on">ON</span></span>
    </span>
  )
}

const INVITE_KEY = 'minhas-corridas:convite-perfil'

/** Convite discreto para completar o perfil (some ao preencher o nome ou ao dispensar). */
function ProfileInvite() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(INVITE_KEY) === 'dispensado'
    } catch {
      return false
    }
  })
  if (hidden) return null
  const dismiss = () => {
    try {
      localStorage.setItem(INVITE_KEY, 'dispensado')
    } catch {
      /* sem armazenamento */
    }
    setHidden(true)
  }
  return (
    <div className="card profile-invite" data-testid="profile-invite">
      <Avatar size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Como você quer ser chamada(o)?</b>
        <div className="muted small">Nome, foto, camiseta e contato de emergência deixam o app com a sua cara. Tudo opcional.</div>
        <div className="pi-actions">
          <Link to="/perfil" className="link-btn">Completar perfil</Link>
          <button type="button" className="link-btn muted-btn" onClick={dismiss}>Agora não</button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { races, goals } = useStore()
  const prof = useProfile()
  const settings = (
    <>
      <SyncBadge />
      <AvatarButton />
      <Link to="/ajustes" className="icon-btn" aria-label="Ajustes e backup"><IconSettings /></Link>
    </>
  )
  const today = todayISO()
  const year = Number(today.slice(0, 4))
  const hello = greeting(prof.data, new Date(), today)
  const inst = useInstall()
  const showInstall = installAvailable(inst) && !inst.snoozed
  // Um convite por vez: primeiro instalar, depois o perfil.
  const invite = !showInstall && !prof.data.name && !prof.data.nickname

  if (races.length === 0) {
    return (
      <>
        <TopBar title={<Brand />} sub={<span className="greet">{hello}</span>} right={settings} />
        <div className="page">
          {showInstall && <InstallBanner />}
          {showInstall && <InstallBanner />}
        {invite && <ProfileInvite />}
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
  const daysToNext = next ? daysBetween(today, next.date) : null
  // Na véspera e no dia, o destaque abre o modo "dia da prova".
  const raceDay = next && daysToNext <= 1
  const list = upcoming(races, today, 6).filter((r) => r.id !== next?.id).slice(0, 3)
  const pending = pendingResults(races, today)
  const summary = yearSummary(races, year)
  const sameDates = sameDateGroups(races)
  const alerts = upcomingAlerts(races, today, 7).filter((a) => !(a.type === 'prova' && a.race.id === next?.id))
  const budget = currentBudget(goals, today)
  // Objetivos já atingidos (aguardando confirmação) aparecem primeiro; o orçamento tem cartão próprio.
  const active = activeGoals(goals).filter((g) => g.id !== budget?.id)
    .map((g, i) => ({ g, i, hit: goalProgress(g, races, today).achieved }))
    .sort((a, b) => (a.hit === b.hit ? a.i - b.i : a.hit ? -1 : 1))
    .map((x) => x.g)
  const cands = candidates(races, today)
  const undatedCount = races.filter((r) => !r.date && ['interesse', 'aberta', 'inscrita'].includes(r.status)).length
  const last = history(races)[0]
  const showLast = last && daysBetween(last.date, today) <= 60
  const retroYear = reviewInviteYear(today)

  return (
    <>
      <TopBar title={<Brand />} sub={<span className="greet">{hello}</span>} right={settings} />
      <div className="page home">
        {showInstall && <InstallBanner />}
        {invite && <ProfileInvite />}
        {pending.length > 0 && (
          <Link to={`/corridas/${pending[0].id}/resultado`} className="alert alert-warn home-pending">
            <IconStopwatch />
            <div><b>Como foi?</b> {pending.length === 1 ? `“${pending[0].name}” já aconteceu.` : `${pending.length} provas já aconteceram.`} <u>Registrar resultado</u></div>
          </Link>
        )}

        {next ? <NextHero race={next} today={today} days={daysToNext} raceDay={raceDay} /> : (
          <div className="card hero-empty">
            <b>Nenhuma inscrição confirmada à frente.</b>
            <div className="muted small" style={{ marginTop: 4 }}>
              {cands.length ? <>Você tem {cands.length} {cands.length === 1 ? 'prova' : 'provas'} em avaliação. <Link to="/decidir">Decidir</Link></> : 'Quando marcar uma prova como “Inscrita”, a contagem regressiva aparece aqui.'}
            </div>
          </div>
        )}

        <nav className="quick" aria-label="Atalhos">
          <Link to={pending[0] ? `/corridas/${pending[0].id}/resultado` : '/corridas?concluir=1'} className={pending.length ? 'hot' : ''}>
            <IconStopwatch /><span>Resultado</span>{pending.length > 0 && <i>{pending.length}</i>}
          </Link>
          <Link to="/decidir" data-testid="decide-link"><IconScale /><span>Decidir</span>{cands.length > 0 && <i>{cands.length}</i>}</Link>
          <Link to="/historico" onClick={() => { historyMemo.tab = 'recordes' }}><IconTrophy /><span>Recordes</span></Link>
          <Link to="/lembretes"><IconBell /><span>Avisos</span></Link>
        </nav>

        {alerts.length > 0 && (
          <>
            <div className="section-title"><h2>Esta semana</h2></div>
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

        {retroYear && reviewYears(races).includes(retroYear) && (
          <Link to={`/retrospectiva/${retroYear}`} className="card decide-link retro-invite" data-testid="retro-invite">
            <span style={{ fontSize: 26 }} aria-hidden="true">🎉</span>
            <span style={{ flex: 1, minWidth: 0 }}><b>Sua retrospectiva {retroYear}</b><br /><span className="muted small">Provas, km, recordes e o card para compartilhar.</span></span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        {showLast && <LastRace race={last} races={races} />}

        <div className="section-title"><h2>Seu {year}</h2><Link to="/historico" onClick={() => { historyMemo.tab = 'evolucao' }}>Evolução</Link></div>
        <div className="stats">
          <div className="stat"><div className="v">{summary.doneCount}</div><div className="l">{summary.doneCount === 1 ? 'prova concluída' : 'provas concluídas'}</div></div>
          <div className="stat"><div className="v">{formatKm(summary.km, { unit: false })}</div><div className="l">km em provas</div></div>
          <Link to="/historico" onClick={() => { historyMemo.tab = 'gastos' }} className="stat stat-link"><div className="v" style={{ fontSize: summary.spent >= 10000 ? 20 : 26 }}>{formatMoney(summary.spent).replace(',00', '')}</div><div className="l">em inscrições ›</div></Link>
        </div>
        {budget ? <BudgetCard goals={goals} races={races} today={today} compact /> : (
          <Link to={`/objetivos/novo?tipo=orcamento&ano=${year}`} className="home-hint">+ Definir orçamento de {year}</Link>
        )}
        <details className="how-count">
          <summary>Como contamos</summary>
          <p>Quilômetros somam só as provas concluídas registradas aqui — não o seu volume de treino. Gastos usam o valor pago ou, na falta dele, inscrição + taxas, das provas inscritas e concluídas (desistências só com valor pago).{summary.missingCost > 0 && ` ${summary.missingCost} ${summary.missingCost === 1 ? 'prova está' : 'provas estão'} sem valor informado.`}</p>
        </details>

        <div className="section-title">
          <h2>Objetivos</h2>
          <Link to="/objetivos">{active.length > 2 ? `Ver todos (${active.length})` : goals.length ? 'Ver todos' : ''}</Link>
        </div>
        {active.length === 0 ? (
          <Link to="/objetivos/novo" className="card goal-empty">
            <IconTarget />
            <span><b>{budget ? 'Além do orçamento, nenhum objetivo em andamento.' : goals.length ? 'Nenhum objetivo em andamento.' : 'Defina um objetivo.'}</b><br /><span className="muted small">Ex.: 5 km abaixo de 30:00, primeira meia, 8 provas no ano.</span></span>
          </Link>
        ) : (
          active.slice(0, 2).map((g) => <GoalCard key={g.id} goal={g} races={races} today={today} compact />)
        )}

        <div className="section-title">
          <h2>Próximas provas</h2>
          <Link to="/corridas">Calendário</Link>
        </div>
        {list.length === 0 ? (
          <div className="card muted small">Nenhuma outra prova com data à frente.{undatedCount > 0 && ` ${undatedCount} com data a confirmar.`} <Link to="/corridas/nova">Cadastrar</Link></div>
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

/** Destaque da próxima prova confirmada: contagem, meta, kit e preparação. */
function NextHero({ race: r, today, days, raceDay }) {
  const items = r.checklist ?? []
  const done = items.filter((i) => i.done).length
  const kitDone = items.some((i) => i.done && /kit retirado/i.test(i.text))
  const kitDays = r.kitPickupDate ? daysBetween(today, r.kitPickupDate) : null
  const pace = r.targetTime && r.distanceKm ? formatPace(r.targetTime / r.distanceKm).replace(' /km', '/km') : null
  return (
    <Link to={`/corridas/${r.id}${raceDay ? '/dia' : ''}`} className="hero">
      <div className="eyebrow">{raceDay ? 'Dia de prova · toque para o modo prova' : 'Próxima prova'}</div>
      <div className="count">{countdownLabel(r.date, today)}</div>
      <div className="name">{r.name}</div>
      <div className="meta">{[formatDateBR(r.date), r.startTime && `largada ${r.startTime}`, [r.city, r.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</div>
      <div className="chips">
        {r.distanceKm != null && <span className="chip">{formatKm(r.distanceKm)}</span>}
        {r.targetTime ? <span className="chip">Meta {formatDuration(r.targetTime)}{pace ? ` · ${pace}` : ''}</span> : <span className="chip chip-dim">Sem meta</span>}
        {r.bibNumber && <span className="chip">Peito {r.bibNumber}</span>}
        {r.kitPickupDate && (kitDone ? <span className="chip">Kit ✓</span> : kitDays >= 0 && <span className={`chip${kitDays <= 2 ? ' chip-hot' : ''}`}>Kit {kitDays === 0 ? 'hoje' : kitDays === 1 ? 'amanhã' : formatDateBR(r.kitPickupDate).slice(0, 5)}</span>)}
      </div>
      {items.length > 0 && (
        <div className="prep" aria-label={`Preparação: ${done} de ${items.length} itens`}>
          <div className="prep-bar"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
          <span>Preparação {done}/{items.length}</span>
        </div>
      )}
      {days != null && days <= 7 && !raceDay && <div className="hero-cta">Modo dia da prova disponível ›</div>}
    </Link>
  )
}

/** Última prova concluída (até 60 dias): tempo, selos e compartilhar. */
function LastRace({ race: r, races }) {
  const res = r.result
  const badges = resultBadges(r, races)
  const c = compareToTarget(r)
  return (
    <>
      <div className="section-title"><h2>Última prova</h2><Link to={`/corridas/${r.id}`}>Ver análise</Link></div>
      <div className="card last-race" data-testid="last-race">
        <div className="lr-top">
          <div style={{ minWidth: 0 }}>
            <div className="lr-name">{r.name}</div>
            <div className="muted small">{formatDateBR(r.date)} · {formatKm(res.officialDistanceKm)}{res.overallPlace ? ` · ${res.overallPlace}º geral` : ''}</div>
          </div>
          <div className="lr-time">
            <div className="v">{formatDuration(res.netTime)}</div>
            <div className="l">{formatPace(res.netTime / res.officialDistanceKm)}</div>
          </div>
        </div>
        {(badges.length > 0 || c) && (
          <div className="lr-badges">
            {badges.map((b) => <span key={b.id} className={`flag ${b.id === 'meta' ? 'flag-ok' : 'flag-brand'}`}>{b.label}</span>)}
            {c && c.status !== 'batida' && <span className="flag flag-warn">Meta {formatDuration(c.target)} · {formatDiff(c.diff)}</span>}
          </div>
        )}
        <Link to={`/corridas/${r.id}/compartilhar`} className="btn btn-primary btn-block" style={{ marginTop: 12 }}><IconShare /> Compartilhar resultado</Link>
      </div>
    </>
  )
}
