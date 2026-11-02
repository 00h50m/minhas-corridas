import { useRef, useState } from 'react'
import { addFile, checkFile } from '../services/files.js'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getRace, saveRace } from '../services/store.js'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { IconCamera, IconInfo, IconX } from '../components/Icons.jsx'
import { emptyResult, validateResult } from '../lib/model.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { durationToInput, formatDuration, formatPace, kmToInput, paceSeconds, parseDuration, parseKm } from '../lib/format.js'

function toInt(s) {
  if (s === '' || s == null) return null
  return /^\d+$/.test(String(s).trim()) ? Number(s) : NaN
}

export default function ResultForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { notify } = useUI()
  const race = getRace(id)
  const base = race?.result ?? { ...emptyResult(), officialDistanceKm: race?.distanceKm ?? null }
  const [f, setF] = useState(() => ({
    officialDistanceKm: kmToInput(base.officialDistanceKm),
    watchDistanceKm: kmToInput(base.watchDistanceKm),
    netTime: durationToInput(base.netTime),
    grossTime: durationToInput(base.grossTime),
    overallPlace: base.overallPlace ?? '',
    categoryPlace: base.categoryPlace ?? '',
    category: base.category ?? '',
    officialUrl: base.officialUrl ?? '',
    isOfficial: base.isOfficial !== false,
    effort: base.effort,
    report: base.report ?? ''
  }))
  const [errors, setErrors] = useState({})
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const photoRef = useRef()

  if (!race) return <Navigate to="/corridas" replace />

  const today = todayISO()
  const dateProblem = !race.date ? 'Defina a data da prova antes de registrar o resultado.' : race.date > today ? `A prova está marcada para ${formatDateBR(race.date)}, que ainda não chegou.` : null

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const off = parseKm(f.officialDistanceKm)
  const net = parseDuration(f.netTime)
  const livePace = paceSeconds(net, off)

  const onSubmit = async (e) => {
    e.preventDefault()
    const errs = {}
    const res = {
      officialDistanceKm: off,
      watchDistanceKm: null,
      netTime: net,
      grossTime: null,
      overallPlace: null,
      categoryPlace: null,
      category: f.category.trim(),
      officialUrl: f.officialUrl.trim(),
      isOfficial: f.isOfficial,
      effort: f.effort ?? null,
      report: f.report.trim()
    }
    if (f.officialDistanceKm && off == null) errs.officialDistanceKm = 'Use km, ex.: 5 ou 21,1.'
    if (f.netTime && net == null) errs.netTime = 'Use mm:ss ou h:mm:ss, ex.: 28:45 ou 1:05:30.'
    if (f.watchDistanceKm) {
      res.watchDistanceKm = parseKm(f.watchDistanceKm)
      if (res.watchDistanceKm == null) errs.watchDistanceKm = 'Use km, ex.: 5,08.'
    }
    if (f.grossTime) {
      res.grossTime = parseDuration(f.grossTime)
      if (res.grossTime == null) errs.grossTime = 'Use mm:ss ou h:mm:ss.'
    }
    for (const k of ['overallPlace', 'categoryPlace']) {
      const n = toInt(f[k])
      if (Number.isNaN(n)) errs[k] = 'Use só números.'
      else res[k] = n
    }
    const all = { ...validateResult(res), ...errs }
    const clean = Object.fromEntries(Object.entries(all).filter(([, v]) => v))
    setErrors(clean)
    if (Object.keys(clean).length || dateProblem) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    try {
      saveRace({ ...race, status: 'concluida', result: res })
    } catch (err) {
      setErrors({ form: err.message })
      return
    }
    let failed = 0
    if (photos.length) {
      setSaving(true)
      for (const file of photos) {
        try {
          await addFile(race.id, 'foto', file)
        } catch {
          failed++
        }
      }
    }
    notify(failed ? `Resultado salvo, mas ${failed} ${failed === 1 ? 'foto não pôde' : 'fotos não puderam'} ser guardada(s).` : race.result ? 'Resultado atualizado' : 'Resultado registrado. Parabéns!')
    nav(`/corridas/${race.id}`, { replace: true })
  }

  const onPhotos = (e) => {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    const bad = picked.map(checkFile).filter(Boolean)
    setErrors((p) => ({ ...p, photos: bad.length ? bad.join(' ') : undefined }))
    setPhotos((p) => [...p, ...picked.filter((f) => !checkFile(f) && f.type.startsWith('image/'))])
  }

  const inv = (k) => (errors[k] ? 'true' : 'false')

  return (
    <>
      <TopBar title="Resultado" sub={race.name} back={`/corridas/${race.id}`} />
      <form className="page form" onSubmit={onSubmit} noValidate>
        {dateProblem && (
          <div className="alert alert-warn" role="alert" style={{ marginBottom: 12 }}>
            <div>{dateProblem} <Link to={`/corridas/${race.id}/editar`}>Editar data</Link></div>
          </div>
        )}

        <div className="card">
          <div className="grid-2">
            <Field label="Tempo líquido" htmlFor="netTime" error={errors.netTime} hint="Chip: da largada à chegada.">
              <input id="netTime" className="input" inputMode="numeric" value={f.netTime} onChange={set('netTime')} aria-invalid={inv('netTime')} placeholder="mm:ss" autoFocus />
            </Field>
            <Field label="Tempo bruto" optional htmlFor="grossTime" error={errors.grossTime} hint="Desde o tiro de largada.">
              <input id="grossTime" className="input" inputMode="numeric" value={f.grossTime} onChange={set('grossTime')} aria-invalid={inv('grossTime')} placeholder="mm:ss" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Distância oficial" htmlFor="officialDistanceKm" error={errors.officialDistanceKm} hint="A da prova (km).">
              <input id="officialDistanceKm" className="input" inputMode="decimal" value={f.officialDistanceKm} onChange={set('officialDistanceKm')} aria-invalid={inv('officialDistanceKm')} placeholder="km" />
            </Field>
            <Field label="No relógio" optional htmlFor="watchDistanceKm" error={errors.watchDistanceKm} hint="O que o GPS marcou.">
              <input id="watchDistanceKm" className="input" inputMode="decimal" value={f.watchDistanceKm} onChange={set('watchDistanceKm')} aria-invalid={inv('watchDistanceKm')} placeholder="km" />
            </Field>
          </div>
          <div className="alert alert-ok" aria-live="polite">
            <div><b>Pace médio:</b> {livePace ? formatPace(livePace) : 'preencha tempo e distância oficial'}{livePace && net ? ` · ${formatDuration(net)}` : ''}</div>
          </div>
          {race.targetTime && net && (
            <p className="note">Meta para esta prova: {formatDuration(race.targetTime)} — {net <= race.targetTime ? 'batida!' : `${formatDuration(net - race.targetTime)} acima`}</p>
          )}
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={f.isOfficial} onChange={set('isOfficial')} />
            Tempo do resultado oficial da organização
          </label>
          {!f.isOfficial && <p className="hint">Será marcado como registro pessoal (ex.: tempo do relógio) e aparece separado nos recordes.</p>}
        </div>

        <details className="section" open={!!(base.overallPlace || base.category || base.officialUrl)}>
          <summary>Classificação<span className="sum">{f.overallPlace && `${f.overallPlace}º geral`}</span></summary>
          <div className="body">
            <div className="grid-2">
              <Field label="Geral" htmlFor="overallPlace" error={errors.overallPlace}>
                <input id="overallPlace" className="input" inputMode="numeric" value={f.overallPlace} onChange={set('overallPlace')} aria-invalid={inv('overallPlace')} placeholder="º" />
              </Field>
              <Field label="Na categoria" htmlFor="categoryPlace" error={errors.categoryPlace}>
                <input id="categoryPlace" className="input" inputMode="numeric" value={f.categoryPlace} onChange={set('categoryPlace')} aria-invalid={inv('categoryPlace')} placeholder="º" />
              </Field>
            </div>
            <Field label="Categoria" htmlFor="category"><input id="category" className="input" value={f.category} onChange={set('category')} placeholder="Ex.: F 30-34" /></Field>
            <Field label="Link do resultado oficial" htmlFor="officialUrl" error={errors.officialUrl}>
              <input id="officialUrl" type="url" inputMode="url" className="input" value={f.officialUrl} onChange={set('officialUrl')} aria-invalid={inv('officialUrl')} placeholder="https://" />
            </Field>
          </div>
        </details>

        <details className="section" open>
          <summary>Como foi?</summary>
          <div className="body">
            <Field label="Esforço percebido (1 a 10)" error={errors.effort}>
              <div className="effort" role="group" aria-label="Esforço percebido">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button type="button" key={n} aria-pressed={f.effort === n} onClick={() => set('effort')(f.effort === n ? null : n)}>{n}</button>
                ))}
              </div>
              <div className="hint">1 = muito leve · 10 = esforço máximo</div>
            </Field>
            <Field label="Relato" htmlFor="report"><textarea id="report" className="input" value={f.report} onChange={set('report')} placeholder="Clima, percurso, como se sentiu…" /></Field>
          </div>
        </details>

        <details className="section" open={photos.length > 0}>
          <summary>Fotos<span className="sum">{photos.length ? `${photos.length} para salvar` : 'opcional'}</span></summary>
          <div className="body" style={{ paddingBottom: 16 }}>
            {photos.length > 0 && (
              <ul className="file-list">
                {photos.map((p, i) => (
                  <li key={i}>
                    <span className="file-meta"><b>{p.name}</b></span>
                    <button type="button" className="mini-btn" aria-label={`Tirar ${p.name}`} onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}><IconX /></button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-block" onClick={() => photoRef.current?.click()}><IconCamera /> Escolher fotos</button>
            <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={onPhotos} data-testid="result-photo-input" />
            {errors.photos && <div className="err" role="alert">{errors.photos}</div>}
            <p className="note">As fotos ficam só neste aparelho. Depois você pode ver, adicionar ou excluir no detalhe da prova.</p>
          </div>
        </details>

        {errors.form && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>{errors.form}</div>}
        {Object.keys(errors).filter((k) => errors[k] && k !== 'photos').length > 0 && !errors.form && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}><IconInfo /><div>Confira os campos destacados.</div></div>
        )}

        <div className="sticky-actions">
          <button type="submit" className="btn btn-primary" disabled={!!dateProblem || saving}>{saving ? 'Salvando fotos…' : race.result ? 'Salvar resultado' : 'Concluir prova'}</button>
        </div>
      </form>
    </>
  )
}
