// Anexos e fotos no IndexedDB do navegador (arquivos não cabem no localStorage).
import { useEffect, useState } from 'react'
import { newId } from '../lib/model.js'

const DB_NAME = 'minhas-corridas-arquivos'
const STORE = 'files'

export const FILE_KINDS = [
  { id: 'comprovante', label: 'Comprovante' },
  { id: 'regulamento', label: 'Regulamento' },
  { id: 'imagem', label: 'Imagem da prova' },
  { id: 'outro', label: 'Outro' },
  { id: 'foto', label: 'Foto da prova' }
]
export const FILE_KIND_LABEL = Object.fromEntries(FILE_KINDS.map((k) => [k.id, k.label]))

export const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPTED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/

let dbPromise = null
function openDB() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Este navegador não permite guardar arquivos.'))
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('raceId', 'raceId')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(new Error('Não foi possível abrir o armazenamento de arquivos.'))
      }
    })
  }
  return dbPromise
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const os = t.objectStore(STORE)
        let result
        Promise.resolve(fn(os, (v) => (result = v))).catch(reject)
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error?.name === 'QuotaExceededError' ? new Error('Sem espaço no aparelho para guardar o arquivo.') : new Error('Falha ao acessar os arquivos.'))
        t.onabort = t.onerror
      })
  )
}

const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })

/* Notificação para os componentes recarregarem a lista. */
const listeners = new Set()
function changed() {
  for (const l of listeners) l()
}

/** Reduz fotos grandes para economizar espaço (máx. 1600 px, JPEG). */
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 900 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function checkFile(file) {
  if (!ACCEPTED.test(file.type)) return 'Formato não aceito. Use imagem (JPG, PNG, WEBP, HEIC) ou PDF.'
  if (file.size > MAX_FILE_BYTES) return `“${file.name}” passa de 15 MB.`
  return null
}

export async function addFile(raceId, kind, file) {
  const problem = checkFile(file)
  if (problem) throw new Error(problem)
  const f = await shrinkImage(file)
  const rec = { id: newId(), raceId, kind, name: f.name || 'arquivo', type: f.type, size: f.size, createdAt: new Date().toISOString(), blob: f }
  await tx('readwrite', (os) => os.put(rec))
  // Pede ao navegador para não apagar os dados sob pressão de espaço.
  navigator.storage?.persist?.().catch(() => {})
  changed()
  return rec
}

export async function listFiles(raceId) {
  const all = await tx('readonly', async (os, set) => set(await req2p(os.index('raceId').getAll(raceId))))
  return (all ?? []).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

export async function deleteFile(id) {
  await tx('readwrite', (os) => os.delete(id))
  changed()
}

export async function deleteFilesOfRace(raceId) {
  if (!globalThis.indexedDB) return
  const list = await listFiles(raceId)
  if (!list.length) return
  await tx('readwrite', (os) => list.forEach((f) => os.delete(f.id)))
  changed()
}

export async function allFiles() {
  if (!globalThis.indexedDB) return []
  return (await tx('readonly', async (os, set) => set(await req2p(os.getAll())))) ?? []
}

export async function clearFiles() {
  if (!globalThis.indexedDB) return
  await tx('readwrite', (os) => os.clear())
  changed()
}

/** Substitui todos os arquivos (restauração de backup com anexos). */
export async function replaceFiles(records) {
  await tx('readwrite', (os) => {
    os.clear()
    records.forEach((r) => os.put(r))
  })
  changed()
}

/** Remove arquivos de corridas que não existem mais. */
export async function pruneFiles(raceIds) {
  const keep = new Set(raceIds)
  const all = await allFiles()
  const gone = all.filter((f) => !keep.has(f.raceId))
  if (!gone.length) return 0
  await tx('readwrite', (os) => gone.forEach((f) => os.delete(f.id)))
  changed()
  return gone.length
}

export async function filesUsage() {
  const all = await allFiles()
  return { count: all.length, bytes: all.reduce((s, f) => s + (f.size || 0), 0) }
}

/** Lista de arquivos de uma corrida, com recarga automática. */
export function useRaceFiles(raceId) {
  const [state, setState] = useState({ status: 'loading', files: [], error: null })
  useEffect(() => {
    let alive = true
    const load = () =>
      listFiles(raceId)
        .then((files) => alive && setState({ status: 'ready', files, error: null }))
        .catch((e) => alive && setState({ status: 'error', files: [], error: e.message }))
    load()
    listeners.add(load)
    return () => {
      alive = false
      listeners.delete(load)
    }
  }, [raceId])
  return state
}

/** URL temporária para exibir um blob; liberada ao desmontar. */
export function useObjectURL(blob) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/* Conversão para o backup em JSON. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Falha ao ler um anexo.'))
    r.readAsDataURL(blob)
  })
}

export function base64ToBlob(b64, type) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
