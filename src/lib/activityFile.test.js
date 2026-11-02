import { describe, it, expect } from 'vitest'
import { parseActivity } from './activityFile.js'

// 5,05 km a ~6:00/km, um ponto a cada 50 m (18 s); o 3º km mais lento (6:30).
function points() {
  const pts = []
  let t = Date.parse('2026-10-12T10:00:00Z')
  for (let d = 0; d <= 5050; d += 50) {
    pts.push({ d, t, hr: 150 + Math.round(d / 500), alt: 700 + (d < 2500 ? d / 100 : (5050 - d) / 100) })
    const slow = d >= 2000 && d < 3000
    t += slow ? 19500 : 18000
  }
  return pts
}

const tcx = () => {
  const p = points()
  const total = (p[p.length - 1].t - p[0].t) / 1000
  return `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-10-12T10:00:00Z</Id>
<Lap StartTime="2026-10-12T10:00:00Z"><TotalTimeSeconds>${total}</TotalTimeSeconds><DistanceMeters>5050</DistanceMeters><Track>
${p.map((x) => `<Trackpoint><Time>${new Date(x.t).toISOString()}</Time><AltitudeMeters>${x.alt}</AltitudeMeters><DistanceMeters>${x.d}</DistanceMeters><HeartRateBpm><Value>${x.hr}</Value></HeartRateBpm></Trackpoint>`).join('\n')}
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
}

const gpx = () => {
  const p = points()
  const degPer100m = 100 / 111194.9
  return `<?xml version="1.0"?><gpx version="1.1" creator="Garmin Connect" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><type>running</type><trkseg>
${p.map((x) => `<trkpt lat="${(-23 + (x.d / 100) * degPer100m).toFixed(7)}" lon="-46.9"><ele>${x.alt}</ele><time>${new Date(x.t).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${x.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n')}
</trkseg></trk></gpx>`
}

describe('arquivo do relógio', () => {
  it('lê TCX: distância, tempo, FC, elevação e parciais por km', () => {
    const a = parseActivity(tcx(), 'corrida.tcx')
    expect(a.source).toBe('tcx')
    expect(a.distanceKm).toBe(5.05)
    expect(a.elapsedSec).toBe(101 * 18 + 20 * 1.5) // 1848 s
    // o resto de 50 m (abaixo de 100 m) não vira parcial
    expect(a.splits.map((s) => s.sec)).toEqual([360, 360, 390, 360, 360])
    expect(a.avgHr).toBeGreaterThan(150)
    expect(a.maxHr).toBe(160)
    expect(a.elevGainM).toBe(24) // subida real de 25 m; o filtro de ruído (3 m) descarta o último trecho
  })
  it('lê GPX calculando a distância pelas coordenadas', () => {
    const a = parseActivity(gpx(), 'corrida.gpx')
    expect(a.source).toBe('gpx')
    expect(a.distanceKm).toBeCloseTo(5.05, 1)
    expect(a.splits.slice(0, 5).map((s) => Math.round(s.sec / 5) * 5)).toEqual([360, 360, 390, 360, 360])
    expect(a.maxHr).toBe(160)
  })
  it('explica quando o formato não é aceito', () => {
    expect(() => parseActivity('xx', 'atividade.fit')).toThrow(/Exportar para TCX/)
    expect(() => parseActivity('<html></html>', 'a.txt')).toThrow(/Não reconheci/)
    expect(() => parseActivity('<gpx></gpx>', 'vazio.gpx')).toThrow(/suficientes/)
  })
})
