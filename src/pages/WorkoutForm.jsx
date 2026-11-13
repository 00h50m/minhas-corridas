// Editor de treino estruturado: passos (aquecimento, corrida, tiro, recuperação…), blocos de repetição,
// duração por tempo, distância ou botão de volta, e alvo de pace ou frequência cardíaca.
import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getWorkout, saveWorkout, useStore } from '../services/store.js'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import { STEP_TYPES, TEMPLATES, emptyWorkout, estimate, fmtPace, fmtSec, newRepeat, newStep, normalizeWorkout, summary, validateWorkout } from '../lib/workout.js'
import { formatDateBR, isValidISODate, todayISO } from '../lib/dates.js'
import { parseDuration } from '../lib/format.js'

export default function WorkoutForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const editing = id ? getWorkout(id) : null
  if (id && !editing) return <Navigate to="/treinos" replace />
  const copyOf = params.get('copiar') ? getWorkout(params.get('copiar')) : null
  return <Editor key={id || 'novo'} initial={editing ?? (copyOf ? { ...copyOf, id: null, name: `${copyOf.name} (cópia)`.slice(0, 60), status: 'planejado', result: null, date: null } : { ...emptyWorkout(), date: isValidISODate(params.get('data')) ? params.get('data') : null })} isNew={!editing} />
}

function Editor({ initial, isNew }) {
  const nav = useNavigate()
  const { notify } = useUI()
  const { races } = useStore()
  const today = todayISO()
  const [w, setW] = useState(initial)
  const [errors, setErrors] = useState({})
  const [picked, setPicked] = useState(!isNew || initial.items.length > 0)
  const set = (patch) => setW((p) => ({ ...p, ...patch }))
  const setItems = (fn) => setW((p) => ({ ...p, items: fn(p.items) }))
  const upcoming = races.filter((r) => r.date && r.date >= today && r.status !== 'concluida').sort((a, b) => (a.date < b.date ? -1 : 1))

  const submit = (e) => {
    e.preventDefault()
    const n = normalizeWorkout(w)
    const errs = validateWorkout(n)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const saved = saveWorkout({ ...n, id: w.id })
    notify(isNew ? 'Treino criado' : 'Treino atualizado')
    nav(`/treinos/${saved.id}`, { replace: true })
  }

  const norm = normalizeWorkout(w)
  const est = estimate(norm.items)

  return (
    <>
      <TopBar title={isNew ? 'Novo treino' : 'Editar treino'} back="/treinos" />
      <form className="page" onSubmit={submit} noValidate data-testid="workout-form">
        <Field label="Nome" htmlFor="wk-name" error={errors.name}>
          <input id="wk-name" className="input" value={w.name} onChange={(e) => { set({ name: e.target.value }); setErrors((x) => ({ ...x, name: null })) }} maxLength={60} placeholder="Ex.: Tiros 6×800" />
        </Field>
        <div className="grid-2">
          <Field label="Data" optional htmlFor="wk-date">
            <input id="wk-date" className="input" type="date" value={w.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />
          </Field>
          <Field label="Preparação para" optional htmlFor="wk-race">
            <select id="wk-race" className="input" value={w.raceId ?? ''} onChange={(e) => set({ raceId: e.target.value || null })}>
              <option value="">—</option>
              {upcoming.map((r) => <option key={r.id} value={r.id}>{r.name} ({formatDateBR(r.date).slice(0, 5)})</option>)}
            </select>
          </Field>
        </div>

        {!picked ? (
          <div className="card" data-testid="wk-templates">
            <b>Como começar?</b>
            <p className="muted small" style={{ margin: '4px 0 10px' }}>Escolha uma estrutura para editar com os números da sua planilha ou do seu treinador. São só formatos de partida, não recomendações de treino.</p>
            <div className="seg">
              {TEMPLATES.map((t) => <button key={t.id} type="button" onClick={() => { set({ items: t.items(), name: w.name || (t.id === 'livre' ? '' : t.name) }); setPicked(true) }}>{t.name}</button>)}
            </div>
          </div>
        ) : (
          <>
            <div className="section-title"><h2>Passos</h2></div>
            {errors.items && <div className="err" role="alert">{errors.items}</div>}
            {w.items.map((it, i) => {
              const move = (d) => setItems((xs) => { const a = [...xs]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a })
              const tools = { first: i === 0, last: i === w.items.length - 1, up: () => move(-1), down: () => move(1), remove: () => setItems((xs) => xs.filter((_, j) => j !== i)) }
              const update = (v) => setItems((xs) => xs.map((x, j) => (j === i ? v : x)))
              return it.kind === 'repeat'
                ? <RepeatEditor key={it.id} block={it} onChange={update} tools={tools} />
                : <StepEditor key={it.id} step={it} onChange={update} tools={tools} />
            })}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => setItems((xs) => [...xs, newStep(xs.length ? 'corrida' : 'aquecimento')])} data-testid="wk-add-step"><IconPlus /> Passo</button>
              <button type="button" className="btn" onClick={() => setItems((xs) => [...xs, newRepeat(4)])} data-testid="wk-add-repeat"><IconPlus /> Repetição</button>
            </div>
            {norm.items.length > 0 && (
              <div className="card wk-preview" style={{ marginTop: 12 }} data-testid="wk-preview">
                <div className="small"><b>Resumo:</b> {summary(norm.items)}</div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  Estimativa: {fmtSec(est.sec)} · {String(est.km.toFixed(1)).replace('.', ',')} km{est.open ? ` + ${est.open} ${est.open === 1 ? 'passo' : 'passos'} até o botão` : ''}
                  <span className="opt"> (passos sem alvo de pace contam a 6:00/km)</span>
                </div>
              </div>
            )}
          </>
        )}

        <Field label="Observações" optional htmlFor="wk-notes">
          <textarea id="wk-notes" className="input" rows={3} value={w.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} placeholder="Ex.: na pista, tênis leve" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>{isNew ? 'Criar treino' : 'Salvar'}</button>
      </form>
    </>
  )
}

function Tools({ tools, label }) {
  return (
    <div className="wk-tools">
      <button type="button" className="link-btn" onClick={tools.up} disabled={tools.first} aria-label={`Subir ${label}`}>↑</button>
      <button type="button" className="link-btn" onClick={tools.down} disabled={tools.last} aria-label={`Descer ${label}`}>↓</button>
      <button type="button" className="link-btn muted-btn" onClick={tools.remove} aria-label={`Remover ${label}`}>Remover</button>
    </div>
  )
}

function RepeatEditor({ block, onChange, tools }) {
  const setSteps = (fn) => onChange({ ...block, steps: fn(block.steps) })
  return (
    <div className="card wk-repeat" data-testid="wk-repeat">
      <div className="wk-head">
        <label className="wk-times">
          Repetir
          <ParsedInput value={block.times} format={String} parse={parseTimes} onValue={(v) => onChange({ ...block, times: v })} inputMode="numeric" maxLength={2} aria-label="Número de repetições" data-testid="wk-times" />
          vezes
        </label>
        <Tools tools={tools} label="repetição" />
      </div>
      {block.steps.map((s, i) => {
        const move = (d) => setSteps((xs) => { const a = [...xs]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a })
        const t = { first: i === 0, last: i === block.steps.length - 1, up: () => move(-1), down: () => move(1), remove: () => (block.steps.length > 1 ? setSteps((xs) => xs.filter((_, j) => j !== i)) : tools.remove()) }
        return <StepEditor key={s.id} step={s} nested onChange={(v) => setSteps((xs) => xs.map((x, j) => (j === i ? v : x)))} tools={t} />
      })}
      <button type="button" className="link-btn" onClick={() => setSteps((xs) => [...xs, newStep('recuperacao')])}>+ Passo na repetição</button>
    </div>
  )
}

/** Campo de texto que só repassa o valor quando ele é válido (mantém o que foi digitado enquanto isso). */
function ParsedInput({ value, format, parse, onValue, ...rest }) {
  const [text, setText] = useState(value == null ? '' : format(value))
  const bad = text.trim() !== '' && parse(text) == null
  return (
    <input
      className="input"
      autoComplete="off"
      value={text}
      aria-invalid={bad ? 'true' : 'false'}
      onChange={(e) => { setText(e.target.value); const v = parse(e.target.value); if (v != null) onValue(v) }}
      onBlur={() => { const v = parse(text); if (v != null) setText(format(v)) }}
      {...rest}
    />
  )
}

const parseMeters = (s) => {
  const t = String(s).trim().toLowerCase().replace(',', '.')
  const km = t.match(/^(\d+(?:\.\d+)?)\s*km$/)
  const n = km ? Number(km[1]) * 1000 : /^\d+$/.test(t) ? Number(t) : NaN
  return n >= 10 && n <= 100000 ? Math.round(n) : null
}
const parsePace = (s) => { const v = parseDuration(s); return v != null && v >= 120 && v <= 1200 ? v : null }
const parseBpm = (s) => { const v = Number(String(s).trim()); return Number.isInteger(v) && v >= 40 && v <= 230 ? v : null }
const parseTimes = (s) => { const v = Number(String(s).trim()); return /^\d{1,2}$/.test(String(s).trim()) && v >= 1 ? v : null }
const parseTime = (s) => { const v = parseDuration(s); return v != null && v <= 6 * 3600 ? v : null }

function StepEditor({ step: s, onChange, tools, nested }) {
  const set = (patch) => onChange({ ...s, ...patch })
  const setDur = (kind) => set({ duration: kind === s.duration.kind ? s.duration : { kind, value: kind === 'time' ? 600 : kind === 'distance' ? 1000 : null } })
  const setTarget = (kind) => set({ target: kind === 'pace' ? { kind, min: 300, max: 330 } : kind === 'hr' ? { kind, min: 130, max: 150 } : { kind: 'none', min: null, max: null } })
  return (
    <div className={`${nested ? 'wk-step nested' : 'card wk-step'} t-${s.type}`} data-testid="wk-step">
      <div className="wk-head">
        <select className="input wk-type" value={s.type} onChange={(e) => set({ type: e.target.value })} aria-label="Tipo do passo">
          {STEP_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Tools tools={tools} label="passo" />
      </div>
      <div className="wk-row">
        <select className="input" value={s.duration.kind} onChange={(e) => setDur(e.target.value)} aria-label="Duração por">
          <option value="time">Tempo</option>
          <option value="distance">Distância</option>
          <option value="lap">Até o botão de volta</option>
        </select>
        {s.duration.kind === 'time' && <ParsedInput key="t" value={s.duration.value} format={fmtSec} parse={parseTime} onValue={(v) => set({ duration: { kind: 'time', value: v } })} inputMode="decimal" placeholder="10:00" aria-label="Tempo (min:seg)" />}
        {s.duration.kind === 'distance' && <ParsedInput key="d" value={s.duration.value} format={(v) => String(v)} parse={parseMeters} onValue={(v) => set({ duration: { kind: 'distance', value: v } })} inputMode="numeric" placeholder="metros" aria-label="Distância em metros" />}
      </div>
      <div className="wk-row">
        <select className="input" value={s.target.kind} onChange={(e) => setTarget(e.target.value)} aria-label="Alvo">
          <option value="none">Sem alvo</option>
          <option value="pace">Pace (min/km)</option>
          <option value="hr">Frequência cardíaca</option>
        </select>
        {s.target.kind === 'pace' && (
          <div className="wk-range">
            <ParsedInput key="pmin" value={s.target.min} format={fmtPace} parse={parsePace} onValue={(v) => set({ target: { ...s.target, min: v } })} inputMode="decimal" placeholder="4:50" aria-label="Pace mais rápido" />
            <span>a</span>
            <ParsedInput key="pmax" value={s.target.max} format={fmtPace} parse={parsePace} onValue={(v) => set({ target: { ...s.target, max: v } })} inputMode="decimal" placeholder="5:10" aria-label="Pace mais lento" />
          </div>
        )}
        {s.target.kind === 'hr' && (
          <div className="wk-range">
            <ParsedInput key="hmin" value={s.target.min} format={String} parse={parseBpm} onValue={(v) => set({ target: { ...s.target, min: v } })} inputMode="numeric" placeholder="130" aria-label="FC mínima" />
            <span>a</span>
            <ParsedInput key="hmax" value={s.target.max} format={String} parse={parseBpm} onValue={(v) => set({ target: { ...s.target, max: v } })} inputMode="numeric" placeholder="150" aria-label="FC máxima" />
          </div>
        )}
      </div>
    </div>
  )
}
