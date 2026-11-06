// Instalação do app (PWA): guarda o convite do navegador (Android/Chrome/Edge) e detecta
// iPhone/iPad, onde a instalação é manual (Compartilhar → Adicionar à Tela de Início).
import { useSyncExternalStore } from 'react'

const SNOOZE_KEY = 'minhas-corridas:instalar-dispensado'
const SNOOZE_DAYS = 30

let deferred = null // evento beforeinstallprompt guardado
let state = compute()
const listeners = new Set()

function standalone() {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true
  } catch {
    return false
  }
}

/** Plataforma para escolher as instruções. */
export function detectPlatform(ua = navigator.userAgent, platform = navigator.platform, touch = navigator.maxTouchPoints) {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touch > 1)
  const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|LinkedInApp|TikTok|musical_ly|GSA\//i.test(ua)
  if (ios) return inApp ? 'ios-inapp' : /CriOS|FxiOS|EdgiOS/i.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/i.test(ua)) return inApp ? 'android-inapp' : 'android'
  return 'desktop'
}

function snoozed() {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return t > 0 && Date.now() - t < SNOOZE_DAYS * 86400000
  } catch {
    return false
  }
}

function compute() {
  if (typeof window === 'undefined') return { installed: false, canPrompt: false, platform: 'desktop', snoozed: false }
  return { installed: standalone(), canPrompt: !!deferred, platform: detectPlatform(), snoozed: snoozed() }
}

function emit() {
  state = compute()
  for (const l of listeners) l()
}

export function useInstall() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)
}

/** Deve rodar cedo (main.jsx): o navegador dispara o convite logo ao carregar. */
export function initInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // nós mostramos o convite na hora certa
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit)
}

/** Abre a janela de instalação do navegador. Retorna 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const e = deferred
  deferred = null
  await e.prompt()
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }))
  emit()
  return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
}

export function snoozeInstall() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    /* sem armazenamento */
  }
  emit()
}

/** Se vale mostrar algo: não instalado e há como instalar (botão ou instrução). */
export function installAvailable(s) {
  if (s.installed) return false
  return s.canPrompt || s.platform.startsWith('ios') || s.platform.startsWith('android')
}
