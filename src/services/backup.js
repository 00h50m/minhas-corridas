import { SCHEMA_VERSION } from './store.js'
import { normalizeRace, validateRace, validateResult } from '../lib/model.js'
import { todayISO } from '../lib/dates.js'

export function buildBackup(races) {
  return JSON.stringify({ app: 'minhas-corridas', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), races }, null, 2)
}

export function backupFileName() {
  return `minhas-corridas-backup-${todayISO()}.json`
}

/** Valida o JSON de backup. Retorna { races } ou lança erro com mensagem amigável. */
export function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!data || data.app !== 'minhas-corridas' || !Array.isArray(data.races)) {
    throw new Error('Este arquivo não parece ser um backup do Minhas Corridas.')
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
  return { races, exportedAt: data.exportedAt ?? null }
}

export function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
