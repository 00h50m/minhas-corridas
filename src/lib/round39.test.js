// Rodada 39: ficha da academia — texto colado (o formato do Claude no Chrome), conjugados, próximo da
// sequência, “Fiz hoje” virando treino de academia, categoria do relógio e o .FIT com os nomes.
import { describe, expect, it } from 'vitest'
import { activeProgram, blocks, fichaToText, guessCategory, lastDone, nextSheet, normalizeFicha, normalizeProgram, parseFichaText, sheetName, sheetToExercises, workoutFromSheet } from './ficha.js'
import { normalizeWorkout } from './workout.js'
import { compareStrength, exLabel, planLine } from './strength.js'

const TEXT = `FICHA: Treino em academia
OBJETIVO: Emagrecimento - Definição
PERÍODO: 02/11/2026 a 04/12/2026
TREINADOR: Treinador Exemplo

TREINO A
Agachamento barra livre pernas abduzidas | 3 | 8 + diminuir o peso + 10 | — | conjugado
Agachamento peso corporal | 3 | 12 (com peso) + 15 (sem peso) + 10 seg isometria final | 1 minuto e meio
Stiff com halter | 3 | 12 - bombeando duas | — | conjugado
Abdominal infra banco declinado | 3 | 12 | 1 minuto

TREINO B
1. Remada fechada cavalinho máquina | 4 | 10 a 12 | 1 minuto
2. Remada curvada aberta barra reta (pegada pronada) | 4 | 12 | — | conjugado
3. Crucifixo inverso máquina (pegada neutra) | 4 | 12 | 1 minuto
linha sem formato
Puxada alta no cross com barra romana | 4 | 8 + diminuir a carga + 10 + diminuir a carga + 12 | 1 minuto e meio`

describe('ficha: texto colado', () => {
  const r = parseFichaText(TEXT)
  it('lê cabeçalho, treinos, observações, repetições e descanso como escritos', () => {
    expect(r.meta).toEqual({ title: 'Treino em academia', goal: 'Emagrecimento - Definição', from: '2026-11-02', to: '2026-12-04', coach: 'Treinador Exemplo' })
    expect(r.sheets.map((s) => [s.label, s.exercises.length])).toEqual([['A', 4], ['B', 4]])
    expect(r.sheets[0].exercises[0]).toMatchObject({ name: 'Agachamento barra livre pernas abduzidas', note: '', sets: 3, reps: '8 + diminuir o peso + 10', rest: '', withNext: true })
    expect(r.sheets[0].exercises[1]).toMatchObject({ reps: '12 (com peso) + 15 (sem peso) + 10 seg isometria final', rest: '1 minuto e meio', withNext: false })
    expect(r.sheets[1].exercises[1]).toMatchObject({ name: 'Remada curvada aberta barra reta', note: 'pegada pronada', withNext: true })
    expect(r.skipped).toEqual(['linha sem formato'])
  })
  it('conjugados em blocos; o último exercício nunca conjuga', () => {
    expect(blocks(r.sheets[0]).map((b) => b.map((x) => x.name.split(' ')[0]))).toEqual([['Agachamento', 'Agachamento'], ['Stiff', 'Abdominal']])
    const p = normalizeProgram({ sheets: [{ label: 'X', exercises: [{ name: 'A', withNext: true }] }] })
    expect(p.sheets[0].exercises[0].withNext).toBe(false)
  })
  it('volta para texto sem perder nada (ida e volta)', () => {
    const p = normalizeProgram({ ...r.meta, sheets: r.sheets })
    const again = parseFichaText(fichaToText(p))
    expect(again.meta).toEqual(r.meta)
    expect(again.sheets.map((s) => s.exercises.map(({ id, ...x }) => x))).toEqual(r.sheets.map((s) => s.exercises.map(({ id, ...x }) => x)))
  })
})

describe('ficha: uso', () => {
  const p = normalizeProgram({ id: 'f1', ...parseFichaText(TEXT).meta, sheets: parseFichaText(TEXT).sheets })
  const [A, B] = p.sheets
  it('próximo da sequência: A → B → A; e a última vez de cada', () => {
    expect(nextSheet(p, [])).toBe(A)
    const wA = { id: 'w1', status: 'feito', date: '2026-11-17', ficha: { programId: 'f1', sheetId: A.id, label: 'A' } }
    expect(nextSheet(p, [wA])).toBe(B)
    const wB = { id: 'w2', status: 'feito', date: '2026-11-18', ficha: { programId: 'f1', sheetId: B.id, label: 'B' } }
    expect(nextSheet(p, [wA, wB])).toBe(A)
    expect(lastDone(p, [wA, wB])).toEqual({ [A.id]: '2026-11-17', [B.id]: '2026-11-18' })
    expect(sheetName(A)).toBe('Treino A')
  })
  it('categoria do relógio pelo nome do exercício', () => {
    expect([
      'Agachamento búlgaro com halter', 'Leg press 45° pernas abduzidas', 'Stiff com halter', 'Elevação pélvica máquina', 'Recuo com halter e step',
      'Rosca tríceps com barra no cross', 'Rosca bíceps com halter', 'Puxada alta no cross', 'Crucifixo inverso máquina', 'Abdução de ombro com halter sentada',
      'Desenvolvimento ombro aberto com halter', 'Cadeira abdutora', 'Abdominal infra banco declinado', 'Cadeira extensora'
    ].map(guessCategory)).toEqual([17, 28, 8, 10, 17, 30, 7, 21, 9, 14, 24, 11, 6, null])
  })
  it('“Fiz hoje”: treino de academia feito com a ficha como planejado (aproveita a academia planejada do dia)', () => {
    const w = normalizeWorkout(workoutFromSheet(p, A, '2026-11-19'))
    expect(w).toMatchObject({ sport: 'academia', name: 'Treino A', date: '2026-11-19', status: 'feito', ficha: { programId: 'f1', sheetId: A.id, label: 'A' } })
    expect(w.exercises[0]).toMatchObject({ cat: 28, sets: 3, reps: 8, name: 'Agachamento barra livre pernas abduzidas', repsText: '8 + diminuir o peso + 10', withNext: true })
    expect(w.exercises[1]).toMatchObject({ rest: '1 minuto e meio' })
    expect(exLabel(w.exercises[0])).toBe('Agachamento barra livre pernas abduzidas')
    expect(planLine(w.exercises[0])).toBe('3 × 8 + diminuir o peso + 10')
    const planned = { id: 'p1', name: 'Força', sport: 'academia', date: '2026-11-19', status: 'planejado', plannedMin: 50, items: [] }
    expect(workoutFromSheet(p, A, '2026-11-19', planned)).toMatchObject({ id: 'p1', name: 'Treino A', plannedMin: 50, status: 'feito' })
  })
  it('comparação com o relógio pelo exercício; o que o app não reconhece fica “sem par”', () => {
    const ex = sheetToExercises({ exercises: [{ name: 'Agachamento livre', sets: 3, reps: '12', rest: '', note: '', withNext: false }, { name: 'Cadeira extensora', sets: 3, reps: '12', rest: '', note: '', withNext: false }] })
    const c = compareStrength(ex, [{ cat: 28, reps: 12, kg: 40, sec: 60 }, { cat: 28, reps: 12, kg: 40, sec: 60 }, { cat: 28, reps: 12, kg: 40, sec: 60 }])
    expect(c.rows.map((x) => [x.name, x.status])).toEqual([['Agachamento livre', 'ok'], ['Cadeira extensora', 'sem-par']])
    expect([c.ok, c.total]).toEqual([1, 1])
  })
  it('registro sincronizado: várias fichas, a ativa é a mais recente', () => {
    const f = normalizeFicha({ programs: [p, { ...p, id: 'f2' }] })
    expect(activeProgram(f).id).toBe('f2')
    expect(normalizeFicha({ programs: [p], activeId: 'f1' }).activeId).toBe('f1')
    expect(normalizeFicha(null)).toEqual({ programs: [], activeId: null })
  })
  it('.FIT de musculação com o nome do exercício em cada passo', async () => {
    const { Decoder, Stream } = await import('@garmin/fitsdk')
    const { workoutToFit } = await import('./workoutFit.js')
    const w = normalizeWorkout(workoutFromSheet(p, A, '2026-11-19'))
    const { messages } = new Decoder(Stream.fromByteArray(workoutToFit(w))).read()
    expect(messages.workoutStepMesgs[0]).toMatchObject({ wktStepName: 'Agachamento barra l', exerciseCategory: 'squat', durationReps: 8 })
  })
})
