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
