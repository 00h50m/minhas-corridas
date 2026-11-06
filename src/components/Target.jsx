// Meta de tempo: definir antes da prova e comparar com o resultado depois.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getRace, saveRace } from '../services/store.js'
import { useUI } from './ui.jsx'
import TimeInput from './TimeInput.jsx'
import { PredictionHint } from './Prediction.jsx'
import { compareToTarget } from '../lib/targetCompare.js'
import { formatDiff } from '../lib/compare.js'
import { formatDuration, formatKm, formatPace, parseDuration } from '../lib/format.js'

/** Campo rápido para definir (ou trocar) a meta direto no detalhe da prova. */
export function TargetQuickSet({ race, races, onDone }) {
  const { notify } = useUI()
  const [value, setValue] = useState(race.targetTime ? formatDuration(race.targetTime) : '')
  const [error, setError] = useState(null)
  const save = (sec) => {
    const fresh = getRace(race.id)
    if (!fresh) return
    saveRace({ ...fresh, targetTime: sec })
    notify(sec ? 'Meta definida' : 'Meta removida')
    onDone?.()
  }
  const onSubmit = (e) => {
    e.preventDefault()
    if (!value.trim()) return setError('Digite o tempo. Só números: 5500 = 55:00 · 15500 = 1:55:00.')
    const sec = parseDuration(value)
    if (sec == null) return setError('Tempo inválido. Só números: 5500 = 55:00 · 15500 = 1:55:00.')
    setError(null)
    save(sec)
  }
  return (
    <form className="target-set" onSubmit={onSubmit} noValidate data-testid="target-set">
      <label htmlFor={`target-${race.id}`} className="lbl">Meta de tempo{race.distanceKm ? ` para ${formatKm(race.distanceKm)}` : ''}</label>
      <div className="grid-2-1">
        <div><TimeInput id={`target-${race.id}`} value={value} onChange={(v) => { setValue(v); setError(null) }} invalid={!!error} /></div>
        <button type="submit" className="btn btn-dark">{race.targetTime ? 'Salvar' : 'Definir meta'}</button>
      </div>
      {error && <div className="err" role="alert">{error}</div>}
      {value && parseDuration(value) && race.distanceKm && <div className="hint">Pace: {formatPace(parseDuration(value) / race.distanceKm)}</div>}
      {race.distanceKm && <PredictionHint races={races} km={race.distanceKm} excludeId={race.id} onUse={(t) => { setValue(formatDuration(t)); setError(null) }} />}
      {race.targetTime && <button type="button" className="link-btn" onClick={() => save(null)}>Remover meta</button>}
    </form>
  )
}

const tone = (d) => (d == null ? 'muted' : Math.round(d) <= 0 ? 'delta-good' : 'delta-bad')
const STATUS = { batida: 'Meta batida', perto: 'Quase lá', acima: 'Acima da meta' }

/** Meta x realizado, depois da prova. */
export function TargetCompareCard({ race }) {
  const c = compareToTarget(race)
  if (!c) return null
  const km = race.result.officialDistanceKm
  const maxAbs = Math.max(1, ...c.checkpoints.map((x) => Math.abs(x.diff ?? 0)))
  const seg = (s) => (s.from === 0 ? `até o km ${formatKm(s.to, { unit: false })}` : `do km ${formatKm(s.from, { unit: false })} ao ${formatKm(s.to, { unit: false })}`)
  return (
    <div className={`card target-cmp st-${c.status}`} data-testid="target-compare">
      <div className="tc-head">
        <span className={`flag ${c.status === 'batida' ? 'flag-ok' : 'flag-warn'}`}>{STATUS[c.status]}</span>
        <span className={tone(c.diff)} style={{ fontWeight: 800 }}>{c.diff === 0 ? 'no tempo exato' : `${formatDiff(c.diff)} ${c.diff < 0 ? 'abaixo' : 'acima'}`}</span>
      </div>
      <div className="big-numbers" style={{ marginTop: 12 }}>
        <div><div className="v">{formatDuration(c.target)}</div><div className="l">meta</div></div>
        <div><div className="v">{formatDuration(c.net)}</div><div className="l">feito</div></div>
        <div><div className={`v ${tone(c.diff)}`}>{formatDiff(c.diff)}</div><div className="l">diferença</div></div>
      </div>
      <p className="small" style={{ margin: '12px 0 0' }}>
        Pace planejado <b>{formatPace(c.plannedPace)}</b>, feito <b>{formatPace(c.realPace)}</b> ({formatDiff(c.paceDiff)}/km).
      </p>
      {c.halves && (
        <p className="small" style={{ margin: '6px 0 0' }}>
          <b>Metade ({formatKm(km / 2)}):</b> 1ª em {formatDuration(c.halves.first)} (<span className={tone(c.halves.firstDiff)}>{formatDiff(c.halves.firstDiff)}</span>), 2ª em {formatDuration(c.halves.second)} (<span className={tone(c.halves.secondDiff)}>{formatDiff(c.halves.secondDiff)}</span>) — o plano era {formatDuration(c.halves.plannedEach)} cada.
        </p>
      )}
      {c.worst && <p className="small" style={{ margin: '6px 0 0' }}>Onde mais perdeu tempo: <b>{seg(c.worst)}</b> (<span className="delta-bad">{formatDiff(c.worst.delta)}</span>).</p>}
      {c.best && <p className="small" style={{ margin: '6px 0 0' }}>Onde mais ganhou: <b>{seg(c.best)}</b> (<span className="delta-good">{formatDiff(c.best.delta)}</span>).</p>}

      <table className="tc-table" data-testid="target-table">
        <thead><tr><th scope="col">Passagem</th><th scope="col">Plano</th><th scope="col">Real</th><th scope="col">Diferença</th></tr></thead>
        <tbody>
          {c.checkpoints.map((x) => (
            <tr key={x.km} className={x.half ? 'half' : x.end ? 'end' : ''}>
              <th scope="row">{x.end ? 'Chegada' : x.half ? `Metade (${formatKm(x.km, { unit: false })})` : `km ${formatKm(x.km, { unit: false })}`}</th>
              <td>{formatDuration(x.planned)}</td>
              <td>{x.actual == null ? '—' : formatDuration(x.actual)}</td>
              <td className="bar-cell">
                {x.diff != null && (
                  <>
                    <span className="dbar" aria-hidden="true"><span className={x.diff <= 0 ? 'g' : 'l'} style={{ width: `${(Math.abs(x.diff) / maxAbs) * 50}%` }} /></span>
                    <span className={tone(x.diff)}>{formatDiff(x.diff)}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        {c.hasSplits
          ? 'Passagens reais pelas parciais do relógio, ajustadas à distância oficial e ao tempo líquido. Verde: à frente do plano; laranja: atrás.'
          : <>Sem parciais do relógio, só dá para comparar a chegada. <Link to={`/corridas/${race.id}/resultado`}>Anexe o arquivo do relógio</Link> para ver as passagens e a metade.</>}
      </p>
    </div>
  )
}
