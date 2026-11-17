// Stories da rotina de corredora (1080×1920): próximas provas, temporada, semana de treinos, contagem,
// evolução nos 5 km e treino concluído. Gerado no aparelho; nada vai para servidores.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconShare } from '../components/Icons.jsx'
import { STORY_TEMPLATES, storyFor } from '../lib/storyData.js'
import { drawStory } from '../lib/drawStory.js'
import { canvasToBlob, loadCardFonts } from '../lib/drawCard.js'
import { todayISO } from '../lib/dates.js'

const PREF = 'minhas-corridas:stories'
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') } catch { return {} } }

export default function Stories() {
  const { races, workouts, goals } = useStore()
  const { notify } = useUI()
  const [params] = useSearchParams()
  const today = todayISO()
  const prefs = loadPrefs()
  const [tpl, setTpl] = useState(STORY_TEMPLATES.some((t) => t.id === params.get('modelo')) ? params.get('modelo') : prefs.tpl ?? 'proximas')
  const [times, setTimes] = useState(prefs.times ?? true)
  const [cities, setCities] = useState(prefs.cities ?? true)
  const [photo, setPhoto] = useState(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  useEffect(() => { loadCardFonts().then(() => setFontsReady(true)) }, [])
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ tpl, times, cities })) } catch { /* sem armazenamento: tudo bem */ } }, [tpl, times, cities])
  const s = useMemo(() => storyFor(tpl, { races, workouts, goals, today, opts: { times, cities }, raceId: params.get('prova'), workoutId: params.get('treino'), badgeId: params.get('conquista'), week: params.get('semana'), month: params.get('mes') }), [tpl, races, workouts, goals, times, cities])
  useEffect(() => {
    if (s.ok && fontsReady && canvasRef.current) drawStory(canvasRef.current, tpl, s, photo)
  }, [s, tpl, photo, fontsReady])

  const onPhoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setPhoto(await createImageBitmap(f)) } catch { notify('Não foi possível abrir a foto') }
  }
  const name = `paceon-story-${tpl}-${today}.png`
  const getFile = async () => new File([await canvasToBlob(canvasRef.current)], name, { type: 'image/png' })
  const download = (file) => {
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
    setBusy(true)
    try {
      const file = await getFile()
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Minha rotina de corredora' }) } catch (e) { if (e?.name !== 'AbortError') throw e }
      } else {
        download(file)
        notify('Este navegador não compartilha imagens: a imagem foi baixada')
      }
    } catch (e) {
      notify(e.message || 'Não foi possível compartilhar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Stories" sub="Sua rotina de corredora" back="/" />
      <div className="page" data-testid="stories">
        <div className="quick-status" role="group" aria-label="Modelo">
          {STORY_TEMPLATES.map((t) => <button key={t.id} type="button" aria-pressed={tpl === t.id} onClick={() => setTpl(t.id)} data-testid={`story-${t.id}`}>{t.label}</button>)}
        </div>
        {s.ok ? (
          <div className="card-preview fmt-story" style={{ marginTop: 12 }}>
            <canvas ref={canvasRef} role="img" aria-label={`Story: ${STORY_TEMPLATES.find((t) => t.id === tpl).label}`} data-testid="story-canvas" />
          </div>
        ) : (
          <div className="card muted small" style={{ marginTop: 12 }} data-testid="story-empty">{s.reason}</div>
        )}
        <div className="card" style={{ marginTop: 12 }}>
          <label className="check"><input type="checkbox" checked={times} onChange={(e) => setTimes(e.target.checked)} data-testid="story-times" /> Mostrar tempos e pace</label>
          <label className="check"><input type="checkbox" checked={cities} onChange={(e) => setCities(e.target.checked)} data-testid="story-cities" /> Mostrar cidades das provas</label>
          <div className="list-group-title" style={{ marginTop: 8 }}>Fundo</div>
          <div className="btn-inline">
            <button type="button" className={`chip-btn${!photo ? ' on' : ''}`} onClick={() => setPhoto(null)}>Cor do app</button>
            <button type="button" className={`chip-btn${photo ? ' on' : ''}`} onClick={() => fileRef.current?.click()}>{photo ? 'Trocar foto' : 'Foto do celular'}</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} data-testid="story-photo" />
          <p className="note" style={{ marginBottom: 0 }}>Sem endereços nem valores. A foto só é usada para gerar a imagem e não fica salva.</p>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !fontsReady || !s.ok} onClick={onShare} data-testid="story-share"><IconShare /> {busy ? 'Gerando…' : 'Compartilhar'}</button>
        <button className="btn btn-block" style={{ marginTop: 10 }} disabled={!fontsReady || !s.ok} onClick={async () => { download(await getFile()); notify('Imagem baixada') }} data-testid="story-download"><IconDownload /> Baixar imagem (PNG)</button>
        <p className="note">No celular, “Compartilhar” abre a lista de apps: escolha o Instagram e depois “Story”.</p>
      </div>
    </>
  )
}
