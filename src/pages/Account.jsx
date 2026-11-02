import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { IconCloud, IconInfo } from '../components/Icons.jsx'
import { authMessage, supabase } from '../services/supabase.js'
import { endRecovery, signOut, syncNow, useSync } from '../services/sync.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function syncLabel(s) {
  if (s.phase === 'syncing') return 'Sincronizando…'
  if (s.phase === 'offline') return s.pending ? `Sem internet · ${s.pending} ${s.pending === 1 ? 'alteração aguardando' : 'alterações aguardando'}` : 'Sem internet · tudo salvo no aparelho'
  if (s.phase === 'error') return 'Erro ao sincronizar'
  if (s.phase === 'needs-import') return 'Aguardando sua escolha'
  if (s.pending) return `${s.pending} ${s.pending === 1 ? 'alteração pendente' : 'alterações pendentes'}`
  if (s.lastSyncAt) return `Sincronizado às ${new Date(s.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return 'Conectado'
}

export default function Account() {
  const s = useSync()

  if (!s.configured) {
    return (
      <>
        <TopBar title="Conta" back="/ajustes" />
        <div className="page">
          <div className="alert alert-info"><IconInfo /><div>A sincronização ainda não foi configurada nesta instalação do app. Seus dados continuam salvos neste aparelho.</div></div>
        </div>
      </>
    )
  }
  if (!s.ready) {
    return (
      <>
        <TopBar title="Conta" back="/ajustes" />
        <div className="loading"><div><div className="spinner" />Verificando sua conta…</div></div>
      </>
    )
  }
  if (s.recovery) return <NewPassword />
  return s.user ? <SignedIn s={s} /> : <SignIn />
}

function SignedIn({ s }) {
  const { confirm, notify } = useUI()
  const onSignOut = async () => {
    const ok = await confirm({
      title: 'Sair da conta?',
      message:
        (s.pending ? `Atenção: ${s.pending} ${s.pending === 1 ? 'alteração ainda não foi enviada e será perdida' : 'alterações ainda não foram enviadas e serão perdidas'}. ` : '') +
        'Os dados saem deste aparelho, mas continuam na sua conta. Para vê-los de novo, é só entrar.',
      confirmLabel: 'Sair',
      danger: s.pending > 0
    })
    if (!ok) return
    await signOut()
    notify('Você saiu da conta')
  }
  return (
    <>
      <TopBar title="Conta" back="/ajustes" />
      <div className="page">
        <div className="card">
          <div className="sync-row">
            <span className={`sync-dot sync-${s.phase}`} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small muted" style={{ fontWeight: 700 }}>Conectada como</div>
              <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{s.user.email}</div>
              <div className="small" style={{ marginTop: 2 }} role="status">{syncLabel(s)}</div>
            </div>
          </div>
          {s.error && <div className="alert alert-error small" role="alert" style={{ marginTop: 12 }}>{s.error}</div>}
          <button className="btn btn-dark btn-block" style={{ marginTop: 14 }} onClick={() => syncNow()} disabled={s.phase === 'syncing' || s.phase === 'needs-import'}>
            <IconCloud /> {s.phase === 'syncing' ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        </div>
        <p className="note">
          Corridas, objetivos, resultados, checklists, anexos e fotos ficam na sua conta e aparecem em todos os aparelhos em que você entrar. O app continua funcionando sem internet e envia as alterações quando a conexão voltar. Se a mesma corrida for editada em dois aparelhos, vale a alteração mais recente.
        </p>
        <button className="btn btn-block" style={{ marginTop: 18 }} onClick={onSignOut}>Sair da conta</button>
      </div>
    </>
  )
}

function SignIn() {
  const [mode, setMode] = useState('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    const em = email.trim().toLowerCase()
    if (!EMAIL_RE.test(em)) errs.email = 'Informe um e-mail válido.'
    if (mode !== 'recuperar' && password.length < 8) errs.password = 'A senha precisa ter pelo menos 8 caracteres.'
    setErrors(errs)
    setMsg(null)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password })
        if (error) throw error
      } else if (mode === 'criar') {
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: `${location.origin}/conta` } })
        if (error) throw error
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error('User already registered')
        }
        if (!data.session) setMsg({ ok: true, text: `Conta criada! Enviamos um link de confirmação para ${em}. Confirme e depois entre aqui.` })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${location.origin}/conta` })
        if (error) throw error
        setMsg({ ok: true, text: `Se houver uma conta com ${em}, você vai receber um link para criar uma nova senha.` })
      }
    } catch (err) {
      setMsg({ ok: false, text: authMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (m) => {
    setMode(m)
    setErrors({})
    setMsg(null)
  }

  return (
    <>
      <TopBar title="Conta" back="/ajustes" />
      <form className="page form" onSubmit={submit} noValidate>
        <div className="alert alert-info small" style={{ marginBottom: 12 }}>
          <IconInfo />
          <div>Com uma conta, suas corridas ficam salvas na nuvem e iguais no celular e no computador. Sem conta, tudo continua funcionando só neste aparelho.</div>
        </div>
        {mode !== 'recuperar' && (
          <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
            <button type="button" role="tab" aria-selected={mode === 'entrar'} onClick={() => switchTo('entrar')}>Entrar</button>
            <button type="button" role="tab" aria-selected={mode === 'criar'} onClick={() => switchTo('criar')}>Criar conta</button>
          </div>
        )}
        <div className="card">
          {mode === 'recuperar' && <p style={{ marginTop: 0 }}><b>Esqueceu a senha?</b> Enviaremos um link para você criar outra.</p>}
          <Field label="E-mail" htmlFor="email" error={errors.email}>
            <input id="email" type="email" className="input" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? 'true' : 'false'} />
          </Field>
          {mode !== 'recuperar' && (
            <Field label="Senha" htmlFor="password" error={errors.password} hint={mode === 'criar' ? 'Pelo menos 8 caracteres.' : null}>
              <input id="password" type="password" className="input" autoComplete={mode === 'criar' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? 'true' : 'false'} />
            </Field>
          )}
          {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : 'alert-error'}`} role="alert" style={{ marginBottom: 12 }}><div>{msg.text}</div></div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Enviar link'}
          </button>
          {mode === 'entrar' && <button type="button" className="link-btn" style={{ marginTop: 6 }} onClick={() => switchTo('recuperar')}>Esqueci minha senha</button>}
          {mode === 'recuperar' && <button type="button" className="link-btn" style={{ marginTop: 6 }} onClick={() => switchTo('entrar')}>Voltar para entrar</button>}
        </div>
        <p className="note"><Link to="/">Continuar sem conta</Link></p>
      </form>
    </>
  )
}

function NewPassword() {
  const { notify } = useUI()
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      setErr('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setErr(authMessage(error))
      return
    }
    endRecovery()
    notify('Senha alterada')
  }
  return (
    <>
      <TopBar title="Nova senha" />
      <form className="page form" onSubmit={submit} noValidate>
        <div className="card">
          <Field label="Nova senha" htmlFor="new-password" error={err} hint="Pelo menos 8 caracteres.">
            <input id="new-password" type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErr(null) }} aria-invalid={err ? 'true' : 'false'} />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
        </div>
      </form>
    </>
  )
}
