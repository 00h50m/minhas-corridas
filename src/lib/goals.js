// Cálculo automático do progresso dos objetivos a partir das provas registradas.
import { GOAL_TYPE_BY_ID, goalUnit } from './model.js'
import { distanceKey, byDateAsc } from './stats.js'
import { round2 } from './costs.js'
import { budgetStatus, scopeOf } from './budget.js'
import { formatDuration, formatKm, formatMoney } from './format.js'
import { daysBetween, formatDateBR, todayISO } from './dates.js'

const round3 = (n) => Math.round(n * 1000) / 1000

function inWindow(g, date) {
  if (!date) return false
  if (g.startDate && date < g.startDate) return false
  if (g.deadline && date > g.deadline) return false
  return true
}

function doneInWindow(g, races) {
  return races.filter((r) => r.status === 'concluida' && r.result && inWindow(g, r.date)).sort(byDateAsc)
}

function sameDistance(a, b) {
  return a != null && b != null && distanceKey(a) === distanceKey(b)
}

/** Texto padrão para o título, a partir do tipo e dos valores. */
export function suggestGoalTitle(g) {
  switch (g.type) {
    case 'primeira':
      return g.distanceKm ? `Completar minha primeira prova de ${formatKm(g.distanceKm)}` : ''
    case 'tempo':
      return g.distanceKm && g.targetValue ? `Correr ${formatKm(g.distanceKm)} abaixo de ${formatDuration(g.targetValue)}` : ''
    case 'quantidade':
      return g.targetValue ? `Completar ${g.targetValue} ${g.targetValue === 1 ? 'prova' : 'provas'}${g.deadline ? ` até ${formatDateBR(g.deadline)}` : ''}` : ''
    case 'km':
      return g.targetValue ? `Somar ${formatKm(g.targetValue)} em provas` : ''
    case 'orcamento':
      return g.targetValue ? `Gastar até ${formatMoney(g.targetValue)} ${scopeOf(g) === 'total' ? 'com provas (inscrição e viagem)' : 'em inscrições'}${g.deadline ? ` em ${g.deadline.slice(0, 4)}` : ''}` : ''
    default:
      return ''
  }
}

export function formatGoalTarget(g) {
  switch (g.type) {
    case 'primeira':
      return formatKm(g.distanceKm)
    case 'tempo':
      return `${formatDuration(g.targetValue)} em ${formatKm(g.distanceKm)}`
    case 'quantidade':
      return `${g.targetValue} ${g.targetValue === 1 ? 'prova' : 'provas'}`
    case 'km':
      return formatKm(g.targetValue)
    case 'orcamento':
      return formatMoney(g.targetValue)
    default:
      return `${(g.targetValue ?? 0).toLocaleString('pt-BR')}${goalUnit(g) ? ' ' + goalUnit(g) : ''}`
  }
}

/**
 * Retorna { auto, pct (0..1), achieved, over, label, detail, races, note, expired }.
 * - achieved: os dados registrados já cumprem o objetivo.
 * - over: orçamento estourado.
 */
export function goalProgress(g, races, today = todayISO()) {
  const type = GOAL_TYPE_BY_ID[g.type]
  const expired = !!(g.deadline && g.deadline < today)
  const daysLeft = g.deadline ? daysBetween(today, g.deadline) : null
  const base = { auto: !!type?.auto, expired, daysLeft, races: [], note: null, over: false }

  if (g.type === 'primeira') {
    const list = doneInWindow(g, races).filter((r) => sameDistance(r.result.officialDistanceKm, g.distanceKm))
    const first = list[0]
    return {
      ...base,
      races: list.slice(0, 1),
      pct: first ? 1 : 0,
      achieved: !!first,
      label: first ? 'Concluído' : 'Ainda não concluído',
      detail: first ? `${first.name} · ${formatDateBR(first.date)} · ${formatDuration(first.result.netTime)}` : `Nenhuma prova concluída de ${formatKm(g.distanceKm)} registrada${g.startDate || g.deadline ? ' no período' : ''}.`
    }
  }

  if (g.type === 'tempo') {
    const list = doneInWindow(g, races).filter((r) => sameDistance(r.result.officialDistanceKm, g.distanceKm) && r.result.netTime)
    const official = list.filter((r) => r.result.isOfficial)
    const personal = list.filter((r) => !r.result.isOfficial)
    const best = (arr) => arr.reduce((b, r) => (!b || r.result.netTime < b.result.netTime ? r : b), null)
    const bo = best(official)
    const bp = best(personal)
    const target = g.targetValue
    const achieved = !!bo && bo.result.netTime < target
    let note = null
    if (bp && (!bo || bp.result.netTime < bo.result.netTime)) {
      note = `Registro pessoal (sem resultado oficial): ${formatDuration(bp.result.netTime)} em ${bp.name}. Não conta para a meta.`
    }
    if (!bo) {
      return { ...base, races: [], pct: 0, achieved: false, note, label: 'Sem resultado oficial', detail: `Nenhum resultado oficial de ${formatKm(g.distanceKm)} registrado${g.startDate || g.deadline ? ' no período' : ''}.` }
    }
    const t = bo.result.netTime
    const gap = t - target
    return {
      ...base,
      races: [bo],
      note,
      // Proximidade da meta: 100% quando o melhor tempo fica abaixo do alvo.
      pct: achieved ? 1 : Math.max(0, Math.min(0.99, target / t)),
      achieved,
      label: `Melhor: ${formatDuration(t)}`,
      detail: achieved ? `Meta batida por ${formatDuration(target - t)} em ${bo.name} (${formatDateBR(bo.date)}).` : gap === 0 ? `Igualou a marca em ${bo.name}; a meta é ficar abaixo.` : `Faltam ${formatDuration(gap)} para ficar abaixo de ${formatDuration(target)}.`
    }
  }

  if (g.type === 'quantidade') {
    const list = doneInWindow(g, races)
    const n = list.length
    return { ...base, races: list, pct: Math.min(1, n / g.targetValue), achieved: n >= g.targetValue, label: `${n} de ${g.targetValue}`, detail: n >= g.targetValue ? 'Quantidade atingida.' : `Faltam ${g.targetValue - n} ${g.targetValue - n === 1 ? 'prova' : 'provas'}.` }
  }

  if (g.type === 'km') {
    const list = doneInWindow(g, races)
    const km = round3(list.reduce((s, r) => s + (r.result.officialDistanceKm ?? 0), 0))
    return {
      ...base,
      races: list,
      pct: Math.min(1, km / g.targetValue),
      achieved: km >= g.targetValue,
      label: `${formatKm(km)} de ${formatKm(g.targetValue)}`,
      detail: km >= g.targetValue ? 'Distância atingida.' : `Faltam ${formatKm(round3(g.targetValue - km))}.`,
      note: 'Soma a distância oficial das provas concluídas registradas no app — não inclui treinos.'
    }
  }

  if (g.type === 'orcamento') {
    const b = budgetStatus(g, races, today)
    const over = b.level === 'estourou'
    const what = b.scope === 'total' ? 'Inscrição, transporte, hospedagem e outros' : 'Inscrições'
    return {
      ...base,
      races: b.races,
      over,
      warn: b.level === 'atencao',
      budget: b,
      pct: Math.min(1, b.pct),
      // Orçamento só é "cumprido" quando o período termina sem estourar.
      achieved: !over && expired,
      label: `${formatMoney(b.spent)} de ${formatMoney(g.targetValue)}`,
      detail: over ? `Passou ${formatMoney(round2(b.spent - g.targetValue))} do orçamento.` : `Restam ${formatMoney(b.remaining)}${expired ? '; período encerrado dentro do orçamento.' : '.'}${!expired && b.planned > 0 ? ` ${b.plannedRaces.length === 1 ? 'Com a prova em avaliação' : `Com as ${b.plannedRaces.length} provas em avaliação`}: ${formatMoney(b.projected)} (${Math.round(b.projectedPct * 100)}%).` : ''}`,
      note: `${what} (pagos ou, na falta, estimados) das provas inscritas e concluídas${b.estimatedPart > 0 ? ' — inclui valores estimados' : ''}. Desistências e cancelamentos entram só com valor pago.${!g.startDate && !g.deadline ? ' Sem período definido: considera todas as provas.' : ''}`
    }
  }

  // Manual
  const cur = g.manualValue ?? 0
  const target = g.targetValue
  return {
    ...base,
    pct: target ? Math.min(1, cur / target) : 0,
    achieved: target ? cur >= target : false,
    label: `${cur.toLocaleString('pt-BR')} de ${formatGoalTarget(g)}`,
    detail: 'Progresso atualizado manualmente.'
  }
}

/** Objetivos ativos, ordenados por prazo. */
export function activeGoals(goals) {
  return goals
    .filter((g) => g.status === 'andamento')
    .sort((a, b) => {
      if (a.deadline === b.deadline) return a.title.localeCompare(b.title, 'pt-BR')
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline < b.deadline ? -1 : 1
    })
}
