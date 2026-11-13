// Mapas da logística (Leaflet + OpenStreetMap), carregados só quando abertos.
//  - RouteMap: percurso com marcadores (Casa, paradas pelo nome, bandeira), trecho em destaque,
//    caminhos alternativos para comparar e pontos de passagem (tocar no mapa adiciona; arrastar move).
//  - PointPicker: um ponto arrastável para corrigir a localização de uma parada.
import { useEffect, useRef, useState } from 'react'
import { decodePolyline } from '../lib/polyline.js'

const BRAND = '#FF5F24'
const ALT_COLORS = ['#3b82f6', '#16a34a', '#a855f7', '#0891b2', '#ca8a04', '#db2777']
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const decode = (p) => {
  try {
    return p ? decodePolyline(p) : []
  } catch {
    return []
  }
}

async function leaflet() {
  const L = (await import('leaflet')).default
  await import('leaflet/dist/leaflet.css')
  return L
}

function baseMap(L, el) {
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© colaboradores do OpenStreetMap' }).addTo(map)
  return map
}

/**
 * points: [{lat, lon}] na ordem; labels: nomes; legs: [{ polyline }] por trecho (opcional);
 * selected: índice do trecho em destaque (só ele é desenhado forte e o zoom vai para ele);
 * alternatives: [{ polyline, id }] para comparar, altSelected: id escolhido;
 * vias: [{lat, lon}] pontos de passagem; onMapClick(lat, lon) adiciona; onViaMove(i, lat, lon); onMarker(i).
 */
export default function RouteMap({ polyline, points = [], labels = [], legs = null, selected = null, alternatives = null, altSelected = null, vias = null, onMapClick = null, onViaMove = null, onMarker = null, height = null, testid = 'route-map' }) {
  const el = useRef()
  const cb = useRef({})
  cb.current = { onMapClick, onViaMove, onMarker }
  const [err, setErr] = useState(null)
  const deps = JSON.stringify([polyline, points, labels, legs?.map((l) => l?.polyline ?? ''), selected, alternatives?.map((a) => [a.id, a.polyline]), altSelected, vias])
  useEffect(() => {
    let map
    let alive = true
    ;(async () => {
      try {
        const L = await leaflet()
        if (!alive || !el.current) return
        map = baseMap(L, el.current)
        const pts = points.map((p) => [p.lat, p.lon])
        const legLines = legs?.map((l) => decode(l?.polyline)) ?? []
        const full = decode(polyline)
        let focus = []
        if (alternatives?.length) {
          // Comparação: cada caminho numa cor; o escolhido por cima e mais grosso.
          const sorted = [...alternatives].sort((a, b) => (a.id === altSelected) - (b.id === altSelected))
          sorted.forEach((a) => {
            const line = decode(a.polyline)
            const k = alternatives.indexOf(a)
            const on = a.id === altSelected
            if (line.length > 1) L.polyline(line, { color: on ? BRAND : ALT_COLORS[k % ALT_COLORS.length], weight: on ? 6 : 4, opacity: on ? 0.95 : 0.6, dashArray: on ? null : '8 6' }).addTo(map)
            focus.push(...line)
          })
        } else if (legLines.some((l) => l.length > 1)) {
          legLines.forEach((line, i) => {
            if (line.length < 2) return
            const on = selected == null || selected === i
            L.polyline(line, { color: BRAND, weight: on ? 6 : 3, opacity: on ? 0.95 : 0.3 }).addTo(map)
            if (selected === i) focus = line
          })
        } else if (full.length > 1) L.polyline(full, { color: BRAND, weight: 5, opacity: 0.9 }).addTo(map)
        else if (pts.length > 1) L.polyline(pts, { color: BRAND, weight: 3, dashArray: '6 8' }).addTo(map)

        pts.forEach((p, i) => {
          const last = i === pts.length - 1
          const kind = i === 0 ? 'start' : last ? 'end' : 'stop'
          const sym = i === 0 ? '🏠' : last ? '🏁' : String(i)
          const dim = selected != null && !alternatives && i !== selected && i !== selected + 1
          const icon = L.divIcon({ className: `route-pin${dim ? ' dim' : ''}`, html: `<span class="${kind}">${sym}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })
          const m = L.marker(p, { icon, title: labels[i] || '', keyboard: true }).addTo(map)
          if (labels[i]) m.bindTooltip(esc(labels[i]), { direction: 'top', offset: [0, -14], permanent: pts.length <= 6 && !dim, className: 'pin-label' })
          if (kind === 'stop' && cb.current.onMarker) m.on('click', () => cb.current.onMarker?.(i))
          if (selected != null && (i === selected || i === selected + 1) && !focus.length) focus.push(p)
        })

        ;(vias ?? []).forEach((v, i) => {
          const icon = L.divIcon({ className: 'via-pin', html: `<span>${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] })
          const m = L.marker([v.lat, v.lon], { icon, draggable: !!cb.current.onViaMove, title: `Ponto de passagem ${i + 1}` }).addTo(map)
          m.on('dragend', () => { const ll = m.getLatLng(); cb.current.onViaMove?.(i, ll.lat, ll.lng) })
        })
        if (cb.current.onMapClick) map.on('click', (e) => cb.current.onMapClick?.(e.latlng.lat, e.latlng.lng))

        const all = focus.length > 1 ? focus : full.length > 1 ? full : legLines.flat().length > 1 ? legLines.flat() : pts
        if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [28, 28], maxZoom: 16 })
      } catch {
        if (alive) setErr('Não foi possível carregar o mapa (sem internet?). A rota salva continua valendo.')
      }
    })()
    return () => {
      alive = false
      map?.remove()
    }
  }, [deps])
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map" style={height ? { height } : undefined} role="img" aria-label="Mapa do percurso" data-testid={testid} />
      {err && <div className="muted small" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  )
}

/** Ponto arrastável (ou tocar no mapa para mover). onChange(lat, lon). */
export function PointPicker({ point, around = null, onChange }) {
  const el = useRef()
  const cb = useRef(onChange)
  cb.current = onChange
  const marker = useRef(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let map
    let alive = true
    ;(async () => {
      try {
        const L = await leaflet()
        if (!alive || !el.current) return
        map = baseMap(L, el.current)
        const start = point ?? around ?? { lat: -23.1857, lon: -46.8978 }
        map.setView([start.lat, start.lon], point ? 17 : 14)
        const icon = L.divIcon({ className: 'route-pin', html: '<span class="stop">📍</span>', iconSize: [30, 30], iconAnchor: [15, 28] })
        marker.current = L.marker([start.lat, start.lon], { icon, draggable: true, title: 'Arraste para o local exato' }).addTo(map)
        marker.current.on('dragend', () => { const ll = marker.current.getLatLng(); cb.current(ll.lat, ll.lng) })
        map.on('click', (e) => { marker.current.setLatLng(e.latlng); cb.current(e.latlng.lat, e.latlng.lng) })
      } catch {
        if (alive) setErr('Não foi possível carregar o mapa.')
      }
    })()
    return () => {
      alive = false
      map?.remove()
    }
  }, [])
  // Coordenadas digitadas: move o marcador sem recriar o mapa.
  useEffect(() => {
    if (point && marker.current) marker.current.setLatLng([point.lat, point.lon])
  }, [point?.lat, point?.lon])
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map point-picker" role="application" aria-label="Mapa para marcar o ponto exato" data-testid="point-picker" />
      {err && <div className="muted small">{err}</div>}
    </div>
  )
}
