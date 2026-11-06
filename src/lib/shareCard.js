// Conteúdo do card de compartilhamento de um resultado (sem desenho; ver components/ShareCard.jsx).
import { distanceKey } from './stats.js'
import { formatDuration, formatKm, formatPace } from './format.js'
import { formatDateBR } from './dates.js'

export const CARD_FORMATS = {
  feed: { id: 'feed', label: 'Feed (4:5)', w: 1080, h: 1350 },
  story: { id: 'story', label: 'Stories (9:16)', w: 1080, h: 1920 },
  square: { id: 'square', label: 'Quadrado', w: 1080, h: 1080 }
}

export function distanceTitle(km) {
  const k = distanceKey(km)
  if (k === '42.2') return 'MARATONA'
  if (k === '21.1') return 'MEIA MARATONA'
  return formatKm(km).toUpperCase()
}

/**
 * Selos do resultado: recorde pessoal, primeira prova na distância, meta batida.
 * Usa só resultados oficiais anteriores na mesma distância.
 */
export function resultBadges(race, races) {
  const res = race.result
  const out = []
  if (!res?.netTime) return out
  const key = distanceKey(res.officialDistanceKm)
  const earlier = races.filter(
    (r) => r.id !== race.id && r.status === 'concluida' && r.result?.netTime && r.result.officialDistanceKm && distanceKey(r.result.officialDistanceKm) === key && r.date && race.date && r.date < race.date
  )
  const earlierOfficial = earlier.filter((r) => r.result.isOfficial)
  if (!earlier.length) {
    const k = distanceKey(res.officialDistanceKm)
    out.push({ id: 'primeira', label: k === '42.2' ? 'Primeira maratona' : k === '21.1' ? 'Primeira meia' : `Primeira de ${formatKm(res.officialDistanceKm)}` })
  } else if (res.isOfficial && earlierOfficial.length && res.netTime < Math.min(...earlierOfficial.map((r) => r.result.netTime))) {
    const prev = Math.min(...earlierOfficial.map((r) => r.result.netTime))
    out.push({ id: 'recorde', label: `Recorde pessoal (−${formatDuration(prev - res.netTime)})` })
  }
  if (race.targetTime && res.netTime <= race.targetTime) out.push({ id: 'meta', label: 'Meta batida' })
  return out
}

/** Dados prontos para o desenho. `opts`: { places, splits, hr } decidem o que entra. */
export function shareCardInfo(race, races, opts = {}) {
  const res = race.result
  if (!res?.netTime || !res.officialDistanceKm) return null
  const { places = true, splits = true, hr = false, athlete = '' } = opts
  const stats = [{ label: 'PACE', value: formatPace(res.netTime / res.officialDistanceKm).replace(' /km', '/km') }]
  if (places && res.overallPlace) stats.push({ label: 'GERAL', value: `${res.overallPlace}º` })
  if (places && res.categoryPlace) stats.push({ label: res.category ? `CAT. ${res.category}`.slice(0, 18).toUpperCase() : 'CATEGORIA', value: `${res.categoryPlace}º` })
  if (hr && res.watch?.avgHr) stats.push({ label: 'FC MÉDIA', value: `${res.watch.avgHr}` })
  if (stats.length < 3 && res.watch?.elevGainM) stats.push({ label: 'SUBIDA', value: `${res.watch.elevGainM} m` })
  const full = (res.watch?.splits ?? []).filter((s) => !s.partial)
  return {
    name: race.name,
    athlete: String(athlete || '').trim().slice(0, 40),
    date: race.date ? formatDateBR(race.date) : '',
    place: [race.city, race.state].filter(Boolean).join('/'),
    distance: distanceTitle(res.officialDistanceKm),
    time: formatDuration(res.netTime),
    timeLabel: res.isOfficial ? 'TEMPO LÍQUIDO' : 'TEMPO (REGISTRO PESSOAL)',
    stats: stats.slice(0, 3),
    badges: resultBadges(race, races),
    splits: splits && full.length >= 3 ? full.slice(0, 50).map((s) => s.sec) : null
  }
}

/** Nome de arquivo para o PNG. */
export function cardFileName(race) {
  const slug = race.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'corrida'
  return `${slug}${race.date ? '-' + race.date : ''}.png`
}
