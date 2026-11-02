// Motor de sincronização, independente do Supabase e do navegador.
//
// Modelo: o aparelho continua sendo a fonte da tela (funciona offline). Cada alteração
// local marca o registro como pendente ("dirty"); exclusões viram "lápides" (tombstones).
// Uma rodada de sincronização:
//   1. envia pendências (a última alteração vence; o servidor recusa gravações mais antigas);
//   2. busca no servidor o que mudou desde o último cursor;
//   3. baixa arquivos que ainda não estão no aparelho.
//
// remote: { pull(since), fetch(keys), push(rows), uploadBlob(path, blob), downloadBlob(path), removeBlob(path) }
// local:  { get(kind, id), list(kind), applyRemote({ upserts, deletes }), getBlob(id), setBlob(id, blob), filesMissingBlob() }
// meta:   { ownerId, cursor, dirty: { 'kind:id': true }, tombstones: { 'kind:id': iso } } + save()

export const KINDS = ['race', 'goal', 'file']
const OVERLAP_MS = 10_000 // relê uma janela para não perder gravações que confirmaram fora de ordem
const BATCH = 200

export const keyOf = (kind, id) => `${kind}:${id}`
export function splitKey(key) {
  const i = key.indexOf(':')
  return [key.slice(0, i), key.slice(i + 1)]
}
const ms = (iso) => (iso ? Date.parse(iso) : 0)

export function filePath(userId, id) {
  return `${userId}/${id}`
}

export function emptyMeta() {
  return { ownerId: null, cursor: null, dirty: {}, tombstones: {} }
}

export function markDirty(meta, kind, id) {
  meta.dirty[keyOf(kind, id)] = true
  delete meta.tombstones[keyOf(kind, id)]
}

export function markDeleted(meta, kind, id, when = new Date().toISOString()) {
  meta.dirty[keyOf(kind, id)] = true
  meta.tombstones[keyOf(kind, id)] = when
}

export function pendingCount(meta) {
  return Object.keys(meta.dirty).length
}

/** Data de "última alteração" de um registro local. */
function localStamp(kind, rec) {
  if (!rec) return null
  return kind === 'file' ? rec.updatedAt || rec.createdAt : rec.updatedAt
}

/** Uma rodada completa. Retorna um resumo para a interface. */
export async function syncOnce({ remote, local, meta, userId, saveMeta }) {
  const summary = { pushed: 0, pulled: 0, downloaded: 0, rejected: 0, failedDownloads: 0 }

  // 1) Enviar pendências
  const keys = Object.keys(meta.dirty)
  const rows = []
  const removeAfter = []
  for (const key of keys) {
    const [kind, id] = splitKey(key)
    const tomb = meta.tombstones[key]
    if (tomb) {
      rows.push({ kind, id, data: null, deleted: true, client_updated_at: tomb })
      if (kind === 'file') removeAfter.push(filePath(userId, id))
      continue
    }
    const rec = await local.get(kind, id)
    if (!rec) {
      delete meta.dirty[key]
      continue
    }
    if (kind === 'file') {
      const blob = await local.getBlob(id)
      if (!blob) {
        // Metadado chegou de outro aparelho e o arquivo ainda não baixou: nada a enviar.
        delete meta.dirty[key]
        continue
      }
      await remote.uploadBlob(filePath(userId, id), blob)
      const { blob: _b, ...data } = rec
      rows.push({ kind, id, data, deleted: false, client_updated_at: localStamp(kind, rec) })
    } else {
      rows.push({ kind, id, data: rec, deleted: false, client_updated_at: localStamp(kind, rec) })
    }
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const accepted = await remote.push(batch)
    const ok = new Set(accepted.map((r) => keyOf(r.kind, r.id)))
    const rejected = []
    for (const r of batch) {
      const key = keyOf(r.kind, r.id)
      // Só limpa se o registro não mudou de novo durante o envio.
      const stillSame = r.deleted
        ? meta.tombstones[key] === r.client_updated_at
        : !meta.tombstones[key] && localStamp(r.kind, await local.get(r.kind, r.id)) === r.client_updated_at
      if (ok.has(key)) {
        summary.pushed++
        if (stillSame) {
          delete meta.dirty[key]
          delete meta.tombstones[key]
        }
      } else {
        rejected.push({ kind: r.kind, id: r.id })
      }
    }
    if (rejected.length) {
      // O servidor tem uma versão mais nova: ela prevalece.
      summary.rejected += rejected.length
      for (const r of rejected) {
        delete meta.dirty[keyOf(r.kind, r.id)]
        delete meta.tombstones[keyOf(r.kind, r.id)]
      }
      const newer = await remote.fetch(rejected)
      await applyRows(newer, { local, meta, force: true })
    }
    saveMeta()
  }
  for (const p of removeAfter) {
    try {
      await remote.removeBlob(p)
    } catch {
      /* arquivo já removido ou sem conexão: a lápide no banco é o que importa */
    }
  }

  // 2) Buscar alterações do servidor
  const since = meta.cursor ? new Date(ms(meta.cursor) - OVERLAP_MS).toISOString() : null
  const pulled = await remote.pull(since)
  summary.pulled = await applyRows(pulled, { local, meta })
  let max = meta.cursor
  for (const r of pulled) if (!max || ms(r.updated_at) > ms(max)) max = r.updated_at
  meta.cursor = max
  saveMeta()

  // 3) Baixar arquivos que faltam
  for (const f of await local.filesMissingBlob()) {
    try {
      const blob = await remote.downloadBlob(filePath(userId, f.id))
      await local.setBlob(f.id, blob)
      summary.downloaded++
    } catch {
      summary.failedDownloads++
    }
  }
  return summary
}

/** Aplica linhas do servidor no aparelho, respeitando alterações locais mais novas. */
async function applyRows(rows, { local, meta, force = false }) {
  const upserts = []
  const deletes = []
  for (const r of rows) {
    const key = keyOf(r.kind, r.id)
    if (!KINDS.includes(r.kind)) continue
    const rec = await local.get(r.kind, r.id)
    const remoteTs = ms(r.client_updated_at)
    if (!force && meta.dirty[key]) {
      const mine = meta.tombstones[key] ?? localStamp(r.kind, rec)
      if (ms(mine) > remoteTs) continue // a minha é mais nova; será enviada
      delete meta.dirty[key]
      delete meta.tombstones[key]
    }
    if (r.deleted) {
      if (rec) deletes.push({ kind: r.kind, id: r.id })
      continue
    }
    if (!r.data) continue
    if (!rec || force || remoteTs > ms(localStamp(r.kind, rec))) upserts.push({ kind: r.kind, id: r.id, data: r.data })
  }
  if (upserts.length || deletes.length) await local.applyRemote({ upserts, deletes })
  return upserts.length + deletes.length
}

/** Marca tudo o que está no aparelho para envio (primeiro login com dados locais). */
export async function markAllLocal(local, meta) {
  for (const kind of KINDS) {
    for (const rec of await local.list(kind)) markDirty(meta, kind, rec.id)
  }
}
