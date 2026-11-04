// Prazos próximos para o Início: inscrição, mudança de lote, retirada do kit e a própria prova.
import { daysBetween, todayISO } from './dates.js'

const BEFORE_SIGNUP = ['interesse', 'aberta']

/**
 * Retorna avisos de hoje até `days` dias à frente, em ordem de data.
 * Cada aviso: { key, race, type, date, time, label, daysLeft }
 */
export function upcomingAlerts(races, today = todayISO(), days = 7) {
  const out = []
  const add = (race, type, date, time, label) => {
    if (!date) return
    const d = daysBetween(today, date)
    if (d == null || d < 0 || d > days) return
    out.push({ key: `${race.id}:${type}`, race, type, date, time: time || '', label, daysLeft: d })
  }
  for (const r of races) {
    if (BEFORE_SIGNUP.includes(r.status)) {
      add(r, 'inscricao', r.signupDeadline, '', 'Inscrição termina')
      // Mudança de lote só interessa se ainda não passou o prazo final.
      if (!r.signupDeadline || r.lotChangeDate <= r.signupDeadline) add(r, 'lote', r.lotChangeDate, '', 'Preço muda de lote')
    }
    if (r.status === 'inscrita') {
      const kitDone = (r.checklist ?? []).some((i) => i.done && /kit retirado/i.test(i.text))
      if (!kitDone) add(r, 'kit', r.kitPickupDate, r.kitPickupTime, 'Retirar o kit')
      add(r, 'prova', r.date, r.startTime, 'Dia da prova')
    }
  }
  const order = { prova: 0, kit: 1, inscricao: 2, lote: 3 }
  return out.sort((a, b) => (a.date === b.date ? order[a.type] - order[b.type] : a.date < b.date ? -1 : 1))
}

export function whenLabel(daysLeft) {
  if (daysLeft === 0) return 'hoje'
  if (daysLeft === 1) return 'amanhã'
  return `em ${daysLeft} dias`
}

/** Corrida-modelo para o ano seguinte: mantém dados do evento, sem data, valores, resultado ou anexos. */
export function repeatRace(r) {
  const keep = ['name', 'city', 'state', 'distanceKm', 'availableDistances', 'startTime', 'venueName', 'venueAddress', 'signupUrl', 'organizer', 'shirtIncluded', 'kitItems', 'kitPickupAddress', 'companions', 'leaveHomeTime']
  const copy = {}
  for (const k of keep) copy[k] = Array.isArray(r[k]) ? [...r[k]] : r[k]
  return copy
}

/* ---------- Notificações push (enviadas pelo servidor uma vez por dia) ---------- */

// Em quais "dias antes" cada prazo vira notificação.
export const PUSH_RULES = {
  inscricao: [3, 0],
  lote: [1],
  kit: [1, 0],
  prova: [1]
}

const PUSH_TEXT = {
  inscricao: (r, d) => ({ title: d === 0 ? 'Inscrição termina hoje' : `Inscrição termina em ${d} dias`, body: r.name }),
  lote: (r) => ({ title: 'Amanhã o preço muda de lote', body: r.name }),
  kit: (r, d) => ({
    title: d === 0 ? 'Hoje: retirar o kit' : 'Amanhã: retirar o kit',
    body: [r.name, r.kitPickupTime, r.kitPickupAddress].filter(Boolean).join(' · ')
  }),
  prova: (r) => ({ title: 'Amanhã é dia de prova!', body: [r.name, r.startTime && `largada ${r.startTime}`].filter(Boolean).join(' · ') })
}

/**
 * Notificações do dia para uma pessoa. Cada uma tem `key` única (prova, tipo, data e antecedência),
 * usada pelo servidor para nunca mandar a mesma duas vezes.
 */
export function pushNotificationsFor(races, today = todayISO()) {
  const max = Math.max(...Object.values(PUSH_RULES).flat())
  return upcomingAlerts(races, today, max)
    .filter((a) => PUSH_RULES[a.type]?.includes(a.daysLeft))
    .map((a) => ({
      key: `${a.race.id}:${a.type}:${a.date}:${a.daysLeft}`,
      type: a.type,
      raceId: a.race.id,
      url: `/corridas/${a.race.id}`,
      ...PUSH_TEXT[a.type](a.race, a.daysLeft)
    }))
}
