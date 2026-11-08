// Resumo da logística no detalhe da prova.
import { Link } from 'react-router-dom'
import { useProfile } from '../services/profile.js'
import { costItems, raceSchedule, transportTotals, tripSummary } from '../lib/logistics.js'
import { minToHm } from '../lib/schedule.js'
import { formatKm, formatMoney } from '../lib/format.js'
import { IconPin } from './Icons.jsx'

export default function LogisticsSummary({ race: r }) {
  const prof = useProfile()
  const log = r.logistics
  if (!log) {
    return (
      <Link to={`/corridas/${r.id}/logistica`} className="card decide-link" data-testid="logistics-cta">
        <IconPin />
        <span style={{ flex: 1, minWidth: 0 }}><b>Planejar como chegar</b><br /><span className="muted small">Rota com paradas, custo do deslocamento e a hora de acordar e sair de casa.</span></span>
        <span aria-hidden="true">›</span>
      </Link>
    )
  }
  const ida = tripSummary(r, log, 'ida')
  const s = raceSchedule(r, prof.data.prep)
  const t = transportTotals(costItems(r, log))
  return (
    <Link to={`/corridas/${r.id}/logistica`} className="card logi-summary" data-testid="logistics-summary">
      {s && log.prep ? (
        <div className="ls-times">
          <div><span>Acordar</span><b>{minToHm(s.wake, { withDay: false })}</b></div>
          <div><span>Sair</span><b>{minToHm(s.depart, { withDay: false })}</b></div>
          <div><span>Chegar</span><b>{minToHm(s.arrivalPlanned, { withDay: false })}</b></div>
        </div>
      ) : (
        <div className="small muted">{ida.complete ? 'Gere a agenda para ver a hora de acordar e sair.' : 'Falta a rota da ida.'}</div>
      )}
      <div className="ls-foot small">
        <span>{ida.complete ? `${formatKm(ida.distanceKm)} · ${ida.trafficMin ?? ida.durationMin} min${log.outbound.stops.length ? ` · ${log.outbound.stops.length} ${log.outbound.stops.length === 1 ? 'parada' : 'paradas'}` : ''}` : `${log.outbound.stops.length} ${log.outbound.stops.length === 1 ? 'parada' : 'paradas'}`}</span>
        {t.any && <span>Deslocamento {formatMoney(t.total)}</span>}
        <span className="ls-go">Abrir ›</span>
      </div>
    </Link>
  )
}
