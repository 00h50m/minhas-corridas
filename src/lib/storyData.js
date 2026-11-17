// Conteúdo dos stories da rotina de corredora (sem endereços nem valores; tempos e cidades opcionais).
// Cada modelo devolve { ok, reason?, ... } — o desenho fica em drawStory.js.
import { byDateAsc, history, upcoming } from './stats.js'
import { daysBetween, formatDateBR, weekdayShort, yearOf } from './dates.js'
import { formatDuration, formatKm, formatPace } from './format.js'
import { weekStart, weekStreak, weekSummary, workoutState, DOW_SHORT } from './trainingWeek.js'
import { paceSeriesWithTests } from './evolution.js'
import { passport } from './passport.js'
import { compareLaps, isRun, plannedSec, sportOf, workoutLine } from './workout.js'

export const STORY_TEMPLATES = [
  { id: 'proximas', label: 'Próximas provas' },
  { id: 'temporada', label: 'Temporada' },
  { id: 'semana', label: 'Semana de treinos' },
  { id: 'contagem', label: 'Contagem' },
  { id: 'evolucao', label: 'Evolução nos 5 km' },
  { id: 'treino', label: 'Treino concluído' },
  { id: 'conquista', label: 'Conquista' }
]

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const dayMonth = (iso) => ({ day: String(Number(iso.slice(8, 10))), month: MONTHS[Number(iso.slice(5, 7)) - 1], weekday: weekdayShort(iso).toUpperCase() })
const place = (r, opts) => (opts.cities && r.city ? `${r.city}${r.state ? `/${r.state}` : ''}` : null)
const km = (n) => (n ? formatKm(n) : null)

/** Próximas provas (inscritas primeiro, depois as de interesse), até 5. */
export function storyProximas(races, today, opts = {}) {
  const list = upcoming(races, today, 30)
  const sorted = [...list.filter((r) => r.status === 'inscrita'), ...list.filter((r) => r.status !== 'inscrita')].slice(0, 5).sort(byDateAsc)
  if (!sorted.length) return { ok: false, reason: 'Nenhuma prova com data à frente.' }
  return {
    ok: true,
    title: 'Próximas provas',
    subtitle: `${list.filter((r) => r.status === 'inscrita').length} inscritas · ${list.length} no calendário`,
    items: sorted.map((r) => ({ ...dayMonth(r.date), name: r.name, line: [km(r.distanceKm), place(r, opts), r.status === 'inscrita' ? null : 'ainda decidindo'].filter(Boolean).join(' · '), confirmed: r.status === 'inscrita', days: daysBetween(today, r.date) }))
  }
}

/** Temporada do ano: concluídas × próximas, km em provas, melhores tempos e a próxima prova. */
export function storyTemporada(races, today, opts = {}) {
  const year = Number(today.slice(0, 4))
  const done = history(races).filter((r) => yearOf(r.date) === year)
  const next = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today && yearOf(r.date) === year).sort(byDateAsc)
  if (!done.length && !next.length) return { ok: false, reason: `Nenhuma prova em ${year} ainda.` }
  const kmDone = Math.round(done.reduce((s, r) => s + (r.result?.officialDistanceKm ?? r.distanceKm ?? 0), 0) * 10) / 10
  const bests = []
  if (opts.times) {
    const by = new Map()
    for (const r of done) {
      const k = r.result?.officialDistanceKm
      if (!k || !r.result.netTime) continue
      if (!by.has(k) || r.result.netTime < by.get(k).result.netTime) by.set(k, r)
    }
    for (const [k, r] of [...by.entries()].sort((a, b) => a[0] - b[0]).slice(0, 3)) bests.push({ label: formatKm(k), value: formatDuration(r.result.netTime) })
  }
  const nx = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort(byDateAsc)[0]
  return {
    ok: true,
    title: `Temporada ${year}`,
    stats: [
      { value: String(done.length), label: done.length === 1 ? 'prova concluída' : 'provas concluídas' },
      { value: String(next.length), label: next.length === 1 ? 'próxima no ano' : 'próximas no ano' },
      { value: String(kmDone).replace('.', ','), label: 'km em provas' }
    ],
    bests,
    next: nx ? { name: nx.name, when: `${formatDateBR(nx.date).slice(0, 5)}${place(nx, opts) ? ` · ${place(nx, opts)}` : ''}`, days: daysBetween(today, nx.date) } : null
  }
}

/** Semana de treinos (segunda a domingo): dias, feitos/planejados, tempo, km e sequência. */
export function storySemana(workouts, today, opts = {}) {
  const start = weekStart(today)
  const s = weekSummary(workouts, start, today)
  if (!s.planned) return { ok: false, reason: 'Nenhum treino nesta semana.' }
  const m = (sec) => { const t = Math.round(sec / 60); return t >= 60 ? `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}` : `${t} min` }
  return {
    ok: true,
    title: 'Semana de treinos',
    subtitle: `${formatDateBR(start).slice(0, 5)} a ${formatDateBR(s.end).slice(0, 5)}`,
    days: s.days.map((d, i) => ({ dow: DOW_SHORT[i].toUpperCase(), day: String(Number(d.date.slice(8, 10))), state: d.workouts[0] ? workoutState(d.workouts[0], today) : null, name: d.workouts[0]?.name ?? null, today: d.date === today })),
    stats: [
      { value: `${s.done}/${s.planned}`, label: 'treinos' },
      { value: m(s.doneSec), label: 'correndo' },
      ...(s.doneKm ? [{ value: String(s.doneKm.toFixed(1)).replace('.', ','), label: 'km' }] : [])
    ],
    streak: weekStreak(workouts, today),
    pct: s.done / s.planned,
    times: !!opts.times
  }
}

/** Contagem para a próxima prova inscrita (ou a escolhida). */
export function storyContagem(races, today, opts = {}, raceId = null) {
  const r = raceId ? races.find((x) => x.id === raceId) : races.filter((x) => x.status === 'inscrita' && x.date && x.date >= today).sort(byDateAsc)[0]
  if (!r || !r.date || r.date < today) return { ok: false, reason: 'Nenhuma prova inscrita com data à frente.' }
  const days = daysBetween(today, r.date)
  return {
    ok: true,
    days,
    big: days === 0 ? 'É HOJE' : String(days),
    unit: days === 0 ? '' : days === 1 ? 'DIA' : 'DIAS',
    lead: days === 0 ? '' : days === 1 ? 'Falta' : 'Faltam',
    name: r.name,
    when: `${dayMonth(r.date).weekday} ${formatDateBR(r.date)}${r.startTime ? ` · ${r.startTime}` : ''}`,
    line: [km(r.distanceKm), place(r, opts)].filter(Boolean).join(' · '),
    goal: opts.times && r.targetTime ? `Meta: ${formatDuration(r.targetTime)}${r.distanceKm ? ` (${formatPace(r.targetTime / r.distanceKm)})` : ''}` : null
  }
}

/** Evolução do pace nos 5 km (provas e testes de treino). Só com tempos visíveis. */
export function storyEvolucao(races, workouts, opts = {}) {
  if (!opts.times) return { ok: false, reason: 'Este modelo mostra pace: ative “Mostrar tempos e pace”.' }
  const s = paceSeriesWithTests(races, workouts).find((x) => x.km === 5)
  if (!s) return { ok: false, reason: 'Precisa de 2 ou mais provas ou testes de 5 km.' }
  const pts = s.points.slice(-8)
  const first = pts[0]
  const last = pts.at(-1)
  const best = pts.reduce((b, p) => (p.pace < b.pace ? p : b), pts[0])
  const d = Math.round(first.pace - last.pace)
  return {
    ok: true,
    title: 'Evolução nos 5 km',
    points: pts.map((p) => ({ pace: p.pace, date: formatDateBR(p.date).slice(0, 5), kind: p.kind })),
    first: formatPace(first.pace),
    last: formatPace(last.pace),
    best: formatDuration(Math.round(best.pace * 5)),
    gain: d > 0 ? `${Math.floor(d / 60) ? `${Math.floor(d / 60)}min ` : ''}${d % 60}s/km mais rápida` : d < 0 ? 'mantendo o ritmo' : 'mesmo pace',
    count: pts.length
  }
}

const CROSS_DONE = { academia: 'Academia feita', bike: 'Bike feita', natacao: 'Natação feita', caminhada: 'Caminhada feita', alongamento: 'Alongamento feito' }

/** Treino concluído: planejado × feito (do arquivo do relógio quando houver). */
export function storyTreino(workouts, today, opts = {}, workoutId = null) {
  const done = workouts.filter((w) => w.status === 'feito' && w.date).sort((a, b) => (a.date < b.date ? 1 : -1))
  const w = workoutId ? workouts.find((x) => x.id === workoutId) : done[0]
  if (!w || w.status !== 'feito') return { ok: false, reason: 'Nenhum treino marcado como feito ainda.' }
  const r = w.result
  const run = isRun(w)
  const rows = run && r?.laps?.length ? compareLaps(w.items, r.laps) : []
  const scored = rows.filter((x) => x.inTarget != null)
  const stats = []
  if (r?.distanceKm) stats.push({ value: String(r.distanceKm.toFixed(2)).replace('.', ','), label: 'km' })
  if (opts.times && r?.elapsedSec) stats.push({ value: formatDuration(r.elapsedSec), label: 'tempo' })
  if (run && opts.times && r?.distanceKm > 0 && r?.elapsedSec) stats.push({ value: formatPace(r.elapsedSec / r.distanceKm).replace(' /km', ''), label: 'pace /km' })
  if (!stats.length || (!run && !r?.elapsedSec)) stats.push({ value: String(Math.round(plannedSec(w) / 60)), label: 'min' })
  return {
    ok: true,
    title: run ? 'Treino feito ✓' : `${CROSS_DONE[w.sport] ?? 'Atividade feita'} ✓`,
    name: w.name,
    when: `${dayMonth(w.date).weekday} ${formatDateBR(w.date)}`,
    plan: run ? workoutLine(w) : null,
    icon: run ? null : sportOf(w).icon,
    stats,
    hits: scored.length && opts.times ? `${scored.filter((x) => x.inTarget).length} de ${scored.length} tiros no pace` : null
  }
}

/** Conquista do passaporte (a escolhida ou a mais recente). Conquistas de tempo só com tempos visíveis. */
export function storyConquista(races, workouts, goals, today, opts = {}, badgeId = null) {
  const p = passport({ races, workouts, goals, today, times: true })
  const b = badgeId ? p.badges.find((x) => x.id === badgeId) : p.badges.find((x) => opts.times || !x.timed)
  if (!b) return { ok: false, reason: badgeId ? 'Essa conquista ainda não foi alcançada.' : 'Nenhuma conquista ainda: complete uma prova ou marque treinos como feitos.' }
  if (b.timed && !opts.times) return { ok: false, reason: 'Esta conquista é de tempo: ative “Mostrar tempos e pace”.' }
  const race = b.raceId ? races.find((r) => r.id === b.raceId) : null
  return {
    ok: true,
    icon: b.icon,
    kicker: b.isNew ? 'Conquista nova' : 'Conquista',
    name: b.title,
    desc: b.desc,
    when: formatDateBR(b.date),
    line: race ? [race.name, place(race, opts)].filter(Boolean).join(' · ') : null,
    total: p.badges.length
  }
}

/** Monta o story pelo modelo. */
export function storyFor(id, { races, workouts, goals = [], today, opts, raceId, workoutId, badgeId }) {
  if (id === 'proximas') return storyProximas(races, today, opts)
  if (id === 'temporada') return storyTemporada(races, today, opts)
  if (id === 'semana') return storySemana(workouts, today, opts)
  if (id === 'contagem') return storyContagem(races, today, opts, raceId)
  if (id === 'evolucao') return storyEvolucao(races, workouts, opts)
  if (id === 'treino') return storyTreino(workouts, today, opts, workoutId)
  if (id === 'conquista') return storyConquista(races, workouts, goals, today, opts, badgeId)
  return { ok: false, reason: 'Modelo desconhecido.' }
}

