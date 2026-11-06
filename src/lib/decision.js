// Ajuda a decidir em quais provas se inscrever: custo, orçamento, prazo, calendário,
// objetivos, edições anteriores e previsão de tempo. Mostra os fatores; quem decide é a pessoa.
import { budgetStatus, CANDIDATE_STATUSES, currentBudget, inBudgetWindow, raceBudgetCost } from './budget.js'
import { goalProgress } from './goals.js'
import { predictTime } from './predict.js'
import { byDateAsc, distanceKey } from './stats.js'
import { daysBetween, todayISO, yearOf } from './dates.js'
import { round2 } from './costs.js'
import { formatDuration, formatKm, formatMoney } from './format.js'

const COMMITTED = ['inscrita', 'concluida']

/** Provas em avaliação: interesse ou inscrição aberta, com data à frente ou sem data. */
export function candidates(races, today = todayISO()) {
  return races.filter((r) => CANDIDATE_STATUSES.includes(r.status) && (!r.date || r.date >= today))
}

/** Nome sem ano, números e palavras genéricas, para achar edições anteriores da mesma prova. */
export function eventKey(name) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'corrida', 'prova', 'edicao', 'km', 'k'])
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ªº]/g, ' ')
    .replace(/\d+/g, ' ')
    .split(/[^a-z]+/)
    .filter((w) => w && !stop.has(w))
    .join(' ')
}

/** Data em que o preço ou a inscrição muda primeiro (o que vier antes). */
export function nextDeadline(r, today = todayISO()) {
  const opts = [
    r.lotChangeDate && r.lotChangeDate >= today && { type: 'lote', date: r.lotChangeDate, label: 'Preço muda de lote' },
    r.signupDeadline && r.signupDeadline >= today && { type: 'inscricao', date: r.signupDeadline, label: 'Inscrição termina' }
  ].filter(Boolean)
  opts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === 'lote' ? -1 : 1))
  const d = opts[0]
  return d ? { ...d, daysLeft: daysBetween(today, d.date) } : null
}

/**
 * Fatores de decisão para uma prova em avaliação.
 * ctx: { races, goals, today, budget? (objetivo de orçamento; se ausente, usa o vigente) }
 */
export function decisionInfo(race, ctx) {
  const { races, goals = [], today = todayISO() } = ctx
  const budgetGoal = ctx.budget === undefined ? currentBudget(goals, today) : ctx.budget
  const out = { race, cost: null, budget: null, deadline: nextDeadline(race, today), sameDay: [], near: [], goals: [], history: [], prediction: null }

  // Custo previsto (o que entraria no gasto se você se inscrever)
  const all = raceBudgetCost(race, 'total').planned
  const insc = raceBudgetCost(race, 'inscricoes').planned
  out.cost = { total: all, inscription: insc, perKm: all != null && race.distanceKm ? round2(all / race.distanceKm) : null }

  // Orçamento: como fica se você se inscrever nesta (sem contar as outras em avaliação)
  if (budgetGoal && inBudgetWindow(budgetGoal, race)) {
    const b = budgetStatus(budgetGoal, races, today)
    const add = raceBudgetCost(race, b.scope).planned
    if (add != null) {
      const after = round2(b.spent + add)
      out.budget = { goal: budgetGoal, before: b.spent, add, after, pct: after / b.target, target: b.target, level: after > b.target ? 'estourou' : after >= (b.target * b.alertPct) / 100 ? 'atencao' : 'ok', remaining: round2(b.target - after) }
    } else out.budget = { goal: budgetGoal, missing: true }
  }

  // Calendário: provas já marcadas no mesmo dia e as mais próximas (até 21 dias)
  if (race.date) {
    const committed = races.filter((r) => r.id !== race.id && r.date && COMMITTED.includes(r.status))
    out.sameDay = committed.filter((r) => r.date === race.date)
    out.near = committed
      .map((r) => ({ race: r, days: daysBetween(r.date, race.date) }))
      .filter((x) => x.days !== 0 && Math.abs(x.days) <= 21)
      .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))
      .slice(0, 2)
  }

  // Objetivos para os quais a prova conta
  for (const g of goals.filter((g) => g.status === 'andamento')) {
    if (race.date && ((g.startDate && race.date < g.startDate) || (g.deadline && race.date > g.deadline))) continue
    const p = goalProgress(g, races, today)
    if (p.achieved) continue
    const same = race.distanceKm && g.distanceKm && distanceKey(race.distanceKm) === distanceKey(g.distanceKm)
    if (g.type === 'quantidade') out.goals.push({ goal: g, text: `Conta para “${g.title}” (${p.label})` })
    else if (g.type === 'km' && race.distanceKm) out.goals.push({ goal: g, text: `+${formatKm(race.distanceKm)} para “${g.title}” (${p.label})` })
    else if (g.type === 'primeira' && same) out.goals.push({ goal: g, text: `Seria sua primeira prova de ${formatKm(g.distanceKm)}` })
    else if (g.type === 'tempo' && same) out.goals.push({ goal: g, text: `Chance para “${g.title}”` })
  }

  // Edições anteriores da mesma prova
  const key = eventKey(race.name)
  if (key) {
    out.history = races
      .filter((r) => r.id !== race.id && r.status === 'concluida' && r.result?.netTime && eventKey(r.name) === key)
      .sort((a, b) => -byDateAsc(a, b))
      .slice(0, 3)
  }

  // Previsão de tempo
  if (race.distanceKm) out.prediction = predictTime(races, race.distanceKm, today, { excludeId: race.id })
  return out
}

/** Pontos a favor e de atenção, em texto curto, para a lista. */
export function decisionFlags(d) {
  const flags = []
  if (d.sameDay.length) flags.push({ tone: 'bad', text: `Mesmo dia de ${d.sameDay.map((r) => r.name).join(', ')}` })
  if (d.budget?.level === 'estourou') flags.push({ tone: 'bad', text: `Estoura o orçamento em ${formatMoney(-d.budget.remaining)}` })
  else if (d.budget?.level === 'atencao') flags.push({ tone: 'warn', text: `Orçamento chega a ${Math.round(d.budget.pct * 100)}%` })
  else if (d.budget && !d.budget.missing) flags.push({ tone: 'good', text: `Cabe no orçamento (sobram ${formatMoney(d.budget.remaining)})` })
  if (d.deadline && d.deadline.daysLeft <= 7) flags.push({ tone: 'warn', text: `${d.deadline.label} ${d.deadline.daysLeft === 0 ? 'hoje' : d.deadline.daysLeft === 1 ? 'amanhã' : `em ${d.deadline.daysLeft} dias`}` })
  const close = d.near.find((x) => Math.abs(x.days) <= 7)
  if (close) flags.push({ tone: 'warn', text: `${Math.abs(close.days)} ${Math.abs(close.days) === 1 ? 'dia' : 'dias'} ${close.days > 0 ? 'depois de' : 'antes de'} ${close.race.name}` })
  for (const g of d.goals.slice(0, 2)) flags.push({ tone: 'good', text: g.text })
  if (d.history.length) flags.push({ tone: 'info', text: `Já correu em ${yearOf(d.history[0].date)}: ${formatDuration(d.history[0].result.netTime)}` })
  return flags
}

/**
 * Simula a inscrição nas provas escolhidas.
 * { count, cost, missingCost, budget: { after, pct, level, target } | null, sameDay: [[a, b]], yearCount }
 */
export function simulate(selected, ctx) {
  const { races, goals = [], today = todayISO() } = ctx
  const budgetGoal = ctx.budget === undefined ? currentBudget(goals, today) : ctx.budget
  let cost = 0
  const missingCost = []
  for (const r of selected) {
    const c = raceBudgetCost(r, 'total').planned
    if (c == null) missingCost.push(r)
    else cost += c
  }
  let budget = null
  if (budgetGoal) {
    const b = budgetStatus(budgetGoal, races, today)
    const add = selected.filter((r) => inBudgetWindow(budgetGoal, r)).reduce((s, r) => s + (raceBudgetCost(r, b.scope).planned ?? 0), 0)
    const after = round2(b.spent + add)
    budget = { target: b.target, before: b.spent, after, pct: after / b.target, level: after > b.target ? 'estourou' : after >= (b.target * b.alertPct) / 100 ? 'atencao' : 'ok' }
  }
  // Conflitos: mesmo dia entre as escolhidas ou com provas já marcadas
  const committed = races.filter((r) => r.date && COMMITTED.includes(r.status))
  const sameDay = []
  selected.forEach((a, i) => {
    if (!a.date) return
    for (const b of [...selected.slice(i + 1), ...committed]) if (b.id !== a.id && b.date === a.date) sameDay.push([a, b])
  })
  const year = Number(today.slice(0, 4))
  const yearCount = races.filter((r) => yearOf(r.date) === year && COMMITTED.includes(r.status)).length + selected.filter((r) => yearOf(r.date) === year).length
  return { count: selected.length, cost: round2(cost), missingCost, budget, sameDay, yearCount, year }
}
