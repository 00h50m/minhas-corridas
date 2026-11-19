// Clima na largada (e no fim previsto), com dicas de roupa, hidratação e ritmo.
import { useEffect, useState } from 'react'
import { raceWeather } from '../services/weather.js'
import { weatherLabel } from '../lib/weather.js'
import { IconDrop } from './Icons.jsx'
import { destinationPlace } from '../lib/logistics.js'

const t = (x) => (x == null ? '—' : `${Math.round(x)}°`)

export default function WeatherCard({ race }) {
  const [w, setW] = useState(null)
  const dest = race.logistics ? destinationPlace(race, race.logistics) : null
  const load = (force = false) => raceWeather(race, dest, { force }).then(setW)
  useEffect(() => { load() }, [race.id, race.date, race.startTime, dest?.lat, race.city])
  if (!w) return <div className="card weather muted small" data-testid="weather">Buscando a previsão…</div>
  if (!w.ok) {
    const tech = /fetch|network|typeerror|load failed|json/i.test(String(w.error ?? ''))
    return (
      <div className="card weather muted small" data-testid="weather">
        {tech ? 'Sem conexão para buscar a previsão agora.' : w.error}{' '}
        <button type="button" className="link-btn" onClick={() => { setW(null); load(true) }}>Tentar de novo</button>
      </div>
    )
  }
  const { start, end, tips } = w.data
  const lb = weatherLabel(start.code)
  const when = new Date(w.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="card weather" data-testid="weather">
      <div className="wx-top">
        <span className="wx-icon" aria-hidden="true">{lb.icon}</span>
        <div className="wx-main">
          <div className="wx-temp">{t(start.temp)} <span className="muted small">sensação {t(start.feels)}</span></div>
          <div className="small">{lb.text} na largada ({String(start.hour).padStart(2, '0')}h){end.hour !== start.hour ? ` · ${t(end.temp)} às ${String(end.hour).padStart(2, '0')}h` : ''}</div>
        </div>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {start.rainProb != null && <span className="chip"><IconDrop /> chuva {Math.max(start.rainProb, end.rainProb ?? 0)}%</span>}
        {start.wind != null && <span className="chip">vento {Math.round(start.wind)} km/h</span>}
        {start.humidity != null && <span className="chip">umidade {Math.round(start.humidity)}%</span>}
      </div>
      {tips.length > 0 && <ul className="wx-tips small">{tips.map((x) => <li key={x}>{x}</li>)}</ul>}
      <p className="note" style={{ marginBottom: 0 }}>
        Previsão Open-Meteo para {w.place.label} ({w.place.source === 'logistica' ? 'local da Logística' : 'cidade'}), de {when}{w.stale ? ' — sem conexão, mostrando a última' : ''}. Pode mudar até a largada.{' '}
        <button type="button" className="link-btn" onClick={() => { setW(null); load(true) }}>Atualizar</button>
      </p>
    </div>
  )
}
