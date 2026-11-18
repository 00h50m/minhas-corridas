// Passaporte de corredora: conquistas com data, próximas com quanto falta, números, recordes e cidades.
import Medal from '../components/Medal.jsx'
import { IconMap, IconSearch, IconStory } from '../components/Icons.jsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { Progress, TopBar } from '../components/ui.jsx'
import { passport } from '../lib/passport.js'
import { distanceLabel } from '../lib/stats.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatPace } from '../lib/format.js'

const nf = (n) => String(n).replace('.', ',')

export default function Passport() {
  const { races, workouts, goals } = useStore()
  const today = todayISO()
  const p = passport({ races, workouts, goals, today })
  const [allNext, setAllNext] = useState(false)
  const n = p.numbers
  const fresh = p.badges.filter((b) => b.isNew)
  const next = allNext ? p.next : p.next.slice(0, 5)
  return (
    <>
      <TopBar title="Passaporte" sub={n.since ? `correndo desde ${formatDateBR(n.since).slice(3)}` : 'de corredora'} back="/" />
      <div className="page" data-testid="passport">
        <div className="card pp-hero">
          <div className="pp-count" data-testid="pp-count"><b>{p.badges.length}</b> {p.badges.length === 1 ? 'conquista' : 'conquistas'}</div>
          <div className="stats" style={{ marginTop: 10 }}>
            <div className="stat"><div className="v">{n.races}</div><div className="l">{n.races === 1 ? 'prova' : 'provas'}</div></div>
            <div className="stat"><div className="v">{nf(n.raceKm)}</div><div className="l">km em provas</div></div>
            <div className="stat"><div className="v">{n.runs}</div><div className="l">{n.runs === 1 ? 'treino' : 'treinos'}</div></div>
          </div>
          <div className="pp-links">
            <Link to="/mapa" className="btn" data-testid="pp-map"><IconMap /> Mapa{n.cells ? ` · ${n.cells} quarteirões` : ' das corridas'}</Link>
            <Link to="/provas-perto" className="btn" data-testid="pp-near"><IconSearch /> Provas perto</Link>
          </div>
        </div>

        {fresh.length > 0 && (
          <>
            <div className="list-group-title">Novas</div>
            {fresh.map((b) => (
              <div key={b.id} className="card pp-new" data-testid="pp-fresh">
                <Medal mark={b.mark} size="big" />
                <div style={{ flex: 1 }}>
                  <b>{b.title}</b>
                  <div className="muted small">{b.desc} · {formatDateBR(b.date)}</div>
                  <Link to={`/stories?modelo=conquista&conquista=${b.id}`} className="link-btn" data-testid="pp-share"><IconStory /> Postar no story</Link>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="list-group-title">Conquistas</div>
        {p.badges.length === 0 && <div className="card muted small">Complete uma prova ou marque treinos como feitos para ganhar as primeiras.</div>}
        <div className="pp-grid" data-testid="pp-badges">
          {p.badges.map((b) => (
            <Link key={b.id} to={`/stories?modelo=conquista&conquista=${b.id}`} className={`pp-badge${b.isNew ? ' new' : ''}`} title={b.desc} data-testid="pp-badge">
              <Medal mark={b.mark} />
              <span className="pp-t">{b.title}</span>
              <span className="pp-d">{formatDateBR(b.date)}</span>
            </Link>
          ))}
        </div>

        {p.next.length > 0 && (
          <>
            <div className="list-group-title">Próximas</div>
            <div className="card" data-testid="pp-next">
              {next.map((b) => (
                <div key={b.id} className="pp-next">
                  <Medal mark={b.mark} locked />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{b.title}</b>
                    <div className="muted small">{b.progress.text}</div>
                    {!b.timed && b.progress.need > 1 && <Progress pct={b.progress.cur / b.progress.need} label={b.progress.text} />}
                  </div>
                </div>
              ))}
              {p.next.length > 5 && <button type="button" className="link-btn" onClick={() => setAllNext((v) => !v)}>{allNext ? 'Mostrar menos' : `Ver todas (${p.next.length})`}</button>}
            </div>
          </>
        )}

        {p.records.length > 0 && (
          <>
            <div className="list-group-title">Recordes</div>
            <div className="card" data-testid="pp-records">
              {p.records.map((g) => {
                const r = g.bestOfficial ?? g.bestPersonal
                if (!r) return null
                return (
                  <Link key={g.key} to={`/corridas/${r.id}`} className="pp-rec">
                    <span>{distanceLabel(g.key)}</span>
                    <b>{formatDuration(r.result.netTime)}</b>
                    <span className="muted small">{formatPace(r.result.netTime / g.km)} · {formatDateBR(r.date)}</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        {n.cities.length > 0 && (
          <>
            <div className="list-group-title">Cidades onde correu ({n.cities.length})</div>
            <div className="chips" data-testid="pp-cities">{n.cities.map((c) => <span key={c} className="chip">{c}</span>)}</div>
          </>
        )}
        {n.cross > 0 && <p className="small muted" style={{ marginTop: 14 }}>{n.cross} {n.cross === 1 ? 'atividade' : 'atividades'} além da corrida.</p>}
        <p className="note">As conquistas saem do que já está no app (provas, treinos, objetivos e arquivos do relógio). Tempos de treino só contam com o arquivo do relógio cobrindo a distância.</p>
      </div>
    </>
  )
}
