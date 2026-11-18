// Partes leves do arquivo do relógio usadas já na abertura do app (validação do resumo e faixas de FC).
// O leitor completo (FIT, TCX, GPX) fica em activityFile.js e só carrega quando um arquivo é importado.

/** Faixas de FC do histograma: a partir de 60 bpm, de 5 em 5. */
export const HR_FROM = 60
export const HR_STEP = 5

/** Valida o resumo guardado no resultado (vindo de backup ou da nuvem). */
export function isValidWatch(w) {
  return !!w && typeof w === 'object' && w.distanceKm > 0 && w.elapsedSec > 0 && Array.isArray(w.splits)
}
