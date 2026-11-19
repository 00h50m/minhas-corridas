// Ciclo menstrual: registro, previsão pelo histórico DA PRÓPRIA PESSOA, dia do ciclo, a prova e sinais
// que merecem conversa com uma profissional. Não prescreve treino por fase (os efeitos médios são
// pequenos e variam muito de pessoa para pessoa); não é método contraceptivo nem de fertilidade.
import { addDaysISO, daysBetween, isValidISODate } from './dates.js'

export const SYMPTOMS = [
  { id: 'colica', label: 'Cólica' },
  { id: 'cabeca', label: 'Dor de cabeça' },
  { id: 'inchaco', label: 'Inchaço' },
  { id: 'sono', label: 'Sono ruim' },
  { id: 'energia', label: 'Sem energia' },
  { id: 'humor', label: 'Humor / irritação' },
  { id: 'enjoo', label: 'Enjoo' },
  { id: 'seios', label: 'Seios sensíveis' }
]
export const FLOW = ['—', 'Leve', 'Moderado', 'Intenso']
const SYM_IDS = new Set(SYMPTOMS.map((s) => s.id))
const DEFAULT_CYCLE = 28
const DEFAULT_BLEED = 5

export function emptyCycle() {
  return { enabled: false, consentAt: null, hormonal: 'nenhum', periods: [], days: {}, dismissed: [] }
}

/** Valida o que veio do aparelho, da conta ou do Garmin. */
export function normalizeCycle(raw) {
  const c = { ...emptyCycle(), ...(raw && typeof raw === 'object' ? raw : {}) }
  c.enabled = c.enabled === true
  c.consentAt = typeof c.consentAt === 'string' ? c.consentAt.slice(0, 30) : null
  c.hormonal = ['nenhum', 'pilula', 'diu-hormonal', 'implante', 'outro'].includes(c.hormonal) ? c.hormonal : 'nenhum'
  const seen = new Set()
  c.periods = (Array.isArray(c.periods) ? c.periods : [])
    .filter((p) => p && isValidISODate(p.start) && !seen.has(p.start) && seen.add(p.start))
    .map((p) => ({ start: p.start, end: isValidISODate(p.end) && p.end >= p.start && daysBetween(p.start, p.end) <= 14 ? p.end : null, source: p.source === 'garmin' ? 'garmin' : undefined }))
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(-36)
  const days = {}
  for (const [d, v] of Object.entries(c.days && typeof c.days === 'object' ? c.days : {})) {
    if (!isValidISODate(d) || !v || typeof v !== 'object') continue
    const flow = [0, 1, 2, 3].includes(v.flow) ? v.flow : 0
    const symptoms = (Array.isArray(v.symptoms) ? v.symptoms : []).filter((s) => SYM_IDS.has(s)).slice(0, 8)
    const energy = [1, 2, 3, 4, 5].includes(v.energy) ? v.energy : null
    if (flow || symptoms.length || energy) days[d] = { flow, symptoms, energy }
  }
  c.days = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-400))
  c.dismissed = (Array.isArray(c.dismissed) ? c.dismissed : []).filter((x) => typeof x === 'string').slice(0, 10)
  return c
}

/** Duração de cada sangramento (fim registrado; sem fim, não entra na média). */
const bleedOf = (p) => (p.end ? daysBetween(p.start, p.end) + 1 : null)

/**
 * Estatísticas dos últimos 6 ciclos completos: { count, avg, min, max, bleed, regular }.
 * Ciclos fora de 15–60 dias (registro faltando) são ignorados.
 */
export function cycleStats(periods) {
  const starts = periods.map((p) => p.start)
  const lens = []
  for (let i = 1; i < starts.length; i++) {
    const l = daysBetween(starts[i - 1], starts[i])
    if (l >= 15 && l <= 60) lens.push(l)
  }
  const last = lens.slice(-6)
  const bleeds = periods.map(bleedOf).filter((b) => b && b <= 14).slice(-6)
  const avg = last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : null
  return {
    count: last.length,
    avg,
    min: last.length ? Math.min(...last) : null,
    max: last.length ? Math.max(...last) : null,
    bleed: bleeds.length ? Math.round(bleeds.reduce((a, b) => a + b, 0) / bleeds.length) : DEFAULT_BLEED,
    regular: last.length >= 2 ? Math.max(...last) - Math.min(...last) <= 7 : null
  }
}

/** Menstruação em andamento (começou e não terminou, dentro de 10 dias). */
export function ongoing(c, today) {
  const p = c.periods.at(-1)
  return p && !p.end && p.start <= today && daysBetween(p.start, today) <= 10 ? p : null
}

/**
 * Próxima menstruação prevista: { start, from, to, confidence: 'aprendendo'|'boa'|'irregular', len }.
 * Com 1 só registro usa 28 dias e avisa que ainda está aprendendo.
 */
export function predictNext(c, today) {
  const last = c.periods.at(-1)
  if (!last) return null
  const s = cycleStats(c.periods)
  const len = s.avg ?? DEFAULT_CYCLE
  let start = addDaysISO(last.start, len)
  let k = 1
  // Passou da data prevista sem registro: continua prevendo para a frente (no máximo 3 ciclos)
  while (start < today && k < 3 && daysBetween(start, today) > 7) { start = addDaysISO(start, len); k++ }
  const spread = s.count >= 2 ? Math.max(1, Math.ceil((s.max - s.min) / 2)) : 3
  const confidence = s.count < 2 ? 'aprendendo' : s.regular ? 'boa' : 'irregular'
  return { start, from: addDaysISO(start, -spread), to: addDaysISO(start, spread), confidence, len, late: start < today }
}

/** Dia do ciclo numa data (1 = primeiro dia da menstruação), pelo início registrado mais recente. */
export function dayOfCycle(c, date) {
  const p = [...c.periods].reverse().find((x) => x.start <= date)
  if (!p) return null
  const n = daysBetween(p.start, date) + 1
  const s = cycleStats(c.periods)
  return n <= (s.avg ?? DEFAULT_CYCLE) + 15 ? n : null
}

/** Sangramento registrado nesta data? (com fim, ou em andamento até a duração média). */
export function isPeriodDay(c, date, today) {
  const s = cycleStats(c.periods)
  return c.periods.some((p) => {
    const end = p.end ?? (p === c.periods.at(-1) && p.start <= today ? (today > addDaysISO(p.start, s.bleed - 1) ? addDaysISO(p.start, s.bleed - 1) : today) : addDaysISO(p.start, s.bleed - 1))
    return date >= p.start && date <= end
  })
}

/** Menstruação prevista nesta data (futuro, até 3 ciclos à frente). */
export function isPredictedDay(c, date, today) {
  const n = predictNext(c, today)
  if (!n || date < today) return false
  const bleed = cycleStats(c.periods).bleed
  for (let k = 0; k < 3; k++) {
    const st = addDaysISO(n.start, k * n.len)
    if (date >= st && date <= addDaysISO(st, bleed - 1)) return true
  }
  return false
}

/** Fase em palavras simples (sem jargão): para o cartão e a prova. */
export function phaseLabel(c, date, today) {
  if (isPeriodDay(c, date, today)) return 'menstruação'
  const n = dayOfCycle(c, date)
  const next = predictNext(c, today)
  if (next && date < next.start && daysBetween(date, next.start) <= 5) return 'dias antes da menstruação'
  if (!n) return null
  const len = next?.len ?? DEFAULT_CYCLE
  return n <= len / 2 ? 'primeira metade do ciclo' : 'segunda metade do ciclo'
}

/** Média de fluxo e sintomas mais comuns em cada dia do ciclo, pelos registros (para avisar sobre a prova). */
export function typicalDay(c, n) {
  const flows = []
  const sym = new Map()
  for (const [d, v] of Object.entries(c.days)) {
    if (dayOfCycle(c, d) !== n) continue
    if (v.flow) flows.push(v.flow)
    for (const s of v.symptoms) sym.set(s, (sym.get(s) ?? 0) + 1)
  }
  const flow = flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : null
  return { flow, samples: flows.length, symptoms: [...sym.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).map(([s]) => s) }
}

/**
 * A prova no ciclo: { kind: 'menstruacao'|'antes'|null, day, text, heavy, items } ou null.
 * items: itens extras para a reta final quando a prova cai perto da menstruação prevista.
 */
export function raceCycleNote(c, race, today) {
  if (!c?.enabled || !race?.date || race.date < today || !c.periods.length) return null
  const n = predictNext(c, today)
  if (!n) return null
  const bleed = cycleStats(c.periods).bleed
  // Menstruação já registrada que cobre o dia da prova (ex.: prova amanhã, começou ontem)
  if (isPeriodDay(c, race.date, today)) {
    const k = dayOfCycle(c, race.date)
    const t = typicalDay(c, k)
    const heavy = t.flow != null && t.flow >= 2.5
    return { kind: 'menstruacao', day: k, heavy, text: `A prova cai no dia ${k} da menstruação${heavy ? ' — pelo seu histórico, um dia de fluxo intenso' : ''}.` }
  }
  // Início previsto mais perto da prova (avança de ciclo em ciclo)
  let st = n.start
  while (daysBetween(st, race.date) >= n.len - 3) st = addDaysISO(st, n.len)
  const k = daysBetween(st, race.date) + 1 // dia do ciclo na prova (≤ 0: antes do início previsto)
  const fuzzy = n.confidence !== 'boa' ? ' (previsão aproximada)' : ''
  let out = null
  if (k >= 1 && k <= bleed) {
    const t = typicalDay(c, k)
    const heavy = t.flow != null && t.flow >= 2.5
    out = { kind: 'menstruacao', day: k, heavy, text: `Pela sua previsão${fuzzy}, a prova cai no dia ${k} da menstruação${heavy ? ' — pelo seu histórico, um dia de fluxo intenso' : ''}.` }
  } else if (k <= 0 && k >= -3) {
    out = { kind: 'antes', day: k, heavy: false, text: `Pela sua previsão${fuzzy}, a menstruação pode começar perto da prova (${-k + 1 === 1 ? 'no dia seguinte' : `uns ${-k + 1} dias depois`}).` }
  } else if (k > bleed && k <= bleed + 1) {
    out = { kind: 'menstruacao', day: k, heavy: false, text: `Pela sua previsão${fuzzy}, a prova cai logo no fim da menstruação.` }
  }
  return out
}

/** Itens extras da reta final quando a prova cai perto da menstruação. */
export function cycleStretchItems(race, note) {
  if (!note) return []
  const D = race.date
  const items = [
    { id: 'ciclo-teste', date: addDaysISO(D, -14), title: 'Testar no longão o absorvente, coletor ou calcinha que vai usar', desc: `${note.text} Nada de novo no dia: use num treino longo o que pretende usar na prova.` },
    { id: 'ciclo-banheiro', date: addDaysISO(D, -5), title: 'Ver onde ficam os banheiros', desc: 'Na largada, no percurso e na chegada (o regulamento ou o mapa do percurso costumam mostrar).', link: `/corridas/${race.id}/logistica`, linkLabel: 'Abrir logística' },
    { id: 'ciclo-separar', date: addDaysISO(D, -1), title: 'Separar o kit do ciclo', desc: 'Produtos extras, o analgésico que você já usa (o mesmo de sempre, nada novo no dia), roupa escura e uma troca para depois.' }
  ]
  if (note.heavy) items.push({ id: 'ciclo-conversa', date: addDaysISO(D, -21), title: 'Conversar com sua ginecologista sobre o dia da prova', desc: 'Pelo seu histórico, a prova cai num dia de fluxo intenso. Com antecedência, dá para combinar como se cuidar no dia.' })
  return items
}

/** Sinais que merecem conversa com uma profissional (nunca diagnóstico). [{ id, text }] */
export function cycleSignals(c, today) {
  if (!c?.enabled) return []
  const out = []
  const last = c.periods.at(-1)
  const s = cycleStats(c.periods)
  if (last && c.hormonal === 'nenhum' && daysBetween(last.start, today) >= 90) {
    out.push({ id: 'amenorreia', text: 'Faz 3 meses ou mais sem menstruação registrada. Em quem treina, isso pode estar ligado a pouca energia disponível (comer menos do que o treino pede), com efeito nos ossos e no rendimento. Vale conversar com sua ginecologista.' })
  }
  if (s.count >= 3 && (s.avg < 21 || s.avg > 35)) {
    out.push({ id: 'duracao', text: `Seus ciclos têm durado em média ${s.avg} dias (o comum é entre 21 e 35). Vale comentar com sua ginecologista.` })
  }
  const recent = Object.entries(c.days).filter(([d]) => d >= addDaysISO(today, -70))
  const heavy = recent.filter(([, v]) => v.flow === 3).length
  const tired = recent.filter(([, v]) => v.energy && v.energy <= 2 || v.symptoms.includes('energia')).length
  if (heavy >= 4 && tired >= 4) {
    out.push({ id: 'ferro', text: 'Fluxo intenso com cansaço frequente nos últimos ciclos. A falta de ferro é comum em corredoras e derruba o rendimento: vale pedir à sua médica para checar ferro e ferritina.' })
  }
  const cramps = recent.filter(([, v]) => v.symptoms.includes('colica') && v.energy && v.energy <= 2).length
  if (cramps >= 4) out.push({ id: 'colica', text: 'Cólicas fortes com energia baixa em vários dias recentes. Se atrapalham treinar, vale conversar com sua ginecologista.' })
  return out.filter((x) => !c.dismissed.includes(x.id))
}

/** Marca o início (hoje ou outra data). Se já houver um registro nos 10 dias antes, não duplica. */
export function startPeriod(c, date) {
  const near = c.periods.find((p) => p.start <= date && daysBetween(p.start, date) <= 10)
  if (near) return c
  return normalizeCycle({ ...c, periods: [...c.periods, { start: date, end: null }] })
}

/** Marca o fim da menstruação em andamento. */
export function endPeriod(c, date) {
  const p = [...c.periods].reverse().find((x) => x.start <= date)
  if (!p) return c
  return normalizeCycle({ ...c, periods: c.periods.map((x) => (x === p ? { ...x, end: date } : x)) })
}

/** Registro do dia (fluxo, sintomas, energia). */
export function logDay(c, date, patch) {
  const cur = c.days[date] ?? { flow: 0, symptoms: [], energy: null }
  return normalizeCycle({ ...c, days: { ...c.days, [date]: { ...cur, ...patch } } })
}

/** Junta inícios vindos do Garmin (sem apagar os registrados à mão). */
export function mergeStarts(c, starts, periodLen = null) {
  const have = new Set(c.periods.map((p) => p.start))
  const add = starts.filter((s) => isValidISODate(s) && ![...have].some((h) => Math.abs(daysBetween(h, s)) <= 5))
  return { cycle: normalizeCycle({ ...c, periods: [...c.periods, ...add.map((s) => ({ start: s, end: periodLen ? addDaysISO(s, periodLen - 1) : null, source: 'garmin' }))] }), added: add.length }
}

/* ---------- Fase 2: o padrão dela, com os treinos que o app já tem ---------- */

export const PHASES = [
  { id: 'menstruacao', label: 'Menstruação' },
  { id: 'primeira', label: 'Primeira metade' },
  { id: 'segunda', label: 'Segunda metade' },
  { id: 'antes', label: '5 dias antes' }
]

/**
 * Fase de uma data já vivida, pelo ciclo registrado em que ela cai (do início até o próximo início):
 * 'menstruacao' | 'antes' | 'primeira' | 'segunda' | null (antes do 1º registro ou ciclo sem fim plausível).
 */
export function phaseOf(c, date) {
  const i = c.periods.findLastIndex((p) => p.start <= date)
  if (i < 0) return null
  const p = c.periods[i]
  const next = c.periods[i + 1]?.start ?? null
  const s = cycleStats(c.periods)
  const len = next ? daysBetween(p.start, next) : s.avg ?? DEFAULT_CYCLE
  if (len < 15 || len > 60) return null
  const n = daysBetween(p.start, date) + 1
  if (n > len) return null
  const bleed = bleedOf(p) ?? s.bleed
  if (n <= bleed) return 'menstruacao'
  if (len - n < 5) return 'antes'
  return n <= len / 2 ? 'primeira' : 'segunda'
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const easyRun = (w) => (w.sport ?? 'corrida') === 'corrida' && !(w.items ?? []).some((it) => it.kind === 'repeat' || it.type === 'tiro')
const MIN_N = 5

/**
 * Padrões pessoais por fase (só com 3+ ciclos completos): pace das rodagens (sem tiros, 2+ km), FC média,
 * energia anotada e treinos não feitos/remanejados. Sempre com o tamanho da amostra; < 5 → “poucos dados”.
 * { ready, cycles, phases: [{ id, label, runs, pace, hr, energy, energyDays, planned, missed }], insights: [texto] }
 */
export function cyclePatterns(c, workouts = [], today) {
  const cycles = cycleStats(c.periods).count
  const ready = c.enabled && cycles >= 3
  const by = Object.fromEntries(PHASES.map((p) => [p.id, { ...p, paces: [], hrs: [], energies: [], planned: 0, missed: 0 }]))
  if (ready) {
    for (const w of workouts) {
      if (!w.date || w.date > today) continue
      const ph = phaseOf(c, w.date)
      if (!ph) continue
      const b = by[ph]
      b.planned++
      if (w.status === 'pulado' || w.moves?.some((m) => phaseOf(c, m.from) === ph)) b.missed++
      const r = w.result
      if (w.status === 'feito' && r && easyRun(w) && r.distanceKm >= 2 && r.elapsedSec > 0) {
        b.paces.push(r.elapsedSec / r.distanceKm)
        if (r.avgHr) b.hrs.push(r.avgHr)
      }
    }
    for (const [d, v] of Object.entries(c.days)) {
      if (!v.energy || d > today) continue
      const ph = phaseOf(c, d)
      if (ph) by[ph].energies.push(v.energy)
    }
  }
  const phases = PHASES.map((p) => {
    const b = by[p.id]
    return { id: p.id, label: p.label, runs: b.paces.length, pace: avg(b.paces), hr: avg(b.hrs), hrN: b.hrs.length, energy: avg(b.energies), energyDays: b.energies.length, planned: b.planned, missed: b.missed }
  })
  const insights = []
  if (ready) {
    const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1)
    for (const ph of phases) {
      const name = ph.id === 'menstruacao' ? 'Nos dias de menstruação' : ph.id === 'antes' ? 'Nos 5 dias antes da menstruação' : `Na ${lower(ph.label)} do ciclo`
      const rest = phases.filter((x) => x.id !== ph.id)
      if (ph.runs >= MIN_N) {
        const base = avg(rest.flatMap((x) => by[x.id].paces))
        if (base != null) {
          const diff = Math.round(ph.pace - base)
          insights.push(Math.abs(diff) >= 8
            ? `${name}, suas rodagens foram em média ${Math.abs(diff)} s/km mais ${diff > 0 ? 'lentas' : 'rápidas'} (${ph.runs} treinos em ${cycles} ciclos).`
            : `${name}: sem diferença clara no seu ritmo (${ph.runs} treinos).`)
        }
        if (ph.hrN >= MIN_N) {
          const hb = avg(rest.flatMap((x) => by[x.id].hrs))
          if (hb != null && Math.abs(ph.hr - hb) >= 4) insights.push(`${name}, a FC média nas rodagens ficou ${Math.round(Math.abs(ph.hr - hb))} bpm ${ph.hr > hb ? 'mais alta' : 'mais baixa'}.`)
        }
      }
      if (ph.energyDays >= MIN_N) {
        const eb = avg(rest.flatMap((x) => by[x.id].energies))
        if (eb != null && eb - ph.energy >= 0.8) insights.push(`${name}, você costuma anotar menos energia (${String(Math.round(ph.energy * 10) / 10).replace('.', ',')} de 5, em ${ph.energyDays} dias).`)
      }
      if (ph.planned >= MIN_N && ph.missed / ph.planned >= 0.3) insights.push(`${name}, ${ph.missed} de ${ph.planned} treinos ficaram para outro dia ou não foram feitos.`)
    }
  }
  return { ready, cycles, phases, insights }
}

/** Dia do ciclo previsto numa data futura (pela previsão), ou o atual. */
function cycleDayAt(c, date, today) {
  const n = predictNext(c, today)
  if (n && date >= n.start) return (daysBetween(n.start, date) % n.len) + 1
  return dayOfCycle(c, date)
}

/**
 * Aviso (não bloqueio) para remanejar um treino forte: o dia cai num dia do ciclo em que ela costuma
 * registrar energia baixa ou fluxo intenso (pelos registros dela, 3+ ciclos). Texto ou null.
 */
export function hardDayNote(c, date, today) {
  if (!c?.enabled || cycleStats(c.periods).count < 3) return null
  const n = cycleDayAt(c, date, today)
  if (!n) return null
  const energies = []
  const flows = []
  for (const [d, v] of Object.entries(c.days)) {
    if (d > today || dayOfCycle(c, d) !== n) continue
    if (v.energy) energies.push(v.energy)
    if (v.flow) flows.push(v.flow)
  }
  const lowEnergy = energies.length >= 2 && avg(energies) <= 2
  const heavy = flows.length >= 2 && avg(flows) >= 2.5
  if (!lowEnergy && !heavy) return null
  return `nos seus últimos ciclos, este dia costuma ser difícil (${lowEnergy ? 'energia baixa' : 'fluxo intenso'})`
}
