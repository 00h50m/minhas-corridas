import { Link } from 'react-router-dom'
import { analyzeRace, formatDeltaPace, goalPlan, paceTable } from '../lib/analysis.js'
import { formatDuration, formatKm, formatPace } from '../lib/format.js'
import { formatDateBR } from '../lib/dates.js'
import { IconCheck, IconInfo, IconAlert } from './Icons.jsx'

const ICON = { ok: IconCheck, warn: IconAlert, info: IconInfo }

export function RaceAnalysis({ race, races, goals }) {
  const a = analyzeRace(race, races, goals)
  if (!a) return null
  return (
    <div className="card analysis">
      <ul>
        {a.items.map((it, i) => {
          const Icon = ICON[it.tone]
          return (
            <li key={i} className={`an-${it.tone}`}>
              <span className="an-ic"><Icon /></span>
              <div>
                <b>{it.title}</b>
                <p>{it.text}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="note">Leitura feita com os dados registrados (tempo, meta, parciais do relógio e esforço). Não é avaliação técnica nem plano de treino.</p>
    </div>
  )
}

export function PaceTable({ targetSec, km, caption }) {
  const rows = paceTable(targetSec, km)
  if (!rows.length) return null
  return (
    <table className="pace-table">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">Passagem</th><th scope="col">Tempo</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.km} className={r.km === km ? 'final' : r.half ? 'half' : ''}>
            <th scope="row">{r.km === km ? `Chegada (${formatKm(km)})` : r.half ? `Metade (${formatKm(r.km)})` : `km ${formatKm(r.km, { unit: false })}`}</th>
            <td>{formatDuration(r.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Plano de prova: pace e passagens para a meta de uma prova futura. */
export function RacePlan({ race }) {
  if (!race.targetTime || !race.distanceKm) return null
  const pace = race.targetTime / race.distanceKm
  return (
    <div className="card">
      <div className="plan-head">
        <div><div className="v">{formatPace(pace)}</div><div className="l">pace constante</div></div>
        <div><div className="v">{formatDuration(race.targetTime)}</div><div className="l">meta em {formatKm(race.distanceKm)}</div></div>
      </div>
      <PaceTable targetSec={race.targetTime} km={race.distanceKm} caption="Passagens para a meta" />
      <p className="note">Ritmo constante do início ao fim. Se o relógio marcar distância a mais (curvas e GPS), guie-se pelas placas de km.</p>
    </div>
  )
}

/** Plano para um objetivo de tempo. */
export function GoalPlan({ goal, races }) {
  const p = goalPlan(goal, races)
  if (!p) return null
  return (
    <div className="card">
      <div className="plan-head">
        <div><div className="v">{formatPace(p.targetPace)}</div><div className="l">pace para {formatDuration(goal.targetValue)}</div></div>
        {p.best && <div><div className="v">{formatPace(p.best.result.netTime / p.km)}</div><div className="l">seu melhor oficial</div></div>}
      </div>
      {p.best ? (
        p.gap > 0 ? (
          <p className="small" style={{ margin: '12px 0 0' }}>Faltam <b>{formatDuration(p.gap)}</b> — <b>{formatDeltaPace(p.perKm).replace('+', '')}</b> mais rápido em cada km que no seu melhor ({p.best.name}, {formatDateBR(p.best.date)}).</p>
        ) : (
          <p className="small" style={{ margin: '12px 0 0' }}>Seu melhor tempo oficial ({formatDuration(p.best.result.netTime)}) já está {p.gap === 0 ? 'igual à marca; falta ficar abaixo' : 'abaixo da marca'}.</p>
        )
      ) : (
        <p className="small" style={{ margin: '12px 0 0' }}>Ainda não há resultado oficial de {formatKm(p.km)}. A primeira prova vira sua referência.</p>
      )}
      {p.milestone && (
        <div className="alert alert-info small" style={{ marginTop: 12 }}>
          <IconInfo />
          <div><b>Degrau intermediário:</b> a diferença é grande para uma prova só. Uma meta no meio do caminho seria {formatDuration(p.milestone.time)} ({formatPace(p.milestone.pace)}).</div>
        </div>
      )}
      {p.trend && (
        <p className="note">
          Nas últimas {p.trend.races} provas oficiais: {p.trend.improving ? `melhora média de ${formatDuration(-p.trend.perRace)} por prova.` : p.trend.perRace === 0 ? 'tempos estáveis.' : `tempos ${formatDuration(p.trend.perRace)} mais lentos por prova, em média.`}
        </p>
      )}
      <div className="list-group-title" style={{ marginTop: 14 }}>Passagens para ficar abaixo de {formatDuration(goal.targetValue)}</div>
      <PaceTable targetSec={goal.targetValue - 1} km={p.km} caption="Passagens para o objetivo" />
      <div className="list-group-title" style={{ marginTop: 14 }}>Próximas chances</div>
      {p.candidates.length ? (
        <ul className="plain-list">
          {p.candidates.map((r) => (
            <li key={r.id}>
              <Link to={`/corridas/${r.id}`}>{r.name}</Link>
              <span className="muted small"> · {formatDateBR(r.date)}</span>
              <span className="right small">{r.targetTime ? `meta ${formatDuration(r.targetTime)}` : 'sem meta'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>Nenhuma prova de {formatKm(p.km)} com data à frente{goal.deadline ? ' dentro do prazo' : ''}. <Link to="/corridas/nova">Cadastrar uma</Link></p>
      )}
      <p className="note">É um plano de ritmo, não de treino. Para chegar lá com segurança, combine com quem orienta seus treinos.</p>
    </div>
  )
}
