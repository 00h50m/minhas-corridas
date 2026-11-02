// Datas sem horário são tratadas como datas locais (YYYY-MM-DD), nunca via Date.parse,
// para evitar que o fuso horário mude o dia.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidISODate(s) {
  if (typeof s !== 'string') return false
  const m = ISO_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

export function parseISODate(s) {
  if (!isValidISODate(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO() {
  return toISODate(new Date())
}

export function formatDateBR(iso) {
  if (!isValidISODate(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function weekdayShort(iso) {
  const d = parseISODate(iso)
  return d ? WEEKDAYS[d.getDay()] : ''
}

export function monthName(monthIndex) {
  return MONTHS[monthIndex]
}

export function monthShort(iso) {
  const d = parseISODate(iso)
  return d ? MONTHS_SHORT[d.getMonth()] : ''
}

export function dayOfMonth(iso) {
  const d = parseISODate(iso)
  return d ? d.getDate() : ''
}

/** Diferença em dias de calendário entre duas datas ISO (b - a). */
export function daysBetween(aIso, bIso) {
  const a = parseISODate(aIso)
  const b = parseISODate(bIso)
  if (!a || !b) return null
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / 86400000)
}

export function addDaysISO(iso, n) {
  const d = parseISODate(iso)
  if (!d) return null
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function yearOf(iso) {
  return isValidISODate(iso) ? Number(iso.slice(0, 4)) : null
}

export function isValidTimeHM(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

export function countdownLabel(iso, today = todayISO()) {
  const n = daysBetween(today, iso)
  if (n === null) return ''
  if (n === 0) return 'É hoje!'
  if (n === 1) return 'Amanhã'
  if (n > 1) return `Faltam ${n} dias`
  if (n === -1) return 'Foi ontem'
  return `Há ${-n} dias`
}
