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

/* ---------- Intervals.icu (texto do construtor de treinos) ---------- */

const ivDur = (d) => {
  if (d.kind === 'distance') return `${Math.round(d.value) / 1000}km` // km evita confundir "m" (minutos) com metros
  if (d.kind === 'lap') return null
  const m = Math.floor(d.value / 60)
  const s = d.value % 60
  return m && s ? `${m}m${s}s` : m ? `${m}m` : `${s}s`
}
const ivPace = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const ivStep = (s, header = null) => {
  const label = s.name || STEP_BY_ID[s.type]?.label?.replace(' (parado)', '') || 'Corrida'
  // Sem repetir o nome da seção ("Aquecimento" → "- 5m").
  const cue = [label === header ? null : label, s.target.kind === 'hr' ? `FC ${s.target.min}-${s.target.max}` : null].filter(Boolean).join(' ')
  const dur = ivDur(s.duration)
  const target = s.target.kind === 'pace' ? ` ${ivPace(s.target.min)}-${ivPace(s.target.max)}/km Pace` : ''
  return dur ? `- ${cue ? `${cue} ` : ''}${dur}${target}` : `- Press lap${cue ? ` ${cue}` : ''}${target}` // "até o botão de volta"
}

/**
 * Texto para colar no construtor de treinos do Intervals.icu (tipo: corrida).
 * Seções sem traço (Aquecimento, Principal, Série Nx, Desaquecimento), passos com traço, uma linha em branco entre seções.
 */
export function intervalsText(w) {
  const sections = []
  let series = 0
  const repeats = w.items.filter((x) => x.kind === 'repeat').length
  for (const it of w.items) {
    if (it.kind === 'repeat') {
      series++
      sections.push({ title: `Série${repeats > 1 ? ` ${series}` : ''} ${it.times}x`, steps: it.steps })
      continue
    }
    const title = it.type === 'aquecimento' ? 'Aquecimento' : it.type === 'desaquecimento' ? 'Desaquecimento' : 'Principal'
    const last = sections.at(-1)
    if (title === 'Principal' && last?.title === 'Principal') last.steps.push(it)
    else sections.push({ title, steps: [it] })
  }
  return sections.map((sec) => [sec.title, ...sec.steps.map((st) => ivStep(st, sec.title))].join('\n')).join('\n\n')
}

/* ---------- Prompt para o Claude criar no Garmin Connect (pelo navegador) ---------- */

const brDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

function stepsText(w) {
  return garminLines(w.items).map((l) => (l.repeat ? `  Repetir ${l.repeat} vezes:` : `  ${l.indent ? '    ' : ''}- ${l.step}: ${l.duration.replace(' · ', ' ')}; meta: ${l.target.replace(' · ', ' ')}${l.note ? ` (${l.note})` : ''}`)).join('\n')
}

/**
 * Prompt em português para colar no Claude com acesso ao navegador (Claude no Chrome):
 * cria cada treino no Garmin Connect (web), agenda na data e envia ao relógio.
 */
export function claudePrompt(workouts) {
  const list = workouts.map((w, i) => `${i + 1}. "${w.name}"${w.date ? ` — agendar para ${brDate(w.date)}` : ''}\n${stepsText(w)}`).join('\n\n')
  return `Use o navegador para criar ${workouts.length === 1 ? 'este treino de corrida' : `estes ${workouts.length} treinos de corrida`} no Garmin Connect, na minha conta (já estou logada em connect.garmin.com).

Para cada treino:
1. Vá em Treinamento e planejamento → Exercícios (connect.garmin.com/modern/workouts) e clique em "Criar exercício" → Corrida.
2. Use exatamente o nome indicado.
3. Monte os passos na ordem. Para cada passo, escolha o tipo (Aquecimento, Corrida, Recuperação, Descanso ou Desaquecimento), a duração indicada (Tempo em mm:ss ou Distância) e a meta (“Sem meta” quando indicado). Use “Adicionar repetição” para os blocos “Repetir N vezes”, com os passos de dentro na ordem.
4. Salve. Se houver data, use “Agendar”/“Adicionar ao calendário” para colocar o treino nessa data.
5. Depois de salvar, use “Enviar para dispositivo” e escolha o meu Forerunner 165.

Regras:
- Não altere nem apague nenhum outro treino ou atividade da minha conta.
- Se um treino com o mesmo nome já existir, não crie outro igual: me pergunte o que fazer.
- Se algum campo for diferente do que descrevi (nome de menu, unidade), escolha o equivalente e me avise no final.
- Ao terminar, me mostre uma lista com cada treino criado, a data agendada e se foi enviado ao relógio.

Treinos:

${list}
`
}
