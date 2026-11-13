// Treinos estruturados criados por você (ou pelo seu treinador): passos com duração e alvo,
// blocos de repetição, agenda e o que foi executado. O app NÃO prescreve treinos.
import { isValidISODate } from './dates.js'

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const newId = () => Math.random().toString(36).slice(2, 10)
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)

export const STEP_TYPES = [
  { id: 'aquecimento', label: 'Aquecimento', intensity: 'warmup' },
  { id: 'corrida', label: 'Corrida', intensity: 'active' },
  { id: 'tiro', label: 'Tiro', intensity: 'active' },
  { id: 'recuperacao', label: 'Recuperação', intensity: 'recovery' },
  { id: 'descanso', label: 'Descanso (parado)', intensity: 'rest' },
  { id: 'desaquecimento', label: 'Desaquecimento', intensity: 'cooldown' }
]
export const STEP_BY_ID = Object.fromEntries(STEP_TYPES.map((t) => [t.id, t]))
export const WORKOUT_STATUSES = [
  { id: 'planejado', label: 'Planejado' },
  { id: 'feito', label: 'Feito' },
  { id: 'pulado', label: 'Não fiz' }
]

/**
 * Passo: { id, kind: 'step', type, duration: { kind: 'time'|'distance'|'lap', value }, target: { kind: 'none'|'pace'|'hr', min, max } }
 *   time: segundos · distance: metros · lap: até apertar o botão de volta
 *   pace: segundos por km (min = mais rápido, max = mais lento) · hr: bpm
 * Bloco: { id, kind: 'repeat', times, steps: [passos] } (um nível, como no relógio)
 */
export function newStep(type = 'corrida', o = {}) {
  const base = {
    aquecimento: { duration: { kind: 'time', value: 600 } },
    corrida: { duration: { kind: 'time', value: 1800 } },
    tiro: { duration: { kind: 'distance', value: 400 } },
    recuperacao: { duration: { kind: 'time', value: 120 } },
    descanso: { duration: { kind: 'time', value: 60 } },
    desaquecimento: { duration: { kind: 'time', value: 600 } }
  }[type] ?? { duration: { kind: 'time', value: 600 } }
  return { id: newId(), kind: 'step', type, target: { kind: 'none', min: null, max: null }, ...base, ...o }
}

export function newRepeat(times = 4) {
  return { id: newId(), kind: 'repeat', times, steps: [newStep('tiro'), newStep('recuperacao')] }
}

function normalizeStep(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = STEP_BY_ID[raw.type] ? raw.type : 'corrida'
  const dk = ['time', 'distance', 'lap'].includes(raw.duration?.kind) ? raw.duration.kind : 'time'
  const dv = dk === 'lap' ? null : num(Number(raw.duration?.value), 1, dk === 'time' ? 6 * 3600 : 100000)
  if (dk !== 'lap' && dv == null) return null
  const tk = ['none', 'pace', 'hr'].includes(raw.target?.kind) ? raw.target.kind : 'none'
  let min = null
  let max = null
  if (tk === 'pace') {
    min = num(Number(raw.target.min), 120, 1200)
    max = num(Number(raw.target.max), 120, 1200)
  } else if (tk === 'hr') {
    min = num(Number(raw.target.min), 40, 230)
    max = num(Number(raw.target.max), 40, 230)
  }
  if (min != null && max != null && min > max) [min, max] = [max, min]
  const target = tk !== 'none' && min != null && max != null ? { kind: tk, min: Math.round(min), max: Math.round(max) } : { kind: 'none', min: null, max: null }
  return { id: str(raw.id, 20) || newId(), kind: 'step', type, duration: { kind: dk, value: dv == null ? null : Math.round(dv) }, target, name: str(raw.name, 40) }
}

function normalizeItem(raw) {
  if (raw?.kind === 'repeat') {
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(normalizeStep).filter(Boolean).slice(0, 10)
    const times = Math.round(num(Number(raw.times), 1, 99) ?? 1)
    return steps.length ? { id: str(raw.id, 20) || newId(), kind: 'repeat', times, steps } : null
  }
  return normalizeStep(raw)
}

export function emptyWorkout() {
  return { id: null, name: '', date: null, status: 'planejado', raceId: null, notes: '', items: [], result: null, createdAt: null, updatedAt: null }
}

export function normalizeWorkout(raw) {
  const w = { ...emptyWorkout(), ...(raw && typeof raw === 'object' ? raw : {}) }
  w.name = str(w.name, 60)
  w.date = isValidISODate(w.date) ? w.date : null
  w.status = WORKOUT_STATUSES.some((s) => s.id === w.status) ? w.status : 'planejado'
  w.raceId = str(w.raceId, 60) || null
  w.notes = str(w.notes, 1000)
  w.items = (Array.isArray(w.items) ? w.items : []).map(normalizeItem).filter(Boolean).slice(0, 30)
  w.result = normalizeResult(w.result)
  return w
}

function normalizeResult(r) {
  if (!r || typeof r !== 'object') return null
  const laps = (Array.isArray(r.laps) ? r.laps : []).map((l) => ({ sec: num(Number(l?.sec), 0, 86400), distanceKm: num(Number(l?.distanceKm), 0, 500) })).filter((l) => l.sec != null).slice(0, 200)
  return {
    distanceKm: num(Number(r.distanceKm), 0, 500),
    elapsedSec: num(Number(r.elapsedSec), 0, 86400 * 2),
    avgHr: num(Number(r.avgHr), 30, 250),
    fileName: str(r.fileName, 120),
    laps,
    effort: num(Number(r.effort), 1, 10),
    notes: str(r.notes, 1000)
  }
}

export function validateWorkout(w) {
  const e = {}
  if (!w.name) e.name = 'Dê um nome ao treino.'
  if (!w.items.length) e.items = 'Adicione pelo menos um passo.'
  return e
}

/* ---------- Leitura ---------- */

/** Passos na ordem em que serão executados (repetições expandidas). */
export function flatten(items) {
  const out = []
  for (const it of items) {
    if (it.kind === 'repeat') for (let i = 0; i < it.times; i++) it.steps.forEach((s, j) => out.push({ ...s, rep: i + 1, of: it.times, blockStep: j }))
    else out.push(it)
  }
  return out
}

export const fmtSec = (s) => {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const ss = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}
export const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function durationLabel(d) {
  if (d.kind === 'lap') return 'até o botão de volta'
  if (d.kind === 'distance') return d.value >= 1000 && d.value % 100 === 0 ? `${String(d.value / 1000).replace('.', ',')} km` : `${d.value} m`
  return d.value % 60 === 0 && d.value < 3600 ? `${d.value / 60} min` : fmtSec(d.value)
}

export function targetLabel(t) {
  if (t.kind === 'pace') return `${fmtPace(t.min)}–${fmtPace(t.max)}/km`
  if (t.kind === 'hr') return `FC ${t.min}–${t.max}`
  return ''
}

const shortType = { aquecimento: 'aquec.', corrida: '', tiro: '', recuperacao: 'rec.', descanso: 'desc.', desaquecimento: 'desaq.' }
const stepShort = (s) => [durationLabel(s.duration), shortType[s.type], s.target.kind !== 'none' ? `@ ${targetLabel(s.target)}` : ''].filter(Boolean).join(' ')

/** Resumo em uma linha: "10 min aquec. + 6×(800 m @ 4:50–5:10/km + 2 min rec.) + 10 min desaq." */
export function summary(items) {
  return items.map((it) => (it.kind === 'repeat' ? `${it.times}×(${it.steps.map(stepShort).join(' + ')})` : stepShort(it))).join(' + ')
}

/**
 * Estimativa de tempo e distância. Usa o alvo de pace (meio da faixa) ou um pace de referência
 * (padrão 6:00/km) quando o passo não tem alvo. Passos "até o botão" não entram.
 */
export function estimate(items, refPace = 360) {
  let sec = 0
  let m = 0
  let open = 0
  for (const s of flatten(items)) {
    const pace = s.target.kind === 'pace' ? (s.target.min + s.target.max) / 2 : s.type === 'descanso' ? null : refPace
    if (s.duration.kind === 'lap') { open++; continue }
    if (s.duration.kind === 'time') {
      sec += s.duration.value
      if (pace) m += (s.duration.value / pace) * 1000
    } else {
      m += s.duration.value
      sec += pace ? (s.duration.value / 1000) * pace : 0
    }
  }
  return { sec: Math.round(sec), km: Math.round(m / 10) / 100, open }
}

/* ---------- Planejado x executado ---------- */

/**
 * Compara cada passo com a volta correspondente do relógio (o relógio fecha uma volta por passo).
 * [{ step, lap, paceSec, inTarget }]; voltas extras ou faltando ficam marcadas.
 */
export function compareLaps(items, laps) {
  const steps = flatten(items)
  return steps.map((step, i) => {
    const lap = laps?.[i] ?? null
    const paceSec = lap && lap.distanceKm > 0.02 ? lap.sec / lap.distanceKm : null
    let inTarget = null
    if (lap && step.target.kind === 'pace' && paceSec) inTarget = paceSec >= step.target.min - 3 && paceSec <= step.target.max + 3
    return { step, lap, paceSec, inTarget }
  })
}

/* ---------- Modelos de estrutura (para editar; não são prescrição) ---------- */

export const TEMPLATES = [
  { id: 'rodagem', name: 'Rodagem', items: () => [newStep('corrida', { duration: { kind: 'time', value: 2400 } })] },
  { id: 'intervalado', name: 'Intervalado', items: () => [newStep('aquecimento'), { ...newRepeat(6), steps: [newStep('tiro', { duration: { kind: 'distance', value: 800 } }), newStep('recuperacao')] }, newStep('desaquecimento')] },
  { id: 'tempo', name: 'Ritmo contínuo', items: () => [newStep('aquecimento'), newStep('corrida', { duration: { kind: 'time', value: 1200 } }), newStep('desaquecimento')] },
  { id: 'livre', name: 'Em branco', items: () => [] }
]

