import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { EmptyState, Field, RaceItem, Sheet, TopBar, useUI } from '../components/ui.jsx'
import { IconCalendar, IconChevronL, IconChevronR, IconFilter, IconPlus, IconSearch, IconInfo } from '../components/Icons.jsx'
import { STATUSES } from '../lib/model.js'
import { daysBetween, formatDateBR, monthName, parseISODate, toISODate, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm } from '../lib/format.js'
import { applyFilters, byDateAsc, distinctCities, distinctDistances, sameDateGroups } from '../lib/stats.js'
import { buildICS } from '../lib/ics.js'
import { downloadText } from '../services/backup.js'

const emptyFilters = { query: '', statuses: [], city: '', distance: null, from: '', to: '' }
// Mantém filtros e visualização ao voltar da tela de detalhe.
const memo = { view: 'lista', filters: emptyFilters, month: null, selected: null }

function activeFilterCount(f) {
  return (f.statuses.length ? 1 : 0) + (f.city ? 1 : 0) + (f.distance != null ? 1 : 0) + (f.from || f.to ? 1 : 0)
}

export default function Races() {
  const { races } = useStore()
  const { notify } = useUI()
  const [params, setParams] = useSearchParams()
  const pickForResult = params.get('concluir') === '1'
  const [view, setViewState] = useState(memo.view)
  const [filters, setFiltersState] = useState(params.get('semdata') === '1' ? { ...emptyFilters } : memo.filters)
  const [sheet, setSheet] = useState(false)
  const today = todayISO()

  const setView = (v) => { memo.view = v; setViewState(v) }
  const setFilters = (f) => { memo.filters = f; setFiltersState(f) }

  const filtered = useMemo(() => applyFilters(races, filters), [races, filters])
  const sameDates = useMemo(() => sameDateGroups(races), [races])

  if (races.length === 0) {
    return (
      <>
        <TopBar title="Corridas" />
        <div className="page">
          <EmptyState title="Nenhuma corrida ainda" text="Cadastre provas de interesse e inscrições para montar seu calendário." action={<Link to="/corridas/nova" className="btn btn-primary btn-block"><IconPlus /> Cadastrar corrida</Link>} />
        </div>
      </>
    )
  }

  if (pickForResult) {
    const candidates = races.filter((r) => r.date && r.date <= today && ['inscrita', 'aberta', 'interesse'].includes(r.status)).sort((a, b) => -byDateAsc(a, b))
    return (
      <>
        <TopBar title="Registrar resultado" back="/" />
        <div className="page">
          <p className="muted" style={{ marginTop: 0 }}>Escolha a prova que você correu.</p>
          {candidates.length === 0 ? (
            <div className="card">
              <b>Nenhuma prova com data passada aguardando resultado.</b>
              <div className="muted small" style={{ marginTop: 6 }}>Cadastre a prova (com a data em que aconteceu) e depois registre o tempo.</div>
              <Link to="/corridas/nova" className="btn btn-primary btn-block" style={{ marginTop: 12 }}><IconPlus /> Cadastrar corrida</Link>
            </div>
          ) : (
            candidates.map((r) => <ResultPick key={r.id} race={r} />)
          )}
          <button className="btn btn-ghost btn-block" onClick={() => setParams({})} style={{ marginTop: 12 }}>Ver todas as corridas</button>
        </div>
      </>
    )
  }

  const dated = filtered.filter((r) => r.date)
  const undated = filtered.filter((r) => !r.date).sort(byDateAsc)
  const future = dated.filter((r) => r.date >= today).sort(byDateAsc)
  const past = dated.filter((r) => r.date < today).sort((a, b) => -byDateAsc(a, b))
  const nFilters = activeFilterCount(filters)

  const exportIcs = () => {
    const toExport = dated.filter((r) => r.status !== 'cancelada' && r.status !== 'desisti')
    if (!toExport.length) {
      notify('Nenhuma prova com data para exportar')
      return
    }
    const { text, count } = buildICS(toExport)
    downloadText(text, `paceon-${today}.ics`, 'text/calendar')
    notify(`${count} ${count === 1 ? 'prova exportada' : 'provas exportadas'} para .ics`)
  }

  const flagsFor = (r, list) => {
    const out = []
    if (sameDates.has(r.date)) out.push(<span key="s" className="flag flag-warn">Mesma data</span>)
    else if (r.date && r.status !== 'cancelada' && r.status !== 'desisti' && list.some((o) => o.id !== r.id && o.status !== 'cancelada' && o.status !== 'desisti' && o.date && Math.abs(daysBetween(r.date, o.date)) === 1)) out.push(<span key="c" className="flag flag-info">Dia seguido</span>)
    if (r.result) out.push(<span key="r" className="chip">⏱ {formatDuration(r.result.netTime)}</span>)
    return out
  }

  return (
    <>
      <TopBar
        title="Corridas"
        sub={`${races.length} ${races.length === 1 ? 'cadastrada' : 'cadastradas'}`}
        right={<button className="icon-btn" onClick={exportIcs} aria-label="Exportar provas filtradas para a agenda (.ics)" title="Exportar .ics"><IconCalendar /></button>}
      />
      <div className="page">
        <div className="toolbar">
          <div className="search">
            <IconSearch />
            <input className="input" type="search" placeholder="Buscar pelo nome" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} aria-label="Buscar pelo nome" />
          </div>
          <button className="icon-btn" style={{ position: 'relative', width: 50, height: 50, borderRadius: 14 }} onClick={() => setSheet(true)} aria-label={`Filtros${nFilters ? ` (${nFilters} ativos)` : ''}`}>
            <IconFilter />
            {nFilters > 0 && <span className="badge-count">{nFilters}</span>}
          </button>
        </div>

        <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
          <button role="tab" aria-selected={view === 'lista'} onClick={() => setView('lista')}>Lista</button>
          <button role="tab" aria-selected={view === 'mes'} onClick={() => setView('mes')}>Mês</button>
        </div>

        {(nFilters > 0 || filters.query) && (
          <div className="note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}</span>
            <button className="link-btn" onClick={() => setFilters(emptyFilters)}>Limpar filtros</button>
          </div>
        )}

        {view === 'lista' ? (
          <>
            {filtered.length === 0 && <div className="card muted" style={{ marginTop: 12 }}>Nenhuma corrida encontrada com esses filtros.</div>}
            {future.length > 0 && <div className="list-group-title">Próximas</div>}
            {future.map((r) => <RaceItem key={r.id} race={r} extra={flagsFor(r, dated)} />)}
            {undated.length > 0 && <div className="list-group-title">Data a confirmar</div>}
            {undated.map((r) => <RaceItem key={r.id} race={r} />)}
            {past.length > 0 && <div className="list-group-title">Anteriores</div>}
            {past.map((r) => <RaceItem key={r.id} race={r} extra={flagsFor(r, dated)} />)}
            {(filters.from || filters.to) && <p className="note">Provas sem data não aparecem quando há filtro de período.</p>}
          </>
        ) : (
          <MonthView races={dated} undated={undated} sameDates={sameDates} today={today} />
        )}
        <p className="note">O botão de agenda no topo exporta para .ics as provas com data da lista filtrada (exceto canceladas e desistências). Para uma agenda que se atualiza sozinha, use a <Link to="/lembretes">agenda por assinatura</Link>.</p>
      </div>

      {sheet && <FilterSheet races={races} value={filters} onApply={(f) => { setFilters(f); setSheet(false) }} onClose={() => setSheet(false)} />}
    </>
  )
}

function ResultPick({ race }) {
  return (
    <Link to={`/corridas/${race.id}/resultado`} className={`race-item b-${race.status}`}>
      <div className="race-body">
        <div className="t">{race.name}</div>
        <div className="s">{formatDateBR(race.date)}{race.distanceKm ? ` · ${formatKm(race.distanceKm)}` : ''}</div>
      </div>
      <IconChevronR />
    </Link>
  )
}

function MonthView({ races, undated, sameDates, today }) {
  const init = memo.month ?? today.slice(0, 7)
  const [month, setMonthState] = useState(init)
  const [selected, setSelectedState] = useState(memo.selected ?? today)
  const setMonth = (m) => { memo.month = m; setMonthState(m) }
  const setSelected = (d) => { memo.selected = d; setSelectedState(d) }

  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toISODate(d)
  })
  // Remove a última semana se ela for toda do mês seguinte.
  const visible = days.slice(35).every((d) => d.slice(0, 7) !== month) ? days.slice(0, 35) : days

  const byDate = new Map()
  for (const r of races) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])

  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1)
    setMonth(toISODate(d).slice(0, 7))
  }

  const monthCount = races.filter((r) => r.date.slice(0, 7) === month).length
  const selList = (byDate.get(selected) ?? []).sort(byDateAsc)

  return (
    <>
      <div className="month-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior"><IconChevronL /></button>
        <div style={{ textAlign: 'center' }}>
          <h2>{monthName(m - 1)} {y}</h2>
          <div className="small muted">{monthCount} {monthCount === 1 ? 'prova' : 'provas'}</div>
        </div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Próximo mês"><IconChevronR /></button>
      </div>
      <div className="cal" role="grid" aria-label={`${monthName(m - 1)} de ${y}`}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} className="wd" aria-hidden="true">{d}</div>)}
        {visible.map((d) => {
          const list = byDate.get(d) ?? []
          const cls = ['day', d.slice(0, 7) !== month && 'other', d === today && 'today', d === selected && 'sel', sameDates.has(d) && 'multi'].filter(Boolean).join(' ')
          const label = `${formatDateBR(d)}${list.length ? `, ${list.length} ${list.length === 1 ? 'prova' : 'provas'}: ${list.map((r) => r.name).join(', ')}` : ''}`
          return (
            <button key={d} className={cls} onClick={() => setSelected(d)} aria-label={label} aria-pressed={d === selected}>
              <span>{parseISODate(d).getDate()}</span>
              <span className="dots">
                {list.slice(0, 3).map((r) => {
                  const confirmed = r.status === 'inscrita' || r.status === 'concluida'
                  return <span key={r.id} className={`dot ${confirmed ? '' : 'hollow'}`} style={{ background: `var(--st-${r.status})`, borderColor: `var(--st-${r.status})` }} />
                })}
              </span>
            </button>
          )
        })}
      </div>
      <div className="legend">
        <span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', background: 'var(--st-inscrita)' }} /> Inscrita/concluída (cheio)</span>
        <span><span style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', border: '2px solid var(--st-interesse)' }} /> Interesse/aberta (vazado)</span>
        <span><b style={{ color: 'var(--warn)' }}>2+</b> mesma data</span>
      </div>

      <div className="list-group-title">{formatDateBR(selected)}</div>
      {selList.length === 0 ? <div className="card muted small">Nenhuma prova neste dia.</div> : selList.map((r) => <RaceItem key={r.id} race={r} extra={sameDates.has(r.date) && <span className="flag flag-warn">Mesma data</span>} />)}

      {undated.length > 0 && (
        <>
          <div className="list-group-title">Data a confirmar</div>
          <div className="alert alert-info small" style={{ marginBottom: 10 }}><IconInfo /><div>Estas provas ficam fora do calendário até você definir a data.</div></div>
          {undated.map((r) => <RaceItem key={r.id} race={r} />)}
        </>
      )}
    </>
  )
}

function FilterSheet({ races, value, onApply, onClose }) {
  const [f, setF] = useState(value)
  const cities = distinctCities(races)
  const dists = distinctDistances(races)
  const err = f.from && f.to && f.from > f.to ? 'A data inicial é depois da final.' : null
  const toggle = (id) => setF((p) => ({ ...p, statuses: p.statuses.includes(id) ? p.statuses.filter((s) => s !== id) : [...p.statuses, id] }))
  const year = todayISO().slice(0, 4)
  const quick = [
    { label: 'Próximos 30 dias', from: todayISO(), to: toISODate(new Date(Date.now() + 30 * 86400000)) },
    { label: `Ano de ${year}`, from: `${year}-01-01`, to: `${year}-12-31` }
  ]

  return (
    <Sheet title="Filtros" onClose={onClose}>
      <div className="form">
        <Field label="Status">
          <div className="seg">
            {STATUSES.map((s) => (
              <button type="button" key={s.id} aria-pressed={f.statuses.includes(s.id)} onClick={() => toggle(s.id)}><span aria-hidden="true">{s.icon} </span>{s.label}</button>
            ))}
          </div>
        </Field>
        <Field label="Período" error={err}>
          <div className="seg" style={{ marginBottom: 8 }}>
            {quick.map((q) => (
              <button type="button" key={q.label} aria-pressed={f.from === q.from && f.to === q.to} onClick={() => setF({ ...f, from: q.from, to: q.to })}>{q.label}</button>
            ))}
          </div>
          <div className="grid-2">
            <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="De" aria-invalid={err ? 'true' : 'false'} />
            <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Até" aria-invalid={err ? 'true' : 'false'} />
          </div>
        </Field>
        <Field label="Cidade" htmlFor="f-city">
          <select id="f-city" className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
            <option value="">Todas</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Distância">
          {dists.length === 0 ? <div className="muted small">Nenhuma distância cadastrada ainda.</div> : (
            <div className="seg">
              <button type="button" aria-pressed={f.distance == null} onClick={() => setF({ ...f, distance: null })}>Todas</button>
              {dists.map((d) => <button type="button" key={d} aria-pressed={f.distance === d} onClick={() => setF({ ...f, distance: d })}>{formatKm(d)}</button>)}
            </div>
          )}
        </Field>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => setF({ ...emptyFilters, query: f.query })}>Limpar</button>
          <button type="button" className="btn btn-primary" disabled={!!err} onClick={() => onApply(f)}>Aplicar</button>
        </div>
      </div>
    </Sheet>
  )
}
