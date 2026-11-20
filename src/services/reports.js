// Links só de leitura do relatório para o treinador (trecho 15 do supabase/schema.sql).
import { supabaseReady } from './supabase.js'

function friendly(error) {
  const msg = error?.message || String(error)
  if (error?.code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)) return new Error('O link para o treinador ainda não foi ativado no banco: rode o trecho 15 do arquivo supabase/schema.sql no SQL Editor do Supabase. O PDF e o resumo em texto funcionam sem isso.')
  if (/não autenticado|JWT/i.test(msg)) return new Error('Entre na sua conta para criar o link.')
  if (/failed to fetch|network/i.test(msg)) return new Error('Sem conexão com o servidor.')
  return new Error(msg)
}
async function rpc(name, args = {}) {
  const sb = await supabaseReady
  if (!sb) throw new Error('A conta não está configurada neste app.')
  const { data, error } = await sb.rpc(name, args)
  if (error) throw friendly(error)
  return data
}

export const createSharedReport = (title, data) => rpc('create_shared_report', { p_title: title, p_data: data })
export const mySharedReports = () => rpc('my_shared_reports')
export const deleteSharedReport = (token) => rpc('delete_shared_report', { p_token: token })
export async function getSharedReport(token) {
  const rows = await rpc('get_shared_report', { p_token: token })
  return Array.isArray(rows) ? rows[0] ?? null : rows
}
