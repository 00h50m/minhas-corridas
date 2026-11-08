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

export const geocode = (q) => call(`/api/route?q=${encodeURIComponent(q)}`).then((b) => b.results ?? [])

/** points: [{ address, lat, lon }]; departureAt: ISO (para trânsito previsto). */
export const computeRoute = (points, departureAt) =>
  call('/api/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ points: points.map((p) => ({ address: p.formatted || p.address, lat: p.lat, lon: p.lon })), departureAt }) })

export const PROVIDER_LABEL = { google: 'Google Maps', ors: 'OpenRouteService', manual: 'informado por você' }
