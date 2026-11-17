// Provas perto de você: sem uma base aberta de calendário de provas, o app usa o que já sabe
// (sua cidade, onde você costuma correr, as provas do ano passado nesta época) e monta buscas prontas.
import { addDaysISO, monthName } from './dates.js'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const key = (city, state) => `${city.trim().toLowerCase()}|${(state ?? '').toUpperCase()}`

/** Cidades de referência: a do perfil primeiro, depois onde você mais correu ou planeja correr. */
export function nearCities(profile, races) {
  const count = new Map()
  const add = (city, state, n) => {
    if (!city?.trim()) return
    const k = key(city, state)
    const cur = count.get(k) ?? { city: city.trim(), state: (state ?? '').toUpperCase(), n: 0 }
    cur.n += n
    count.set(k, cur)
  }
  if (profile?.city) add(profile.city, profile.state, 1000)
  for (const r of races) add(r.city, r.state, r.status === 'concluida' ? 2 : 1)
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8)
}

/** Provas que você correu (ou planejou) entre hoje e 90 dias à frente, no ano passado: as edições novas costumam abrir agora. */
export function lastYearAgain(races, today) {
  const y = Number(today.slice(0, 4))
  const from = `${y - 1}${today.slice(4)}`
  const to = addDaysISO(from, 90)
  const names = new Set(races.filter((r) => r.date && r.date >= today).map((r) => r.name.trim().toLowerCase()))
  return races
    .filter((r) => r.date && r.date >= from && r.date <= to && ['concluida', 'inscrita', 'interesse', 'aberta'].includes(r.status))
    .filter((r) => !names.has(r.name.trim().toLowerCase()))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Próximos 3 meses (rótulos) a partir de hoje. */
export function nextMonths(today, n = 3) {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7)) - 1
  return Array.from({ length: n }, (_, i) => ({ month: (m + i) % 12, year: y + Math.floor((m + i) / 12) })).map((x) => ({ ...x, label: `${cap(monthName(x.month))} ${x.year}` }))
}

const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`

/**
 * Buscas prontas para uma cidade e um mês: [{ id, label, url }].
 * Usa a busca do Google (inclusive restrita aos sites de inscrição), que não depende do formato interno de cada site.
 */
export function searchLinks({ city, state }, { month, year }) {
  const place = `${city}${state ? ` ${state}` : ''}`
  const when = `${monthName(month).toLowerCase()} ${year}`
  return [
    { id: 'google', label: `Corridas em ${city} · ${monthName(month).toLowerCase()}`, url: google(`corrida de rua ${place} ${when} inscrições`) },
    { id: 'ticketsports', label: 'No Ticket Sports', url: google(`site:ticketsports.com.br corrida ${place} ${year}`) },
    { id: 'corridasbr', label: 'No Corridas BR', url: google(`site:corridasbr.com.br ${place} ${year}`) },
    { id: 'minhasinscricoes', label: 'No Minhas Inscrições', url: google(`site:minhasinscricoes.com.br corrida ${place} ${year}`) }
  ]
}

/** Busca da nova edição de uma prova do ano passado. */
export function editionLink(race, year) {
  return google(`${race.name.replace(/\b20\d\d\b/g, '').trim()} ${year} inscrições`)
}
