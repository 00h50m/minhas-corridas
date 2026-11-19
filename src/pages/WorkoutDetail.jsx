// Detalhe do treino: passos, arquivo para o relógio, status e planejado × executado (voltas do relógio).
import { resultFrom } from '../lib/activityMatch.js'
import ActivityDetails from '../components/ActivityDetails.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteWorkout, getRace, saveWorkout, useStore } from '../services/store.js'
import { Sheet, TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconEdit, IconHeart, IconMove, IconStopwatch, IconStory, IconTrash, IconUpload, IconWatch, SportIcon } from '../components/Icons.jsx'
import { compareStrength, exerciseName, planLine } from '../lib/strength.js'
import { STEP_BY_ID, WORKOUT_STATUSES, compareLaps, durationLabel, estimate, flatten, fmtPace, fmtSec, isRun, sportOf, targetLabel } from '../lib/workout.js'
import { fitFileName, workoutToFit } from '../lib/workoutFit.js'
import { claudePrompt, garminLines, intervalsText } from '../lib/workoutShare.js'
import CopyBox from '../components/CopyBox.jsx'
import Readiness from '../components/Readiness.jsx'
import HrZones, { useZones } from '../components/HrZones.jsx'
import { zoneOf } from '../lib/hrZones.js'
import Reschedule from '../components/Reschedule.jsx'
import { dayLabel } from '../lib/reschedule.js'
import { addDaysISO, formatDateBR, toISODate } from '../lib/dates.js'
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
  const [send, setSend] = useState(false)
  const [moving, setMoving] = useState(false)
  // Botões da notificação da noite: ?marcar=feito ou ?remanejar=1
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('marcar') === 'feito') {
      if (w.status === 'planejado') { saveWorkout({ ...w, status: 'feito' }); notify(w.result ? 'Marcado como feito' : 'Marcado como feito. Se quiser, importe a atividade do relógio.') }
      setParams({}, { replace: true })
    } else if (params.get('remanejar') === '1') {
      if (w.status !== 'feito') setMoving(true)
      setParams({}, { replace: true })
    }
  }, [])
  const est = estimate(w.items)
  const race = w.raceId ? getRace(w.raceId) : null
  const run = isRun(w)

  const setStatus = (status) => {
    saveWorkout({ ...w, status })
    notify(status === 'feito' ? 'Marcado como feito' : status === 'pulado' ? 'Marcado como não feito' : 'Voltou para planejado')
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
      const result = resultFrom(a, w.result)
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

  const done = w.status === 'feito'
  const fileButton = (
    <>
      <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()} data-testid="wk-import"><IconUpload /> {w.result ? 'Trocar arquivo da atividade' : 'Importar atividade do relógio'}</button>
      <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.zip,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml" hidden onChange={onFile} data-testid="wk-file" />
      {!w.result && <p className="note">Com o Garmin conectado, a atividade entra sozinha. Ou, no Garmin Connect: atividade → ⚙ → Exportar original (.zip).</p>}
      {msg && <div className={`alert small ${msg.ok ? '' : 'alert-error'}`} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10 }}>{msg.text}</div>}
    </>
  )

  return (
    <>
      <TopBar title={w.name} sub={w.date ? formatDateBR(w.date) : 'Sem data'} back="/treinos" right={<Link to={`/treinos/${w.id}/editar`} className="icon-btn" aria-label="Editar treino"><IconEdit /></Link>} />
      <div className="page" data-testid="workout-detail">
        <PlanCard w={w} est={est} race={race} />

        {done ? (
          <>
            {w.result ? <Executed w={w} /> : (
              <div className="card small" style={{ marginTop: 12 }} data-testid="wk-done-nofile">
                <b>Feito.</b> <span className="muted">Importe a atividade do relógio para ver duração, FC, calorias{w.sport === 'academia' ? ' e as séries' : ' e o percurso'}.</span>
              </div>
            )}
            <Link to={`/stories?modelo=treino&treino=${w.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10 }} data-testid="wk-story"><IconStory /> Compartilhar este treino</Link>
            {w.date && <Readiness date={w.date} past style={{ marginTop: 10 }} />}
          </>
        ) : (
          <div className="wd-actions">
            {(run || w.exercises?.length > 0) && <button type="button" className="btn btn-primary" onClick={() => setSend(true)} data-testid="wk-send"><IconWatch /> Enviar ao relógio</button>}
            <button type="button" className="btn" onClick={() => setMoving(true)} data-testid="wk-move"><IconMove /> Remanejar</button>
          </div>
        )}
        {moving && <Reschedule w={w} onClose={() => setMoving(false)} />}
        {send && <SendSheet w={w} onClose={() => setSend(false)} />}

        {w.moves?.length > 0 && (
          <div className="small muted rs-history" style={{ marginTop: 10 }} data-testid="wk-moves">
            <b><IconMove /> Remanejado</b> {w.moves.map((m) => `de ${dayLabel(m.from)} para ${dayLabel(m.to)}${m.auto ? ' (pela regra)' : ''}`).join(' · ')}
          </div>
        )}

        <div className="section-title"><h2>{done ? 'Status' : 'Como foi'}</h2></div>
        <div className="seg" role="group" aria-label="Status do treino">
          {WORKOUT_STATUSES.map((s) => <button key={s.id} type="button" aria-pressed={w.status === s.id} onClick={() => setStatus(s.id)}>{s.label}</button>)}
        </div>
        {fileButton}

        <div className="btn-row" style={{ marginTop: 22 }}>
          <Link to={`/treinos/novo?copiar=${w.id}${w.date ? `&data=${addDaysISO(w.date, 7)}` : ''}`} className="btn" data-testid="wk-dup" aria-label={w.date ? 'Repetir este treino 7 dias depois' : 'Duplicar este treino'}>{w.date ? 'Repetir' : 'Duplicar'}</Link>
          <button type="button" className="btn" onClick={onRemove}><IconTrash /> Excluir</button>
        </div>
      </div>
    </>
  )
}

/** O planejado: passos da corrida, ou a atividade com a ficha da academia. */
function PlanCard({ w, est, race }) {
  if (!isRun(w)) {
    return (
      <div className="card" data-testid="wk-cross">
        <div className="wd-sport"><span className="wd-sport-ic"><SportIcon sport={w.sport} /></span><b>{sportOf(w).label}</b>{w.plannedMin ? <span className="muted small">· {w.plannedMin} min planejados</span> : null}</div>
        {w.exercises?.length > 0 && (
          <ul className="wd-plan" data-testid="wk-plan">
            {w.exercises.map((x, i) => <li key={i}><span>{exerciseName(x.cat)}</span><b>{planLine(x)}</b></li>)}
          </ul>
        )}
        {race && <p className="small" style={{ margin: '10px 0 0' }}>Preparação para <Link to={`/corridas/${race.id}`}>{race.name}</Link></p>}
        {w.notes && <p className="small muted" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{w.notes}</p>}
      </div>
    )
  }
  return (
    <div className="card">
      <div className="chips">
        <span className="chip" title="tempo estimado"><IconStopwatch /> {fmtSec(est.sec)}</span>
        <span className="chip" title="distância estimada">{String(est.km.toFixed(1)).replace('.', ',')} km</span>
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
  )
}

/** Os caminhos para mandar o treino ao relógio, num lugar só. */
function SendSheet({ w, onClose }) {
  const [way, setWay] = useState('cabo')
  const run = isRun(w)
  return (
    <Sheet title="Enviar para o relógio" onClose={onClose}>
      <div data-testid="wk-send-sheet">
        {run && <div className="seg" role="group" aria-label="Como enviar" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={way === 'cabo'} onClick={() => setWay('cabo')} data-testid="send-cabo">Com cabo</button>
          <button type="button" aria-pressed={way === 'gc'} onClick={() => setWay('gc')} data-testid="wk-gc">Garmin Connect</button>
          <button type="button" aria-pressed={way === 'auto'} onClick={() => setWay('auto')} data-testid="send-auto">Sem cabo</button>
        </div>}
        {way === 'cabo' && (
          <div className="small" data-testid="wk-howto">
            <button type="button" className="btn btn-primary btn-block" onClick={() => downloadBlob(new Blob([workoutToFit(w)], { type: 'application/octet-stream' }), fitFileName(w))} data-testid="wk-export"><IconDownload /> Baixar arquivo (.FIT)</button>
            <ol className="wk-howto">
              <li>No computador, ligue o relógio pelo cabo (feche o Garmin Express).</li>
              <li>Copie <b>{fitFileName(w)}</b> para a pasta <b>GARMIN/NewFiles</b> do relógio (ou <b>GARMIN/Workouts</b>). No Mac, use um programa como o OpenMTP.</li>
              <li>Desconecte. No relógio: {run ? <b>Corrida → Opções → Treinos</b> : <><b>Musculação → Opções → Treinos</b> (cada série com as repetições e a carga; o descanso termina no botão de volta)</>}.</li>
            </ol>
          </div>
        )}
        {way === 'gc' && (
          <div className="small" data-testid="wk-gc-guide">
            <p style={{ marginTop: 0 }}>Crie o treino no app <b>Garmin Connect</b> copiando os passos. Ele envia ao relógio pelo Bluetooth.</p>
            <ol className="wk-howto">
              <li><b>Mais (☰) → Treinos e planejamento → Exercícios → Criar exercício → Corrida</b> (o menu pode variar).</li>
              <li>Nome: <b>{w.name}</b>. Passos, na ordem (use “Adicionar repetição” nos blocos):</li>
            </ol>
            <ol className="gc-steps">
              {garminLines(w.items).map((l, i) => (l.repeat
                ? <li key={i} className="gc-rep"><b>Repetir {l.repeat} vezes:</b></li>
                : <li key={i} className={l.indent ? 'gc-in' : ''}><b>{l.step}</b> — {l.duration} — {l.target}{l.note ? <span className="muted"> ({l.note})</span> : null}</li>
              ))}
            </ol>
            <ol className="wk-howto" start={3}><li>Salve e toque em <b>Enviar para dispositivo</b>.</li></ol>
          </div>
        )}
        {way === 'auto' && (
          <div className="small send-nocable" data-testid="wk-nocable">
            <CopyBox label="Copiar para o Intervals.icu" text={intervalsText(w)} done="Texto copiado: cole no Intervals.icu" testid="copy-intervals"
              hint="No Intervals.icu: Calendário → no dia → Add workout → Corrida → cole na descrição. Com a Garmin conectada lá e “Upload planned workouts” ligado, vai para o relógio." />
            <CopyBox label="Copiar prompt para o Claude (Garmin Connect)" text={claudePrompt([w])} done="Prompt copiado: cole no Claude" testid="copy-claude"
              hint="Cole no Claude com acesso ao navegador, com o Garmin Connect aberto: ele cria o treino, agenda e envia para o relógio." />
          </div>
        )}
        <p className="note">Formato de treino da Garmin conferido com o leitor oficial. O envio direto pelo PaceOn depende de a Garmin liberar o acesso.</p>
      </div>
    </Sheet>
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
  const zones = useZones()
  // Treino com tiros ou alvo de pace por passo: a leitura das zonas não cobra “leve”.
  const hasIntervals = flatten(w.items).some((s) => s.type === 'tiro') || w.items.some((it) => it.kind === 'repeat')
  const rows = compareLaps(w.items, r.laps)
  const extra = r.laps.length - rows.length
  const scored = rows.filter((x) => x.inTarget != null)
  const hits = scored.filter((x) => x.inTarget).length
  return (
    <div className="card" style={{ marginTop: 12 }} data-testid="wk-executed">
      <div className="det-head"><b>Do relógio</b>{r.fileName && <span className="muted small">{r.garminId ? 'Garmin' : 'arquivo'}</span>}</div>
      <ActivityDetails w={w} />
      {w.exercises?.length > 0 && r.sets?.length > 0 && <StrengthCompare w={w} />}
      {r.hrHist && <div className="det-block"><HrZones hist={r.hrHist} hasIntervals={hasIntervals || !isRun(w)} /></div>}
      {isRun(w) && r.laps.length > 0 && (
        <>
          {scored.length > 0 && <p className="small" style={{ margin: '10px 0 4px' }} data-testid="wk-hits"><b>{hits} de {scored.length}</b> passos com pace dentro da faixa.</p>}
          <table className="wk-table">
            <thead><tr><th>Passo</th><th>Planejado</th><th>Feito</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={i} className={x.inTarget === true ? 'ok' : x.inTarget === false ? 'off' : ''}>
                  <td>{STEP_BY_ID[x.step.type].label.replace(' (parado)', '')}{x.step.rep ? <span className="muted"> {x.step.rep}/{x.step.of}</span> : null}</td>
                  <td>{durationLabel(x.step.duration)}{x.step.target.kind !== 'none' ? <div className="muted">{targetLabel(x.step.target)}</div> : null}</td>
                  <td>{x.lap ? <>{fmtSec(x.lap.sec)} · {Math.round(x.lap.distanceKm * 1000)} m{x.paceSec ? <div className="muted">{fmtPace(x.paceSec)}/km {x.inTarget === true ? '✓' : x.inTarget === false ? '✗' : ''}</div> : null}{x.lap.avgHr ? <div className="muted" data-testid="lap-hr"><IconHeart /> {x.lap.avgHr}{zones ? ` · Z${zoneOf(x.lap.avgHr, zones)}` : ''}</div> : null}</> : <span className="muted">—</span>}</td>
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

const CMP_LABEL = { ok: 'como planejado', parcial: 'parcial', faltou: 'não feito' }

/** Ficha planejada × séries do relógio. */
function StrengthCompare({ w }) {
  const c = compareStrength(w.exercises, w.result.sets)
  const fmt = (d) => `${d.sets} ${d.sets === 1 ? 'série' : 'séries'}${d.reps.length ? ` · ${d.reps.join('/')}` : ''}${d.maxKg ? ` · ${String(d.maxKg).replace('.', ',')} kg` : ''}`
  return (
    <div className="det-block" data-testid="wk-strength-cmp">
      <div className="det-title">Planejado × feito</div>
      <p className="small" style={{ margin: '0 0 6px' }}><b>{c.ok} de {c.total}</b> {c.total === 1 ? 'exercício' : 'exercícios'} como planejado</p>
      <ul className="cmp-list">
        {c.rows.map((x, i) => (
          <li key={i} className={`cmp-${x.status}`} data-testid="cmp-row">
            <div className="cmp-name"><b>{x.name}</b><span className={`cmp-tag cmp-${x.status}`}>{CMP_LABEL[x.status]}</span></div>
            <div className="cmp-cols small">
              <span><span className="muted">plano</span> {planLine(x.plan)}</span>
              <span><span className="muted">feito</span> {x.done ? fmt(x.done) : '—'}{x.kgDiff > 0 ? <b className="cmp-up"> +{String(x.kgDiff).replace('.', ',')} kg</b> : null}</span>
            </div>
          </li>
        ))}
        {c.extras.map((x) => (
          <li key={x.name} className="cmp-extra" data-testid="cmp-extra">
            <div className="cmp-name"><b>{x.name}</b><span className="cmp-tag">fora da ficha</span></div>
            <div className="cmp-cols small"><span><span className="muted">feito</span> {fmt(x)}</span></div>
          </li>
        ))}
      </ul>
    </div>
  )
}
