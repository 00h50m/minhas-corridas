// Card de resultado para compartilhar (Instagram, WhatsApp…): imagem PNG gerada no aparelho.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getRace, useStore } from '../services/store.js'
import { listFiles, useObjectURL } from '../services/files.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { useProfile } from '../services/profile.js'
import { IconDownload, IconShare } from '../components/Icons.jsx'
import { CARD_FORMATS, cardFileName, shareCardInfo } from '../lib/shareCard.js'
import { canvasToBlob, drawCard, loadCardFonts } from '../lib/drawCard.js'

export const shareMemo = { format: 'feed' }

export default function ShareResult() {
  const { id } = useParams()
  const { races } = useStore()
  const { notify } = useUI()
  const r = getRace(id)
  const canvasRef = useRef()
  const [format, setFormatState] = useState(shareMemo.format)
  const setFormat = (f) => { shareMemo.format = f; setFormatState(f) }
  const [places, setPlaces] = useState(true)
  const [splits, setSplits] = useState(true)
  const [hr, setHr] = useState(false)
  const prof = useProfile()
  const fullName = prof.data.name || prof.data.nickname
  const [showName, setShowName] = useState(() => !!fullName && prof.data.showNameOnCard)
  const [photos, setPhotos] = useState([])
  const [photoId, setPhotoId] = useState(null)
  const [bitmap, setBitmap] = useState(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadCardFonts().finally(() => setFontsReady(true))
  }, [])
  useEffect(() => {
    if (!r) return
    listFiles(r.id)
      .then((all) => {
        const imgs = all.filter((f) => f.blob && /^image\/(jpeg|png|webp|gif)$/.test(f.type) && (f.kind === 'foto' || f.kind === 'imagem'))
        setPhotos(imgs)
      })
      .catch(() => setPhotos([]))
  }, [r?.id])
  useEffect(() => {
    const f = photos.find((p) => p.id === photoId)
    if (!f) return setBitmap(null)
    let alive = true
    createImageBitmap(f.blob).then((b) => alive && setBitmap(b)).catch(() => alive && setBitmap(null))
    return () => { alive = false }
  }, [photoId, photos])

  const info = useMemo(() => (r ? shareCardInfo(r, races, { places, splits, hr, athlete: showName ? fullName : '' }) : null), [r, races, places, splits, hr, showName, fullName])

  useEffect(() => {
    if (info && fontsReady && canvasRef.current) drawCard(canvasRef.current, info, CARD_FORMATS[format], bitmap)
  }, [info, format, bitmap, fontsReady])

  if (!r) return <Navigate to="/corridas" replace />
  if (!info) return <Navigate to={`/corridas/${r.id}`} replace />
  const res = r.result
  const hasPlaces = !!(res.overallPlace || res.categoryPlace)
  const hasSplits = (res.watch?.splits ?? []).filter((s) => !s.partial).length >= 3
  const name = cardFileName(r)

  const getFile = async () => new File([await canvasToBlob(canvasRef.current)], name, { type: 'image/png' })
  const download = async (file) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const onShare = async () => {
    setError(null)
    setBusy(true)
    try {
      const file = await getFile()
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: r.name, text: `${r.name} · ${info.time}` })
        } catch (e) {
          if (e?.name !== 'AbortError') throw e
        }
      } else {
        await download(file)
        notify('Este navegador não compartilha imagens: a imagem foi baixada')
      }
    } catch (e) {
      setError(e.message || 'Não foi possível compartilhar.')
    } finally {
      setBusy(false)
    }
  }
  const onDownload = async () => {
    setError(null)
    try {
      await download(await getFile())
      notify('Imagem baixada')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <TopBar title="Compartilhar" sub={r.name} back={`/corridas/${r.id}`} />
      <div className="page">
        <div className={`card-preview fmt-${format}`}>
          <canvas ref={canvasRef} role="img" aria-label={`Card: ${r.name}, ${info.distance}, ${info.time}`} data-testid="share-canvas" />
        </div>

        <div className="tabs" role="tablist" style={{ marginTop: 14 }} aria-label="Formato">
          {Object.values(CARD_FORMATS).map((f) => (
            <button key={f.id} role="tab" aria-selected={format === f.id} onClick={() => setFormat(f.id)}>{f.label}</button>
          ))}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          {fullName ? <label className="check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Mostrar meu nome</label> : <p className="note" style={{ marginTop: 0 }}>Quer seu nome no card? <Link to="/perfil">Preencha no perfil</Link>.</p>}
          {hasPlaces && <label className="check"><input type="checkbox" checked={places} onChange={(e) => setPlaces(e.target.checked)} /> Mostrar classificação</label>}
          {hasSplits && <label className="check"><input type="checkbox" checked={splits} onChange={(e) => setSplits(e.target.checked)} /> Mostrar parciais por km{format === 'square' ? ' (não cabe no quadrado)' : ''}</label>}
          {res.watch?.avgHr && <label className="check"><input type="checkbox" checked={hr} onChange={(e) => setHr(e.target.checked)} /> Mostrar frequência cardíaca média</label>}
          <div className="list-group-title" style={{ marginTop: 8 }}>Fundo</div>
          <div className="photo-pick" role="radiogroup" aria-label="Fundo do card">
            <button type="button" role="radio" aria-checked={!photoId} className="pp-none" onClick={() => setPhotoId(null)}>Cor do app</button>
            {photos.map((p) => <PhotoThumb key={p.id} file={p} selected={photoId === p.id} onPick={() => setPhotoId(p.id)} />)}
          </div>
          {!photos.length && <p className="note">Para usar uma foto de fundo, adicione fotos da prova no <Link to={`/corridas/${r.id}`}>resultado</Link>.</p>}
        </div>

        {error && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}><div>{error}</div></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !fontsReady} onClick={onShare}><IconShare /> {busy ? 'Gerando…' : 'Compartilhar'}</button>
        <button className="btn btn-block" style={{ marginTop: 10 }} disabled={!fontsReady} onClick={onDownload}><IconDownload /> Baixar imagem (PNG)</button>
        <p className="note">A imagem é gerada no próprio aparelho; nada é enviado para servidores.</p>
      </div>
    </>
  )
}

function PhotoThumb({ file, selected, onPick }) {
  const url = useObjectURL(file.blob)
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={`Foto ${file.name}`} onClick={onPick} style={{ backgroundImage: url ? `url(${url})` : undefined }} />
  )
}
