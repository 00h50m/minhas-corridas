// "Importar atividade do relógio" na tela Treinos: cada arquivo vai para o treino planejado do dia
// (automático se houver um só); senão, a pessoa escolhe entre os próximos ou registra um treino avulso.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getState, getWorkout, saveWorkout } from '../services/store.js'
import { dropPending, useGarmin } from '../services/garmin.js'
import { Sheet, useUI } from './ui.jsx'
import { IconUpload } from './Icons.jsx'
import { readActivityFile } from '../lib/activityFile.js'
import { activityDate, alreadyImported, freeWorkout, matchActivity, resultFrom, sportFromFile } from '../lib/activityMatch.js'
import { formatDateBR, weekdayShort } from '../lib/dates.js'
import { fmtSec } from '../lib/workout.js'

export default function ActivityImport() {
  const { notify } = useUI()
  const ref = useRef(null)
  const [queue, setQueue] = useState([]) // atividades esperando escolha: [{ a, candidates }]
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const g = useGarmin()
  // Atividades do Garmin que esperam escolha (busca automática): entram na mesma fila.
  const gq = (g?.pending ?? []).map((p) => ({ a: p.a, garmin: true, candidates: p.candidateIds.map(getWorkout).filter((w) => w && w.status !== 'feito' && !w.result) }))
  const all = [...queue, ...gq]
  const attach = (w, a) => {
    saveWorkout({ ...w, status: 'feito', result: resultFrom(a, w.result) })
    return `${a.title || a.fileName}: “${w.name}” marcado como feito (${String(a.distanceKm.toFixed(2)).replace('.', ',')} km, ${fmtSec(a.elapsedSec)}).`
  }
  const onFiles = async (e) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    const lines = []
    const pending = []
    for (const f of files.slice(0, 20)) {
      try {
        if (f.size > 30 * 1024 * 1024) throw new Error('arquivo grande demais (máx. 30 MB)')
        const a = await readActivityFile(f)
        const ws = getState().workouts
        const dupW = alreadyImported(ws, a)
        if (dupW) { lines.push(`${a.fileName}: já está em “${dupW.name}”.`); continue }
        const { auto, candidates } = matchActivity(ws, activityDate(a), sportFromFile(a))
        if (auto) lines.push(attach(auto, a))
        else pending.push({ a, candidates })
      } catch (err) {
        lines.push(`${f.name}: ${err.message}`)
      }
    }
    setBusy(false)
    setLog(lines)
    setQueue(pending)
    if (lines.length && !pending.length) notify(lines.length === 1 ? 'Atividade importada' : `${lines.length} arquivos processados`)
  }
  const cur = all[0]
  const resolve = (w) => {
    const line = w === 'avulso' ? (() => { const fw = freeWorkout(cur.a); saveWorkout(fw); return `${cur.a.title || cur.a.fileName}: registrado como treino avulso “${fw.name}”.` })() : w ? attach(w, cur.a) : `${cur.a.title || cur.a.fileName}: ignorado.`
    setLog((l) => [...l, line])
    if (cur.garmin) dropPending(cur.a.garminId)
    else setQueue((q) => q.slice(1))
  }
  return (
    <div className="activity-import" data-testid="activity-import">
      <button type="button" className="btn btn-block" disabled={busy} onClick={() => ref.current?.click()}><IconUpload /> {busy ? 'Lendo…' : 'Importar atividade do relógio'}</button>
      <input ref={ref} type="file" multiple accept=".gpx,.tcx,.fit,.zip,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml" hidden onChange={onFiles} data-testid="activity-files" />
      <p className="note" style={{ margin: '4px 2px 0' }}>.FIT, .ZIP (Garmin “Exportar original”), .TCX ou .GPX — pode escolher vários. Cada um vai para o treino planejado do dia.</p>
      {log.length > 0 && <ul className="ai-log small" data-testid="activity-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {cur && (
        <Sheet title="De qual treino é esta corrida?" onClose={() => resolve(null)}>
          <div data-testid="activity-pick">
            <p className="small" style={{ marginTop: 0 }}><b>{cur.garmin ? `Garmin: ${cur.a.title || 'atividade'}` : cur.a.fileName}</b> · {weekdayShort(activityDate(cur.a))} {formatDateBR(activityDate(cur.a))} · {String(cur.a.distanceKm.toFixed(2)).replace('.', ',')} km em {fmtSec(cur.a.elapsedSec)}</p>
            {cur.candidates.length ? (
              <div className="ai-cands">
                {cur.candidates.map((w) => (
                  <button key={w.id} type="button" className="btn btn-block" onClick={() => resolve(w)}>{w.name} · {weekdayShort(w.date)} {formatDateBR(w.date).slice(0, 5)}</button>
                ))}
              </div>
            ) : <p className="small muted">Nenhum treino planejado perto desta data.</p>}
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => resolve('avulso')} data-testid="activity-free">Registrar como treino avulso</button>
            <button type="button" className="link-btn muted-btn" onClick={() => resolve(null)}>{cur.garmin ? 'Ignorar esta atividade' : 'Ignorar este arquivo'}</button>
            {all.length > 1 && <p className="note">Mais {all.length - 1} {all.length - 1 === 1 ? 'atividade' : 'atividades'} depois desta.</p>}
          </div>
        </Sheet>
      )}
      {log.length > 0 && !cur && <Link to="/treinos" className="link-btn" onClick={() => setLog([])}>Fechar</Link>}
    </div>
  )
}
