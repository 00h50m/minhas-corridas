// GET  /api/push → chave pública VAPID (o app precisa dela para ativar as notificações).
// POST /api/push → manda uma notificação de teste para os aparelhos da pessoa logada.
import { TEST_PAYLOAD } from '../src/lib/pushJob.js'
import { adminDb, pushEnv, supabaseEnv, userFromToken } from './_supabaseAdmin.js'
import { makeSender } from './_webpush.js'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  const push = pushEnv()
  if (req.method === 'GET') {
    if (!push.ok) return res.status(503).json({ error: 'As notificações ainda não foram configuradas no servidor.' })
    return res.status(200).json({ publicKey: push.publicKey })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!push.ok) return res.status(503).json({ error: 'As notificações ainda não foram configuradas no servidor.' })
  const env = supabaseEnv()
  const token = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '')
  const user = await userFromToken(env, token).catch(() => null)
  if (!user) return res.status(401).json({ error: 'Entre na conta de novo.' })
  try {
    const db = adminDb(env)
    const devices = await db.subscriptionsOf(user.id)
    if (!devices.length) return res.status(404).json({ error: 'Nenhum aparelho com notificações ativas.' })
    const send = makeSender(push)
    let sent = 0
    for (const d of devices) {
      try {
        await send(d, TEST_PAYLOAD)
        sent++
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.removeSubscription(d.endpoint)
      }
    }
    if (!sent) return res.status(502).json({ error: 'Não consegui entregar a notificação. Desative e ative de novo.' })
    return res.status(200).json({ sent, devices: devices.length })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Não foi possível enviar o teste agora.' })
  }
}
