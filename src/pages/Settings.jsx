import { useEffect, useRef, useState } from 'react'
import { clearAll, getState, replaceAll, useStore } from '../services/store.js'
import { backupFileName, buildBackup, downloadText, parseBackup } from '../services/backup.js'
import { allFiles, clearFiles, filesUsage, formatBytes, pruneFiles, replaceFiles } from '../services/files.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconInfo, IconTrash, IconUpload } from '../components/Icons.jsx'
import { formatDateBR } from '../lib/dates.js'
import { Link } from 'react-router-dom'
import { IconBell, IconCloud } from '../components/Icons.jsx'
import { useSync } from '../services/sync.js'
import { APP_VERSION, checkForUpdate, hardReload } from '../services/appUpdate.js'
import { syncLabel } from './Account.jsx'
import { InstallSection } from '../components/Install.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { getProfile, replaceProfile, useProfile } from '../services/profile.js'
import { callName } from '../lib/profile.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function Settings() {
  const store = useStore()
  const prof = useProfile()
  const sync = useSync()
  const cloud = !!sync.user
  const { confirm, notify } = useUI()
  const fileRef = useRef()
  const [importError, setImportError] = useState(null)
  const [usage, setUsage] = useState(null)
  const [withFiles, setWithFiles] = useState(false)
  const [busy, setBusy] = useState(null)

  const [updateMsg, setUpdateMsg] = useState(null)

  const onCheckUpdate = async () => {
    setUpdateMsg(null)
    setBusy('update')
    try {
      const r = await checkForUpdate()
      if (r === 'latest') setUpdateMsg({ ok: true, text: 'Você já está na versão mais recente.' })
    } catch (err) {
      setUpdateMsg({ ok: false, text: err.message || 'Não foi possível procurar atualização.' })
    } finally {
      setBusy(null)
    }
  }

  const onHardReload = async () => {
    const ok = await confirm({
      title: 'Recarregar o app do zero?',
      message: 'O app apaga só os arquivos dele guardados no aparelho e baixa a versão mais recente. Suas corridas, objetivos, fotos e a conta continuam aqui. Precisa de internet.',
      confirmLabel: 'Recarregar'
    })
    if (!ok) return
    try {
      await hardReload()
    } catch (err) {
      setUpdateMsg({ ok: false, text: err.message })
    }
  }

  const refreshUsage = () => filesUsage().then(setUsage).catch(() => setUsage({ count: 0, bytes: 0, error: true }))
  useEffect(() => {
    refreshUsage()
  }, [])

  const onExport = async () => {
    setBusy('export')
    try {
      const { races, goals, workouts } = getState()
      const files = withFiles ? await allFiles() : null
      downloadText(await buildBackup(races, goals, files, getProfile(), workouts), backupFileName(withFiles), 'application/json')
      notify('Backup baixado')
    } catch (err) {
      notify(err.message || 'Não foi possível gerar o backup.')
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    try {
      if (file.size > 400 * 1024 * 1024) throw new Error('Arquivo grande demais para um backup do app.')
      setBusy('import')
      const { races, goals, workouts, files, profile, exportedAt } = parseBackup(await file.text())
      setBusy(null)
      const when = exportedAt ? ` de ${formatDateBR(exportedAt.slice(0, 10))}` : ''
      const cur = store.races.length + store.goals.length
      const ok = await confirm({
        title: 'Restaurar backup?',
        message:
          `O backup${when} tem ${plural(races.length, 'corrida', 'corridas')}, ${plural(goals.length, 'objetivo', 'objetivos')}` +
          (workouts ? `, ${plural(workouts.length, 'treino', 'treinos')}` : '') +
          (files ? ` e ${plural(files.length, 'anexo', 'anexos')}` : ' e não inclui anexos') +
          `. Os dados atuais deste aparelho serão substituídos.` +
          (cloud ? ' Com a conta conectada, isso vale também para a nuvem e os outros aparelhos.' : '') +
          (files ? '' : ' Anexos já guardados aqui continuam, se a corrida existir no backup.'),
        confirmLabel: 'Restaurar',
        danger: cur > 0
      })
      if (!ok) return
      setBusy('import')
      replaceAll(races, goals, workouts)
      if (profile) replaceProfile(profile)
      if (files) await replaceFiles(files)
      else await pruneFiles(races.map((r) => r.id))
      notify('Backup restaurado')
    } catch (err) {
      setImportError(err.message)
    } finally {
      setBusy(null)
      refreshUsage()
    }
  }

  const onClear = async () => {
    const ok = await confirm({
      title: cloud ? 'Apagar todos os dados, inclusive da conta?' : 'Apagar todos os dados?',
      message: cloud
        ? 'Todas as corridas, objetivos, resultados, anexos e fotos serão apagados deste aparelho, da sua conta e dos outros aparelhos conectados. Recomendo baixar um backup antes. Para só tirar os dados deste aparelho, use “Sair da conta”.'
        : 'Todas as corridas, objetivos, resultados, anexos e fotos deste aparelho serão apagados. Recomendo baixar um backup antes.',
      confirmLabel: 'Apagar tudo',
      danger: true
    })
    if (!ok) return
    clearAll()
    await clearFiles().catch(() => {})
    refreshUsage()
    notify('Dados apagados')
  }

  const empty = !store.races.length && !store.goals.length && !usage?.count

  return (
    <>
      <TopBar title="Ajustes" back="/" />
      <div className="page">
        <Link to="/perfil" className="card account-card" style={{ marginBottom: 12 }} data-testid="profile-link">
          <Avatar size={40} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{callName(prof.data) || 'Meu perfil'}</b><br /><span className="small muted">Nome, foto, camiseta, faixa etária e contato de emergência.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        {sync.configured && (
          <Link to="/conta" className="card account-card">
            <IconCloud />
            <span style={{ flex: 1, minWidth: 0 }}>
              {cloud ? (
                <><b>Sincronização ativa</b><br /><span className="small muted" style={{ overflowWrap: 'anywhere' }}>{sync.user.email} · {syncLabel(sync)}</span></>
              ) : (
                <><b>Entrar ou criar conta</b><br /><span className="small muted">Para ver suas corridas no celular e no computador.</span></>
              )}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}
        {cloud ? (
          <div className="alert alert-ok" style={{ marginTop: 12 }}>
            <IconInfo />
            <div>Seus dados ficam neste aparelho <b>e na sua conta</b>, sincronizados entre os aparelhos em que você entrar. O backup em arquivo continua disponível como cópia extra.</div>
          </div>
        ) : (
          <div className="alert alert-info" style={{ marginTop: sync.configured ? 12 : 0 }}>
            <IconInfo />
            <div>
              <b>Seus dados ficam só neste aparelho</b>, no armazenamento do navegador. Sem conta, outro celular ou navegador não vê estas corridas, e limpar os dados do site apaga tudo, inclusive anexos e fotos. Faça backup de vez em quando.
            </div>
          </div>
        )}

        <Link to="/lembretes" className="card account-card" style={{ marginTop: 12 }}>
          <IconBell />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>Agenda e avisos</b><br /><span className="small muted">Agenda por assinatura (.ics) e notificações de prazos no celular.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        <div className="section-title"><h2>Backup</h2></div>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            {plural(store.races.length, 'corrida', 'corridas')} e {plural(store.goals.length, 'objetivo', 'objetivos')} salvos neste aparelho.
            {usage && !usage.error && <> {plural(usage.count, 'anexo/foto', 'anexos/fotos')} ({formatBytes(usage.bytes)}).</>}
          </p>
          <label className="check">
            <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} disabled={!usage?.count} />
            Incluir anexos e fotos{usage?.count ? ` (${formatBytes(usage.bytes)})` : ''}
          </label>
          <button className="btn btn-dark btn-block" onClick={onExport} disabled={store.status !== 'ready' || !!busy}>
            <IconDownload /> {busy === 'export' ? 'Gerando…' : 'Baixar backup (.json)'}
          </button>
          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <IconUpload /> {busy === 'import' ? 'Restaurando…' : 'Restaurar de um arquivo'}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          {importError && <div className="alert alert-error" role="alert" style={{ marginTop: 10 }}>{importError}</div>}
          <p className="note">O backup inclui corridas, detalhes, custos, checklists, resultados e objetivos. Anexos e fotos entram só se você marcar a opção (o arquivo fica maior). Restaurar substitui o que está no aparelho.</p>
        </div>

        <div className="section-title"><h2>Instalar o app</h2></div>
        <InstallSection />

        <div className="section-title"><h2>Zona de cuidado</h2></div>
        <button className="btn btn-danger btn-block" onClick={onClear} disabled={empty}><IconTrash /> Apagar todos os dados</button>

        <div className="section-title"><h2>Atualização do app</h2></div>
        <div className="card">
          <p style={{ marginTop: 0 }}>Você está na <b>versão {APP_VERSION}</b>.</p>
          <button className="btn btn-dark btn-block" disabled={!!busy} onClick={onCheckUpdate}>{busy === 'update' ? 'Procurando…' : 'Procurar atualização'}</button>
          {updateMsg && <div className={`alert small ${updateMsg.ok ? 'alert-ok' : 'alert-error'}`} role="status" style={{ marginTop: 10 }}><div>{updateMsg.text}</div></div>}
          <button className="link-btn" style={{ marginTop: 6 }} disabled={!!busy} onClick={onHardReload}>Travou numa versão antiga? Recarregar o app do zero</button>
        </div>

        <p className="note" style={{ textAlign: 'center', marginTop: 24 }}>PaceOn · versão {APP_VERSION} · <Link to="/privacidade">Política de privacidade</Link></p>
      </div>
    </>
  )
}
