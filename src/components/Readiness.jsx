// Como você chega ao treino (sono, body battery e FC de repouso do Garmin). Só aparece com o Garmin
// conectado e com dados do dia. Informativo: não muda o treino.
import { useWellness } from '../lib/wellnessStore.js'
import { readiness } from '../lib/readiness.js'

const ICON = { bom: '🟢', ok: '⚪', atencao: '🟡', cansaco: '🟠' }

/** past: treino que já passou ("Na manhã deste treino…"). */
export default function Readiness({ date, past = false, style }) {
  const w = useWellness()
  const r = w?.days ? readiness(w.days, date) : null
  if (!r || !r.parts.length) return null
  return (
    <div className={`readiness rd-${r.level}`} style={style} data-testid="readiness">
      <div className="rd-head"><span aria-hidden="true">{ICON[r.level]}</span> <b>{past ? 'Na manhã deste treino' : 'Como você chega hoje'}</b></div>
      <div className="small">{r.parts.join(' · ')}</div>
      {!past && <div className="small rd-text">{r.text}</div>}
      {past && r.signals.length > 0 && <div className="small rd-text">{r.signals.join(' · ')}</div>}
    </div>
  )
}
