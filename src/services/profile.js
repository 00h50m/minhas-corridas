// Perfil opcional: guardado no aparelho (funciona sem conta e sem internet) e, com conta,
// na tabela `profiles` do Supabase (trecho 9 do schema.sql). Vale a alteração mais recente.
import { useSyncExternalStore } from 'react'
import { normalizeProfile } from '../lib/profile.js'
import { supabase } from './supabase.js'

const KEY = 'minhas-corridas:perfil'
const MAX_AVATAR = 320

// { data, avatar (data URL | null), updatedAt, dirty, remoteError }
let state = read()
const listeners = new Set()

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw) return { data: normalizeProfile(raw.data), avatar: typeof raw.avatar === 'string' && raw.avatar.startsWith('data:image/') ? raw.avatar : null, updatedAt: raw.updatedAt ?? null, dirty: !!raw.dirty, remoteError: null }
  } catch {
    /* armazenamento indisponível */
  }
  return { data: normalizeProfile(null), avatar: null, updatedAt: null, dirty: false, remoteError: null }
}

function write(next, { notifyOnly = false } = {}) {
  state = next
  if (!notifyOnly) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ data: state.data, avatar: state.avatar, updatedAt: state.updatedAt, dirty: state.dirty }))
    } catch {
      throw new Error('Não foi possível salvar o perfil: o armazenamento do navegador está cheio ou bloqueado.')
    }
  }
  for (const l of listeners) l()
}

export const getProfile = () => state
export function useProfile() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getProfile)
}

let onChange = null
/** A sincronização registra aqui o que fazer depois de uma alteração local. */
export function onProfileChange(fn) {
  onChange = fn
}

export function saveProfile(data) {
  write({ ...state, data: normalizeProfile(data), updatedAt: new Date().toISOString(), dirty: true })
  onChange?.()
}

/** Reduz a foto para no máximo 320 px (JPEG) e guarda como data URL. */
export async function setAvatarFromFile(file) {
  if (!/^image\//.test(file?.type || '')) throw new Error('Escolha uma imagem (JPG, PNG ou WEBP).')
  if (file.size > 20 * 1024 * 1024) throw new Error('Imagem grande demais (máx. 20 MB).')
  let bmp
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.')
  }
  // Recorte quadrado no centro
  const side = Math.min(bmp.width, bmp.height)
  const size = Math.min(MAX_AVATAR, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  write({ ...state, avatar: url, updatedAt: new Date().toISOString(), dirty: true })
  onChange?.()
}

export function removeAvatar() {
  write({ ...state, avatar: null, updatedAt: new Date().toISOString(), dirty: true })
  onChange?.()
}

/** Ao sair da conta: limpa o perfil deste aparelho (ele continua na conta). */
export function wipeLocalProfile() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nada */
  }
  write({ data: normalizeProfile(null), avatar: null, updatedAt: null, dirty: false, remoteError: null }, { notifyOnly: true })
}

/** Restauração de backup. */
export function replaceProfile(p) {
  if (!p) return
  write({ ...state, data: normalizeProfile(p.data), avatar: typeof p.avatar === 'string' && p.avatar.startsWith('data:image/') ? p.avatar : null, updatedAt: new Date().toISOString(), dirty: true })
  onChange?.()
}

function tableMissing(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01' || /profiles/.test(error?.message || '')
}

/**
 * Sincroniza com a conta: baixa se a nuvem for mais nova; envia se o aparelho tiver
 * alteração pendente mais nova. Sem a tabela, guarda o aviso e segue só no aparelho.
 */
export async function syncProfile(userId) {
  if (!supabase || !userId) return
  const { data: row, error } = await supabase.from('profiles').select('data,avatar,updated_at').eq('user_id', userId).maybeSingle()
  if (error) {
    write({ ...state, remoteError: tableMissing(error) ? 'sql' : error.message }, { notifyOnly: true })
    return
  }
  const localAt = state.updatedAt ? Date.parse(state.updatedAt) : 0
  const remoteAt = row?.updated_at ? Date.parse(row.updated_at) : 0
  if (row && remoteAt >= localAt && !(state.dirty && localAt > remoteAt)) {
    write({ data: normalizeProfile(row.data), avatar: row.avatar || null, updatedAt: row.updated_at, dirty: false, remoteError: null })
    return
  }
  if (state.dirty || (!row && state.updatedAt)) {
    const at = state.updatedAt || new Date().toISOString()
    const { error: e2 } = await supabase.from('profiles').upsert({ user_id: userId, data: state.data, avatar: state.avatar, updated_at: at }, { onConflict: 'user_id' })
    if (e2) {
      write({ ...state, remoteError: tableMissing(e2) ? 'sql' : e2.message }, { notifyOnly: true })
      return
    }
    write({ ...state, dirty: false, remoteError: null })
  } else if (state.remoteError) write({ ...state, remoteError: null }, { notifyOnly: true })
}

// Outras abas
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) write(read(), { notifyOnly: true })
  })
}
