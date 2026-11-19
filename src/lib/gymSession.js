// Treinando agora (academia): séries marcadas uma a uma com a carga e as repetições, o descanso da
// ficha em segundos e a carga da última vez em cada exercício. O registro fica no próprio treino
// (`gymLog`), sem depender do relógio.

/** “1 minuto e meio” → 90 · “1 minuto” → 60 · “50 seg” → 50 · “2 min” → 120 · “1:30” → 90 · “—” → null. */
export function restSeconds(text) {
  const t = String(text ?? '').toLowerCase().trim()
  if (!t || /^[—–-]+$/.test(t)) return null
  const mmss = t.match(/^(\d{1,2}):(\d{2})$/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  let s = 0
  const min = t.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minuto)/)
  if (min) s += Number(min[1].replace(',', '.')) * 60
  if (/e\s+meio/.test(t) && min) s += 30
  const sec = t.match(/(\d+)\s*(?:s\b|seg|segundo)/)
  if (sec) s += Number(sec[1])
  if (!min && !sec) { const n = t.match(/^(\d+)$/); if (n) s = Number(n[1]) } // número solto: segundos
  return s > 0 && s <= 900 ? Math.round(s) : null
}

const num = (v, a, b) => (v == null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b ? Number(v) : null)

/** { startedAt, endedAt, entries: [{ i (exercício), n (série), kg, reps }] } — entries = séries feitas. */
export function normalizeGymLog(raw) {
  if (!raw || typeof raw !== 'object') return null
  const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v.slice(0, 30) : null)
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .filter((e) => e && Number.isInteger(e.i) && e.i >= 0 && e.i < 30 && Number.isInteger(e.n) && e.n >= 1 && e.n <= 20)
    .map((e) => ({ i: e.i, n: e.n, kg: num(String(e.kg ?? '').replace(',', '.'), 0, 500), reps: num(e.reps, 0, 500) }))
    .slice(0, 300)
  const startedAt = iso(raw.startedAt)
  if (!startedAt && !entries.length) return null
  return { startedAt, endedAt: iso(raw.endedAt), entries }
}

/** Duração do treino anotado (s), do início ao fim (ou à última série); null sem início. */
export function gymDurationSec(log) {
  if (!log?.startedAt) return null
  const end = log.endedAt ?? null
  if (!end) return null
  const s = Math.round((Date.parse(end) - Date.parse(log.startedAt)) / 1000)
  return s > 60 && s < 6 * 3600 ? s : null
}

/** A série n do exercício i, se já feita. */
export const entryOf = (log, i, n) => log?.entries.find((e) => e.i === i && e.n === n) ?? null

/** Marca/desmarca a série n do exercício i (com a carga e as repetições do momento). */
export function toggleEntry(log, i, n, { kg = null, reps = null } = {}, now = new Date()) {
  const base = log ?? { startedAt: now.toISOString(), endedAt: null, entries: [] }
  const has = entryOf(base, i, n)
  const entries = has ? base.entries.filter((e) => !(e.i === i && e.n === n)) : [...base.entries, { i, n, kg, reps }]
  return { ...base, startedAt: base.startedAt ?? now.toISOString(), entries }
}

/** Atualiza carga/repetições de uma série já feita. */
export function updateEntry(log, i, n, patch) {
  if (!log) return log
  return { ...log, entries: log.entries.map((e) => (e.i === i && e.n === n ? { ...e, ...patch } : e)) }
}

const nameOf = (x) => x?.name || null

/**
 * Séries anotadas como { name, reps, kg } (para a evolução e os recordes), na ordem dos exercícios.
 * Usa o nome escrito na ficha; sem nome, o exercício fica de fora.
 */
export function gymSets(w) {
  const log = w?.gymLog
  if (!log?.entries.length) return []
  return [...log.entries].sort((a, b) => a.i - b.i || a.n - b.n).map((e) => ({ name: nameOf(w.exercises?.[e.i]), reps: e.reps, kg: e.kg })).filter((x) => x.name)
}

/** Carga e repetições da última vez em cada exercício (pelo nome), para já vir preenchido. */
export function lastLoads(workouts = [], beforeId = null) {
  const out = {}
  const done = workouts.filter((w) => w.id !== beforeId && w.gymLog?.entries.length && w.date).sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const w of done) {
    const mine = {}
    for (const e of w.gymLog.entries) {
      const name = nameOf(w.exercises?.[e.i])
      if (!name) continue
      const key = name.toLowerCase()
      mine[key] = { ...(mine[key] ?? { date: w.date }), [e.n]: { kg: e.kg, reps: e.reps } }
    }
    Object.assign(out, mine) // o treino mais recente substitui o anterior, exercício a exercício
  }
  return out
}

/** Resumo de um exercício anotado: “3/3 séries · 40, 45, 50 kg · 12/10/8”. */
export function exerciseSummary(log, i, sets) {
  const es = (log?.entries ?? []).filter((e) => e.i === i).sort((a, b) => a.n - b.n)
  if (!es.length) return null
  const kgs = es.map((e) => e.kg).filter((v) => v != null)
  const reps = es.map((e) => e.reps).filter((v) => v != null)
  return [`${es.length}/${sets} ${sets === 1 ? 'série' : 'séries'}`, kgs.length ? `${kgs.map((v) => String(v).replace('.', ',')).join(', ')} kg` : null, reps.length ? reps.join('/') : null].filter(Boolean).join(' · ')
}
