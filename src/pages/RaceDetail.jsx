import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { deleteRace, getRace, saveRace, useStore } from '../services/store.js'
import { StatusBadge, TopBar, useUI } from '../components/ui.jsx'
import { IconRepeat, IconCalendar, IconEdit, IconExternal, IconStopwatch, IconTrash, IconAlert, IconInfo } from '../components/Icons.jsx'
import { STATUSES } from '../lib/model.js'
import { countdownLabel, formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace, paceSeconds } from '../lib/format.js'
import { distanceKey, nearbyRaces } from '../lib/stats.js'
import { raceCosts } from '../lib/costs.js'
import Checklist from '../components/Checklist.jsx'
import Attachments from '../components/Attachments.jsx'
import WatchSummary from '../components/WatchSummary.jsx'
import { RaceAnalysis, RacePlan } from '../components/Analysis.jsx'
import { IconBell, IconCompare, IconShare } from '../components/Icons.jsx'
import { comparableRaces } from '../lib/compare.js'
import { buildICS } from '../lib/ics.js'
import { downloadText } from '../services/backup.js'

function Row({ k, v }) {
  if (v == null || v === '' || v === false) return null
  return (<><dt>{k}</dt><dd>{v}</dd></>)
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'corrida'
}

export default function RaceDetail() {
  const { id } = useParams()
  const { races, goals } = useStore()
  const nav = useNavigate()
  const { confirm, notify } = useUI()
  const r = getRace(id)
  if (!r) return <Navigate to="/corridas" replace />

  const today = todayISO()
  const place = [r.city, r.state].filter(Boolean).join('/')
  const costs = raceCosts(r)
  const checklistOpenByDefault = ['interesse', 'aberta', 'inscrita'].includes(r.status)
  const doneItems = (r.checklist ?? []).filter((i) => i.done).length
  const near = nearbyRaces(races, r.date, r.id)
  const res = r.result
  const pace = res ? paceSeconds(res.netTime, res.officialDistanceKm) : null
  const watchPace = res?.watchDistanceKm ? paceSeconds(res.netTime, res.watchDistanceKm) : null
  // Sugestão para comparar: a prova anterior mais parecida (mesma distância, com parciais).
  const cmpList = res ? comparableRaces(races, r) : []
  const sameKm = (x) => distanceKey(x.result.officialDistanceKm) === distanceKey(res.officialDistanceKm)
  const compareWith = cmpList.find((x) => sameKm(x) && x.date < r.date) ?? cmpList[0] ?? null
  const canResult = r.date && r.date <= today && r.status !== 'cancelada' && r.status !== 'desisti'

  const onDelete = async () => {
    const ok = await confirm({ title: 'Excluir esta corrida?', message: `“${r.name}”${res ? ' e o resultado registrado' : ''} serão apagados deste aparelho. Não dá para desfazer.`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    deleteRace(r.id)
    notify('Corrida excluída')
    nav('/corridas', { replace: true })
  }

  const onDeleteResult = async () => {
    const ok = await confirm({ title: 'Apagar o resultado?', message: 'A prova volta para o status “Inscrita”. Os demais dados continuam salvos.', confirmLabel: 'Apagar resultado', danger: true })
    if (!ok) return
    saveRace({ ...r, result: null, status: 'inscrita' })
    notify('Resultado apagado')
  }

  const changeStatus = (status) => {
    if (status === 'concluida') {
      nav(`/corridas/${r.id}/resultado`)
      return
    }
    if (r.result) {
      notify('Apague o resultado antes de mudar o status')
      return
    }
    saveRace({ ...r, status })
    notify('Status atualizado')
  }

  const exportIcs = () => {
    const { text } = buildICS([r])
    downloadText(text, `${slug(r.name)}.ics`, 'text/calendar')
  }

  return (
    <>
      <TopBar
        title="Corrida"
        back="/corridas"
        right={<Link to={`/corridas/${r.id}/editar`} className="icon-btn" aria-label="Editar"><IconEdit /></Link>}
      />
      <div className="page">
        <div className="card detail-head">
          <StatusBadge status={r.status} />
          <div className="name" style={{ marginTop: 10 }}>{r.name}</div>
          <div className="muted" style={{ marginTop: 6, fontWeight: 700 }}>
            {r.date ? formatDateBR(r.date) : 'Data a confirmar'}
            {r.startTime && ` · largada ${r.startTime}`}
            {place && ` · ${place}`}
          </div>
          <div className="row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {r.distanceKm != null && <span className="chip">Vou correr {formatKm(r.distanceKm)}</span>}
            {r.date && r.date >= today && <span className="chip">{countdownLabel(r.date, today)}</span>}
            {r.availableDistances.length > 1 && <span className="chip">Opções: {r.availableDistances.map((d) => formatKm(d, { unit: false })).join(' / ')} km</span>}
          </div>
        </div>

        {(near.sameDay.length > 0 || near.adjacent.length > 0) && (
          <div className={`alert ${near.sameDay.length ? 'alert-warn' : 'alert-info'}`} style={{ marginTop: 12 }}>
            {near.sameDay.length ? <IconAlert /> : <IconInfo />}
            <div>
              {near.sameDay.length > 0 && <div><b>Mesma data:</b> {near.sameDay.map((x) => x.name).join(', ')}</div>}
              {near.adjacent.length > 0 && <div><b>Dia seguido:</b> {near.adjacent.map((x) => `${x.name} (${formatDateBR(x.date)})`).join(', ')}</div>}
            </div>
          </div>
        )}

        {res ? (
          <>
            <div className="section-title"><h2>Resultado</h2><Link to={`/corridas/${r.id}/resultado`}>Editar</Link></div>
            <div className="card">
              <div className="big-numbers">
                <div><div className="v">{formatDuration(res.netTime)}</div><div className="l">tempo líquido</div></div>
                <div><div className="v">{formatPace(pace).replace(' /km', '')}</div><div className="l">pace min/km</div></div>
                <div><div className="v">{formatKm(res.officialDistanceKm, { unit: false })}</div><div className="l">km oficiais</div></div>
              </div>
              {!res.isOfficial && <div className="alert alert-info small" style={{ marginTop: 12 }}><IconInfo /><div>Registro pessoal — sem resultado oficial da organização.</div></div>}
              {r.targetTime && (
                <div className={`alert small ${res.netTime <= r.targetTime ? 'alert-ok' : 'alert-warn'}`} style={{ marginTop: 12 }}>
                  <div>
                    <b>Meta {formatDuration(r.targetTime)}</b> ·{' '}
                    {res.netTime <= r.targetTime
                      ? `batida por ${formatDuration(r.targetTime - res.netTime)}`
                      : `ficou ${formatDuration(res.netTime - r.targetTime)} acima`}
                  </div>
                </div>
              )}
              <dl className="kv" style={{ marginTop: 14 }}>
                <Row k="Tempo bruto" v={res.grossTime && formatDuration(res.grossTime)} />
                <Row k="Distância no relógio" v={!res.watch && res.watchDistanceKm && `${formatKm(res.watchDistanceKm)} (pace ${formatPace(watchPace)})`} />
                <Row k="Classificação geral" v={res.overallPlace && `${res.overallPlace}º`} />
                <Row k="Categoria" v={res.category} />
                <Row k="Classif. na categoria" v={res.categoryPlace && `${res.categoryPlace}º`} />
                <Row k="Esforço percebido" v={res.effort && `${res.effort}/10`} />
              </dl>
              {res.watch && (
                <>
                  <div className="list-group-title" style={{ marginTop: 16 }}>Do relógio</div>
                  <WatchSummary watch={res.watch} officialKm={res.officialDistanceKm} />
                </>
              )}
              {res.report && <p style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{res.report}</p>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <Link to={`/corridas/${r.id}/compartilhar`} className="btn btn-primary"><IconShare /> Compartilhar</Link>
                {compareWith ? (
                  <Link to={`/comparar?a=${compareWith.id}&b=${r.id}`} className="btn"><IconCompare /> Comparar</Link>
                ) : (
                  <button className="btn" disabled title="Registre outra prova para comparar"><IconCompare /> Comparar</button>
                )}
              </div>
              <div className="list-group-title" style={{ marginTop: 16 }}>Fotos</div>
              <Attachments raceId={r.id} mode="photos" />
              {res.officialUrl && <a className="btn btn-ghost btn-block" href={res.officialUrl} target="_blank" rel="noreferrer"><IconExternal /> Resultado oficial</a>}
              <button className="btn btn-ghost btn-block" onClick={onDeleteResult} style={{ color: 'var(--danger)' }}>Apagar resultado</button>
            </div>
          </>
        ) : (
          canResult && (
            <Link to={`/corridas/${r.id}/resultado`} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>
              <IconStopwatch /> Registrar resultado
            </Link>
          )
        )}

        {res ? (
          <>
            <div className="section-title"><h2>Como foi a prova</h2></div>
            <RaceAnalysis race={r} races={races} goals={goals} />
          </>
        ) : (
          r.targetTime && r.distanceKm && !['cancelada', 'desisti'].includes(r.status) && (
            <>
              <div className="section-title"><h2>Plano de prova</h2><Link to={`/corridas/${r.id}/editar`}>Mudar meta</Link></div>
              <RacePlan race={r} />
            </>
          )
        )}

        <div className="section-title"><h2>Status</h2></div>
        <div className="seg" role="group" aria-label="Alterar status">
          {STATUSES.map((s) => (
            <button key={s.id} type="button" aria-pressed={r.status === s.id} onClick={() => r.status !== s.id && changeStatus(s.id)}>
              <span aria-hidden="true">{s.icon} </span>{s.label}
            </button>
          ))}
        </div>

        <div className="section-title"><h2>Detalhes</h2></div>
        <div className="card">
          <dl className="kv">
            <Row k="Local" v={r.venueName} />
            <Row k="Endereço" v={r.venueAddress} />
            <Row k="Sair de casa" v={r.leaveHomeTime} />
            <Row k="Companhia" v={r.companions} />
            <Row k="Organizador" v={r.organizer} />
            <Row k="Prazo inscrição" v={r.signupDeadline && formatDateBR(r.signupDeadline)} />
            <Row k="Muda de lote" v={r.lotChangeDate && formatDateBR(r.lotChangeDate)} />
            <Row k="Nº de peito" v={r.bibNumber} />
            <Row k="Meta de tempo" v={r.targetTime && formatDuration(r.targetTime)} />
            <Row k="Camiseta" v={r.shirtIncluded && (r.shirtSize ? `Sim · ${r.shirtSize}` : 'Sim')} />
            <Row k="Retirada do kit" v={r.kitPickupDate && `${formatDateBR(r.kitPickupDate)}${r.kitPickupTime ? ` · ${r.kitPickupTime}` : ''}`} />
            <Row k="Local da retirada" v={r.kitPickupAddress} />
            <Row k="Quem retira" v={r.kitPickupBy} />
            <Row k="Itens do kit" v={r.kitItems} />
          </dl>
          {r.notes && <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{r.notes}</p>}
          {!r.venueName && !r.kitPickupDate && !r.notes && !r.bibNumber && !r.organizer && !r.signupDeadline && (
            <div className="muted small">Ainda sem detalhes. <Link to={`/corridas/${r.id}/editar`}>Completar cadastro</Link></div>
          )}
          {r.signupUrl && <a className="btn btn-ghost btn-block" href={r.signupUrl} target="_blank" rel="noreferrer"><IconExternal /> Página de inscrição</a>}
        </div>

        <div className="section-title"><h2>Custos</h2><Link to={`/corridas/${r.id}/editar#custos`}>Editar</Link></div>
        <CostsCard r={r} costs={costs} />

        {checklistOpenByDefault ? (
          <>
            <div className="section-title"><h2>Checklist</h2></div>
            <Checklist race={r} />
          </>
        ) : (
          <details className="section">
            <summary>Checklist<span className="sum">{doneItems}/{r.checklist?.length ?? 0}</span></summary>
            <div className="body" style={{ paddingBottom: 16 }}><Checklist race={r} /></div>
          </details>
        )}

        <div className="section-title"><h2>Anexos</h2></div>
        <Attachments raceId={r.id} mode="docs" />

        {r.date && (
          <Link to={`/corridas/nova?repetir=${r.id}`} className="btn btn-block" style={{ marginTop: 16 }}>
            <IconRepeat /> Repetir em {Number(r.date.slice(0, 4)) + 1}
          </Link>
        )}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportIcs} disabled={!r.date} title={r.date ? '' : 'Defina a data para exportar'}><IconCalendar /> Agenda (.ics)</button>
          <button className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>
        </div>
        {!r.date ? (
          <p className="note">Para adicionar à agenda, defina a data da prova.</p>
        ) : (
          <p className="note"><Link to="/lembretes"><IconBell /> Agenda que se atualiza sozinha e notificações de prazos</Link></p>
        )}
      </div>
    </>
  )
}

function CostsCard({ r, costs }) {
  if (!costs.hasAny) {
    return (
      <div className="card muted small">
        Nenhum custo informado. <Link to={`/corridas/${r.id}/editar#custos`}>Adicionar inscrição, transporte ou hospedagem</Link>
      </div>
    )
  }
  const visible = costs.lines.filter((l) => l.estimated != null || l.paid != null)
  return (
    <div className="card">
      <table className="cost-table">
        <thead>
          <tr><th scope="col">Categoria</th><th scope="col">Estimado</th><th scope="col">Pago</th></tr>
        </thead>
        <tbody>
          {visible.map((l) => (
            <tr key={l.id}>
              <th scope="row">{l.label}{l.id === 'outros' && r.otherDesc ? <span className="muted small"> · {r.otherDesc}</span> : ''}</th>
              <td>{l.estimated != null ? formatMoney(l.estimated) : '—'}</td>
              <td>{l.paid != null ? formatMoney(l.paid) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {costs.committed || costs.paidOnly ? (
        <div className="cost-total">
          <span>Total da corrida</span>
          <b>{formatMoney(costs.total)}</b>
        </div>
      ) : (
        <div className="cost-total">
          <span>Previsto, se você se inscrever</span>
          <b>{formatMoney(costs.planned)}</b>
        </div>
      )}
      <p className="note">
        {costs.committed && (costs.estimatedPart > 0 ? `${formatMoney(costs.paid)} pagos + ${formatMoney(costs.estimatedPart)} estimados (sem valor pago informado). ` : 'Tudo com valor pago informado. ')}
        {costs.paidOnly && 'Prova cancelada ou desistência: só os valores pagos entram no total. '}
        {!costs.committed && !costs.paidOnly && 'Ainda não entra nos seus gastos — só quando a inscrição for confirmada. '}
        Em cada categoria vale o pago; se não houver, a estimativa. A inscrição nunca é somada duas vezes.
      </p>
    </div>
  )
}
