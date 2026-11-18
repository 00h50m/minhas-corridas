// Rodada 29: semana que fechou (Início e aviso de segunda), story de prova concluída e resumo do mês.
import { describe, expect, it, vi } from 'vitest'
import { weekRecap } from './trainingWeek.js'
import { pushNotificationsFor, trainingWeekPush } from './alerts.js'
import { runPushJob } from './pushJob.js'
import { normalizeWorkout } from './workout.js'
import { storyFor, storyMonth } from './storyData.js'

// Semana de 16/11/2026 (segunda) a 22/11 (domingo)
const run = (id, date, status = 'feito', extra = {}) => ({ ...normalizeWorkout({ id, name: id, date, items: [{ type: 'corrida', duration: { kind: 'time', value: 1800 } }] }), id, status, ...extra })
const ws = [run('a', '2026-11-17', 'feito', { result: { distanceKm: 4.2, elapsedSec: 1860, laps: [] } }), run('b', '2026-11-21'), run('p1', '2026-11-10'), run('p2', '2026-11-13')]

describe('semana que fechou', () => {
  it('domingo: a semana atual; segunda: a passada; outros dias: nada', () => {
    expect(weekRecap(ws, '2026-11-22')).toMatchObject({ start: '2026-11-16', done: 2, planned: 2, complete: true, streak: 2 })
    expect(weekRecap(ws, '2026-11-23')).toMatchObject({ start: '2026-11-16', complete: true })
    expect(weekRecap(ws, '2026-11-20')).toBeNull()
    expect(weekRecap([], '2026-11-22')).toBeNull()
  })
  it('aviso de segunda com atalho para o story da semana', () => {
    expect(trainingWeekPush(ws, '2026-11-22')).toBeNull()
    const n = trainingWeekPush(ws, '2026-11-23')
    expect(n.title).toBe('Semana fechada: 2 de 2 treinos 🔥')
    expect(n.body).toBe('1 h 01 de treino · 4,2 km · 2 semanas seguidas. Toque para postar no story.')
    expect(n.url).toBe('/stories?modelo=semana&semana=2026-11-16')
    expect(n.key).toBe('treinos-semana:2026-11-16')
    expect(pushNotificationsFor([], '2026-11-23', { weekly: false }, [], ws).some((x) => x.key === n.key)).toBe(false)
    expect(pushNotificationsFor([], '2026-11-23', null, [], ws).length).toBe(0) // resumo de segunda vem desligado
    expect(pushNotificationsFor([], '2026-11-23', { weekly: true }, [], ws)[0].key).toBe(n.key)
  })
  it('a rodada diária lê os treinos da nuvem', async () => {
    const sent = []
    const db = {
      subscriptions: async () => [{ endpoint: 'e1', user_id: 'u', tz: 'America/Sao_Paulo' }],
      races: async () => [],
      prefs: async () => ({ weekly: true }),
      workouts: async () => ws,
      claim: async (u, keys) => keys,
      release: vi.fn(),
      removeSubscription: vi.fn(),
      cleanup: async () => {}
    }
    await runPushJob({ db, send: async (d, payload) => sent.push(payload), now: new Date('2026-11-23T11:00:00Z') })
    expect(sent.map((s) => s.title)).toContain('Semana fechada: 2 de 2 treinos 🔥')
  })
  it('story da semana escolhida', () => {
    const s = storyFor('semana', { races: [], workouts: ws, today: '2026-11-23', opts: {}, week: '2026-11-16' })
    expect(s.subtitle).toBe('16/11 a 22/11')
    expect(s.stats[0].value).toBe('2/2')
  })
})

describe('story de prova concluída', () => {
  const races = [
    { id: 'cb', name: 'Corrida do Bem', date: '2026-10-20', status: 'concluida', city: 'Jundiaí', state: 'SP', distanceKm: 5, result: { netTime: 2410, officialDistanceKm: 5, isOfficial: true } },
    { id: 'hc', name: 'Health Care Run', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', state: 'SP', distanceKm: 5, targetTime: 2400, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true, overallPlace: 812, categoryPlace: 45, category: 'F30-34' } }
  ]
  it('com tempos: tempo, pace, colocações e selos', () => {
    const s = storyFor('resultado', { races, workouts: [], today: '2026-11-17', opts: { times: true, cities: true } })
    expect(s.name).toBe('Health Care Run')
    expect(s.big).toBe('39:30')
    expect(s.distance).toBe('5 km')
    expect(s.line).toBe('Vinhedo/SP')
    expect(s.stats.map((x) => x.value)).toEqual(['7:54', '812º', '45º'])
    expect(s.badges).toEqual(['Recorde pessoal (−0:40)', 'Meta batida'])
  })
  it('sem tempos: “concluída”, sem pace e sem a diferença do recorde', () => {
    const s = storyFor('resultado', { races, workouts: [], today: '2026-11-17', opts: { times: false, cities: false }, raceId: 'hc' })
    expect(s.big).toBe('CONCLUÍDA')
    expect(s.line).toBeNull()
    expect(s.stats.map((x) => x.value)).toEqual(['812º', '45º'])
    expect(s.badges).toEqual(['Recorde pessoal', 'Meta batida'])
    expect(storyFor('resultado', { races, workouts: [], today: '2026-11-17', opts: {}, raceId: 'cb' }).badges).toEqual(['Primeira de 5 km'])
    expect(storyFor('resultado', { races: [], workouts: [], today: '2026-11-17', opts: {} }).ok).toBe(false)
  })
})

describe('resumo do mês', () => {
  it('mês: o atual; nos 3 primeiros dias, o anterior; ou o escolhido', () => {
    expect(storyMonth('2026-11-17')).toBe('2026-11')
    expect(storyMonth('2026-12-02')).toBe('2026-11')
    expect(storyMonth('2027-01-03')).toBe('2026-12')
    expect(storyMonth('2026-11-17', '2026-10')).toBe('2026-10')
    expect(storyMonth('2026-11-17', '2026-13')).toBe('2026-11')
  })
  it('calendário, números e conquistas do mês', () => {
    const races = [{ id: 'hc', name: 'HC', date: '2026-11-15', status: 'concluida', city: 'Vinhedo', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5, isOfficial: true } }]
    const acad = { ...normalizeWorkout({ name: 'Pernas', sport: 'academia', plannedMin: 50, date: '2026-11-03' }), id: 'ac', status: 'feito' }
    const s = storyFor('mes', { races, workouts: [...ws, acad], goals: [], today: '2026-11-17', opts: { times: true } })
    expect(s.title).toBe('Novembro 2026')
    expect(s.offset).toBe(6) // 1/11/2026 é domingo
    expect(s.days.length).toBe(30)
    expect(s.days.filter((d) => d.kind).map((d) => [d.day, d.kind])).toEqual([[3, 'outra'], [10, 'corrida'], [13, 'corrida'], [15, 'prova'], [17, 'corrida']])
    expect(s.stats.map((x) => x.value)).toEqual(['5', '9,2', '3'])
    expect(s.counts).toBe('3 corridas · 1 prova · 1 outra atividade')
    expect(s.badges).toEqual(['Sub 40 nos 5 km', '2 semanas seguidas', 'Primeiros 5 km'])
    expect(storyFor('mes', { races: [], workouts: [], goals: [], today: '2026-11-17', opts: {} }).ok).toBe(false)
  })
})
