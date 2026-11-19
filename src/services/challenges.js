// Desafios no servidor (funções do trecho 14 do supabase/schema.sql). Só o total de cada pessoa sobe.
import { supabaseReady } from './supabase.js'

function friendly(error) {
  const msg = error?.message || String(error)
  if (error?.code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)) return new Error('Os desafios ainda não foram ativados no banco: rode o trecho 14 do arquivo supabase/schema.sql no SQL Editor do Supabase.')
  if (/não autenticado|JWT/i.test(msg)) return new Error('Entre na sua conta para usar os desafios.')
  if (/convite inválido/i.test(msg)) return new Error('Convite inválido ou desafio encerrado. Confira o link com quem convidou.')
  if (/desafio cheio/i.test(msg)) return new Error('Este desafio já tem 30 pessoas.')
  if (/limite de desafios/i.test(msg)) return new Error('Você já tem 10 desafios em andamento. Saia de algum para criar outro.')
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

export const myChallenges = () => rpc('my_challenges')
export const challengeBoard = (id) => rpc('challenge_board', { p_id: id })
export const setChallengeValue = (id, value) => rpc('set_challenge_value', { p_id: id, p_value: value })
export const leaveChallenge = (id) => rpc('leave_challenge', { p_id: id })
export async function createChallenge({ title, metric, start, end, name }) {
  const rows = await rpc('create_challenge', { p_title: title, p_metric: metric, p_start: start, p_end: end, p_name: name })
  return Array.isArray(rows) ? rows[0] : rows
}
export const joinChallenge = (code, name) => rpc('join_challenge', { p_code: code, p_name: name })
