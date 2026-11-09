import { describe, it, expect } from 'vitest'
import { reviewInviteYear, reviewYears, yearReview, formatHours } from './yearReview.js'
import { pushNotificationsFor, resultReminders } from './alerts.js'
import { buildSchedule, kitSchedule, legMinutes, minToHm } from './schedule.js'
import { scheduleEvents, pointsKey, tripPoints } from './logistics.js'
import { emptyRace, emptyResult, emptyGoal, normalizeGoal, normalizeRace } from './model.js'

let n = 0
const res = (km, t, o = {}) => ({ ...emptyResult(), officialDistanceKm: km, netTime: t, ...o })
const race = (o) => normalizeRace({ ...emptyRace(), id: 'r' + ++n, name: 'Prova ' + n, status: 'concluida', ...o })

describe('retrospectiva do ano', () => {
  const races = [
    race({ name: '10K antigo', date: '2025-05-01', city: 'Jundiaí', state: 'SP', result: res(10, 3100) }),
    race({ name: '10K de março', date: '2026-03-01', city: 'Jundiaí', state: 'SP', feePaid: 100, result: res(10, 3000) }),
    race({ name: '10K de junho', date: '2026-06-10', city: 'Itatiba', state: 'SP', feePaid: 120, targetTime: 2950, result: res(10, 2900) }),
    race({ name: 'Meia do Rio', date: '2026-08-20', city: 'Rio de Janeiro', state: 'RJ', feePaid: 200, result: res(21.1, 6600) }),
    race({ name: '5K pessoal', date: '2026-08-02', city: 'Jundiaí', state: 'SP', result: res(5, 1500, { isOfficial: false }) }),
    race({ name: 'Futura', status: 'inscrita', date: '2027-04-10' })
  ]
  const goals = [normalizeGoal({ ...emptyGoal('primeira'), id: 'g', title: 'Primeira meia', distanceKm: 21.1, targetValue: 21.1, deadline: '2026-12-31' })]
  it('números, mês mais ativo, distâncias, lugares e gastos', () => {
    const rv = yearReview(races, goals, 2026, '2026-12-05')
    expect(rv).toMatchObject({ count: 4, km: 46.1, empty: false, topMonth: 7, spent: 420, nextYear: 1 })
    expect(rv.timeSec).toBe(3000 + 2900 + 6600 + 1500)
    expect(rv.months).toEqual([0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 0])
    expect(rv.distances.map((d) => [d.key, d.count])).toEqual([['10.0', 2], ['5.0', 1], ['21.1', 1]])
    expect(rv.places.map((p) => p.city)).toEqual(['Jundiaí', 'Itatiba', 'Rio de Janeiro'])
    expect(rv.states).toEqual(['SP', 'RJ'])
    expect(rv.goalsDone.map((g) => g.id)).toEqual(['g'])
  })
  it('recordes (só o melhor por distância), primeiras vezes, metas e destaque', () => {
    const rv = yearReview(races, goals, 2026, '2026-12-05')
    expect(rv.prs).toHaveLength(1)
    expect(rv.prs[0]).toMatchObject({ key: '10.0', gain: 200 }) // 3100 → 2900 (o recorde final do ano)
    expect(rv.firsts.map((f) => f.key)).toEqual(['5.0', '21.1']) // em ordem cronológica
    expect(rv.targets).toEqual({ set: 1, hit: 1 })
    expect(rv.highlight).toMatchObject({ why: 'pr', gain: 200 })
    expect(rv.longest.name).toBe('Meia do Rio')
    expect(rv.fastest.name).toBe('10K de junho')
  })
  it('ano vazio, anos disponíveis e quando convidar', () => {
    expect(yearReview(races, [], 2024, '2026-12-05').empty).toBe(true)
    expect(reviewYears(races)).toEqual([2026, 2025])
    expect(reviewInviteYear('2026-12-01')).toBe(2026)
    expect(reviewInviteYear('2027-01-15')).toBe(2026)
    expect(reviewInviteYear('2026-11-09')).toBe(null)
    expect(formatHours(14000)).toBe('3 h 53 min')
  })
  it('km dirigidos vêm das rotas da logística', () => {
    const r = race({ status: 'concluida', date: '2026-09-01', venueAddress: 'Rua A, 1', city: 'Itatiba', state: 'SP', result: res(10, 3000), logistics: { origin: { address: 'Casa, Jundiaí' } } })
    const key = pointsKey(tripPoints(r, r.logistics, 'ida'))
    const withRoute = normalizeRace({ ...r, logistics: { ...r.logistics, outbound: { route: { provider: 'manual', legs: [{ distanceKm: 30, durationMin: 35 }], key } }, back: { enabled: false } } })
    expect(yearReview([withRoute], [], 2026, '2026-12-05').kmDriven).toBe(30)
  })
})

describe('lembrete "Como foi?"', () => {
  const today = '2026-11-09'
  it('no dia seguinte à prova inscrita sem resultado', () => {
    const rs = [
      race({ id: 'ontem', name: 'Corrida em Itatiba', status: 'inscrita', date: '2026-11-08' }),
      race({ id: 'anteontem', status: 'inscrita', date: '2026-11-07' }),
      race({ id: 'feita', status: 'concluida', date: '2026-11-08', result: res(10, 3000) })
    ]
    const r = resultReminders(rs, today)
    expect(r).toEqual([{ key: 'ontem:resultado:2026-11-08', type: 'resultado', raceId: 'ontem', url: '/corridas/ontem/resultado', title: 'Como foi a Corrida em Itatiba?', body: expect.stringContaining('Registre o tempo') }])
    expect(pushNotificationsFor(rs, today).map((x) => x.type)).toContain('resultado')
    expect(pushNotificationsFor(rs, today, { resultado: false }).map((x) => x.type)).not.toContain('resultado')
  })
})

describe('acréscimo por trânsito e saída da volta', () => {
  it('só nos trechos sem trânsito previsto', () => {
    expect(legMinutes({ durationMin: 40 }, 25)).toBe(50)
    expect(legMinutes({ durationMin: 40, trafficMin: 44 }, 25)).toBe(44)
    const base = { startTime: '07:00', prep: { arriveBeforeMin: 45, showerMin: 15, dressMin: 15, finalPrepMin: 10, parkingMin: 10, bufferMin: 10 }, legs: [{ distanceKm: 39, durationMin: 52 }], stops: [] }
    const s0 = buildSchedule(base)
    const s20 = buildSchedule({ ...base, prep: { ...base.prep, trafficExtraPct: 20 } })
    expect(s0.depart - s20.depart).toBe(10) // 52 → 62 min
    expect(s0.noTraffic).toBe(true)
    expect(minToHm(kitSchedule({ time: '18:00', legs: [{ durationMin: 30 }], trafficExtraPct: 50, bufferMin: 0 }).depart)).toBe('17:15')
  })
  it('a saída da volta vira evento da agenda (.ics)', () => {
    const r = normalizeRace({ ...emptyRace(), id: 'v', name: 'Prova V', status: 'inscrita', date: '2026-11-20', startTime: '07:00', venueAddress: 'Rua A', city: 'Itatiba', state: 'SP', logistics: { origin: { address: 'Casa' }, back: { departTime: '10:15' } } })
    expect(scheduleEvents(r)).toEqual([{ key: 'volta', title: 'Sair de volta para casa – Prova V', date: '2026-11-20', time: '10:15' }])
  })
})
