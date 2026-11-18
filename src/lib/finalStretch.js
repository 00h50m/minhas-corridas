// Reta final de uma prova inscrita (até 4 semanas antes): linha do tempo com o que costuma ajudar
// em cada momento. É um roteiro de partida, editável e sem prescrição: o app não muda seus treinos.
import { addDaysISO, daysBetween } from './dates.js'
import { formatPace } from './format.js'
import { flatten, isRun, newStep, normalizeWorkout, plannedSec } from './workout.js'
import { dayLabel } from './reschedule.js'
import { cycleStretchItems, raceCycleNote } from './cycle.js'

const KIT_RE = /kit retirado/i

/** Treino "forte": tem tiro ou alvo de pace mais rápido que o pace da prova. */
export function isHard(w, racePace = null) {
  if (!isRun(w)) return false
  return flatten(w.items).some((s) => s.type === 'tiro' || (racePace && s.target.kind === 'pace' && s.target.max < racePace - 5))
}

const minLabel = (sec) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** Treino “ritmo de prova” sugerido: aquecimento, ~40% da distância no pace da meta e desaquecimento. */
export function paceWorkout(race, date) {
  const km = race.distanceKm ?? 5
  const pace = race.targetTime && km ? Math.round(race.targetTime / km) : null
  const meters = Math.max(1000, Math.round((km * 0.4) * 2) * 500)
  return normalizeWorkout({
    name: `Ritmo de prova ${String(meters / 1000).replace('.', ',')} km`.slice(0, 60),
    date,
    raceId: race.id,
    notes: `Reta final de “${race.name}”: sentir o pace da prova${pace ? ` (${formatPace(pace)})` : ''}.`,
    items: [
      newStep('aquecimento', { duration: { kind: 'time', value: 600 } }),
      newStep('corrida', { duration: { kind: 'distance', value: meters }, target: pace ? { kind: 'pace', min: pace - 5, max: pace + 5 } : { kind: 'none', min: null, max: null } }),
      newStep('desaquecimento', { duration: { kind: 'time', value: 300 } })
    ]
  })
}

/** Mostrar a reta final? Prova inscrita, de hoje até 28 dias (e no dia seguinte, para o resultado). */
export function showStretch(race, today) {
  if (!race?.date || race.status !== 'inscrita' && race.status !== 'concluida') return false
  const d = daysBetween(today, race.date)
  return d != null && d >= -1 && d <= 28 && !(race.status === 'concluida' && race.result && d < 0 && race.result.watch)
}

/**
 * Itens da reta final: [{ id, date, title, desc, link?, linkLabel?, action?, done, auto, warn?, state }].
 * state: feito | hoje | passou | futuro. done = automático (o app sabe) ou marcado à mão (race.stretchDone).
 */
export function finalStretch(race, { workouts = [], today, cycle = null } = {}) {
  const D = race.date
  const km = race.distanceKm ?? null
  const pace = race.targetTime && km ? Math.round(race.targetTime / km) : null
  const marked = new Set(Array.isArray(race.stretchDone) ? race.stretchDone : [])
  const runs = workouts.filter((w) => isRun(w) && w.date)
  const check = (re) => (race.checklist ?? []).some((c) => c.done && re.test(c.text))
  const items = []
  const add = (it) => items.push(it)

  // 1. Ritmo da prova (3 semanas antes)
  const paceDone = runs.find((w) => w.status === 'feito' && w.date >= addDaysISO(D, -24) && w.date <= addDaysISO(D, -8) && w.result?.distanceKm >= (km ?? 5) * 0.3 && w.result?.elapsedSec > 0 && (!pace || Math.abs(w.result.elapsedSec / w.result.distanceKm - pace) <= 15))
  const pacePlanned = runs.find((w) => w.status === 'planejado' && w.raceId === race.id && /ritmo de prova/i.test(w.name))
  add({
    id: 'ritmo', date: addDaysISO(D, -18), title: 'Treino no ritmo da prova',
    desc: pace ? `Uns ${String(Math.max(1, Math.round(km * 0.4 * 2) / 2)).replace('.', ',')} km a ${formatPace(pace)} (o pace da meta), para o corpo conhecer o ritmo.` : 'Um treino no ritmo que você pretende correr, para conhecer o pace.',
    auto: !!paceDone,
    ...(paceDone ? { note: `feito em “${paceDone.name}” (${dayLabel(paceDone.date)})` } : pacePlanned ? { note: `planejado: “${pacePlanned.name}” (${dayLabel(pacePlanned.date)})`, link: `/treinos/${pacePlanned.id}`, linkLabel: 'Ver treino' } : { action: 'criar-ritmo' })
  })
  // 2. Roupa e tênis
  add({ id: 'roupa', date: addDaysISO(D, -14), title: 'Testar a roupa e o tênis da prova num treino', desc: 'Nada de novo no dia: meia, top, short, tênis e o que vai levar (gel, garrafinha).' })
  // 3. Último treino forte (e aviso de treino forte perto da prova)
  const late = runs.filter((w) => w.status === 'planejado' && w.date > addDaysISO(D, -9) && w.date < D && isHard(w, pace))
  add({
    id: 'forte', date: addDaysISO(D, -10), title: 'Último treino forte',
    desc: 'Daqui até a prova, o costume é manter treinos curtos e leves (alguns educativos ou acelerações são comuns).',
    ...(late.length ? { warn: late.map((w) => `“${w.name}” (${dayLabel(w.date)}) é forte e está a ${daysBetween(w.date, D)} dias da prova: considere trocar por uma rodagem leve ou remanejar.`).join(' '), link: `/treinos/${late[0].id}`, linkLabel: 'Abrir treino' } : {})
  })
  // 4. Semana mais leve: tempo planejado nos 7 dias antes × média das 3 semanas anteriores
  const secIn = (a, b) => runs.concat(workouts.filter((w) => !isRun(w) && w.date)).filter((w) => w.date >= a && w.date <= b && w.status !== 'pulado').reduce((s, w) => s + (w.result?.elapsedSec ?? plannedSec(w)), 0)
  const weekSec = secIn(addDaysISO(D, -7), addDaysISO(D, -1))
  const prev = [1, 2, 3].map((k) => secIn(addDaysISO(D, -7 - 7 * k), addDaysISO(D, -1 - 7 * k))).filter((x) => x > 0)
  const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0
  const pct = avg ? Math.round((weekSec / avg) * 100) : null
  add({
    id: 'leve', date: addDaysISO(D, -7), title: 'Semana da prova mais leve',
    desc: pct != null ? `Planejado nos 7 dias antes: ${minLabel(weekSec)} (${pct}% das semanas anteriores, ${minLabel(avg)}). O costume é ficar bem abaixo do normal.` : 'O costume é treinar menos na semana da prova e chegar descansada.',
    ...(pct != null && pct > 85 ? { warn: `A semana da prova está com ${pct}% do volume normal.` } : {}),
    auto: pct != null && pct <= 85 && D <= addDaysISO(today, 7)
  })
  add({ id: 'contagem7', date: addDaysISO(D, -7), title: 'Story: faltam 7 dias', desc: 'A contagem para a prova no Instagram.', link: `/stories?modelo=contagem&prova=${race.id}`, linkLabel: 'Abrir story' })
  // 5. Logística
  const logOk = !!(race.logistics?.origin && (race.logistics?.destination || race.venueAddress))
  add({ id: 'logistica', date: addDaysISO(D, -5), title: 'Logística: trajeto e horário de saída', desc: 'Como chegar, onde parar e a que horas sair de casa.', link: `/corridas/${race.id}/logistica`, linkLabel: 'Abrir logística', auto: logOk })
  // 6. Kit
  if (race.kitPickupDate || !race.kitOnRaceDay) {
    add({ id: 'kit', date: race.kitPickupDate ?? addDaysISO(D, -2), title: race.kitOnRaceDay ? 'Retirar o kit (no dia)' : 'Retirar o kit', desc: race.kitPickupTime ? `Às ${race.kitPickupTime}${race.kitPickupAddress ? ` · ${race.kitPickupAddress}` : ''}.` : race.kitPickupDate ? 'Confira o horário e o local no regulamento.' : 'A data da retirada não está cadastrada: confira no regulamento.', link: `/corridas/${race.id}`, linkLabel: 'Marcar no checklist', auto: check(KIT_RE) })
  }
  // 7. Sono
  add({ id: 'sono', date: addDaysISO(D, -2), title: 'A noite que mais importa', desc: 'Dormir bem duas noites antes conta mais do que a véspera, que costuma ser agitada.' })
  // 8. Separar tudo
  const sepOk = check(/documento/i) && check(/roupa|t[eê]nis/i) && check(/rel[oó]gio/i)
  add({ id: 'separar', date: addDaysISO(D, -1), title: 'Separar tudo', desc: 'Número de peito e alfinetes, chip, roupa, tênis, relógio carregado, documento, gel e o que for usar no pós-prova.', link: `/corridas/${race.id}`, linkLabel: 'Checklist da prova', auto: sepOk })
  add({ id: 'amanha', date: addDaysISO(D, -1), title: 'Story: amanhã é dia!', desc: 'A contagem de véspera.', link: `/stories?modelo=contagem&prova=${race.id}`, linkLabel: 'Abrir story' })
  // 9. Dia da prova
  if (race.startTime) {
    const [h, m] = race.startTime.split(':').map(Number)
    const t = h * 60 + m - 150
    const hh = `${String(Math.floor(((t + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((t % 60) + 60) % 60).padStart(2, '0')}`
    add({ id: 'cafe', date: D, title: `Café da manhã por volta das ${hh}`, desc: `Umas 2h30 antes da largada (${race.startTime}), com o que você já testou nos treinos.` })
  }
  add({ id: 'dia', date: D, title: 'Dia da prova', desc: 'O modo Dia da prova mostra o passo a passo, os horários e o clima.', link: `/corridas/${race.id}/dia`, linkLabel: 'Abrir modo prova' })
  // 10. Depois
  add({ id: 'resultado', date: addDaysISO(D, 1), title: 'Registrar o resultado e postar a medalha', desc: 'Tempo, colocação e o arquivo do relógio (ou “Buscar no Garmin”); depois o story da prova concluída.', link: race.result ? `/stories?modelo=resultado&prova=${race.id}` : `/corridas/${race.id}/resultado`, linkLabel: race.result ? 'Story da prova' : 'Registrar resultado', auto: !!race.result })

  // Ciclo menstrual (se ativado): itens extras quando a prova cai perto da menstruação prevista
  for (const it of cycleStretchItems(race, raceCycleNote(cycle, race, today))) add(it)

  return items
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((it) => {
      const done = !!it.auto || marked.has(it.id)
      const state = done ? 'feito' : it.date === today ? 'hoje' : it.date < today ? 'passou' : 'futuro'
      return { ...it, auto: !!it.auto, done, state }
    })
}

/** O item de hoje (ou o próximo pendente) para o Início e o aviso do dia. */
export function stretchToday(items, today) {
  return items.find((i) => i.date === today && !i.done) ?? items.find((i) => !i.done && i.date > today) ?? null
}
