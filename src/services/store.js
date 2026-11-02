// Persistência local (localStorage) com assinatura de mudanças para o React.
import { useSyncExternalStore } from 'react'
import { newId, normalizeRace } from '../lib/model.js'

export const STORAGE_KEY = 'minhas-corridas:v1'
export const SCHEMA_VERSION = 1

let state = { status: 'loading', races: [], error: null }
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
    state = { status: 'error', races: [], error: 'O navegador bloqueou o armazenamento local. Saia do modo anônimo ou libere o armazenamento do site.' }
    emit()
    return
  }
  try {
    const raw = ls.getItem(STORAGE_KEY)
    if (!raw) {
      state = { status: 'ready', races: [], error: null }
    } else {
      const data = JSON.parse(raw)
      const races = Array.isArray(data?.races) ? data.races.map(normalizeRace) : []
      state = { status: 'ready', races, error: null }
    }
  } catch {
    state = { status: 'error', races: [], error: 'Os dados salvos parecem corrompidos. Você pode restaurar um backup em Ajustes.' }
  }
  emit()
}

function persist(races) {
  const ls = getStorage()
  const payload = JSON.stringify({ version: SCHEMA_VERSION, races })
  try {
    ls.setItem(STORAGE_KEY, payload)
  } catch {
    throw new Error('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.')
  }
  state = { status: 'ready', races, error: null }
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
  return saved
}

export function deleteRace(id) {
  persist(state.races.filter((r) => r.id !== id))
}

export function replaceAll(races) {
  persist(races.map(normalizeRace))
}

export function clearAll() {
  persist([])
}

// Mantém abas abertas em sincronia.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) load()
  })
}
