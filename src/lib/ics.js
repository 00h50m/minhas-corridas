// Geração de arquivo .ics (RFC 5545). Usa horário "flutuante" (sem fuso),
// para que a prova apareça no horário local em que foi cadastrada.
import { addDaysISO, isValidTimeHM } from './dates.js'
import { STATUS_BY_ID } from './model.js'
import { formatKm } from './format.js'

function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Linhas com mais de 75 octetos devem ser dobradas.
function fold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      curLen = 0
    }
    cur += ch
    curLen += len
  }
  out.push(cur)
  return out.join('\r\n ')
}

function compactDate(iso) {
  return iso.replace(/-/g, '')
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function raceToVEvent(r) {
  if (!r.date) return null
  const lines = ['BEGIN:VEVENT', `UID:${r.id}@minhas-corridas`, `DTSTAMP:${stamp()}`]
  if (isValidTimeHM(r.startTime)) {
    const [h, m] = r.startTime.split(':')
    lines.push(`DTSTART:${compactDate(r.date)}T${h}${m}00`)
    // Duração estimada de 2h apenas para ocupar a agenda.
    lines.push('DURATION:PT2H')
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(r.date)}`)
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDaysISO(r.date, 1))}`)
  }
  const dist = r.distanceKm ? ` – ${formatKm(r.distanceKm)}` : ''
  lines.push(`SUMMARY:${esc(`${r.name}${dist}`)}`)
  const where = [r.venueName, r.venueAddress, [r.city, r.state].filter(Boolean).join('/')].filter(Boolean).join(', ')
  if (where) lines.push(`LOCATION:${esc(where)}`)
  const desc = [`Status: ${STATUS_BY_ID[r.status]?.label ?? r.status}`]
  if (r.bibNumber) desc.push(`Número de peito: ${r.bibNumber}`)
  if (r.kitPickupDate) desc.push(`Retirada do kit: ${r.kitPickupDate.split('-').reverse().join('/')} ${r.kitPickupTime || ''}`.trim())
  if (r.signupUrl) desc.push(`Inscrição: ${r.signupUrl}`)
  lines.push(`DESCRIPTION:${esc(desc.join('\n'))}`)
  if (r.status === 'interesse' || r.status === 'aberta') lines.push('STATUS:TENTATIVE')
  else if (r.status === 'cancelada') lines.push('STATUS:CANCELLED')
  else lines.push('STATUS:CONFIRMED')
  if (r.status !== 'cancelada' && r.status !== 'desisti' && r.status !== 'concluida') {
    // Lembrete na véspera (às 9h para provas sem horário; 24h antes para provas com horário).
    lines.push(...alarm(isValidTimeHM(r.startTime) ? '-P1D' : '-PT15H', `Amanhã: ${r.name}`))
  }
  lines.push('END:VEVENT')
  return lines
}

function alarm(trigger, text) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${esc(text)}`, 'END:VALARM']
}

/** Evento auxiliar de dia inteiro (ou com horário) com lembrete. */
function helperEvent(r, kind, date, time, summary, trigger) {
  const lines = ['BEGIN:VEVENT', `UID:${r.id}-${kind}@minhas-corridas`, `DTSTAMP:${stamp()}`]
  if (isValidTimeHM(time)) {
    const [h, m] = time.split(':')
    lines.push(`DTSTART:${compactDate(date)}T${h}${m}00`, 'DURATION:PT1H')
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`, `DTEND;VALUE=DATE:${compactDate(addDaysISO(date, 1))}`)
  }
  lines.push(`SUMMARY:${esc(summary)}`, 'TRANSP:TRANSPARENT', ...alarm(trigger, summary), 'END:VEVENT')
  return lines
}

/** Eventos de prazo: retirada do kit (inscrita) e fim da inscrição / mudança de lote (antes de se inscrever). */
export function deadlineVEvents(r) {
  const out = []
  if (r.status === 'inscrita' && r.kitPickupDate) {
    const where = r.kitPickupAddress ? ` (${r.kitPickupAddress})` : ''
    out.push(helperEvent(r, 'kit', r.kitPickupDate, r.kitPickupTime, `Retirar kit – ${r.name}${where}`, isValidTimeHM(r.kitPickupTime) ? '-PT2H' : '-PT15H'))
  }
  if (r.status === 'interesse' || r.status === 'aberta') {
    if (r.signupDeadline) out.push(helperEvent(r, 'inscricao', r.signupDeadline, '', `Último dia de inscrição – ${r.name}`, '-PT15H'))
    if (r.lotChangeDate && (!r.signupDeadline || r.lotChangeDate < r.signupDeadline)) {
      out.push(helperEvent(r, 'lote', r.lotChangeDate, '', `Lote muda – ${r.name}`, '-PT15H'))
    }
  }
  return out
}

export function buildICS(races, { deadlines = true } = {}) {
  const events = races.map(raceToVEvent).filter(Boolean)
  const count = events.length
  if (deadlines) for (const r of races) events.push(...deadlineVEvents(r))
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minhas Corridas//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Minhas Corridas', ...events.flat(), 'END:VCALENDAR']
  return { text: lines.map(fold).join('\r\n') + '\r\n', count, extra: events.length - count }
}
