// Como você chega ao treino: sono, body battery e FC de repouso do Garmin e, se ativado, o dia do ciclo
// com o que você registrou. Informativo: não muda o treino.
import { useWellness } from '../lib/wellnessStore.js'
import { readiness } from '../lib/readiness.js'
import { useCycle } from '../services/cycle.js'
import { SYMPTOMS, dayOfCycle, isPeriodDay } from '../lib/cycle.js'
import { todayISO } from '../lib/dates.js'

const ICON = { bom: '🟢', ok: '⚪', atencao: '🟡', cansaco: '🟠' }
const SYM = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.label.toLowerCase()]))

/** Linha do ciclo para a data: "dia 2 do ciclo (menstruação) · cólica · energia 2/5". */
function cycleInfo(c, date) {
  if (!c?.enabled) return null
  const n = dayOfCycle(c, date)
  const log = c.days[date]
  if (!n && !log) return null
  const parts = [
    n && `dia ${n} do ciclo${isPeriodDay(c, date, todayISO()) ? ' (menstruação)' : ''}`,
    ...(log?.symptoms ?? []).map((s) => SYM[s]),
    log?.energy && `energia ${log.energy}/5`
  ].filter(Boolean)
  const low = (log?.energy && log.energy <= 2) || log?.symptoms?.includes('colica') || log?.flow === 3
  return { line: parts.join(' · '), low }
}

/** past: treino que já passou ("Na manhã deste treino…"). */
export default function Readiness({ date, past = false, style }) {
  const w = useWellness()
  const c = useCycle()
  const r = w?.days ? readiness(w.days, date) : null
  const cy = cycleInfo(c, date)
  if ((!r || !r.parts.length) && !cy) return null
  const level = r?.parts.length ? (cy?.low && r.level === 'bom' ? 'atencao' : r.level) : cy.low ? 'atencao' : 'ok'
  return (
    <div className={`readiness rd-${level}`} style={style} data-testid="readiness">
      <div className="rd-head"><span aria-hidden="true">{ICON[level]}</span> <b>{past ? 'Na manhã deste treino' : 'Como você chega hoje'}</b></div>
      {r?.parts.length > 0 && <div className="small">{r.parts.join(' · ')}</div>}
      {cy && <div className="small" data-testid="readiness-cycle">🌸 {cy.line}</div>}
      {!past && r?.parts.length > 0 && <div className="small rd-text">{r.text}</div>}
      {!past && cy?.low && (!r || r.level === 'bom' || r.level === 'ok') && <div className="small rd-text">Você registrou um dia mais difícil: se sentir, ir mais leve é uma opção.</div>}
      {past && r?.signals.length > 0 && <div className="small rd-text">{r.signals.join(' · ')}</div>}
    </div>
  )
}
