// Rodada 32: reta final da prova e avisos de treino (treino do dia, sem marcar, item da reta final).
import { describe, expect, it } from 'vitest'
import { finalStretch, isHard, paceWorkout, showStretch, stretchToday } from './finalStretch.js'
import { workoutPushes } from './workoutPush.js'
import { normalizeWorkout, newStep, flatten } from './workout.js'
import { normalizeRace } from './model.js'

const natal = normalizeRace({ id: 'na', name: 'Corrida de Natal', date: '2026-12-12', status: 'inscrita', distanceKm: 10, startTime: '07:00', targetTime: 4500, kitPickupDate: '2026-12-11', kitPickupTime: '10:00' })
const run = (id, date, extra = {}) => ({ ...normalizeWorkout({ id, name: id, date, items: [newStep('corrida', { duration: { kind: 'time', value: 1800 } })] }), id, ...extra })

describe('reta final', () => {
  it('aparece de 28 dias antes até o dia seguinte', () => {
    expect(showStretch(natal, '2026-11-14')).toBe(true)
    expect(showStretch(natal, '2026-11-13')).toBe(false)
    expect(showStretch(natal, '2026-12-13')).toBe(true)
    expect(showStretch({ ...natal, status: 'interesse' }, '2026-11-20')).toBe(false)
  })
  it('linha do tempo com as datas certas', () => {
    const it = finalStretch(natal, { today: '2026-11-18' })
    const at = (id) => it.find((x) => x.id === id).date
    expect(at('ritmo')).toBe('2026-11-24')
    expect(at('roupa')).toBe('2026-11-28')
    expect(at('forte')).toBe('2026-12-02')
    expect(at('leve')).toBe('2026-12-05')
    expect(at('kit')).toBe('2026-12-11')
    expect(at('separar')).toBe('2026-12-11')
    expect(at('resultado')).toBe('2026-12-13')
    expect(it.find((x) => x.id === 'cafe').title).toBe('Café da manhã por volta das 04:30')
    expect(it.find((x) => x.id === 'ritmo').desc).toBe('Uns 4 km a 7:30 /km (o pace da meta), para o corpo conhecer o ritmo.')
    expect(it.every((x) => x.state === 'futuro')).toBe(true)
  })
  it('o app marca sozinho: ritmo feito, kit no checklist, resultado; e o que foi marcado à mão', () => {
    const ws = [run('Ritmo', '2026-11-25', { status: 'feito', result: { distanceKm: 4, elapsedSec: 1810, laps: [] } })]
    const r = { ...natal, checklist: [{ id: 'k', text: 'Kit retirado', done: true }], stretchDone: ['roupa'] }
    const it = finalStretch(r, { workouts: ws, today: '2026-11-29' })
    const get = (id) => it.find((x) => x.id === id)
    expect(get('ritmo')).toMatchObject({ done: true, auto: true, note: 'feito em “Ritmo” (qua 25/11)' })
    expect(get('roupa')).toMatchObject({ done: true, auto: false })
    expect(get('kit').done).toBe(true)
    expect(get('resultado').done).toBe(false)
    expect(normalizeRace({ ...r, stretchDone: ['roupa', 'roupa', 'X Y', 3] }).stretchDone).toEqual(['roupa'])
  })
  it('avisa treino forte perto da prova e semana pesada', () => {
    const tiros = { ...normalizeWorkout({ name: 'Tiros', date: '2026-12-09', items: [newStep('tiro')] }), id: 't' }
    expect(isHard(tiros)).toBe(true)
    const ws = [tiros, ...['2026-11-14', '2026-11-21', '2026-11-28'].map((d, i) => run(`s${i}`, d)), run('a', '2026-12-06'), run('b', '2026-12-08')]
    const it = finalStretch(natal, { workouts: ws, today: '2026-12-03' })
    expect(it.find((x) => x.id === 'forte').warn).toBe('“Tiros” (qua 09/12) é forte e está a 3 dias da prova: considere trocar por uma rodagem leve ou remanejar.')
    const leve = it.find((x) => x.id === 'leve')
    expect(leve.desc).toMatch(/^Planejado nos 7 dias antes: 1h02 \(208% das semanas anteriores, 30 min\)/)
    expect(leve.warn).toBe('A semana da prova está com 208% do volume normal.')
  })
  it('item de hoje (ou o próximo) e o treino “ritmo de prova”', () => {
    const it = finalStretch(natal, { today: '2026-12-02' })
    expect(stretchToday(it, '2026-12-02').id).toBe('forte')
    expect(stretchToday(it, '2026-12-03').id).toBe('leve')
    const w = paceWorkout(natal, '2026-11-24')
    expect(w.name).toBe('Ritmo de prova 4 km')
    expect(w.raceId).toBe('na')
    expect(flatten(w.items).map((s) => [s.type, s.duration.value, s.target.kind === 'pace' ? [s.target.min, s.target.max] : null])).toEqual([['aquecimento', 600, null], ['corrida', 4000, [445, 455]], ['desaquecimento', 300, null]])
  })
})

describe('avisos de treino (manhã)', () => {
  it('treino de hoje, o de ontem sem marcar e o item da reta final', () => {
    const ws = [run('Tiros', '2026-12-02'), run('Rodagem', '2026-12-01')]
    const out = workoutPushes(ws, [natal], '2026-12-02', { treino: true, reta: true })
    expect(out.map((x) => x.key)).toEqual(['treino:Tiros:2026-12-02', 'treino-passou:Rodagem:2026-12-01', 'reta:na:2026-12-02'])
    expect(out[0]).toMatchObject({ title: 'Treino de hoje: Tiros', body: '30 min · ≈ 30:00', url: '/treinos/Tiros' })
    expect(out[1]).toMatchObject({ title: 'Ontem: “Rodagem” ficou sem marcar', url: '/treinos/Rodagem' })
    expect(out[2]).toMatchObject({ title: 'Reta final · Corrida de Natal (faltam 10 dias)', body: 'Último treino forte', url: '/corridas/na' })
    expect(workoutPushes(ws, [natal], '2026-12-02', { treino: false, reta: false })).toEqual([])
    expect(workoutPushes([], [natal], '2026-12-12', { reta: true })).toEqual([]) // café e dia da prova já têm o aviso da prova
  })
})
