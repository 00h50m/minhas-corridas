// Arquivo FIT de treino (separado para não pesar o carregamento inicial do app).
import { STEP_BY_ID } from './workout.js'

/* ---------- Arquivo FIT de TREINO (para copiar no relógio) ---------- */
// Gerador mínimo, a partir da especificação pública do FIT (o SDK oficial confere nos testes).
// Arquivo de treino ≠ arquivo de atividade: aqui vai o que fazer, não o que foi feito.

const FIT_EPOCH = 631065600
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400]
export function fitCrc(bytes, crc = 0) {
  for (const b of bytes) {
    let t = CRC_TABLE[crc & 0xf]
    crc = ((crc >> 4) & 0x0fff) ^ t ^ CRC_TABLE[b & 0xf]
    t = CRC_TABLE[crc & 0xf]
    crc = ((crc >> 4) & 0x0fff) ^ t ^ CRC_TABLE[(b >> 4) & 0xf]
  }
  return crc
}

// Tipos base do FIT
const ENUM = 0x00
const U16 = 0x84
const U32 = 0x86
const U32Z = 0x8c
const STRING = 0x07
const SIZE = { [ENUM]: 1, [U16]: 2, [U32]: 4, [U32Z]: 4 }
const INVALID = { [ENUM]: 0xff, [U16]: 0xffff, [U32]: 0xffffffff, [U32Z]: 0 }

const DURATION = { time: 0, distance: 1, lap: 5, repeat: 6 }
const TARGET = { pace: 0, hr: 1, none: 2 }
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 }

/** Texto em UTF-8 com no máximo `size - 1` bytes (sem cortar um caractere ao meio) + zeros. */
function fitString(s, size) {
  const out = new Uint8Array(size)
  let n = 0
  for (const ch of String(s || '')) {
    const b = new TextEncoder().encode(ch)
    if (n + b.length > size - 1) break
    out.set(b, n)
    n += b.length
  }
  return out
}

/** Velocidade em mm/s (unidade do FIT) para um pace em s/km. */
const paceToMmS = (secPerKm) => Math.round((1000 / secPerKm) * 1000)

/** Passos no formato do relógio (repetição = passo "voltar ao passo X, N vezes"). */
export function fitSteps(items) {
  const out = []
  const name = (s) => s.name || STEP_BY_ID[s.type].label.replace(' (parado)', '')
  const one = (s) => {
    const st = { name: name(s), durationType: DURATION[s.duration.kind], durationValue: null, targetType: TARGET[s.target.kind], targetValue: 0, low: null, high: null, intensity: INTENSITY[STEP_BY_ID[s.type].intensity] }
    if (s.duration.kind === 'time') st.durationValue = s.duration.value * 1000
    if (s.duration.kind === 'distance') st.durationValue = s.duration.value * 100
    if (s.target.kind === 'pace') {
      st.low = paceToMmS(s.target.max) // velocidade menor = pace mais lento
      st.high = paceToMmS(s.target.min)
    } else if (s.target.kind === 'hr') {
      st.low = s.target.min + 100 // bpm: o FIT soma 100 (0–100 seria % da FC máxima)
      st.high = s.target.max + 100
    } else st.targetValue = null
    return st
  }
  for (const it of items) {
    if (it.kind === 'repeat') {
      const start = out.length
      it.steps.forEach((s) => out.push(one(s)))
      out.push({ name: '', durationType: DURATION.repeat, durationValue: start, targetType: TARGET.none, targetValue: it.times, low: null, high: null, intensity: null })
    } else out.push(one(it))
  }
  return out
}

/** Gera o .FIT do treino. Retorna Uint8Array. */
export function workoutToFit(w, now = new Date()) {
  const chunks = []
  let local = 0
  const defs = []
  const define = (global, fields) => {
    const lt = local++
    const head = [0x40 | lt, 0, 0, global & 0xff, global >> 8, fields.length]
    for (const [num, base, size] of fields) head.push(num, size ?? SIZE[base], base)
    chunks.push(Uint8Array.from(head))
    defs[lt] = fields
    return lt
  }
  const data = (lt, values) => {
    const fields = defs[lt]
    const len = 1 + fields.reduce((s, [, base, size]) => s + (size ?? SIZE[base]), 0)
    const buf = new Uint8Array(len)
    const v = new DataView(buf.buffer)
    buf[0] = lt
    let p = 1
    fields.forEach(([, base, size], i) => {
      const x = values[i]
      if (base === STRING) buf.set(fitString(x, size), p)
      else {
        const val = x == null ? INVALID[base] : x
        if (SIZE[base] === 1) v.setUint8(p, val)
        else if (SIZE[base] === 2) v.setUint16(p, val, true)
        else v.setUint32(p, val, true)
      }
      p += size ?? SIZE[base]
    })
    chunks.push(buf)
  }

  const steps = fitSteps(w.items)
  const created = Math.max(0, Math.floor(now.getTime() / 1000) - FIT_EPOCH)
  // file_id: tipo 5 = treino; fabricante 255 = desenvolvimento
  data(define(0, [[0, ENUM], [1, U16], [2, U16], [3, U32Z], [4, U32]]), [5, 255, 0, (created % 0xfffffff0) + 1, created])
  // workout: esporte 1 = corrida
  data(define(26, [[4, ENUM], [11, ENUM], [6, U16], [8, STRING, 32]]), [1, 0, steps.length, w.name || 'Treino PaceOn'])
  const lt = define(27, [[254, U16], [0, STRING, 20], [1, ENUM], [2, U32], [3, ENUM], [4, U32], [5, U32], [6, U32], [7, ENUM]])
  steps.forEach((s, i) => data(lt, [i, s.name, s.durationType, s.durationValue, s.targetType, s.targetValue, s.low, s.high, s.intensity]))

  const body = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
  let o = 0
  for (const c of chunks) { body.set(c, o); o += c.length }
  const header = new Uint8Array(14)
  const hv = new DataView(header.buffer)
  header[0] = 14
  header[1] = 0x20 // protocolo 2.0
  hv.setUint16(2, 2132, true) // versão do perfil 21.32
  hv.setUint32(4, body.length, true)
  header.set([0x2e, 0x46, 0x49, 0x54], 8) // ".FIT"
  hv.setUint16(12, fitCrc(header.subarray(0, 12)), true)
  const file = new Uint8Array(14 + body.length + 2)
  file.set(header, 0)
  file.set(body, 14)
  const crc = fitCrc(file.subarray(0, 14 + body.length))
  file[file.length - 2] = crc & 0xff
  file[file.length - 1] = crc >> 8
  return file
}

/** Nome de arquivo curto e seguro para o relógio (ex.: PACEON-6X800.FIT). */
export function fitFileName(w) {
  const base = (w.name || 'treino').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'TREINO'
  return `PACEON-${base}.FIT`
}
