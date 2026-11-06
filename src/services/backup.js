import { SCHEMA_VERSION } from './store.js'
import { normalizeGoal, normalizeRace, validateGoal, validateRace, validateResult } from '../lib/model.js'
import { todayISO } from '../lib/dates.js'
import { FILE_KIND_LABEL, base64ToBlob, blobToBase64 } from './files.js'

/**
 * Monta o JSON do backup. `files` (opcional) são registros do IndexedDB;
 * quando presentes, vão em base64 dentro do próprio arquivo.
 */
export async function buildBackup(races, goals = [], files = null) {
  const data = { app: 'minhas-corridas', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), races, goals }
  if (files) {
    data.files = []
    for (const f of files) {
      if (!f.blob) continue // ainda não baixado da nuvem
      data.files.push({ id: f.id, raceId: f.raceId, kind: f.kind, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, data: await blobToBase64(f.blob) })
    }
  }
  return JSON.stringify(data, null, files ? 0 : 2)
}

export function backupFileName(withFiles) {
  return `paceon-backup${withFiles ? '-com-anexos' : ''}-${todayISO()}.json`
}

/** Valida o JSON de backup. Retorna { races, goals, files|null } ou lança erro com mensagem amigável. */
export function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!data || data.app !== 'minhas-corridas' || !Array.isArray(data.races)) {
    throw new Error('Este arquivo não parece ser um backup do PaceOn.')
  }
  if (typeof data.version !== 'number' || data.version > SCHEMA_VERSION) {
    throw new Error('Backup de uma versão mais nova do app. Atualize o app antes de restaurar.')
  }
  const ids = new Set()
  const races = data.races.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || !raw.id) throw new Error(`Corrida ${i + 1} do backup está incompleta.`)
    if (ids.has(raw.id)) throw new Error(`Corrida duplicada no backup (${raw.name || raw.id}).`)
    ids.add(raw.id)
    const r = normalizeRace(raw)
    const errs = validateRace(r)
    if (Object.keys(errs).length) throw new Error(`"${r.name || 'Sem nome'}": ${Object.values(errs)[0]}`)
    if (r.result) {
      const rerrs = validateResult(r.result)
      if (Object.keys(rerrs).length) throw new Error(`Resultado de "${r.name}": ${Object.values(rerrs)[0]}`)
    }
    return r
  })

  const goalIds = new Set()
  const goals = (Array.isArray(data.goals) ? data.goals : []).map((raw, i) => {
    if (!raw || typeof raw !== 'object' || !raw.id) throw new Error(`Objetivo ${i + 1} do backup está incompleto.`)
    if (goalIds.has(raw.id)) throw new Error(`Objetivo duplicado no backup (${raw.title || raw.id}).`)
    goalIds.add(raw.id)
    const g = normalizeGoal(raw)
    const errs = validateGoal(g)
    if (Object.keys(errs).length) throw new Error(`Objetivo "${g.title || 'Sem título'}": ${Object.values(errs)[0]}`)
    return g
  })

  let files = null
  if (Array.isArray(data.files)) {
    files = data.files.map((f, i) => {
      if (!f || !f.id || !f.raceId || typeof f.data !== 'string' || !FILE_KIND_LABEL[f.kind]) throw new Error(`Anexo ${i + 1} do backup está incompleto.`)
      let blob
      try {
        blob = base64ToBlob(f.data, f.type || 'application/octet-stream')
      } catch {
        throw new Error(`Anexo “${f.name || i + 1}” está corrompido.`)
      }
      return { id: f.id, raceId: f.raceId, kind: f.kind, name: f.name || 'arquivo', type: f.type, size: blob.size, createdAt: f.createdAt || new Date().toISOString(), blob }
    }).filter((f) => ids.has(f.raceId))
  }

  return { races, goals, files, exportedAt: data.exportedAt ?? null }
}

export function downloadText(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
