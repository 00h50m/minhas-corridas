// Vercel Cron (vercel.json): 1x por dia manda as notificações de prazos para cada aparelho inscrito.
// O Vercel chama com "Authorization: Bearer <CRON_SECRET>".
import { runPushJob } from '../src/lib/pushJob.js'
import { adminDb, pushEnv, supabaseEnv } from './_supabaseAdmin.js'
import { makeSender } from './_webpush.js'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado.' })
  if (req.headers?.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Não autorizado.' })
  const push = pushEnv()
  if (!push.ok) return res.status(503).json({ error: 'Notificações não configuradas.', missing: push.missing })
  try {
    const report = await runPushJob({ db: adminDb(supabaseEnv()), send: makeSender(push) })
    return res.status(200).json(report)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Falha na rodada de notificações.' })
  }
}
