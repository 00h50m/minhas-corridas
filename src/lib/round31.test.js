// Rodada 31: remanejar treinos (regra de sugestão, histórico e regra para os que passam sem marcar).
import { describe, expect, it } from 'vitest'
import { applyMissedRule, missedWorkouts, moveWorkout, movedLabel, suggestDates } from './reschedule.js'
import { normalizeWorkout } from './workout.js'
import { normalizeProfile } from './profile.js'

const run = (id, date, extra = {}) => ({ ...normalizeWorkout({ id, name: id, date, items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }] }), id, ...extra })
// Corre terça (17/11) e sábado (21/11). Hoje: quarta, 18/11.
const ter = run('Ter', '2026-11-17')
const sab = run('Sab', '2026-11-21')

describe('sugestão de novo dia', () => {
  it('treino que passou: hoje mesmo, com descanso entre as corridas', () => {
    const s = suggestDates(ter, { workouts: [ter, sab], today: '2026-11-18' })
    expect(s.map((x) => [x.date, x.clean])).toEqual([['2026-11-18', true], ['2026-11-19', true], ['2026-11-23', false], ['2026-11-24', false], ['2026-11-20', false], ['2026-11-22', false]])
    expect(s.find((x) => x.date === '2026-11-20').notes).toEqual(['fica colado com “Sab” (sáb 21/11), sem dia de descanso'])
    expect(s.find((x) => x.date === '2026-11-23').notes).toEqual(['vai para a semana seguinte'])
  })
  it('treino de hoje: a partir de amanhã; nunca no dia da prova e avisa nos 2 dias antes', () => {
    const races = [{ id: 'p', name: 'Corrida X', date: '2026-11-21', status: 'inscrita' }]
    const s = suggestDates(run('Hoje', '2026-11-18'), { workouts: [], races, today: '2026-11-18' })
    expect(s[0].date).toBe('2026-11-22')
    expect(s.some((x) => x.date === '2026-11-21')).toBe(false)
    expect(s.find((x) => x.date === '2026-11-20').notes).toEqual(['a 1 dia da prova “Corrida X”'])
    expect(s.find((x) => x.date === '2026-11-19').notes).toEqual(['a 2 dias da prova “Corrida X”'])
  })
  it('respeita o prazo do objetivo; academia não bloqueia corrida (só avisa)', () => {
    const w = run('Plano', '2026-11-17', { goalId: 'g' })
    const s = suggestDates(w, { workouts: [w], goals: [{ id: 'g', deadline: '2026-11-19' }], today: '2026-11-18' })
    expect(s.map((x) => x.date)).toEqual(['2026-11-18', '2026-11-19'])
    const acad = { ...normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 40, date: '2026-11-18' }), id: 'ac' }
    const s2 = suggestDates(ter, { workouts: [ter, acad], today: '2026-11-18' })
    expect(s2.find((x) => x.date === '2026-11-18').notes).toEqual(['mesmo dia de “Pernas”'])
  })
})

describe('mover e a regra', () => {
  it('guarda o histórico e volta para planejado', () => {
    const m = moveWorkout({ ...ter, status: 'pulado' }, '2026-11-19', '2026-11-18')
    expect(m).toMatchObject({ date: '2026-11-19', status: 'planejado', moves: [{ from: '2026-11-17', to: '2026-11-19', at: '2026-11-18', auto: false }] })
    expect(movedLabel(m)).toBe('remanejado · era ter 17/11')
    const m2 = moveWorkout(m, '2026-11-20', '2026-11-19', true)
    expect(movedLabel(m2)).toBe('remanejado 2× · era ter 17/11')
    expect(normalizeWorkout(m2).moves.length).toBe(2)
    expect(normalizeWorkout({ name: 'x', moves: [{ from: 'ontem', to: '2026-11-19' }] }).moves).toEqual([])
  })
  it('perguntar: nada; pular: marca não fiz; remanejar: só para dia sem avisos e no máximo 2 vezes sozinho', () => {
    const ctx = { workouts: [ter, sab], races: [], goals: [], today: '2026-11-18' }
    expect(applyMissedRule('perguntar', ctx)).toEqual([])
    expect(applyMissedRule('pular', ctx).map((x) => [x.w.id, x.skip])).toEqual([['Ter', true]])
    expect(applyMissedRule('remanejar', ctx).map((x) => [x.w.id, x.to])).toEqual([['Ter', '2026-11-18']])
    const twice = { ...ter, moves: [{ from: '2026-11-15', to: '2026-11-16', auto: true }, { from: '2026-11-16', to: '2026-11-17', auto: true }] }
    expect(applyMissedRule('remanejar', { ...ctx, workouts: [twice, sab] })).toEqual([])
    const old = run('Velho', '2026-11-05')
    expect(applyMissedRule('pular', { ...ctx, workouts: [old] })).toEqual([])
    expect(missedWorkouts([old, ter, sab], '2026-11-18').map((w) => w.id)).toEqual(['Velho', 'Ter'])
  })
  it('dois treinos perdidos não vão para o mesmo dia', () => {
    const seg = run('Seg', '2026-11-16')
    const r = applyMissedRule('remanejar', { workouts: [seg, ter, sab], races: [], goals: [], today: '2026-11-18' })
    expect(r.map((x) => [x.w.id, x.to])).toEqual([['Seg', '2026-11-18']])
  })
  it('a regra fica no perfil (sincroniza); padrão: perguntar', () => {
    expect(normalizeProfile({}).missedRule).toBe('perguntar')
    expect(normalizeProfile({ missedRule: 'remanejar' }).missedRule).toBe('remanejar')
    expect(normalizeProfile({ missedRule: 'x' }).missedRule).toBe('perguntar')
  })
})
