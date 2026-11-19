// Desafio com amigas: o total de cada pessoa no período (km correndo, treinos feitos ou horas de
// treino), calculado no aparelho a partir dos treinos e provas. Só esse número vai para o ranking.
import { addDaysISO } from './dates.js'
import { doneSec, isRun } from './workout.js'

export const METRICS = [
  { id: 'km', label: 'km correndo', short: 'km', unit: 'km' },
  { id: 'treinos', label: 'treinos feitos', short: 'treinos', unit: '' },
  { id: 'horas', label: 'horas de treino', short: 'horas', unit: 'h' }
]
export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]))

/** Período: este mês ou o próximo (do 1º ao último dia). */
export function periodFor(which, today) {
  const [y, m] = today.split('-').map(Number)
  const t = y * 12 + (m - 1) + (which === 'proximo' ? 1 : 0)
  const yy = Math.floor(t / 12)
  const mm = (t % 12) + 1
  const start = `${yy}-${String(mm).padStart(2, '0')}-01`
  const end = addDaysISO(`${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1)
  return { start, end }
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthTitle = (metric, start) => `${METRIC_BY_ID[metric]?.label ? `Desafio de ${METRIC_BY_ID[metric].short}` : 'Desafio'} de ${MONTHS[Number(start.slice(5, 7)) - 1]}`

/**
 * Total da pessoa no período (até hoje): treinos feitos e provas concluídas.
 * km: corridas (treino com distância do relógio) + provas (distância oficial).
 * treinos: atividades feitas (qualquer esporte) + provas. horas: tempo feito + tempo de prova.
 */
export function challengeValue(metric, start, end, { workouts = [], races = [] }, today) {
  const last = end < today ? end : today
  const inP = (d) => d && d >= start && d <= last
  const ws = workouts.filter((w) => w.status === 'feito' && inP(w.date))
  const rs = races.filter((r) => r.status === 'concluida' && inP(r.date) && r.result)
  if (metric === 'km') return round1(ws.filter(isRun).reduce((a, w) => a + (w.result?.distanceKm ?? 0), 0) + rs.reduce((a, r) => a + (r.result.officialDistanceKm ?? r.distanceKm ?? 0), 0))
  if (metric === 'treinos') return ws.length + rs.length
  return round1((ws.reduce((a, w) => a + doneSec(w), 0) + rs.reduce((a, r) => a + (r.result.netTime ?? 0), 0)) / 3600)
}
const round1 = (n) => Math.round(n * 10) / 10

export function formatValue(metric, v) {
  const n = String(v ?? 0).replace('.', ',')
  return metric === 'km' ? `${n} km` : metric === 'horas' ? `${n} h` : `${v ?? 0} ${v === 1 ? 'treino' : 'treinos'}`
}

/** Ranking com posições (empates dividem a posição) e a barra relativa ao 1º lugar. */
export function ranking(board = []) {
  const sorted = [...board].sort((a, b) => Number(b.value) - Number(a.value))
  const top = Math.max(Number(sorted[0]?.value ?? 0), 0.0001)
  let pos = 0
  let lastV = null
  return sorted.map((m, i) => {
    if (Number(m.value) !== lastV) { pos = i + 1; lastV = Number(m.value) }
    return { ...m, value: Number(m.value), pos, pct: Number(m.value) / top }
  })
}

/** Status do período: 'antes' | 'andamento' | 'encerrado', e dias que faltam. */
export function phase(c, today) {
  if (today < c.start_date) return { state: 'antes', days: Math.round((Date.parse(c.start_date) - Date.parse(today)) / 86400000) }
  if (today > c.end_date) return { state: 'encerrado', days: 0 }
  return { state: 'andamento', days: Math.round((Date.parse(c.end_date) - Date.parse(today)) / 86400000) }
}

export const inviteUrl = (origin, code) => `${origin}/desafios/entrar/${code}`
