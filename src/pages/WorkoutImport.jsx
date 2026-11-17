// Importar treinos de um link (#p=…) ou de um arquivo .json: confere a lista e adiciona (não apaga nada).
import { useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { saveWorkout, useStore } from '../services/store.js'
import { TopBar, useUI } from '../components/ui.jsx'
import { decodePlan } from '../lib/workoutShare.js'
import { estimate, fmtSec, plannedSec, summary, workoutLine } from '../lib/workout.js'
import { formatDateBR, weekdayShort } from '../lib/dates.js'

/** Passos sem ids (para comparar o conteúdo). */
const strip = (items) => items.map(({ id, ...it }) => (it.kind === 'repeat' ? { ...it, steps: strip(it.steps) } : it))

export default function WorkoutImport() {
  const { hash } = useLocation()
  const nav = useNavigate()
  const { notify } = useUI()
  const { workouts } = useStore()
  const fileRef = useRef(null)
  const [fromFile, setFromFile] = useState(null)
  const parsed = useMemo(() => {
    const raw = fromFile ?? new URLSearchParams(hash.replace(/^#/, '')).get('p')
    if (!raw) return null
    try {
      return { ok: true, ...decodePlan(raw) }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }, [hash, fromFile])
  // Mesmo nome e data: igual → não repete; diferente (ex.: ganhou faixas de pace) → atualiza os passos e as observações,
  // mantendo o status (feito/planejado) e o resultado.
  const sameAs = (w) => workouts.find((x) => x.name === w.name && x.date === w.date) ?? null
  const changed = (w, x) => JSON.stringify(strip(w.items)) !== JSON.stringify(strip(x.items)) || (w.notes || '') !== (x.notes || '')
  const exists = (w) => { const x = sameAs(w); return !!x && !changed(w, x) }
  const toUpdate = (w) => { const x = sameAs(w); return !!x && changed(w, x) }
  const add = () => {
    let n = 0
    let u = 0
    for (const w of parsed.workouts) {
      const x = sameAs(w)
      if (x && !changed(w, x)) continue
      if (x) { saveWorkout({ ...x, items: w.items, notes: w.notes }); u++ }
      else { saveWorkout({ ...w, id: null, status: 'planejado', result: null }); n++ }
    }
    notify(n || u ? [n ? `${n} ${n === 1 ? 'adicionado' : 'adicionados'}` : null, u ? `${u} ${u === 1 ? 'atualizado' : 'atualizados'}` : null].filter(Boolean).join(', ') : 'Esses treinos já estavam no app')
    nav('/treinos', { replace: true })
  }
  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setFromFile(await f.text())
  }
  return (
    <>
      <TopBar title="Importar treinos" back="/treinos" />
      <div className="page" data-testid="wk-import">
        {!parsed && (
          <div className="card small">
            <p style={{ marginTop: 0 }}>Abra um link de treinos do PaceOn ou escolha um arquivo .json de treinos.</p>
            <button type="button" className="btn btn-block" onClick={() => fileRef.current?.click()}>Escolher arquivo</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} data-testid="wk-import-file" />
        {parsed && !parsed.ok && <div className="alert alert-error" role="alert"><div>{parsed.error}</div></div>}
        {parsed?.ok && (
          <>
            <div className="card">
              <b>{parsed.title}</b>
              <div className="muted small">{parsed.workouts.length} treinos · nada do que já está no app é apagado</div>
            </div>
            {parsed.workouts.map((w, i) => (
              <div key={i} className="card wk-imp" data-testid="wk-import-item">
                <div className="wk-imp-top"><b>{w.name}</b><span className="muted small">{w.date ? `${weekdayShort(w.date)} ${formatDateBR(w.date).slice(0, 5)}` : 'sem data'}</span></div>
                <div className="small muted">{workoutLine(w)} · ≈ {fmtSec(plannedSec(w))}</div>
                {exists(w) && <div className="small" style={{ marginTop: 4 }}>Já está no app (não será repetido).</div>}
                {toUpdate(w) && <div className="small" style={{ marginTop: 4 }} data-testid="wk-import-update">Já está no app: os passos serão atualizados (o status e o resultado ficam).</div>}
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={add} data-testid="wk-import-add">{(() => { const n = parsed.workouts.filter((w) => !sameAs(w)).length; const u = parsed.workouts.filter(toUpdate).length; const parts = [n ? `Adicionar ${n}` : null, u ? `${n ? 'atualizar' : 'Atualizar'} ${u}` : null].filter(Boolean); return parts.length ? `${parts.join(' e ')} ${n + u === 1 ? 'treino' : 'treinos'}` : 'Adicionar 0 treinos' })()}</button>
            <p className="note">Os treinos entram como planejados, com as datas acima. Dá para mudar a data ou os passos depois, em cada treino. <Link to="/treinos">Cancelar</Link></p>
          </>
        )}
      </div>
    </>
  )
}
