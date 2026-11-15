// Compartilhar treinos por link (ou arquivo .json): o pacote vai no fragmento da URL (#p=…),
// que o navegador não envia ao servidor. Ao abrir, a pessoa confere e adiciona aos seus treinos.
import { normalizeWorkout, validateWorkout, STEP_BY_ID, durationLabel, targetLabel } from './workout.js'

const toB64Url = (bytes) => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

/** Forma enxuta de um treino (sem ids nem resultado). */
const slim = (w) => ({ name: w.name, date: w.date ?? null, notes: w.notes || undefined, items: w.items.map(slimItem) })
const slimItem = (it) => (it.kind === 'repeat'
  ? { kind: 'repeat', times: it.times, steps: it.steps.map(slimItem) }
  : { type: it.type, duration: it.duration, target: it.target.kind === 'none' ? undefined : it.target, name: it.name || undefined })

/** Pacote → texto para o link. title: nome do plano. */
export function encodePlan(title, workouts) {
  const json = JSON.stringify({ v: 1, title, workouts: workouts.map(slim) })
  return toB64Url(new TextEncoder().encode(json))
}

/** Texto do link (ou conteúdo de arquivo .json) → { title, workouts } validados; lança erro amigável. */
export function decodePlan(input) {
  let data
  try {
    const text = input.trim().startsWith('{') ? input : new TextDecoder().decode(fromB64Url(input.trim()))
    data = JSON.parse(text)
  } catch {
    throw new Error('Este link (ou arquivo) de treinos não é válido. Peça para enviarem de novo.')
  }
  if (!data || data.v !== 1 || !Array.isArray(data.workouts) || !data.workouts.length) throw new Error('Não encontrei treinos neste link.')
  if (data.workouts.length > 60) throw new Error('Pacote grande demais (máximo de 60 treinos).')
  const workouts = data.workouts.map((raw, i) => {
    const w = normalizeWorkout(raw)
    const errs = validateWorkout(w)
    if (Object.keys(errs).length) throw new Error(`Treino ${i + 1} (${w.name || 'sem nome'}): ${Object.values(errs)[0]}`)
    return w
  })
  return { title: typeof data.title === 'string' ? data.title.slice(0, 80) : 'Treinos', workouts }
}

/* ---------- Montar no Garmin Connect (à mão, pelo celular) ---------- */

// Tipos de passo como aparecem no editor de treinos do Garmin Connect.
const GARMIN_STEP = { aquecimento: 'Aquecimento', corrida: 'Corrida', tiro: 'Corrida', recuperacao: 'Recuperação', descanso: 'Descanso', desaquecimento: 'Desaquecimento' }
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/** Linhas para copiar no Garmin Connect: [{ indent, step, duration, target, note }] e blocos "Repetir N vezes". */
export function garminLines(items) {
  const line = (s, indent = 0) => ({
    indent,
    step: GARMIN_STEP[s.type] ?? 'Corrida',
    duration: s.duration.kind === 'time' ? `Tempo · ${mmss(s.duration.value)}` : s.duration.kind === 'distance' ? `Distância · ${durationLabel(s.duration)}` : 'Botão Lap',
    target: s.target.kind === 'pace' ? `Ritmo · ${targetLabel(s.target).replace('/km', ' /km')}` : s.target.kind === 'hr' ? `Frequência cardíaca · ${s.target.min}–${s.target.max} bpm` : 'Sem meta',
    note: s.type === 'tiro' ? 'mais forte' : s.name && s.name !== STEP_BY_ID[s.type]?.label ? s.name : null
  })
  const out = []
  for (const it of items) {
    if (it.kind === 'repeat') {
      out.push({ indent: 0, repeat: it.times })
      it.steps.forEach((s) => out.push(line(s, 1)))
    } else out.push(line(it))
  }
  return out
}
