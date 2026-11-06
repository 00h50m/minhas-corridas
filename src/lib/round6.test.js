import { describe, it, expect } from 'vitest'
import { budgetStatus, currentBudget, raceBudgetCost } from './budget.js'
import { candidates, decisionFlags, decisionInfo, eventKey, nextDeadline, simulate } from './decision.js'
import { budgetAlert, pushNotificationsFor } from './alerts.js'
import { goalProgress } from './goals.js'
import { formatMoney } from './format.js'
import { emptyGoal, emptyRace, emptyResult, normalizeGoal, normalizeRace, validateGoal, validateRace } from './model.js'

let n = 0
const race = (o) => normalizeRace({ ...emptyRace(), id: 'r' + ++n, name: 'Prova ' + n, ...o })
const budget = (o) => normalizeGoal({ ...emptyGoal('orcamento'), id: 'b1', title: 'Orçamento 2026', targetValue: 1000, startDate: '2026-01-01', deadline: '2026-12-31', ...o })
const today = '2026-11-06'

const races = [
  race({ id: 'pago', status: 'concluida', date: '2026-03-01', fee: 150, feePaid: 140, transportPaid: 60, result: { ...emptyResult(), officialDistanceKm: 10, netTime: 3000 } }),
  race({ id: 'insc', status: 'inscrita', date: '2026-12-07', name: 'Meia de SP', distanceKm: 21.1, fee: 200, extraFees: 20, lodgingEst: 300 }),
  race({ id: 'desisti', status: 'desisti', date: '2026-05-01', fee: 100 }), // sem valor pago: não conta
  race({ id: 'ano-passado', status: 'concluida', date: '2025-08-01', feePaid: 500 }),
  race({ id: 'cand1', status: 'aberta', date: '2026-12-14', name: '10K de Natal', distanceKm: 10, fee: 120, transportEst: 40, lotChangeDate: '2026-11-09', signupDeadline: '2026-12-01' }),
  race({ id: 'cand2', status: 'interesse', date: '2026-12-07', name: 'Corrida da Ponte', distanceKm: 5 }),
  race({ id: 'cand-velha', status: 'interesse', date: '2026-10-01', fee: 999 })
]

describe('orçamento', () => {
  it('só inscrições: pago substitui estimado; desistência sem pagamento não conta; previsão das em avaliação', () => {
    const b = budgetStatus(budget(), races, today)
    expect(b.spent).toBe(360) // 140 pago + 220 estimado
    expect(b.estimatedPart).toBe(220)
    expect(b.planned).toBe(120) // só a candidata com valor; a do passado não entra
    expect(b.plannedMissing.map((r) => r.id)).toEqual(['cand2'])
    expect(b.projected).toBe(480)
    expect(b.level).toBe('ok')
  })
  it('tudo: soma transporte e hospedagem', () => {
    const b = budgetStatus(budget({ budgetScope: 'total' }), races, today)
    expect(b.spent).toBe(720) // 140+60 + 220+300
    expect(b.planned).toBe(160)
    expect(b.level).toBe('ok')
    expect(budgetStatus(budget({ budgetScope: 'total', alertPct: 70 }), races, today).level).toBe('atencao')
    expect(budgetStatus(budget({ budgetScope: 'total', targetValue: 700 }), races, today).level).toBe('estourou')
  })
  it('progresso do objetivo e aviso uma vez por nível', () => {
    const g = budget({ budgetScope: 'total', alertPct: 70 })
    const p = goalProgress(g, races, today)
    expect(p.warn).toBe(true)
    expect(p.detail).toContain('Com a prova em avaliação: R$')
    const a = budgetAlert([g], races, today)
    expect(a.key).toBe('orcamento:b1:atencao:1000:70')
    expect(a.title).toBe('Orçamento: 72% usado')
    expect(budgetAlert([budget()], races, today)).toBe(null)
    expect(pushNotificationsFor(races, today, { orcamento: false, kit: [], prova: [], inscricao: [], lote: [] }, [g])).toEqual([])
    expect(pushNotificationsFor(races, today, { kit: [], prova: [], inscricao: [], lote: [] }, [g]).map((x) => x.type)).toEqual(['orcamento'])
  })
  it('orçamento vigente e validação', () => {
    expect(currentBudget([budget({ status: 'pausado' })], today)).toBe(null)
    expect(currentBudget([budget({ id: 'x', startDate: null, deadline: null }), budget()], today).id).toBe('b1')
    expect(currentBudget([budget({ deadline: '2026-06-30' })], today)).toBe(null)
    expect(validateGoal({ ...budget(), alertPct: 30 }).alertPct).toBeTruthy()
    expect(validateGoal(budget()).alertPct).toBeUndefined()
    expect(normalizeGoal({ ...emptyGoal('orcamento'), alertPct: 'x', budgetScope: 'y' })).toMatchObject({ alertPct: 80, budgetScope: 'inscricoes' })
    expect(validateRace({ ...race({}), wish: 4 }).wish).toBeTruthy()
    expect(normalizeRace({ ...emptyRace(), wish: 7 }).wish).toBe(null)
    expect(raceBudgetCost(races[0], 'total').counted).toBe(200)
  })
})

describe('tomada de decisão', () => {
  const goals = [
    budget(),
    normalizeGoal({ ...emptyGoal('quantidade'), id: 'q', title: '8 provas em 2026', targetValue: 8, startDate: '2026-01-01', deadline: '2026-12-31' }),
    normalizeGoal({ ...emptyGoal('primeira'), id: 'p', title: 'Primeira de 5 km', distanceKm: 5, targetValue: 5 }),
    normalizeGoal({ ...emptyGoal('tempo'), id: 't', title: '10 km abaixo de 50:00', distanceKm: 10, targetValue: 3000 })
  ]
  const ctx = { races, goals, today }
  it('lista as candidatas à frente', () => {
    expect(candidates(races, today).map((r) => r.id)).toEqual(['cand1', 'cand2'])
  })
  it('fatores de uma candidata', () => {
    const d = decisionInfo(races.find((r) => r.id === 'cand1'), ctx)
    expect(d.cost).toEqual({ total: 160, inscription: 120, perKm: 16 })
    expect(d.budget).toMatchObject({ before: 360, add: 120, after: 480, level: 'ok', remaining: 520 })
    expect(d.deadline).toMatchObject({ type: 'lote', daysLeft: 3 })
    expect(d.near.map((x) => [x.race.id, x.days])).toEqual([['insc', 7]])
    expect(d.goals.map((g) => g.goal.id)).toEqual(['q', 't'])
    expect(d.prediction.estimate).toBe(3000)
    const flags = decisionFlags(d).map((f) => f.text)
    expect(flags).toContain('Cabe no orçamento (sobram R$ 520,00)'.replace(/ /g, ' ').replace('Cabe no orçamento (sobram ', 'Cabe no orçamento (sobram '))
    expect(flags).toContain('Preço muda de lote em 3 dias')
    expect(flags).toContain('7 dias depois de Meia de SP')
  })
  it('mesmo dia, primeira prova na distância e sem custo', () => {
    const d = decisionInfo(races.find((r) => r.id === 'cand2'), ctx)
    expect(d.sameDay.map((r) => r.id)).toEqual(['insc'])
    expect(d.budget).toMatchObject({ missing: true })
    expect(d.goals.map((g) => g.text)).toContain('Seria sua primeira prova de 5 km')
    expect(decisionFlags(d)[0]).toMatchObject({ tone: 'bad', text: 'Mesmo dia de Meia de SP' })
  })
  it('edições anteriores pelo nome sem ano', () => {
    expect(eventKey('10ª Meia Maratona de São Paulo 2026')).toBe(eventKey('Meia Maratona São Paulo 2025'))
    expect(eventKey('Corrida 10 anos do Parque')).toBe('anos parque')
    const old = race({ status: 'concluida', name: 'Meia Maratona de São Paulo 2025', date: '2025-04-10', result: { ...emptyResult(), officialDistanceKm: 21.1, netTime: 7000 } })
    const cand = race({ status: 'aberta', name: '10ª Meia Maratona de São Paulo', date: '2027-04-10', distanceKm: 21.1 })
    const d = decisionInfo(cand, { races: [old, cand], goals: [], today })
    expect(d.history.map((r) => r.id)).toEqual([old.id])
    expect(decisionFlags(d).at(-1).text).toBe('Já correu em 2025: 1:56:40')
  })
  it('prazo: o que vier primeiro', () => {
    expect(nextDeadline(race({ signupDeadline: '2026-11-08', lotChangeDate: '2026-11-08' }), today)).toMatchObject({ type: 'lote' })
    expect(nextDeadline(race({ signupDeadline: '2026-11-01' }), today)).toBe(null)
  })
  it('simulação: custo, orçamento e choques de data', () => {
    const sel = races.filter((r) => r.id === 'cand1' || r.id === 'cand2')
    const s = simulate(sel, ctx)
    expect(s.cost).toBe(160)
    expect(s.missingCost.map((r) => r.id)).toEqual(['cand2'])
    expect(s.budget).toMatchObject({ before: 360, after: 480, level: 'ok' })
    expect(s.sameDay.map(([a, b]) => [a.id, b.id])).toEqual([['cand2', 'insc']])
    expect(s.yearCount).toBe(4) // pago + insc + 2 escolhidas
  })
})
