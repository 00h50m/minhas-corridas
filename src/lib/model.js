import { isValidISODate, isValidTimeHM } from './dates.js'

export const STATUSES = [
  { id: 'interesse', label: 'Tenho interesse', short: 'Interesse', icon: '☆' },
  { id: 'aberta', label: 'Inscrição aberta', short: 'Inscrição aberta', icon: '◷' },
  { id: 'inscrita', label: 'Inscrita', short: 'Inscrita', icon: '✓' },
  { id: 'concluida', label: 'Concluída', short: 'Concluída', icon: '⚑' },
  { id: 'desisti', label: 'Desisti', short: 'Desisti', icon: '–' },
  { id: 'cancelada', label: 'Cancelada', short: 'Cancelada', icon: '×' }
]
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

/** Provas que ainda podem acontecer e entram no planejamento. */
export const PLANNING_STATUSES = ['interesse', 'aberta', 'inscrita']
/** Inscrição feita: a inscrição conta como gasto. */
export const SIGNED_UP_STATUSES = ['inscrita', 'concluida']

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const COMMON_DISTANCES = [3, 5, 10, 15, 21.1, 42.195]

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** Campos de uma corrida. Tudo além de nome e status é opcional. */
export function emptyRace() {
  return {
    id: null,
    name: '',
    date: null, // YYYY-MM-DD ou null quando "data a confirmar"
    city: '',
    state: '',
    distanceKm: null, // distância em que vou participar
    availableDistances: [], // opções do evento
    status: 'interesse',
    startTime: '',
    venueName: '',
    venueAddress: '',
    signupUrl: '',
    organizer: '',
    fee: null,
    extraFees: null,
    signupDeadline: null,
    lotChangeDate: null,
    shirtIncluded: false,
    shirtSize: '',
    kitItems: '',
    kitPickupDate: null,
    kitPickupTime: '',
    kitPickupAddress: '',
    kitPickupBy: '',
    bibNumber: '',
    companions: '',
    leaveHomeTime: '',
    targetTime: null, // meta de tempo para esta prova, em segundos
    notes: '',
    result: null,
    createdAt: null,
    updatedAt: null
  }
}

export function emptyResult() {
  return {
    officialDistanceKm: null, // distância oficial da prova
    watchDistanceKm: null, // distância registrada pelo relógio
    netTime: null, // segundos
    grossTime: null,
    overallPlace: null,
    categoryPlace: null,
    category: '',
    officialUrl: '',
    isOfficial: true, // false = registro pessoal, sem resultado oficial
    effort: null,
    report: ''
  }
}

function isUrl(s) {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Retorna um objeto { campo: mensagem } — vazio quando válido. */
export function validateRace(r) {
  const e = {}
  if (!r.name || !r.name.trim()) e.name = 'Informe o nome da prova.'
  else if (r.name.length > 120) e.name = 'Nome muito longo (máx. 120 caracteres).'
  if (r.date != null && !isValidISODate(r.date)) e.date = 'Data inválida.'
  if (!STATUS_BY_ID[r.status]) e.status = 'Escolha um status.'
  if (r.state && !UFS.includes(r.state)) e.state = 'UF inválida.'
  if (r.distanceKm != null && !(r.distanceKm > 0 && r.distanceKm <= 400)) e.distanceKm = 'Distância inválida.'
  if (r.startTime && !isValidTimeHM(r.startTime)) e.startTime = 'Horário inválido.'
  if (r.kitPickupTime && !isValidTimeHM(r.kitPickupTime)) e.kitPickupTime = 'Horário inválido.'
  if (r.leaveHomeTime && !isValidTimeHM(r.leaveHomeTime)) e.leaveHomeTime = 'Horário inválido.'
  for (const k of ['signupDeadline', 'lotChangeDate', 'kitPickupDate']) {
    if (r[k] != null && !isValidISODate(r[k])) e[k] = 'Data inválida.'
  }
  if (r.signupUrl && !isUrl(r.signupUrl)) e.signupUrl = 'Use um link completo, começando com https://'
  if (r.status === 'concluida' && !r.date) e.date = 'Uma prova concluída precisa ter data.'
  return e
}

export function validateResult(res) {
  const e = {}
  if (!(res.officialDistanceKm > 0)) e.officialDistanceKm = 'Informe a distância oficial da prova.'
  if (res.watchDistanceKm != null && !(res.watchDistanceKm > 0)) e.watchDistanceKm = 'Distância inválida.'
  if (!(res.netTime > 0)) e.netTime = 'Informe o tempo líquido (ex.: 28:45 ou 1:05:30).'
  if (res.grossTime != null && res.netTime && res.grossTime < res.netTime) e.grossTime = 'O tempo bruto não pode ser menor que o líquido.'
  if (res.effort != null && !(Number.isInteger(res.effort) && res.effort >= 1 && res.effort <= 10)) e.effort = 'Escolha de 1 a 10.'
  for (const k of ['overallPlace', 'categoryPlace']) {
    if (res[k] != null && !(Number.isInteger(res[k]) && res[k] > 0)) e[k] = 'Use um número inteiro positivo.'
  }
  if (res.officialUrl && !isUrl(res.officialUrl)) e.officialUrl = 'Use um link completo, começando com https://'
  return e
}

/** Normaliza uma corrida vinda de backup ou versões anteriores. */
export function normalizeRace(raw) {
  const base = emptyRace()
  const r = { ...base, ...raw }
  r.availableDistances = Array.isArray(r.availableDistances) ? r.availableDistances.filter((n) => typeof n === 'number' && n > 0) : []
  r.result = r.result ? { ...emptyResult(), ...r.result } : null
  return r
}
