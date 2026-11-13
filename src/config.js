// Projeto Supabase padrão do app. A chave "anon" é pública por definição (vai para o navegador de
// qualquer forma); a proteção dos dados está nas regras RLS do banco (supabase/schema.sql).
// Usado pelo app e pelas funções do Vercel (api/), que não têm import.meta.env.
export const DEFAULT_SUPABASE_URL = 'https://yovlefpwtcahmgqkbwsr.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdmxlZnB3dGNhaG1ncWtid3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjQxMDYsImV4cCI6MjEwOTIwMDEwNn0.p7t7JKPUgAUYZvLsD9SdMH6lF4TZh4nvZtVW7e82nCs'

export function cleanSupabaseUrl(u) {
  return String(u || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
}

// Política de privacidade (/privacidade). Preencha o responsável e o e-mail de contato
// (exigidos pela LGPD e pelo programa de desenvolvedores da Garmin).
export const PRIVACY_CONTROLLER = 'o responsável pelo PaceOn'
export const PRIVACY_CONTACT = ''
export const PRIVACY_UPDATED = '13/11/2026'
