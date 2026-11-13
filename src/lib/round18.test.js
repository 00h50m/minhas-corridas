// Dia da prova passo a passo: passos, atraso, projeção e mensagens.
import { describe, expect, it } from 'vitest'
import { buildSchedule } from './schedule.js'
import { dayStatus, daySteps, delayLabel, legNavLinks, onTheWayMessage } from './dayPlan.js'
import { scheduleEvents, normalizeLogistics } from './logistics.js'
import { buildICS } from './ics.js'
import { normalizeDayLog } from './model.js'

const points = [
  { label: 'Casa', role: 'origin', lat: -23.17, lon: -46.88 },
  { label: 'Dani', role: 'stop', dwellMin: 5, personId: 'p1', lat: -23.18, lon: -46.89 },
  { label: 'Portal do Medeiros', role: 'stop', dwellMin: 5, lat: -23.2, lon: -47.01 },
  { label: 'PAC Volkswagen', role: 'dest', lat: -23.04, lon: -46.98 }
]
// largada 07:00; trechos 6, 30, 40 min
const sched = buildSchedule({ startTime: '07:00', legs: [{ durationMin: 6 }, { durationMin: 30 }, { durationMin: 40 }], stops: points.slice(1, 3) })

describe('passos do dia', () => {
  it('sair de casa, chegar/sair de cada parada, chegar ao local — com os horários da agenda', () => {
    const steps = daySteps(sched, points)
    expect(steps.map((s) => s.key)).toEqual(['sair', 'chegar-0', 'sair-0', 'chegar-1', 'sair-1', 'chegar-destino'])
    // 07:00 − 45 − 10 = 06:05 no estacionamento; − 76 de direção − 10 de paradas − 10 de margem = 04:29
    expect(steps[0].at).toBe(4 * 60 + 29)
    expect(steps.map((s) => s.at)).toEqual([269, 275, 280, 310, 315, 355])
    expect(steps[1]).toMatchObject({ personId: 'p1', label: 'Chegar: Dani' })
    expect(steps[0].to.label).toBe('Dani')
    expect(steps[4].to.label).toBe('PAC Volkswagen')
  })
  it('sem marcações e antes da hora: no horário; depois da hora sem sair: atraso cresce com o relógio', () => {
    const steps = daySteps(sched, points)
    expect(dayStatus(steps, {}, 250)).toMatchObject({ delayMin: 0, late: false, currentIdx: 0 })
    const late = dayStatus(steps, {}, 276)
    expect(late).toMatchObject({ delayMin: 7, late: true })
    expect(late.steps.map((s) => s.projected)).toEqual([276, 282, 287, 317, 322, 362])
  })
  it('marcações reais: atraso do último passo projeta os próximos; adiantada também', () => {
    const steps = daySteps(sched, points)
    const st = dayStatus(steps, { sair: '04:36', 'chegar-0': '04:41' }, 282)
    expect(st.delayMin).toBe(6)
    expect(st.current.key).toBe('sair-0')
    expect(st.steps.find((s) => s.key === 'chegar-destino').projected).toBe(361)
    expect(delayLabel(6)).toBe('Atrasada 6 min')
    const early = dayStatus(steps, { sair: '04:25' }, 270)
    expect(early.delayMin).toBe(-4)
    expect(delayLabel(-4)).toBe('Adiantada 4 min')
    expect(delayLabel(1)).toBe('No horário')
    const done = dayStatus(steps, Object.fromEntries(steps.map((s) => [s.key, '06:00'])), 400)
    expect(done.finished).toBe(true)
  })
  it('mensagem e navegação até o próximo ponto', () => {
    expect(onTheWayMessage({ person: { name: 'Dani Souza' }, at: 281, leftNow: true })).toBe('Oi, Dani! Saí agora e chego aí por volta de 04:41. 🏃')
    expect(legNavLinks(points[1]).google).toContain('destination=-23.18%2C-46.89')
    expect(legNavLinks(points[1]).google).not.toContain('origin=')
  })
  it('marcações guardadas com validação', () => {
    expect(normalizeDayLog({ date: '2026-11-15', marks: { sair: '04:36', 'x y': '1', 'chegar-0': '25:99x' } })).toEqual({ date: '2026-11-15', marks: { sair: '04:36' } })
    expect(normalizeDayLog({ marks: {} })).toBe(null)
  })
})

describe('agenda (.ics) com a saída de cada parada', () => {
  const race = {
    id: 'hc', name: 'Health Care Run', status: 'inscrita', date: '2026-11-15', startTime: '07:00', venueAddress: 'PAC',
    logistics: normalizeLogistics({
      origin: { label: 'Casa', address: 'Casa', lat: -23.17, lon: -46.88 },
      outbound: { stops: [{ id: 's1', label: 'Dani', address: 'Dani', lat: -23.18, lon: -46.89, dwellMin: 5 }], route: { provider: 'manual', legs: [{ distanceKm: 2, durationMin: 6 }, { distanceKm: 20, durationMin: 30 }], key: 'casa | dani | pac' } }
    })
  }
  race.logistics.outbound.route.key = 'casa@-23.17000,-46.88000 | dani@-23.18000,-46.89000 | pac'
  it('baixado: inclui "Sair de Dani" com alarme 10 min antes; assinatura (sem nomes de pessoas): não', () => {
    const evs = scheduleEvents(race, undefined, { stops: true })
    expect(evs.map((e) => e.key)).toEqual(['acordar', 'sair', 'sair-parada-0'])
    expect(evs[2].title).toMatch(/^Sair de Dani – Health Care Run \(chegada \d\d:\d\d\)$/)
    expect(scheduleEvents(race).map((e) => e.key)).toEqual(['acordar', 'sair'])
    const ics = buildICS([race], { schedule: true }).text
    expect(ics).toContain('TRIGGER:-PT10M')
    expect(ics).toContain('UID:hc-sair-parada-0@minhas-corridas')
  })
})

describe('volta passo a passo', async () => {
  const { returnSteps, dropLabel } = await import('./dayPlan.js')
  const { pointsKey } = await import('./logistics.js')
  const P = {
    casa: { label: 'Casa', address: 'Casa', lat: -23.17, lon: -46.88 },
    dani: { id: 's1', label: 'Buscar Dani', address: 'Dani', lat: -23.18, lon: -46.89, dwellMin: 5, personId: 'p1' },
    portal: { id: 's2', label: 'Portal do Medeiros', address: 'Portal', lat: -23.2, lon: -47.01, dwellMin: 3 },
    pac: { label: 'PAC', address: 'PAC', lat: -23.04, lon: -46.98 }
  }
  const race = (back) => ({
    id: 'hc', name: 'HC', date: '2026-11-15', startTime: '07:00', venueAddress: 'PAC',
    logistics: normalizeLogistics({ origin: P.casa, destination: P.pac, outbound: { stops: [P.dani, P.portal] }, back })
  })
  // volta = PAC → Portal → Dani → Casa (mesmas paradas, ao contrário): trechos 35, 30, 6 min
  const routeBack = { provider: 'manual', legs: [{ distanceKm: 25, durationMin: 35 }, { distanceKm: 14, durationMin: 30 }, { distanceKm: 2, durationMin: 6 }], key: pointsKey([P.pac, P.portal, P.dani, P.casa]) }
  it('sai do local na hora informada; chegar e sair de cada parada; "Buscar Dani" vira "Deixar Dani"', () => {
    const r = returnSteps(race({ enabled: true, mode: 'reverse', departTime: '09:30', route: routeBack }))
    expect(r.estimated).toBe(false)
    expect(r.steps.map((s) => [s.key, s.label, s.at])).toEqual([
      ['v-sair', 'Sair de PAC', 570],
      ['v-chegar-0', 'Chegar: Portal do Medeiros', 605],
      ['v-sair-0', 'Sair: Portal do Medeiros', 608],
      ['v-chegar-1', 'Chegar: Deixar Dani', 638],
      ['v-sair-1', 'Sair: Deixar Dani', 643],
      ['v-chegar-casa', 'Chegar em Casa', 649]
    ])
    expect(dropLabel('Buscar Ana')).toBe('Deixar Ana')
  })
  it('sem hora de sair: estima largada + 2h30; sem volta / sem rota: diz o que falta', () => {
    const r = returnSteps(race({ enabled: true, mode: 'reverse', departTime: '', route: routeBack }))
    expect(r.estimated).toBe(true)
    expect(r.steps[0].at).toBe(7 * 60 + 150)
    expect(returnSteps(race({ enabled: false })).reason).toBe('off')
    expect(returnSteps(race({ enabled: true, mode: 'reverse', departTime: '09:30' })).reason).toBe('route')
  })
})
