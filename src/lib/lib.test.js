import { describe, it, expect } from 'vitest'
import { formatDateBR, isValidISODate, daysBetween, addDaysISO, countdownLabel } from './dates.js'
import { parseDuration, formatDuration, formatPace, paceSeconds, parseKm, parseMoney, formatMoney } from './format.js'
import { validateRace, validateResult, emptyRace, emptyResult } from './model.js'
import { yearSummary, recordsByDistance, applyFilters, nearbyRaces, nextConfirmed, sameDateGroups } from './stats.js'
import { buildICS } from './ics.js'
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
  it('backup ida e volta', () => {
    const back = parseBackup(buildBackup(races))
    expect(back.races.length).toBe(6)
    expect(() => parseBackup('{"x":1}')).toThrow()
  })
})
