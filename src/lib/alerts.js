// Prazos próximos para o Início: inscrição, mudança de lote, retirada do kit e a própria prova.
import { daysBetween, todayISO } from './dates.js'
import { budgetStatus, currentBudget } from './budget.js'
import { formatMoney } from './format.js'
import { raceKitSchedule, raceSchedule } from './logistics.js'
import { minToHm } from './schedule.js'

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

// Antecedências que a pessoa pode escolher, em dias (0 = no próprio dia).
export const PUSH_OPTIONS = {
  inscricao: [7, 3, 1, 0],
  lote: [3, 1],
  kit: [1, 0],
  prova: [2, 1, 0]
}
export const PUSH_TYPES = Object.keys(PUSH_OPTIONS)

// Padrão de quem nunca mexeu nas preferências.
export const DEFAULT_PUSH_PREFS = { inscricao: [3, 0], lote: [1], kit: [1, 0], prova: [1], weekly: false, orcamento: true, resultado: true }

/** Aceita preferências salvas (ou nada) e devolve um objeto válido. */
export function normalizePushPrefs(raw) {
  const out = { weekly: DEFAULT_PUSH_PREFS.weekly, orcamento: DEFAULT_PUSH_PREFS.orcamento, resultado: DEFAULT_PUSH_PREFS.resultado }
  for (const t of PUSH_TYPES) {
    const v = raw && Array.isArray(raw[t]) ? raw[t] : DEFAULT_PUSH_PREFS[t]
    out[t] = [...new Set(v.filter((d) => PUSH_OPTIONS[t].includes(d)))].sort((a, b) => b - a)
  }
  if (raw && typeof raw.weekly === 'boolean') out.weekly = raw.weekly
  out.orcamento = raw && typeof raw.orcamento === 'boolean' ? raw.orcamento : DEFAULT_PUSH_PREFS.orcamento
  out.resultado = raw && typeof raw.resultado === 'boolean' ? raw.resultado : DEFAULT_PUSH_PREFS.resultado
  return out
}

const inDays = (d) => (d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`)
const cap = (s) => s[0].toUpperCase() + s.slice(1)

const PUSH_TEXT = {
  inscricao: (r, d) => ({ title: d === 0 ? 'Inscrição termina hoje' : `Inscrição termina ${inDays(d)}`, body: r.name }),
  lote: (r, d) => ({ title: `${cap(inDays(d))} o preço muda de lote`, body: r.name }),
  kit: (r, d) => {
    const k = raceKitSchedule(r)
    return {
      title: `${cap(inDays(d))}: retirar o kit`,
      body: [r.name, r.kitPickupTime, r.kitPickupAddress, k && `sair às ${minToHm(k.depart, { withDay: false })}`].filter(Boolean).join(' · ')
    }
  },
  prova: (r, d) => {
    // Na véspera e no dia, a agenda planejada (se houver) diz a que horas acordar e sair.
    const s = d <= 1 ? raceSchedule(r) : null
    return {
      title: d === 0 ? 'Hoje é dia de prova!' : d === 1 ? 'Amanhã é dia de prova!' : `Prova ${inDays(d)}`,
      body: [r.name, r.startTime && `largada ${r.startTime}`, s && `acordar ${minToHm(s.wake, { withDay: false })}`, s && `sair ${minToHm(s.depart, { withDay: false })}`].filter(Boolean).join(' · ')
    }
  }
}

const SHORT_LABEL = { prova: 'prova', kit: 'kit', inscricao: 'fim da inscrição', lote: 'muda o lote' }
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Resumo da semana (segunda-feira): o que vem nos próximos 7 dias. */
export function weeklySummary(races, today) {
  const [y, m, d] = today.split('-').map(Number)
  if (new Date(y, m - 1, d).getDay() !== 1) return null
  const items = upcomingAlerts(races, today, 6)
  if (!items.length) return null
  const parts = items.slice(0, 3).map((a) => {
    const [yy, mm, dd] = a.date.split('-').map(Number)
    return `${a.daysLeft === 0 ? 'hoje' : WEEKDAY[new Date(yy, mm - 1, dd).getDay()]}: ${SHORT_LABEL[a.type]} – ${a.race.name}`
  })
  if (items.length > 3) parts.push(`+${items.length - 3}`)
  return { key: `semana:${today}`, type: 'semana', raceId: null, url: '/', title: `Sua semana: ${items.length} ${items.length === 1 ? 'compromisso' : 'compromissos'}`, body: parts.join('\n') }
}

/**
 * Notificações do dia para uma pessoa, conforme as preferências. Cada uma tem `key` única
 * (prova, tipo, data e antecedência), usada pelo servidor para nunca mandar a mesma duas vezes.
 */
export function pushNotificationsFor(races, today = todayISO(), rawPrefs = null, goals = []) {
  const prefs = normalizePushPrefs(rawPrefs)
  const max = Math.max(0, ...PUSH_TYPES.flatMap((t) => prefs[t]))
  const out = upcomingAlerts(races, today, max)
    .filter((a) => prefs[a.type]?.includes(a.daysLeft))
    .map((a) => ({
      key: `${a.race.id}:${a.type}:${a.date}:${a.daysLeft}`,
      type: a.type,
      raceId: a.race.id,
      url: `/corridas/${a.race.id}${a.type === 'prova' && a.daysLeft <= 1 ? '/dia' : ''}`,
      ...PUSH_TEXT[a.type](a.race, a.daysLeft)
    }))
  if (prefs.weekly) {
    const w = weeklySummary(races, today)
    if (w) out.unshift(w)
  }
  if (prefs.orcamento) {
    const b = budgetAlert(goals, races, today)
    if (b) out.push(b)
  }
  if (prefs.resultado) out.push(...resultReminders(races, today))
  return out
}

/**
 * Aviso de orçamento: uma vez ao chegar no limite de alerta e outra ao estourar.
 * A chave leva o valor do orçamento, então mudar o teto permite avisar de novo.
 */
export function budgetAlert(goals, races, today = todayISO()) {
  const g = currentBudget(goals, today)
  if (!g) return null
  const b = budgetStatus(g, races, today)
  if (b.level === 'ok') return null
  const over = b.level === 'estourou'
  return {
    key: `orcamento:${g.id}:${b.level}:${g.targetValue}:${b.alertPct}`,
    type: 'orcamento',
    raceId: null,
    url: `/objetivos/${g.id}`,
    title: over ? 'Orçamento estourado' : `Orçamento: ${Math.round(b.pct * 100)}% usado`,
    body: over
      ? `${formatMoney(b.spent)} de ${formatMoney(b.target)} — ${formatMoney(b.spent - b.target)} acima.`
      : `${formatMoney(b.spent)} de ${formatMoney(b.target)}. Restam ${formatMoney(b.remaining)}.`
  }
}

/** "Como foi?": no dia seguinte à prova inscrita ainda sem resultado. */
export function resultReminders(races, today = todayISO()) {
  return races
    .filter((r) => r.status === 'inscrita' && !r.result && r.date && daysBetween(r.date, today) === 1)
    .map((r) => ({
      key: `${r.id}:resultado:${r.date}`,
      type: 'resultado',
      raceId: r.id,
      url: `/corridas/${r.id}/resultado`,
      title: `Como foi a ${r.name}?`,
      body: 'Registre o tempo enquanto está fresco na memória — e compartilhe o card.'
    }))
}
