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
