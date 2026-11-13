// Geometria simples, usada no app e no servidor de rotas.

/** Distância em metros entre dois pontos {lat, lon}. */
export function meters(a, b) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Endereços diferentes caindo no mesmo ponto do mapa (a menos de 30 m) indicam geocodificação errada
 * (ex.: o centro da cidade no lugar da rua). [{ i, j }] com os índices dos pontos.
 */
export function collapsedPoints(points, minM = 30) {
  const out = []
  const key = (p) => String(p.address || '').toLowerCase().replace(/\s+/g, ' ').trim()
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]
      const b = points[j]
      if (a.lat == null || b.lat == null || key(a) === key(b)) continue
      if (meters(a, b) < minM) out.push({ i, j })
    }
  }
  return out
}

/** O ponto tem localização confirmada (número na rua, ponto marcado ou endereço antigo já verificado)? */
// Pontos salvos antes de existir a precisão (sem o campo) contam como NÃO confirmados.
export const isPrecise = (p) => p?.lat != null && ['numero', 'ponto', 'gps', 'manual'].includes(p.precision)

export const PRECISION_LABEL = { rua: 'só a rua, sem o número', cep: 'pela região do CEP', area: 'só o bairro ou a cidade', local: 'um lugar com nome, não o endereço buscado' }
export const precisionLabel = (p) => PRECISION_LABEL[p?.precision] || 'localização não confirmada'
