// Rodada 37: ficha de força (planejado × feito), carga da semana com intensidade, ciclo fase 2
// (padrões pessoais e aviso ao remanejar) e o story do mês com força e recordes.
import { describe, expect, it } from 'vitest'
import { compareStrength, exerciseOptions, planLine } from './strength.js'
import { normalizeWorkout, workoutLine } from './workout.js'
import { activityLoad, weekStrain } from './load.js'
import { cyclePatterns, hardDayNote, normalizeCycle, phaseOf } from './cycle.js'
import { suggestDates } from './reschedule.js'
import { storyFor } from './storyData.js'
import { addDaysISO } from './dates.js'

const s = (cat, reps, kg) => ({ cat, reps, kg, sec: 60 })

describe('ficha de força', () => {
  it('normaliza a ficha (só academia), aceita vírgula e limita valores', () => {
    const w = normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 50, exercises: [{ cat: 28, sets: 3, reps: 12, kg: '42,5' }, { cat: null, sets: 99, reps: '', kg: null }, 'x'] })
    expect(w.exercises).toEqual([{ cat: 28, sets: 3, reps: 12, kg: 42.5 }, { cat: null, sets: 3, reps: null, kg: null }])
    expect(workoutLine(w)).toBe('Academia / força · 50 min · 2 exercícios')
    expect(normalizeWorkout({ name: 'R', sport: 'corrida', exercises: [{ cat: 28, sets: 3 }] }).exercises).toEqual([])
    expect(planLine({ sets: 3, reps: 12, kg: 42.5 })).toBe('3×12 · 42,5 kg')
    expect(planLine({ sets: 2, reps: null, kg: null })).toBe('2×—')
  })
  it('lista de exercícios: comuns primeiro, sem nomes repetidos', () => {
    const { common, rest } = exerciseOptions()
    expect(common[0]).toEqual({ cat: 28, name: 'Agachamento' })
    const names = [...common, ...rest].map((x) => x.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Cardio')
  })
  it('compara a ficha com as séries do relógio', () => {
    const plan = [{ cat: 28, sets: 3, reps: 12, kg: 40 }, { cat: 17, sets: 3, reps: 10, kg: 20 }, { cat: 0, sets: 3, reps: 10, kg: 30 }, { cat: 19, sets: 2, reps: null, kg: null }]
    const sets = [s(28, 12, 40), s(28, 12, 45), s(28, 11, 50), s(17, 10, 20), s(17, 8, 20), s(19, null, null), s(19, null, null), s(23, 12, 25)]
    const c = compareStrength(plan, sets)
    expect(c.rows.map((r) => [r.name, r.status])).toEqual([['Agachamento', 'ok'], ['Afundo', 'parcial'], ['Supino', 'faltou'], ['Prancha', 'ok']])
    expect(c.rows[0].kgDiff).toBe(10)
    expect(c.rows[0].done).toEqual({ sets: 3, reps: [12, 12, 11], maxKg: 50 })
    expect(c.extras).toEqual([{ name: 'Remada', sets: 1, reps: [12], maxKg: 25 }])
    expect([c.ok, c.total]).toEqual([2, 4])
  })
  it('carga abaixo do plano é parcial, mesmo com todas as séries', () => {
    expect(compareStrength([{ cat: 28, sets: 2, reps: 10, kg: 50 }], [s(28, 10, 45), s(28, 10, 45)]).rows[0]).toMatchObject({ status: 'parcial', kgDiff: -5 })
  })
})

const zones = { floors: [95, 114, 133, 152, 171], max: 190 }
const hist = (bpm, sec) => { const h = new Array(32).fill(0); h[Math.floor((bpm - 60) / 5)] = sec; return h }
const done = (id, date, extra = {}) => ({ id, name: id, date, status: 'feito', items: [], sport: 'corrida', ...extra })

describe('carga da semana', () => {
  it('pontos = minutos × intensidade: zonas da FC, FC média, esforço ou peso padrão', () => {
    expect(activityLoad(done('a', '2026-11-16', { result: { elapsedSec: 3600, hrHist: hist(140, 3600) } }), zones)).toBe(180) // 60 min em Z3
    expect(activityLoad(done('b', '2026-11-16', { result: { elapsedSec: 1800, avgHr: 160 } }), zones)).toBe(120) // Z4
    expect(activityLoad(done('c', '2026-11-16', { result: { elapsedSec: 1800, effort: 8 } }), null)).toBe(120)
    expect(activityLoad(done('d', '2026-11-16', { sport: 'academia', plannedMin: 60, result: { elapsedSec: 3600 } }), null)).toBe(120)
    expect(activityLoad({ id: 'p', status: 'planejado', sport: 'alongamento', plannedMin: 30, items: [] })).toBe(30)
  })
  it('semana × média das 4 anteriores, com corrida e força separadas e aviso de semana pesada', () => {
    const prev = [-7, -14, -21].map((k, i) => done(`p${i}`, addDaysISO('2026-11-16', k), { result: { elapsedSec: 3600 } })) // 150 pts cada
    const cur = [
      done('r1', '2026-11-16', { result: { elapsedSec: 3600 } }),
      done('g1', '2026-11-17', { sport: 'academia', plannedMin: 60, result: { elapsedSec: 3600 } }),
      { id: 'n', name: 'n', date: '2026-11-20', status: 'planejado', sport: 'bike', plannedMin: 60, items: [] }
    ]
    const l = weekStrain([...prev, ...cur], '2026-11-16', '2026-11-18')
    expect(l).toMatchObject({ done: 270, planned: 120, total: 390, avg4: 150, pct: 160, level: 'alta', parts: { corrida: 150, forca: 120, outras: 0 }, weeks: 3 })
    expect(weekStrain([...prev, cur[0]], '2026-11-16', '2026-11-18').level).toBe('normal')
    expect(weekStrain(cur, '2026-11-16', '2026-11-18').level).toBeNull() // sem histórico, sem comparação
  })
})

// 4 ciclos de 28 dias a partir de 2026-07-06 (menstruação de 5 dias)
const starts = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28', '2026-10-26']
const cyc = (days = {}) => normalizeCycle({ enabled: true, periods: starts.map((st) => ({ start: st, end: addDaysISO(st, 4) })), days })

describe('ciclo, fase 2', () => {
  it('fase de cada dia vivido pelo ciclo registrado', () => {
    const c = cyc()
    expect(phaseOf(c, '2026-07-06')).toBe('menstruacao')
    expect(phaseOf(c, '2026-07-10')).toBe('menstruacao')
    expect(phaseOf(c, '2026-07-12')).toBe('primeira')
    expect(phaseOf(c, '2026-07-25')).toBe('segunda')
    expect(phaseOf(c, '2026-07-30')).toBe('antes')
    expect(phaseOf(c, '2026-07-01')).toBeNull()
  })
  it('padrão pessoal: rodagens mais lentas na menstruação, com a amostra; poucos dados não viram frase', () => {
    const ws = []
    starts.slice(0, 4).forEach((st, k) => {
      for (const [off, pace] of [[0, 400], [1, 410], [8, 370], [10, 372], [18, 368], [24, 375]]) ws.push(done(`w${k}-${off}`, addDaysISO(st, off), { result: { distanceKm: 5, elapsedSec: 5 * pace, avgHr: off < 5 ? 158 : 150 } }))
    })
    const days = {}
    starts.slice(0, 4).forEach((st) => { days[st] = { flow: 3, energy: 2 }; days[addDaysISO(st, 1)] = { flow: 3, energy: 1 }; days[addDaysISO(st, 12)] = { energy: 4 }; days[addDaysISO(st, 20)] = { energy: 4 } })
    const p = cyclePatterns(cyc(days), ws, '2026-11-19')
    expect(p.ready).toBe(true)
    expect(p.cycles).toBe(4)
    const m = p.phases.find((x) => x.id === 'menstruacao')
    expect(m.runs).toBe(8)
    expect(p.insights[0]).toBe('Nos dias de menstruação, suas rodagens foram em média 34 s/km mais lentas (8 treinos em 4 ciclos).')
    expect(p.insights).toContain('Nos dias de menstruação, a FC média nas rodagens ficou 8 bpm mais alta.')
    expect(p.insights.some((t) => t.startsWith('Nos dias de menstruação, você costuma anotar menos energia (1,5 de 5, em 8 dias)'))).toBe(true)
    expect(p.phases.find((x) => x.id === 'antes').runs).toBe(4) // < 5: sem frase
    expect(p.insights.some((t) => t.includes('5 dias antes'))).toBe(false)
  })
  it('sem 3 ciclos: não compara', () => {
    const c = normalizeCycle({ enabled: true, periods: starts.slice(0, 2).map((st) => ({ start: st })) })
    expect(cyclePatterns(c, [], '2026-11-19')).toMatchObject({ ready: false, insights: [] })
  })
  it('aviso ao remanejar treino forte para um dia do ciclo que costuma ser difícil', () => {
    const days = {}
    starts.forEach((st) => { days[st] = { flow: 3, energy: 1 }; days[addDaysISO(st, 1)] = { flow: 3, energy: 2 } })
    const c = cyc(days)
    // Próxima prevista: 2026-11-23 (dia 1)
    expect(hardDayNote(c, '2026-11-23', '2026-11-19')).toBe('nos seus últimos ciclos, este dia costuma ser difícil (energia baixa)')
    expect(hardDayNote(c, '2026-11-20', '2026-11-19')).toBeNull()
    const tiros = { id: 't', name: 'Tiros', date: '2026-11-18', status: 'planejado', sport: 'corrida', items: [{ kind: 'repeat', times: 6, steps: [{ kind: 'step', type: 'tiro', duration: { kind: 'distance', value: 800 }, target: { kind: 'none' } }] }] }
    const opts = suggestDates(tiros, { workouts: [tiros], today: '2026-11-19', cycle: c, days: 7 })
    const d23 = opts.find((o) => o.date === '2026-11-23')
    expect(d23.notes).toContain('nos seus últimos ciclos, este dia costuma ser difícil (energia baixa)')
    expect(suggestDates(tiros, { workouts: [tiros], today: '2026-11-19', days: 7 }).find((o) => o.date === '2026-11-23').notes).toEqual(['vai para a semana seguinte'])
  })
})

describe('story do mês', () => {
  it('força com cor própria, “X de Y treinos” e recorde de carga do mês', () => {
    const gym = (id, date, kg) => ({ id, name: 'Força', sport: 'academia', date, status: 'feito', items: [], plannedMin: 60, result: { elapsedSec: 3600, distanceKm: 0, sets: [s(28, 10, kg)] } })
    const ws = [gym('a', '2026-10-27', 40), gym('b', '2026-11-03', 45), gym('c', '2026-11-17', 50), { id: 'x', name: 'Rodagem', date: '2026-11-10', status: 'pulado', items: [], sport: 'corrida' }]
    const st = storyFor('mes', { races: [], workouts: ws, goals: [], today: '2026-11-18', opts: { times: true } })
    expect(st.days.filter((d) => d.kind).map((d) => [d.day, d.kind])).toEqual([[3, 'forca'], [17, 'forca']])
    expect(st.kinds).toEqual(['forca'])
    expect(st.counts).toBe('2 de 3 treinos · 2 treinos de força')
    expect(st.badges).toContain('Recorde: Agachamento 50 kg')
    expect(storyFor('mes', { races: [], workouts: ws, goals: [], today: '2026-11-18', opts: { times: false } }).badges.some((b) => b.startsWith('Recorde'))).toBe(false)
  })
})

describe('ficha de força para o relógio (.FIT)', () => {
  it('treino de musculação: série por repetições com carga, descanso no botão e repetição por série', async () => {
    const { Decoder, Stream } = await import('@garmin/fitsdk')
    const { workoutToFit } = await import('./workoutFit.js')
    const f = workoutToFit(normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 50, exercises: [{ cat: 28, sets: 3, reps: 12, kg: 42.5 }, { cat: 19, sets: 2, reps: null, kg: null }, { cat: 17, sets: 1, reps: 10, kg: null }] }))
    const d = new Decoder(Stream.fromByteArray(f))
    expect(d.isFIT() && d.checkIntegrity()).toBe(true)
    const { messages, errors } = d.read()
    expect(errors).toEqual([])
    expect(messages.workoutMesgs[0]).toMatchObject({ sport: 'training', subSport: 'strengthTraining', numValidSteps: 8, wktName: 'Pernas' })
    const st = messages.workoutStepMesgs
    expect(st[0]).toMatchObject({ durationType: 'reps', durationReps: 12, exerciseCategory: 'squat', exerciseName: 61, exerciseWeight: 42.5, weightDisplayUnit: 'kilogram', intensity: 'active' })
    expect(st[1]).toMatchObject({ wktStepName: 'Descanso', durationType: 'open', intensity: 'rest' })
    expect(st[2]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 0, repeatSteps: 3 })
    expect(st[3]).toMatchObject({ durationType: 'open', exerciseCategory: 'plank', exerciseName: 43 })
    expect(st[6]).toMatchObject({ durationType: 'reps', durationReps: 10, exerciseCategory: 'lunge' })
    expect(st[6].exerciseWeight).toBeUndefined()
    expect(st).toHaveLength(8) // a série única do afundo não tem passo de repetição
  })
})
