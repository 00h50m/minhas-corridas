// Pendências de sincronização (o que mudou no aparelho e ainda não subiu), salvas no localStorage.
import { emptyMeta, markDeleted, markDirty, pendingCount } from '../lib/syncEngine.js'

const KEY = 'minhas-corridas:sync'
let meta = load()
const listeners = new Set()

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return emptyMeta()
    const m = JSON.parse(raw)
    return { ...emptyMeta(), ...m, dirty: m.dirty ?? {}, tombstones: m.tombstones ?? {} }
  } catch {
    return emptyMeta()
  }
}

export function getMeta() {
  return meta
}

export function saveMeta() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(meta))
  } catch {
    /* sem espaço: as pendências continuam em memória nesta sessão */
  }
}

export function resetMeta(ownerId = null) {
  meta = { ...emptyMeta(), ownerId }
  saveMeta()
}

/** Avisado a cada alteração local (para agendar a sincronização). */
export function onLocalChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function changed() {
  saveMeta()
  for (const l of listeners) l()
}

export function noteSaved(kind, id) {
  markDirty(meta, kind, id)
  changed()
}

export function noteDeleted(kind, id) {
  markDeleted(meta, kind, id)
  changed()
}

export function pending() {
  return pendingCount(meta)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) meta = load()
  })
}
