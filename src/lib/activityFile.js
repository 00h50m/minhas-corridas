// Leitura de arquivos de atividade exportados do relógio (Garmin Connect e outros): GPX e TCX.
// Sem DOM, para funcionar também nos testes. Guardamos o resumo e um traçado simplificado,
// sem os primeiros e os últimos 200 m (zona de privacidade: não mostra onde você mora).
import { decodeFit, fitFromZip } from './fit.js'
import { encodePolyline } from './polyline.js'

const num = (s) => (s == null ? null : Number(s))

function tag(block, name) {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, 'i'))
  return m ? m[1].trim() : null
}

function blocks(xml, name) {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?${name}>)`, 'gi'))].map((m) => m[0])
}

function haversine(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function parseTCX(xml) {
  const pts = blocks(xml, 'Trackpoint').map((b) => ({
    t: Date.parse(tag(b, 'Time')),
    d: num(tag(b, 'DistanceMeters')),
    hr: num(tag(blocks(b, 'HeartRateBpm')[0] ?? '', 'Value')),
    alt: num(tag(b, 'AltitudeMeters')),
    lat: num(tag(b, 'LatitudeDegrees')),
    lon: num(tag(b, 'LongitudeDegrees'))
  }))
  // Alguns arquivos não trazem DistanceMeters por ponto: calcula pela posição.
  if (pts.every((p) => p.d == null)) {
    const pos = blocks(xml, 'Trackpoint').map((b) => ({ lat: num(tag(b, 'LatitudeDegrees')), lon: num(tag(b, 'LongitudeDegrees')) }))
    let acc = 0
    pts.forEach((p, i) => {
      if (i > 0 && pos[i].lat != null && pos[i - 1].lat != null) acc += haversine(pos[i - 1], pos[i])
      p.d = acc
    })
  }
  const laps = blocks(xml, 'Lap')
  const lapDist = laps.reduce((s, l) => s + (num(tag(l, 'DistanceMeters')) || 0), 0)
  const lapTime = laps.reduce((s, l) => s + (num(tag(l, 'TotalTimeSeconds')) || 0), 0)
  const sport = xml.match(/<Activity[^>]+Sport="([^"]+)"/i)?.[1] ?? null
  const lapList = laps.map((l) => ({ sec: num(tag(l, 'TotalTimeSeconds')), m: num(tag(l, 'DistanceMeters')), hr: num(tag(blocks(l, 'AverageHeartRateBpm')[0] ?? '', 'Value')) }))
  return { pts, lapDist, lapTime, sport, lapList }
}

function parseGPX(xml) {
  const raw = blocks(xml, 'trkpt').map((b) => ({
    lat: num(b.match(/lat="([^"]+)"/)?.[1]),
    lon: num(b.match(/lon="([^"]+)"/)?.[1]),
    t: Date.parse(tag(b, 'time')),
    alt: num(tag(b, 'ele')),
    hr: num(tag(b, 'hr'))
  }))
  let acc = 0
  const pts = raw.map((p, i) => {
    if (i > 0 && p.lat != null && raw[i - 1].lat != null) acc += haversine(raw[i - 1], p)
    return { t: p.t, d: acc, hr: p.hr, alt: p.alt, lat: p.lat, lon: p.lon }
  })
  return { pts, lapDist: 0, lapTime: 0, sport: tag(xml, 'type') }
}

/** Ganho de elevação com tolerância para o ruído do GPS. */
function elevationGain(alts, threshold = 3) {
  let gain = 0
  let ref = null
  for (const a of alts) {
    if (a == null || !isFinite(a)) continue
    if (ref == null) ref = a
    else if (a - ref >= threshold) {
      gain += a - ref
      ref = a
    } else if (ref - a >= threshold) ref = a
  }
  return Math.round(gain)
}

/** Parciais por km a partir da distância acumulada, interpolando o tempo de cada marco. */
export function splitsFrom(pts) {
  const out = []
  if (pts.length < 2) return out
  const t0 = pts[0].t
  let mark = 1000
  let prevT = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    while (b.d >= mark && a.d < mark) {
      const f = (mark - a.d) / (b.d - a.d || 1)
      const tAt = (a.t - t0) / 1000 + f * ((b.t - a.t) / 1000)
      out.push({ km: mark / 1000, sec: Math.round(tAt - prevT) })
      prevT = tAt
      mark += 1000
    }
  }
  const last = pts[pts.length - 1]
  const rest = last.d - (mark - 1000)
  if (rest >= 100) out.push({ km: Math.round(last.d) / 1000, sec: Math.round((last.t - t0) / 1000 - prevT), partial: Math.round(rest) })
  return out
}

const PRIVACY_M = 200
const MAX_TRACK_PTS = 400

/** Distância de um ponto ao segmento a–b (em graus aproximados por metros locais). */
function segDist(p, a, b) {
  const k = Math.cos((a[0] * Math.PI) / 180)
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0]
  const dx = bx - ax, dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111320
}

/** n pontos espaçados por igual, mantendo o primeiro e o último. */
function sample(arr, n) {
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))])
}

/** Douglas–Peucker iterativo: mantém a forma com menos pontos. */
function simplify(coords, tol) {
  if (coords.length < 3) return coords
  const keep = new Uint8Array(coords.length)
  keep[0] = keep[coords.length - 1] = 1
  const stack = [[0, coords.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    let max = 0, idx = -1
    for (let k = i + 1; k < j; k++) {
      const d = segDist(coords[k], coords[i], coords[j])
      if (d > max) { max = d; idx = k }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([i, idx], [idx, j]) }
  }
  return coords.filter((_, k) => keep[k])
}

/**
 * Traçado para o mapa (polyline codificada), sem os primeiros e os últimos 200 m e com no máximo
 * 400 pontos. null quando o arquivo não tem GPS (esteira, piscina) ou o percurso é curto demais.
 */
export function trackFrom(pts) {
  const geo = pts.filter((p) => p.lat != null && p.lon != null && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0))
  if (geo.length < 10) return null
  let acc = 0
  const withD = geo.map((p, i) => {
    if (i > 0) acc += haversine(geo[i - 1], p)
    return { ...p, cd: acc }
  })
  if (acc < PRIVACY_M * 2 + 300) return null
  // Pontos a menos de 5 m do anterior não mudam o desenho; depois, no máximo 6000 para simplificar rápido.
  let inner = []
  let lastD = -Infinity
  for (const p of withD) {
    if (p.cd < PRIVACY_M || p.cd > acc - PRIVACY_M) continue
    if (p.cd - lastD >= 5) { inner.push([p.lat, p.lon]); lastD = p.cd }
  }
  if (inner.length > 6000) inner = sample(inner, 6000)
  let out = simplify(inner, 4)
  if (out.length > MAX_TRACK_PTS) {
    // A maior tolerância que ainda deixa até 400 pontos (busca binária).
    let lo = 4, hi = 200, best = null
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const s = simplify(inner, mid)
      if (s.length <= MAX_TRACK_PTS) { best = s; hi = mid } else lo = mid
    }
    // Percurso que a simplificação não resolve bem (muito vai e vem): amostra uniforme.
    out = best && best.length >= MAX_TRACK_PTS / 4 ? best : sample(inner, MAX_TRACK_PTS)
  }
  return out.length >= 2 ? encodePolyline(out) : null
}

export const HR_FROM = 60
export const HR_STEP = 5
const HR_BINS = 32 // 60 a 219 bpm

/**
 * Segundos em cada faixa de 5 bpm (60–64, 65–69, … 215–219), pelo tempo entre os pontos (até 30 s
 * por intervalo, para não contar pausas). null sem FC suficiente.
 */
export function hrHistogram(pts) {
  const sec = new Array(HR_BINS).fill(0)
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const hr = pts[i].hr
    if (!(hr > 30 && hr < 250)) continue
    const dt = Math.min(30, (pts[i].t - pts[i - 1].t) / 1000)
    if (!(dt > 0)) continue
    const b = Math.max(0, Math.min(HR_BINS - 1, Math.floor((hr - HR_FROM) / HR_STEP)))
    sec[b] += dt
    total += dt
  }
  return total >= 60 ? sec.map((x) => Math.round(x)) : null
}

/** Monta o resumo a partir dos pontos {t, d, hr, alt} e dos totais do relógio (quando houver). */
function summarize({ pts: all, lapDist = 0, lapTime = 0, sport = null, totals = {}, lapList = [] }, source, fileName) {
  const pts = all.filter((p) => isFinite(p.t) && p.d != null && isFinite(p.d))
  if (pts.length < 2) throw new Error('O arquivo não tem pontos de tempo e distância suficientes.')
  pts.sort((a, b) => a.t - b.t)
  const elapsedSec = Math.round((pts[pts.length - 1].t - pts[0].t) / 1000)
  const trackDist = pts[pts.length - 1].d
  // O total das voltas/sessão é o que o relógio mostra; senão, o acumulado do trajeto.
  const distM = lapDist > 0 ? lapDist : trackDist
  const hrs = all.map((p) => p.hr).filter((h) => h > 30 && h < 250)
  return {
    source,
    fileName: fileName.slice(0, 120),
    sport: sport || null,
    startTime: new Date(pts[0].t).toISOString(),
    distanceKm: Math.round(distM) / 1000,
    elapsedSec: lapTime > 0 ? Math.round(lapTime) : elapsedSec,
    avgHr: totals.avgHr ?? (hrs.length ? Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length) : null),
    maxHr: totals.maxHr ?? (hrs.length ? Math.max(...hrs) : null),
    elevGainM: totals.ascent ?? (all.some((p) => p.alt != null) ? elevationGain(all.map((p) => p.alt)) : null),
    splits: splitsFrom(pts),
    track: trackFrom(all.filter((p) => isFinite(p.t)).sort((a, b) => a.t - b.t)),
    // Voltas do relógio (num treino estruturado, uma por passo): para o planejado × executado.
    laps: lapList.filter((l) => l.sec > 0).slice(0, 200).map((l) => ({ sec: Math.round(l.sec), distanceKm: Math.round(l.m || 0) / 1000, ...(l.hr > 30 && l.hr < 250 ? { avgHr: Math.round(l.hr) } : {}) })),
    // Tempo em cada faixa de 5 bpm (para as zonas de FC, recalculadas quando as zonas mudam)
    hrHist: hrHistogram(pts)
  }
}

/**
 * Lê o conteúdo de um .gpx ou .tcx. Retorna o resumo:
 * { source, fileName, startTime, distanceKm, elapsedSec, avgHr, maxHr, elevGainM, splits }
 * ou lança erro com mensagem amigável.
 */
export function parseActivity(text, fileName = '') {
  const lower = fileName.toLowerCase()
  if (/\.(fit|zip)$/.test(lower)) throw new Error('Arquivos .FIT e .ZIP são lidos por readActivityFile.')
  const head = text.slice(0, 2000)
  const isTCX = /TrainingCenterDatabase/i.test(head) || lower.endsWith('.tcx')
  const isGPX = /<gpx[\s>]/i.test(head) || lower.endsWith('.gpx')
  if (!isTCX && !isGPX) throw new Error('Não reconheci o arquivo. Use .FIT, .ZIP do Garmin, .TCX ou .GPX.')
  return summarize(isTCX ? parseTCX(text) : parseGPX(text), isTCX ? 'tcx' : 'gpx', fileName)
}

const FIT_SPORTS = { 0: 'generic', 1: 'running', 2: 'cycling', 11: 'walking', 17: 'hiking' }

/** Lê um .FIT (bytes já descompactados). */
export function parseFitActivity(bytes, fileName = '') {
  const { records, laps, sessions } = decodeFit(bytes)
  const s = sessions[0] ?? {}
  const SEMI = 180 / 2 ** 31
  const pts = records.map((r) => ({ t: r.timestamp, d: r.distance, hr: r.heartRate, alt: r.enhancedAltitude ?? r.altitude, lat: r.positionLat != null ? r.positionLat * SEMI : null, lon: r.positionLong != null ? r.positionLong * SEMI : null }))
  const lapDist = s.totalDistance ?? laps.reduce((a, l) => a + (l.totalDistance || 0), 0)
  const lapTime = s.totalTimerTime ?? laps.reduce((a, l) => a + (l.totalTimerTime || 0), 0)
  return summarize(
    {
      pts,
      lapDist,
      lapTime,
      sport: s.sport != null ? FIT_SPORTS[s.sport] ?? String(s.sport) : null,
      totals: { avgHr: s.avgHeartRate ?? null, maxHr: s.maxHeartRate ?? null, ascent: s.totalAscent ?? null },
      lapList: laps.map((l) => ({ sec: l.totalTimerTime ?? l.totalElapsedTime, m: l.totalDistance, hr: l.avgHeartRate }))
    },
    'fit',
    fileName
  )
}

/** Lê o arquivo escolhido pela usuária: .fit, .zip (Garmin "Exportar original"), .tcx ou .gpx. */
export async function readActivityFile(file) {
  const name = file.name || ''
  if (/\.zip$/i.test(name)) return parseFitActivity(await fitFromZip(new Uint8Array(await file.arrayBuffer())), name.replace(/\.zip$/i, '.fit'))
  if (/\.fit$/i.test(name)) return parseFitActivity(new Uint8Array(await file.arrayBuffer()), name)
  return parseActivity(await file.text(), name)
}

/** Valida o resumo guardado no resultado (vindo de backup ou da nuvem). */
export function isValidWatch(w) {
  return !!w && typeof w === 'object' && w.distanceKm > 0 && w.elapsedSec > 0 && Array.isArray(w.splits)
}
