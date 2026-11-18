// Importação automática do Garmin: a chave pessoal fica SÓ neste aparelho (não vai para a nuvem
// nem para o backup); a função /api/garmin só repassa as chamadas. Cada atividade nova vai para o
// treino do dia (automático se houver um só), vira treino avulso ou espera a pessoa escolher.
import { useSyncExternalStore } from 'react'
import { getState, saveWorkout } from './store.js'
import { readActivityFile } from '../lib/activityFile.js'
import { activityDate, alreadyImported, freeWorkout, matchActivity, resultFrom } from '../lib/activityMatch.js'
import { WITH_FILE, garminDate, planGarmin, sameActivity, summaryFromList, syncWindow } from '../lib/garminSync.js'
import { addDaysISO, todayISO } from '../lib/dates.js'
import { GARMIN_EVENT } from '../lib/wellnessStore.js'
import { fmtSec } from '../lib/workout.js'

const KEY = 'minhas-corridas:garmin'
const AUTO_EVERY_MS = 30 * 60 * 1000
const listeners = new Set()

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    return s && typeof s === 'object' && typeof s.key === 'string' ? { done: [], pending: [], races: [], ...s } : null
  } catch {
    return null
  }
}
let state = read()
let running = null

function write(next) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch { /* sem armazenamento: vale só nesta sessão */ }
  listeners.forEach((l) => l())
  try { window.dispatchEvent(new Event(GARMIN_EVENT)) } catch { /* fora do navegador */ }
}

export const getGarmin = () => state
export function useGarmin() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getGarmin)
}

async function api(body, binary = false) {
  const res = await fetch('/api/garmin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error).catch(() => null)
    throw Object.assign(new Error(msg || (res.status === 404 ? 'A importação do Garmin só funciona no app publicado.' : `Erro ${res.status} ao falar com a Garmin.`)), { status: res.status })
  }
  return binary ? res.arrayBuffer() : res.json()
}

/** Confere a chave com a Garmin e guarda neste aparelho. */
export async function connectGarmin(rawKey) {
  const key = String(rawKey ?? '').trim()
  if (key.length < 8) throw new Error('Cole a chave inteira.')
  await api({ action: 'check', key })
  write({ key, connectedAt: new Date().toISOString(), lastSync: null, done: [], pending: [], races: [] })
}

export function disconnectGarmin() {
  write(null)
}

/** Resumo da atividade: o arquivo original (voltas, parciais, traçado) ou, sem ele, os dados da lista. */
async function summaryOf(key, x) {
  if (WITH_FILE.has(x.sport) && x.g.distanceKm > 0) {
    try {
      const buf = await api({ action: 'file', key, id: x.g.id }, true)
      const a = await readActivityFile(new File([buf], `garmin-${x.g.id}.zip`))
      return { ...a, fileName: `garmin-${x.g.id}.fit` }
    } catch { /* arquivo sem pontos ou falhou: usa a lista */ }
  }
  return summaryFromList(x.g)
}

/** Uma atividade da Garmin já resumida, pronta para o arquivo de uma prova (ResultForm). */
export async function garminActivityFor(date) {
  if (!state) return null
  const { activities } = await api({ action: 'list', key: state.key, start: date, end: date })
  const runs = activities.filter((g) => /run/.test(g.type ?? '') && g.distanceKm > 0).sort((a, b) => b.distanceKm - a.distanceKm)
  if (!runs.length) return null
  const g = runs[0]
  const buf = await api({ action: 'file', key: state.key, id: g.id }, true)
  const a = await readActivityFile(new File([buf], `garmin-${g.id}.zip`))
  return { ...a, fileName: `garmin-${g.id}.fit`, garminId: g.id, title: g.name }
}

/**
 * Busca as atividades novas e importa. Retorna { lines, imported, pending, races } ou null se não conectado.
 * force: ignora o intervalo mínimo entre buscas automáticas.
 */
export function syncGarmin({ force = false, full = false } = {}) {
  if (!state) return Promise.resolve(null)
  if (!force && state.lastSync && Date.now() - Date.parse(state.lastSync) < AUTO_EVERY_MS) return Promise.resolve(null)
  if (running) return running
  running = (async () => {
    const s = state
    const today = todayISO()
    const win = syncWindow(s.lastSync, today, full)
    const { activities, shape = null } = await api({ action: 'list', key: s.key, start: win.start, end: win.end, limit: 50 })
    const plan = planGarmin(activities, { workouts: getState().workouts, races: getState().races, done: full ? [] : s.done })
    const lines = []
    const done = [...s.done]
    const pending = [...s.pending]
    const races = [...s.races]
    let imported = 0
    let linked = 0
    let enriched = 0
    for (const x of plan.slice(0, 20)) {
      if (!done.includes(x.g.id)) done.push(x.g.id)
      // Já registrada (arquivo importado à mão, ou a prova com o arquivo do relógio): só liga ao Garmin.
      const twin = getState().workouts.find((w) => w.date === x.date && w.result && !w.result.garminId && sameActivity(w.result, x.g))
      if (twin) {
        let result = { ...twin.result, garminId: x.g.id }
        if (!twin.result.track && WITH_FILE.has(x.sport) && x.g.distanceKm > 0) {
          const a = await summaryOf(s.key, x)
          if (a.track) { result = { ...result, track: a.track, laps: result.laps?.length ? result.laps : a.laps ?? [] }; enriched++ }
        }
        saveWorkout({ ...twin, result })
        linked++
        continue
      }
      if (x.kind === 'prova' && x.race.result?.watch && sameActivity({ distanceKm: x.race.result.watch.distanceKm, elapsedSec: x.race.result.watch.elapsedSec }, x.g)) { linked++; continue }
      if (x.kind === 'prova') {
        races.push({ raceId: x.race.id, garminId: x.g.id, date: x.date })
        lines.push(`${x.g.name || 'Corrida'} (${x.date.slice(8, 10)}/${x.date.slice(5, 7)}): é o dia de “${x.race.name}” — use em Resultado da prova → “Buscar no Garmin”.`)
        continue
      }
      const a = { ...(await summaryOf(s.key, x)), garminId: x.g.id, appSport: x.sport, title: x.g.name }
      const ws = getState().workouts
      if (alreadyImported(ws, a)) { linked++; continue }
      const { auto, candidates } = matchActivity(ws, activityDate(a), x.sport)
      if (auto) {
        saveWorkout({ ...auto, status: 'feito', result: resultFrom(a, auto.result) })
        lines.push(`“${auto.name}” marcado como feito${a.distanceKm ? ` (${String(a.distanceKm.toFixed(2)).replace('.', ',')} km, ${fmtSec(a.elapsedSec)})` : ` (${fmtSec(a.elapsedSec)})`}.`)
        imported++
      } else if (!candidates.length) {
        const fw = freeWorkout(a)
        saveWorkout(fw)
        lines.push(`“${fw.name}” registrado (não havia treino planejado perto).`)
        imported++
      } else {
        pending.push({ a, candidateIds: candidates.map((w) => w.id) })
      }
    }
    const report = { at: new Date().toISOString(), start: win.start, end: win.end, total: activities.length, already: activities.length - plan.length + linked, imported, linked, enriched, waiting: pending.length - s.pending.length, prova: races.length - s.races.length, types: [...new Set(activities.map((g) => g.type).filter(Boolean))].slice(0, 6), first: activities.map(garminDate).filter(Boolean).sort()[0] ?? null, shape }
    write({ ...state, lastSync: report.at, done: done.slice(-400), pending: pending.slice(-20), races: races.slice(-20), report })
    await refreshWellness({ force: force || full }).catch(() => { /* sono é opcional: não atrapalha as atividades */ })
    return { lines, imported, pending: pending.length, races: races.length, report }
  })().finally(() => { running = null })
  return running
}

/**
 * Sono, body battery e FC de repouso dos últimos dias (30 na primeira vez; depois os últimos 3).
 * Ficam só neste aparelho, como a chave. No máximo a cada 3 h, salvo force.
 */
export async function refreshWellness({ force = false } = {}) {
  if (!state) return null
  if (!force && state.wellnessAt && Date.now() - Date.parse(state.wellnessAt) < 3 * 3600 * 1000) return state.wellness ?? null
  const today = todayISO()
  const have = state.wellness && Object.keys(state.wellness).length
  const start = addDaysISO(today, have && !force ? -3 : -30)
  const { days, shape = null } = await api({ action: 'wellness', key: state.key, start, end: today })
  const merged = { ...(state.wellness ?? {}) }
  for (const d of days ?? []) {
    if (!d?.date) continue
    const { date, ...rest } = d
    merged[date] = rest
  }
  const keep = Object.keys(merged).sort().slice(-60)
  write({ ...state, wellness: Object.fromEntries(keep.map((k) => [k, merged[k]])), wellnessAt: new Date().toISOString(), wellnessShape: days?.length ? null : shape })
  return state.wellness
}

/** Tira da fila uma atividade que esperava escolha (já resolvida na tela). */
export function dropPending(garminId) {
  if (!state) return
  write({ ...state, pending: state.pending.filter((p) => p.a.garminId !== garminId) })
}

export function dropRaceHint(raceId) {
  if (!state) return
  write({ ...state, races: state.races.filter((r) => r.raceId !== raceId) })
}
