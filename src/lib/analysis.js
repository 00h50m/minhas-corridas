// Análise de uma prova concluída e plano de ritmo para a próxima tentativa.
// Só usa dados registrados no app; não prescreve treinos.
import { byDateAsc, distanceKey } from './stats.js'
import { formatDuration, formatKm, formatPace } from './format.js'
import { formatDateBR, todayISO } from './dates.js'

const pct = (a, b) => (a - b) / b

function sameDistance(a, b) {
  return a != null && b != null && distanceKey(a) === distanceKey(b)
}

/** "+0:12/km" ou "−0:08/km" */
export function formatDeltaPace(secPerKm) {
  const s = Math.round(Math.abs(secPerKm))
  return `${secPerKm < 0 ? '−' : '+'}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
}

/** Leitura do ritmo a partir das parciais por km do relógio. */
export function pacingFrom(splits) {
  const full = (splits ?? []).filter((s) => !s.partial)
  if (full.length < 3) return null
  const secs = full.map((s) => s.sec)
  const avg = secs.reduce((a, b) => a + b, 0) / secs.length
  const half = Math.floor(secs.length / 2)
  const first = secs.slice(0, half)
  const second = secs.slice(secs.length - half)
  const fAvg = first.reduce((a, b) => a + b, 0) / first.length
  const sAvg = second.reduce((a, b) => a + b, 0) / second.length
  const diff = pct(sAvg, fAvg)
  const type = diff < -0.015 ? 'negativo' : diff > 0.015 ? 'positivo' : 'uniforme'
  const sd = Math.sqrt(secs.reduce((s, x) => s + (x - avg) ** 2, 0) / secs.length)
  const third = Math.max(1, Math.floor(secs.length / 3))
  const lastAvg = secs.slice(-third).reduce((a, b) => a + b, 0) / third
  const fastStart = secs[0] < avg * 0.97 && lastAvg > avg * 1.02
  // Primeiro km em que o ritmo cai mais de 4% em relação à média do início (quebra).
  let fadeKm = null
  if (type === 'positivo') {
    const base = fAvg
    const k = full.findIndex((s, i) => i >= half && s.sec > base * 1.04)
    if (k >= 0) fadeKm = full[k].km
  }
  const fastest = full.reduce((b, s) => (s.sec < b.sec ? s : b))
  const slowest = full.reduce((b, s) => (s.sec > b.sec ? s : b))
  return { type, firstHalf: fAvg, secondHalf: sAvg, diff, cv: sd / avg, fastStart, fadeKm, fastest, slowest, count: full.length }
}

/**
 * Análise de uma prova concluída.
 * Retorna { verdict, items: [{ tone, title, text }] } ou null se não houver resultado.
 */
export function analyzeRace(race, races, goals = []) {
  const res = race.result
  if (!res?.netTime || !res.officialDistanceKm) return null
  const km = res.officialDistanceKm
  const pace = res.netTime / km
  const items = []
  let verdict = null

  // 1) Meta x resultado
  if (race.targetTime) {
    const d = res.netTime - race.targetTime
    const tPace = race.targetTime / km
    verdict = d <= 0 ? 'meta-batida' : pct(res.netTime, race.targetTime) <= 0.02 ? 'perto' : 'abaixo'
    items.push({
      tone: d <= 0 ? 'ok' : 'warn',
      title: d <= 0 ? `Meta batida por ${formatDuration(-d) === '0:00' ? 'alguns segundos' : formatDuration(-d)}` : `Faltaram ${formatDuration(d)} para a meta`,
      text: `Planejado ${formatPace(tPace)} (${formatDuration(race.targetTime)}); feito ${formatPace(pace)} (${formatDuration(res.netTime)}) — ${formatDeltaPace(pace - tPace)} em relação ao plano.`
    })
  }

  // 2) Objetivos de tempo na mesma distância
  for (const g of goals.filter((g) => g.type === 'tempo' && g.status !== 'pausado' && sameDistance(g.distanceKm, km))) {
    const d = res.netTime - g.targetValue
    items.push({
      tone: d < 0 ? 'ok' : 'info',
      title: `Objetivo “${g.title}”`,
      text: d < 0
        ? res.isOfficial ? `Este resultado cumpre o objetivo (${formatDuration(-d)} abaixo).` : `O tempo está abaixo da marca, mas é registro pessoal — não conta para o objetivo.`
        : `Ainda faltam ${formatDuration(d)} — ${formatDeltaPace(d / km).replace('+', '')} mais rápido por km.`
    })
  }

  // 3) Ritmo ao longo da prova (parciais do relógio)
  const p = pacingFrom(res.watch?.splits)
  if (p) {
    const label = { negativo: 'Segunda metade mais rápida (split negativo)', uniforme: 'Ritmo uniforme', positivo: 'Segunda metade mais lenta' }[p.type]
    let text = `1ª metade ${formatPace(p.firstHalf)}, 2ª metade ${formatPace(p.secondHalf)}. Km mais rápido: ${formatKm(p.fastest.km, { unit: false })}º (${formatDuration(p.fastest.sec)}); mais lento: ${formatKm(p.slowest.km, { unit: false })}º (${formatDuration(p.slowest.sec)}).`
    if (p.fastStart) text += ' A largada foi bem mais rápida que a média e o fim ficou mais lento — sinal de saída forte demais.'
    else if (p.fadeKm) text += ` O ritmo começou a cair por volta do km ${formatKm(p.fadeKm, { unit: false })}.`
    items.push({ tone: p.type === 'positivo' ? 'warn' : 'ok', title: label, text })
  } else if (res.watch == null) {
    items.push({ tone: 'info', title: 'Sem parciais por km', text: 'Anexe o arquivo do relógio (TCX, GPX ou FIT) no resultado para ver onde ganhou ou perdeu tempo.' })
  }

  // 4) Esforço percebido combinado com o ritmo
  if (res.effort != null) {
    if (res.effort >= 9 && p?.type === 'positivo') items.push({ tone: 'info', title: `Esforço ${res.effort}/10`, text: 'Esforço muito alto com queda no fim: provavelmente o ritmo inicial passou do sustentável para o dia.' })
    else if (res.effort <= 6 && race.targetTime && res.netTime > race.targetTime) items.push({ tone: 'info', title: `Esforço ${res.effort}/10`, text: 'Você terminou com esforço moderado — pode ter havido margem para um ritmo um pouco mais forte.' })
    else if (res.effort >= 8 && verdict === 'meta-batida') items.push({ tone: 'ok', title: `Esforço ${res.effort}/10`, text: 'Prova bem dosada: esforço alto e meta cumprida.' })
  }

  // 5) Distância do relógio x oficial
  if (res.watchDistanceKm && pct(res.watchDistanceKm, km) > 0.015) {
    const extra = Math.round((res.watchDistanceKm - km) * 1000)
    items.push({ tone: 'info', title: `${extra} m a mais no relógio`, text: `É comum (curvas, desvios e GPS). No relógio seu pace foi ${formatPace(res.netTime / res.watchDistanceKm)}; o oficial, ${formatPace(pace)}.` })
  }

  // 6) Comparação com provas anteriores na mesma distância (resultados oficiais)
  const earlier = races
    .filter((r) => r.id !== race.id && r.status === 'concluida' && r.result?.isOfficial && r.result.netTime && sameDistance(r.result.officialDistanceKm, km) && r.date && r.date < race.date)
    .sort(byDateAsc)
  if (earlier.length) {
    const last = earlier[earlier.length - 1]
    const best = earlier.reduce((b, r) => (r.result.netTime < b.result.netTime ? r : b))
    const dLast = res.netTime - last.result.netTime
    const parts = [`${dLast <= 0 ? `${formatDuration(-dLast)} mais rápida` : `${formatDuration(dLast)} mais lenta`} que ${last.name} (${formatDateBR(last.date)}).`]
    if (res.isOfficial && res.netTime < best.result.netTime) parts.push(`Novo recorde pessoal nos ${formatKm(km)} — ${formatDuration(best.result.netTime - res.netTime)} abaixo do anterior.`)
    else if (best.id !== last.id || dLast > 0) parts.push(`Seu recorde segue ${formatDuration(best.result.netTime)} (${best.name}).`)
    items.push({ tone: res.isOfficial && res.netTime < best.result.netTime ? 'ok' : 'info', title: 'Em relação às suas provas', text: parts.join(' ') })
  } else {
    items.push({ tone: 'info', title: `Primeira prova de ${formatKm(km)} registrada`, text: 'Ela vira a referência para as próximas nesta distância.' })
  }

  return { verdict, pace, items }
}

/** Tabela de passagem para um tempo-alvo em ritmo constante. */
export function paceTable(targetSec, km) {
  if (!(targetSec > 0 && km > 0)) return []
  const pace = targetSec / km
  const step = km > 25 ? 5 : km > 12 ? 2.5 : 1
  const marks = []
  for (let d = step; d < km - 0.05; d += step) marks.push(Math.round(d * 10) / 10)
  if (km > 12) marks.push(Math.round((km / 2) * 1000) / 1000)
  marks.push(km)
  return [...new Set(marks)].sort((a, b) => a - b).map((d) => ({ km: d, at: Math.round(pace * d), half: Math.abs(d - km / 2) < 0.01 && km > 12 }))
}

/**
 * Plano para um objetivo de tempo: quanto falta, pace necessário, meta intermediária e provas candidatas.
 */
export function goalPlan(goal, races, today = todayISO()) {
  if (goal.type !== 'tempo' || !goal.distanceKm || !goal.targetValue) return null
  const km = goal.distanceKm
  const targetPace = goal.targetValue / km
  const results = races
    .filter((r) => r.status === 'concluida' && r.result?.isOfficial && r.result.netTime && sameDistance(r.result.officialDistanceKm, km))
    .sort(byDateAsc)
  const best = results.reduce((b, r) => (!b || r.result.netTime < b.result.netTime ? r : b), null)
  const out = { km, targetPace, table: paceTable(goal.targetValue - 1, km), best, gap: null, perKm: null, milestone: null, trend: null, candidates: [] }

  if (best) {
    out.gap = best.result.netTime - goal.targetValue
    out.perKm = out.gap / km
    // Diferença grande (>3%): sugere um degrau intermediário, arredondado para 5 s.
    if (out.gap > 0 && pct(best.result.netTime, goal.targetValue) > 0.03) {
      const mid = Math.round((best.result.netTime - out.gap / 2) / 5) * 5
      out.milestone = { time: mid, pace: mid / km }
    }
  }
  // Tendência: só com 3+ resultados oficiais, compara a média das últimas provas.
  if (results.length >= 3) {
    const last3 = results.slice(-3).map((r) => r.result.netTime)
    const perRace = (last3[2] - last3[0]) / 2
    out.trend = { perRace, improving: perRace < 0, races: Math.min(results.length, 3) }
  }
  out.candidates = races
    .filter((r) => ['interesse', 'aberta', 'inscrita'].includes(r.status) && r.date && r.date >= today && (!goal.deadline || r.date <= goal.deadline) && sameDistance(r.distanceKm, km))
    .sort(byDateAsc)
    .slice(0, 5)
  return out
}
