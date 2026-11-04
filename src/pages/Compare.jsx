// Comparar duas provas concluídas, km a km (parciais do relógio).
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { EmptyState, TopBar } from '../components/ui.jsx'
import { compareRaces, comparableRaces, formatDiff, hasSplits } from '../lib/compare.js'
import { formatDuration, formatKm, formatPace } from '../lib/format.js'
import { formatDateBR } from '../lib/dates.js'
import { history } from '../lib/stats.js'

const tone = (d) => (Math.round(d) < 0 ? 'delta-good' : Math.round(d) > 0 ? 'delta-bad' : 'muted')

function RacePicker({ id, value, options, onChange, label }) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Escolha uma prova</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · {formatDateBR(r.date)} · {formatKm(r.result.officialDistanceKm)}{hasSplits(r) ? '' : ' (sem parciais)'}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function Compare() {
  const { races } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const done = history(races)
  const aId = params.get('a')
  const bId = params.get('b')
  const ra = done.find((r) => r.id === aId) ?? null
  const rb = done.find((r) => r.id === bId) ?? null
  const set = (k, v) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const optsB = useMemo(() => (ra ? comparableRaces(races, ra) : done), [races, ra])
  const optsA = useMemo(() => (rb ? comparableRaces(races, rb) : done), [races, rb])
  const c = ra && rb ? compareRaces(ra, rb) : null

  if (done.length < 2) {
    return (
      <>
        <TopBar title="Comparar provas" back="/historico" />
        <div className="page">
          <EmptyState title="Precisa de duas provas" text="Registre o resultado de pelo menos duas provas (de preferência com o arquivo do relógio) para comparar km a km." action={<Link to="/historico" className="btn btn-dark btn-block">Ver histórico</Link>} />
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Comparar provas" back="/historico" />
      <div className="page">
        <div className="card cmp-pickers">
          <RacePicker id="cmp-a" label="Prova 1" value={aId} options={optsA} onChange={(v) => set('a', v)} />
          <RacePicker id="cmp-b" label="Prova 2" value={bId} options={optsB.filter((r) => r.id !== aId)} onChange={(v) => set('b', v)} />
          {ra && rb && <button className="link-btn" onClick={() => nav(`/comparar?a=${bId}&b=${aId}`, { replace: true })}>Trocar a ordem</button>}
        </div>
        {c ? <Result c={c} /> : <p className="note">Escolha duas provas concluídas. As de mesma distância e com parciais do relógio aparecem primeiro.</p>}
      </div>
    </>
  )
}

function Result({ c }) {
  const { a, b } = c
  const maxAbs = Math.max(1, ...c.rows.map((r) => Math.abs(r.diff)))
  const nameA = a.race.name
  const nameB = b.race.name
  const short = (s) => (s.length > 22 ? s.slice(0, 21) + '…' : s)
  const lines = []
  if (c.sameDistance) {
    lines.push(
      c.totalDiff === 0
        ? 'Mesmo tempo líquido nas duas provas.'
        : `${short(nameB)} foi ${formatDuration(Math.abs(c.totalDiff))} ${c.totalDiff < 0 ? 'mais rápida' : 'mais lenta'} que ${short(nameA)} (${formatDiff(c.paceDiff)}/km no pace).`
    )
  } else {
    lines.push(`Distâncias diferentes (${formatKm(a.km)} e ${formatKm(b.km)}): o tempo total não se compara; veja o pace e os km em comum.`)
  }
  if (c.common >= 2) {
    lines.push(`Nos ${c.common} km em comum: ${c.faster} ${c.faster === 1 ? 'km mais rápido' : 'km mais rápidos'} e ${c.slower} ${c.slower === 1 ? 'mais lento' : 'mais lentos'} na prova 2 (${formatDiff(c.splitDiff)} no acumulado).`)
    if (c.biggestGain) lines.push(`Maior ganho: km ${c.biggestGain.km} (${formatDiff(c.biggestGain.diff)}).`)
    if (c.biggestLoss) lines.push(`Maior perda: km ${c.biggestLoss.km} (${formatDiff(c.biggestLoss.diff)}).`)
    if (c.halves && c.halves.size >= 2) {
      const { first, second } = c.halves
      if (first < 0 && second >= 0) lines.push('O ganho veio do começo; no fim, o ritmo ficou igual ou pior.')
      else if (second < 0 && first >= 0) lines.push('O ganho veio da segunda metade: final mais forte.')
      else if (first < 0 && second < 0) lines.push('Mais rápida nas duas metades.')
    }
  }

  return (
    <>
      <div className="card" style={{ marginTop: 12 }}>
        <table className="cmp-table">
          <thead>
            <tr><th scope="col"></th><th scope="col" title={nameA}>1 · {formatDateBR(a.race.date).slice(0, 6) + a.race.date.slice(2, 4)}</th><th scope="col" title={nameB}>2 · {formatDateBR(b.race.date).slice(0, 6) + b.race.date.slice(2, 4)}</th><th scope="col">Diferença</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Distância</th><td>{formatKm(a.km, { unit: false })}</td><td>{formatKm(b.km, { unit: false })}</td><td className="muted">km</td></tr>
            <tr><th scope="row">Tempo líquido</th><td>{formatDuration(a.net)}</td><td>{formatDuration(b.net)}</td><td className={c.sameDistance ? tone(c.totalDiff) : 'muted'}>{c.sameDistance ? formatDiff(c.totalDiff) : '—'}</td></tr>
            <tr><th scope="row">Pace</th><td>{formatPace(a.pace).replace(' /km', '')}</td><td>{formatPace(b.pace).replace(' /km', '')}</td><td className={tone(c.paceDiff)}>{formatDiff(c.paceDiff)}</td></tr>
            {(a.avgHr || b.avgHr) && <tr><th scope="row">FC média</th><td>{a.avgHr ?? '—'}</td><td>{b.avgHr ?? '—'}</td><td className="muted">{a.avgHr && b.avgHr ? (b.avgHr === a.avgHr ? 'igual' : `${b.avgHr > a.avgHr ? '+' : '−'}${Math.abs(b.avgHr - a.avgHr)} bpm`) : ''}</td></tr>}
            {(a.elev != null || b.elev != null) && <tr><th scope="row">Subida</th><td>{a.elev != null ? `${a.elev} m` : '—'}</td><td>{b.elev != null ? `${b.elev} m` : '—'}</td><td></td></tr>}
            {(a.effort || b.effort) && <tr><th scope="row">Esforço</th><td>{a.effort ? `${a.effort}/10` : '—'}</td><td>{b.effort ? `${b.effort}/10` : '—'}</td><td></td></tr>}
          </tbody>
        </table>
        <div className="cmp-legend small">
          <div><b>1</b> {nameA}</div>
          <div><b>2</b> {nameB}</div>
        </div>
        {(!a.isOfficial || !b.isOfficial) && <p className="note">Inclui registro pessoal (sem resultado oficial).</p>}
      </div>

      <div className="card analysis" style={{ marginTop: 12 }}>
        <ul>{lines.map((l, i) => <li key={i} className="an-info"><div><p style={{ margin: 0 }}>{l}</p></div></li>)}</ul>
      </div>

      <div className="section-title"><h2>Km a km</h2></div>
      {c.common >= 2 ? (
        <div className="card">
          <table className="kmcmp" data-testid="km-table">
            <thead>
              <tr><th scope="col">km</th><th scope="col">1</th><th scope="col">2</th><th scope="col" className="bar-h">Diferença</th><th scope="col">Acum.</th></tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.km}>
                  <th scope="row">{r.km}</th>
                  <td>{formatDuration(r.a)}</td>
                  <td>{formatDuration(r.b)}</td>
                  <td className="bar-cell">
                    <span className="dbar" aria-hidden="true">
                      <span className={r.diff < 0 ? 'g' : 'l'} style={{ width: `${(Math.abs(r.diff) / maxAbs) * 50}%` }} />
                    </span>
                    <span className={tone(r.diff)}>{formatDiff(r.diff)}</span>
                  </td>
                  <td className={tone(r.cumDiff)}>{formatDiff(r.cumDiff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Diferença = prova 2 − prova 1. Verde: mais rápida; laranja: mais lenta. Parciais pelo GPS do relógio; o último trecho incompleto fica de fora.</p>
        </div>
      ) : (
        <div className="card muted small">
          {!hasSplits(a.race) && !hasSplits(b.race) ? 'Nenhuma das duas provas tem parciais por km.' : `A prova “${hasSplits(a.race) ? nameB : nameA}” não tem parciais por km.`}{' '}
          Anexe o arquivo do relógio (FIT, ZIP do Garmin, TCX ou GPX) no resultado:{' '}
          {!hasSplits(a.race) && <Link to={`/corridas/${a.race.id}/resultado`}>{short(nameA)}</Link>}
          {!hasSplits(a.race) && !hasSplits(b.race) && ' · '}
          {!hasSplits(b.race) && <Link to={`/corridas/${b.race.id}/resultado`}>{short(nameB)}</Link>}
        </div>
      )}
    </>
  )
}
