// Mapa das suas corridas: todos os traçados dos arquivos do relógio, quarteirões cobertos e território novo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { EmptyState, TopBar } from '../components/ui.jsx'
import { collectTracks, territory } from '../lib/runMap.js'
import { formatDateBR, todayISO } from '../lib/dates.js'

const BRAND = '#FF5F24'
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const nf = (n) => String(n).replace('.', ',')

export default function RunsMap() {
  const { races, workouts } = useStore()
  const all = useMemo(() => collectTracks(races, workouts), [races, workouts])
  const years = [...new Set(all.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a)
  const [year, setYear] = useState(null)
  const tracks = year == null ? all : all.filter((t) => Number(t.date.slice(0, 4)) === year)
  const tr = useMemo(() => territory(tracks), [tracks])

  if (!all.length) {
    return (
      <>
        <TopBar title="Mapa das corridas" back="/passaporte" />
        <div className="page">
          <EmptyState
            title="Seus percursos aparecem aqui"
            text="Importe o arquivo do relógio (.FIT, .ZIP do Garmin, .TCX ou .GPX) num treino ou no resultado de uma prova. Atividades importadas antes desta versão não guardaram o traçado: importe de novo para entrarem no mapa."
            action={<Link to="/treinos" className="btn btn-primary btn-block">Ir para Treinos</Link>}
          />
          <p className="note">Para não mostrar onde você mora, o app guarda o percurso sem os primeiros e os últimos 200 m.</p>
        </div>
      </>
    )
  }
  const today = todayISO()
  return (
    <>
      <TopBar title="Mapa das corridas" sub={`${tr.count} ${tr.count === 1 ? 'percurso' : 'percursos'}`} back="/passaporte" />
      <div className="page" data-testid="runs-map-page">
        {years.length > 1 && (
          <div className="seg" role="group" aria-label="Período" style={{ marginBottom: 10 }}>
            <button type="button" aria-pressed={year == null} onClick={() => setYear(null)}>Tudo</button>
            {years.map((y) => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        )}
        <div className="stats" data-testid="map-stats">
          <div className="stat"><div className="v">{tr.count}</div><div className="l">{tr.count === 1 ? 'percurso' : 'percursos'}</div></div>
          <div className="stat"><div className="v">{nf(tr.km)}</div><div className="l">km no mapa</div></div>
          <div className="stat"><div className="v">{tr.cells}</div><div className="l">quarteirões</div></div>
        </div>
        <Map tracks={tracks} />
        {tr.last && tr.last.newCells > 0 && (
          <div className="card small" style={{ marginTop: 10 }} data-testid="map-new">
            <b>{tr.last.name}</b> ({formatDateBR(tr.last.date).slice(0, 5)}) abriu <b>{tr.last.newCells} {tr.last.newCells === 1 ? 'quarteirão novo' : 'quarteirões novos'}</b>{tr.last.date === today ? ' hoje' : ''}.
          </div>
        )}
        {tr.top.length > 1 && (
          <>
            <div className="list-group-title">Quem mais abriu território</div>
            <ol className="card small map-top">
              {tr.top.map((t) => <li key={t.id}><Link to={t.url}>{t.name}</Link> <span className="muted">· {formatDateBR(t.date).slice(0, 5)} · {t.newCells} novos</span></li>)}
            </ol>
          </>
        )}
        <p className="note">Quarteirão = área de cerca de 150 × 150 m por onde algum percurso passou. Os percursos ficam sem os primeiros e os últimos 200 m, para não mostrar onde você mora. Atividades sem GPS (esteira, piscina) não entram.</p>
      </div>
    </>
  )
}

function Map({ tracks }) {
  const el = useRef()
  const nav = useNavigate()
  const navRef = useRef(nav)
  navRef.current = nav
  const [err, setErr] = useState(null)
  const key = tracks.map((t) => t.id).join(',')
  useEffect(() => {
    let map
    let alive = true
    ;(async () => {
      try {
        const L = (await import('leaflet')).default
        await import('leaflet/dist/leaflet.css')
        if (!alive || !el.current) return
        map = L.map(el.current, { scrollWheelZoom: false, tap: true })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© colaboradores do OpenStreetMap' }).addTo(map)
        const last = tracks.at(-1)
        tracks.forEach((t) => {
          const isLast = t === last
          const line = L.polyline(t.coords, { color: t.kind === 'prova' ? '#7c3aed' : BRAND, weight: isLast ? 6 : 4, opacity: isLast ? 0.95 : 0.55 }).addTo(map)
          line.bindTooltip(`${esc(t.name)} · ${esc(formatDateBR(t.date))}`, { sticky: true })
          line.on('click', () => navRef.current(t.url))
        })
        const pts = tracks.flatMap((t) => t.coords)
        if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [20, 20], maxZoom: 16 })
      } catch {
        if (alive) setErr('Não foi possível carregar o mapa (sem internet?).')
      }
    })()
    return () => {
      alive = false
      map?.remove()
    }
  }, [key])
  return (
    <div className="route-map-wrap" style={{ marginTop: 10 }}>
      <div ref={el} className="route-map runs-map" role="img" aria-label="Mapa com os seus percursos" data-testid="runs-map" />
      <div className="muted small" style={{ marginTop: 6 }}><span style={{ color: BRAND }}>━</span> treinos · <span style={{ color: '#7c3aed' }}>━</span> provas · toque numa linha para abrir</div>
      {err && <div className="muted small" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  )
}
