// Ciclo menstrual no aparelho, sincronizado com a conta (registro 'cycle'). Leve: usado no Início.
import { useSyncExternalStore } from 'react'
import { KV_EVENT, KV_KINDS, getLocalKV, setKV } from './kv.js'
import { normalizeCycle } from '../lib/cycle.js'

let lastRaw
let lastVal = normalizeCycle(null)

export function getCycle() {
  let raw = null
  try { raw = localStorage.getItem(KV_KINDS.cycle) } catch { raw = null }
  if (raw !== lastRaw) {
    lastRaw = raw
    lastVal = normalizeCycle(getLocalKV('cycle'))
  }
  return lastVal
}

export function saveCycle(c) {
  setKV('cycle', normalizeCycle(c))
}

/** Apaga tudo do ciclo (aqui e na conta). */
export function deleteCycle() {
  setKV('cycle', null)
}

function subscribe(l) {
  const on = (e) => { if (!e?.detail || e.detail.kind === 'cycle') l() }
  window.addEventListener(KV_EVENT, on)
  window.addEventListener('storage', l)
  return () => { window.removeEventListener(KV_EVENT, on); window.removeEventListener('storage', l) }
}

export function useCycle() {
  return useSyncExternalStore(subscribe, getCycle, getCycle)
}
