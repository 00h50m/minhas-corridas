// Zonas de frequência cardíaca: de onde vêm (Garmin, digitadas, FC máxima informada, a maior registrada
// ou a idade) e quanto tempo cada atividade passou em cada uma (pelo histograma de 5 bpm do arquivo).
import { HR_FROM, HR_STEP } from './activityFile.js'

export const ZONE_NAMES = ['Z1 · muito leve', 'Z2 · leve', 'Z3 · moderado', 'Z4 · forte', 'Z5 · máximo']
export const ZONE_COLORS = ['#9aa5b1', '#3b82f6', '#22a06b', '#f59e0b', '#ef4444']
// Padrão do Garmin por % da FC máxima: Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90–100
const PCT = [0.5, 0.6, 0.7, 0.8, 0.9]

/** Perfil: { max, rest, floors: [5 pisos] | null, source: 'garmin' | 'manual' | null } */
export function normalizeHr(raw) {
  const n = (v, a, b) => (Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) >= a && Number(v) <= b ? Math.round(Number(v)) : null)
  const r = raw && typeof raw === 'object' ? raw : {}
  const floors = Array.isArray(r.floors) && r.floors.length === 5 && r.floors.every((x, i) => n(x, 40, 230) && (i === 0 || x > r.floors[i - 1])) ? r.floors.map(Number) : null
  return { max: n(r.max, 120, 230), rest: n(r.rest, 30, 100), floors, source: ['garmin', 'manual'].includes(r.source) ? r.source : null }
}

/** Idade em anos numa data. */
const ageOn = (birth, today) => {
  if (!birth) return null
  const a = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0)
  return a > 5 && a < 100 ? a : null
}

/**
 * Zonas em uso: { floors: [5 pisos bpm], max, source, label }.
 * Ordem: pisos do Garmin ou digitados → FC máxima informada → maior FC registrada (≥ 3 atividades) → 220 − idade.
 */
export function zonesFor(hr, { observedMax = null, observedCount = 0, birthDate = null, today } = {}) {
  const h = normalizeHr(hr)
  if (h.floors) return { floors: h.floors, max: h.max, source: h.source ?? 'manual', label: h.source === 'garmin' ? 'zonas do Garmin' : 'zonas digitadas por você' }
  let max = h.max
  let source = 'perfil'
  let label = `FC máxima ${h.max} (informada)`
  if (!max && observedMax && observedCount >= 3) { max = observedMax; source = 'observada'; label = `FC máxima ${observedMax} (a maior registrada nas suas atividades)` }
  const age = ageOn(birthDate, today ?? '2026-01-01')
  if (!max && age) { max = 220 - age; source = 'idade'; label = `FC máxima ${max} (estimada pela idade: 220 − ${age})` }
  if (!max) return null
  return { floors: PCT.map((p) => Math.round(max * p)), max, source, label }
}

/** Segundos em cada zona (Z1..Z5) a partir do histograma de 5 bpm. Abaixo de Z1 conta em Z1. */
export function timeInZones(hist, zones) {
  if (!Array.isArray(hist) || !zones) return null
  const out = [0, 0, 0, 0, 0]
  hist.forEach((sec, i) => {
    if (!sec) return
    const mid = HR_FROM + i * HR_STEP + HR_STEP / 2
    let z = 0
    for (let k = 4; k >= 0; k--) if (mid >= zones.floors[k]) { z = k; break }
    out[z] += sec
  })
  const total = out.reduce((a, b) => a + b, 0)
  return total ? { sec: out, total, pct: out.map((x) => Math.round((x / total) * 100)) } : null
}

/** Leve (Z1–Z2) · moderado (Z3) · forte (Z4–Z5), em %. */
export function intensity(t) {
  if (!t) return null
  const p = (a) => Math.round((a / t.total) * 100)
  return { leve: p(t.sec[0] + t.sec[1]), moderado: p(t.sec[2]), forte: p(t.sec[3] + t.sec[4]) }
}

/** Zona de um bpm (1..5) — para a FC média de cada volta. */
export function zoneOf(bpm, zones) {
  if (!bpm || !zones) return null
  for (let k = 4; k >= 0; k--) if (bpm >= zones.floors[k]) return k + 1
  return 1
}

/** Soma os histogramas de várias atividades (a semana). */
export function sumHist(hists) {
  const valid = hists.filter((h) => Array.isArray(h) && h.length === 32)
  if (!valid.length) return null
  return valid.reduce((acc, h) => acc.map((x, i) => x + h[i]), new Array(32).fill(0))
}

/**
 * Leitura do treino: rodagem/regenerativo (sem tiros e sem alvo de pace forte) que passou de 25% em
 * Z4–Z5 → aviso de que não foi leve. Treino com tiros: informa o tempo forte. Sem prescrição.
 */
export function zoneRead(t, { hasIntervals = false } = {}) {
  const i = intensity(t)
  if (!i) return null
  if (!hasIntervals && i.forte >= 25) return { tone: 'warn', text: `${i.forte}% do tempo em Z4–Z5: mais forte do que uma rodagem leve costuma ser.` }
  if (!hasIntervals && i.leve >= 70) return { tone: 'ok', text: `${i.leve}% em Z1–Z2: rodagem leve de verdade.` }
  return { tone: 'info', text: `Leve ${i.leve}% · moderado ${i.moderado}% · forte ${i.forte}%.` }
}
