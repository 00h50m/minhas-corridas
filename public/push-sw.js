// Carregado pelo service worker do app (importScripts). Mostra as notificações push de prazos
// e, ao tocar, abre a prova no app.
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'PaceOn', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      lang: 'pt-BR',
      data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const win = list.find((c) => new URL(c.url).origin === self.location.origin)
      if (win) {
        await win.focus()
        if ('navigate' in win) return win.navigate(url).catch(() => self.clients.openWindow(url))
        return
      }
      return self.clients.openWindow(url)
    })
  )
})
