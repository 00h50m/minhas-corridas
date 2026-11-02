import { useRef, useState } from 'react'
import { clearAll, getState, replaceAll, useStore } from '../services/store.js'
import { backupFileName, buildBackup, downloadText, parseBackup } from '../services/backup.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconInfo, IconTrash, IconUpload } from '../components/Icons.jsx'
import { formatDateBR } from '../lib/dates.js'

export default function Settings() {
  const store = useStore()
  const { confirm, notify } = useUI()
  const fileRef = useRef()
  const [importError, setImportError] = useState(null)

  const onExport = () => {
    downloadText(buildBackup(getState().races), backupFileName(), 'application/json')
    notify('Backup baixado')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo grande demais para um backup do app.')
      const { races, exportedAt } = parseBackup(await file.text())
      const when = exportedAt ? ` de ${formatDateBR(exportedAt.slice(0, 10))}` : ''
      const ok = await confirm({
        title: 'Restaurar backup?',
        message: `O backup${when} tem ${races.length} ${races.length === 1 ? 'corrida' : 'corridas'}. Os dados atuais deste aparelho${store.races.length ? ` (${store.races.length} ${store.races.length === 1 ? 'corrida' : 'corridas'})` : ''} serão substituídos.`,
        confirmLabel: 'Restaurar',
        danger: store.races.length > 0
      })
      if (!ok) return
      replaceAll(races)
      notify('Backup restaurado')
    } catch (err) {
      setImportError(err.message)
    }
  }

  const onClear = async () => {
    const ok = await confirm({ title: 'Apagar todos os dados?', message: 'Todas as corridas e resultados deste aparelho serão apagados. Recomendo baixar um backup antes.', confirmLabel: 'Apagar tudo', danger: true })
    if (!ok) return
    clearAll()
    notify('Dados apagados')
  }

  return (
    <>
      <TopBar title="Ajustes" />
      <div className="page">
        <div className="alert alert-info">
          <IconInfo />
          <div>
            <b>Seus dados ficam só neste aparelho</b>, no armazenamento local do navegador. Não há conta nem sincronização: outro celular ou navegador não vê estas corridas, e limpar os dados do site apaga tudo. Faça backup de vez em quando.
          </div>
        </div>

        <div className="section-title"><h2>Backup</h2></div>
        <div className="card">
          <p style={{ marginTop: 0 }}>{store.races.length} {store.races.length === 1 ? 'corrida salva' : 'corridas salvas'} neste aparelho.</p>
          <button className="btn btn-dark btn-block" onClick={onExport} disabled={store.status !== 'ready'}><IconDownload /> Baixar backup (.json)</button>
          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}><IconUpload /> Restaurar de um arquivo</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          {importError && <div className="alert alert-error" role="alert" style={{ marginTop: 10 }}>{importError}</div>}
          <p className="note">O backup inclui todas as corridas, detalhes e resultados. Restaurar substitui o que está no aparelho.</p>
        </div>

        <div className="section-title"><h2>Instalar no celular</h2></div>
        <div className="card small">
          <p style={{ margin: 0 }}><b>iPhone (Safari):</b> Compartilhar → Adicionar à Tela de Início.</p>
          <p style={{ margin: '8px 0 0' }}><b>Android (Chrome):</b> menu ⋮ → Instalar app / Adicionar à tela inicial.</p>
          <p className="muted" style={{ margin: '8px 0 0' }}>Depois de instalado, o app abre em tela cheia e funciona sem internet.</p>
        </div>

        <div className="section-title"><h2>Zona de cuidado</h2></div>
        <button className="btn btn-danger btn-block" onClick={onClear} disabled={!store.races.length}><IconTrash /> Apagar todos os dados</button>

        <p className="note" style={{ textAlign: 'center', marginTop: 24 }}>Minhas Corridas · versão 0.1 (fase 1)</p>
      </div>
    </>
  )
}
