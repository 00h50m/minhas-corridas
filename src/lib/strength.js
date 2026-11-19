// Detalhes de qualquer atividade do relógio: séries de força agrupadas por exercício (categorias do
// perfil FIT da Garmin), efeito do treino e velocidade/pace conforme o esporte.

/** Categoria de exercício (exercise_category do FIT) → nome em português. */
export const EXERCISE = {
  0: 'Supino', 1: 'Panturrilha', 2: 'Cardio', 3: 'Carregamento', 4: 'Chop', 5: 'Core', 6: 'Abdominal', 7: 'Rosca',
  8: 'Levantamento terra', 9: 'Crucifixo', 10: 'Elevação de quadril', 11: 'Estabilidade de quadril', 12: 'Swing',
  13: 'Hiperextensão', 14: 'Elevação lateral', 15: 'Flexão de pernas', 16: 'Elevação de pernas', 17: 'Afundo',
  18: 'Levantamento olímpico', 19: 'Prancha', 20: 'Pliometria', 21: 'Barra fixa', 22: 'Flexão de braço', 23: 'Remada',
  24: 'Desenvolvimento', 25: 'Estabilidade de ombro', 26: 'Encolhimento', 27: 'Abdominal (sit-up)', 28: 'Agachamento',
  29: 'Corpo todo', 30: 'Tríceps', 31: 'Aquecimento', 32: 'Corrida', 33: 'Bike', 34: 'Cardio', 35: 'Movimento',
  36: 'Postura', 37: 'Elástico', 38: 'Corda naval', 39: 'Elíptico', 40: 'Escalada', 41: 'Bike indoor',
  42: 'Remo indoor', 43: 'Escada de agilidade', 44: 'Saco de areia', 45: 'Trenó', 46: 'Marreta', 47: 'Escada (stepper)',
  49: 'Suspensão', 50: 'Pneu', 52: 'Corrida indoor', 53: 'Bike outdoor'
}

export const exerciseName = (cat) => (cat == null || cat === 65534 ? 'Exercício' : EXERCISE[cat] ?? 'Exercício')

/**
 * Séries agrupadas por exercício, na ordem em que aparecem:
 * { groups: [{ name, sets, reps: [..], maxKg, volume }], totals: { sets, reps, volume } }
 */
export function groupSets(sets = []) {
  const groups = []
  for (const s of sets) {
    const name = exerciseName(s.cat)
    let g = groups.at(-1)
    if (!g || g.name !== name) { g = { name, sets: 0, reps: [], maxKg: null, volume: 0, sec: 0 }; groups.push(g) }
    g.sets++
    if (s.reps != null) g.reps.push(s.reps)
    if (s.kg) g.maxKg = Math.max(g.maxKg ?? 0, s.kg)
    if (s.kg && s.reps) g.volume += s.kg * s.reps
    if (s.sec) g.sec += s.sec
  }
  const reps = groups.reduce((a, g) => a + g.reps.reduce((x, y) => x + y, 0), 0)
  return { groups, totals: { sets: sets.length, reps, volume: Math.round(groups.reduce((a, g) => a + g.volume, 0)) } }
}

/** Efeito do treino (Garmin, 0–5) em palavras. */
export function teLabel(v) {
  if (!(v > 0)) return null
  if (v < 1) return 'nenhum'
  if (v < 2) return 'leve'
  if (v < 3) return 'mantém'
  if (v < 4) return 'melhora'
  if (v < 5) return 'melhora muito'
  return 'excessivo'
}

/** Ritmo conforme o esporte: pace (min/km) para corrida e caminhada; km/h para bike. */
export function speedLabel(sport, km, sec) {
  if (!(km > 0) || !(sec > 0)) return null
  if (sport === 'bike') return `${String(Math.round((km / (sec / 3600)) * 10) / 10).replace('.', ',')} km/h`
  const p = sec / km
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')} /km`
}

const isStrength = (w) => w.status === 'feito' && w.date && w.result?.sets?.length > 0

/**
 * Evolução por exercício a partir dos treinos feitos com séries do relógio (mais antigos primeiro):
 * [{ name, sessions: [{ date, workoutId, sets, reps, maxKg, volume }], bestKg, bestKgDate, bestVolume, firstKg, lastKg, last }]
 * Ordem: mais sessões primeiro; empate, o feito mais recente.
 */
export function strengthHistory(workouts = []) {
  const by = new Map()
  const done = workouts.filter(isStrength).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const w of done) {
    const merged = new Map()
    for (const g of groupSets(w.result.sets).groups) {
      if (g.name === 'Exercício' || g.name === 'Aquecimento') continue
      const m = merged.get(g.name) ?? { date: w.date, workoutId: w.id, sets: 0, reps: 0, maxKg: null, volume: 0 }
      m.sets += g.sets
      m.reps += g.reps.reduce((a, b) => a + b, 0)
      if (g.maxKg) m.maxKg = Math.max(m.maxKg ?? 0, g.maxKg)
      m.volume += g.volume
      merged.set(g.name, m)
    }
    for (const [name, s] of merged) {
      s.volume = Math.round(s.volume)
      if (!by.has(name)) by.set(name, [])
      by.get(name).push(s)
    }
  }
  const out = []
  for (const [name, sessions] of by) {
    const withKg = sessions.filter((s) => s.maxKg)
    const best = withKg.reduce((b, s) => (!b || s.maxKg > b.maxKg ? s : b), null)
    out.push({
      name,
      sessions,
      bestKg: best?.maxKg ?? null,
      bestKgDate: best?.date ?? null,
      bestVolume: Math.max(0, ...sessions.map((s) => s.volume)),
      firstKg: withKg[0]?.maxKg ?? null,
      lastKg: withKg.at(-1)?.maxKg ?? null,
      last: sessions.at(-1).date
    })
  }
  return out.sort((a, b) => b.sessions.length - a.sessions.length || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
}

/** Exercícios em que este treino bateu o recorde de carga (precisa de um treino anterior com carga). */
export function strengthRecords(w, workouts = []) {
  if (!isStrength(w)) return new Set()
  const out = new Set()
  for (const h of strengthHistory(workouts)) {
    const mine = h.sessions.find((s) => s.workoutId === w.id)
    if (!mine?.maxKg) continue
    const before = h.sessions.filter((s) => s.workoutId !== w.id && s.date <= w.date && s.maxKg)
    if (before.length && before.every((s) => mine.maxKg > s.maxKg)) out.add(h.name)
  }
  return out
}

/**
 * Força no período: último treino de força feito (com ou sem séries), dias desde ele e quantos nas
 * últimas 4 semanas. Null se nunca houve.
 */
export function strengthRecency(workouts = [], today) {
  const done = workouts.filter((w) => w.status === 'feito' && w.date && w.date <= today && w.sport === 'academia').map((w) => w.date).sort()
  if (!done.length) return null
  const last = done.at(-1)
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86400000)
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 27 * 86400000).toISOString().slice(0, 10)
  return { last, days, in4w: done.filter((d) => d >= from).length }
}

export const kgLabel = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`

/** Exercícios mais comuns primeiro, no seletor da ficha (o resto vem depois, em ordem alfabética). */
export const COMMON_EXERCISES = [28, 17, 8, 10, 0, 23, 24, 21, 22, 19, 6, 1, 15, 7, 30, 14, 5, 20]
export function exerciseOptions() {
  const common = COMMON_EXERCISES.map((cat) => ({ cat, name: EXERCISE[cat] }))
  const seen = new Set(common.map((x) => x.name))
  const rest = Object.entries(EXERCISE)
    .map(([cat, name]) => ({ cat: Number(cat), name }))
    .filter((x) => !seen.has(x.name) && (seen.add(x.name), true))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { common, rest }
}

const kgShort = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`

/** Linha da ficha: “3×12 · 40 kg”. */
export function planLine(x) {
  return `${x.sets}×${x.reps ?? '—'}${x.kg ? ` · ${kgShort(x.kg)}` : ''}`
}

/** O que foi feito de um exercício (somando os blocos com o mesmo nome). */
function doneOf(groups, name) {
  const gs = groups.filter((g) => g.name === name)
  if (!gs.length) return null
  const reps = gs.flatMap((g) => g.reps)
  const kgs = gs.map((g) => g.maxKg).filter((v) => v != null)
  return { sets: gs.reduce((a, g) => a + g.sets, 0), reps, maxKg: kgs.length ? Math.max(...kgs) : null }
}

/**
 * Ficha planejada × séries do relógio, por exercício:
 * { rows: [{ name, plan, done, status: 'ok' | 'parcial' | 'faltou', kgDiff }], extras: [{ name, sets, reps, maxKg }], ok, total }
 * “ok”: todas as séries, ~todas as repetições (90%+) e a carga planejada (quando há).
 */
export function compareStrength(plan = [], sets = []) {
  const { groups } = groupSets(sets)
  const names = new Set()
  const rows = plan.map((p) => {
    const name = exerciseName(p.cat)
    names.add(name)
    const done = doneOf(groups, name)
    let status = 'faltou'
    if (done) {
      const repsOk = p.reps == null || !done.reps.length || done.reps.reduce((a, b) => a + b, 0) >= p.sets * p.reps * 0.9
      const kgOk = !p.kg || (done.maxKg ?? 0) >= p.kg
      status = done.sets >= p.sets && repsOk && kgOk ? 'ok' : 'parcial'
    }
    const kgDiff = done?.maxKg != null && p.kg ? Math.round((done.maxKg - p.kg) * 10) / 10 : null
    return { name, plan: p, done, status, kgDiff }
  })
  const extras = [...new Set(groups.map((g) => g.name))].filter((n) => !names.has(n) && n !== 'Exercício' && n !== 'Aquecimento').map((n) => ({ name: n, ...doneOf(groups, n) }))
  return { rows, extras, ok: rows.filter((r) => r.status === 'ok').length, total: rows.length }
}
