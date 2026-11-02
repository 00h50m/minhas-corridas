import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { Encoder, Profile } from '@garmin/fitsdk'
import { decodeFit, fitFromZip } from './fit.js'
import { parseFitActivity, readActivityFile } from './activityFile.js'

// Atividade de 5,08 km gerada com o codificador OFICIAL do Garmin (só nos testes).
function officialFit() {
  const enc = new Encoder()
  const start = new Date('2026-10-12T10:00:00Z')
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: start, type: 'activity' })
  let t = start.getTime()
  for (let d = 0; d <= 5080; d += 20) {
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t), distance: d, heartRate: 150 + Math.floor(d / 1000) * 2, enhancedAltitude: 700 + (d % 1000) / 100 })
    t += d >= 3000 && d < 4000 ? 7800 : 7200 // 6:00/km; km 4 a 6:30/km
  }
  const end = new Date(t - 7200)
  const total = (end - start) / 1000
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: end, startTime: start, totalElapsedTime: total, totalTimerTime: total, totalDistance: 5080 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: end, startTime: start, sport: 'running', totalElapsedTime: total, totalTimerTime: total, totalDistance: 5080, avgHeartRate: 155, maxHeartRate: 162, totalAscent: 42 })
  return enc.close()
}

// Arquivo montado byte a byte: campos de desenvolvedor e timestamp comprimido.
function handmadeFit() {
  const b = []
  const u8 = (x) => b.push(x & 0xff)
  const u16 = (x) => { u8(x); u8(x >> 8) }
  const u32 = (x) => { u16(x & 0xffff); u16(x >>> 16) }
  // definição local 0: record com timestamp(253,u32), distance(5,u32) + 1 campo de desenvolvedor de 2 bytes
  u8(0x60); u8(0); u8(0); u16(20); u8(2); u8(253); u8(4); u8(0x86); u8(5); u8(4); u8(0x86); u8(1); u8(0); u8(2); u8(0)
  const t0 = 1_100_000_000
  u8(0x00); u32(t0); u32(0); u16(0xabcd) // dado + 2 bytes de desenvolvedor
  // definição local 1: record só com distance (para timestamp comprimido)
  u8(0x41); u8(0); u8(0); u16(20); u8(1); u8(5); u8(4); u8(0x86)
  // cabeçalho comprimido: bit7, local 1, offset de tempo = (t0 + 30) & 31
  const ts1 = t0 + 30
  u8(0x80 | (1 << 5) | (ts1 & 0x1f)); u32(10000) // 100 m
  const ts2 = t0 + 50 // 20 s depois, cruzando a virada de 32 s (o formato só permite saltos de até 31 s)
  u8(0x80 | (1 << 5) | (ts2 & 0x1f)); u32(25000)
  const data = Uint8Array.from(b)
  const head = new Uint8Array(14)
  const hv = new DataView(head.buffer)
  head[0] = 14; head[1] = 0x20; hv.setUint16(2, 2100, true); hv.setUint32(4, data.length, true); head.set([46, 70, 73, 84], 8)
  return Uint8Array.from([...head, ...data, 0, 0])
}

function zip(name, content) {
  const comp = deflateRawSync(content)
  const nameB = Buffer.from(name)
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameB.length, 26)
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(nameB.length, 28); central.writeUInt32LE(0, 42)
  const cdOffset = local.length + nameB.length + comp.length
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + nameB.length, 12); eocd.writeUInt32LE(cdOffset, 16)
  return new Uint8Array(Buffer.concat([local, nameB, comp, central, nameB, eocd]))
}

describe('arquivo .FIT', () => {
  it('lê arquivo gerado pelo codificador oficial do Garmin', () => {
    const a = parseFitActivity(officialFit(), 'corrida.fit')
    expect(a.source).toBe('fit')
    expect(a.sport).toBe('running')
    expect(a.distanceKm).toBe(5.08)
    expect(a.avgHr).toBe(155)
    expect(a.maxHr).toBe(162)
    expect(a.elevGainM).toBe(42)
    expect(a.splits.slice(0, 5).map((s) => s.sec)).toEqual([360, 360, 360, 390, 360])
    expect(a.splits.length).toBe(5) // os 80 m finais (menos de 100 m) não viram parcial
  })
  it('timestamp comprimido e campos de desenvolvedor', () => {
    const { records } = decodeFit(handmadeFit())
    const base = (1_100_000_000 + 631065600) * 1000
    expect(records.map((r) => [(r.timestamp - base) / 1000, r.distance])).toEqual([[0, 0], [30, 100], [50, 250]])
  })
  it('extrai o .FIT de dentro do .ZIP do Garmin', async () => {
    const z = zip('12345678_ACTIVITY.fit', officialFit())
    expect((await fitFromZip(z)).length).toBeGreaterThan(1000)
    const file = new File([z], 'atividade.zip')
    const a = await readActivityFile(file)
    expect(a).toMatchObject({ source: 'fit', distanceKm: 5.08, fileName: 'atividade.fit' })
  })
  it('recusa arquivos que não são FIT, com mensagem clara', async () => {
    expect(() => decodeFit(new TextEncoder().encode('isto não é um arquivo fit...'))).toThrow(/não é um FIT|inválido/)
    await expect(fitFromZip(new Uint8Array(40))).rejects.toThrow(/ZIP/)
    await expect(readActivityFile(new File([zip('leia-me.txt', Buffer.from('oi'))], 'x.zip'))).rejects.toThrow(/nenhum arquivo .FIT/)
  })
})

describe('arquivo .FIT pequeno demais', () => {
  it('diz que não é um FIT', () => {
    expect(() => decodeFit(new TextEncoder().encode('FIT'))).toThrow(/não é um FIT/)
  })
})
