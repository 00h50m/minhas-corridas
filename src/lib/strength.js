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
