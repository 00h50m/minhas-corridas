import { describe, expect, it } from 'vitest'
import { Decoder, Stream } from '@garmin/fitsdk'
import { compareLaps, estimate, flatten, newRepeat, newStep, normalizeWorkout, summary, validateWorkout } from './workout.js'
import { fitFileName, fitSteps, workoutToFit } from './workoutFit.js'
import { syncOnce, emptyMeta, markDirty } from './syncEngine.js'

const sixBy800 = () =>
  normalizeWorkout({
    name: 'Tiros 6×800 – Pista',
    date: '2026-11-20',
    items: [
      newStep('aquecimento'),
      { ...newRepeat(6), steps: [newStep('tiro', { duration: { kind: 'distance', value: 800 }, target: { kind: 'pace', min: 290, max: 310 } }), newStep('recuperacao', { target: { kind: 'hr', min: 120, max: 140 } })] },
      newStep('desaquecimento', { duration: { kind: 'lap', value: null } })
    ]
  })

describe('modelo do treino', () => {
  it('normaliza e valida', () => {
    const w = normalizeWorkout({ name: '  ', items: [{ type: 'xyz', duration: { kind: 'time', value: -3 } }, { kind: 'repeat', times: 500, steps: [] }] })
    expect(w.items).toEqual([])
    expect(validateWorkout(w)).toHaveProperty('name')
    expect(validateWorkout(w)).toHaveProperty('items')
    const ok = sixBy800()
    expect(validateWorkout(ok)).toEqual({})
    expect(ok.items[1].times).toBe(6)
  })
  it('inverte faixa de pace trocada e descarta alvo incompleto', () => {
    const w = normalizeWorkout({ name: 'x', items: [{ type: 'corrida', duration: { kind: 'time', value: 600 }, target: { kind: 'pace', min: 330, max: 300 } }, { type: 'corrida', duration: { kind: 'time', value: 600 }, target: { kind: 'hr', min: 150 } }] })
    expect(w.items[0].target).toEqual({ kind: 'pace', min: 300, max: 330 })
    expect(w.items[1].target.kind).toBe('none')
  })
  it('expande repetições, resume e estima', () => {
    const w = sixBy800()
    expect(flatten(w.items)).toHaveLength(1 + 12 + 1)
    expect(summary(w.items)).toBe('10 min aquec. + 6×(800 m @ 4:50–5:10/km + 2 min rec. @ FC 120–140) + até o botão de volta desaq.')
    const e = estimate(w.items)
    // 600 s aquec. + 6 × (800 m a 300 s/km = 240 s + 120 s) = 600 + 2160 = 2760 s; desaq. "até o botão" fica de fora
    expect(e.sec).toBe(2760)
    // 600/360 km + 6 × (0,8 + 120/360) = 1,667 + 6,8 = 8,47 km
    expect(e.km).toBeCloseTo(8.47, 2)
    expect(e.open).toBe(1)
  })
  it('compara passo a passo com as voltas do relógio', () => {
    const w = sixBy800()
    const laps = [{ sec: 600, distanceKm: 1.7 }, { sec: 236, distanceKm: 0.8 }, { sec: 120, distanceKm: 0.3 }, { sec: 260, distanceKm: 0.8 }]
    const c = compareLaps(w.items, laps)
    expect(c).toHaveLength(14)
    expect(c[1].paceSec).toBe(295)
    expect(c[1].inTarget).toBe(true)
    expect(c[3].paceSec).toBe(325)
    expect(c[3].inTarget).toBe(false)
    expect(c[2].inTarget).toBe(null) // alvo de FC: só mostra
    expect(c[5].lap).toBe(null)
  })
})

describe('arquivo FIT de treino', () => {
  it('passos no formato do relógio, com repetição', () => {
    const s = fitSteps(sixBy800().items)
    expect(s).toHaveLength(5)
    expect(s[3]).toMatchObject({ durationType: 6, durationValue: 1, targetValue: 6 })
    expect(s[1]).toMatchObject({ durationType: 1, durationValue: 80000, targetType: 0, low: Math.round(1000000 / 310), high: Math.round(1000000 / 290) })
    expect(s[2]).toMatchObject({ targetType: 1, low: 220, high: 240 })
    expect(s[4]).toMatchObject({ durationType: 5, durationValue: null, intensity: 3 })
  })
  it('o leitor oficial da Garmin lê o arquivo gerado', () => {
    const bytes = workoutToFit(sixBy800(), new Date('2026-11-13T12:00:00Z'))
    const dec = new Decoder(Stream.fromByteArray(bytes))
    expect(dec.isFIT()).toBe(true)
    expect(dec.checkIntegrity()).toBe(true)
    const { messages, errors } = dec.read()
    expect(errors).toEqual([])
    expect(messages.fileIdMesgs[0].type).toBe('workout')
    const wkt = messages.workoutMesgs[0]
    expect(wkt.wktName).toBe('Tiros 6×800 – Pista')
    expect(wkt.sport).toBe('running')
    expect(wkt.numValidSteps).toBe(5)
    const st = messages.workoutStepMesgs
    expect(st.map((x) => x.wktStepName ?? null)).toEqual(['Aquecimento', 'Tiro', 'Recuperação', null, 'Desaquecimento'])
    expect(st[0]).toMatchObject({ durationType: 'time', durationTime: 600, intensity: 'warmup', targetType: 'open' })
    expect(st[1]).toMatchObject({ durationType: 'distance', durationDistance: 800, targetType: 'speed', intensity: 'active' })
    expect(st[1].customTargetSpeedLow).toBeCloseTo(1000 / 310, 2)
    expect(st[1].customTargetSpeedHigh).toBeCloseTo(1000 / 290, 2)
    expect(st[2]).toMatchObject({ targetType: 'heartRate', customTargetHeartRateLow: 220, customTargetHeartRateHigh: 240, intensity: 'recovery' })
    expect(st[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 6 })
    expect(st[4]).toMatchObject({ durationType: 'open', intensity: 'cooldown' })
  })
  it('nome de arquivo seguro', () => {
    expect(fitFileName({ name: 'Tiros 6×800 – Pista' })).toBe('PACEON-TIROS-6-800-PISTA.FIT')
    expect(fitFileName({ name: 'Ação!' })).toBe('PACEON-ACAO.FIT')
  })
})

describe('sincronização de treinos antes do SQL novo', () => {
  it('treinos ficam pendentes (não somem) quando o banco ainda não aceita o tipo', async () => {
    const meta = emptyMeta()
    const recs = { 'race:r1': { id: 'r1', updatedAt: '2026-11-13T10:00:00Z' }, 'workout:w1': { id: 'w1', updatedAt: '2026-11-13T10:00:00Z' } }
    markDirty(meta, 'race', 'r1')
    markDirty(meta, 'workout', 'w1')
    let fetched = 0
    const remote = {
      async push(rows) {
        const acc = rows.filter((r) => r.kind !== 'workout').map((r) => ({ kind: r.kind, id: r.id }))
        acc.deferred = ['workout']
        return acc
      },
      async fetch() { fetched++; return [] },
      async pull() { return [] }
    }
    const local = { async get(k, id) { return recs[`${k}:${id}`] }, async applyRemote() {}, async filesMissingBlob() { return [] } }
    const sum = await syncOnce({ remote, local, meta, userId: 'u', saveMeta() {} })
    expect(sum.deferred).toBe(1)
    expect(sum.rejected).toBe(0)
    expect(fetched).toBe(0)
    expect(meta.dirty).toEqual({ 'workout:w1': true })
  })
})

describe('voltas do arquivo de atividade', async () => {
  const { Encoder, Profile } = await import('@garmin/fitsdk')
  const { parseActivity, parseFitActivity } = await import('./activityFile.js')
  it('FIT: uma volta por passo', () => {
    const enc = new Encoder()
    const t0 = Date.parse('2026-11-13T09:00:00Z')
    enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(t0), type: 'activity' })
    let t = t0
    let d = 0
    for (const [sec, m] of [[600, 1700], [236, 800], [120, 300]]) {
      enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t), distance: d })
      t += sec * 1000
      d += m
      enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t), distance: d })
      enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t), totalElapsedTime: sec, totalTimerTime: sec, totalDistance: m })
    }
    const a = parseFitActivity(enc.close(), 'x.fit')
    expect(a.laps).toEqual([{ sec: 600, distanceKm: 1.7 }, { sec: 236, distanceKm: 0.8 }, { sec: 120, distanceKm: 0.3 }])
  })
  it('TCX: voltas pelo Lap', () => {
    const tp = (s, dm) => `<Trackpoint><Time>2026-11-13T09:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}Z</Time><DistanceMeters>${dm}</DistanceMeters></Trackpoint>`
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running">
      <Lap><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>1700</DistanceMeters><Track>${tp(0, 0)}${tp(600, 1700)}</Track></Lap>
      <Lap><TotalTimeSeconds>240</TotalTimeSeconds><DistanceMeters>800</DistanceMeters><Track>${tp(840, 2500)}</Track></Lap>
    </Activity></Activities></TrainingCenterDatabase>`
    expect(parseActivity(xml, 'a.tcx').laps).toEqual([{ sec: 600, distanceKm: 1.7 }, { sec: 240, distanceKm: 0.8 }])
  })
})
