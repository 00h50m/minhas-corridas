// Carregado pelo service worker do app (importScripts). Mostra as notificações push de prazos
// e, ao tocar (ou num botão, como “Fiz” / “Remanejar”), abre o endereço certo no app.
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
      // Botões (Android/desktop; o iPhone mostra só o toque): cada um abre um endereço do app
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) })) : [],
      data: {
        url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/',
        actions: Object.fromEntries((Array.isArray(d.actions) ? d.actions : []).filter((a) => typeof a.url === 'string' && a.url.startsWith('/')).map((a) => [String(a.action), a.url]))
      }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.action && event.notification.data?.actions?.[event.action]) || event.notification.data?.url || '/'
  const url = new URL(path, self.location.origin).href
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
