// Ficha da academia (a do treinador): Treino A, B, C… com exercício, observação, séries, repetições e
// descanso em texto livre (“8 + diminuir o peso + 10”) e conjugados. Cadastro campo a campo ou por texto
// colado (o formato que o Claude no Chrome preenche a partir do PDF). “Fiz hoje” vira um treino de
// academia feito, com a ficha como planejado. Não prescreve nada: guarda o que a pessoa (ou o
// treinador) montou.
import { isValidISODate } from './dates.js'

const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const int = (v, a, b) => { const n = Number(String(v ?? '').replace(/\D/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= a && n <= b ? n : null }
const id = () => Math.random().toString(36).slice(2, 10)

export function emptyExercise() {
  return { id: id(), name: '', note: '', sets: null, reps: '', rest: '', withNext: false }
}
export function emptySheet(label = 'A') {
  return { id: id(), label, exercises: [emptyExercise()] }
}
export function emptyProgram() {
  return { id: id(), title: 'Treino em academia', goal: '', from: null, to: null, coach: '', sheets: [emptySheet('A')] }
}

export function normalizeExercise(x) {
  const e = x && typeof x === 'object' ? x : {}
  return { id: str(e.id, 20) || id(), name: str(e.name, 80), note: str(e.note, 80), sets: int(e.sets, 1, 20), reps: str(e.reps, 120), rest: str(e.rest, 40), withNext: e.withNext === true }
}
export function normalizeSheet(s, i = 0) {
  const o = s && typeof s === 'object' ? s : {}
  const exercises = (Array.isArray(o.exercises) ? o.exercises : []).map(normalizeExercise).filter((x) => x.name).slice(0, 30)
  // O último exercício não tem “próximo” para conjugar
  if (exercises.length) exercises[exercises.length - 1].withNext = false
  return { id: str(o.id, 20) || id(), label: str(o.label, 20) || String.fromCharCode(65 + i), exercises }
}
export function normalizeProgram(p) {
  const o = p && typeof p === 'object' ? p : {}
  return {
    id: str(o.id, 20) || id(),
    title: str(o.title, 60) || 'Treino em academia',
    goal: str(o.goal, 80),
    from: isValidISODate(o.from) ? o.from : null,
    to: isValidISODate(o.to) ? o.to : null,
    coach: str(o.coach, 60),
    sheets: (Array.isArray(o.sheets) ? o.sheets : []).map(normalizeSheet).filter((s) => s.exercises.length).slice(0, 10)
  }
}
/** Registro sincronizado: { programs: [...], activeId }. */
export function normalizeFicha(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const programs = (Array.isArray(o.programs) ? o.programs : []).map(normalizeProgram).filter((p) => p.sheets.length).slice(-6)
  const activeId = programs.some((p) => p.id === o.activeId) ? o.activeId : programs.at(-1)?.id ?? null
  return { programs, activeId }
}
export const activeProgram = (f) => f.programs.find((p) => p.id === f.activeId) ?? null

/** Nome do treino para a lista e o calendário: “Treino A”. */
export const sheetName = (s) => (/^treino\b/i.test(s.label) ? s.label : `Treino ${s.label}`)

/** Blocos da ficha: exercícios soltos ou conjugados (o que tem “com o próximo” puxa o seguinte). */
export function blocks(sheet) {
  const out = []
  let cur = null
  for (const x of sheet.exercises) {
    if (!cur) { cur = [x]; out.push(cur) } else cur.push(x)
    if (!x.withNext) cur = null
  }
  return out
}

/* ---------- Texto colado (o formato que o Claude no Chrome preenche) ---------- */

/**
 * TREINO A
 * Agachamento barra livre pernas abduzidas | 3 | 8 + diminuir o peso + 10 | — | conjugado
 * Agachamento peso corporal | 3 | 12 (com peso) + 15 (sem peso) | 1 minuto e meio
 * Remada curvada aberta barra reta (pegada pronada) | 4 | 12 | — | conjugado
 *
 * Colunas: exercício (observação entre parênteses no fim) | séries | repetições | descanso | “conjugado”
 * (= conjugado com o próximo). Cabeçalho: “TREINO A”, “Treino B - costas”… Linhas fora do formato
 * voltam em `skipped` para a pessoa corrigir.
 */
const brDate = (v) => { const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null }

export function parseFichaText(text) {
  const sheets = []
  const skipped = []
  const meta = {}
  let cur = null
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // Cabeçalho opcional: FICHA:, OBJETIVO:, PERÍODO: 02/11/2026 a 04/12/2026, TREINADOR:
    const mm = !line.includes('|') && line.match(/^(ficha|nome|objetivo|per[ií]odo|treinador\(?a?\)?|treinadora)\s*:\s*(.+)$/i)
    if (mm) {
      const k = mm[1].toLowerCase()
      if (k === 'ficha' || k === 'nome') meta.title = mm[2].trim().slice(0, 60)
      else if (k === 'objetivo') meta.goal = mm[2].trim().slice(0, 80)
      else if (k.startsWith('per')) { const ds = mm[2].match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? []; meta.from = brDate(ds[0] ?? ''); meta.to = brDate(ds[1] ?? '') }
      else meta.coach = mm[2].trim().slice(0, 60)
      continue
    }
    const head = line.match(/^(?:#+\s*)?treino\s+([A-Za-z0-9]+)\b(.*)$/i)
    if (head && !line.includes('|')) {
      cur = { label: head[1].toUpperCase(), exercises: [] }
      sheets.push(cur)
      continue
    }
    const cols = line.replace(/^\s*(?:\d{1,2}[.)-]\s*|[-•*]\s*)/, '').split('|').map((c) => c.trim())
    if (cols.length < 3 || !cols[0]) { skipped.push(line); continue }
    if (!cur) { cur = { label: 'A', exercises: [] }; sheets.push(cur) }
    const m = cols[0].match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    const dash = (v) => (/^[—–-]*$/.test(v ?? '') ? '' : v)
    cur.exercises.push(normalizeExercise({
      name: m ? m[1] : cols[0],
      note: m ? m[2] : '',
      sets: cols[1],
      reps: dash(cols[2]),
      rest: dash(cols[3] ?? ''),
      withNext: /conjug|bi-?set|super-?s[ée]rie/i.test(cols.slice(4).join(' '))
    }))
  }
  return { sheets: sheets.map(normalizeSheet).filter((s) => s.exercises.length), skipped, meta }
}

/** A ficha de volta em texto (para revisar, copiar ou editar em bloco). */
export function fichaToText(program) {
  const head = [program.title && `FICHA: ${program.title}`, program.goal && `OBJETIVO: ${program.goal}`, program.from && program.to && `PERÍODO: ${program.from.split('-').reverse().join('/')} a ${program.to.split('-').reverse().join('/')}`, program.coach && `TREINADOR: ${program.coach}`].filter(Boolean)
  return (head.length ? `${head.join('\n')}\n\n` : '') + program.sheets.map((s) => [`TREINO ${s.label}`, ...s.exercises.map((x) => [x.note ? `${x.name} (${x.note})` : x.name, x.sets ?? '', x.reps || '—', x.rest || '—', x.withNext ? 'conjugado' : ''].join(' | ').replace(/\s\|\s$/, ''))].join('\n')).join('\n\n')
}

/* ---------- Exercício da ficha → categoria do relógio ---------- */

const CATS = [
  [/rosca\s+tr[ií]ceps|tr[ií]ceps/, 30], [/rosca/, 7], [/stiff|levantamento\s+terra|\bterra\b/, 8],
  [/eleva[cç][aã]o\s+p[eé]lvica|hip\s*thrust|gl[uú]teo\s+ponte/, 10], [/b[uú]lgaro|afundo|recuo|passada|lunge/, 17],
  [/agachamento|leg\s*press|hack|sum[oô]/, 28], [/cadeira\s+abdutora|abdu[cç][aã]o\s+de\s+quadril/, 11],
  [/cadeira\s+flexora|mesa\s+flexora|flexora/, 15], [/panturrilha|g[eê]meos/, 1], [/supino/, 0],
  [/crucifixo/, 9], [/remada/, 23], [/puxada|pulldown|barra\s+fixa/, 21], [/desenvolvimento/, 24],
  [/eleva[cç][aã]o\s+lateral|abdu[cç][aã]o\s+de\s+ombro|flex[aã]o\s+de\s+ombro|eleva[cç][aã]o\s+frontal/, 14],
  [/flex[aã]o\s+de\s+bra[cç]o/, 22], [/prancha/, 19], [/abdominal|infra|crunch/, 6], [/encolhimento/, 26]
]
export function guessCategory(name) {
  const n = String(name ?? '').toLowerCase()
  return CATS.find(([re]) => re.test(n))?.[1] ?? null
}
/** Primeiro número das repetições (“8 + diminuir o peso + 10” → 8), para o relógio e a comparação. */
export const firstReps = (reps) => { const m = String(reps ?? '').match(/\d{1,3}/); return m ? Number(m[0]) : null }

/** Exercícios do treino de academia (workout.exercises) a partir de um treino da ficha. */
export function sheetToExercises(sheet) {
  return sheet.exercises.map((x) => ({ cat: guessCategory(x.name), sets: x.sets ?? 1, reps: firstReps(x.reps), kg: null, name: x.name, note: x.note, repsText: x.reps, rest: x.rest, withNext: x.withNext }))
}

/**
 * Próximo treino da sequência: o seguinte ao último feito desta ficha (A → B → C → D → A).
 * Sem nenhum feito, o primeiro.
 */
export function nextSheet(program, workouts = []) {
  if (!program?.sheets.length) return null
  const done = workouts.filter((w) => w.status === 'feito' && w.ficha?.programId === program.id && w.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const last = done[0] && program.sheets.findIndex((s) => s.id === done[0].ficha.sheetId)
  return program.sheets[last != null && last >= 0 ? (last + 1) % program.sheets.length : 0]
}

/** Quando cada treino da ficha foi feito pela última vez (id do treino → data). */
export function lastDone(program, workouts = []) {
  const out = {}
  for (const w of workouts) if (w.status === 'feito' && w.ficha?.programId === program.id && w.date && (!out[w.ficha.sheetId] || w.date > out[w.ficha.sheetId])) out[w.ficha.sheetId] = w.date
  return out
}

/** O treino de academia feito numa data a partir da ficha (reaproveita um planejado do mesmo dia). */
export function workoutFromSheet(program, sheet, date, existing = null, status = 'feito') {
  const base = existing ?? { id: null, items: [], notes: '', result: null, goalId: null, raceId: null, moves: [] }
  return {
    ...base,
    sport: 'academia',
    name: existing?.name && !/^(força|academia|treino)$/i.test(existing.name) ? existing.name : sheetName(sheet),
    date,
    status,
    plannedMin: existing?.plannedMin ?? 60,
    exercises: sheetToExercises(sheet),
    ficha: { programId: program.id, sheetId: sheet.id, label: sheet.label }
  }
}

/** Prompt para o Claude no Chrome preencher a ficha a partir do PDF. */
export function claudeFichaPrompt(url) {
  return [
    'Preciso cadastrar a minha ficha de academia no app PaceOn.',
    '',
    `1. Abra o PDF da ficha (está aberto em outra aba ou vou anexar) e o PaceOn em ${url}.`,
    '2. Para cada treino (Treino A, B, C…), escreva o cabeçalho "TREINO A" e, embaixo, uma linha por exercício neste formato:',
    '   exercício (observação) | séries | repetições | descanso | conjugado',
    '   - "observação" é o texto pequeno embaixo do nome (ex.: pegada pronada, usar dois steps); sem observação, não use parênteses.',
    '   - Copie as repetições e o descanso exatamente como estão (ex.: "8 + diminuir o peso + 10", "1 minuto e meio"); descanso "—" fica "—".',
    '   - Escreva "conjugado" no fim só no PRIMEIRO exercício de cada par conjugado (o que vem antes do outro no mesmo bloco).',
    '   - Em exercícios conjugados, repita as séries do bloco nos dois.',
    '3. Antes dos treinos, escreva o cabeçalho da ficha (se estiver no PDF):',
    '   FICHA: Treino em academia',
    '   OBJETIVO: Emagrecimento - Definição',
    '   PERÍODO: 02/11/2026 a 04/12/2026',
    '   TREINADOR: nome do treinador',
    '4. Cole o texto no campo "Colar ficha em texto" e toque em "Ler texto".',
    '5. Confira treino por treino se os exercícios, séries, repetições, descansos e conjugados ficaram iguais ao PDF, corrija o que precisar nos campos e toque em "Salvar ficha".',
    '',
    'Exemplo:',
    'TREINO A',
    'Agachamento barra livre pernas abduzidas | 3 | 8 + diminuir o peso + 10 | — | conjugado',
    'Agachamento peso corporal | 3 | 12 (com peso) + 15 (sem peso) + 10 seg isometria final | 1 minuto e meio',
    '',
    'Não invente cargas nem exercícios que não estão no PDF.'
  ].join('\n')
}
