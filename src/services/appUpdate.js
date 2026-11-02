// Atualização do app (service worker): usado pelo aviso automático e pelos botões em Ajustes.
let applyUpdate = null // updateServiceWorker(true) do vite-plugin-pwa
let markNeedRefresh = null

export function bindUpdater(update, setNeedRefresh) {
  applyUpdate = update
  markNeedRefresh = setNeedRefresh
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Procura uma versão nova agora.
 * Retorna 'updating' (vai recarregar), 'latest' (já é a mais recente) ou lança erro.
 */
export async function checkForUpdate() {
  if (navigator.onLine === false) throw new Error('Sem internet. Conecte-se e tente de novo.')
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
  if (!reg) {
    location.reload()
    return 'updating'
  }
  await reg.update()
  // Espera a versão nova terminar de baixar (até ~15 s).
  for (let i = 0; i < 30 && reg.installing; i++) await wait(500)
  if (reg.waiting) {
    if (applyUpdate) await applyUpdate(true)
    else {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      await wait(800)
      location.reload()
    }
    return 'updating'
  }
  markNeedRefresh?.(false)
  return 'latest'
}

/** Último recurso: descarta os arquivos do app guardados no aparelho e baixa tudo de novo. Não toca nos dados. */
export async function hardReload() {
  if (navigator.onLine === false) throw new Error('Sem internet: sem conexão o app não conseguiria carregar de novo.')
  if ('serviceWorker' in navigator) {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  }
  if (globalThis.caches) {
    for (const k of await caches.keys()) await caches.delete(k)
  }
  location.reload()
}

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
