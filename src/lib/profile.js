// Perfil opcional da pessoa: nome, foto, dados para as provas e contato de emergência.
import { isValidISODate, parseISODate } from './dates.js'
import { UFS } from './model.js'
import { DEFAULT_PREP, normalizePrep } from './schedule.js'
import { FUELS, normalizePlace } from './logistics.js'
import { normalizePeople } from './people.js'

export const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'Infantil']
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const SEX_OPTIONS = [
  { id: 'F', label: 'Feminino' },
  { id: 'M', label: 'Masculino' },
  { id: '', label: 'Prefiro não informar' }
]

export function emptyProfile() {
  return {
    name: '', // nome completo
    nickname: '', // como quer ser chamada (padrão: primeiro nome)
    birthDate: null,
    sex: '', // categoria nas provas: 'F', 'M' ou ''
    city: '',
    state: '',
    team: '', // equipe ou assessoria
    shirtSize: '',
    emergencyName: '',
    emergencyPhone: '',
    bloodType: '',
    showNameOnCard: true,
    vehicle: { kmPerL: null, fuel: 'gasolina', pricePerL: null },
    prep: { ...DEFAULT_PREP }, // tempos de preparação padrão para a agenda do dia
    favorites: [], // lugares: [{ id, label, address, formatted, lat, lon, dwellMin }]
    people: [] // pessoas: [{ id, name, phone, placeId }] (quem você busca ou leva junto)
  }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function normalizeProfile(raw) {
  const p = { ...emptyProfile(), ...(raw && typeof raw === 'object' ? raw : {}) }
  p.name = str(p.name, 80)
  p.nickname = str(p.nickname, 30)
  p.birthDate = isValidISODate(p.birthDate) ? p.birthDate : null
  p.sex = ['F', 'M'].includes(p.sex) ? p.sex : ''
  p.city = str(p.city, 60)
  p.state = UFS.includes(p.state) ? p.state : ''
  p.team = str(p.team, 60)
  p.shirtSize = SHIRT_SIZES.includes(p.shirtSize) ? p.shirtSize : str(p.shirtSize, 10)
  p.emergencyName = str(p.emergencyName, 60)
  p.emergencyPhone = str(p.emergencyPhone, 30)
  p.bloodType = BLOOD_TYPES.includes(p.bloodType) ? p.bloodType : ''
  p.showNameOnCard = p.showNameOnCard !== false
  const v = p.vehicle && typeof p.vehicle === 'object' ? p.vehicle : {}
  const n = (x, a, b) => (Number.isFinite(Number(x)) && x !== null && x !== '' && Number(x) >= a && Number(x) <= b ? Number(x) : null)
  p.vehicle = { kmPerL: n(v.kmPerL, 1, 100), fuel: FUELS.some((f) => f.id === v.fuel) ? v.fuel : 'gasolina', pricePerL: n(v.pricePerL, 0.1, 50) }
  p.prep = normalizePrep(p.prep)
  p.favorites = (Array.isArray(p.favorites) ? p.favorites : [])
    .map((f) => {
      const pl = normalizePlace(f)
      if (!pl || !pl.label) return null
      const dwell = Number(f.dwellMin)
      return { ...pl, id: String(f.id || pl.label).slice(0, 20), dwellMin: Number.isFinite(dwell) && dwell >= 0 && dwell <= 600 && f.dwellMin !== null && f.dwellMin !== '' ? Math.round(dwell) : null }
    })
    .filter(Boolean)
    .slice(0, 30)
  p.people = normalizePeople(p.people, new Set(p.favorites.map((f) => f.id)))
  return Object.fromEntries(Object.keys(emptyProfile()).map((k) => [k, p[k]]))
}

export function validateProfile(p, today) {
  const e = {}
  if (p.birthDate) {
    if (!isValidISODate(p.birthDate)) e.birthDate = 'Data inválida.'
    else if (p.birthDate > today) e.birthDate = 'A data não pode ser no futuro.'
    else if (p.birthDate < '1900-01-01') e.birthDate = 'Data inválida.'
  }
  if (p.emergencyPhone && !/^[\d\s()+-]{8,}$/.test(p.emergencyPhone)) e.emergencyPhone = 'Use só números, espaços, parênteses e traço.'
  return e
}

/** Como chamar a pessoa: apelido ou primeiro nome. */
export function callName(p) {
  if (!p) return ''
  if (p.nickname) return p.nickname
  return (p.name || '').split(/\s+/)[0] || ''
}

export function initials(p) {
  const parts = (p?.name || p?.nickname || '').split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function isBirthday(p, todayIso) {
  return !!p?.birthDate && p.birthDate.slice(5) === todayIso.slice(5)
}

/** Saudação do Início: "Bom dia, Ana" (ou "Feliz aniversário, Ana!"). */
export function greeting(p, now = new Date(), todayIso) {
  const name = callName(p)
  if (todayIso && isBirthday(p, todayIso)) return name ? `Feliz aniversário, ${name}! 🎉` : 'Feliz aniversário! 🎉'
  const h = now.getHours()
  const base = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return name ? `${base}, ${name}` : base
}

/** Idade completa numa data. */
export function ageOn(birthIso, onIso) {
  const b = parseISODate(birthIso)
  const d = parseISODate(onIso)
  if (!b || !d) return null
  let age = d.getFullYear() - b.getFullYear()
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--
  return age
}

/**
 * Faixa etária usada pela maioria das provas no Brasil: idade em 31/12 do ano da prova,
 * em faixas de 5 anos (até 19, 20-24, …, 70+). O regulamento de cada prova pode variar.
 */
export function ageCategory(p, raceDate) {
  if (!p?.birthDate || !raceDate) return null
  const age = ageOn(p.birthDate, `${raceDate.slice(0, 4)}-12-31`)
  if (age == null || age < 5) return null
  const band = age <= 19 ? 'até 19' : age >= 70 ? '70+' : `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`
  return { age, band, label: `${p.sex || ''}${p.sex ? ' ' : ''}${band}`.trim() }
}

/** Quanto do perfil está preenchido (para o convite no Início). */
export function profileCompleteness(p, hasAvatar) {
  const keys = ['name', 'birthDate', 'shirtSize', 'emergencyPhone']
  const filled = keys.filter((k) => p?.[k]).length + (hasAvatar ? 1 : 0)
  return filled / (keys.length + 1)
}
