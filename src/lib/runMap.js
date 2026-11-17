// Mapa das suas corridas: traçados dos arquivos do relógio (provas e treinos), quarteirões cobertos
// e território novo. Os traçados já vêm sem os primeiros e os últimos 200 m (activityFile.trackFrom).
import { decodePolyline } from './polyline.js'
import { yearOf } from './dates.js'

/** Lado da célula do "quarteirão" (graus de latitude ≈ 150 m). */
const CELL = 0.00135

const safeDecode = (p) => {
  if (typeof p !== 'string' || !p || p.length > 12000 || !/^[\x3f-\x7e]+$/.test(p)) return []
  try {
    return decodePolyline(p).filter(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) <= 180)
  } catch {
    return []
  }
}

function meters(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Células (~150 m) por onde a linha passa, interpolando trechos longos para não pular quarteirões. */
export function cellsOf(coords) {
  const out = new Set()
  const add = ([lat, lon]) => {
    const k = Math.cos((lat * Math.PI) / 180) || 1
    out.add(`${Math.floor(lat / CELL)}:${Math.floor((lon * k) / CELL)}`)
  }
  coords.forEach((p, i) => {
    add(p)
    if (i === 0) return
    const a = coords[i - 1]
    const n = Math.floor(meters(a, p) / 60)
    for (let j = 1; j < n; j++) add([a[0] + ((p[0] - a[0]) * j) / n, a[1] + ((p[1] - a[1]) * j) / n])
  })
  return out
}

/**
 * Percursos com traçado: [{ id, kind: 'prova'|'treino', name, date, url, coords, km }], do mais antigo ao mais novo.
 * year: só os daquele ano (null = todos).
 */
export function collectTracks(races = [], workouts = [], year = null) {
  const out = []
  for (const r of races) {
    const t = r.result?.watch?.track
    if (!t || !r.date) continue
    const coords = safeDecode(t)
    if (coords.length > 1) out.push({ id: r.id, kind: 'prova', name: r.name, date: r.date, url: `/corridas/${r.id}`, coords })
  }
  for (const w of workouts) {
    const t = w.result?.track
    if (!t || !w.date || w.status !== 'feito') continue
    const coords = safeDecode(t)
    if (coords.length > 1) out.push({ id: w.id, kind: 'treino', sport: w.sport ?? 'corrida', name: w.name, date: w.date, url: `/treinos/${w.id}`, coords })
  }
  return out
    .filter((x) => year == null || yearOf(x.date) === year)
    .map((x) => ({ ...x, km: Math.round(x.coords.reduce((s, p, i) => (i ? s + meters(x.coords[i - 1], p) : 0), 0) / 10) / 100 }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Resumo do território: { count, km, cells, last: { name, date, newCells } | null, top: [{ name, date, newCells }] }.
 * newCells: quarteirões que aquele percurso cobriu pela primeira vez (na ordem das datas).
 */
export function territory(tracks) {
  const seen = new Set()
  const per = tracks.map((t) => {
    let n = 0
    for (const c of cellsOf(t.coords)) if (!seen.has(c)) { seen.add(c); n++ }
    return { id: t.id, name: t.name, date: t.date, url: t.url, newCells: n }
  })
  return {
    count: tracks.length,
    km: Math.round(tracks.reduce((s, t) => s + t.km, 0) * 10) / 10,
    cells: seen.size,
    last: per.at(-1) ?? null,
    top: [...per].sort((a, b) => b.newCells - a.newCells).slice(0, 3)
  }
}
