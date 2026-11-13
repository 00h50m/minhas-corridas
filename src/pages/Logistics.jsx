// Logística da prova: trajetos (ida, volta, kit), paradas, rota, custos e agenda do dia.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getRace, saveRace, useStore } from '../services/store.js'
import { getProfile, saveProfile, useProfile } from '../services/profile.js'
import { PROVIDER_LABEL, computeRoute, routeCapabilities } from '../services/routing.js'
import PlaceField from '../components/PlaceField.jsx'
import { firstName } from '../lib/people.js'
import Pickups from '../components/Pickups.jsx'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconExternal, IconInfo, IconPin, IconPlus, IconX } from '../components/Icons.jsx'
import { FUELS, costItems, destinationPlace, fuelCost, kitPlace, navLinks, normalizeLogistics, pointsKey, raceSchedule, tripOf, tripSummary, transportTotals, venueAddress, kitAddress } from '../lib/logistics.js'
import { PREP_FIELDS, minToHm, normalizePrep, returnSchedule } from '../lib/schedule.js'
import { raceKitSchedule } from '../lib/logistics.js'
import { formatDateBR } from '../lib/dates.js'
import { formatKm, formatMoney, parseMoney, moneyToInput } from '../lib/format.js'
import { downloadText } from '../services/backup.js'
import { buildICS } from '../lib/ics.js'
import Timeline from '../components/Timeline.jsx'

const RouteMap = lazy(() => import('../components/RouteMap.jsx'))
export const logisticsMemo = { tab: 'ida' }
const TABS = [
  { id: 'ida', label: 'Ida' },
  { id: 'volta', label: 'Volta' },
  { id: 'kit', label: 'Kit' },
  { id: 'custos', label: 'Custos' },
  { id: 'agenda', label: 'Agenda' }
]

const newId = () => Math.random().toString(36).slice(2, 10)
const minLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`)

/** Data/hora local → ISO (para o trânsito previsto). */
function localIso(date, minutes) {
  if (!date || minutes == null) return null
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 0, minutes).toISOString()
}
const hm = (s) => (/^\d{2}:\d{2}$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null)

export default function Logistics() {
  const { id } = useParams()
  useStore() // re-renderiza quando a prova muda
  const prof = useProfile()
  const r = getRace(id)
  const [tab, setTabState] = useState(logisticsMemo.tab)
  const setTab = (t) => { logisticsMemo.tab = t; setTabState(t) }
  const [cap, setCap] = useState(null)
  useEffect(() => { routeCapabilities().then(setCap) }, [])
  if (!r) return <Navigate to="/corridas" replace />
  const log = r.logistics ?? normalizeLogistics({ vehicle: prof.data.vehicle })

  /** Altera a logística (e, se preciso, campos da prova) e salva na hora. */
  const update = (fn) => {
    const fresh = getRace(id)
    const cur = structuredClone(fresh.logistics ?? normalizeLogistics({ vehicle: getProfile().data.vehicle }))
    const patch = fn(cur, fresh) || {}
    saveRace({ ...fresh, ...patch, logistics: normalizeLogistics(cur) })
  }

  return (
    <>
      <TopBar title="Logística" sub={`${r.name}${r.date ? ` · ${formatDateBR(r.date)}` : ''}`} back={`/corridas/${r.id}`} />
      <div className="page logistics">
        <div className="tabs" role="tablist" aria-label="Logística">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        {cap && !cap.provider && (
          <div className="alert alert-info small" style={{ marginTop: 12 }} data-testid="manual-mode">
            <IconInfo />
            <div>{cap.offline ? 'Sem conexão com o servidor de rotas.' : 'Cálculo automático de rotas não configurado nesta instalação.'} Informe distância e tempo de cada trecho (do seu app de mapas) — o resto é calculado normalmente.</div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          {tab === 'custos' ? <CostsPanel race={r} log={log} update={update} /> : tab === 'agenda' ? <AgendaPanel race={r} log={log} update={update} goTrip={() => setTab('ida')} /> : <TripPanel key={tab} which={tab} race={r} log={log} update={update} cap={cap} />}
        </div>
      </div>
    </>
  )
}

/* ---------- Endereços ---------- */

/** Minutos: aceita apagar e redigitar (sem virar "015"); salva só números válidos. */
function MinutesInput({ value, max, label, onChange }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV((cur) => (cur === '' || Number(cur) !== value ? String(value) : cur)), [value])
  return (
    <input className="input" inputMode="numeric" pattern="[0-9]*" value={v} aria-label={label}
      onChange={(e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 3); setV(raw); if (raw !== '') onChange(Math.min(max, Number(raw))) }}
      onBlur={() => { if (v === '') setV(String(value)) }} />
  )
}

/* ---------- Trajetos ---------- */

function TripPanel({ which, race: r, log, update, cap }) {
  const { notify } = useUI()
  const s = tripSummary(r, log, which)
  const trip = tripOf(log, which)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [manual, setManual] = useState(false)
  const schedule = raceSchedule(r, getProfile().data.prep)

  const editableStops = which === 'volta' ? (log.back.mode === 'custom' ? log.back.stops : null) : trip.stops
  const tripKey = which === 'ida' ? 'outbound' : which === 'volta' ? 'back' : 'kit'
  const setStops = (fn) => update((l) => { l[tripKey].stops = fn(l[tripKey].stops) })

  const departureAt = () => {
    if (which === 'ida') return localIso(r.date, schedule?.depart ?? (hm(r.startTime) != null ? hm(r.startTime) - 90 : null))
    if (which === 'volta') return localIso(r.date, hm(log.back.departTime) ?? (hm(r.startTime) != null ? hm(r.startTime) + 150 : null))
    return localIso(r.kitPickupDate, hm(r.kitPickupTime) != null ? hm(r.kitPickupTime) - 45 : null)
  }

  const calc = async () => {
    setErr(null)
    setBusy(true)
    try {
      const res = await computeRoute(s.points, departureAt())
      update((l) => {
        l[tripKey].route = { ...res, key: pointsKey(s.points) }
        // Guarda as coordenadas devolvidas nos pontos ainda sem verificação.
        const coords = res.points ?? []
        if (coords.length === s.points.length) {
          const fix = (p, c) => (p && p.lat == null && c ? { ...p, lat: c.lat, lon: c.lon } : p)
          if (which === 'ida' || which === 'volta') {
            const home = which === 'ida' ? coords[0] : coords.at(-1)
            l.origin = fix(l.origin, home)
          }
        }
      })
      notify('Rota calculada')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveManual = (legs) => update((l) => { l[tripKey].route = { provider: 'manual', legs, key: pointsKey(s.points), fetchedAt: new Date().toISOString() } })
  const links = s.points.length >= 2 ? navLinks(s.points) : null
  const coordsForMap = s.route?.points?.length ? s.route.points : s.points.every((p) => p.lat != null) ? s.points.map((p) => ({ lat: p.lat, lon: p.lon })) : []
  const ret = which === 'volta' && s.complete ? returnSchedule({ departTime: log.back.departTime, legs: s.legs, stops: s.points.filter((p) => p.role === 'stop'), trafficExtraPct: normalizePrep(log.prep ?? getProfile().data.prep).trafficExtraPct }) : null
  const kitS = which === 'kit' ? raceKitSchedule(r, getProfile().data.prep) : null

  return (
    <>
      {which === 'volta' && (
        <div className="card">
          <label className="check"><input type="checkbox" checked={log.back.enabled} onChange={(e) => update((l) => { l.back.enabled = e.target.checked })} /> Planejar a volta</label>
          {log.back.enabled && (
            <>
              <div className="seg" role="radiogroup" aria-label="Paradas da volta" style={{ marginTop: 6 }}>
                <button type="button" role="radio" aria-checked={log.back.mode === 'reverse'} aria-pressed={log.back.mode === 'reverse'} onClick={() => update((l) => { l.back.mode = 'reverse' })}>Mesmas paradas, ao contrário</button>
                <button type="button" role="radio" aria-checked={log.back.mode === 'custom'} aria-pressed={log.back.mode === 'custom'} onClick={() => update((l) => { l.back.mode = 'custom' })}>Outras paradas</button>
              </div>
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label htmlFor="back-depart">Sair do local às</label>
                <input id="back-depart" type="time" className="input" value={log.back.departTime} onChange={(e) => update((l) => { l.back.departTime = e.target.value })} />
              </div>
            </>
          )}
        </div>
      )}
      {which === 'kit' && (
        <div className="card">
          <label className="check"><input type="checkbox" checked={log.kit.enabled} onChange={(e) => update((l) => { l.kit.enabled = e.target.checked })} data-testid="kit-enable" /> Planejar o deslocamento da retirada do kit</label>
          {log.kit.enabled && (
            <>
              <div className="grid-2" style={{ marginTop: 8 }}>
                <div className="field"><label htmlFor="kit-date">Dia</label><input id="kit-date" type="date" className="input" value={r.kitPickupDate ?? ''} onChange={(e) => update(() => ({ kitPickupDate: e.target.value || null }))} /></div>
                <div className="field"><label htmlFor="kit-time">Horário</label><input id="kit-time" type="time" className="input" value={r.kitPickupTime ?? ''} onChange={(e) => update(() => ({ kitPickupTime: e.target.value }))} /></div>
              </div>
              <label className="check"><input type="checkbox" checked={log.kit.roundTrip} onChange={(e) => update((l) => { l.kit.roundTrip = e.target.checked })} /> Voltar para o ponto de saída depois</label>
              <p className="note" style={{ marginTop: 0 }}>Pode ser em outro dia: os custos ficam na mesma prova (Transporte).</p>
            </>
          )}
        </div>
      )}

      {(which === 'ida' || (which === 'kit' && log.kit.enabled) || (which === 'volta' && log.back.enabled)) && (
        <>
          <div className="section-title"><h2>{which === 'volta' ? 'Trajeto da volta' : which === 'kit' ? 'Trajeto até o kit' : 'Trajeto da ida'}</h2></div>
          <div className="card">
            {which === 'ida' && <PlaceField label="Saída (sua casa)" name="Casa" place={log.origin} cap={cap} testid="origin" locate onChange={(p) => update((l) => { l.origin = p })} />}
            {which === 'kit' && <PlaceField label="Saída para o kit" name="Saída" place={log.kit.origin ?? log.origin} cap={cap} testid="kit-origin" locate hint={!log.kit.origin ? 'Igual à saída da ida. Altere se for sair de outro lugar.' : null} onChange={(p) => update((l) => { l.kit.origin = p })} />}
            {which === 'volta' && <div className="trip-fixed"><span className="tf-k">Saída</span><span>{destinationPlace(r, log)?.address || 'Local da prova (cadastre o endereço)'}</span></div>}

            <div className="list-group-title">Paradas</div>
            {editableStops ? (
              <StopsEditor stops={editableStops} setStops={setStops} cap={cap} />
            ) : (
              <p className="small muted" style={{ margin: '4px 0 10px' }}>{log.outbound.stops.length ? `As mesmas da ida, ao contrário: ${[...log.outbound.stops].reverse().map((x) => x.label || x.address).join(' → ')}.` : 'Sem paradas na ida.'}</p>
            )}

            {which === 'ida' && <DestinationField race={r} log={log} update={update} cap={cap} />}
            {which === 'kit' && <KitDestinationField race={r} log={log} update={update} cap={cap} />}
            {which === 'volta' && <div className="trip-fixed"><span className="tf-k">Chegada</span><span>{log.origin?.address || 'Sua casa (informe na Ida)'}</span></div>}
          </div>

          <div className="section-title"><h2>Rota</h2></div>
          {s.points.length < 2 ? (
            <div className="card muted small">Informe a saída e o destino para calcular a rota.</div>
          ) : (
            <div className="card" data-testid={`route-${which}`}>
              {s.stale && <div className="alert alert-warn small" style={{ marginBottom: 10 }}><div>Os endereços mudaram desde o último cálculo. Recalcule a rota.</div></div>}
              {s.complete ? (
                <>
                  <LegsTable points={s.points} legs={s.legs} />
                  <div className="route-total">
                    <b>{formatKm(s.distanceKm)}</b>
                    <span>{minLabel(s.trafficMin ?? s.durationMin)}{s.trafficMin != null ? ' com trânsito previsto' : ''}</span>
                  </div>
                  <p className="note">
                    Fonte: {PROVIDER_LABEL[s.route.provider]}
                    {s.route.provider === 'google' && (s.route.traffic ? ' · trânsito previsto para o horário de saída' : ' · sem previsão de trânsito (data no passado)')}
                    {s.route.provider === 'ors' && ' · sem trânsito'}
                    {s.route.tolls ? ` · pedágios estimados: ${formatMoney(s.route.tolls.amount)}` : s.route.hasTolls ? ' · há pedágios, sem tarifa informada (preencha em Custos)' : ''}
                    {s.route.fetchedAt && s.route.provider !== 'manual' ? ` · calculado em ${new Date(s.route.fetchedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </>
              ) : (
                <p className="small muted" style={{ marginTop: 0 }}>{s.points.length - 1} {s.points.length - 1 === 1 ? 'trecho' : 'trechos'} a calcular.</p>
              )}
              {err && <div className="alert alert-error small" role="alert" style={{ marginBottom: 10 }}><div>{err}</div></div>}
              <div className="btn-row">
                {cap?.provider ? <button type="button" className="btn btn-primary" disabled={busy} onClick={calc}>{busy ? 'Calculando…' : s.complete ? 'Recalcular rota' : 'Calcular rota'}</button> : <span />}
                <button type="button" className="btn" onClick={() => setManual((v) => !v)}>{manual ? 'Fechar' : 'Informar à mão'}</button>
              </div>
              {(manual || (!cap?.provider && !s.complete)) && <ManualLegs points={s.points} legs={s.complete ? s.legs : null} onSave={(legs) => { saveManual(legs); setManual(false); notify('Trechos salvos') }} />}
              {which === 'volta' && ret && <p className="small" style={{ marginBottom: 0 }}>Saindo às {log.back.departTime}, chegada prevista em casa às <b>{minToHm(ret.arrival)}</b>.</p>}
              {which === 'kit' && kitS && <p className="small" style={{ marginBottom: 0 }}>Para chegar às {r.kitPickupTime} ({formatDateBR(r.kitPickupDate)}), saia às <b>{minToHm(kitS.depart)}</b> (com margem).</p>}
            </div>
          )}

          {coordsForMap.length >= 2 && (
            <Suspense fallback={<div className="route-map placeholder" />}>
              <RouteMap polyline={s.route?.polyline} points={coordsForMap} labels={s.points.map((p) => p.label)} />
            </Suspense>
          )}
          {s.complete && coordsForMap.length < 2 && <p className="note">O mapa aparece quando os endereços são verificados ou a rota é calculada pelo serviço de mapas.</p>}

          {links && (
            <div className="nav-links">
              <a className="btn btn-dark btn-block" href={links.google} target="_blank" rel="noreferrer"><IconPin /> Abrir no Google Maps</a>
              <details className="waze">
                <summary>Abrir no Waze (um trecho por vez)</summary>
                {links.waze.map((w, i) => <a key={i} className="btn btn-block" href={w.url} target="_blank" rel="noreferrer"><IconExternal /> {i + 1}. {w.label}</a>)}
              </details>
            </div>
          )}
        </>
      )}
    </>
  )
}

function StopsEditor({ stops, setStops, cap }) {
  const prof = useProfile()
  const { people, favorites: places } = prof.data
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [pickFor, setPickFor] = useState(null) // pessoa sem endereço salvo: pergunta onde buscar
  const [savePlace, setSavePlace] = useState(true)
  const addStop = (st) => {
    setStops((list) => [...list, { ...st, id: newId() }].slice(0, 8))
    setAdding(false)
    setLabel('')
    setPickFor(null)
  }
  const addPerson = (pe) => {
    const pl = places.find((x) => x.id === pe.placeId)
    if (pl) addStop({ ...pl, label: `Buscar ${pe.name}`, personId: pe.id, dwellMin: pl.dwellMin ?? 5 })
    else setPickFor(pe)
  }
  const move = (i, d) => setStops((list) => { const a = [...list]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a })
  return (
    <>
      <ol className="stops" data-testid="stops">
        {stops.map((st, i) => (
          <li key={st.id}>
            <div className="st-main">
              <b>{i + 1}. {st.label || 'Parada'}</b>
              <span className="muted small">{st.lat != null ? '✓ ' : ''}{st.formatted || st.address}</span>
            </div>
            <label className="st-dwell">
              <MinutesInput value={st.dwellMin} max={600} label={`Minutos em ${st.label || 'parada'}`} onChange={(v) => setStops((list) => list.map((x) => (x.id === st.id ? { ...x, dwellMin: v } : x)))} />
              <span>min</span>
            </label>
            <div className="st-actions">
              <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label="Descer" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon-btn" aria-label={`Remover ${st.label}`} onClick={() => setStops((list) => list.filter((x) => x.id !== st.id))}><IconX /></button>
            </div>
          </li>
        ))}
      </ol>
      {adding ? (
        <div className="stop-add">
          {(people.length > 0 || places.length > 0) && !pickFor && (
            <div className="stop-kind" data-testid="stop-quick">
              {people.length > 0 && (
                <div>
                  <div className="list-group-title" style={{ marginTop: 0 }}>Buscar alguém</div>
                  <div className="chips">{people.map((pe) => <button key={pe.id} type="button" onClick={() => addPerson(pe)}>👤 {pe.name}</button>)}</div>
                </div>
              )}
              {places.length > 0 && (
                <div>
                  <div className="list-group-title" style={{ marginTop: 0 }}>Lugar salvo</div>
                  <div className="chips">{places.map((pl) => <button key={pl.id} type="button" onClick={() => addStop({ ...pl, label: pl.label, dwellMin: pl.dwellMin ?? 5 })}>★ {pl.label}</button>)}</div>
                </div>
              )}
              <div className="list-group-title" style={{ marginTop: 0 }}>Ou outro endereço</div>
            </div>
          )}
          {pickFor ? (
            <>
              <PlaceField label={`Onde buscar ${pickFor.name}`} place={null} cap={cap} testid="stop-place" onChange={(pl) => {
                if (savePlace) {
                  const data = getProfile().data
                  const id = newId()
                  saveProfile({ ...data, favorites: [...data.favorites, { ...pl, id, label: `Casa da ${firstName(pickFor.name)}`.slice(0, 60), dwellMin: 5 }], people: data.people.map((x) => (x.id === pickFor.id ? { ...x, placeId: id } : x)) })
                }
                addStop({ ...pl, label: `Buscar ${pickFor.name}`, personId: pickFor.id, dwellMin: 5 })
              }} />
              <label className="check"><input type="checkbox" checked={savePlace} onChange={(e) => setSavePlace(e.target.checked)} /> Guardar este endereço para {firstName(pickFor.name)}</label>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="stop-label">Nome da parada</label><input id="stop-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Posto, Padaria" maxLength={60} /></div>
              <PlaceField label="Endereço da parada" place={null} cap={cap} testid="stop-place" onChange={(p) => addStop({ ...p, label: label.trim() || p.label || 'Parada', dwellMin: 5 })} />
            </>
          )}
          <button type="button" className="link-btn" onClick={() => { setAdding(false); setPickFor(null) }}>Cancelar</button>
        </div>
      ) : (
        stops.length < 8 && <button type="button" className="btn btn-block" onClick={() => setAdding(true)}><IconPlus /> Adicionar parada</button>
      )}
    </>
  )
}

function DestinationField({ race: r, log, update, cap }) {
  const dest = destinationPlace(r, log)
  if (!dest) {
    return <PlaceField label="Local da largada" place={null} cap={cap} testid="destination" hint="Fica salvo no cadastro da prova." onChange={(p) => update((l, fresh) => { l.destination = { ...p, address: venueAddress({ ...fresh, venueAddress: p.address }) }; return { venueAddress: p.address } })} />
  }
  return (
    <div className="trip-fixed" data-testid="destination">
      <span className="tf-k">Destino</span>
      <span>{dest.lat != null ? '✓ ' : ''}{dest.formatted || dest.address}</span>
      {cap && dest.lat == null && (
        <PlaceField label="Confirmar o local da largada" place={dest} cap={cap} onChange={(p) => update((l) => { l.destination = { ...p, address: dest.address } })} />
      )}
      <Link to={`/corridas/${r.id}/editar`} className="link-btn">Mudar no cadastro</Link>
    </div>
  )
}

function KitDestinationField({ race: r, log, update, cap }) {
  const dest = kitPlace(r, log)
  if (!dest) return <PlaceField label="Local da retirada do kit" place={null} cap={cap} testid="kit-destination" hint="Fica salvo no cadastro da prova." onChange={(p) => update((l, fresh) => { l.kit.destination = { ...p, address: kitAddress({ ...fresh, kitPickupAddress: p.address }) }; return { kitPickupAddress: p.address } })} />
  return (
    <div className="trip-fixed">
      <span className="tf-k">Kit</span>
      <span>{dest.lat != null ? '✓ ' : ''}{dest.formatted || dest.address}</span>
      {cap && dest.lat == null && <PlaceField label="Confirmar o local do kit" place={dest} cap={cap} onChange={(p) => update((l) => { l.kit.destination = { ...p, address: dest.address } })} />}
    </div>
  )
}

function LegsTable({ points, legs }) {
  return (
    <table className="legs" data-testid="legs">
      <thead><tr><th scope="col">Trecho</th><th scope="col">km</th><th scope="col">Tempo</th></tr></thead>
      <tbody>
        {legs.map((l, i) => (
          <tr key={i}>
            <th scope="row">{points[i].label || 'Saída'} → {points[i + 1].label || 'Destino'}</th>
            <td>{formatKm(l.distanceKm, { unit: false })}</td>
            <td>{l.trafficMin != null && l.trafficMin !== l.durationMin ? <><b>{l.trafficMin}</b> <span className="muted">({l.durationMin})</span></> : l.durationMin} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ManualLegs({ points, legs, onSave }) {
  const n = points.length - 1
  const [rows, setRows] = useState(() => Array.from({ length: n }, (_, i) => ({ km: legs?.[i] ? String(legs[i].distanceKm).replace('.', ',') : '', min: legs?.[i] ? String(legs[i].durationMin) : '' })))
  const [err, setErr] = useState(null)
  const save = () => {
    const out = rows.map((r) => ({ distanceKm: Number(String(r.km).replace(',', '.')), durationMin: Number(r.min), trafficMin: null }))
    if (out.some((l) => !(l.distanceKm > 0 && l.distanceKm < 5000) || !(l.durationMin > 0 && l.durationMin < 6000))) return setErr('Preencha km e minutos de todos os trechos.')
    onSave(out)
  }
  return (
    <div className="manual-legs" data-testid="manual-legs">
      <p className="small muted">Copie do seu app de mapas a distância e o tempo de cada trecho.</p>
      {rows.map((row, i) => (
        <div key={i} className="ml-row">
          <span className="ml-name">{points[i].label || 'Saída'} → {points[i + 1].label || 'Destino'}</span>
          <input className="input" inputMode="decimal" value={row.km} placeholder="km" aria-label={`km do trecho ${i + 1}`} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)))} />
          <input className="input" inputMode="numeric" value={row.min} placeholder="min" aria-label={`minutos do trecho ${i + 1}`} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
        </div>
      ))}
      {err && <div className="err" role="alert">{err}</div>}
      <button type="button" className="btn btn-dark btn-block" onClick={save}>Salvar trechos</button>
    </div>
  )
}

/* ---------- Custos ---------- */

function MoneyCell({ value, onChange, label, placeholder }) {
  const [v, setV] = useState(value == null ? '' : moneyToInput(value))
  useEffect(() => setV(value == null ? '' : moneyToInput(value)), [value])
  return <input className="input money-in" inputMode="decimal" value={v} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = v.trim() ? parseMoney(v) : null; if (n === null && v.trim()) { setV(value == null ? '' : moneyToInput(value)); return } onChange(n) }} />
}

function CostsPanel({ race: r, log, update }) {
  const { notify } = useUI()
  const items = costItems(r, log)
  const t = transportTotals(items)
  const ida = tripSummary(r, log, 'ida')
  const volta = tripSummary(r, log, 'volta')
  const kit = tripSummary(r, log, 'kit')
  const v = log.vehicle
  const setV = (k, val) => update((l) => { l.vehicle[k] = val })
  const saveVehicle = () => {
    const p = getProfile().data
    saveProfile({ ...p, vehicle: { ...log.vehicle } })
    notify('Veículo salvo no perfil')
  }
  const fuelCalc = (s) => (s.complete ? fuelCost(s.distanceKm, v) : null)
  const SOURCE = { calc: 'calculado', rota: 'da rota', manual: 'informado' }
  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Veículo</h2></div>
      <div className="card">
        <div className="grid-2">
          <div className="field"><label htmlFor="v-kml">Consumo (km/l)</label><input id="v-kml" className="input" inputMode="decimal" defaultValue={v.kmPerL ?? ''} onBlur={(e) => setV('kmPerL', Number(e.target.value.replace(',', '.')) || null)} placeholder="Ex.: 7" /></div>
          <div className="field"><label htmlFor="v-price">Preço do litro (R$)</label><input id="v-price" className="input" inputMode="decimal" defaultValue={v.pricePerL != null ? moneyToInput(v.pricePerL) : ''} onBlur={(e) => setV('pricePerL', parseMoney(e.target.value))} placeholder="Ex.: 4,29" /></div>
        </div>
        <div className="seg" role="radiogroup" aria-label="Combustível">
          {FUELS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={v.fuel === f.id} aria-pressed={v.fuel === f.id} onClick={() => setV('fuel', f.id)}>{f.label}</button>)}
        </div>
        <button type="button" className="link-btn" onClick={saveVehicle}>Salvar como meu veículo padrão</button>
        <p className="note">Combustível = distância ÷ consumo × preço por litro.{ida.complete && v.kmPerL && v.pricePerL ? ` Ida: ${formatKm(ida.distanceKm)} ÷ ${String(v.kmPerL).replace('.', ',')} km/l × ${formatMoney(v.pricePerL)} = ${formatMoney(fuelCalc(ida))}.` : ''}</p>
      </div>

      <div className="section-title"><h2>Deslocamento</h2></div>
      <div className="card" data-testid="costs">
        <table className="cost-table logi-costs">
          <thead><tr><th scope="col">Item</th><th scope="col">Estimado</th><th scope="col">Pago</th></tr></thead>
          <tbody>
            {items.map((i) => {
              const auto = { fuelOut: fuelCalc(ida), fuelBack: fuelCalc(volta), kitFuel: fuelCalc(kit) }[i.id] ?? null
              return (
                <tr key={i.id}>
                  <th scope="row">{i.label}{i.source && i.est != null && <span className="muted small"> · {SOURCE[i.source]}</span>}</th>
                  <td><MoneyCell value={log.costs[i.id].est} placeholder={auto ? moneyToInput(auto) : i.est != null ? moneyToInput(i.est) : '—'} label={`${i.label} estimado`} onChange={(n) => update((l) => { l.costs[i.id].est = n })} /></td>
                  <td><MoneyCell value={log.costs[i.id].paid} placeholder="—" label={`${i.label} pago`} onChange={(n) => update((l) => { l.costs[i.id].paid = n })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="extras-desc">Descrição das outras despesas</label><input id="extras-desc" className="input" defaultValue={log.costs.extras.desc} maxLength={80} onBlur={(e) => update((l) => { l.costs.extras.desc = e.target.value })} placeholder="Ex.: lanche, Uber do estacionamento" /></div>
        <div className="cost-total"><span>Total do deslocamento</span><b data-testid="transport-total">{formatMoney(t.total)}</b></div>
        <p className="note">
          {t.allPaid ? 'Tudo com valor pago informado. ' : t.paid > 0 ? `${formatMoney(t.paid)} pagos + ${formatMoney(t.total - t.paid)} estimados. ` : ''}
          Os campos em cinza mostram o valor calculado; digite para substituir. Este total é o <b>Transporte</b> da prova: entra no orçamento, em Gastos e na tela Decidir (sem somar duas vezes).
          {!ida.complete && ' Calcule ou informe a rota da ida para estimar o combustível.'}
        </p>
      </div>
    </>
  )
}

/* ---------- Agenda ---------- */

function AgendaPanel({ race: r, log, update, goTrip }) {
  const prof = useProfile()
  const { notify } = useUI()
  const prep = normalizePrep(log.prep ?? prof.data.prep)
  const [asDefault, setAsDefault] = useState(false)
  const schedule = useMemo(() => raceSchedule(r, prof.data.prep), [r, prof.data.prep])
  const ida = tripSummary(r, log, 'ida')
  const setPrep = (k, val) => update((l) => { l.prep = { ...normalizePrep(l.prep ?? getProfile().data.prep), [k]: val } })
  const generate = () => {
    update((l) => { l.prep = normalizePrep(l.prep ?? getProfile().data.prep) })
    if (asDefault) saveProfile({ ...getProfile().data, prep: normalizePrep(getRace(r.id).logistics.prep) })
    notify(asDefault ? 'Agenda gerada e preferências salvas como padrão' : 'Agenda gerada')
  }
  const exportIcs = () => {
    const { text } = buildICS([getRace(r.id)], { schedule: true })
    downloadText(text, `agenda-${r.date || 'prova'}.ics`, 'text/calendar')
  }
  const ready = !!(r.startTime && ida.complete)
  return (
    <>
      <div className="card">
        <div className="grid-2">
          <div className="field"><label htmlFor="start-time">Largada</label><input id="start-time" type="time" className="input" value={r.startTime || ''} onChange={(e) => update(() => ({ startTime: e.target.value }))} /></div>
          <div className="field"><label htmlFor="arrive-at">Chegar às</label><input id="arrive-at" type="time" className="input" value={r.startTime && hm(r.startTime) != null ? minToHm(hm(r.startTime) - prep.arriveBeforeMin, { withDay: false }) : ''} disabled={!r.startTime} onChange={(e) => { const a = hm(e.target.value); const L = hm(r.startTime); if (a != null && L != null && L - a >= 0) setPrep('arriveBeforeMin', L - a) }} /></div>
        </div>
        <div className="list-group-title">Tempos de preparação (minutos)</div>
        <div className="prep-grid" data-testid="prep">
          {PREP_FIELDS.filter((f) => f.key !== 'arriveBeforeMin').map((f) => (
            <label key={f.key} className="prep-item">
              <span>{f.label}</span>
              <MinutesInput value={prep[f.key]} max={f.max} label={f.label} onChange={(v) => setPrep(f.key, v)} />
            </label>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> Usar estes tempos nas próximas provas</label>
        <button type="button" className="btn btn-primary btn-block" onClick={generate} disabled={!ready} data-testid="gen-agenda">Gerar minha agenda</button>
        {!ready && <p className="note">{!r.startTime ? 'Informe o horário da largada. ' : ''}{!ida.complete ? <>Falta a rota da ida. <button type="button" className="link-btn" onClick={goTrip}>Planejar a ida</button></> : ''}</p>}
      </div>

      {schedule && log.prep && (
        <>
          <div className="section-title"><h2>Sua agenda</h2><span className="muted small">{r.date ? formatDateBR(r.date) : ''}</span></div>
          <Timeline schedule={schedule} />
          <Pickups race={r} schedule={schedule} stops={ida.points.filter((p) => p.role === 'stop')} />
          {schedule.noTraffic && (
            <div className="alert alert-info small" style={{ marginTop: 8 }} data-testid="no-traffic"><IconInfo /><div>{schedule.prep.trafficExtraPct ? `Trechos sem trânsito previsto: acréscimo de ${schedule.prep.trafficExtraPct}% aplicado.` : 'A rota não considera trânsito. Em horário de pico, use “Acréscimo por trânsito” (15 a 25%) ou aumente a margem.'}</div></div>
          )}
          {schedule.warnings.map((w, i) => <div key={i} className="alert alert-warn small" style={{ marginTop: 8 }}><div>{w}</div></div>)}
          <p className="note">Recalcula sozinha quando você muda a largada, as paradas, a rota ou os tempos. Trajeto: {minLabel(schedule.travelMin)}{ida.trafficMin != null ? ' com trânsito previsto' : ''}{schedule.dwellMin ? ` + ${schedule.dwellMin} min de paradas` : ''}.</p>
          <div className="card" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-dark btn-block" onClick={exportIcs}>Baixar agenda com alarmes (.ics)</button>
            <p className="note">Abra o arquivo no celular para criar os eventos “Acordar” e “Sair de casa” com alarme no calendário — o jeito confiável de ser acordado(a). As notificações do app chegam uma vez por dia e não servem de despertador.</p>
            <label className="check"><input type="checkbox" checked={log.scheduleInFeed} onChange={(e) => update((l) => { l.scheduleInFeed = e.target.checked })} /> Incluir estes horários na agenda por assinatura</label>
            <p className="note" style={{ marginTop: 0 }}>Vão só os horários e nomes das etapas — nunca endereços.</p>
          </div>
        </>
      )}
    </>
  )
}
