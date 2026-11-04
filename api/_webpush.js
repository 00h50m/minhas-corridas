// Envio Web Push (protocolo VAPID) com a biblioteca web-push.
import webpush from 'web-push'

export function makeSender({ publicKey, privateKey, subject }) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return (sub, payload) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 12 * 3600, urgency: 'normal' })
}
