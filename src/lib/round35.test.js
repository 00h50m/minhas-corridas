// Rodada 35: detalhes de qualquer atividade (força com séries, calorias, efeito do treino, parciais).
import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { parseFitActivity } from './activityFile.js'
import { EXERCISE, exerciseName, groupSets, speedLabel, teLabel } from './strength.js'
import { resultFrom, sportFromFile } from './activityMatch.js'
import { normalizeWorkout } from './workout.js'

/** Treino de força como o relógio grava: sem distância, FC por segundo, séries ativas e de descanso. */
function strengthFit() {
  const enc = new Encoder()
  const t0 = Date.parse('2026-11-17T21:00:00Z')
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  for (let s = 0; s <= 3812; s += 4) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), heartRate: 120 + (s % 60) })
  const sets = [['squat', 12, 40], ['squat', 10, 45], ['squat', 8, 50], ['lunge', 12, 20], ['plank', null, null]]
  let at = 0
  for (const [cat, reps, kg] of sets) {
    enc.onMesg(Profile.MesgNum.SET, { timestamp: new Date(t0 + (at + 60) * 1000), startTime: new Date(t0 + at * 1000), duration: 60, setType: 'active', category: [cat], ...(reps ? { repetitions: reps } : {}), ...(kg ? { weight: kg } : {}) })
    enc.onMesg(Profile.MesgNum.SET, { timestamp: new Date(t0 + (at + 150) * 1000), startTime: new Date(t0 + (at + 60) * 1000), duration: 90, setType: 'rest' })
    at += 150
  }
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + 3812e3), startTime: new Date(t0), sport: 'training', subSport: 'strengthTraining', totalElapsedTime: 3812, totalTimerTime: 3812, totalCalories: 412, avgHeartRate: 144, maxHeartRate: 171, totalTrainingEffect: 2.4, totalAnaerobicTrainingEffect: 1.6 })
  return new Uint8Array(enc.close())
}

describe('força', () => {
  it('lê séries, calorias, efeito do treino e FC sem distância', () => {
    const a = parseFitActivity(strengthFit(), 'forca.fit')
    expect(a.distanceKm).toBe(0)
    expect(a.elapsedSec).toBe(3812)
    expect(a).toMatchObject({ avgHr: 144, maxHr: 171, calories: 412, aerobicTE: 2.4, anaerobicTE: 1.6, sport: 'training' })
    expect(a.sets).toEqual([{ cat: 28, reps: 12, kg: 40, sec: 60 }, { cat: 28, reps: 10, kg: 45, sec: 60 }, { cat: 28, reps: 8, kg: 50, sec: 60 }, { cat: 17, reps: 12, kg: 20, sec: 60 }, { cat: 19, reps: null, kg: null, sec: 60 }])
    expect(a.hrHist.reduce((x, y) => x + y, 0)).toBeGreaterThan(3700)
    expect(sportFromFile(a)).toBe('academia')
    const w = normalizeWorkout({ name: 'Força', sport: 'academia', plannedMin: 60, result: resultFrom(a) })
    expect(w.result).toMatchObject({ calories: 412, aerobicTE: 2.4, maxHr: 171 })
    expect(w.result.sets.length).toBe(5)
  })
  it('agrupa por exercício, com repetições, carga e volume', () => {
    const g = groupSets(parseFitActivity(strengthFit(), 'f.fit').sets)
    expect(g.groups.map((x) => [x.name, x.sets, x.reps.join('/'), x.maxKg])).toEqual([['Agachamento', 3, '12/10/8', 50], ['Afundo', 1, '12', 20], ['Prancha', 1, '', null]])
    expect(g.totals).toEqual({ sets: 5, reps: 42, volume: 40 * 12 + 45 * 10 + 50 * 8 + 20 * 12 })
  })
  it('nomes em português para todas as categorias do perfil oficial', () => {
    const official = Object.keys(Profile.types.exerciseCategory).map(Number).filter((n) => n !== 65534)
    expect(official.filter((n) => !EXERCISE[n])).toEqual([])
    expect(exerciseName(65534)).toBe('Exercício')
  })
  it('efeito do treino e ritmo por esporte', () => {
    expect([0.5, 1.5, 2.4, 3.5, 4.2, 5].map(teLabel)).toEqual(['nenhum', 'leve', 'mantém', 'melhora', 'melhora muito', 'excessivo'])
    expect(speedLabel('bike', 30, 3600)).toBe('30 km/h')
    expect(speedLabel('corrida', 5, 1500)).toBe('5:00 /km')
    expect(speedLabel('corrida', 0, 1500)).toBeNull()
  })
})

describe('story de força', () => {
  it('exercícios, calorias, FC e o lugar na semana', async () => {
    const { storyFor } = await import('./storyData.js')
    const a = parseFitActivity(strengthFit(), 'f.fit')
    const run = { ...normalizeWorkout({ name: 'Rodagem', date: '2026-11-16', items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }] }), id: 'r1', status: 'feito' }
    const w = { ...normalizeWorkout({ name: 'Força', sport: 'academia', plannedMin: 60, date: '2026-11-17', result: resultFrom(a) }), id: 'f1', status: 'feito' }
    const s = storyFor('treino', { races: [], workouts: [run, w], today: '2026-11-18', opts: { times: true }, workoutId: 'f1' })
    expect(s.title).toBe('Academia feita ✓')
    expect(s.stats).toEqual([{ value: '64', label: 'minutos' }, { value: '412', label: 'kcal' }, { value: '144', label: 'FC média' }])
    expect(s.exercises).toEqual(['Agachamento · 3×12/10/8 · até 50 kg', 'Afundo · 1×12 · até 20 kg', 'Prancha · 1 série'])
    expect(s.setsTotal).toBe('5 séries · 42 repetições')
    expect(s.week).toBe('2º treino da semana')
    expect(storyFor('treino', { races: [], workouts: [run, w], today: '2026-11-18', opts: { times: false }, workoutId: 'f1' }).exercises[0]).toBe('Agachamento · 3×12/10/8')
  })
})
