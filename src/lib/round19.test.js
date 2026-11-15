// Clima na largada (Open-Meteo, respostas SIMULADAS no formato real) e "como foi a logística".
import { describe, expect, it, vi } from 'vitest'
import { expectedEndMin, forecastAvailable, forecastUrl, pickHours, raceCoords, weatherLabel, weatherTips } from './weather.js'
import { dayReview, diffText } from './dayReview.js'
import { normalizeLogistics, pointsKey } from './logistics.js'

const hours = Array.from({ length: 24 }, (_, h) => `2026-11-15T${String(h).padStart(2, '0')}:00`)
const body = (o = {}) => ({
  hourly: {
    time: hours,
    temperature_2m: hours.map((_, h) => o.temp ?? 15 + h * 0.5),
    apparent_temperature: hours.map((_, h) => o.feels ?? 15 + h * 0.6),
    precipitation_probability: hours.map(() => o.rain ?? 10),
    precipitation: hours.map(() => 0),
    weather_code: hours.map(() => o.code ?? 2),
    wind_speed_10m: hours.map(() => o.wind ?? 8),
    relative_humidity_2m: hours.map(() => 70)
  }
})

describe('clima na largada', () => {
  it('pega a hora da largada e a do fim previsto', () => {
    const w = pickHours(body(), '2026-11-15', 7 * 60, 8 * 60 + 10)
    expect(w.start).toMatchObject({ hour: 7, temp: 18.5, feels: 19.2, rainProb: 10, wind: 8, code: 2 })
    expect(w.end.hour).toBe(8)
    expect(pickHours(body(), '2026-11-16', 420, 480)).toBe(null)
    expect(weatherLabel(2).text).toBe('Parcialmente nublado')
    expect(weatherLabel(63)).toEqual({ text: 'Chuva', icon: '🌧️' })
  })
  it('dicas: calor, frio, chuva e vento; nada quando está ameno', () => {
    expect(weatherTips({ temp: 26, feels: 29, rainProb: 0, wind: 5 }, { temp: 28, feels: 31 })[0]).toMatch(/^Calor forte/)
    expect(weatherTips({ temp: 9, feels: 7, rainProb: 70, rainMm: 2, wind: 30 }, { temp: 11, feels: 10, rainProb: 60, wind: 20 })).toEqual([
      'Frio na largada: vá com uma camada que possa descartar e aqueça bem antes.',
      'Chance de chuva de 70%: capa ou saco descartável, meia que não encharque e atenção ao piso.',
      'Vento forte (até 30 km/h): no vento contra, corra atrás de alguém.'
    ])
    expect(weatherTips({ temp: 17, feels: 17, rainProb: 10, wind: 8 }, { temp: 19, feels: 19, rainProb: 10, wind: 8 })).toEqual([])
  })
  it('só mostra dentro do alcance da previsão; fim pela meta ou 6:30/km', () => {
    expect(forecastAvailable(0)).toBe(true)
    expect(forecastAvailable(15)).toBe(true)
    expect(forecastAvailable(16)).toBe(false)
    expect(forecastAvailable(-1)).toBe(false)
    expect(expectedEndMin({ targetTime: 3000 }, 420)).toBe(470)
    expect(expectedEndMin({ distanceKm: 10 }, 420)).toBe(485)
    expect(forecastUrl(-23.0451, -46.9773, '2026-11-15')).toContain('latitude=-23.0451&longitude=-46.9773')
    expect(forecastUrl(-23.0451, -46.9773, '2026-11-15')).toContain('start_date=2026-11-15&end_date=2026-11-15')
  })
  it('local: destino da Logística; senão a cidade certa (mesmo nome em outro estado não serve)', async () => {
    expect(await raceCoords({ city: 'Vinhedo', state: 'SP' }, { lat: -23.04, lon: -46.97 })).toMatchObject({ lat: -23.04, source: 'logistica' })
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ results: [
      { name: 'Vinhedo', latitude: -1, longitude: -1, admin1: 'Minas Gerais' },
      { name: 'Vinhedo', latitude: -23.0302, longitude: -46.9753, admin1: 'São Paulo' }
    ] })))
    expect(await raceCoords({ city: 'Vinhedo', state: 'SP' }, null, fetchImpl)).toMatchObject({ lat: -23.0302, label: 'Vinhedo/SP', source: 'cidade' })
    expect(await raceCoords({ city: 'Vinhedo', state: 'RJ' }, null, fetchImpl)).toBe(null)
    expect(await raceCoords({}, null, fetchImpl)).toBe(null)
  })
})

describe('como foi a logística', () => {
  const P = {
    casa: { label: 'Casa', address: 'Casa', lat: -23.17, lon: -46.88 },
    dani: { id: 's1', label: 'Buscar Dani', address: 'Rua Dani, 1', lat: -23.18, lon: -46.89, dwellMin: 5 },
    pac: { label: 'PAC', address: 'PAC', lat: -23.04, lon: -46.98 }
  }
  // Ida: Casa → Dani (10 min) → PAC (30 min); largada 07:00; preparo padrão (margem 10)
  const race = (marks, back = null) => ({
    id: 'hc', name: 'HC', date: '2026-11-15', startTime: '07:00', venueAddress: 'PAC',
    dayLog: { date: '2026-11-15', marks },
    logistics: normalizeLogistics({
      origin: P.casa, destination: P.pac, prep: {},
      outbound: { stops: [P.dani], route: { provider: 'manual', legs: [{ distanceKm: 3, durationMin: 10 }, { distanceKm: 25, durationMin: 30 }], key: pointsKey([P.casa, P.dani, P.pac]) } },
      back
    })
  })
  // Plano: sair 05:05 (07:00 − 45 − 10 − 40 − 5 − 10 − 5?) → conferido pelo próprio resumo
  it('compara trecho a trecho e sugere o que ajustar', () => {
    const base = dayReview(race({ sair: '00:00' }))
    const plan = base.ida.legs.map((l) => [l.from.key, l.from.at, l.to.at])
    const [sair, chegar0] = [plan[0][1], plan[0][2]]
    const sair0 = plan[1][1]
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    // Saiu 8 min atrasada, levou 14 min até a Dani (+4), ficou 9 min (+4), 38 min até a PAC (+8)
    const marks = { sair: fmt(sair + 8), 'chegar-0': fmt(sair + 22), 'sair-0': fmt(sair + 31), 'chegar-destino': fmt(sair + 69) }
    const rv = dayReview(race(marks))
    expect(rv.ida.departDelay).toBe(8)
    expect(rv.ida.legs.map((l) => [l.planned, l.actual, l.diff])).toEqual([[10, 14, 4], [30, 38, 8]])
    expect(rv.ida.dwells.map((d) => [d.label, d.planned, d.actual])).toEqual([['Buscar Dani', 5, 9]])
    expect(rv.ida.driving).toEqual({ planned: 40, actual: 52 })
    // planejado: chegada 45 min depois de sair (10 + 5 + 30); real 69 → 24 além do plano; margem 10 → 14 além
    expect(chegar0 - sair).toBe(10)
    expect(sair0 - sair).toBe(15)
    expect(rv.ida.arrival.late).toBe(14)
    const ids = rv.suggestions.map((s) => s.id)
    expect(ids).toEqual(['prep', 'traffic', 'dwell-chegar-0', 'buffer'])
    expect(rv.suggestions[0].apply).toEqual({ prep: { finalPrepMin: 20 } })
    expect(rv.suggestions[1].apply).toEqual({ prep: { trafficExtraPct: 30 } })
    expect(rv.suggestions[2].apply).toEqual({ dwell: { address: 'Rua Dani, 1', min: 9 } })
    expect(rv.suggestions[3].apply).toEqual({ prep: { bufferMin: 25 } })
  })
  it('tudo no horário: sem sugestões; sem marcações: nada', () => {
    const base = dayReview(race({ sair: '00:00' }))
    const s = base.ida.legs[0].from.at
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const rv = dayReview(race({ sair: fmt(s), 'chegar-0': fmt(s + 10), 'sair-0': fmt(s + 15), 'chegar-destino': fmt(s + 46) }))
    expect(rv.suggestions).toEqual([])
    expect(dayReview(race({}))).toBe(null)
    expect(dayReview({ ...race({ sair: '05:00' }), dayLog: { date: '2026-11-01', marks: { sair: '05:00' } } })).toBe(null)
    expect(diffText(4)).toBe('+4 min')
    expect(diffText(-3)).toBe('−3 min')
    expect(diffText(1)).toBe('no tempo')
  })
  it('volta também entra (trechos dirigidos)', () => {
    const back = { enabled: true, mode: 'reverse', departTime: '09:00', route: { provider: 'manual', legs: [{ distanceKm: 25, durationMin: 30 }, { distanceKm: 3, durationMin: 10 }], key: pointsKey([P.pac, P.dani, P.casa]) } }
    const rv = dayReview(race({ 'v-sair': '09:10', 'v-chegar-0': '09:45', 'v-sair-0': '09:50', 'v-chegar-casa': '10:01' }, back))
    expect(rv.volta.departDelay).toBe(10)
    expect(rv.volta.legs.map((l) => [l.planned, l.actual])).toEqual([[30, 35], [10, 11]])
    expect(rv.volta.arriveHome).toEqual({ planned: 585, actual: 601 })
  })
})
