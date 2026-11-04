// Link secreto da agenda por assinatura (guardado no Supabase; ver supabase/schema.sql, trecho 6).
import { supabase } from './supabase.js'

function friendly(error) {
  const m = error?.message || ''
  if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01' || /calendar_feed/.test(m)) {
    return new Error('O banco ainda não tem a agenda por assinatura: rode o trecho 6 do supabase/schema.sql no Supabase.')
  }
  if (/failed to fetch|network/i.test(m)) return new Error('Sem conexão com o servidor.')
  return new Error(m || 'Algo deu errado.')
}

export async function getFeedToken() {
  const { data, error } = await supabase.from('calendar_feeds').select('token').maybeSingle()
  if (error) throw friendly(error)
  return data?.token ?? null
}

/** Cria o link ou troca por um novo (o anterior para de funcionar). */
export async function rotateFeedToken() {
  const { data, error } = await supabase.rpc('rotate_calendar_feed')
  if (error) throw friendly(error)
  return data
}

export async function deleteFeed(userId) {
  const { error } = await supabase.from('calendar_feeds').delete().eq('user_id', userId)
  if (error) throw friendly(error)
}

export function feedLinks(token, origin = location.origin) {
  const https = `${origin}/agenda/${token}/minhas-corridas.ics`
  const webcal = https.replace(/^https?:/, 'webcal:')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('Minhas Corridas')}`
  }
}
