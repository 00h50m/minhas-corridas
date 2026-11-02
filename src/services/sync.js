// Controlador da conta e da sincronização para a interface.
import { useSyncExternalStore } from 'react'
import { deleteAccountRemote, isConfigured, supabase, supabaseRemote } from './supabase.js'
import { getMeta, onLocalChange, pending, resetMeta, saveMeta } from './syncMeta.js'
import { markAllLocal, syncOnce } from '../lib/syncEngine.js'
import { applyRemote, getGoal, getRace, getState as getStore, wipeLocal } from './store.js'
import { allFiles, applyRemoteFiles, filesMissingBlob, getFileRecord, setFileBlob, wipeLocalFiles } from './files.js'

/*
 phase:
  'off'          — sincronização não configurada neste build
  'signed-out'   — sem conta: dados só no aparelho
  'needs-import' — primeiro login com dados no aparelho: perguntar o que fazer
  'idle' | 'syncing' | 'offline' | 'error'
*/
let state = {
  configured: isConfigured,
  ready: !isConfigured,
  user: null,
  phase: isConfigured ? 'signed-out' : 'off',
  lastSyncAt: null,
  error: null,
  pending: pending(),
  recovery: false
}
const listeners = new Set()
function set(patch) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
export const getSync = () => state
export function useSync() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getSync)
}

/* Adaptador local para o motor */
const local = {
  async get(kind, id) {
    if (kind === 'race') return getRace(id)
    if (kind === 'goal') return getGoal(id)
    return getFileRecord(id)
  },
  async list(kind) {
    if (kind === 'race') return getStore().races
    if (kind === 'goal') return getStore().goals
    return allFiles()
  },
  async applyRemote({ upserts, deletes }) {
    const isFile = (x) => x.kind === 'file'
    applyRemote({ upserts: upserts.filter((x) => !isFile(x)), deletes: deletes.filter((x) => !isFile(x)) })
    await applyRemoteFiles({ upserts: upserts.filter(isFile), deletes: deletes.filter(isFile) })
  },
  async getBlob(id) {
    return (await getFileRecord(id))?.blob ?? null
  },
  setBlob: setFileBlob,
  filesMissingBlob
}

let timer = null
let running = null
let again = false

export function scheduleSync(delay = 1500) {
  set({ pending: pending() })
  if (!state.user || state.phase === 'needs-import') return
  clearTimeout(timer)
  timer = setTimeout(() => syncNow().catch(() => {}), delay)
}

export async function syncNow() {
  if (!state.user || state.phase === 'needs-import') return
  if (running) {
    again = true
    return running
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set({ phase: 'offline', pending: pending() })
    return
  }
  set({ phase: 'syncing', error: null })
  running = (async () => {
    try {
      const meta = getMeta()
      await syncOnce({ remote: supabaseRemote(state.user.id), local, meta, userId: state.user.id, saveMeta })
      set({ phase: 'idle', lastSyncAt: new Date().toISOString(), error: null, pending: pending() })
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      set({ phase: offline ? 'offline' : 'error', error: offline ? null : e.message, pending: pending() })
    } finally {
      running = null
    }
    if (again) {
      again = false
      await syncNow()
    }
  })()
  return running
}

function hasLocalData() {
  const s = getStore()
  return s.races.length > 0 || s.goals.length > 0
}

async function wipeDevice(ownerId) {
  wipeLocal()
  await wipeLocalFiles().catch(() => {})
  resetMeta(ownerId)
}

async function handleUser(user) {
  if (!user) {
    set({ user: null, phase: 'signed-out', ready: true })
    return
  }
  const meta = getMeta()
  if (meta.ownerId === user.id) {
    set({ user, phase: 'idle', ready: true })
    syncNow()
    return
  }
  if (meta.ownerId && meta.ownerId !== user.id) {
    // Aparelho tinha dados de outra conta: não mistura.
    await wipeDevice(user.id)
    set({ user, phase: 'idle', ready: true })
    syncNow()
    return
  }
  const files = await allFiles().catch(() => [])
  if (hasLocalData() || files.length) {
    set({ user, phase: 'needs-import', ready: true })
    return
  }
  resetMeta(user.id)
  set({ user, phase: 'idle', ready: true })
  syncNow()
}

/** Primeiro login com dados no aparelho: enviar para a conta ou descartar. */
export async function resolveImport(send) {
  if (!state.user) return
  if (send) {
    const meta = getMeta()
    meta.ownerId = state.user.id
    meta.cursor = null
    await markAllLocal(local, meta)
    saveMeta()
  } else {
    await wipeDevice(state.user.id)
  }
  set({ phase: 'idle', pending: pending() })
  await syncNow()
}

/** Sai da conta e limpa este aparelho (os dados continuam na nuvem). */
export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  await wipeDevice(null)
  set({ user: null, phase: 'signed-out', lastSyncAt: null, error: null, pending: 0 })
}

/** Exclui a conta (anexos, registros e usuário) e limpa este aparelho. */
export async function deleteAccount() {
  if (!supabase || !state.user) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sem internet. Para excluir a conta, conecte-se.')
  await deleteAccountRemote(state.user.id)
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  await wipeDevice(null)
  set({ user: null, phase: 'signed-out', lastSyncAt: null, error: null, pending: 0 })
}

export function endRecovery() {
  set({ recovery: false })
}

let started = false
export function startSync() {
  if (started || !isConfigured) return
  started = true
  supabase.auth
    .getSession()
    .then(({ data }) => handleUser(data.session?.user ?? null))
    .catch(() => handleUser(null))
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
    const u = session?.user ?? null
    if (event === 'SIGNED_OUT') set({ user: null, phase: 'signed-out' })
    else if (u && u.id !== state.user?.id && event !== 'INITIAL_SESSION') setTimeout(() => handleUser(u), 0)
  })
  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(300))
  window.addEventListener('offline', () => state.user && set({ phase: 'offline' }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(300))
  setInterval(() => document.visibilityState === 'visible' && scheduleSync(0), 60_000)
}
