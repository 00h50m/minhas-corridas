// Leitura de arquivos de atividade exportados do relógio (Garmin Connect e outros): GPX e TCX.
// Sem DOM, para funcionar também nos testes. Guardamos só o resumo, não o trajeto.
import { decodeFit, fitFromZip } from './fit.js'

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
    alt: num(tag(b, 'AltitudeMeters'))
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
  return { pts, lapDist, lapTime, sport }
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
    return { t: p.t, d: acc, hr: p.hr, alt: p.alt }
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

/** Monta o resumo a partir dos pontos {t, d, hr, alt} e dos totais do relógio (quando houver). */
function summarize({ pts: all, lapDist = 0, lapTime = 0, sport = null, totals = {} }, source, fileName) {
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
    splits: splitsFrom(pts)
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
  const pts = records.map((r) => ({ t: r.timestamp, d: r.distance, hr: r.heartRate, alt: r.enhancedAltitude ?? r.altitude }))
  const lapDist = s.totalDistance ?? laps.reduce((a, l) => a + (l.totalDistance || 0), 0)
  const lapTime = s.totalTimerTime ?? laps.reduce((a, l) => a + (l.totalTimerTime || 0), 0)
  return summarize(
    {
      pts,
      lapDist,
      lapTime,
      sport: s.sport != null ? FIT_SPORTS[s.sport] ?? String(s.sport) : null,
      totals: { avgHr: s.avgHeartRate ?? null, maxHr: s.maxHeartRate ?? null, ascent: s.totalAscent ?? null }
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
