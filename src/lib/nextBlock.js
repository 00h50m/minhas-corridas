// Próximo bloco de 4 semanas a partir de uma marca nos 5 km (teste do plano ou prova):
// mesmos dias da semana do bloco anterior, faixas de pace recalculadas e progressão de volume,
// com semana 4 mais leve e novo teste. É uma estrutura de partida para ajustar, não prescrição médica.
import { addDaysISO, parseISODate } from './dates.js'
import { normalizeWorkout } from './workout.js'
import { weekStart } from './trainingWeek.js'

const r5 = (s) => Math.round(s / 5) * 5

/** Faixas de pace (s/km) a partir do tempo nos 5 km (s). */
export function paceZones(time5k) {
  const p = time5k / 5
  return {
    race: Math.round(p),
    leve: { min: r5(p + 55), max: r5(p + 95) },
    forte: { min: r5(p - 30), max: r5(p) }, // tiros de 1–2 min (perto do ritmo de 3–5 km)
    ritmo: { min: r5(p + 5), max: r5(p + 25) } // blocos de 3–5 min, um pouco mais lento que o de prova
  }
}

/** Nova meta: ~3% abaixo da marca (no mínimo 30 s), arredondada para 10 s. */
export function nextTarget(time5k) {
  return Math.round((time5k - Math.max(30, time5k * 0.03)) / 10) * 10
}

/** Dias da semana (0 = segunda) mais usados num conjunto de treinos com data; padrão terça e sábado. */
export function usualDays(workouts) {
  const count = new Map()
  for (const w of workouts) if (w.date) { const d = (parseISODate(w.date).getDay() + 6) % 7; count.set(d, (count.get(d) ?? 0) + 1) }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([d]) => d).sort((a, b) => a - b)
  return top.length === 2 ? top : [1, 5]
}

/**
 * Monta o bloco. opts: { time5k, startMonday (AAAA-MM-DD, segunda), days: [diaA, diaB], block: nº do bloco }
 * { workouts, target, zones, end }
 */
export function buildNextBlock({ time5k, startMonday, days = [1, 5], block = 2 }) {
  const z = paceZones(time5k)
  const target = nextTarget(time5k)
  const testPace = { min: r5(target / 5 - 7), max: r5(target / 5 + 13) }
  const t = (m) => ({ kind: 'time', value: Math.round(m * 60) })
  const pace = (zone) => ({ kind: 'pace', ...zone })
  const st = (type, dur, name, target = { kind: 'none' }) => ({ kind: 'step', type, duration: dur, target, name })
  const warm = (m = 5) => st('aquecimento', t(m), 'Aquecimento')
  const cool = (m = 5) => st('desaquecimento', t(m), 'Desaquecimento')
  const easy = (m) => st('corrida', t(m), 'Corrida leve', pace(z.leve))
  const jog = (m) => st('recuperacao', t(m), 'Trote/caminhada')
  const rep = (times, steps) => ({ kind: 'repeat', times, steps })
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const NL = `Leve (${fmt(z.leve.min)}–${fmt(z.leve.max)}/km): dá para conversar. No calor ou cansada, vá pelo fôlego.`
  const NF = `Mais forte (${fmt(z.forte.min)}–${fmt(z.forte.max)}/km): forte e controlado; recuperação em trote ou caminhada.`
  const NR = `Ritmo (${fmt(z.ritmo.min)}–${fmt(z.ritmo.max)}/km): firme e constante, um pouco mais lento que o de prova.`
  const weeks = [
    [['A', 'Continua 25', [warm(), easy(25), cool()], NL], ['B', 'Tiros 6x2', [warm(8), rep(6, [st('tiro', t(2), 'Mais forte', pace(z.forte)), jog(2)]), cool()], NF]],
    [['A', 'Continua 30', [warm(), easy(30), cool()], NL], ['B', 'Ritmo 4x3', [warm(8), rep(4, [st('tiro', t(3), 'Ritmo', pace(z.ritmo)), jog(2)]), cool()], NR]],
    [['A', 'Continua 35', [warm(), easy(35), cool()], NL], ['B', 'Ritmo 3x5', [warm(8), rep(3, [st('tiro', t(5), 'Ritmo', pace(z.ritmo)), jog(2)]), cool()], NR]],
    [['A', 'Continua 25', [warm(), easy(25), cool()], NL + ' Semana mais leve antes do teste.'], ['B', 'Teste 5 km', [warm(10), st('corrida', { kind: 'distance', value: 5000 }, 'Teste 5 km', pace(testPace)), cool()], `Teste: 5 km entre ${fmt(testPace.min)} e ${fmt(testPace.max)}/km (meta ${fmt(target)}). Comece pelo mais lento e aperte no último km.`]]
  ]
  const workouts = []
  weeks.forEach((wk, i) => {
    const monday = addDaysISO(startMonday, i * 7)
    wk.forEach(([slot, name, items, notes], j) => {
      workouts.push(normalizeWorkout({ name: `B${block} S${i + 1} ${slot} ${name}`, date: addDaysISO(monday, days[j]), items, notes }))
    })
  })
  return { workouts, target, zones: { ...z, teste: testPace }, end: workouts.at(-1).date }
}

/** Segunda-feira em que o próximo bloco começa: a seguinte ao último treino do bloco atual (ou a próxima a partir de hoje). */
export function nextStart(lastDate, today) {
  const base = lastDate && lastDate > today ? lastDate : today
  return addDaysISO(weekStart(base), 7)
}
