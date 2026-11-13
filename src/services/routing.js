// Cliente da função de rotas (api/route.js). Sem conexão ou sem serviço configurado,
// a logística continua funcionando com distância e tempo informados à mão.
let capPromise = null

/** { provider: 'google' | 'ors' | null, traffic, tolls } */
export function routeCapabilities() {
  if (!capPromise) {
    capPromise = fetch('/api/route')
      .then((r) => (r.ok ? r.json() : { provider: null }))
      .then((c) => ({ provider: c.provider ?? null, traffic: !!c.traffic, tolls: !!c.tolls }))
      .catch(() => {
        capPromise = null // tenta de novo na próxima vez (ex.: estava sem internet)
        return { provider: null, traffic: false, tolls: false, offline: true }
      })
  }
  return capPromise
}

async function call(url, init) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sem internet. O planejamento salvo continua disponível; para calcular rotas, conecte-se.')
  let res
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('Sem conexão com o servidor de rotas.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Não foi possível consultar a rota agora.')
  return body
}

/** Busca de endereço. suggest: sugestões rápidas enquanto digita; near: {lat, lon} para priorizar a região. */
export const geocode = (q, { suggest = false, near = null } = {}) =>
  call(`/api/route?q=${encodeURIComponent(q)}${suggest ? '&modo=sugestao' : ''}${near?.lat != null ? `&perto_lat=${near.lat}&perto_lon=${near.lon}` : ''}`).then((b) => b.results ?? [])

/** Endereço a partir das coordenadas atuais (botão "Usar minha localização"). */
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este navegador não informa a localização.'))
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords
          const b = await call(`/api/route?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`)
          // O ponto é o do GPS (exato); o endereço do serviço serve só de nome.
          resolve({ formatted: b.results?.[0]?.formatted || `${lat.toFixed(6)}, ${lon.toFixed(6)}`, lat, lon, partial: false, precision: 'gps' })
        } catch (e) {
          reject(e)
        }
      },
      (e) => reject(new Error(e.code === 1 ? 'Permissão de localização negada. Libere nas configurações do navegador.' : 'Não foi possível obter a localização.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

export const SOURCE_LABEL = { cep: 'CEP', osm: 'OpenStreetMap', google: 'Google', ors: 'OpenRouteService', coords: 'Coordenadas' }

/** points: [{ address, lat, lon }]; departureAt: ISO (para trânsito previsto). */
export const computeRoute = (points, departureAt) =>
  call('/api/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ points: points.map((p) => ({ address: p.formatted || p.address, lat: p.lat, lon: p.lon })), departureAt }) })

export const PROVIDER_LABEL = { google: 'Google Maps', ors: 'OpenRouteService', manual: 'informado por você' }
