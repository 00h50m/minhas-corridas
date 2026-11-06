// Previsão de tempo pelas provas registradas (Riegel), com botão para usar como meta.
import { Link } from 'react-router-dom'
import { predictTime, roundTarget } from '../lib/predict.js'
import { formatDuration, formatKm, formatPace } from '../lib/format.js'
import { formatDateBR } from '../lib/dates.js'

const QUALITY = { mesma: 'mesma distância', boa: 'distância próxima', aproximada: 'distância bem diferente — só uma ideia' }

/** Linha curta para formulários. */
export function PredictionHint({ races, km, excludeId, onUse }) {
  const p = predictTime(races, km, undefined, { excludeId })
  if (!p) return null
  const s = p.sources[0]
  const target = roundTarget(p.estimate)
  return (
    <div className="predict-hint" data-testid="predict-hint">
      <span>
        Pelas suas provas: <b>~{formatDuration(p.estimate)}</b> ({formatPace(p.estimate / km)})
        <span className="muted"> · base: {s.race.name}, {formatKm(s.km)} em {formatDuration(s.time)}</span>
      </span>
      {onUse && <button type="button" className="link-btn" onClick={() => onUse(target)}>Usar {formatDuration(target)}</button>}
    </div>
  )
}

/** Cartão completo (detalhe de uma prova sem meta). */
export function PredictionCard({ races, km, excludeId, onUse }) {
  const p = predictTime(races, km, undefined, { excludeId })
  if (!p) {
    return (
      <div className="card muted small">
        Ainda não há provas concluídas de 3 km ou mais nos últimos 2 anos em distância próxima de {formatKm(km)} para estimar um tempo. <Link to="/historico">Ver histórico</Link>
      </div>
    )
  }
  const target = roundTarget(p.estimate)
  return (
    <div className="card" data-testid="predict-card">
      <div className="plan-head">
        <div><div className="v">{formatDuration(p.estimate)}</div><div className="l">tempo estimado</div></div>
        <div><div className="v">{formatPace(p.estimate / km)}</div><div className="l">pace</div></div>
      </div>
      {p.high - p.low >= 30 && <p className="small" style={{ margin: '10px 0 0' }}>Faixa pelas suas provas: {formatDuration(p.low)} a {formatDuration(p.high)}.</p>}
      <ul className="plain-list" style={{ marginTop: 8 }}>
        {p.sources.map((s) => (
          <li key={s.race.id}>
            <span>{s.race.name}<span className="muted small"> · {formatDateBR(s.race.date)} · {formatKm(s.km)} em {formatDuration(s.time)}{s.isOfficial ? '' : ' (pessoal)'}</span></span>
            <span className="right small">{formatDuration(s.predicted)}</span>
          </li>
        ))}
      </ul>
      {onUse && <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 12 }} onClick={() => onUse(target)}>Usar {formatDuration(target)} como meta</button>}
      <p className="note">Estimativa pela fórmula de Riegel a partir de provas dos últimos 2 anos ({QUALITY[p.quality]}). Percurso, calor e treino mudam o resultado; não é plano de treino.</p>
    </div>
  )
}
