// “Vale a pena?”: uma nota de 0 a 100 para cada prova em avaliação, com os critérios à mostra.
// Cada critério vira 0–1; o que não dá para avaliar (sem preço, sem data…) fica de fora em vez de
// pesar contra. Os pesos vêm de perfis simples (equilíbrio, economia, desempenho). É uma ajuda para
// comparar; a escolha continua sendo da pessoa.
import { raceCosts } from './costs.js'
import { distanceKey } from './stats.js'
import { formatKm, formatMoney } from './format.js'

export const PROFILES = [
  { id: 'equilibrio', label: 'Equilíbrio', w: { custo: 2, calendario: 2, orcamento: 1.5, desafio: 1.5, vontade: 2, perto: 1 } },
  { id: 'economia', label: 'Economia', w: { custo: 4, calendario: 1.5, orcamento: 3, desafio: 1, vontade: 1.5, perto: 2.5 } },
  { id: 'desempenho', label: 'Desempenho', w: { custo: 1, calendario: 3, orcamento: 1, desafio: 3, vontade: 2, perto: 0.5 } }
]
export const CRITERIA = { custo: 'Custo por km', calendario: 'Calendário', orcamento: 'Orçamento', desafio: 'Desafio', vontade: 'Vontade', perto: 'Perto de casa' }

const lerp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)))
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }

/** Quanto você costuma pagar por km (mediana das provas pagas, inscritas ou concluídas), ou null. */
export function typicalPerKm(races) {
  const vals = races
    .filter((r) => ['inscrita', 'concluida'].includes(r.status) && r.distanceKm > 0)
    .map((r) => { const c = raceCosts(r); const v = c.total > 0 ? c.total : c.planned; return v > 0 ? v / r.distanceKm : null })
    .filter((v) => v != null)
  return vals.length >= 2 ? Math.round(median(vals) * 100) / 100 : null
}

/**
 * Nota de uma prova a partir do decisionInfo (d). ctx: { races, homeCity, typical, profile }
 * → { score (0–100) | null, parts: [{ key, label, value 0–1, text, tone }], best: [texto], caveat: texto | null }
 */
export function worthScore(d, { races = [], homeCity = '', typical = null, profile = 'equilibrio' } = {}) {
  const r = d.race
  const W = (PROFILES.find((p) => p.id === profile) ?? PROFILES[0]).w
  const parts = []
  const add = (key, value, text) => parts.push({ key, label: CRITERIA[key], value, text, tone: value >= 0.7 ? 'good' : value >= 0.4 ? 'info' : 'bad' })

  // Custo por km × o que você costuma pagar (sem histórico, uma régua fixa: R$ 15/km ótimo, R$ 45/km caro)
  const perKm = d.cost?.perKm
  // Sem preço: conta como neutro e a nota fica provisória (não dá para dizer que “vale mais a pena”)
  if (perKm == null) parts.push({ key: 'custo', label: CRITERIA.custo, value: 0.5, text: 'Sem preço cadastrado: nota provisória', tone: 'info' })
  else {
    if (perKm === 0) add('custo', 1, 'Gratuita')
    else if (typical) {
      const ratio = perKm / typical
      add('custo', 1 - lerp(ratio, 0.7, 1.5), `${formatMoney(perKm)}/km · ${ratio <= 0.95 ? 'abaixo' : ratio >= 1.05 ? 'acima' : 'perto'} do que você costuma pagar (${formatMoney(typical)}/km)`)
    } else add('custo', 1 - lerp(perKm, 15, 45), `${formatMoney(perKm)}/km`)
  }

  // Calendário: mesmo dia zera; quanto mais folga até a prova mais próxima, melhor
  if (r.date) {
    if (d.sameDay.length) add('calendario', 0, `Mesmo dia de ${d.sameDay.map((x) => x.name).join(', ')}`)
    else if (!d.near.length) add('calendario', 1, 'Sem outra prova num raio de 3 semanas')
    else {
      const gap = Math.abs(d.near[0].days)
      add('calendario', gap >= 14 ? 0.9 : gap >= 7 ? 0.65 : gap >= 3 ? 0.35 : 0.15, `${gap} ${gap === 1 ? 'dia' : 'dias'} ${d.near[0].days > 0 ? 'depois de' : 'antes de'} ${d.near[0].race.name}`)
    }
  }

  // Orçamento (só com um orçamento definido)
  if (d.budget && !d.budget.missing) add('orcamento', d.budget.level === 'ok' ? 1 : d.budget.level === 'atencao' ? 0.45 : 0, d.budget.level === 'estourou' ? `Estoura o orçamento em ${formatMoney(-d.budget.remaining)}` : d.budget.level === 'atencao' ? `Orçamento chega a ${Math.round(d.budget.pct * 100)}%` : `Cabe no orçamento (sobram ${formatMoney(d.budget.remaining)})`)

  // Desafio: objetivo, distância nova ou chance de recorde
  if (r.distanceKm) {
    const done = races.filter((x) => x.status === 'concluida' && x.result?.netTime && x.distanceKm)
    const longest = Math.max(0, ...done.map((x) => x.result.officialDistanceKm ?? x.distanceKm))
    const sameDist = done.some((x) => distanceKey(x.result.officialDistanceKm ?? x.distanceKm) === distanceKey(r.distanceKm))
    if (d.goals.length) add('desafio', 1, d.goals[0].text)
    else if (r.distanceKm > longest + 0.4) add('desafio', 0.95, `Distância nova: seus primeiros ${formatKm(r.distanceKm)}`)
    else if (!sameDist) add('desafio', 0.8, `Primeira vez em ${formatKm(r.distanceKm)}`)
    else if (d.history.length) add('desafio', 0.55, 'Já correu esta prova: dá para comparar com a edição anterior')
    else add('desafio', 0.5, `Mais uma de ${formatKm(r.distanceKm)}`)
  }

  // Vontade (as estrelas)
  if (r.wish) add('vontade', { 1: 0.35, 2: 0.7, 3: 1 }[r.wish] ?? 0.5, { 1: 'Talvez', 2: 'Quero', 3: 'Quero muito' }[r.wish])

  // Perto de casa (cidade do perfil)
  if (homeCity && r.city) add('perto', norm(homeCity) === norm(r.city) ? 1 : 0.45, norm(homeCity) === norm(r.city) ? `Na sua cidade (${r.city})` : `Em ${r.city}: conte o deslocamento`)

  const scored = parts.filter((p) => W[p.key] > 0)
  if (!scored.length) return { score: null, parts, best: [], caveat: null, missing: missingInfo(r, d) }
  const sw = scored.reduce((a, p) => a + W[p.key], 0)
  const score = Math.round((scored.reduce((a, p) => a + p.value * W[p.key], 0) / sw) * 100)
  const byImpact = [...scored].sort((a, b) => b.value * W[b.key] - a.value * W[a.key])
  const best = byImpact.filter((p) => p.value >= 0.7).slice(0, 2).map((p) => p.text)
  const worst = [...scored].sort((a, b) => a.value - b.value)[0]
  return { score, parts, best, caveat: worst && worst.value < 0.4 ? worst.text : null, missing: missingInfo(r, d), provisional: perKm == null }
}

/** O que falta cadastrar para a nota ficar completa. */
function missingInfo(r, d) {
  const m = []
  if (d.cost?.total == null) m.push('preço')
  if (!r.date) m.push('data')
  if (!r.wish) m.push('vontade (estrelas)')
  return m
}

/** Ordena por nota (as sem nota no fim) e marca a melhor entre as de nota completa: só com nota boa (55+) e diferença clara. */
export function rankByWorth(items) {
  const sorted = [...items].sort((a, b) => (b.w.score ?? -1) - (a.w.score ?? -1))
  const [first, second] = sorted.filter((x) => !x.w.provisional)
  const top = first && first.w.score >= 55 && (!second || second.w.score == null || first.w.score - second.w.score >= 5) ? first.r.id : null
  return { sorted, top }
}
