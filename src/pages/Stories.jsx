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
// Ordem das miniaturas: provas, treinos e conquistas
const ORDER = [['proximas', 'Inscrições'], ['contagem', 'Contagem'], ['resultado', 'Prova concluída'], ['temporada', 'Temporada'], ['semana', 'Semana'], ['treino', 'Treino feito'], ['mes', 'Mês'], ['evolucao', 'Evolução 5 km'], ['conquista', 'Conquista']]
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}') } catch { return {} } }

export default function Stories() {
  const { races, workouts, goals } = useStore()
  const { notify } = useUI()
  const [params] = useSearchParams()
  const today = todayISO()
  const prefs = loadPrefs()
  // Desafio com amigas: o ranking que a tela do desafio guardou para o story (só com ?desafio=)
  const challenge = useMemo(() => {
    const id = params.get('desafio')
    if (!id) return null
    try { const c = JSON.parse(localStorage.getItem('paceon:desafio-story')); return c?.id === id ? c : null } catch { return null }
  }, [])
  const order = challenge ? [['desafio', 'Desafio'], ...ORDER] : ORDER
  const [tpl, setTpl] = useState(STORY_TEMPLATES.some((t) => t.id === params.get('modelo')) && (params.get('modelo') !== 'desafio' || challenge) ? params.get('modelo') : prefs.tpl && prefs.tpl !== 'desafio' ? prefs.tpl : 'proximas')
  const [times, setTimes] = useState(prefs.times ?? true)
  const [cities, setCities] = useState(prefs.cities ?? true)
  const [decidindo, setDecidindo] = useState(prefs.decidindo ?? false)
  const [photo, setPhoto] = useState(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  useEffect(() => { loadCardFonts().then(() => setFontsReady(true)) }, [])
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ tpl, times, cities, decidindo })) } catch { /* sem armazenamento: tudo bem */ } }, [tpl, times, cities, decidindo])
  const s = useMemo(() => storyFor(tpl, { races, workouts, goals, today, opts: { times, cities, decidindo }, raceId: params.get('prova'), workoutId: params.get('treino'), badgeId: params.get('conquista'), week: params.get('semana'), month: params.get('mes'), challenge }), [tpl, races, workouts, goals, times, cities, decidindo])
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

  const all = useMemo(() => order.map(([id, label]) => ({ id, label, s: storyFor(id, { races, workouts, goals, today, opts: { times, cities, decidindo }, raceId: params.get('prova'), workoutId: params.get('treino'), badgeId: params.get('conquista'), week: params.get('semana'), month: params.get('mes'), challenge }) })), [races, workouts, goals, times, cities, decidindo])

  return (
    <>
      <TopBar title="Stories" sub="Sua rotina de corredora" back="/" />
      <div className="page stories-page" data-testid="stories">
        <div className="st-stage">
          {s.ok ? (
            <div className="card-preview fmt-story">
              <canvas ref={canvasRef} role="img" aria-label={`Story: ${STORY_TEMPLATES.find((t) => t.id === tpl).label}`} data-testid="story-canvas" />
            </div>
          ) : (
            <div className="card muted small st-empty" data-testid="story-empty">{s.reason}</div>
          )}
        </div>

        <div className="st-strip" role="group" aria-label="Modelo do story">
          {all.map((t) => (
            <button key={t.id} type="button" className={`st-thumb${tpl === t.id ? ' on' : ''}${t.s.ok ? '' : ' off'}`} aria-pressed={tpl === t.id} onClick={() => setTpl(t.id)} data-testid={`story-${t.id}`}>
              <Thumb id={t.id} s={t.s} ready={fontsReady} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="st-opts">
          <label className={`st-toggle${times ? ' on' : ''}`}><input type="checkbox" checked={times} onChange={(e) => setTimes(e.target.checked)} data-testid="story-times" /> Tempos e pace</label>
          <label className={`st-toggle${cities ? ' on' : ''}`}><input type="checkbox" checked={cities} onChange={(e) => setCities(e.target.checked)} data-testid="story-cities" /> Cidades</label>
          {tpl === 'proximas' && <label className={`st-toggle${decidindo ? ' on' : ''}`}><input type="checkbox" checked={decidindo} onChange={(e) => setDecidindo(e.target.checked)} data-testid="story-decidindo" /> Incluir as que estou decidindo</label>}
          <button type="button" className={`st-toggle${photo ? ' on' : ''}`} onClick={() => (photo ? setPhoto(null) : fileRef.current?.click())}>{photo ? 'Tirar foto do fundo' : 'Foto de fundo'}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} data-testid="story-photo" />
        </div>
        <p className="note st-note">Nunca vão endereços nem valores. A foto só é usada para gerar a imagem e não fica salva. No celular, “Compartilhar” abre a lista de apps: escolha o Instagram e depois “Story”.</p>

        <div className="st-actions">
          <button className="btn btn-primary" disabled={busy || !fontsReady || !s.ok} onClick={onShare} data-testid="story-share"><IconShare /> {busy ? 'Gerando…' : 'Compartilhar'}</button>
          <button className="btn st-dl" disabled={!fontsReady || !s.ok} onClick={async () => { download(await getFile()); notify('Imagem baixada') }} data-testid="story-download" aria-label="Baixar imagem (PNG)" title="Baixar imagem (PNG)"><IconDownload /><span className="st-dl-label">Baixar</span></button>
        </div>
      </div>
    </>
  )
}

/** Miniatura real do modelo (desenhada numa tela grande e reduzida). */
const big = typeof document !== 'undefined' ? document.createElement('canvas') : null
function Thumb({ id, s, ready }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !ready || !big) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    if (!s.ok) return
    drawStory(big, id, s, null)
    ctx.drawImage(big, 0, 0, c.width, c.height)
  }, [id, s, ready])
  return <canvas ref={ref} width={108} height={192} aria-hidden="true" />
}
