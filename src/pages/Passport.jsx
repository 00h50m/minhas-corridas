// Passaporte de corredora: a coleção de conquistas por categoria (as que faltam aparecem apagadas),
// detalhes de cada uma num toque, e os recordes, números e cidades numa aba à parte.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Medal from '../components/Medal.jsx'
import { IconMap, IconSearch, IconStory } from '../components/Icons.jsx'
import { useStore } from '../services/store.js'
import { Progress, Sheet, TopBar } from '../components/ui.jsx'
import { passport } from '../lib/passport.js'
import { distanceLabel } from '../lib/stats.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatPace } from '../lib/format.js'
import { kgLabel, strengthHistory } from '../lib/strength.js'

const nf = (n) => String(n).replace('.', ',')

// Categorias da coleção (por família de conquista)
const CATEGORIES = [
  { title: 'Provas', families: ['primeira-prova', 'provas', 'km-provas', 'metas', 'madrugadora'] },
  { title: 'Distâncias', families: ['primeiros-5k', 'primeiros-10k', 'primeira-meia', 'primeira-maratona'] },
  { title: 'Tempos', families: ['sub5k', 'sub10k', 'sub21k'] },
  { title: 'Treinos', families: ['treinos', 'cruzado', 'semanas', 'objetivos'] },
  { title: 'Explorar', families: ['cidades', 'territorio'] }
]

/** Por família: as conquistadas e a próxima (as demais, mais distantes, ficam fora para não poluir). */
function visible(all, families) {
  const out = []
  for (const f of families) {
    const items = all.filter((a) => a.family === f)
    const done = items.filter((a) => a.date)
    const next = items.find((a) => !a.date)
    out.push(...done, ...(next ? [next] : []))
  }
  return out
}

export default function Passport() {
  const { races, workouts, goals } = useStore()
  const today = todayISO()
  const p = passport({ races, workouts, goals, today })
  const [tab, setTab] = useState('conquistas')
  const [open, setOpen] = useState(null)
  const n = p.numbers
  const total = p.all.length
  const fresh = p.badges.filter((b) => b.isNew)
  const near = p.next.filter((b) => !b.timed && b.progress.need > 1).slice(0, 3)
  const badgeOf = (id) => p.all.find((a) => a.id === id)
  return (
    <>
      <TopBar title="Passaporte" sub={n.since ? `correndo desde ${formatDateBR(n.since).slice(3)}` : 'de corredora'} back="/" />
      <div className="page" data-testid="passport">
        <div className="card pp-hero">
          <div className="pp-count" data-testid="pp-count"><b>{p.badges.length}</b> de {total} conquistas</div>
          <Progress pct={p.badges.length / total} label={`${p.badges.length} de ${total} conquistas`} />
          <div className="pp-links">
            <Link to="/mapa" className="btn btn-sm" data-testid="pp-map"><IconMap /> Mapa{n.cells ? ` · ${n.cells} quadras` : ''}</Link>
            <Link to="/provas-perto" className="btn btn-sm" data-testid="pp-near"><IconSearch /> Provas perto</Link>
          </div>
        </div>

        <div className="seg pp-tabs" role="tablist" aria-label="Passaporte">
          <button type="button" role="tab" aria-pressed={tab === 'conquistas'} aria-selected={tab === 'conquistas'} onClick={() => setTab('conquistas')} data-testid="pp-tab-badges">Conquistas</button>
          <button type="button" role="tab" aria-pressed={tab === 'recordes'} aria-selected={tab === 'recordes'} onClick={() => setTab('recordes')} data-testid="pp-tab-records">Recordes e números</button>
        </div>

        {tab === 'conquistas' ? (
          <>
            {fresh.length > 0 && (
              <>
                <div className="list-group-title">Novas</div>
                <div className="card pp-fresh-list">
                  {fresh.map((b) => (
                    <button key={b.id} type="button" className="pp-row" onClick={() => setOpen(b.id)} data-testid="pp-fresh">
                      <Medal mark={b.mark} />
                      <span><b>{b.title}</b><span className="muted small">{formatDateBR(b.date)}</span></span>
                      <span className="pp-new-tag">nova</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {near.length > 0 && (
              <>
                <div className="list-group-title">Quase lá</div>
                <div className="card" data-testid="pp-next">
                  {near.map((b) => (
                    <button key={b.id} type="button" className="pp-row" onClick={() => setOpen(b.id)}>
                      <Medal mark={b.mark} locked />
                      <span style={{ flex: 1, minWidth: 0 }}><b>{b.title}</b><span className="muted small">{b.progress.text}</span><Progress pct={b.progress.cur / b.progress.need} label={b.progress.text} /></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {CATEGORIES.map((c) => {
              const items = visible(p.all, c.families)
              if (!items.length) return null
              const got = items.filter((a) => a.date).length
              return (
                <div key={c.title}>
                  <div className="list-group-title pp-cat">{c.title}<span>{got} de {p.all.filter((a) => c.families.includes(a.family)).length}</span></div>
                  <div className="pp-grid" data-testid="pp-badges">
                    {items.map((b) => (
                      <button key={b.id} type="button" className={`pp-badge${b.date ? '' : ' locked'}${b.isNew ? ' new' : ''}`} onClick={() => setOpen(b.id)} data-testid="pp-badge">
                        <Medal mark={b.mark} locked={!b.date} />
                        <span className="pp-t">{b.title}</span>
                        <span className="pp-d">{b.date ? formatDateBR(b.date) : 'falta'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <p className="note">As conquistas saem do que já está no app (provas, treinos, objetivos e arquivos do relógio). Toque numa medalha para ver os detalhes.</p>
          </>
        ) : (
          <Records p={p} workouts={workouts} />
        )}
      </div>
      {open && <BadgeSheet b={badgeOf(open)} onClose={() => setOpen(null)} />}
    </>
  )
}

function BadgeSheet({ b, onClose }) {
  if (!b) return null
  return (
    <Sheet title={b.title} onClose={onClose}>
      <div className="pp-sheet" data-testid="pp-sheet">
        <Medal mark={b.mark} size="huge" locked={!b.date} />
        <p className="small" style={{ margin: '10px 0 4px' }}>{b.desc}</p>
        {b.date ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>Conquistada em {formatDateBR(b.date)}</p>
            <div className="pp-sheet-actions">
              <Link to={`/stories?modelo=conquista&conquista=${b.id}`} className="btn btn-primary btn-block" data-testid="pp-share"><IconStory /> Postar no story</Link>
              {b.raceId && <Link to={`/corridas/${b.raceId}`} className="btn btn-block">Ver a prova</Link>}
            </div>
          </>
        ) : (
          <>
            <p className="small" style={{ margin: '0 0 6px' }} data-testid="pp-progress"><b>{b.progress.text}</b></p>
            {!b.timed && b.progress.need > 1 && <Progress pct={b.progress.cur / b.progress.need} label={b.progress.text} />}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Records({ p, workouts }) {
  const n = p.numbers
  const lifts = strengthHistory(workouts).filter((h) => h.bestKg != null).slice(0, 8)
  return (
    <div data-testid="pp-records-tab">
      <div className="stats" style={{ marginTop: 4 }}>
        <div className="stat"><div className="v">{n.races}</div><div className="l">{n.races === 1 ? 'prova' : 'provas'}</div></div>
        <div className="stat"><div className="v">{nf(n.raceKm)}</div><div className="l">km em provas</div></div>
        <div className="stat"><div className="v">{n.runs}</div><div className="l">{n.runs === 1 ? 'treino' : 'treinos'}</div></div>
      </div>
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
      {lifts.length > 0 && (
        <>
          <div className="list-group-title">Força · carga máxima</div>
          <div className="card" data-testid="pp-lifts">
            {lifts.map((h) => (
              <Link key={h.name} to="/treinos" className="pp-rec">
                <span>{h.name}</span>
                <b>{kgLabel(h.bestKg)}</b>
                <span className="muted small">{formatDateBR(h.bestKgDate)}</span>
              </Link>
            ))}
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
    </div>
  )
}
