// Persistência local (localStorage) com assinatura de mudanças para o React.
import { useSyncExternalStore } from 'react'
import { newId, normalizeGoal, normalizeRace } from '../lib/model.js'
import { deleteFilesOfRace } from './files.js'
import { noteDeleted, noteSaved } from './syncMeta.js'

export const STORAGE_KEY = 'minhas-corridas:v1'
export const SCHEMA_VERSION = 2

let state = { status: 'loading', races: [], goals: [], error: null }
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function load() {
  const ls = getStorage()
  if (!ls) {
    state = { status: 'error', races: [], goals: [], error: 'O navegador bloqueou o armazenamento local. Saia do modo anônimo ou libere o armazenamento do site.' }
    emit()
    return
  }
  try {
    const raw = ls.getItem(STORAGE_KEY)
    if (!raw) {
      state = { status: 'ready', races: [], goals: [], error: null }
    } else {
      const data = JSON.parse(raw)
      const races = Array.isArray(data?.races) ? data.races.map(normalizeRace) : []
      const goals = Array.isArray(data?.goals) ? data.goals.map(normalizeGoal) : []
      state = { status: 'ready', races, goals, error: null }
    }
  } catch {
    state = { status: 'error', races: [], goals: [], error: 'Os dados salvos parecem corrompidos. Você pode restaurar um backup em Ajustes.' }
  }
  emit()
}

function persist(races, goals = state.goals) {
  const ls = getStorage()
  const payload = JSON.stringify({ version: SCHEMA_VERSION, races, goals })
  try {
    ls.setItem(STORAGE_KEY, payload)
  } catch {
    throw new Error('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.')
  }
  state = { status: 'ready', races, goals, error: null }
  emit()
}

export function getState() {
  return state
}

export function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore() {
  return useSyncExternalStore(subscribe, getState)
}

export function getRace(id) {
  return state.races.find((r) => r.id === id) ?? null
}

/** Cria ou atualiza. Retorna a corrida salva. */
export function saveRace(race) {
  const now = new Date().toISOString()
  let saved
  let races
  if (race.id && state.races.some((r) => r.id === race.id)) {
    saved = { ...race, updatedAt: now }
    races = state.races.map((r) => (r.id === race.id ? saved : r))
  } else {
    saved = { ...race, id: race.id || newId(), createdAt: now, updatedAt: now }
    races = [...state.races, saved]
  }
  persist(races)
  noteSaved('race', saved.id)
  return saved
}

export function deleteRace(id) {
  persist(state.races.filter((r) => r.id !== id))
  noteDeleted('race', id)
  deleteFilesOfRace(id).catch(() => {})
}

export function getGoal(id) {
  return state.goals.find((g) => g.id === id) ?? null
}

export function saveGoal(goal) {
  const now = new Date().toISOString()
  let saved
  let goals
  if (goal.id && state.goals.some((g) => g.id === goal.id)) {
    saved = { ...goal, updatedAt: now }
    goals = state.goals.map((g) => (g.id === goal.id ? saved : g))
  } else {
    saved = { ...goal, id: goal.id || newId(), createdAt: now, updatedAt: now }
    goals = [...state.goals, saved]
  }
  persist(state.races, goals)
  noteSaved('goal', saved.id)
  return saved
}

export function deleteGoal(id) {
  persist(state.races, state.goals.filter((g) => g.id !== id))
  noteDeleted('goal', id)
}

/**
 * Restauração de backup: substitui tudo. Registros restaurados ganham carimbo novo
 * (para prevalecer na sincronização) e os que sumiram viram exclusões.
 */
export function replaceAll(races, goals = []) {
  const now = new Date().toISOString()
  const nr = races.map((r) => ({ ...normalizeRace(r), updatedAt: now }))
  const ng = goals.map((g) => ({ ...normalizeGoal(g), updatedAt: now }))
  const keepR = new Set(nr.map((r) => r.id))
  const keepG = new Set(ng.map((g) => g.id))
  const goneR = state.races.filter((r) => !keepR.has(r.id)).map((r) => r.id)
  const goneG = state.goals.filter((g) => !keepG.has(g.id)).map((g) => g.id)
  persist(nr, ng)
  goneR.forEach((id) => noteDeleted('race', id))
  goneG.forEach((id) => noteDeleted('goal', id))
  nr.forEach((r) => noteSaved('race', r.id))
  ng.forEach((g) => noteSaved('goal', g.id))
}

/** Apaga tudo (e, com conta, também na nuvem). */
export function clearAll() {
  const r = state.races.map((x) => x.id)
  const g = state.goals.map((x) => x.id)
  persist([], [])
  r.forEach((id) => noteDeleted('race', id))
  g.forEach((id) => noteDeleted('goal', id))
}

/** Limpa só este aparelho, sem gerar exclusões na nuvem (ao sair da conta). */
export function wipeLocal() {
  persist([], [])
}

/** Aplica alterações vindas da sincronização, sem marcar como pendentes. */
export function applyRemote({ upserts = [], deletes = [] }) {
  if (!upserts.length && !deletes.length) return
  const races = new Map(state.races.map((r) => [r.id, r]))
  const goals = new Map(state.goals.map((g) => [g.id, g]))
  for (const u of upserts) {
    if (u.kind === 'race') races.set(u.id, normalizeRace({ ...u.data, id: u.id }))
    else if (u.kind === 'goal') goals.set(u.id, normalizeGoal({ ...u.data, id: u.id }))
  }
  for (const d of deletes) {
    if (d.kind === 'race') races.delete(d.id)
    else if (d.kind === 'goal') goals.delete(d.id)
  }
  persist([...races.values()], [...goals.values()])
}

// Mantém abas abertas em sincronia.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) load()
  })
}
