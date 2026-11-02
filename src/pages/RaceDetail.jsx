import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { deleteRace, getRace, saveRace, useStore } from '../services/store.js'
import { StatusBadge, TopBar, useUI } from '../components/ui.jsx'
import { IconCalendar, IconEdit, IconExternal, IconStopwatch, IconTrash, IconAlert, IconInfo } from '../components/Icons.jsx'
import { STATUSES } from '../lib/model.js'
import { countdownLabel, formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace, paceSeconds } from '../lib/format.js'
import { inscriptionCost, nearbyRaces } from '../lib/stats.js'
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
  const { races } = useStore()
  const nav = useNavigate()
  const { confirm, notify } = useUI()
  const r = getRace(id)
  if (!r) return <Navigate to="/corridas" replace />

  const today = todayISO()
  const place = [r.city, r.state].filter(Boolean).join('/')
  const cost = inscriptionCost(r)
  const near = nearbyRaces(races, r.date, r.id)
  const res = r.result
  const pace = res ? paceSeconds(res.netTime, res.officialDistanceKm) : null
  const watchPace = res?.watchDistanceKm ? paceSeconds(res.netTime, res.watchDistanceKm) : null
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
                <Row k="Distância no relógio" v={res.watchDistanceKm && `${formatKm(res.watchDistanceKm)} (pace ${formatPace(watchPace)})`} />
                <Row k="Classificação geral" v={res.overallPlace && `${res.overallPlace}º`} />
                <Row k="Categoria" v={res.category} />
                <Row k="Classif. na categoria" v={res.categoryPlace && `${res.categoryPlace}º`} />
                <Row k="Esforço percebido" v={res.effort && `${res.effort}/10`} />
              </dl>
              {res.report && <p style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{res.report}</p>}
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
            <Row k="Inscrição" v={r.fee != null && formatMoney(r.fee)} />
            <Row k="Taxas" v={r.extraFees != null && formatMoney(r.extraFees)} />
            <Row k="Total inscrição" v={r.fee != null && r.extraFees != null && formatMoney(cost)} />
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
          {!r.venueName && !r.fee && !r.kitPickupDate && !r.notes && !r.bibNumber && (
            <div className="muted small">Ainda sem detalhes. <Link to={`/corridas/${r.id}/editar`}>Completar cadastro</Link></div>
          )}
          {r.signupUrl && <a className="btn btn-ghost btn-block" href={r.signupUrl} target="_blank" rel="noreferrer"><IconExternal /> Página de inscrição</a>}
        </div>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={exportIcs} disabled={!r.date} title={r.date ? '' : 'Defina a data para exportar'}><IconCalendar /> Agenda (.ics)</button>
          <button className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>
        </div>
        {!r.date && <p className="note">Para adicionar à agenda, defina a data da prova.</p>}
      </div>
    </>
  )
}
