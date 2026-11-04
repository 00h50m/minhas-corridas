// Rodada diária das notificações push (usada por api/push-cron.js). Sem dependências de rede:
// recebe um adaptador do banco (`db`) e a função de envio (`send`), para poder ser testada.
import { pushNotificationsFor } from './alerts.js'
import { todayInTimeZone } from './dates.js'
import { normalizeRace } from './model.js'

/**
 * db: {
 *   subscriptions(): [{ endpoint, user_id, p256dh, auth, tz }]
 *   races(userId): [race]
 *   claim(userId, keys): keys ainda não enviadas (e já marcadas como enviadas)
 *   release(userId, keys): desfaz a marcação (quando nenhum aparelho recebeu)
 *   removeSubscription(endpoint)
 *   cleanup(): apaga registros antigos de envio
 * }
 * send(subscription, payload): lança erro com `statusCode` (404/410 = inscrição expirada)
 */
export async function runPushJob({ db, send, now = new Date() }) {
  const subs = await db.subscriptions()
  const byUser = new Map()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  const report = { users: byUser.size, devices: subs.length, notifications: 0, sent: 0, failed: 0, removed: 0 }

  for (const [userId, devices] of byUser) {
    const today = todayInTimeZone(devices[0].tz, now)
    const races = (await db.races(userId)).map(normalizeRace)
    const due = pushNotificationsFor(races, today)
    if (!due.length) continue
    const fresh = new Set(await db.claim(userId, due.map((n) => n.key)))
    const toSend = due.filter((n) => fresh.has(n.key))
    const alive = new Set(devices.map((d) => d.endpoint))
    for (const n of toSend) {
      report.notifications++
      let delivered = 0
      for (const d of devices) {
        if (!alive.has(d.endpoint)) continue
        try {
          await send(d, { title: n.title, body: n.body, url: n.url, tag: n.key })
          delivered++
          report.sent++
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            alive.delete(d.endpoint)
            await db.removeSubscription(d.endpoint)
            report.removed++
          } else report.failed++
        }
      }
      // Ninguém recebeu por erro temporário: libera para tentar na próxima rodada.
      if (!delivered && alive.size) await db.release(userId, [n.key])
    }
  }
  await db.cleanup()
  return report
}

/** Payload da notificação de teste. */
export const TEST_PAYLOAD = { title: 'Notificações ativadas', body: 'Você vai receber aqui os avisos de prazos das suas provas.', url: '/lembretes', tag: 'teste' }
