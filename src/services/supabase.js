// Cliente do Supabase. A URL e a chave pública (anon) vêm das variáveis de ambiente do build.
// A chave anon pode ficar no app: quem protege os dados são as regras (RLS) do banco.
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL, cleanSupabaseUrl } from '../config.js'

const url = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL)
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)
export const supabaseUrl = url
export const supabaseAnonKey = anonKey

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'minhas-corridas:auth' }
    })
  : null

const BUCKET = 'anexos'
const PAGE = 1000

function fail(error) {
  const msg = error?.message || String(error)
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /records/.test(msg) && /(does not exist|not find)/i.test(msg)) {
    throw new Error('O banco ainda não foi preparado. Rode o arquivo supabase/schema.sql no SQL Editor do Supabase.')
  }
  if (/bucket not found/i.test(msg)) throw new Error('O bucket de anexos não existe. Rode o arquivo supabase/schema.sql no Supabase.')
  if (/failed to fetch|network/i.test(msg)) throw new Error('Sem conexão com o servidor.')
  throw new Error(msg)
}

/** Adaptador do motor de sincronização para o Supabase. */
export function supabaseRemote(userId) {
  return {
    async push(rows) {
      const { data, error } = await supabase
        .from('records')
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,kind,id' })
        .select('kind,id,updated_at,client_updated_at')
      if (error) fail(error)
      return data ?? []
    },
    async pull(since) {
      const out = []
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from('records').select('kind,id,data,deleted,client_updated_at,updated_at').order('updated_at', { ascending: true }).order('id').range(from, from + PAGE - 1)
        if (since) q = q.gt('updated_at', since)
        const { data, error } = await q
        if (error) fail(error)
        out.push(...data)
        if (data.length < PAGE) break
      }
      return out
    },
    async fetch(keys) {
      const out = []
      for (const kind of new Set(keys.map((k) => k.kind))) {
        const ids = keys.filter((k) => k.kind === kind).map((k) => k.id)
        const { data, error } = await supabase.from('records').select('kind,id,data,deleted,client_updated_at,updated_at').eq('kind', kind).in('id', ids)
        if (error) fail(error)
        out.push(...data)
      }
      return out
    },
    async uploadBlob(path, blob) {
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' })
      if (error) fail(error)
    },
    async downloadBlob(path) {
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      if (error) fail(error)
      return data
    },
    async removeBlob(path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path])
      if (error) fail(error)
    }
  }
}

/** Apaga anexos do bucket, registros e o próprio usuário. */
export async function deleteAccountRemote(userId) {
  const missing = (error) => error && (error.code === 'PGRST202' || /delete_my_account/.test(error.message || ''))
  const notReady = () => new Error('A exclusão de conta ainda não foi ativada no banco: rode o trecho “Excluir a própria conta” do arquivo supabase/schema.sql no SQL Editor do Supabase. Nada foi apagado.')
  // 0) Confere que a função existe ANTES de apagar qualquer coisa.
  const check = await supabase.rpc('delete_my_account', { dry_run: true })
  if (check.error) {
    if (missing(check.error)) throw notReady()
    fail(check.error)
  }
  // 1) Arquivos da pasta do usuário (em lotes).
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 })
    if (error) fail(error)
    if (!data?.length) break
    const { error: e2 } = await supabase.storage.from(BUCKET).remove(data.map((f) => `${userId}/${f.name}`))
    if (e2) fail(e2)
    if (data.length < 1000) break
  }
  // 2) Registros e usuário (função no banco).
  const { error } = await supabase.rpc('delete_my_account', { dry_run: false })
  if (error) fail(error)
}

/** Provedores de login ativos no projeto (endpoint público do Supabase Auth). */
export async function enabledProviders() {
  if (!isConfigured) return {}
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    if (!res.ok) return {}
    return (await res.json()).external ?? {}
  } catch {
    return {}
  }
}

/** Mensagens de erro de login em português. */
export function authMessage(error) {
  const m = error?.message || ''
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).'
  if (/user already registered/i.test(m)) return 'Já existe uma conta com esse e-mail. Use “Entrar”.'
  if (/password should be at least|weak password/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres.'
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  if (/unable to validate email|invalid email|email address .* is invalid/i.test(m)) return 'E-mail inválido.'
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.'
  if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da anterior.'
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'O login com Google ainda não foi ativado no Supabase.'
  return m || 'Algo deu errado. Tente de novo.'
}
