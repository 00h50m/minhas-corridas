// Previsão do tempo na largada (Open-Meteo: gratuito, sem chave). Só a localização da prova sai do app.
// A previsão vai até 16 dias à frente; antes disso não há dado (e o app não inventa).

export const FORECAST_DAYS = 15
const UF_NAME = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
}
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Códigos WMO → texto e símbolo. */
export function weatherLabel(code) {
  if (code === 0) return { text: 'Céu limpo', icon: '☀️' }
  if (code === 1) return { text: 'Poucas nuvens', icon: '🌤️' }
  if (code === 2) return { text: 'Parcialmente nublado', icon: '⛅' }
  if (code === 3) return { text: 'Nublado', icon: '☁️' }
  if (code === 45 || code === 48) return { text: 'Neblina', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { text: 'Garoa', icon: '🌦️' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: code === 65 || code === 82 ? 'Chuva forte' : 'Chuva', icon: '🌧️' }
  if (code >= 95) return { text: 'Tempestade', icon: '⛈️' }
  if (code >= 71 && code <= 86) return { text: 'Neve', icon: '❄️' }
  return { text: 'Tempo variável', icon: '🌡️' }
}

/** A previsão desta prova está disponível (data dentro dos próximos dias)? */
export function forecastAvailable(daysUntil) {
  return daysUntil != null && daysUntil >= 0 && daysUntil <= FORECAST_DAYS
}

/**
 * Lê a resposta horária do Open-Meteo e devolve o tempo na largada e no fim previsto.
 * startMin/endMin: minutos do dia. { start, end, rainMax, tips }
 */
export function pickHours(body, date, startMin, endMin) {
  const h = body?.hourly
  if (!h?.time?.length) return null
  const at = (min) => {
    const hour = Math.min(23, Math.max(0, Math.round(min / 60)))
    const i = h.time.indexOf(`${date}T${String(hour).padStart(2, '0')}:00`)
    if (i < 0) return null
    return {
      hour,
      temp: h.temperature_2m?.[i],
      feels: h.apparent_temperature?.[i],
      rainProb: h.precipitation_probability?.[i] ?? null,
      rainMm: h.precipitation?.[i] ?? null,
      wind: h.wind_speed_10m?.[i],
      humidity: h.relative_humidity_2m?.[i] ?? null,
      code: h.weather_code?.[i]
    }
  }
  const start = at(startMin)
  if (!start || start.temp == null) return null
  const end = at(endMin) ?? start
  return { start, end, tips: weatherTips(start, end) }
}

/** Dicas práticas pelo tempo (roupa, hidratação, ritmo). */
export function weatherTips(start, end) {
  const tips = []
  const hot = Math.max(start.feels ?? start.temp, end.feels ?? end.temp)
  if (hot >= 27) tips.push('Calor forte: hidrate desde a véspera, use boné e protetor e comece mais devagar que a meta.')
  else if (hot >= 22) tips.push('Calor: hidrate bem antes da largada e aproveite os postos de água.')
  if ((start.feels ?? start.temp) <= 12) tips.push('Frio na largada: vá com uma camada que possa descartar e aqueça bem antes.')
  const rain = Math.max(start.rainProb ?? 0, end.rainProb ?? 0)
  if (rain >= 50 || (start.rainMm ?? 0) >= 1) tips.push(`Chance de chuva de ${rain}%: capa ou saco descartável, meia que não encharque e atenção ao piso.`)
  const wind = Math.max(start.wind ?? 0, end.wind ?? 0)
  if (wind >= 25) tips.push(`Vento forte (até ${Math.round(wind)} km/h): no vento contra, corra atrás de alguém.`)
  if ((start.humidity ?? 0) >= 85 && start.temp >= 20) tips.push('Abafado: o corpo esquenta mais rápido; ajuste o ritmo pela sensação.')
  return tips
}

/** Coordenadas da prova: o destino da Logística (se localizado) ou a cidade (geocodificação do Open-Meteo). */
export async function raceCoords(race, dest, fetchImpl = fetch) {
  if (dest?.lat != null) return { lat: dest.lat, lon: dest.lon, label: race.city ? `${race.city}${race.state ? `/${race.state}` : ''}` : dest.label || 'local da prova', source: 'logistica' }
  if (!race.city) return null
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(race.city)}&count=10&language=pt&format=json&countryCode=BR`
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error('Não foi possível localizar a cidade da prova.')
  const list = (await res.json()).results ?? []
  const want = race.state ? norm(UF_NAME[race.state] ?? race.state) : null
  const hit = list.find((r) => norm(r.name) === norm(race.city) && (!want || norm(r.admin1) === want)) ?? (want ? null : list[0])
  return hit ? { lat: hit.latitude, lon: hit.longitude, label: `${race.city}${race.state ? `/${race.state}` : ''}`, source: 'cidade' } : null
}

export function forecastUrl(lat, lon, date) {
  const vars = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m'
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${vars}&timezone=America%2FSao_Paulo&start_date=${date}&end_date=${date}`
}

/** Duração estimada da prova (meta; senão 6:30/km; senão 1 h) para mostrar o tempo no fim. */
export function expectedEndMin(race, startMin) {
  const sec = race.targetTime ?? (race.distanceKm ? race.distanceKm * 390 : 3600)
  return startMin + Math.round(sec / 60)
}
