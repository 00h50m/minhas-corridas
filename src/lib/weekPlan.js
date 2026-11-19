// Planejar a semana em 1 minuto: os dias da academia recebem a sequência da ficha (A → B → C…) e as
// corridas (e outras atividades) da semana anterior são copiadas 7 dias à frente. Nada é criado até a
// pessoa confirmar; a carga prevista vem junto para não montar uma semana pesada sem perceber.
import { addDaysISO } from './dates.js'
import { weekStart } from './trainingWeek.js'
import { nextSheet, sheetName, workoutFromSheet } from './ficha.js'

export const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** Semana sugerida: esta (seg–qua) ou a próxima (qui em diante). */
export function suggestedWeek(today) {
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7
  return dow <= 2 ? weekStart(today) : addDaysISO(weekStart(today), 7)
}

/**
 * Academia nos dias escolhidos (0 = seg … 6 = dom) com a sequência da ficha, a partir do próximo.
 * Pula dias que já têm academia planejada/feita e dias que já passaram.
 * → [{ date, sheet, skip: motivo | null }]
 */
export function planGym(program, workouts, start, days, today) {
  if (!program?.sheets.length) return []
  let sheet = nextSheet(program, workouts)
  let idx = program.sheets.indexOf(sheet)
  const out = []
  for (const d of [...days].sort((a, b) => a - b)) {
    const date = addDaysISO(start, d)
    const busy = workouts.find((w) => w.date === date && w.sport === 'academia' && w.status !== 'pulado')
    if (date < today) { out.push({ date, sheet: null, skip: 'já passou' }); continue }
    if (busy) { out.push({ date, sheet: null, skip: `já tem “${busy.name}”` }); continue }
    out.push({ date, sheet: program.sheets[idx], skip: null })
    idx = (idx + 1) % program.sheets.length
  }
  return out
}

/**
 * Treinos da semana anterior para copiar 7 dias à frente (corridas e outras atividades; a academia da
 * ficha fica com a sequência). Já marca os que conflitam (mesmo tipo no dia) ou cairiam no passado.
 * → [{ src, date, skip }]
 */
export function copyCandidates(workouts, start, today, { withFicha = true } = {}) {
  const from = addDaysISO(start, -7)
  const to = addDaysISO(start, -1)
  return workouts
    .filter((w) => w.date && w.date >= from && w.date <= to && w.status !== 'pulado' && !(withFicha && w.ficha))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((w) => {
      const date = addDaysISO(w.date, 7)
      const kind = (x) => (x.sport ?? 'corrida') === (w.sport ?? 'corrida')
      const busy = workouts.find((x) => x.id !== w.id && x.date === date && kind(x) && x.status !== 'pulado')
      return { src: w, date, skip: date < today ? 'já passou' : busy ? `já tem “${busy.name}”` : null }
    })
}

/** Cópia de um treino para outra data, como planejado (sem resultado, sem anotações do dia). */
export function copyWorkout(w, date) {
  return { ...w, id: null, date, status: 'planejado', result: null, gymLog: null, moves: [], createdAt: null, updatedAt: null }
}

/** O que será criado: academia da ficha + cópias escolhidas. */
export function buildPlan({ program, gym = [], copies = [], picked = new Set() }) {
  const out = []
  for (const g of gym) if (g.sheet) out.push(workoutFromSheet(program, g.sheet, g.date, null, 'planejado'))
  for (const c of copies) if (!c.skip && picked.has(c.src.id)) out.push(copyWorkout(c.src, c.date))
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export const planLabel = (w) => (w.ficha ? sheetName({ label: w.ficha.label }) : w.name)
