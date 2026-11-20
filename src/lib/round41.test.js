// Rodada 41: relatório para o treinador e o painel “Está tudo ligado?”.
import { describe, expect, it } from 'vitest'
import { buildReport, defaultPeriod, reportText } from './coachReport.js'
import { normalizeProgram, parseFichaText, workoutFromSheet } from './ficha.js'
import { normalizeWorkout } from './workout.js'
import { attention, setupChecks } from './setupStatus.js'

const program = normalizeProgram({ id: 'f1', title: 'Treino em academia', goal: 'Definição', coach: 'Treinador', from: '2026-11-02', to: '2026-12-04', sheets: parseFichaText('TREINO A\nAgachamento | 3 | 12 | 1 minuto\nCadeira extensora | 2 | 12 | 1 minuto\nTREINO B\nRemada | 3 | 12 | 1 minuto').sheets })
const [A, B] = program.sheets
const gym = (id, sheet, date, entries) => normalizeWorkout({ ...workoutFromSheet(program, sheet, date), id, gymLog: entries ? { startedAt: `${date}T20:00:00Z`, endedAt: `${date}T20:50:00Z`, entries } : null })
const run = (id, date, km, sec) => ({ id, name: id, date, status: 'feito', sport: 'corrida', items: [], result: { distanceKm: km, elapsedSec: sec } })

const workouts = [
  gym('a1', A, '2026-11-04', [{ i: 0, n: 1, kg: 40, reps: 12 }, { i: 0, n: 2, kg: 40, reps: 12 }, { i: 0, n: 3, kg: 45, reps: 10 }, { i: 1, n: 1, kg: 30, reps: 12 }]),
  gym('b1', B, '2026-11-06', null),
  gym('a2', A, '2026-11-11', [{ i: 0, n: 1, kg: 45, reps: 12 }, { i: 0, n: 2, kg: 50, reps: 10 }, { i: 0, n: 3, kg: 50, reps: 8 }, { i: 1, n: 1, kg: 30, reps: 12 }, { i: 1, n: 2, kg: 35, reps: 12 }]),
  run('r1', '2026-11-05', 5, 1800), run('r2', '2026-11-09', 10, 3900), run('fora', '2026-10-20', 8, 2900),
  { id: 's', name: 'Tiros', date: '2026-11-07', status: 'pulado', sport: 'corrida', items: [] },
  { id: 'bk', name: 'Bike', date: '2026-11-08', status: 'feito', sport: 'bike', plannedMin: 60, items: [] }
]

describe('relatório para o treinador', () => {
  it('período padrão: o da ficha até hoje; sem ficha, 30 dias', () => {
    expect(defaultPeriod(program, '2026-11-20')).toEqual({ from: '2026-11-02', to: '2026-11-20' })
    expect(defaultPeriod(program, '2026-12-10')).toEqual({ from: '2026-11-02', to: '2026-12-04' })
    expect(defaultPeriod(null, '2026-11-20')).toEqual({ from: '2026-10-22', to: '2026-11-20' })
  })
  const r = buildReport({ program, workouts, races: [{ id: 'p', name: 'Prova', status: 'concluida', date: '2026-11-15', distanceKm: 5, result: { netTime: 2370, officialDistanceKm: 5 } }], from: '2026-11-02', to: '2026-11-20' })
  it('ficha: vezes por treino, séries feitas de planejadas, duração média', () => {
    expect(r.gym.sessions).toBe(3)
    expect(r.gym.bySheet).toEqual([{ label: 'A', count: 2, dates: ['2026-11-04', '2026-11-11'] }, { label: 'B', count: 1, dates: ['2026-11-06'] }])
    expect([r.gym.plannedSets, r.gym.missedSets]).toEqual([10, 1]) // 2× (3 + 2); sem anotação no B não conta
    expect(r.gym.avgMin).toBe(50)
    expect(r.gym.perWeek).toBe(1.1)
  })
  it('cargas por exercício ao longo das sessões', () => {
    const ag = r.gym.exercises.find((e) => e.name === 'Agachamento')
    expect(ag).toMatchObject({ firstKg: 45, lastKg: 50, bestKg: 50 })
    expect(ag.sessions.map((s) => [s.date, s.kgs.join('/'), s.reps.join('/')])).toEqual([['2026-11-04', '40/40/45', '12/12/10'], ['2026-11-11', '45/50/50', '12/10/8']])
    const cx = r.gym.exercises.find((e) => e.name === 'Cadeira extensora')
    expect(cx.sessions.map((s) => [s.done, s.planned])).toEqual([[1, 2], [2, 2]])
  })
  it('corridas, outras, provas, “não fiz” e semanas', () => {
    expect(r.runs).toMatchObject({ count: 2, km: 15, longestKm: 10, paceSec: 380 })
    expect(r.other).toEqual({ Bike: 1 })
    expect(r.races).toEqual([{ name: 'Prova', date: '2026-11-15', km: 5, netTime: 2370 }])
    expect(r.skipped).toBe(1)
    expect(r.weeks.map((w) => [w.start, w.gym, w.runs, w.km])).toEqual([['2026-11-02', 2, 1, 5], ['2026-11-09', 1, 1, 10], ['2026-11-16', 0, 0, 0]])
  })
  it('texto para mandar por mensagem', () => {
    const t = reportText(r)
    for (const x of ['Relatório de treinos · 02/11/2026 a 20/11/2026', 'Treino em academia · Definição', 'Academia: 3 treinos (1,1 por semana) · média de 50 min', 'Treino A: 2× · Treino B: 1×', 'Séries feitas: 9 de 10 (faltaram 1)', '- Agachamento: 45 kg → 50 kg (2×)', 'Corrida: 2 treinos · 15 km · pace médio 6:20/km · mais longo 10 km', 'Outras: Bike 1×', 'Provas: Prova (15/11/2026)', 'Treinos marcados como “não fiz”: 1']) expect(t).toContain(x)
  })
})

describe('está tudo ligado?', () => {
  const base = { push: { support: 'ok', permission: 'granted', subscribed: true, server: true }, garmin: { key: 'k', lastSync: '2026-11-20T10:00:00Z' }, program, cycle: { enabled: true, periods: [{}] }, today: '2026-11-20', now: Date.parse('2026-11-20T12:00:00Z') }
  it('sem conta: avisa e não mostra o banco', () => {
    const rows = setupChecks({ ...base, sync: { configured: true, user: null } })
    expect(rows.find((x) => x.id === 'conta').status).toBe('warn')
    expect(rows.some((x) => x.id.startsWith('sql'))).toBe(false)
  })
  it('com conta: trechos que faltam, desafios/relatório pelo teste das funções, Garmin, ficha, cron para conferir', () => {
    const rows = setupChecks({ ...base, sync: { configured: true, user: { email: 'x@y' }, phase: 'idle', lastSyncAt: '2026-11-20T11:58:00Z', pending: 0, deferredKinds: ['ficha'] }, rpc: { challenges: 'ok', reports: 'missing' } })
    const st = Object.fromEntries(rows.map((x) => [x.id, x.status]))
    expect(st).toMatchObject({ conta: 'ok', sync: 'ok', sql11: 'ok', sql12: 'ok', sql13: 'warn', sql14: 'ok', sql15: 'warn', push: 'ok', cron: 'check', garmin: 'ok', ficha: 'ok', ciclo: 'ok' })
    expect(rows.find((x) => x.id === 'sql13').text).toContain('rode o trecho 13')
    expect(rows.find((x) => x.id === 'sync').text).toContain('há 2 min')
    expect(attention(rows)).toBe(2)
  })
  it('ficha vencida, Garmin parado, notificações bloqueadas ou sem chaves no servidor', () => {
    const rows = setupChecks({ ...base, sync: { configured: true, user: {}, lastSyncAt: null }, push: { support: 'ok', server: true, permission: 'denied' }, garmin: { key: 'k', lastSync: '2026-11-10T10:00:00Z' }, today: '2026-12-10', now: Date.parse('2026-12-10T12:00:00Z') })
    const st = Object.fromEntries(rows.map((x) => [x.id, x.status]))
    expect(st).toMatchObject({ push: 'warn', garmin: 'warn', ficha: 'warn', sql11: 'unknown', sql14: 'unknown' })
    expect(setupChecks({ ...base, sync: { configured: true, user: {} }, push: { support: 'ok', server: false } }).find((x) => x.id === 'push').text).toContain('VAPID')
    expect(setupChecks({ ...base, sync: {}, push: { support: 'ios-install' } }).find((x) => x.id === 'push').status).toBe('warn')
  })
})
