import { describe, it, expect, beforeEach } from 'vitest'
import { emptyMeta, markAllLocal, markDeleted, markDirty, pendingCount, syncOnce } from './syncEngine.js'

// Servidor em memória com a mesma regra do SQL: grava só se client_updated_at não for mais antigo.
function memoryServer() {
  const rows = new Map()
  const blobs = new Map()
  let clock = Date.parse('2026-11-01T00:00:00Z')
  const tick = () => new Date((clock += 1000)).toISOString()
  return {
    rows,
    blobs,
    remote: (userId) => ({
      async push(batch) {
        const accepted = []
        for (const r of batch) {
          const k = `${userId}|${r.kind}|${r.id}`
          const old = rows.get(k)
          if (old && Date.parse(r.client_updated_at) < Date.parse(old.client_updated_at)) continue
          const row = { ...structuredClone(r), user_id: userId, updated_at: tick() }
          rows.set(k, row)
          accepted.push(row)
        }
        return accepted
      },
      async pull(since) {
        return [...rows.values()].filter((r) => r.user_id === userId && (!since || Date.parse(r.updated_at) > Date.parse(since))).map((r) => structuredClone(r))
      },
      async fetch(keys) {
        return keys.map((k) => rows.get(`${userId}|${k.kind}|${k.id}`)).filter(Boolean).map((r) => structuredClone(r))
      },
      async uploadBlob(path, blob) {
        if (!path.startsWith(userId + '/')) throw new Error('RLS')
        blobs.set(path, blob)
      },
      async downloadBlob(path) {
        if (!blobs.has(path)) throw new Error('404')
        return blobs.get(path)
      },
      async removeBlob(path) {
        blobs.delete(path)
      }
    })
  }
}

// Aparelho em memória.
function device(server, userId) {
  const data = { race: new Map(), goal: new Map(), file: new Map() }
  const blobs = new Map()
  const meta = emptyMeta()
  const local = {
    async get(kind, id) {
      return data[kind].get(id) ?? null
    },
    async list(kind) {
      return [...data[kind].values()]
    },
    async applyRemote({ upserts, deletes }) {
      for (const u of upserts) data[u.kind].set(u.id, structuredClone(u.data))
      for (const d of deletes) {
        data[d.kind].delete(d.id)
        if (d.kind === 'file') blobs.delete(d.id)
      }
    },
    async getBlob(id) {
      return blobs.get(id) ?? null
    },
    async setBlob(id, b) {
      blobs.set(id, b)
    },
    async filesMissingBlob() {
      return [...data.file.values()].filter((f) => !blobs.has(f.id))
    }
  }
  let t = Date.parse('2026-11-02T10:00:00Z')
  const stamp = () => new Date((t += 60_000)).toISOString()
  return {
    data,
    blobs,
    meta,
    local,
    save(kind, obj) {
      const rec = { ...obj, updatedAt: stamp() }
      data[kind].set(obj.id, rec)
      markDirty(meta, kind, obj.id)
      return rec
    },
    del(kind, id) {
      data[kind].delete(id)
      markDeleted(meta, kind, id, stamp())
    },
    addFile(id, raceId, content) {
      const rec = { id, raceId, kind: 'foto', name: id + '.jpg', type: 'image/jpeg', size: content.length, createdAt: stamp() }
      data.file.set(id, rec)
      blobs.set(id, content)
      markDirty(meta, 'file', id)
    },
    skew(minutes) {
      t += minutes * 60_000
    },
    sync() {
      return syncOnce({ remote: server.remote(userId), local, meta, userId, saveMeta: () => {} })
    }
  }
}

describe('sincronização entre aparelhos', () => {
  let server, note, phone
  beforeEach(() => {
    server = memoryServer()
    note = device(server, 'u1')
    phone = device(server, 'u1')
    phone.skew(5) // relógios um pouco diferentes
  })

  it('cadastro no notebook aparece no celular', async () => {
    note.save('race', { id: 'r1', name: 'Meia de Jundiaí' })
    note.save('goal', { id: 'g1', title: 'Sub 30' })
    await note.sync()
    expect(pendingCount(note.meta)).toBe(0)
    const s = await phone.sync()
    expect(s.pulled).toBe(2)
    expect(phone.data.race.get('r1').name).toBe('Meia de Jundiaí')
    expect(phone.data.goal.get('g1').title).toBe('Sub 30')
  })

  it('edição e exclusão propagam; nova sincronização não repete', async () => {
    note.save('race', { id: 'r1', name: 'A' })
    await note.sync()
    await phone.sync()
    phone.save('race', { id: 'r1', name: 'A editada' })
    await phone.sync()
    await note.sync()
    expect(note.data.race.get('r1').name).toBe('A editada')
    note.skew(30) // a exclusão acontece depois da edição
    note.del('race', 'r1')
    await note.sync()
    await phone.sync()
    expect(phone.data.race.has('r1')).toBe(false)
    expect((await phone.sync()).pulled).toBe(0)
  })

  it('conflito: a alteração mais recente vence nos dois aparelhos', async () => {
    note.save('race', { id: 'r1', name: 'Original' })
    await note.sync()
    await phone.sync()
    note.save('race', { id: 'r1', name: 'Do notebook' }) // 10:02
    phone.save('race', { id: 'r1', name: 'Do celular' }) // 10:07 (mais nova)
    await phone.sync()
    const s = await note.sync() // notebook tenta enviar versão mais antiga: recusada
    expect(s.rejected).toBe(1)
    expect(note.data.race.get('r1').name).toBe('Do celular')
    expect(pendingCount(note.meta)).toBe(0)
    await phone.sync()
    expect(phone.data.race.get('r1').name).toBe('Do celular')
  })

  it('exclusão mais antiga não apaga edição mais nova', async () => {
    note.save('race', { id: 'r1', name: 'X' })
    await note.sync()
    await phone.sync()
    note.del('race', 'r1') // 10:02
    phone.save('race', { id: 'r1', name: 'X editada' }) // 10:07
    await phone.sync()
    await note.sync()
    expect(note.data.race.get('r1').name).toBe('X editada')
  })

  it('anexos sobem, descem e são apagados no armazenamento', async () => {
    note.save('race', { id: 'r1', name: 'Com foto' })
    note.addFile('f1', 'r1', 'JPEGDATA')
    await note.sync()
    expect(server.blobs.get('u1/f1')).toBe('JPEGDATA')
    const s = await phone.sync()
    expect(s.downloaded).toBe(1)
    expect(phone.blobs.get('f1')).toBe('JPEGDATA')
    expect(phone.data.file.get('f1').raceId).toBe('r1')
    phone.del('file', 'f1')
    await phone.sync()
    expect(server.blobs.has('u1/f1')).toBe(false)
    await note.sync()
    expect(note.data.file.has('f1')).toBe(false)
    expect(note.blobs.has('f1')).toBe(false)
  })

  it('dados de outro usuário não aparecem', async () => {
    const other = device(server, 'u2')
    other.save('race', { id: 'r9', name: 'Da outra pessoa' })
    await other.sync()
    note.save('race', { id: 'r1', name: 'Minha' })
    await note.sync()
    expect([...note.data.race.keys()]).toEqual(['r1'])
  })

  it('primeiro login envia o que já estava no aparelho', async () => {
    note.data.race.set('old', { id: 'old', name: 'Feita antes do login', updatedAt: '2026-10-01T00:00:00Z' })
    await markAllLocal(note.local, note.meta)
    expect(pendingCount(note.meta)).toBe(1)
    await note.sync()
    await phone.sync()
    expect(phone.data.race.get('old').name).toBe('Feita antes do login')
  })

  it('falha de rede mantém as pendências para a próxima vez', async () => {
    note.save('race', { id: 'r1', name: 'Offline' })
    const broken = { ...server.remote('u1'), push: async () => { throw new Error('offline') } }
    await expect(syncOnce({ remote: broken, local: note.local, meta: note.meta, userId: 'u1', saveMeta: () => {} })).rejects.toThrow('offline')
    expect(pendingCount(note.meta)).toBe(1)
    await note.sync()
    expect(pendingCount(note.meta)).toBe(0)
  })
})
