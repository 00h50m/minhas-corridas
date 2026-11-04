// Acesso do servidor ao Supabase com a chave service_role (só nas funções do Vercel; nunca no app).
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL, cleanSupabaseUrl } from '../src/config.js'

export function supabaseEnv(env = process.env) {
  return {
    url: cleanSupabaseUrl(env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
    anonKey: env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || ''
  }
}

export function pushEnv(env = process.env) {
  const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((k) => !env[k])
  return {
    ok: missing.length === 0,
    missing,
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:minhas-corridas@example.com'
  }
}

/** Adaptador do banco para runPushJob, via PostgREST. */
export function adminDb({ url, serviceKey }, fetchImpl = fetch) {
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const t = await res.text()
    return t ? JSON.parse(t) : null
  }
  const inList = (arr) => `(${arr.map((k) => `"${String(k).replace(/["\\]/g, '\\$&')}"`).join(',')})`
  return {
    subscriptions: () => call('push_subscriptions?select=endpoint,user_id,p256dh,auth,tz'),
    subscriptionsOf: (userId) => call(`push_subscriptions?select=endpoint,user_id,p256dh,auth,tz&user_id=eq.${encodeURIComponent(userId)}`),
    async races(userId) {
      const rows = await call(`records?select=id,data&kind=eq.race&deleted=is.false&user_id=eq.${encodeURIComponent(userId)}`)
      return rows.filter((r) => r.data).map((r) => ({ ...r.data, id: r.id }))
    },
    async claim(userId, keys) {
      if (!keys.length) return []
      const rows = await call('push_log?on_conflict=user_id,key&select=key', {
        method: 'POST',
        headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(keys.map((key) => ({ user_id: userId, key })))
      })
      return (rows ?? []).map((r) => r.key)
    },
    async release(userId, keys) {
      await call(`push_log?user_id=eq.${encodeURIComponent(userId)}&key=in.${encodeURIComponent(inList(keys))}`, { method: 'DELETE' })
    },
    async removeSubscription(endpoint) {
      await call(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
    },
    async cleanup() {
      const old = new Date(Date.now() - 45 * 86400000).toISOString()
      await call(`push_log?created_at=lt.${encodeURIComponent(old)}`, { method: 'DELETE' })
    }
  }
}

/** Confere o login do app (token de acesso do Supabase) e devolve o id do usuário. */
export async function userFromToken({ url, anonKey }, token, fetchImpl = fetch) {
  if (!token) return null
  const res = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const u = await res.json()
  return u?.id ? u : null
}
