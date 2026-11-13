// Dia da prova, passo a passo: sair de casa → chegar e sair de cada parada → chegar ao local.
// Com as marcações reais ("saí de casa", "cheguei na Dani"…), calcula o atraso e projeta os próximos horários.
// Tudo em minutos desde a meia-noite do dia da prova (como a agenda).
import { hmToMin, minToHm } from './schedule.js'
import { firstName } from './people.js'

/**
 * Passos do trajeto da ida a partir da agenda (buildSchedule) e dos pontos da ida.
 * [{ key, kind: 'leave'|'arrive', label, action, at, point, to, personId }]
 */
export function daySteps(schedule, points) {
  if (!schedule || !points?.length) return []
  const stops = points.filter((p) => p.role === 'stop')
  const dest = points.at(-1)
  const nameOf = (p, i) => p.label || `Parada ${i + 1}`
  const steps = [{ key: 'sair', kind: 'leave', label: `Sair de ${points[0].label || 'casa'}`, action: 'Saí de casa', at: schedule.depart, to: stops[0] ?? dest }]
  stops.forEach((p, i) => {
    const it = schedule.items.find((x) => x.key === `parada-${i}`)
    if (!it) return
    const name = nameOf(p, i)
    steps.push({ key: `chegar-${i}`, kind: 'arrive', label: `Chegar: ${name}`, action: `Cheguei: ${name}`, at: it.at, point: p, personId: p.personId ?? null })
    steps.push({ key: `sair-${i}`, kind: 'leave', label: `Sair: ${name}`, action: `Saí: ${name}`, at: it.leaveAt, to: stops[i + 1] ?? dest })
  })
  const park = schedule.items.find((x) => x.key === 'estacionar')
  if (park) steps.push({ key: 'chegar-destino', kind: 'arrive', label: `Chegar a ${dest.label || 'local da prova'}`, action: 'Cheguei ao local', at: park.at, point: dest })
  return steps
}

/**
 * Situação agora. marks: { key: 'HH:MM' } (horário real de cada passo feito); nowMin: minutos do dia.
 * { steps: [{ ...step, done, actual, projected }], current, delayMin, late (ainda não saiu e já passou da hora), finished }
 * O atraso é o do último passo marcado (positivo = atrasada); os próximos passos andam junto.
 * Antes de marcar o primeiro passo, se a hora já passou, o atraso é "agora − planejado".
 */
export function dayStatus(steps, marks = {}, nowMin) {
  let delay = 0
  let lastDone = -1
  const out = steps.map((s, i) => {
    const actual = marks[s.key] ? hmToMin(marks[s.key]) : null
    if (actual != null) {
      // Marcação de madrugada para um passo planejado "no dia anterior" (minutos negativos): mesmo dia da agenda.
      const fixed = s.at < 0 && actual > 720 ? actual - 1440 : actual
      delay = fixed - s.at
      lastDone = i
      return { ...s, done: true, actual: fixed }
    }
    return { ...s, done: false, actual: null }
  })
  const currentIdx = out.findIndex((s) => !s.done)
  const current = currentIdx >= 0 ? out[currentIdx] : null
  // Nenhuma marcação depois do último feito: se o próximo passo já passou da hora, o atraso cresce com o relógio.
  let late = false
  if (current && nowMin != null) {
    const projectedNow = current.at + (lastDone >= 0 ? delay : 0)
    if (nowMin > projectedNow) {
      delay = nowMin - current.at
      late = true
    }
  }
  const withProj = out.map((s, i) => ({ ...s, projected: s.done ? s.actual : s.at + (i >= currentIdx ? delay : 0) }))
  return { steps: withProj, current: current ? withProj[currentIdx] : null, currentIdx, delayMin: delay, late, finished: !current }
}

export function delayLabel(min) {
  if (Math.abs(min) <= 2) return 'No horário'
  return min > 0 ? `Atrasada ${min} min` : `Adiantada ${-min} min`
}

/** Mensagem para quem você vai buscar, com o horário projetado. */
export function onTheWayMessage({ person, at, leftNow = false }) {
  return `Oi, ${firstName(person.name)}! ${leftNow ? 'Saí agora e chego' : 'Chego'} aí por volta de ${minToHm(at, { withDay: false })}. 🏃`
}

/** Links de navegação só até o próximo ponto (a partir de onde você está). */
export function legNavLinks(point) {
  if (!point) return null
  const t = point.lat != null ? `${point.lat},${point.lon}` : point.formatted || point.address
  const enc = encodeURIComponent
  return {
    google: `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${enc(t)}`,
    waze: point.lat != null ? `https://waze.com/ul?ll=${point.lat},${point.lon}&navigate=yes` : `https://waze.com/ul?q=${enc(t)}&navigate=yes`
  }
}
