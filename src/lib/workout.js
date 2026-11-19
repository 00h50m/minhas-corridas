// Treinos estruturados criados por você (ou pelo seu treinador): passos com duração e alvo,
// blocos de repetição, agenda e o que foi executado. O app NÃO prescreve treinos.
import { isValidISODate } from './dates.js'
import { gymDurationSec, normalizeGymLog } from './gymSession.js'

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
/** Tipo de atividade. Só a corrida tem passos, pace, arquivo de treino e entra nas marcas. */
export const SPORTS = [
  { id: 'corrida', label: 'Corrida', icon: '🏃‍♀️' },
  { id: 'academia', label: 'Academia / força', icon: '🏋️' },
  { id: 'bike', label: 'Bike', icon: '🚴' },
  { id: 'natacao', label: 'Natação', icon: '🏊' },
  { id: 'caminhada', label: 'Caminhada', icon: '🚶' },
  { id: 'alongamento', label: 'Alongamento / ioga', icon: '🧘' },
  { id: 'outro', label: 'Outra atividade', icon: '✨' }
]
export const SPORT_BY_ID = Object.fromEntries(SPORTS.map((t) => [t.id, t]))
export const isRun = (w) => (w?.sport ?? 'corrida') === 'corrida'
export const sportOf = (w) => SPORT_BY_ID[w?.sport] ?? SPORT_BY_ID.corrida

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
  return { id: null, name: '', sport: 'corrida', plannedMin: null, exercises: [], date: null, moves: [], status: 'planejado', raceId: null, goalId: null, notes: '', items: [], result: null, createdAt: null, updatedAt: null }
}

export function normalizeWorkout(raw) {
  const w = { ...emptyWorkout(), ...(raw && typeof raw === 'object' ? raw : {}) }
  w.name = str(w.name, 60)
  w.sport = SPORT_BY_ID[w.sport] ? w.sport : 'corrida'
  w.plannedMin = w.sport === 'corrida' ? null : num(Math.round(Number(w.plannedMin)), 1, 600)
  w.date = isValidISODate(w.date) ? w.date : null
  // Remanejamentos: [{ from, to, at, auto }] (o mais recente por último)
  w.moves = (Array.isArray(w.moves) ? w.moves : []).filter((m) => m && isValidISODate(m.from) && isValidISODate(m.to)).map((m) => ({ from: m.from, to: m.to, at: isValidISODate(m.at) ? m.at : m.to, auto: m.auto === true })).slice(-10)
  w.status = WORKOUT_STATUSES.some((s) => s.id === w.status) ? w.status : 'planejado'
  w.raceId = str(w.raceId, 60) || null
  w.goalId = str(w.goalId, 60) || null // objetivo a que este treino pertence (plano)
  w.notes = str(w.notes, 1000)
  // Ficha da academia: [{ cat (categoria Garmin ou null), sets, reps, kg }]
  w.exercises = w.sport === 'academia' ? (Array.isArray(w.exercises) ? w.exercises : []).filter((x) => x && typeof x === 'object').slice(0, 20).map((x) => {
    const n = (v, a, b) => (v == null || v === '' ? null : num(Number(String(v).replace(',', '.')), a, b))
    const t = (v, k) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, k) : '')
    const out = { cat: n(x.cat, 0, 65535), sets: n(x.sets, 1, 20) ?? 3, reps: n(x.reps, 1, 200), kg: n(x.kg, 0, 500) }
    // Da ficha do treinador: nome livre, repetições e descanso como estão escritos, observação e conjugado
    for (const [k, len] of [['name', 80], ['repsText', 120], ['rest', 40], ['note', 80]]) if (t(x[k], len)) out[k] = t(x[k], len)
    if (x.withNext === true) out.withNext = true
    return out
  }) : []
  // Séries anotadas no “treinando agora” (carga e repetições por série)
  w.gymLog = w.sport === 'academia' ? normalizeGymLog(w.gymLog) : null
  // Treino da ficha da academia (qual treino A/B/C… foi feito)
  w.ficha = w.sport === 'academia' && w.ficha && typeof w.ficha === 'object' && typeof w.ficha.programId === 'string' && typeof w.ficha.sheetId === 'string'
    ? { programId: w.ficha.programId.slice(0, 20), sheetId: w.ficha.sheetId.slice(0, 20), label: String(w.ficha.label ?? '').slice(0, 20) }
    : null
  w.items = w.sport === 'corrida' ? (Array.isArray(w.items) ? w.items : []).map(normalizeItem).filter(Boolean).slice(0, 30) : []
  w.result = normalizeResult(w.result)
  return w
}

function normalizeResult(r) {
  if (!r || typeof r !== 'object') return null
  const laps = (Array.isArray(r.laps) ? r.laps : []).map((l) => { const hr = num(Number(l?.avgHr), 30, 250); return { sec: num(Number(l?.sec), 0, 86400), distanceKm: num(Number(l?.distanceKm), 0, 500), ...(hr ? { avgHr: Math.round(hr) } : {}) } }).filter((l) => l.sec != null).slice(0, 200)
  return {
    distanceKm: num(Number(r.distanceKm), 0, 500),
    elapsedSec: num(Number(r.elapsedSec), 0, 86400 * 2),
    avgHr: num(Number(r.avgHr), 30, 250),
    fileName: str(r.fileName, 120),
    laps,
    // traçado (polyline codificada, sem início e fim): só caracteres do formato
    maxHr: num(Number(r.maxHr), 30, 250),
    // Parciais por km (corrida/caminhada/bike), como no resultado da prova
    splits: (Array.isArray(r.splits) ? r.splits : []).filter((x) => x && num(Number(x.km), 0, 500) != null && num(Number(x.sec), 1, 86400) != null).slice(0, 60).map((x) => ({ km: x.km, sec: Math.round(x.sec), ...(x.partial ? { partial: Math.round(x.partial) } : {}) })),
    elevGainM: num(Number(r.elevGainM), 0, 20000),
    calories: num(Number(r.calories), 1, 20000),
    aerobicTE: num(Number(r.aerobicTE), 0.1, 5),
    anaerobicTE: num(Number(r.anaerobicTE), 0.1, 5),
    cadence: num(Number(r.cadence), 20, 260),
    // Séries de força: { cat (categoria Garmin), reps, kg, sec }
    sets: (Array.isArray(r.sets) ? r.sets : []).filter((x) => x && typeof x === 'object').slice(0, 80).map((x) => { const n = (v, a, b) => (v == null || v === '' ? null : num(Number(v), a, b)); return { cat: n(x.cat, 0, 65535), reps: n(x.reps, 0, 1000), kg: n(x.kg, 0, 1000), sec: n(x.sec, 0, 7200) } }),
    // Tempo em cada faixa de 5 bpm a partir de 60 bpm (32 faixas): zonas de FC
    hrHist: Array.isArray(r.hrHist) && r.hrHist.length === 32 && r.hrHist.every((x) => Number.isFinite(x) && x >= 0 && x < 86400) ? r.hrHist.map(Math.round) : null,
    garminId: typeof r.garminId === 'string' && /^\d{1,20}$/.test(r.garminId) ? r.garminId : null,
    track: typeof r.track === 'string' && r.track.length <= 12000 && /^[\x3f-\x7e]+$/.test(r.track) ? r.track : null,
    effort: num(Number(r.effort), 1, 10),
    notes: str(r.notes, 1000)
  }
}

export function validateWorkout(w) {
  const e = {}
  if (!w.name) e.name = 'Dê um nome ao treino.'
  if (isRun(w) && !w.items.length) e.items = 'Adicione pelo menos um passo.'
  if (!isRun(w) && !w.plannedMin) e.plannedMin = 'Informe quantos minutos (ex.: 45).'
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

/** Tempo feito (s): o do relógio; sem arquivo, o anotado na academia; senão, o planejado. */
export function doneSec(w) {
  return w.result?.elapsedSec > 0 ? w.result.elapsedSec : gymDurationSec(w.gymLog) ?? plannedSec(w)
}

/** Tempo planejado de qualquer atividade (s): estimativa dos passos na corrida, minutos nas outras. */
export function plannedSec(w) {
  return isRun(w) ? estimate(w.items).sec : (w.plannedMin ?? 0) * 60
}

/** Linha de resumo de qualquer atividade (passos na corrida; tipo e minutos nas outras). */
export function workoutLine(w) {
  if (isRun(w)) return summary(w.items)
  const s = sportOf(w)
  const ex = w.exercises?.length ? ` · ${w.exercises.length} ${w.exercises.length === 1 ? 'exercício' : 'exercícios'}` : ''
  return `${s.label}${w.plannedMin ? ` · ${w.plannedMin} min` : ''}${ex}`
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

