// Rodada 34: frequência cardíaca por zona (histograma do arquivo, zonas do Garmin/perfil/idade, leitura).
import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { hrHistogram, parseFitActivity } from './activityFile.js'
import { intensity, normalizeHr, sumHist, timeInZones, zoneOf, zoneRead, zonesFor } from './hrZones.js'
import { zonesFromResponse } from '../../api/garmin.js'
import { normalizeWorkout } from './workout.js'
import { normalizeProfile } from './profile.js'

/** 30 min: 20 min a 130 bpm, 10 min a 172 bpm; 2 voltas com FC média. */
function fit() {
  const enc = new Encoder()
  const t0 = Date.parse('2026-11-17T09:00:00Z')
  enc.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: new Date(t0), type: 'activity' })
  for (let s = 0; s <= 1800; s += 5) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + s * 1000), distance: s * 2.5, heartRate: s < 1200 ? 130 : 172 })
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + 1200e3), startTime: new Date(t0), totalElapsedTime: 1200, totalTimerTime: 1200, totalDistance: 3000, avgHeartRate: 130, maxHeartRate: 135 })
  enc.onMesg(Profile.MesgNum.LAP, { timestamp: new Date(t0 + 1800e3), startTime: new Date(t0 + 1200e3), totalElapsedTime: 600, totalTimerTime: 600, totalDistance: 1500, avgHeartRate: 172, maxHeartRate: 180 })
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(t0 + 1800e3), startTime: new Date(t0), sport: 'running', totalElapsedTime: 1800, totalTimerTime: 1800, totalDistance: 4500, avgHeartRate: 144 })
  return new Uint8Array(enc.close())
}

describe('do arquivo', () => {
  it('histograma de 5 bpm e FC média de cada volta', () => {
    const a = parseFitActivity(fit(), 'x.fit')
    expect(a.laps.map((l) => l.avgHr)).toEqual([130, 172])
    expect(a.hrHist.length).toBe(32)
    expect(a.hrHist[(130 - 60) / 5]).toBe(1195) // 1200 s menos o primeiro ponto
    expect(a.hrHist[Math.floor((172 - 60) / 5)]).toBe(605)
    expect(hrHistogram([{ t: 0, hr: 120 }, { t: 30000, hr: 120 }])).toBeNull() // menos de 1 min
    expect(normalizeWorkout({ name: 'x', result: { hrHist: a.hrHist, laps: a.laps } }).result.hrHist).toEqual(a.hrHist)
    expect(normalizeWorkout({ name: 'x', result: { hrHist: [1, 2] } }).result.hrHist).toBeNull()
  })
})

describe('zonas', () => {
  it('de onde vêm: Garmin/digitadas → FC máxima → maior registrada → idade', () => {
    expect(zonesFor({ floors: [100, 120, 140, 155, 170], source: 'garmin' }).label).toBe('zonas do Garmin')
    expect(zonesFor({ max: 190 }).floors).toEqual([95, 114, 133, 152, 171])
    expect(zonesFor({}, { observedMax: 186, observedCount: 3 })).toMatchObject({ max: 186, source: 'observada' })
    expect(zonesFor({}, { observedMax: 186, observedCount: 2, birthDate: '1990-05-10', today: '2026-11-18' })).toMatchObject({ max: 184, source: 'idade', label: 'FC máxima 184 (estimada pela idade: 220 − 36)' })
    expect(zonesFor({})).toBeNull()
    expect(normalizeHr({ floors: [100, 90, 140, 155, 170] }).floors).toBeNull()
    expect(normalizeProfile({ hr: { max: '190', rest: 999 } }).hr).toEqual({ max: 190, rest: null, floors: null, source: null })
  })
  it('tempo por zona, intensidade e leitura', () => {
    const a = parseFitActivity(fit(), 'x.fit')
    const z = zonesFor({ max: 190 })
    const t = timeInZones(a.hrHist, z)
    expect(t.pct).toEqual([0, 66, 0, 0, 34]) // 130 → Z2 (114–132); 172 → Z5 (171+)
    expect(intensity(t)).toEqual({ leve: 66, moderado: 0, forte: 34 })
    expect(zoneRead(t)).toEqual({ tone: 'warn', text: '34% do tempo em Z4–Z5: mais forte do que uma rodagem leve costuma ser.' })
    expect(zoneRead(t, { hasIntervals: true }).text).toBe('Leve 66% · moderado 0% · forte 34%.')
    expect(zoneOf(150, z)).toBe(3)
    expect(zoneOf(100, z)).toBe(1)
    const easy = timeInZones(new Array(32).fill(0).map((_, i) => (i === 12 ? 1800 : 0)), z) // 120–124 bpm
    expect(zoneRead(easy).text).toBe('100% em Z1–Z2: rodagem leve de verdade.')
    expect(sumHist([a.hrHist, a.hrHist])[14]).toBe(2390)
  })
  it('zonas do Garmin Connect (prefere corrida)', () => {
    const data = [
      { trainingMethod: 'HR_MAX_BASED', zone1Floor: 95, zone2Floor: 114, zone3Floor: 133, zone4Floor: 152, zone5Floor: 171, maxHeartRateUsed: 190, restingHeartRateUsed: 52, sport: 'DEFAULT' },
      { trainingMethod: 'HR_RESERVE', zone1Floor: 120, zone2Floor: 136, zone3Floor: 150, zone4Floor: 163, zone5Floor: 177, maxHeartRateUsed: 192, sport: 'RUNNING' }
    ]
    expect(zonesFromResponse(data)).toEqual({ floors: [120, 136, 150, 163, 177], max: 192, rest: null, sport: 'RUNNING', method: 'HR_RESERVE' })
    expect(zonesFromResponse({ zonas: [] })).toBeNull()
  })
})
