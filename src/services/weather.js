// Previsão da prova com cache no aparelho (1 h): abre sem internet com a última previsão.
import { expectedEndMin, forecastUrl, pickHours, raceCoords } from '../lib/weather.js'
import { hmToMin } from '../lib/schedule.js'

const KEY = 'minhas-corridas:clima'
const TTL = 3600_000

function readCache() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}
function writeCache(c) {
  try {
    // Só as entradas recentes (uma por prova).
    const keep = Object.fromEntries(Object.entries(c).sort((a, b) => b[1].at - a[1].at).slice(0, 20))
    globalThis.localStorage?.setItem(KEY, JSON.stringify(keep))
  } catch {
    /* sem espaço: segue sem cache */
  }
}

/** { ok, data: { start, end, tips }, place, at, cached } ou { ok: false, error }. */
export async function raceWeather(race, dest, { force = false, now = Date.now(), fetchImpl = fetch } = {}) {
  const startMin = hmToMin(race.startTime) ?? 7 * 60
  const cache = readCache()
  const hit = cache[race.id]
  const sig = `${race.date}|${startMin}|${dest?.lat ?? race.city ?? ''}`
  if (hit && hit.sig === sig && !force && now - hit.at < TTL) return { ok: true, ...hit.value, at: hit.at, cached: true }
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sem internet.')
    const place = await raceCoords(race, dest, fetchImpl)
    if (!place) return { ok: false, error: 'Informe a cidade da prova (ou o local na Logística) para ver a previsão.' }
    const res = await fetchImpl(forecastUrl(place.lat, place.lon, race.date))
    if (!res.ok) throw new Error('O serviço de previsão não respondeu.')
    const data = pickHours(await res.json(), race.date, startMin, expectedEndMin(race, startMin))
    if (!data) return { ok: false, error: 'Ainda não há previsão para o horário da largada.' }
    const value = { data, place: { label: place.label, source: place.source } }
    writeCache({ ...cache, [race.id]: { sig, at: now, value } })
    return { ok: true, ...value, at: now, cached: false }
  } catch (e) {
    // Sem conexão: mostra a última previsão guardada, avisando de quando é.
    if (hit && hit.sig === sig) return { ok: true, ...hit.value, at: hit.at, cached: true, stale: true }
    return { ok: false, error: e.message || 'Não foi possível buscar a previsão.' }
  }
}
