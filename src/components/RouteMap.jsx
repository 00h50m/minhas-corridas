// Mapa do percurso (Leaflet + OpenStreetMap), carregado só quando aberto.
import { useEffect, useRef, useState } from 'react'
import { decodePolyline } from '../lib/polyline.js'

export default function RouteMap({ polyline, points = [], labels = [] }) {
  const el = useRef()
  const [err, setErr] = useState(null)
  useEffect(() => {
    let map
    let alive = true
    ;(async () => {
      try {
        const L = (await import('leaflet')).default
        await import('leaflet/dist/leaflet.css')
        if (!alive || !el.current) return
        map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© colaboradores do OpenStreetMap' }).addTo(map)
        let line = []
        try {
          line = polyline ? decodePolyline(polyline) : []
        } catch {
          line = []
        }
        const pts = points.map((p) => [p.lat, p.lon])
        if (line.length > 1) L.polyline(line, { color: '#FF5F24', weight: 5, opacity: 0.9 }).addTo(map)
        else if (pts.length > 1) L.polyline(pts, { color: '#FF5F24', weight: 3, dashArray: '6 8' }).addTo(map)
        pts.forEach((p, i) => {
          const last = i === pts.length - 1
          const icon = L.divIcon({ className: 'route-pin', html: `<span class="${i === 0 ? 'start' : last ? 'end' : ''}">${i === 0 ? 'S' : last ? '🏁' : i}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] })
          L.marker(p, { icon, title: labels[i] || '' }).addTo(map)
        })
        const all = line.length > 1 ? line : pts
        if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [24, 24] })
      } catch {
        if (alive) setErr('Não foi possível carregar o mapa (sem internet?). A rota salva continua valendo.')
      }
    })()
    return () => {
      alive = false
      map?.remove()
    }
  }, [polyline, JSON.stringify(points)])
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map" role="img" aria-label="Mapa do percurso" data-testid="route-map" />
      {err && <div className="muted small" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  )
}
