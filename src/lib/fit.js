// Leitor mínimo de arquivos FIT (formato binário dos relógios Garmin e outros),
// escrito a partir da especificação pública do protocolo. Lê só o necessário:
// pontos (record), voltas (lap) e resumo (session).

const FIT_EPOCH = 631065600 // 31/12/1989 00:00 UTC, em segundos Unix

const MESG = { RECORD: 20, LAP: 19, SESSION: 18 }

// Tamanho e leitura de cada tipo base; `invalid` = valor que significa "sem dado".
const BASE = {
  0x00: { size: 1, read: (v, o) => v.getUint8(o), invalid: 0xff },
  0x01: { size: 1, read: (v, o) => v.getInt8(o), invalid: 0x7f },
  0x02: { size: 1, read: (v, o) => v.getUint8(o), invalid: 0xff },
  0x83: { size: 2, read: (v, o, le) => v.getInt16(o, le), invalid: 0x7fff },
  0x84: { size: 2, read: (v, o, le) => v.getUint16(o, le), invalid: 0xffff },
  0x85: { size: 4, read: (v, o, le) => v.getInt32(o, le), invalid: 0x7fffffff },
  0x86: { size: 4, read: (v, o, le) => v.getUint32(o, le), invalid: 0xffffffff },
  0x88: { size: 4, read: (v, o, le) => v.getFloat32(o, le), invalid: NaN },
  0x89: { size: 8, read: (v, o, le) => v.getFloat64(o, le), invalid: NaN },
  0x0a: { size: 1, read: (v, o) => v.getUint8(o), invalid: 0 },
  0x8b: { size: 2, read: (v, o, le) => v.getUint16(o, le), invalid: 0 },
  0x8c: { size: 4, read: (v, o, le) => v.getUint32(o, le), invalid: 0 }
}

/** Campos que interessam, por mensagem: número do campo → [nome, escala, deslocamento]. */
const FIELDS = {
  [MESG.RECORD]: { 253: ['timestamp', 1, 0], 5: ['distance', 100, 0], 3: ['heartRate', 1, 0], 2: ['altitude', 5, 500], 78: ['enhancedAltitude', 5, 500] },
  [MESG.LAP]: { 253: ['timestamp', 1, 0], 7: ['totalElapsedTime', 1000, 0], 8: ['totalTimerTime', 1000, 0], 9: ['totalDistance', 100, 0] },
  [MESG.SESSION]: { 253: ['timestamp', 1, 0], 2: ['startTime', 1, 0], 5: ['sport', 1, 0], 7: ['totalElapsedTime', 1000, 0], 8: ['totalTimerTime', 1000, 0], 9: ['totalDistance', 100, 0], 16: ['avgHeartRate', 1, 0], 17: ['maxHeartRate', 1, 0], 22: ['totalAscent', 1, 0] }
}

function fail(msg) {
  throw new Error(msg)
}

/** Decodifica um arquivo FIT. Retorna { records, laps, sessions } com valores já em unidades (s, m, bpm). */
export function decodeFit(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const out = { records: [], laps: [], sessions: [] }
  if (u8.length < 14) fail('Este arquivo não é um FIT válido.')
  let pos = 0
  // Um arquivo pode ter vários blocos FIT encadeados.
  while (pos + 12 <= u8.length) {
    const headerSize = u8[pos]
    if (headerSize !== 12 && headerSize !== 14) fail('Arquivo FIT inválido (cabeçalho).')
    if (String.fromCharCode(u8[pos + 8], u8[pos + 9], u8[pos + 10], u8[pos + 11]) !== '.FIT') fail('Este arquivo não é um FIT.')
    const dataSize = view.getUint32(pos + 4, true)
    const end = pos + headerSize + dataSize
    if (end > u8.length) fail('Arquivo FIT incompleto ou corrompido.')
    readBlock(view, pos + headerSize, end, out)
    pos = end + 2 // CRC do bloco
  }
  return out
}

function readBlock(view, start, end, out) {
  const defs = new Map()
  let p = start
  let lastTimestamp = null
  while (p < end) {
    const h = view.getUint8(p++)
    let local
    let compressedOffset = null
    if (h & 0x80) {
      // Cabeçalho de timestamp comprimido.
      local = (h >> 5) & 0x03
      compressedOffset = h & 0x1f
    } else if (h & 0x40) {
      // Mensagem de definição.
      local = h & 0x0f
      const hasDev = (h & 0x20) !== 0
      p++ // reservado
      const le = view.getUint8(p++) === 0
      const global = view.getUint16(p, le)
      p += 2
      const n = view.getUint8(p++)
      const fields = []
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: view.getUint8(p), size: view.getUint8(p + 1), type: view.getUint8(p + 2) })
      let devSize = 0
      if (hasDev) {
        const nd = view.getUint8(p++)
        for (let i = 0; i < nd; i++, p += 3) devSize += view.getUint8(p + 1)
      }
      defs.set(local, { le, global, fields, devSize })
      continue
    } else {
      local = h & 0x0f
    }
    const def = defs.get(local)
    if (!def) fail('Arquivo FIT corrompido (mensagem sem definição).')
    const want = FIELDS[def.global]
    const msg = want ? {} : null
    for (const f of def.fields) {
      if (want && want[f.num]) {
        const base = BASE[f.type] ?? BASE[f.type & 0x9f]
        if (base && f.size >= base.size) {
          const raw = base.read(view, p, def.le)
          const isInvalid = Number.isNaN(base.invalid) ? !Number.isFinite(raw) : raw === base.invalid
          if (!isInvalid) {
            const [name, scale, offset] = want[f.num]
            msg[name] = raw / scale - offset
          }
        }
      }
      if (f.num === 253 && f.size === 4) {
        const ts = view.getUint32(p, def.le)
        if (ts !== 0xffffffff) lastTimestamp = ts
      }
      p += f.size
    }
    p += def.devSize
    if (compressedOffset != null && lastTimestamp != null) {
      let ts = (lastTimestamp & ~0x1f) + compressedOffset
      if (compressedOffset < (lastTimestamp & 0x1f)) ts += 0x20
      lastTimestamp = ts
      if (msg) msg.timestamp = ts
    }
    if (!msg) continue
    for (const k of ['timestamp', 'startTime']) if (msg[k] != null) msg[k] = (msg[k] + FIT_EPOCH) * 1000
    if (def.global === MESG.RECORD) out.records.push(msg)
    else if (def.global === MESG.LAP) out.laps.push(msg)
    else out.sessions.push(msg)
  }
}

/* ---------- ZIP (o "Exportar original" do Garmin Connect vem zipado) ---------- */

/** Extrai o primeiro arquivo .fit de um ZIP. Usa DecompressionStream (navegador e Node 18+). */
export async function fitFromZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás para frente.
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) fail('Não consegui abrir o arquivo .ZIP.')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) fail('Arquivo .ZIP corrompido.')
    const method = v.getUint16(p + 10, true)
    const compSize = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const localOff = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/\.fit$/i.test(name)) continue
    const lNameLen = v.getUint16(localOff + 26, true)
    const lExtraLen = v.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const data = u8.subarray(dataStart, dataStart + compSize)
    if (method === 0) return data
    if (method !== 8) fail('Compactação do .ZIP não suportada.')
    if (typeof DecompressionStream !== 'function') fail('Este navegador não abre .ZIP. Exporte a atividade em TCX ou GPX.')
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  fail('O .ZIP não tem nenhum arquivo .FIT dentro.')
}
