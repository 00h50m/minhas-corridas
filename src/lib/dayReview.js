// Como foi a logística: planejado × marcado no dia (saí, cheguei…), trecho a trecho, e sugestões
// para a próxima prova (margem, acréscimo por trânsito, tempo de parada, preparação).
import { daySteps, returnSteps } from './dayPlan.js'
import { raceSchedule, tripSummary } from './logistics.js'
import { hmToMin, normalizePrep } from './schedule.js'

const roundUp5 = (n) => Math.ceil(n / 5) * 5

/** Marcações do dia em minutos (passos de madrugada planejados "no dia anterior" ficam negativos). */
function actualOf(step, marks) {
  const v = marks[step.key] ? hmToMin(marks[step.key]) : null
  if (v == null) return null
  return step.at < 0 && v > 720 ? v - 1440 : v
}

/** Trechos dirigidos (sair → chegar) e paradas (chegar → sair) de uma lista de passos. */
function compare(steps, marks) {
  const legs = []
  const dwells = []
  steps.forEach((s, i) => {
    const next = steps[i + 1]
    if (!next) return
    const a = actualOf(s, marks)
    const b = actualOf(next, marks)
    const row = { from: s, to: next, planned: next.at - s.at, actual: a != null && b != null ? b - a : null }
    row.diff = row.actual == null ? null : row.actual - row.planned
    if (s.kind === 'leave' && next.kind === 'arrive') legs.push(row)
    else if (s.kind === 'arrive' && next.kind === 'leave') dwells.push({ ...row, point: s.point, label: s.label.replace(/^Chegar: /, '') })
  })
  return { legs, dwells }
}

/**
 * Resumo da logística do dia. null se não houver marcações desta prova.
 * { ida: { departDelay, arrival: { planned, actual, buffer, late }, legs, dwells, driving: { planned, actual } } | null,
 *   volta: { legs, dwells, departDelay, arriveHome } | null, suggestions: [{ id, text, apply }] }
 * apply: { prep: { campo: valor } } ou { dwell: { address, min } } — a tela aplica no perfil.
 */
export function dayReview(race, profilePrep) {
  const marks = race.dayLog?.date === race.date ? race.dayLog.marks : null
  if (!marks || !Object.keys(marks).length || !race.logistics) return null
  const prep = normalizePrep(race.logistics.prep ?? profilePrep)
  const out = { ida: null, volta: null, suggestions: [] }

  const sched = raceSchedule(race, profilePrep)
  const ida = tripSummary(race, race.logistics, 'ida')
  const steps = sched && ida.complete ? daySteps(sched, ida.points) : []
  if (steps.some((s) => marks[s.key])) {
    const { legs, dwells } = compare(steps, marks)
    const sair = actualOf(steps[0], marks)
    const lastStep = steps.find((x) => x.key === 'chegar-destino') ?? steps.at(-1)
    const arr = actualOf(lastStep, marks)
    const measured = legs.filter((l) => l.actual != null)
    out.ida = {
      departDelay: sair == null ? null : sair - steps[0].at,
      arrival: { planned: lastStep.at, actual: arr, buffer: prep.bufferMin, late: arr == null ? null : arr - lastStep.at - prep.bufferMin },
      legs,
      dwells,
      driving: measured.length ? { planned: measured.reduce((a, l) => a + l.planned, 0), actual: measured.reduce((a, l) => a + l.actual, 0) } : null
    }
  }

  const back = returnSteps(race, profilePrep)
  if (back.steps.some((s) => marks[s.key])) {
    const { legs, dwells } = compare(back.steps, marks)
    const s0 = actualOf(back.steps[0], marks)
    const home = actualOf(back.steps.at(-1), marks)
    out.volta = { legs, dwells, departDelay: s0 == null ? null : s0 - back.steps[0].at, arriveHome: home == null ? null : { planned: back.steps.at(-1).at, actual: home } }
  }
  if (!out.ida && !out.volta) return null

  // ---- Sugestões (só com diferenças que valem a pena) ----
  const sug = out.suggestions
  const i = out.ida
  if (i?.departDelay != null && i.departDelay >= 5) {
    const v = Math.min(120, prep.finalPrepMin + roundUp5(i.departDelay))
    sug.push({ id: 'prep', text: `Você saiu de casa ${i.departDelay} min depois do planejado. Aumentar “Preparativos finais” de ${prep.finalPrepMin} para ${v} min (acorda mais cedo nas próximas provas)?`, apply: { prep: { finalPrepMin: v } } })
  }
  const allLegs = [...(i?.legs ?? []), ...(out.volta?.legs ?? [])].filter((l) => l.actual != null)
  const pl = allLegs.reduce((a, l) => a + l.planned, 0)
  const ac = allLegs.reduce((a, l) => a + l.actual, 0)
  if (pl >= 10 && ac - pl >= 3 && (ac - pl) / pl >= 0.1) {
    const pct = Math.min(100, prep.trafficExtraPct + roundUp5(((ac - pl) / pl) * 100))
    sug.push({ id: 'traffic', text: `Dirigindo, os trechos levaram ${ac - pl} min a mais que a rota (${pl} → ${ac} min). Usar ${pct}% de acréscimo por trânsito (hoje: ${prep.trafficExtraPct}%)?`, apply: { prep: { trafficExtraPct: pct } } })
  }
  for (const d of [...(i?.dwells ?? []), ...(out.volta?.dwells ?? [])]) {
    if (d.actual != null && d.diff >= 3 && d.point?.address) {
      sug.push({ id: `dwell-${d.from.key}`, text: `Em ${d.label} a parada levou ${d.actual} min (planejado ${d.planned}). Usar ${d.actual} min nas próximas vezes?`, apply: { dwell: { address: d.point.address, min: d.actual } } })
    }
  }
  if (i?.arrival.late != null && i.arrival.late > 0) {
    const v = Math.min(180, roundUp5(prep.bufferMin + i.arrival.late))
    sug.push({ id: 'buffer', text: `Você chegou ${i.arrival.late} min depois do que a margem cobria. Aumentar a margem para imprevistos de ${prep.bufferMin} para ${v} min?`, apply: { prep: { bufferMin: v } } })
  }
  return out
}

/** "+5 min" / "−3 min" / "no tempo". */
export const diffText = (d) => (d == null ? '—' : Math.abs(d) <= 1 ? 'no tempo' : d > 0 ? `+${d} min` : `−${-d} min`)
