import { isValidISODate, isValidTimeHM } from './dates.js'
import { isValidWatch } from './activityFile.js'
import { normalizeLogistics } from './logistics.js'

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
    companions: '', // texto livre (antigo); quem vai junto cadastrado fica em companionIds
    companionIds: [], // ids das pessoas do perfil
    dayLog: null, // dia da prova: { date, marks: { passo: 'HH:MM' } } (saí de casa, cheguei na parada…)
    leaveHomeTime: '',
    targetTime: null, // meta de tempo para esta prova, em segundos
    wish: null, // quanto quero fazer esta prova: 1 (talvez), 2 (quero), 3 (quero muito)
    notes: '',
    // Custos. Inscrição estimada = fee + extraFees; feePaid é o valor efetivamente pago.
    feePaid: null,
    transportEst: null,
    transportPaid: null,
    lodgingEst: null,
    lodgingPaid: null,
    otherEst: null,
    otherPaid: null,
    otherDesc: '',
    checklist: null, // [{ id, text, done }]
    logistics: null, // planejamento de trajeto, custos e agenda (lib/logistics.js)
    scheduleFeed: null, // horários da agenda para a assinatura (.ics), só se a pessoa pedir
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
    report: '',
    watch: null // resumo do arquivo do relógio (GPX/TCX): distância, tempo, FC, elevação, parciais
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
  if (r.wish != null && ![1, 2, 3].includes(r.wish)) e.wish = 'Escolha de 1 a 3.'
  if (r.signupUrl && !isUrl(r.signupUrl)) e.signupUrl = 'Use um link completo, começando com https://'
  if (r.status === 'concluida' && !r.date) e.date = 'Uma prova concluída precisa ter data.'
  for (const k of MONEY_FIELDS) {
    if (r[k] != null && !(typeof r[k] === 'number' && r[k] >= 0 && r[k] <= 1_000_000)) e[k] = 'Valor inválido.'
  }
  return e
}

export const MONEY_FIELDS = ['fee', 'extraFees', 'feePaid', 'transportEst', 'transportPaid', 'lodgingEst', 'lodgingPaid', 'otherEst', 'otherPaid']

export const DEFAULT_CHECKLIST = [
  'Inscrição confirmada',
  'Kit retirado',
  'Documento separado',
  'Roupa e tênis preparados',
  'Relógio carregado',
  'Transporte organizado',
  'Horário de saída definido'
]

export function defaultChecklist(status) {
  return DEFAULT_CHECKLIST.map((text, i) => ({
    id: 'c' + i + '-' + newId().slice(0, 8),
    text,
    done: i === 0 && (status === 'inscrita' || status === 'concluida')
  }))
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
  if (r.result && !isValidWatch(r.result.watch)) r.result.watch = null
  r.checklist = Array.isArray(r.checklist)
    ? r.checklist.filter((c) => c && typeof c.text === 'string' && c.text.trim()).map((c) => ({ id: String(c.id || newId()), text: c.text.trim().slice(0, 120), done: !!c.done }))
    : defaultChecklist(r.status)
  if (typeof r.otherDesc !== 'string') r.otherDesc = ''
  if (![1, 2, 3].includes(r.wish)) r.wish = null
  r.logistics = normalizeLogistics(r.logistics)
  r.dayLog = normalizeDayLog(r.dayLog)
  r.companionIds = Array.isArray(r.companionIds) ? [...new Set(r.companionIds.filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 20)))].slice(0, 20) : []
  r.scheduleFeed = Array.isArray(r.scheduleFeed)
    ? r.scheduleFeed.filter((e) => e && typeof e.title === 'string' && isValidISODate(e.date) && isValidTimeHM(e.time)).slice(0, 6).map((e) => ({ key: String(e.key || '').slice(0, 20), title: e.title.slice(0, 120), date: e.date, time: e.time }))
    : null
  return r
}

/* ---------- Objetivos ---------- */

export const GOAL_TYPES = [
  { id: 'primeira', label: 'Primeira prova numa distância', example: 'Completar minha primeira meia maratona', auto: true },
  { id: 'tempo', label: 'Tempo abaixo de uma marca', example: 'Correr 5 km abaixo de 30:00', auto: true },
  { id: 'quantidade', label: 'Quantidade de provas', example: 'Completar 8 provas no ano', auto: true },
  { id: 'km', label: 'Distância acumulada em provas', example: 'Somar 100 km em provas', auto: true },
  { id: 'orcamento', label: 'Orçamento de inscrições', example: 'Gastar até R$ 1.500 em inscrições', auto: true },
  { id: 'manual', label: 'Outro objetivo (manual)', example: 'Correr uma prova com minha mãe', auto: false }
]
export const GOAL_TYPE_BY_ID = Object.fromEntries(GOAL_TYPES.map((t) => [t.id, t]))

export const GOAL_STATUSES = [
  { id: 'andamento', label: 'Em andamento', icon: '▶' },
  { id: 'concluido', label: 'Concluído', icon: '✓' },
  { id: 'pausado', label: 'Pausado', icon: '❚❚' }
]
export const GOAL_STATUS_BY_ID = Object.fromEntries(GOAL_STATUSES.map((s) => [s.id, s]))

/** Unidade exibida para o valor alvo. */
export function goalUnit(g) {
  switch (g.type) {
    case 'primeira':
    case 'km':
      return 'km'
    case 'tempo':
      return 'tempo'
    case 'quantidade':
      return 'provas'
    case 'orcamento':
      return 'R$'
    default:
      return g.unit || ''
  }
}

export function emptyGoal(type = 'tempo') {
  return {
    id: null,
    title: '',
    type,
    targetValue: null, // segundos (tempo), km, nº de provas, R$ ou número livre (manual)
    unit: '', // só para objetivos manuais
    distanceKm: null, // tempo e primeira prova
    startDate: null, // início do período considerado (opcional)
    deadline: null, // prazo (opcional)
    status: 'andamento',
    manualValue: null, // progresso informado à mão (manual)
    budgetScope: 'inscricoes', // orçamento: 'inscricoes' ou 'total' (inscrição + transporte + hospedagem + outros)
    alertPct: 80, // orçamento: avisar ao atingir esta porcentagem
    notes: '',
    createdAt: null,
    updatedAt: null
  }
}

export function validateGoal(g) {
  const e = {}
  if (!g.title || !g.title.trim()) e.title = 'Dê um título ao objetivo.'
  else if (g.title.length > 120) e.title = 'Título muito longo (máx. 120 caracteres).'
  if (!GOAL_TYPE_BY_ID[g.type]) e.type = 'Escolha o tipo.'
  if (!GOAL_STATUS_BY_ID[g.status]) e.status = 'Status inválido.'
  if (g.type === 'primeira' || g.type === 'tempo') {
    if (!(g.distanceKm > 0 && g.distanceKm <= 400)) e.distanceKm = 'Informe a distância em km.'
  }
  if (g.type !== 'primeira') {
    const v = g.targetValue
    if (!(typeof v === 'number' && v > 0)) e.targetValue = 'Informe o valor alvo.'
    else if (g.type === 'quantidade' && !(Number.isInteger(v) && v <= 500)) e.targetValue = 'Use um número inteiro de provas.'
    else if (g.type === 'orcamento' && v > 1_000_000) e.targetValue = 'Valor alto demais.'
    else if (g.type === 'km' && v > 100_000) e.targetValue = 'Distância alta demais.'
  }
  if (g.manualValue != null && !(typeof g.manualValue === 'number' && g.manualValue >= 0)) e.manualValue = 'Use um número maior ou igual a zero.'
  if (g.type === 'orcamento' && !(Number.isInteger(g.alertPct) && g.alertPct >= 50 && g.alertPct <= 100)) e.alertPct = 'Escolha entre 50% e 100%.'
  if (g.startDate != null && !isValidISODate(g.startDate)) e.startDate = 'Data inválida.'
  if (g.deadline != null && !isValidISODate(g.deadline)) e.deadline = 'Data inválida.'
  if (!e.startDate && !e.deadline && g.startDate && g.deadline && g.startDate > g.deadline) e.deadline = 'O prazo é anterior ao início.'
  return e
}

export function normalizeGoal(raw) {
  const g = { ...emptyGoal(), ...raw }
  if (g.type === 'primeira') g.targetValue = g.distanceKm
  if (typeof g.notes !== 'string') g.notes = ''
  if (typeof g.unit !== 'string') g.unit = ''
  if (g.budgetScope !== 'total') g.budgetScope = 'inscricoes'
  if (!(Number.isInteger(g.alertPct) && g.alertPct >= 50 && g.alertPct <= 100)) g.alertPct = 80
  return g
}

/** Marcações do dia da prova (horário real de cada passo). */
export function normalizeDayLog(raw) {
  if (!raw || typeof raw !== 'object' || !isValidISODate(raw.date)) return null
  const marks = {}
  for (const [k, v] of Object.entries(raw.marks ?? {}).slice(0, 40)) if (/^[a-z0-9-]{1,20}$/.test(k) && /^\d{2}:\d{2}$/.test(v)) marks[k] = v
  return { date: raw.date, marks }
}
