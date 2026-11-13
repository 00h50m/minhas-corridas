// Pessoas e lugares do perfil: quem você costuma buscar ou leva junto, e os endereços de sempre.
import { minToHm } from './schedule.js'
import { formatDateBR } from './dates.js'

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const newId = () => Math.random().toString(36).slice(2, 10)

/** Pessoas: [{ id, name, phone, placeId }]. Só o nome é obrigatório. */
export function normalizePeople(raw, placeIds = null) {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => {
      const name = str(p?.name, 40)
      if (!name) return null
      const placeId = str(p?.placeId, 20) || null
      return { id: str(p?.id, 20) || newId(), name, phone: str(p?.phone, 30).replace(/[^\d+()\s-]/g, ''), placeId: placeId && (!placeIds || placeIds.has(placeId)) ? placeId : null }
    })
    .filter(Boolean)
    .slice(0, 30)
}

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''

/** Telefone para WhatsApp: só dígitos, com 55 (Brasil) quando vier sem código do país. */
export function phoneForWhatsapp(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length >= 12 && d.length <= 15 ? d : null
}

/** Mensagem para quem você vai buscar, com o horário calculado pela agenda. */
export function pickupMessage({ person, race, at }) {
  const when = race.date ? ` (${formatDateBR(race.date).slice(0, 5)})` : ''
  const start = race.startTime ? ` Largada às ${race.startTime}.` : ''
  return `Oi, ${firstName(person.name)}! Passo aí às ${minToHm(at, { withDay: false })} para a ${race.name}${when}.${start} 🏃`
}

/** Link do WhatsApp com a mensagem (com o número, se houver; senão, a pessoa escolhe o contato). */
export function whatsappLink(phone, text) {
  const n = phoneForWhatsapp(phone)
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`
}

/**
 * Paradas de busca da agenda: [{ person, stop, at }] — quem está em cada parada da ida e a que horas você chega.
 * schedule: resultado de buildSchedule; stops: paradas da ida (com personId).
 */
export function pickups(schedule, stops, people) {
  if (!schedule) return []
  const byId = new Map(people.map((p) => [p.id, p]))
  return stops
    .map((st, i) => ({ stop: st, person: st.personId ? byId.get(st.personId) : null, at: schedule.items.find((it) => it.key === `parada-${i}`)?.at }))
    .filter((x) => x.person && x.at != null)
}

/** Nomes de quem vai junto (cadastradas + texto livre antigo). */
export function companionNames(race, people) {
  const byId = new Map(people.map((p) => [p.id, p.name]))
  const names = (race.companionIds ?? []).map((id) => byId.get(id)).filter(Boolean)
  if (race.companions) names.push(race.companions)
  return names
}
