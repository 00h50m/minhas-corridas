// Desafio com amigas: criar (km, treinos ou horas no mês), convidar por link, ver o ranking e sair.
// Cada pessoa só envia o total dela no período, calculado no aparelho; nunca as atividades.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, Sheet, TopBar, useUI } from '../components/ui.jsx'
import CopyBox from '../components/CopyBox.jsx'
import { IconPlus, IconShare, IconStory, IconUsers } from '../components/Icons.jsx'
import { useStore } from '../services/store.js'
import { useSync } from '../services/sync.js'
import { useProfile } from '../services/profile.js'
import { challengeBoard, createChallenge, joinChallenge, leaveChallenge, myChallenges, setChallengeValue } from '../services/challenges.js'
import { METRICS, METRIC_BY_ID, challengeValue, formatValue, inviteUrl, monthTitle, periodFor, phase, ranking } from '../lib/challenge.js'
import { formatDateBR, todayISO } from '../lib/dates.js'

const STORY_KEY = 'paceon:desafio-story'
const firstName = (p) => (p?.nickname || p?.name || '').trim().split(/\s+/)[0] || ''

const INVITE_KEY = 'paceon:convite'
/** Convite aberto sem conta: guarda o código para seguir depois do login (o Início retoma). */
export function pendingInvite() { try { return localStorage.getItem(INVITE_KEY) } catch { return null } }
export function clearInvite() { try { localStorage.removeItem(INVITE_KEY) } catch { /* ok */ } }

function NeedAccount({ sync, children, code = null }) {
  if (sync.configured && sync.user) return children
  if (code) { try { localStorage.setItem(INVITE_KEY, code) } catch { /* ok */ } }
  return (
    <div className="page">
      <EmptyState title="Desafio com amigas" text="Para criar ou entrar num desafio, entre na sua conta: o ranking fica no servidor e só recebe o seu total (km, treinos ou horas), nunca as suas atividades." action={<Link to="/conta" className="btn btn-primary btn-block">Entrar ou criar conta</Link>} />
    </div>
  )
}

/** Atualiza o meu total em cada desafio em andamento (ou encerrado há pouco). */
async function pushMine(list, data, today) {
  for (const c of list) {
    const ph = phase(c, today)
    if (ph.state === 'antes') continue
    if (ph.state === 'encerrado' && c.end_date < todayMinus(today, 7)) continue
    await setChallengeValue(c.id, challengeValue(c.metric, c.start_date, c.end_date, data, today)).catch(() => {})
  }
}
const todayMinus = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10)

export default function Challenges() {
  const sync = useSync()
  return (
    <>
      <TopBar title="Desafios" sub="com amigas" back="/" />
      <NeedAccount sync={sync}><List /></NeedAccount>
    </>
  )
}

function List() {
  const { workouts, races } = useStore()
  const nav = useNavigate()
  const today = todayISO()
  const [list, setList] = useState(null)
  const [err, setErr] = useState(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    let alive = true
    myChallenges().then(async (l) => { if (!alive) return; setList(l); await pushMine(l, { workouts, races }, today) }).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [])
  return (
    <div className="page" data-testid="challenges">
      {err && <div className="alert alert-error small" role="alert">{err}</div>}
      {list === null && !err && <div className="card muted small">Carregando…</div>}
      {list?.length === 0 && (
        <EmptyState title="Desafie suas amigas" text="Quem corre mais km, faz mais treinos ou soma mais horas no mês. Cada uma só compartilha o total, nunca as atividades." action={<button type="button" className="btn btn-primary btn-block" onClick={() => setCreating(true)} data-testid="ch-new"><IconPlus /> Criar desafio</button>} />
      )}
      {list?.map((c) => {
        const ph = phase(c, today)
        return (
          <Link key={c.id} to={`/desafios/${c.id}`} className="card ch-item" data-testid="ch-item">
            <span className="ch-ic"><IconUsers /></span>
            <span className="ch-t">
              <b>{c.title}</b>
              <span className="muted small">{METRIC_BY_ID[c.metric]?.label} · {formatDateBR(c.start_date).slice(0, 5)} a {formatDateBR(c.end_date).slice(0, 5)} · {c.members} {Number(c.members) === 1 ? 'pessoa' : 'pessoas'}</span>
              <span className={`small ch-ph ch-${ph.state}`}>{ph.state === 'antes' ? `começa em ${ph.days} ${ph.days === 1 ? 'dia' : 'dias'}` : ph.state === 'encerrado' ? 'encerrado' : `faltam ${ph.days} ${ph.days === 1 ? 'dia' : 'dias'}`}</span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )
      })}
      {list?.length > 0 && <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setCreating(true)} data-testid="ch-new"><IconPlus /> Criar desafio</button>}
      <p className="note">O app calcula o seu total no aparelho (treinos marcados como feitos e provas concluídas no período) e envia só esse número. Para sair de um desafio, abra-o e toque em “Sair”.</p>
      {creating && <CreateSheet onClose={() => setCreating(false)} onCreated={(id) => nav(`/desafios/${id}?novo=1`)} />}
    </div>
  )
}

function CreateSheet({ onClose, onCreated }) {
  const prof = useProfile()
  const { workouts, races } = useStore()
  const today = todayISO()
  const [metric, setMetric] = useState('km')
  const [when, setWhen] = useState(Number(today.slice(8)) > 20 ? 'proximo' : 'este')
  const { start, end } = periodFor(when, today)
  const [title, setTitle] = useState('')
  const [name, setName] = useState(firstName(prof?.data))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await createChallenge({ title: title.trim() || monthTitle(metric, start), metric, start, end, name: name.trim() })
      await setChallengeValue(r.id, challengeValue(metric, start, end, { workouts, races }, today)).catch(() => {})
      onCreated(r.id)
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet title="Novo desafio" onClose={onClose}>
      <div className="form" data-testid="ch-create">
        <div className="field"><span className="lbl">O que conta</span>
          <div className="seg">{METRICS.map((m) => <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} data-testid={`ch-metric-${m.id}`}>{m.label}</button>)}</div>
        </div>
        <div className="field"><span className="lbl">Quando</span>
          <div className="seg">{[['este', 'Este mês'], ['proximo', 'Próximo mês']].map(([id, l]) => <button key={id} type="button" aria-pressed={when === id} onClick={() => setWhen(id)}>{l}</button>)}</div>
          <span className="muted small">{formatDateBR(start)} a {formatDateBR(end)}</span>
        </div>
        <div className="field"><label htmlFor="ch-title">Nome do desafio</label><input id="ch-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={monthTitle(metric, start)} /></div>
        <div className="field"><label htmlFor="ch-name">Seu nome no ranking</label><input id="ch-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Ex.: Gi" data-testid="ch-name" /></div>
        {err && <div className="alert alert-error small" role="alert">{err}</div>}
        <button type="button" className="btn btn-primary btn-block" disabled={busy || !name.trim()} onClick={create} data-testid="ch-create-btn">{busy ? 'Criando…' : 'Criar e convidar'}</button>
      </div>
    </Sheet>
  )
}

export function ChallengeDetail() {
  const sync = useSync()
  return (
    <>
      <TopBar title="Desafio" back="/desafios" />
      <NeedAccount sync={sync}><Detail /></NeedAccount>
    </>
  )
}

function Detail() {
  const { id } = useParams()
  const { workouts, races } = useStore()
  const { notify, confirm } = useUI()
  const nav = useNavigate()
  const today = todayISO()
  const [c, setC] = useState(null)
  const [board, setBoard] = useState(null)
  const [err, setErr] = useState(null)
  const load = async () => {
    try {
      const l = await myChallenges()
      const me = l.find((x) => x.id === id)
      if (!me) { setErr('Você não participa deste desafio.'); return }
      setC(me)
      if (phase(me, today).state !== 'antes') await setChallengeValue(id, challengeValue(me.metric, me.start_date, me.end_date, { workouts, races }, today)).catch(() => {})
      setBoard(ranking(await challengeBoard(id)))
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [id])
  if (err) return <div className="page"><div className="alert alert-error small" role="alert">{err}</div></div>
  if (!c || !board) return <div className="page"><div className="card muted small">Carregando…</div></div>
  const ph = phase(c, today)
  const me = board.find((m) => m.is_me)
  const url = inviteUrl(location.origin, c.code)
  const shareInvite = async () => {
    const text = `Bora no desafio “${c.title}” (${METRIC_BY_ID[c.metric].label}, ${formatDateBR(c.start_date).slice(0, 5)} a ${formatDateBR(c.end_date).slice(0, 5)})? Entra pelo PaceOn: ${url}`
    try { if (navigator.share) { await navigator.share({ title: c.title, text, url }); return } } catch { return }
    try { await navigator.clipboard.writeText(text); notify('Convite copiado') } catch { notify('Copie o link abaixo') }
  }
  const toStory = () => {
    try { localStorage.setItem(STORY_KEY, JSON.stringify({ id: c.id, title: c.title, metric: c.metric, start: c.start_date, end: c.end_date, board: board.map(({ name, value, pos, is_me }) => ({ name, value, pos, me: is_me })) })) } catch { /* ok */ }
    nav(`/stories?modelo=desafio&desafio=${c.id}`)
  }
  const leave = async () => {
    if (!(await confirm({ title: `Sair de “${c.title}”?`, message: 'Seu total sai do ranking. Para voltar, use o convite de novo.', confirmLabel: 'Sair', danger: true }))) return
    try { await leaveChallenge(c.id); notify('Você saiu do desafio'); nav('/desafios', { replace: true }) } catch (e) { notify(e.message) }
  }
  return (
    <div className="page" data-testid="challenge">
      <div className="card ch-head">
        <b>{c.title}</b>
        <span className="muted small">{METRIC_BY_ID[c.metric].label} · {formatDateBR(c.start_date)} a {formatDateBR(c.end_date)}</span>
        <span className={`small ch-ph ch-${ph.state}`}>{ph.state === 'antes' ? `Começa em ${ph.days} ${ph.days === 1 ? 'dia' : 'dias'}` : ph.state === 'encerrado' ? 'Encerrado' : `Faltam ${ph.days} ${ph.days === 1 ? 'dia' : 'dias'}`}</span>
        {me && <div className="ch-me" data-testid="ch-me"><span className="ch-pos">{me.pos}º</span><span>de {board.length} · você tem <b>{formatValue(c.metric, me.value)}</b></span></div>}
      </div>

      <div className="section-title"><h2>Ranking</h2><button type="button" className="link-btn" onClick={() => { setBoard(null); load() }}>Atualizar</button></div>
      <div className="card ch-board" data-testid="ch-board">
        {board.map((m, i) => (
          <div key={i} className={`ch-row${m.is_me ? ' me' : ''}`} data-testid="ch-row">
            <span className="ch-rpos">{m.pos}º</span>
            <div className="ch-rbody">
              <div className="ch-rname"><b>{m.name}{m.is_me ? ' (você)' : ''}</b><span>{formatValue(c.metric, m.value)}</span></div>
              <div className="ch-rbar"><span style={{ width: `${Math.max(2, m.pct * 100)}%` }} /></div>
            </div>
          </div>
        ))}
        {board.length === 1 && <p className="small muted" style={{ margin: '8px 0 0' }}>Só você por enquanto: mande o convite.</p>}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={shareInvite} data-testid="ch-invite"><IconShare /> Convidar</button>
        <button type="button" className="btn" onClick={toStory} data-testid="ch-story"><IconStory /> Story</button>
      </div>
      <div style={{ marginTop: 10 }}><CopyBox label="Copiar link do convite" text={url} done="Link copiado" testid="ch-link" /></div>
      <button type="button" className="link-btn muted-btn" style={{ marginTop: 14 }} onClick={leave} data-testid="ch-leave">Sair do desafio</button>
      <p className="note">Cada uma vê o próprio total e o das outras participantes; nunca as atividades. O seu total é atualizado quando você abre o app.</p>
    </div>
  )
}

export function JoinChallenge() {
  const sync = useSync()
  return (
    <>
      <TopBar title="Convite" sub="desafio com amigas" back="/" />
      <NeedAccount sync={sync} code={useParams().code}><Join /></NeedAccount>
    </>
  )
}

function Join() {
  const { code } = useParams()
  const prof = useProfile()
  const nav = useNavigate()
  const [name, setName] = useState(firstName(prof?.data))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const join = async () => {
    setBusy(true); setErr(null)
    try { const id = await joinChallenge(code, name.trim()); clearInvite(); nav(`/desafios/${id}`, { replace: true }) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="page form" data-testid="ch-join">
      <div className="card">
        <b>Você recebeu um convite para um desafio</b>
        <p className="small muted">Ao entrar, o app envia só o seu total no período (km, treinos ou horas), calculado no aparelho. Dá para sair quando quiser.</p>
        <div className="field"><label htmlFor="ch-join-name">Seu nome no ranking</label><input id="ch-join-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} data-testid="ch-join-name" /></div>
        {err && <div className="alert alert-error small" role="alert">{err}</div>}
        <button type="button" className="btn btn-primary btn-block" disabled={busy || !name.trim()} onClick={join} data-testid="ch-join-btn">{busy ? 'Entrando…' : 'Entrar no desafio'}</button>
      </div>
    </div>
  )
}
