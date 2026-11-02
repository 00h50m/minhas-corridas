import { describe, it, expect } from 'vitest'
import { formatDateBR, isValidISODate, daysBetween, addDaysISO, countdownLabel } from './dates.js'
import { parseDuration, formatDuration, formatPace, paceSeconds, parseKm, parseMoney, formatMoney } from './format.js'
import { validateRace, validateResult, emptyRace, emptyResult } from './model.js'
import { yearSummary, recordsByDistance, applyFilters, nearbyRaces, nextConfirmed, sameDateGroups } from './stats.js'
import { buildICS } from './ics.js'
import { emptyGoal, validateGoal } from './model.js'
import { raceCosts, periodCosts } from './costs.js'
import { goalProgress } from './goals.js'
import { parseBackup, buildBackup } from '../services/backup.js'

const race = (o) => ({ ...emptyRace(), id: Math.random().toString(36), name: 'Prova', ...o })

describe('datas', () => {
  it('formata e valida sem fuso', () => {
    expect(formatDateBR('2026-03-01')).toBe('01/03/2026')
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2028-02-29')).toBe(true)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2) // atravessa mudança de horário em alguns fusos
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(countdownLabel('2026-11-12', '2026-11-02')).toBe('Faltam 10 dias')
    expect(countdownLabel('2026-11-02', '2026-11-02')).toBe('É hoje!')
  })
})

describe('tempos e valores', () => {
  it('aceita tempos acima de uma hora', () => {
    expect(parseDuration('28:45')).toBe(1725)
    expect(parseDuration('1:05:30')).toBe(3930)
    expect(parseDuration('4:12:07')).toBe(15127)
    expect(parseDuration('28:75')).toBe(null)
    expect(parseDuration('1:75:00')).toBe(null)
    expect(parseDuration('abc')).toBe(null)
    expect(formatDuration(3930)).toBe('1:05:30')
  })
  it('aceita tempos digitados só com números (teclado do celular)', () => {
    expect(parseDuration('35')).toBe(2100)
    expect(parseDuration('3530')).toBe(2130)
    expect(parseDuration('15500')).toBe(6900)
    expect(parseDuration('35.30')).toBe(2130)
    expect(parseDuration('1,55,00')).toBe(6900)
    expect(parseDuration('1h55')).toBe(6900)
    expect(parseDuration('9999')).toBe(null)
    expect(parseDuration('16000')).toBe(null) // 1h60min não existe
    expect(parseDuration('1234567')).toBe(null)
    expect(formatDuration(1725)).toBe('28:45')
  })
  it('calcula pace min/km', () => {
    expect(formatPace(paceSeconds(1725, 5))).toBe('5:45 /km')
    expect(formatPace(paceSeconds(7200, 21.0975))).toBe('5:41 /km')
  })
  it('lê km e reais em formato brasileiro', () => {
    expect(parseKm('21,1')).toBe(21.1)
    expect(parseKm('42.195')).toBe(42.195)
    expect(parseKm('0')).toBe(null)
    expect(parseKm('-5')).toBe(null)
    expect(parseMoney('1.234,56')).toBe(1234.56)
    expect(parseMoney('R$ 99,90')).toBe(99.9)
    expect(parseMoney('12,345')).toBe(null)
    expect(formatMoney(120.5).replace(/\s/g, ' ')).toBe('R$ 120,50')
  })
})

describe('validação', () => {
  it('salva só com dados básicos', () => {
    expect(validateRace(race({ name: 'Corrida X' }))).toEqual({})
  })
  it('exige data em prova concluída e rejeita links inválidos', () => {
    expect(validateRace(race({ status: 'concluida' })).date).toBeTruthy()
    expect(validateRace(race({ signupUrl: 'site.com' })).signupUrl).toBeTruthy()
  })
  it('resultado exige distância oficial e tempo líquido', () => {
    const e = validateResult(emptyResult())
    expect(e.officialDistanceKm).toBeTruthy()
    expect(e.netTime).toBeTruthy()
    expect(validateResult({ ...emptyResult(), officialDistanceKm: 5, netTime: 1700, grossTime: 1600 }).grossTime).toBeTruthy()
  })
})

describe('estatísticas', () => {
  const races = [
    race({ name: 'A', date: '2026-03-01', status: 'concluida', fee: 100, extraFees: 10, distanceKm: 5, result: { ...emptyResult(), officialDistanceKm: 5, watchDistanceKm: 5.08, netTime: 1800 } }),
    race({ name: 'B', date: '2026-06-01', status: 'concluida', fee: 150, distanceKm: 5, result: { ...emptyResult(), officialDistanceKm: 5, netTime: 1700 } }),
    race({ name: 'C', date: '2026-08-01', status: 'concluida', distanceKm: 5, result: { ...emptyResult(), officialDistanceKm: 5, netTime: 1650, isOfficial: false } }),
    race({ name: 'D', date: '2026-12-10', status: 'inscrita', fee: 200, city: 'Jundiaí', distanceKm: 10 }),
    race({ name: 'E', date: '2026-12-11', status: 'interesse', fee: 80, city: 'São Paulo', distanceKm: 21.1 }),
    race({ name: 'F', date: null, status: 'interesse' })
  ]
  it('resume o ano sem contar provas de interesse no gasto', () => {
    const s = yearSummary(races, 2026)
    expect(s.doneCount).toBe(3)
    expect(s.km).toBe(15)
    expect(s.spent).toBe(460)
  })
  it('recordes usam distância oficial e tempo líquido; registro pessoal separado', () => {
    const [r5] = recordsByDistance(races)
    expect(r5.bestOfficial.name).toBe('B')
    expect(r5.bestPersonal.name).toBe('C')
    expect(r5.evolution.map((e) => e.name)).toEqual(['A', 'B', 'C'])
  })
  it('filtra por cidade, distância, período e status', () => {
    expect(applyFilters(races, { city: 'jundiaí' }).map((r) => r.name)).toEqual(['D'])
    expect(applyFilters(races, { distance: 21.1 }).map((r) => r.name)).toEqual(['E'])
    expect(applyFilters(races, { from: '2026-12-01' }).map((r) => r.name)).toEqual(['D', 'E'])
    expect(applyFilters(races, { statuses: ['interesse'] }).length).toBe(2)
    expect(applyFilters(races, { query: 'f' }).map((r) => r.name)).toEqual(['F'])
  })
  it('avisa dias consecutivos e mesma data', () => {
    expect(nearbyRaces(races, '2026-12-11', null).adjacent.map((r) => r.name)).toEqual(['D'])
    expect(sameDateGroups([...races, race({ date: '2026-12-10', status: 'interesse' })]).size).toBe(1)
    expect(nextConfirmed(races, '2026-11-02').name).toBe('D')
  })
  it('gera .ics só para provas com data', () => {
    const { text, count } = buildICS(races)
    expect(count).toBe(5)
    expect(text).toContain('DTSTART;VALUE=DATE:20261210')
    expect(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
  it('backup ida e volta (corridas e objetivos)', async () => {
    const goals = [{ ...emptyGoal('quantidade'), id: 'g1', title: 'Oito provas', targetValue: 8 }]
    const back = parseBackup(await buildBackup(races, goals))
    expect(back.races.length).toBe(6)
    expect(back.goals[0].title).toBe('Oito provas')
    expect(back.files).toBe(null)
    expect(() => parseBackup('{"x":1}')).toThrow()
  })
  it('aceita backup da fase 1 (sem objetivos) e cria checklist padrão', () => {
    const v1 = JSON.stringify({ app: 'minhas-corridas', version: 1, races: [{ id: 'a', name: 'Antiga', status: 'inscrita', date: '2026-01-10' }] })
    const back = parseBackup(v1)
    expect(back.goals).toEqual([])
    expect(back.races[0].checklist.length).toBe(7)
    expect(back.races[0].checklist[0]).toMatchObject({ text: 'Inscrição confirmada', done: true })
  })
})

describe('custos', () => {
  it('valor pago substitui a estimativa da inscrição (sem somar duas vezes)', () => {
    const r = race({ status: 'inscrita', date: '2026-05-01', fee: 150, extraFees: 15, feePaid: 160, transportEst: 80, lodgingEst: 300, lodgingPaid: 280 })
    const c = raceCosts(r)
    expect(c.lines[0]).toMatchObject({ estimated: 165, paid: 160, counted: 160, isEstimate: false })
    expect(c.total).toBe(160 + 80 + 280)
    expect(c.paid).toBe(440)
    expect(c.estimatedPart).toBe(80)
  })
  it('interesse é previsão; desistência conta só o pago', () => {
    expect(raceCosts(race({ status: 'interesse', fee: 100 }))).toMatchObject({ total: 0, planned: 100 })
    expect(raceCosts(race({ status: 'desisti', fee: 100 })).total).toBe(0)
    expect(raceCosts(race({ status: 'desisti', fee: 100, feePaid: 100 })).total).toBe(100)
  })
  it('totaliza por período e categoria', () => {
    const list = [
      race({ status: 'concluida', date: '2026-02-01', fee: 100, transportPaid: 50, result: null }),
      race({ status: 'inscrita', date: '2026-09-01', feePaid: 120, otherEst: 30 }),
      race({ status: 'inscrita', date: '2025-12-01', feePaid: 999 }),
      race({ status: 'interesse', date: '2026-10-01', fee: 70 }),
      race({ status: 'inscrita', date: null, feePaid: 90 })
    ]
    const p = periodCosts(list, '2026-01-01', '2026-12-31')
    expect(p.total).toBe(300)
    expect(p.paid).toBe(170)
    expect(p.estimated).toBe(130)
    expect(p.byCat.find((b) => b.id === 'inscricao').total).toBe(220)
    expect(p.planned).toBe(70)
    expect(p.undatedWithCost).toBe(1)
    expect(p.rows.length).toBe(2)
  })
})

describe('objetivos', () => {
  const res = (km, t, isOfficial = true) => ({ ...emptyResult(), officialDistanceKm: km, netTime: t, isOfficial })
  const list = [
    race({ name: 'A', status: 'concluida', date: '2026-03-01', feePaid: 100, result: res(5, 1900) }),
    race({ name: 'B', status: 'concluida', date: '2026-06-01', fee: 150, result: res(5, 1790, false) }),
    race({ name: 'C', status: 'concluida', date: '2026-08-01', feePaid: 200, result: res(21.0975, 7500) }),
    race({ name: 'D', status: 'inscrita', date: '2026-12-01', feePaid: 120 })
  ]
  const goal = (o) => ({ ...emptyGoal(o.type), title: 'x', ...o })
  it('tempo usa só resultado oficial e mostra registro pessoal à parte', () => {
    const p = goalProgress(goal({ type: 'tempo', distanceKm: 5, targetValue: 1800 }), list, '2026-11-02')
    expect(p.achieved).toBe(false)
    expect(p.label).toBe('Melhor: 31:40')
    expect(p.note).toContain('29:50')
    const ok = goalProgress(goal({ type: 'tempo', distanceKm: 5, targetValue: 1920 }), list, '2026-11-02')
    expect(ok.achieved).toBe(true)
  })
  it('primeira prova, quantidade e km no período', () => {
    expect(goalProgress(goal({ type: 'primeira', distanceKm: 21.1 }), list).achieved).toBe(true)
    expect(goalProgress(goal({ type: 'primeira', distanceKm: 42.195 }), list).achieved).toBe(false)
    const q = goalProgress(goal({ type: 'quantidade', targetValue: 4, startDate: '2026-01-01', deadline: '2026-12-31' }), list)
    expect(q.label).toBe('3 de 4')
    expect(q.pct).toBe(0.75)
    const k = goalProgress(goal({ type: 'km', targetValue: 50, startDate: '2026-04-01' }), list)
    expect(k.label).toBe('26,098 km de 50 km')
  })
  it('orçamento soma inscrições e só fica cumprido ao fim do período', () => {
    const g = goal({ type: 'orcamento', targetValue: 600, startDate: '2026-01-01', deadline: '2026-12-31' })
    const p = goalProgress(g, list, '2026-11-02')
    expect(p.label.replace(/\s/g, ' ')).toBe('R$ 570,00 de R$ 600,00')
    expect(p.achieved).toBe(false)
    expect(p.over).toBe(false)
    expect(goalProgress(g, list, '2027-01-05').achieved).toBe(true)
    expect(goalProgress({ ...g, targetValue: 500 }, list).over).toBe(true)
  })
  it('valida campos por tipo', () => {
    expect(validateGoal(goal({ type: 'tempo', targetValue: 1800 })).distanceKm).toBeTruthy()
    expect(validateGoal(goal({ type: 'quantidade', targetValue: 2.5 })).targetValue).toBeTruthy()
    expect(validateGoal(goal({ type: 'manual', targetValue: 3, startDate: '2026-05-01', deadline: '2026-04-01' })).deadline).toBeTruthy()
    expect(validateGoal(goal({ type: 'manual', targetValue: 3 }))).toEqual({})
  })
})

import { upcomingAlerts, repeatRace } from './alerts.js'
describe('rodada 1: avisos, agenda e repetir prova', () => {
  const t = '2026-11-02'
  const list = [
    race({ name: 'Inscrita', status: 'inscrita', date: '2026-11-08', startTime: '07:00', kitPickupDate: '2026-11-06', kitPickupTime: '10:00' }),
    race({ name: 'Kit já retirado', status: 'inscrita', date: '2026-11-20', kitPickupDate: '2026-11-03', checklist: [{ id: 'a', text: 'Kit retirado', done: true }] }),
    race({ name: 'Interesse', status: 'interesse', date: '2026-12-10', signupDeadline: '2026-11-02', lotChangeDate: '2026-11-04' }),
    race({ name: 'Longe', status: 'aberta', date: '2027-01-10', signupDeadline: '2026-11-30' }),
    race({ name: 'Passou', status: 'inscrita', date: '2026-11-01' })
  ]
  it('lista prazos dos próximos 7 dias em ordem, sem o kit já retirado', () => {
    const a = upcomingAlerts(list, t)
    expect(a.map((x) => `${x.race.name}/${x.type}/${x.daysLeft}`)).toEqual(['Interesse/inscricao/0', 'Inscrita/kit/4', 'Inscrita/prova/6'])
  })
  it('lote só aparece se mudar antes do fim da inscrição', () => {
    const a = upcomingAlerts([race({ status: 'aberta', date: '2026-12-01', lotChangeDate: '2026-11-04' })], t)
    expect(a.map((x) => x.type)).toEqual(['lote'])
  })
  it('.ics com lembrete na véspera e eventos de kit e inscrição', () => {
    const { text, count, extra } = buildICS(list)
    expect(count).toBe(5)
    // kit das duas inscritas, inscrição da Interesse e da Longe (o lote da Interesse muda depois do fim da inscrição)
    expect(extra).toBe(4)
    expect(text).toContain('UID:' + list[0].id + '-kit@minhas-corridas')
    expect(text).toContain('DTSTART:20261106T100000')
    expect(text).toContain('TRIGGER:-P1D')
    expect(text).toContain('Último dia de inscrição – Interesse')
    expect(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
  it('repetir prova copia o evento, sem data, valores nem resultado', () => {
    const src = race({ name: 'São Silvestre', city: 'São Paulo', date: '2025-12-31', fee: 200, distanceKm: 15, availableDistances: [15], result: { netTime: 5000 } })
    const c = repeatRace(src)
    expect(c).toMatchObject({ name: 'São Silvestre', city: 'São Paulo', distanceKm: 15 })
    expect(c.date).toBeUndefined()
    expect(c.fee).toBeUndefined()
    expect(c.result).toBeUndefined()
    c.availableDistances.push(5)
    expect(src.availableDistances).toEqual([15])
  })
})
