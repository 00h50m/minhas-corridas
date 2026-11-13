// Detalhe do treino: passos, arquivo para o relógio, status e planejado × executado (voltas do relógio).
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { deleteWorkout, getRace, saveWorkout, useStore } from '../services/store.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconEdit, IconTrash, IconUpload } from '../components/Icons.jsx'
import { STEP_BY_ID, WORKOUT_STATUSES, compareLaps, durationLabel, estimate, fmtPace, fmtSec, targetLabel } from '../lib/workout.js'
import { fitFileName, workoutToFit } from '../lib/workoutFit.js'
import { formatDateBR, toISODate } from '../lib/dates.js'
import { readActivityFile } from '../lib/activityFile.js'
import { downloadBlob } from '../services/backup.js'

export default function WorkoutDetail() {
  const { id } = useParams()
  const { workouts } = useStore()
  const w = workouts.find((x) => x.id === id)
  if (!w) return <Navigate to="/treinos" replace />
  return <Detail w={w} />
}

function Detail({ w }) {
  const nav = useNavigate()
  const { confirm, notify } = useUI()
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)
  const [howTo, setHowTo] = useState(false)
  const est = estimate(w.items)
  const race = w.raceId ? getRace(w.raceId) : null

  const setStatus = (status) => {
    saveWorkout({ ...w, status })
    notify(status === 'feito' ? 'Marcado como feito' : status === 'pulado' ? 'Marcado como não feito' : 'Voltou para planejado')
  }
  const onExport = () => {
    downloadBlob(new Blob([workoutToFit(w)], { type: 'application/octet-stream' }), fitFileName(w))
    setHowTo(true)
  }
  const onRemove = async () => {
    if (!(await confirm({ title: `Excluir “${w.name}”?`, message: 'O treino sai deste aparelho e da sua conta.', confirmLabel: 'Excluir', danger: true }))) return
    deleteWorkout(w.id)
    notify('Treino excluído')
    nav('/treinos', { replace: true })
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(null)
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Arquivo grande demais (máx. 30 MB).')
      const a = await readActivityFile(file)
      const result = { distanceKm: a.distanceKm, elapsedSec: a.elapsedSec, avgHr: a.avgHr, fileName: a.fileName, laps: a.laps ?? [], effort: w.result?.effort ?? null, notes: w.result?.notes ?? '' }
      const fileDate = toISODate(new Date(a.startTime))
      saveWorkout({ ...w, status: 'feito', result, date: w.date ?? fileDate })
      const notes = ['Atividade importada.']
      if (w.date && fileDate !== w.date) notes.push(`Atenção: a atividade é de ${formatDateBR(fileDate)}, e o treino estava marcado para ${formatDateBR(w.date)}.`)
      if (!result.laps.length) notes.push('O arquivo não tem voltas: a comparação passo a passo precisa do .FIT (ou .TCX) do relógio.')
      setMsg({ ok: true, text: notes.join(' ') })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  return (
    <>
      <TopBar title={w.name} sub={w.date ? formatDateBR(w.date) : 'Sem data'} back="/treinos" right={<Link to={`/treinos/${w.id}/editar`} className="icon-btn" aria-label="Editar treino"><IconEdit /></Link>} />
      <div className="page" data-testid="workout-detail">
        <div className="card">
          <div className="chips">
            <span className="chip">≈ {fmtSec(est.sec)}</span>
            <span className="chip">≈ {String(est.km.toFixed(1)).replace('.', ',')} km</span>
            {est.open > 0 && <span className="chip chip-dim">+ {est.open} até o botão</span>}
          </div>
          {race && <p className="small" style={{ margin: '10px 0 0' }}>Preparação para <Link to={`/corridas/${race.id}`}>{race.name}</Link></p>}
          <ol className="wk-steps" data-testid="wk-steps">
            {w.items.map((it) => (it.kind === 'repeat' ? (
              <li key={it.id} className="wk-rep">
                <b>Repetir {it.times}×</b>
                <ol>{it.steps.map((s) => <StepLine key={s.id} s={s} />)}</ol>
              </li>
            ) : <StepLine key={it.id} s={it} />))}
          </ol>
          {w.notes && <p className="small muted" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{w.notes}</p>}
        </div>

        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={onExport} data-testid="wk-export"><IconDownload /> Baixar para o relógio (.FIT)</button>
        <button type="button" className="link-btn" onClick={() => setHowTo((v) => !v)} aria-expanded={howTo}>{howTo ? 'Esconder' : 'Como colocar no Garmin?'}</button>
        {howTo && (
          <div className="card small" data-testid="wk-howto">
            <ol className="wk-howto">
              <li>No computador, ligue o relógio pelo cabo (feche o Garmin Express).</li>
              <li>Abra a pasta <b>GARMIN</b> do relógio e copie o arquivo <b>{fitFileName(w)}</b> para <b>GARMIN/NewFiles</b> (ou <b>GARMIN/Workouts</b>, se não houver NewFiles). No Mac, relógios que não aparecem como disco precisam de um programa como o OpenMTP.</li>
              <li>Desconecte com segurança. No relógio: <b>Corrida → Opções → Treinos</b>.</li>
            </ol>
            <p className="muted" style={{ marginBottom: 0 }}>Formato de treino da Garmin, conferido com o leitor oficial da Garmin, mas ainda não testado em todos os modelos. Se não aparecer no relógio, conte para a gente. O envio direto pelo Garmin Connect depende de aprovação da Garmin.</p>
          </div>
        )}

        <div className="section-title"><h2>Como foi</h2></div>
        <div className="seg" role="group" aria-label="Status do treino">
          {WORKOUT_STATUSES.map((s) => <button key={s.id} type="button" aria-pressed={w.status === s.id} onClick={() => setStatus(s.id)}>{s.label}</button>)}
        </div>
        <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()} data-testid="wk-import"><IconUpload /> {w.result ? 'Trocar arquivo da atividade' : 'Importar atividade do relógio'}</button>
        <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.zip,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml" hidden onChange={onFile} data-testid="wk-file" />
        <p className="note">No Garmin Connect: atividade → ⚙ → Exportar original (.zip) ou Exportar para TCX.</p>
        {msg && <div className={`alert small ${msg.ok ? '' : 'alert-error'}`} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10 }}>{msg.text}</div>}
        {w.result && <Executed w={w} />}

        <div className="btn-row" style={{ marginTop: 22 }}>
          <Link to={`/treinos/novo?copiar=${w.id}`} className="btn">Duplicar</Link>
          <button type="button" className="btn" onClick={onRemove}><IconTrash /> Excluir</button>
        </div>
      </div>
    </>
  )
}

function StepLine({ s }) {
  return (
    <li className={`t-${s.type}`}>
      <span className="wk-dot" aria-hidden="true" />
      <b>{STEP_BY_ID[s.type].label.replace(' (parado)', '')}</b> · {durationLabel(s.duration)}
      {s.target.kind !== 'none' && <span className="muted"> · {targetLabel(s.target)}</span>}
    </li>
  )
}

function Executed({ w }) {
  const r = w.result
  const rows = compareLaps(w.items, r.laps)
  const extra = r.laps.length - rows.length
  const scored = rows.filter((x) => x.inTarget != null)
  const hits = scored.filter((x) => x.inTarget).length
  return (
    <div className="card" style={{ marginTop: 12 }} data-testid="wk-executed">
      <div className="chips">
        {r.distanceKm != null && <span className="chip">{String(r.distanceKm.toFixed(2)).replace('.', ',')} km</span>}
        {r.elapsedSec != null && <span className="chip">{fmtSec(r.elapsedSec)}</span>}
        {r.distanceKm > 0 && r.elapsedSec > 0 && <span className="chip">{fmtPace(r.elapsedSec / r.distanceKm)}/km</span>}
        {r.avgHr && <span className="chip">FC média {r.avgHr}</span>}
      </div>
      {r.laps.length > 0 && (
        <>
          {scored.length > 0 && <p className="small" style={{ margin: '10px 0 4px' }} data-testid="wk-hits"><b>{hits} de {scored.length}</b> passos com pace dentro da faixa.</p>}
          <table className="wk-table">
            <thead><tr><th>Passo</th><th>Planejado</th><th>Feito</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={i} className={x.inTarget === true ? 'ok' : x.inTarget === false ? 'off' : ''}>
                  <td>{STEP_BY_ID[x.step.type].label.replace(' (parado)', '')}{x.step.rep ? <span className="muted"> {x.step.rep}/{x.step.of}</span> : null}</td>
                  <td>{durationLabel(x.step.duration)}{x.step.target.kind !== 'none' ? <div className="muted">{targetLabel(x.step.target)}</div> : null}</td>
                  <td>{x.lap ? <>{fmtSec(x.lap.sec)} · {Math.round(x.lap.distanceKm * 1000)} m{x.paceSec ? <div className="muted">{fmtPace(x.paceSec)}/km {x.inTarget === true ? '✓' : x.inTarget === false ? '✗' : ''}</div> : null}</> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {extra > 0 && <p className="note">+ {extra} {extra === 1 ? 'volta a mais' : 'voltas a mais'} no relógio (ex.: corrida depois do treino).</p>}
          <p className="note">Cada passo é comparado com a volta correspondente do relógio. Se você apertou o botão de volta fora do treino, as linhas podem ficar desalinhadas.</p>
        </>
      )}
    </div>
  )
}
