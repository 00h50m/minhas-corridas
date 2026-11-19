// Ficha da academia no aparelho, sincronizada com a conta (registro 'ficha', id 'main').
import { useSyncExternalStore } from 'react'
import { KV_EVENT, KV_KINDS, getLocalKV, setKV } from './kv.js'
import { normalizeFicha } from '../lib/ficha.js'

let lastRaw
let lastVal = normalizeFicha(null)

export function getFicha() {
  let raw = null
  try { raw = localStorage.getItem(KV_KINDS.ficha) } catch { raw = null }
  if (raw !== lastRaw) {
    lastRaw = raw
    lastVal = normalizeFicha(getLocalKV('ficha'))
  }
  return lastVal
}

export function saveFicha(f) {
  setKV('ficha', normalizeFicha(f))
}

function subscribe(l) {
  const on = (e) => { if (!e?.detail || e.detail.kind === 'ficha') l() }
  window.addEventListener(KV_EVENT, on)
  window.addEventListener('storage', l)
  return () => { window.removeEventListener(KV_EVENT, on); window.removeEventListener('storage', l) }
}

export function useFicha() {
  return useSyncExternalStore(subscribe, getFicha, getFicha)
}
