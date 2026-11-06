// Orçamento do ano: quanto já está comprometido, quanto viria das provas em avaliação e quando avisar.
// O orçamento é um objetivo do tipo "orcamento" (sincroniza e entra no backup como os demais).
import { raceCosts, round2 } from './costs.js'
import { byDateAsc } from './stats.js'
import { todayISO } from './dates.js'

export const BUDGET_SCOPES = [
  { id: 'inscricoes', label: 'Só inscrições' },
  { id: 'total', label: 'Tudo: inscrição, transporte, hospedagem e outros' }
]
export const CANDIDATE_STATUSES = ['interesse', 'aberta']

export const scopeOf = (g) => (g?.budgetScope === 'total' ? 'total' : 'inscricoes')
export const alertPctOf = (g) => (Number.isInteger(g?.alertPct) && g.alertPct >= 50 && g.alertPct <= 100 ? g.alertPct : 80)

function inWindow(g, date) {
  if (!date) return false
  if (g.startDate && date < g.startDate) return false
  if (g.deadline && date > g.deadline) return false
  return true
}

/** Quanto uma prova pesa no orçamento: { counted, planned, isEstimate } conforme o escopo. */
export function raceBudgetCost(r, scope) {
  const c = raceCosts(r)
  if (scope === 'total') {
    return { counted: c.total > 0 ? c.total : c.committed || c.paidOnly ? 0 : null, planned: c.planned, isEstimate: c.lines.some((l) => l.isEstimate) }
  }
  const l = c.lines[0]
  return { counted: l.counted, planned: l.planned, isEstimate: l.isEstimate }
}

function level(value, target, alertPct) {
  if (value > target) return 'estourou'
  if (value >= (target * alertPct) / 100) return 'atencao'
  return 'ok'
}

/**
 * Situação do orçamento.
 * { scope, target, alertPct, spent, estimatedPart, remaining, pct, level, races,
 *   planned, plannedRaces, plannedMissing, projected, projectedPct, projectedLevel }
 */
export function budgetStatus(g, races, today = todayISO()) {
  const scope = scopeOf(g)
  const target = g.targetValue
  const alertPct = alertPctOf(g)
  let spent = 0
  let estimatedPart = 0
  const counted = []
  let planned = 0
  const plannedRaces = []
  const plannedMissing = []
  for (const r of races) {
    if (!inWindow(g, r.date)) continue
    const c = raceBudgetCost(r, scope)
    if (CANDIDATE_STATUSES.includes(r.status)) {
      if (r.date < today) continue
      if (c.planned != null) {
        planned += c.planned
        plannedRaces.push(r)
      } else plannedMissing.push(r)
      continue
    }
    if (c.counted == null || c.counted <= 0) continue
    spent += c.counted
    if (c.isEstimate) estimatedPart += c.counted - (scope === 'total' ? raceCosts(r).paid : 0)
    counted.push(r)
  }
  spent = round2(spent)
  planned = round2(planned)
  const projected = round2(spent + planned)
  return {
    scope,
    target,
    alertPct,
    spent,
    estimatedPart: round2(estimatedPart),
    remaining: round2(target - spent),
    pct: target ? spent / target : 0,
    level: level(spent, target, alertPct),
    races: counted.sort(byDateAsc),
    planned,
    plannedRaces: plannedRaces.sort(byDateAsc),
    plannedMissing: plannedMissing.sort(byDateAsc),
    projected,
    projectedPct: target ? projected / target : 0,
    projectedLevel: level(projected, target, alertPct)
  }
}

/** Orçamento que vale hoje: objetivo de orçamento em andamento cujo período inclui hoje (ou sem período). */
export function currentBudget(goals, today = todayISO()) {
  const list = goals.filter((g) => g.type === 'orcamento' && g.status === 'andamento' && g.targetValue > 0 && (!g.startDate || g.startDate <= today) && (!g.deadline || g.deadline >= today))
  // Com período definido tem preferência; entre eles, o que termina primeiro.
  return list.sort((a, b) => (!!b.deadline - !!a.deadline) || String(a.deadline).localeCompare(String(b.deadline)))[0] ?? null
}

/** Se a prova entra no período do orçamento. */
export function inBudgetWindow(g, r) {
  return !!g && inWindow(g, r.date)
}
