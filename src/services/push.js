// Notificações push de prazos neste aparelho. Precisa de conta (o servidor lê as provas da nuvem).
import { supabase } from './supabase.js'

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/**
 * 'ok' | 'ios-install' (iPhone: só funciona com o app na Tela de Início) | 'unsupported'
 */
export function pushSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  if (!('PushManager' in window) || !('Notification' in window)) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  return 'ok'
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('O app ainda não terminou de instalar neste aparelho. Recarregue a página e tente de novo.')
  return navigator.serviceWorker.ready
}

/** { permission, subscribed } */
export async function pushStatus() {
  if (pushSupport() !== 'ok') return { permission: 'unsupported', subscribed: false }
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return { permission: Notification.permission, subscribed: !!sub && Notification.permission === 'granted' }
}

function keyToBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function serverKey() {
  let res
  try {
    res = await fetch('/api/push')
  } catch {
    throw new Error('Sem conexão com o servidor.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.publicKey) throw new Error(body.error || 'As notificações não estão disponíveis nesta versão publicada.')
  return body.publicKey
}

export async function enablePush() {
  if (!supabase) throw new Error('Entre na conta para receber notificações.')
  const publicKey = await serverKey()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador.' : 'Permissão não concedida.')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (sub) {
    // Chave do servidor mudou: refaz a inscrição.
    const cur = sub.options?.applicationServerKey
    if (cur && btoa(String.fromCharCode(...new Uint8Array(cur))).replace(/=+$/, '') !== btoa(String.fromCharCode(...keyToBytes(publicKey))).replace(/=+$/, '')) {
      await sub.unsubscribe()
      sub = null
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  })
  if (error) {
    if (error.code === 'PGRST202' || /save_push_subscription/.test(error.message || '')) {
      throw new Error('O banco ainda não tem a parte de notificações: rode o trecho 7 do supabase/schema.sql no Supabase.')
    }
    throw new Error(error.message)
  }
}

/** Desativa neste aparelho. `remote: false` quando a sessão já não existe. */
export async function disablePush({ remote = true } = {}) {
  if (pushSupport() !== 'ok') return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return
  if (remote && supabase) {
    try {
      await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    } catch {
      // Sem conexão: a inscrição some do servidor quando o envio falhar (410).
    }
  }
  await sub.unsubscribe().catch(() => {})
}

/** Pede ao servidor uma notificação de teste para os aparelhos da conta. */
export async function testPush() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Entre na conta de novo.')
  let res
  try {
    res = await fetch('/api/push', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new Error('Sem conexão com o servidor.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Não foi possível enviar o teste.')
  return body
}
