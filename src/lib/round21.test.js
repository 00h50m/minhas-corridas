// Retirada do kit no dia da prova: horário sugerido, agenda que chega a tempo e passo no dia.
import { describe, expect, it } from 'vitest'
import { buildSchedule, kitDayTime } from './schedule.js'
import { normalizeRace } from './model.js'
import { daySteps } from './dayPlan.js'
import { normalizeLogistics, pointsKey, raceKitSchedule, raceSchedule } from './logistics.js'

describe('kit no dia da prova', () => {
  it('horário sugerido: 1 h antes da largada (ou 45/30 min)', () => {
    expect(kitDayTime('07:00')).toBe('06:00')
    expect(kitDayTime('07:00', 45)).toBe('06:15')
    expect(kitDayTime('')).toBe('')
  })
  it('a data da retirada acompanha a da prova', () => {
    const r = normalizeRace({ name: 'X', date: '2026-12-12', kitOnRaceDay: true, kitPickupDate: '2026-12-10' })
    expect(r.kitPickupDate).toBe('2026-12-12')
    expect(normalizeRace({ name: 'X', date: '2026-12-12', kitPickupDate: '2026-12-10' }).kitPickupDate).toBe('2026-12-10')
  })
  it('a agenda faz chegar até o horário da retirada (antes do que o padrão pediria)', () => {
    // padrão: chegar 45 min antes (06:15); retirada às 06:00 → chegar até 06:00
    const base = buildSchedule({ startTime: '07:00', legs: [{ durationMin: 30 }], stops: [] })
    const withKit = buildSchedule({ startTime: '07:00', legs: [{ durationMin: 30 }], stops: [], kit: { time: '06:00' } })
    expect(withKit.arrivalTarget).toBe(360)
    expect(withKit.depart).toBe(base.depart - 15)
    const kit = withKit.items.find((i) => i.key === 'kit')
    expect(kit).toMatchObject({ at: 360, label: 'Retirar o kit', highlight: true })
    // na linha do tempo, depois da chegada e antes do aquecimento
    const keys = withKit.items.map((i) => i.key)
    expect(keys.indexOf('kit')).toBeGreaterThan(keys.indexOf('chegada'))
    expect(keys.indexOf('kit')).toBeLessThan(keys.indexOf('aquecimento'))
    // retirada mais tarde que o padrão não adianta nada; e avisa se cair depois do aquecimento
    const late = buildSchedule({ startTime: '07:00', legs: [{ durationMin: 30 }], stops: [], kit: { time: '06:45' } })
    expect(late.arrivalTarget).toBe(375)
    expect(late.warnings.some((w) => /kit/.test(w))).toBe(true)
  })
  it('na prova com logística: agenda com o kit, passo “Retirar o kit” e sem trajeto separado do kit', () => {
    const P = { casa: { label: 'Casa', address: 'Casa', lat: -23.17, lon: -46.88 }, pac: { label: 'PAC', address: 'PAC', lat: -23.04, lon: -46.98 } }
    const race = normalizeRace({
      id: 'r', name: 'Prova', date: '2026-12-12', startTime: '07:00', venueAddress: 'PAC', kitOnRaceDay: true, kitPickupTime: '06:00',
      logistics: normalizeLogistics({ origin: P.casa, destination: P.pac, prep: {}, kit: { enabled: true }, outbound: { stops: [], route: { provider: 'manual', legs: [{ distanceKm: 20, durationMin: 30 }], key: pointsKey([P.casa, P.pac]) } } })
    })
    const s = raceSchedule(race)
    expect(s.items.find((i) => i.key === 'kit').at).toBe(360)
    const steps = daySteps(s, [{ ...P.casa, role: 'origin' }, { ...P.pac, role: 'dest' }])
    expect(steps.map((x) => x.key)).toEqual(['sair', 'chegar-destino', 'kit'])
    expect(steps.at(-1)).toMatchObject({ label: 'Retirar o kit', action: 'Retirei o kit', at: 360 })
    expect(raceKitSchedule({ ...race, kitPickupTime: '06:00' })).toBe(null)
  })
})
