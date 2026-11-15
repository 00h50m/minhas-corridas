// Como foi a logística do dia: planejado × marcado e sugestões para as próximas provas.
import { useState } from 'react'
import { getProfile, saveProfile, useProfile } from '../services/profile.js'
import { useUI } from './ui.jsx'
import { dayReview, diffText } from '../lib/dayReview.js'
import { minToHm, normalizePrep } from '../lib/schedule.js'

const hm = (m) => (m == null ? '—' : minToHm(m, { withDay: false }))
const tone = (d) => (d == null || Math.abs(d) <= 1 ? '' : d > 0 ? 'late' : 'early')

export default function LogisticsReview({ race }) {
  const prof = useProfile()
  const { notify } = useUI()
  const [applied, setApplied] = useState({})
  const rv = dayReview(race, prof.data.prep)
  if (!rv) return null
  const favs = prof.data.favorites
  const apply = (s) => {
    const data = getProfile().data
    if (s.apply.prep) saveProfile({ ...data, prep: normalizePrep({ ...data.prep, ...s.apply.prep }) })
    if (s.apply.dwell) saveProfile({ ...data, favorites: data.favorites.map((f) => (f.address === s.apply.dwell.address ? { ...f, dwellMin: s.apply.dwell.min } : f)) })
    setApplied((a) => ({ ...a, [s.id]: true }))
    notify('Ajuste salvo para as próximas provas')
  }
  // Sugestão de tempo de parada só vale se o lugar estiver salvo (Pessoas e lugares).
  const suggestions = rv.suggestions.filter((s) => !s.apply.dwell || favs.some((f) => f.address === s.apply.dwell.address))
  const i = rv.ida
  return (
    <div className="card logi-review" data-testid="logi-review">
      {i && (
        <>
          <div className="lr-head">
            <div><div className="l">Saída de casa</div><div className={`v ${tone(i.departDelay)}`}>{diffText(i.departDelay)}</div></div>
            <div><div className="l">Chegada ao local</div><div className={`v ${i.arrival.late > 0 ? 'late' : ''}`}>{i.arrival.actual == null ? '—' : i.arrival.late > 0 ? `${i.arrival.late} min além da margem` : 'dentro da margem'}</div></div>
            {i.driving && <div><div className="l">Dirigindo</div><div className={`v ${tone(i.driving.actual - i.driving.planned)}`}>{i.driving.actual} min <span className="muted small">/ {i.driving.planned}</span></div></div>}
          </div>
          <ReviewTable title="Ida" legs={i.legs} dwells={i.dwells} />
        </>
      )}
      {rv.volta && <ReviewTable title="Volta" legs={rv.volta.legs} dwells={rv.volta.dwells} />}
      {suggestions.length > 0 ? (
        <div className="lr-sug">
          <div className="list-group-title">Para a próxima prova</div>
          {suggestions.map((s) => (
            <div key={s.id} className="lr-s small" data-testid="lr-suggestion">
              <span>{s.text}</span>
              {applied[s.id] ? <span className="delta-good">✓ aplicado</span> : <button type="button" className="btn btn-sm" onClick={() => apply(s)}>Aplicar</button>}
            </div>
          ))}
          <p className="note">Os ajustes valem para as próximas provas (perfil); esta prova fica como foi.</p>
        </div>
      ) : (
        <p className="small" style={{ marginBottom: 0 }} data-testid="lr-ok">✓ O plano funcionou: nada a ajustar para a próxima.</p>
      )}
    </div>
  )
}

function ReviewTable({ title, legs, dwells }) {
  const rows = []
  legs.forEach((l) => {
    rows.push({ k: l.from.key, what: `${l.from.label.replace(/^Sair( de|:) /, '')} → ${l.to.label.replace(/^Chegar(: | a | em )/, '')}`, ...l })
    const d = dwells.find((x) => x.from.key === l.to.key)
    if (d) rows.push({ k: d.from.key, what: `Parada: ${d.label}`, ...d, dwell: true })
  })
  if (!rows.some((r) => r.actual != null)) return null
  return (
    <>
      <div className="list-group-title">{title}</div>
      <table className="lr-table">
        <thead><tr><th>Trecho</th><th>Plano</th><th>Real</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={r.dwell ? 'dw' : ''}>
              <td>{r.what}<div className="muted">{hm(r.from.at)} → {hm(r.to.at)}</div></td>
              <td>{r.planned} min</td>
              <td>{r.actual == null ? '—' : `${r.actual} min`}</td>
              <td className={tone(r.diff)}>{r.actual == null ? '' : diffText(r.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
