// Conectar o Garmin (API pessoal, só leitura) e buscar as atividades novas sozinho.
import { useState } from 'react'
import { useUI } from './ui.jsx'
import { connectGarmin, disconnectGarmin, syncGarmin, useGarmin } from '../services/garmin.js'

const when = (iso) => {
  if (!iso) return 'ainda não buscou'
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return `${today ? 'hoje' : d.toLocaleDateString('pt-BR').slice(0, 5)} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function GarminConnect() {
  const g = useGarmin()
  const { notify, confirm } = useUI()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [lines, setLines] = useState([])

  const onConnect = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await connectGarmin(key)
      setKey('')
      setOpen(false)
      notify('Garmin conectado')
      await onSync()
    } catch (err) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }
  const onSync = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await syncGarmin({ force: true })
      setLines(r?.lines ?? [])
      if (r && !r.lines.length && !r.pending) setMsg('Nenhuma atividade nova no Garmin.')
      else if (r?.imported) notify(r.imported === 1 ? '1 atividade importada do Garmin' : `${r.imported} atividades importadas do Garmin`)
    } catch (err) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }
  const onDisconnect = async () => {
    if (!(await confirm({ title: 'Desconectar o Garmin?', message: 'A chave sai deste aparelho. Os treinos já importados continuam. Para cancelar de vez, apague a chave também no Garmin Connect.', confirmLabel: 'Desconectar' }))) return
    disconnectGarmin()
    setLines([])
    notify('Garmin desconectado')
  }

  if (g) {
    return (
      <div className="card small garmin-card" data-testid="garmin-on">
        <div className="garmin-row">
          <span><b>⌚ Garmin conectado</b><br /><span className="muted">Última busca: {when(g.lastSync)}</span></span>
          <button type="button" className="btn" disabled={busy} onClick={onSync} data-testid="garmin-sync">{busy ? 'Buscando…' : 'Buscar agora'}</button>
        </div>
        <p className="note" style={{ margin: '6px 0 0' }}>O app busca sozinho ao abrir (no máximo a cada 30 min) e marca o treino do dia como feito, com voltas, parciais e o percurso.</p>
        {msg && <div className="alert small" role="status" style={{ marginTop: 8 }}>{msg}</div>}
        {lines.length > 0 && <ul className="ai-log small" data-testid="garmin-log">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        <button type="button" className="link-btn muted-btn" onClick={onDisconnect} data-testid="garmin-off">Desconectar</button>
      </div>
    )
  }
  return (
    <div className="card small garmin-card" data-testid="garmin-connect">
      <button type="button" className="garmin-row link-like" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="garmin-open">
        <span><b>⌚ Importar do Garmin sozinho</b><br /><span className="muted">Sem baixar arquivo: os treinos feitos entram sozinhos.</span></span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <form onSubmit={onConnect} style={{ marginTop: 10 }}>
          <ol className="wk-howto">
            <li>No computador ou no navegador do celular, entre no <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener noreferrer">Garmin Connect → Configurações → Token de API pessoal</a>.</li>
            <li>Crie uma chave (pode dar o nome “PaceOn”) e copie.</li>
            <li>Cole aqui e toque em Conectar.</li>
          </ol>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Chave pessoal da Garmin" autoComplete="off" spellCheck={false} aria-label="Chave pessoal da Garmin" data-testid="garmin-key" />
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy || key.trim().length < 8} data-testid="garmin-connect-btn">{busy ? 'Conferindo…' : 'Conectar'}</button>
          {msg && <div className="alert alert-error small" role="alert" style={{ marginTop: 8 }}>{msg}</div>}
          <p className="note">Só leitura: o app lê suas atividades, não muda nada no Garmin. A chave fica <b>só neste aparelho</b> (não vai para a sua conta do PaceOn nem para o backup) e passa pelo servidor do app apenas para chegar à Garmin. Para cancelar, desconecte aqui e apague a chave no Garmin Connect. Mandar treinos para o relógio continua pelos outros caminhos (a Garmin não libera isso para pessoas físicas).</p>
        </form>
      )}
    </div>
  )
}
