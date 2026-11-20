// O relatório para o treinador (usado na tela da atleta e no link só de leitura).
const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const kg = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}`)
const pace = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
const n1 = (v) => String(v).replace('.', ',')

export default function ReportView({ r }) {
  const maxLoad = Math.max(1, ...r.weeks.map((w) => w.load))
  const exKg = r.gym.exercises.filter((e) => e.sessions.length)
  return (
    <div className="report" data-testid="report">
      <div className="card rp-head">
        <span className="muted small">Relatório de treinos</span>
        <b>{br(r.period.from)} a {br(r.period.to)}</b>
        {r.program && <span className="small">{[r.program.title, r.program.goal, r.program.coach && `treinador(a) ${r.program.coach}`].filter(Boolean).join(' · ')}</span>}
      </div>

      <div className="stats rp-stats">
        <div className="stat"><div className="v">{r.gym.sessions}</div><div className="l">academia ({n1(r.gym.perWeek)}/sem)</div></div>
        <div className="stat"><div className="v">{n1(r.runs.km)}</div><div className="l">km em {r.runs.count} {r.runs.count === 1 ? 'corrida' : 'corridas'}</div></div>
        <div className="stat"><div className="v">{r.gym.plannedSets ? `${Math.round(((r.gym.plannedSets - r.gym.missedSets) / r.gym.plannedSets) * 100)}%` : '—'}</div><div className="l">séries feitas</div></div>
      </div>

      {r.gym.bySheet.length > 0 && (
        <>
          <div className="section-title"><h2>Ficha</h2></div>
          <div className="card rp-sheets" data-testid="rp-sheets">
            {r.gym.bySheet.map((s) => (
              <div key={s.label} className="rp-sheet">
                <b>Treino {s.label}</b>
                <span className="rp-count">{s.count}×</span>
                <span className="muted small">{s.dates.map((d) => br(d).slice(0, 5)).join(' · ') || 'não feito'}</span>
              </div>
            ))}
            {r.gym.loose > 0 && <p className="small muted" style={{ margin: '6px 0 0' }}>+ {r.gym.loose} {r.gym.loose === 1 ? 'treino' : 'treinos'} de academia fora da ficha.</p>}
            {r.gym.plannedSets > 0 && <p className="small" style={{ margin: '6px 0 0' }}>Séries: <b>{r.gym.plannedSets - r.gym.missedSets} de {r.gym.plannedSets}</b>{r.gym.missedSets ? ` (faltaram ${r.gym.missedSets})` : ''}{r.gym.avgMin ? ` · média de ${r.gym.avgMin} min por treino` : ''}</p>}
          </div>
        </>
      )}

      {exKg.length > 0 && (
        <>
          <div className="section-title"><h2>Cargas por exercício</h2></div>
          <div className="card rp-ex" data-testid="rp-ex">
            {exKg.map((e) => (
              <div key={e.name} className="rp-exrow">
                <div className="rp-exhead">
                  <b>{e.name}</b>
                  {e.firstKg != null && <span className={`rp-delta${e.lastKg > e.firstKg ? ' up' : ''}`}>{e.firstKg === e.lastKg ? `${kg(e.lastKg)} kg` : `${kg(e.firstKg)} → ${kg(e.lastKg)} kg`}</span>}
                </div>
                <div className="rp-sessions small">
                  {e.sessions.map((s, i) => (
                    <span key={i}>{br(s.date).slice(0, 5)}{s.sheet ? ` (${s.sheet})` : ''}: {s.kgs.length ? `${s.kgs.map(kg).join('/')} kg` : '—'}{s.reps.length ? ` · ${s.reps.join('/')} reps` : ''}{s.planned && s.done != null && s.done < s.planned ? ` · ${s.done}/${s.planned} séries` : ''}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title"><h2>Corrida e outras</h2></div>
      <div className="card small rp-runs" data-testid="rp-runs">
        <div><b>{r.runs.count}</b> {r.runs.count === 1 ? 'corrida' : 'corridas'} · <b>{n1(r.runs.km)} km</b>{r.runs.min ? ` · ${Math.floor(r.runs.min / 60)}h${String(r.runs.min % 60).padStart(2, '0')}` : ''}{r.runs.paceSec ? ` · pace médio ${pace(r.runs.paceSec)}` : ''}{r.runs.longestKm ? ` · mais longa ${n1(r.runs.longestKm)} km` : ''}</div>
        {Object.keys(r.other).length > 0 && <div>Outras: {Object.entries(r.other).map(([k, v]) => `${k} ${v}×`).join(' · ')}</div>}
        {r.races.length > 0 && <div>Provas: {r.races.map((x) => `${x.name} (${br(x.date).slice(0, 5)}${x.km ? `, ${n1(x.km)} km` : ''})`).join(' · ')}</div>}
        {r.skipped > 0 && <div className="muted">Treinos marcados como “não fiz”: {r.skipped}</div>}
      </div>

      <div className="section-title"><h2>Semana a semana</h2></div>
      <div className="card rp-weeks" data-testid="rp-weeks">
        {r.weeks.map((w) => (
          <div key={w.start} className="rp-week">
            <span className="rp-wk">{br(w.start).slice(0, 5)}</span>
            <span className="rp-wbar"><span style={{ width: `${(w.load / maxLoad) * 100}%` }} /></span>
            <span className="small rp-wtxt">{w.gym} acad. · {w.runs} corr.{w.km ? ` · ${n1(w.km)} km` : ''} · {w.load} pts</span>
          </div>
        ))}
      </div>
      <p className="note">Gerado pelo PaceOn com o que a atleta registrou (treinos marcados como feitos, séries anotadas na academia e arquivos do relógio). Carga em pontos = minutos × intensidade.</p>
    </div>
  )
}
