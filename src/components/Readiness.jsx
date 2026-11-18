// Como você chega ao treino: sono, body battery e FC de repouso do Garmin e, se ativado, o dia do ciclo
// com o que você registrou. Informativo: não muda o treino.
import { useWellness } from '../lib/wellnessStore.js'
import { readiness } from '../lib/readiness.js'
import { useCycle } from '../services/cycle.js'
import { SYMPTOMS, dayOfCycle, isPeriodDay } from '../lib/cycle.js'
import { todayISO } from '../lib/dates.js'
import { IconDrop, IconMoon } from './Icons.jsx'

const PILL = { bom: ['ok', 'Boa recuperação'], ok: ['neutral', 'No seu normal'], atencao: ['warn', 'Atenção'], cansaco: ['danger', 'Sinais de cansaço'] }
const SYM = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.label.toLowerCase()]))

/** Linha do ciclo para a data: "dia 2 do ciclo (menstruação) · cólica · energia 2/5". */
function cycleInfo(c, date) {
  if (!c?.enabled) return null
  const n = dayOfCycle(c, date)
  const log = c.days[date]
  if (!n && !log) return null
  const parts = [
    n && `Dia ${n} do ciclo${isPeriodDay(c, date, todayISO()) ? ' (menstruação)' : ''}`,
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
  const hasW = r?.parts.length > 0
  if (!hasW && !cy) return null
  const level = hasW ? (cy?.low && r.level === 'bom' ? 'atencao' : r.level) : cy.low ? 'atencao' : 'ok'
  const [tone, label] = PILL[level]
  const text = !past && hasW ? r.text : !past && cy?.low ? 'Você registrou um dia mais difícil: se sentir, ir mais leve é uma opção.' : null
  return (
    <div className={`card readiness rd-${level}`} style={style} data-testid="readiness">
      <div className="rd-head">
        <IconMoon />
        <b>{past ? 'Na manhã deste treino' : 'Como você chega hoje'}</b>
        {!past && <span className={`pill pill-${tone}`}>{label}</span>}
      </div>
      {hasW && <div className="small rd-line">{r.parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' · ')}</div>}
      {cy && <div className="small rd-line" data-testid="readiness-cycle"><IconDrop /> {cy.line}</div>}
      {text && <div className="small rd-text">{text}{hasW && cy?.low && r.level !== 'cansaco' && r.level !== 'atencao' ? ' Você registrou um dia mais difícil.' : ''}</div>}
      {past && r?.signals.length > 0 && <div className="small rd-text">{r.signals.join(' · ')}</div>}
    </div>
  )
}
