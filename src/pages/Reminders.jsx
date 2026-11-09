// Agenda por assinatura (.ics que se atualiza sozinho) e notificações push de prazos.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconBell, IconCalendar, IconInfo } from '../components/Icons.jsx'
import { useSync } from '../services/sync.js'
import { deleteFeed, feedLinks, getFeedToken, rotateFeedToken } from '../services/calendarFeed.js'
import { cachedPushPrefs, disablePush, enablePush, loadPushPrefs, pushStatus, pushSupport, savePushPrefs, testPush } from '../services/push.js'
import { PUSH_OPTIONS, PUSH_TYPES } from '../lib/alerts.js'

const RULE_TEXT = {
  inscricao: 'Fim da inscrição',
  lote: 'Mudança de lote',
  kit: 'Retirada do kit',
  prova: 'Dia da prova'
}
const dayLabel = (d) => (d === 0 ? 'No dia' : d === 1 ? 'Véspera' : `${d} dias antes`)

export default function Reminders() {
  const sync = useSync()
  const signedIn = !!sync.user
  return (
    <>
      <TopBar title="Agenda e avisos" back="/ajustes" />
      <div className="page">
        {!sync.configured ? (
          <div className="alert alert-info"><IconInfo /><div>A conta não está configurada nesta instalação. Você ainda pode exportar provas para a agenda pelo botão de calendário na lista de corridas.</div></div>
        ) : !signedIn ? (
          <div className="card">
            <p style={{ marginTop: 0 }}><b>Entre na conta para usar estes recursos.</b> A agenda por assinatura e as notificações funcionam mesmo com o app fechado, então o servidor precisa ler suas provas sincronizadas.</p>
            <Link to="/conta" className="btn btn-dark btn-block">Entrar ou criar conta</Link>
            <p className="note">Sem conta, use “Agenda (.ics)” em cada corrida ou na lista: o arquivo é importado uma vez e não se atualiza.</p>
          </div>
        ) : (
          <>
            <FeedCard userId={sync.user.id} />
            <PushCard userId={sync.user.id} />
          </>
        )}
      </div>
    </>
  )
}

function FeedCard({ userId }) {
  const { confirm, notify } = useUI()
  const [token, setToken] = useState(undefined)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getFeedToken().then(setToken).catch((e) => { setToken(null); setError(e.message) })
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const create = () => run(async () => setToken(await rotateFeedToken()))
  const rotate = async () => {
    const ok = await confirm({ title: 'Trocar o link?', message: 'O link atual para de funcionar. Os calendários em que você assinou deixam de atualizar até você assinar de novo com o link novo.', confirmLabel: 'Trocar link' })
    if (ok) run(async () => { setToken(await rotateFeedToken()); notify('Link novo criado') })
  }
  const remove = async () => {
    const ok = await confirm({ title: 'Desativar a agenda?', message: 'O link para de funcionar e os calendários assinados deixam de receber atualizações.', confirmLabel: 'Desativar', danger: true })
    if (ok) run(async () => { await deleteFeed(userId); setToken(null); notify('Agenda desativada') })
  }
  const links = token ? feedLinks(token) : null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.https)
      notify('Link copiado')
    } catch {
      setError('Não consegui copiar. Toque e segure no link para copiar.')
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Agenda por assinatura</h2></div>
      <div className="card">
        <p style={{ marginTop: 0 }}>Assine uma vez e o calendário do celular passa a mostrar suas provas, a retirada do kit e o fim das inscrições — e se atualiza sozinho quando você muda algo no app.</p>
        {token === undefined ? (
          <div className="muted small">Carregando…</div>
        ) : !links ? (
          <button className="btn btn-dark btn-block" disabled={busy} onClick={create}><IconCalendar /> {busy ? 'Criando…' : 'Criar link da agenda'}</button>
        ) : (
          <>
            <div className="feed-link" data-testid="feed-link">{links.https}</div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-dark" onClick={copy}>Copiar link</button>
              <a className="btn" href={links.webcal}>Assinar</a>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <a className="btn" href={links.google} target="_blank" rel="noreferrer">Google Agenda</a>
              <a className="btn" href={links.outlook} target="_blank" rel="noreferrer">Outlook</a>
            </div>
            <details className="how" style={{ marginTop: 12 }}>
              <summary>Como assinar</summary>
              <p><b>iPhone:</b> toque em “Assinar” e confirme. Ou: Ajustes → Calendário → Contas → Adicionar conta → Outra → Adicionar calendário assinado, e cole o link.</p>
              <p><b>Google Agenda (computador):</b> “Google Agenda” abre a tela de adicionar; ou em Outras agendas → + → Do URL, cole o link. Depois aparece no Android também.</p>
              <p><b>Outlook:</b> Adicionar calendário → Assinar da Web.</p>
            </details>
            <p className="note">Cada app de calendário decide quando buscar de novo: o do iPhone costuma ser em minutos ou horas; o Google Agenda pode levar até um dia. Lembretes do arquivo podem ser ignorados em calendários assinados — para avisos garantidos, use as notificações abaixo.</p>
            <p className="note"><b>Privacidade:</b> quem tiver o link vê nome, data, horário e local das provas (nunca custos, notas ou resultados). Não publique o link. Se ele vazar, troque.</p>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn" disabled={busy} onClick={rotate}>Trocar link</button>
              <button className="btn btn-danger" disabled={busy} onClick={remove}>Desativar</button>
            </div>
          </>
        )}
        {error && <div className="alert alert-error small" role="alert" style={{ marginTop: 10 }}><div>{error}</div></div>}
      </div>
    </>
  )
}

function PushCard({ userId }) {
  const { notify } = useUI()
  const support = pushSupport()
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const refresh = () => pushStatus().then(setSt).catch(() => setSt({ permission: 'default', subscribed: false }))
  useEffect(() => {
    refresh()
  }, [])

  const run = async (kind, fn) => {
    setBusy(kind)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message || 'Algo deu errado.')
    } finally {
      setBusy(null)
      refresh()
    }
  }

  return (
    <>
      <div className="section-title"><h2>Notificações de prazos</h2></div>
      <div className="card">
        <p style={{ marginTop: 0 }}>Avisos no celular mesmo com o app fechado, uma vez por dia, às 8h. Escolha quais quer receber:</p>
        <PrefsEditor userId={userId} />
        <p className="note" style={{ marginTop: 6 }}>Valem as provas inscritas (kit e prova) e as de interesse ou inscrição aberta (prazos de inscrição). O kit para de ser lembrado quando você marca “Kit retirado” no checklist. As escolhas valem para todos os seus aparelhos.</p>

        {support === 'ios-install' ? (
          <div className="alert alert-info" style={{ marginTop: 12 }}><IconInfo /><div>No iPhone, as notificações só funcionam com o app instalado: Safari → Compartilhar → <b>Adicionar à Tela de Início</b>. Depois abra o app pelo ícone e volte aqui (iOS 16.4 ou mais novo).</div></div>
        ) : support === 'unsupported' ? (
          <div className="alert alert-info" style={{ marginTop: 12 }}><IconInfo /><div>Este navegador não aceita notificações push. Tente o Chrome no Android ou no computador, ou o app instalado no iPhone.</div></div>
        ) : st == null ? (
          <div className="muted small" style={{ marginTop: 12 }}>Verificando…</div>
        ) : st.subscribed ? (
          <>
            <div className="alert alert-ok small" style={{ marginTop: 12 }} role="status"><IconBell /><div><b>Ativadas neste aparelho.</b></div></div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-dark" disabled={!!busy} onClick={() => run('test', async () => { await testPush(); notify('Teste enviado') })}>{busy === 'test' ? 'Enviando…' : 'Enviar teste'}</button>
              <button className="btn" data-testid="push-off" disabled={!!busy} onClick={() => run('off', async () => { await disablePush(); notify('Notificações desativadas') })}>{busy === 'off' ? 'Desativando…' : 'Desativar notificações'}</button>
            </div>
          </>
        ) : (
          <>
            {st.permission === 'denied' && <div className="alert alert-warn small" style={{ marginTop: 12 }}><IconInfo /><div>As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.</div></div>}
            <button className="btn btn-dark btn-block" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => run('on', async () => { await enablePush(); notify('Notificações ativadas') })}>
              <IconBell /> {busy === 'on' ? 'Ativando…' : 'Ativar neste aparelho'}
            </button>
          </>
        )}
        {error && <div className="alert alert-error small" role="alert" style={{ marginTop: 10 }}><div>{error}</div></div>}
        <p className="note">Ative em cada aparelho em que quiser receber. Ao sair da conta, este aparelho para de receber.</p>
      </div>
    </>
  )
}

function PrefsEditor({ userId }) {
  const [prefs, setPrefs] = useState(cachedPushPrefs)
  const [state, setState] = useState('loading') // loading | ready | saving | error
  const [error, setError] = useState(null)
  useEffect(() => {
    loadPushPrefs().then((p) => { setPrefs(p); setState('ready') }).catch((e) => { setError(e.message); setState('error') })
  }, [])
  const save = async (next) => {
    const before = prefs
    setPrefs(next)
    setState('saving')
    setError(null)
    try {
      setPrefs(await savePushPrefs(next, userId))
      setState('ready')
    } catch (e) {
      setPrefs(before)
      setError(e.message)
      setState('error')
    }
  }
  const toggle = (type, d) => {
    const cur = prefs[type]
    save({ ...prefs, [type]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] })
  }
  const off = state === 'loading' || state === 'saving'
  return (
    <div className="prefs" data-testid="push-prefs" aria-busy={off}>
      {PUSH_TYPES.map((t) => (
        <div key={t} className="pref-row">
          <div className="pref-name">{RULE_TEXT[t]}</div>
          <div className="pref-days" role="group" aria-label={RULE_TEXT[t]}>
            {PUSH_OPTIONS[t].map((d) => (
              <button key={d} type="button" aria-pressed={prefs[t].includes(d)} disabled={off} onClick={() => toggle(t, d)}>{dayLabel(d)}</button>
            ))}
          </div>
        </div>
      ))}
      <label className="check">
        <input type="checkbox" checked={prefs.weekly} disabled={off} onChange={(e) => save({ ...prefs, weekly: e.target.checked })} />
        Resumo da semana às segundas
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.orcamento} disabled={off} onChange={(e) => save({ ...prefs, orcamento: e.target.checked })} />
        Aviso de orçamento (perto do limite e se estourar)
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.resultado} disabled={off} onChange={(e) => save({ ...prefs, resultado: e.target.checked })} />
        “Como foi?” no dia seguinte à prova, para registrar o resultado
      </label>
      {state === 'saving' && <div className="muted small">Salvando…</div>}
      {error && <div className="alert alert-error small" role="alert"><div>{error}</div></div>}
    </div>
  )
}
