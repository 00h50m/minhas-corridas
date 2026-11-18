// Registros únicos sincronizados com a conta (um por tipo, id 'main'): o ciclo menstrual e a conexão
// do Garmin (sono, body battery, relatório). Guardados no aparelho em localStorage e enviados pela
// sincronização como os outros registros (kind 'cycle' e 'garmin'). Leve: não puxa o serviço do Garmin.
// A chave pessoal do Garmin é uma credencial: NUNCA sai do aparelho (fica fora do registro sincronizado).
import { noteDeleted, noteSaved } from './syncMeta.js'

export const KV_KINDS = { cycle: 'minhas-corridas:ciclo', garmin: 'minhas-corridas:garmin' }
export const KV_ID = 'main'
export const KV_EVENT = 'paceon-kv' // detail: { kind, remote }

function read(kind) {
  try {
    const v = JSON.parse(localStorage.getItem(KV_KINDS[kind]) || 'null')
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

function emit(kind, remote) {
  try { window.dispatchEvent(new CustomEvent(KV_EVENT, { detail: { kind, remote } })) } catch { /* fora do navegador */ }
}

/** Campos que só valem neste aparelho (credenciais). */
const LOCAL_ONLY = { garmin: ['key'] }
const shareable = (kind, v) => Object.fromEntries(Object.entries(v).filter(([k]) => !(LOCAL_ONLY[kind] ?? []).includes(k)))

/** O registro como vai para a nuvem (sem credenciais), com id e updatedAt, ou null. */
export function getKV(kind) {
  const v = read(kind)
  return v ? { ...shareable(kind, v), id: KV_ID, updatedAt: v.updatedAt ?? null } : null
}

/** O registro completo deste aparelho (inclui a chave do Garmin). */
export function getLocalKV(kind) {
  return read(kind)
}

/** Grava (ou apaga, com null) e marca para sincronizar. */
export function setKV(kind, data, { sync = true } = {}) {
  try {
    if (data) localStorage.setItem(KV_KINDS[kind], JSON.stringify({ ...data, updatedAt: new Date().toISOString() }))
    else localStorage.removeItem(KV_KINDS[kind])
  } catch { /* sem espaço: vale nesta sessão */ }
  if (sync) (data ? noteSaved : noteDeleted)(kind, KV_ID)
  emit(kind, false)
}

/** Alterações vindas da nuvem (não marca como pendente). */
export function applyRemoteKV({ upserts = [], deletes = [] }) {
  for (const u of upserts) {
    if (!KV_KINDS[u.kind] || !u.data) continue
    // Mantém as credenciais deste aparelho (a nuvem nunca as tem).
    const mine = read(u.kind) ?? {}
    const keep = Object.fromEntries((LOCAL_ONLY[u.kind] ?? []).filter((k) => mine[k] != null).map((k) => [k, mine[k]]))
    const { id, ...data } = u.data
    try { localStorage.setItem(KV_KINDS[u.kind], JSON.stringify({ ...shareable(u.kind, data), ...keep })) } catch { /* sem espaço */ }
    emit(u.kind, true)
  }
  for (const d of deletes) {
    if (!KV_KINDS[d.kind]) continue
    try { localStorage.removeItem(KV_KINDS[d.kind]) } catch { /* nada */ }
    emit(d.kind, true)
  }
}

export function listKV(kind) {
  const v = getKV(kind)
  return v ? [v] : []
}

/** Ao sair da conta / apagar o aparelho: some daqui sem gerar exclusão na nuvem. */
export function wipeKV() {
  for (const kind of Object.keys(KV_KINDS)) {
    try { localStorage.removeItem(KV_KINDS[kind]) } catch { /* nada */ }
    emit(kind, true)
  }
}
