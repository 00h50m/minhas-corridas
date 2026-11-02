import { useRef, useState } from 'react'
import { Sheet, useUI } from './ui.jsx'
import { IconCamera, IconClip, IconFile, IconTrash, IconExternal, IconDownload } from './Icons.jsx'
import { FILE_KINDS, FILE_KIND_LABEL, addFile, deleteFile, formatBytes, useObjectURL, useRaceFiles } from '../services/files.js'
import { downloadBlob } from '../services/backup.js'
import { useSync } from '../services/sync.js'

const DOC_KINDS = FILE_KINDS.filter((k) => k.id !== 'foto')

/**
 * Anexos de uma corrida.
 * mode="docs": comprovante, regulamento, imagem da prova e outros.
 * mode="photos": fotos do resultado, em grade.
 */
export default function Attachments({ raceId, mode = 'docs' }) {
  const { status, files, error } = useRaceFiles(raceId)
  const sync = useSync()
  const { confirm, notify } = useUI()
  const inputRef = useRef()
  const [kind, setKind] = useState(mode === 'photos' ? 'foto' : 'comprovante')
  const [busy, setBusy] = useState(false)
  const [addError, setAddError] = useState(null)
  const [viewing, setViewing] = useState(null)

  const list = files.filter((f) => (mode === 'photos' ? f.kind === 'foto' : f.kind !== 'foto'))

  const onPick = async (e) => {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!picked.length) return
    setBusy(true)
    setAddError(null)
    const problems = []
    let added = 0
    for (const file of picked) {
      try {
        await addFile(raceId, kind, file)
        added++
      } catch (err) {
        problems.push(err.message)
      }
    }
    setBusy(false)
    if (problems.length) setAddError(problems.join(' '))
    if (added) notify(added === 1 ? 'Arquivo anexado' : `${added} arquivos anexados`)
  }

  const onDelete = async (f) => {
    const ok = await confirm({ title: mode === 'photos' ? 'Excluir esta foto?' : 'Excluir este anexo?', message: `“${f.name}” será apagado deste aparelho.`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try {
      await deleteFile(f.id)
      setViewing(null)
      notify('Arquivo excluído')
    } catch (err) {
      notify(err.message)
    }
  }

  return (
    <div className="card">
      {status === 'loading' && <div className="muted small">Carregando arquivos…</div>}
      {status === 'error' && <div className="alert alert-error small" role="alert">{error}</div>}
      {status === 'ready' && list.length === 0 && (
        <div className="muted small" style={{ marginBottom: 10 }}>{mode === 'photos' ? 'Nenhuma foto ainda.' : 'Nenhum anexo. Guarde aqui comprovante, regulamento ou a arte da prova.'}</div>
      )}

      {mode === 'photos' ? (
        list.length > 0 && (
          <div className="photo-grid">
            {list.map((f) => <Thumb key={f.id} file={f} onOpen={() => setViewing(f)} />)}
          </div>
        )
      ) : (
        list.length > 0 && (
          <ul className="file-list">
            {list.map((f) => (
              <li key={f.id}>
                <button type="button" className="file-open" onClick={() => setViewing(f)} disabled={!f.blob}>
                  {f.type.startsWith('image/') && f.blob ? <Thumb file={f} small /> : <span className="file-ic"><IconFile /></span>}
                  <span className="file-meta">
                    <b>{f.name}</b>
                    <span>{FILE_KIND_LABEL[f.kind]} · {f.blob ? formatBytes(f.size) : 'baixando da nuvem…'}</span>
                  </span>
                </button>
                <button type="button" className="mini-btn" onClick={() => onDelete(f)} aria-label={`Excluir ${f.name}`}><IconTrash /></button>
              </li>
            ))}
          </ul>
        )
      )}

      {mode === 'docs' && (
        <div className="field" style={{ margin: '12px 0 8px' }}>
          <label htmlFor={`kind-${raceId}`}>Tipo do anexo</label>
          <select id={`kind-${raceId}`} className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
      )}
      <button type="button" className="btn btn-block" onClick={() => inputRef.current?.click()} disabled={busy || status === 'error'} style={{ marginTop: mode === 'photos' && list.length ? 12 : 0 }}>
        {mode === 'photos' ? <IconCamera /> : <IconClip />}
        {busy ? 'Salvando…' : mode === 'photos' ? 'Adicionar fotos' : 'Anexar arquivo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={mode === 'photos' ? 'image/*' : 'image/*,application/pdf'}
        onChange={onPick}
        data-testid={mode === 'photos' ? 'photo-input' : 'file-input'}
      />
      {addError && <div className="alert alert-error small" role="alert" style={{ marginTop: 10 }}>{addError}</div>}
      <p className="note">{mode === 'photos' ? 'Fotos grandes são reduzidas para economizar espaço.' : 'Imagens ou PDF, até 15 MB cada.'} {sync.user ? 'Sincronizados com a sua conta.' : 'Ficam só neste aparelho.'}</p>

      {viewing && <Viewer file={viewing} onClose={() => setViewing(null)} onDelete={() => onDelete(viewing)} />}
    </div>
  )
}

function Thumb({ file, onOpen, small }) {
  const url = useObjectURL(file.blob)
  if (small) return <span className="file-thumb">{url && <img src={url} alt="" />}</span>
  if (!file.blob) return <div className="photo"><span className="file-pending">baixando…</span></div>
  return (
    <button type="button" className="photo" onClick={onOpen} aria-label={`Ver foto ${file.name}`}>
      {url && <img src={url} alt="" loading="lazy" />}
    </button>
  )
}

function Viewer({ file, onClose, onDelete }) {
  const url = useObjectURL(file.blob)
  const isImage = file.type.startsWith('image/')
  return (
    <Sheet title={file.name} onClose={onClose}>
      {isImage && url && <img className="viewer-img" src={url} alt={file.name} />}
      {!isImage && <div className="muted small" style={{ marginBottom: 12 }}>{FILE_KIND_LABEL[file.kind]} · {formatBytes(file.size)}</div>}
      <div className="btn-row" style={{ marginTop: 12 }}>
        {url && !isImage ? (
          <a className="btn" href={url} target="_blank" rel="noreferrer"><IconExternal /> Abrir</a>
        ) : (
          <button type="button" className="btn" onClick={() => downloadBlob(file.blob, file.name)}><IconDownload /> Baixar</button>
        )}
        <button type="button" className="btn btn-danger" onClick={onDelete}><IconTrash /> Excluir</button>
      </div>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose} style={{ marginTop: 6 }}>Fechar</button>
    </Sheet>
  )
}
