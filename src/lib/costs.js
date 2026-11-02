// Custos por corrida e por período.
//
// Regras (para não somar a inscrição duas vezes):
// - Inscrição estimada = valor da inscrição + taxas (cadastro da prova).
//   Inscrição paga = feePaid. Quando há valor pago, ele SUBSTITUI a estimativa.
// - Em cada categoria vale: pago, se informado; senão, estimado.
// - Inscrita/Concluída: entra no gasto (pago ou, na falta, estimado — marcado como estimativa).
// - Desisti/Cancelada: entra só o que foi efetivamente pago.
// - Tenho interesse/Inscrição aberta: não é gasto; aparece como previsão.

export const COST_CATS = [
  { id: 'inscricao', label: 'Inscrição', est: null, paid: 'feePaid' },
  { id: 'transporte', label: 'Transporte', est: 'transportEst', paid: 'transportPaid' },
  { id: 'hospedagem', label: 'Hospedagem', est: 'lodgingEst', paid: 'lodgingPaid' },
  { id: 'outros', label: 'Outros', est: 'otherEst', paid: 'otherPaid' }
]

export const COMMITTED_STATUSES = ['inscrita', 'concluida']
export const PAID_ONLY_STATUSES = ['desisti', 'cancelada']

function sum(...vals) {
  const present = vals.filter((v) => typeof v === 'number')
  return present.length ? round2(present.reduce((s, v) => s + v, 0)) : null
}

export function round2(n) {
  return Math.round(n * 100) / 100
}

/** Estimado e pago por categoria, sem aplicar regra de status. */
export function raceCostLines(r) {
  return COST_CATS.map((c) => {
    const estimated = c.id === 'inscricao' ? sum(r.fee, r.extraFees) : r[c.est] ?? null
    const paid = r[c.paid] ?? null
    return { id: c.id, label: c.label, estimated, paid }
  })
}

/**
 * Resumo de custos de uma corrida, aplicando a regra de status.
 * counted = valor que entra no gasto; isEstimate = usou estimativa por falta de valor pago.
 */
export function raceCosts(r) {
  const committed = COMMITTED_STATUSES.includes(r.status)
  const paidOnly = PAID_ONLY_STATUSES.includes(r.status)
  const lines = raceCostLines(r).map((l) => {
    let counted = null
    let isEstimate = false
    if (committed) {
      if (l.paid != null) counted = l.paid
      else if (l.estimated != null) {
        counted = l.estimated
        isEstimate = true
      }
    } else if (paidOnly) {
      counted = l.paid
    }
    const planned = !committed && !paidOnly ? l.paid ?? l.estimated : null
    return { ...l, counted, isEstimate, planned }
  })
  const total = sum(...lines.map((l) => l.counted)) ?? 0
  const paid = sum(...lines.map((l) => (l.isEstimate ? null : l.counted))) ?? 0
  const planned = sum(...lines.map((l) => l.planned))
  const hasAny = lines.some((l) => l.estimated != null || l.paid != null)
  return { lines, total, paid, estimatedPart: round2(total - paid), planned, hasAny, committed, paidOnly }
}

/** Valor da inscrição que entra no gasto (para indicadores e orçamento). */
export function inscriptionSpent(r) {
  return raceCosts(r).lines[0].counted
}

/** Totais de um período (por data da prova). Provas sem data ficam de fora e são contadas à parte. */
export function periodCosts(races, from, to) {
  const inPeriod = (r) => r.date && (!from || r.date >= from) && (!to || r.date <= to)
  const byCat = Object.fromEntries(COST_CATS.map((c) => [c.id, { id: c.id, label: c.label, total: 0, paid: 0, estimated: 0 }]))
  const rows = []
  let planned = 0
  let plannedCount = 0
  let undatedWithCost = 0
  for (const r of races) {
    const c = raceCosts(r)
    if (!r.date) {
      if (c.total > 0) undatedWithCost++
      continue
    }
    if (!inPeriod(r)) continue
    if (c.planned) {
      planned += c.planned
      plannedCount++
    }
    if (c.total <= 0) continue
    for (const l of c.lines) {
      if (l.counted == null) continue
      const b = byCat[l.id]
      b.total += l.counted
      if (l.isEstimate) b.estimated += l.counted
      else b.paid += l.counted
    }
    rows.push({ race: r, ...c })
  }
  for (const b of Object.values(byCat)) {
    b.total = round2(b.total)
    b.paid = round2(b.paid)
    b.estimated = round2(b.estimated)
  }
  const total = round2(Object.values(byCat).reduce((s, b) => s + b.total, 0))
  const paid = round2(Object.values(byCat).reduce((s, b) => s + b.paid, 0))
  rows.sort((a, b) => (a.race.date < b.race.date ? 1 : -1))
  return { byCat: Object.values(byCat), total, paid, estimated: round2(total - paid), rows, planned: round2(planned), plannedCount, undatedWithCost }
}
