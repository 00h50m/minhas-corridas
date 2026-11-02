// Tempos, pace, distâncias e valores em reais.

/** Aceita "mm:ss", "h:mm:ss" ou "hh:mm:ss". Retorna segundos ou null. */
export function parseDuration(input) {
  if (input == null) return null
  const s = String(input).trim()
  if (!s) return null
  const parts = s.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null
  const nums = parts.map(Number)
  let h = 0, m, sec
  if (nums.length === 3) [h, m, sec] = nums
  else [m, sec] = nums
  if (sec > 59) return null
  if (nums.length === 3 && m > 59) return null
  const total = h * 3600 + m * 60 + sec
  if (total <= 0 || total > 48 * 3600) return null
  return total
}

export function formatDuration(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '—'
  const t = Math.round(totalSeconds)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Pace em segundos por km. */
export function paceSeconds(seconds, km) {
  if (!seconds || !km || km <= 0) return null
  return seconds / km
}

export function formatPace(secPerKm) {
  if (secPerKm == null || !isFinite(secPerKm)) return '—'
  const t = Math.round(secPerKm)
  const m = Math.floor(t / 60)
  const s = String(t % 60).padStart(2, '0')
  return `${m}:${s} /km`
}

/** Aceita "10", "21,1", "21.1", "42,195". Retorna número ou null. */
export function parseKm(input) {
  if (input == null || input === '') return null
  const s = String(input).trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) return null
  const n = Number(s)
  if (!(n > 0) || n > 400) return null
  return n
}

export function formatKm(n, { unit = true } = {}) {
  if (n == null || !isFinite(n)) return '—'
  const str = Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return unit ? `${str} km` : str
}

/** Aceita "120", "120,50", "1.234,56", "R$ 99,90". Retorna número >= 0 ou null. */
export function parseMoney(input) {
  if (input == null) return null
  let s = String(input).trim().replace(/R\$\s?/i, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  if (n < 0 || n > 1_000_000) return null
  return n
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function formatMoney(n) {
  if (n == null || !isFinite(n)) return '—'
  return BRL.format(n)
}

/** Para preencher inputs a partir de números salvos. */
export function moneyToInput(n) {
  if (n == null) return ''
  return Number(n).toFixed(2).replace('.', ',')
}
export function kmToInput(n) {
  if (n == null) return ''
  return String(n).replace('.', ',')
}
export function durationToInput(sec) {
  return sec == null ? '' : formatDuration(sec)
}
