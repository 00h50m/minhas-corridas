// Polyline codificada (formato do Google, precisão 5): guarda o traçado da rota em pouco espaço.
export function encodePolyline(coords) {
  let out = ''
  let pLat = 0
  let pLon = 0
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1
    let s = ''
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
      n >>= 5
    }
    return s + String.fromCharCode(n + 63)
  }
  for (const [lat, lon] of coords) {
    const a = Math.round(lat * 1e5)
    const b = Math.round(lon * 1e5)
    out += enc(a - pLat) + enc(b - pLon)
    pLat = a
    pLon = b
  }
  return out
}

export function decodePolyline(str) {
  const coords = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let shift = 0
    let result = 0
    let b
    do {
      if (i >= str.length) throw new Error('polyline inválida')
      b = str.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < (str || '').length) {
    lat += next()
    lon += next()
    coords.push([lat / 1e5, lon / 1e5])
  }
  return coords
}
