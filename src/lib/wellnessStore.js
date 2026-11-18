// Leitura leve do sono/body battery guardados pela importação do Garmin (só neste aparelho), para as
// telas que não precisam carregar o serviço do Garmin inteiro (ex.: Início).
import { useSyncExternalStore } from 'react'

export const GARMIN_KEY = 'minhas-corridas:garmin'
export const GARMIN_EVENT = 'paceon-garmin'

let lastRaw = null
let lastVal = null

/** { days: { data: {...} }, at, shape } ou null quando o Garmin não está conectado. */
export function readWellness() {
  let raw = null
  try { raw = localStorage.getItem(GARMIN_KEY) } catch { raw = null }
  if (raw === lastRaw) return lastVal
  lastRaw = raw
  try {
    const s = JSON.parse(raw || 'null')
    lastVal = s?.wellness ? { days: s.wellness, at: s.wellnessAt ?? null, shape: s.wellnessShape ?? null } : null
  } catch {
    lastVal = null
  }
  return lastVal
}

function subscribe(l) {
  window.addEventListener(GARMIN_EVENT, l)
  window.addEventListener('storage', l)
  return () => { window.removeEventListener(GARMIN_EVENT, l); window.removeEventListener('storage', l) }
}

export function useWellness() {
  return useSyncExternalStore(subscribe, readWellness, () => null)
}
