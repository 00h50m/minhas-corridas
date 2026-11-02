import { formatDuration, formatKm, formatPace } from '../lib/format.js'

/** Resumo do arquivo do relógio: números principais e parciais por km. */
export default function WatchSummary({ watch: w, officialKm }) {
  const full = w.splits.filter((s) => !s.partial)
  const secs = full.map((s) => s.sec)
  const best = secs.length ? Math.min(...secs) : null
  const worst = secs.length ? Math.max(...secs) : null
  const span = Math.max((worst ?? 0) - (best ?? 0), 1)
  // Destaca só o primeiro km mais rápido e o primeiro mais lento (empates não poluem a tabela).
  const bestKm = best !== worst ? full.find((s) => s.sec === best)?.km : null
  const worstKm = best !== worst ? full.find((s) => s.sec === worst)?.km : null
  const diff = officialKm ? Math.round((w.distanceKm - officialKm) * 1000) : null
  return (
    <div className="watch">
      <dl className="kv">
        <dt>Distância no relógio</dt>
        <dd>
          {formatKm(w.distanceKm)}
          {diff != null && Math.abs(diff) >= 10 && <span className="muted small"> ({diff > 0 ? '+' : ''}{diff} m da oficial)</span>}
        </dd>
        <dt>Tempo no relógio</dt>
        <dd>{formatDuration(w.elapsedSec)} · {formatPace(w.elapsedSec / w.distanceKm)}</dd>
        {w.avgHr && (<><dt>Frequência cardíaca</dt><dd>média {w.avgHr} · máx. {w.maxHr} bpm</dd></>)}
        {w.elevGainM != null && (<><dt>Subida acumulada</dt><dd>{w.elevGainM} m</dd></>)}
      </dl>
      {w.splits.length > 0 && (
        <table className="splits">
          <caption className="sr-only">Parciais por quilômetro</caption>
          <thead><tr><th scope="col">Km</th><th scope="col">Tempo</th><th scope="col" aria-label="Comparação">&nbsp;</th></tr></thead>
          <tbody>
            {w.splits.map((s) => {
              const pace = s.partial ? s.sec / (s.partial / 1000) : s.sec
              const tag = !s.partial && secs.length > 2 ? (s.km === bestKm ? 'mais rápido' : s.km === worstKm ? 'mais lento' : '') : ''
              return (
                <tr key={s.km} className={tag === 'mais rápido' ? 'fast' : tag === 'mais lento' ? 'slow' : ''}>
                  <th scope="row">{s.partial ? `+${s.partial} m` : formatKm(s.km, { unit: false })}</th>
                  <td>{formatDuration(s.sec)}{s.partial && <span className="muted small"> ({formatPace(pace)})</span>}{tag && <span className="split-tag"> · {tag}</span>}</td>
                  <td className="bar-cell" aria-hidden="true">{!s.partial && <span style={{ width: `${30 + 70 * (1 - (s.sec - best) / span)}%` }} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="note">Dados do arquivo {w.fileName ? `“${w.fileName}”` : ''} ({w.source.toUpperCase()}). Recordes e pace oficial continuam usando a distância oficial e o tempo líquido.</p>
    </div>
  )
}
