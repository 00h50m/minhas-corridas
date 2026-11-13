// Logística da prova: trajetos (ida, volta, kit), paradas, rota, custos e agenda do dia.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getRace, saveRace, useStore } from '../services/store.js'
import { getProfile, saveProfile, useProfile } from '../services/profile.js'
import { PROVIDER_LABEL, computeRoute, geocode, locateMe, routeAlternatives, routeCapabilities } from '../services/routing.js'
import { PRECISION_LABEL, isPrecise, precisionLabel } from '../lib/geo.js'
import PlaceField from '../components/PlaceField.jsx'
import { firstName } from '../lib/people.js'
import Pickups from '../components/Pickups.jsx'
import { Sheet, TopBar, useUI } from '../components/ui.jsx'
import { IconEdit, IconExternal, IconInfo, IconPin, IconPlus, IconX } from '../components/Icons.jsx'
import { FUELS, PART_KEYS, costItems, destinationPlace, fuelCost, kitPlace, legKey, navLinks, normalizeChoice, normalizeLogistics, partsToQuery, raceSchedule, routeKey, tripChoices, tripOf, tripPoints, tripSummary, transportTotals, venueAddress, kitAddress } from '../lib/logistics.js'
import { PREP_FIELDS, minToHm, normalizePrep, returnSchedule } from '../lib/schedule.js'
import { raceKitSchedule } from '../lib/logistics.js'
import { formatDateBR } from '../lib/dates.js'
import { formatKm, formatMoney, parseMoney, moneyToInput } from '../lib/format.js'
import { downloadText } from '../services/backup.js'
import { buildICS } from '../lib/ics.js'
import Timeline from '../components/Timeline.jsx'

const RouteMap = lazy(() => import('../components/RouteMap.jsx'))
const PointPicker = lazy(() => import('../components/RouteMap.jsx').then((m) => ({ default: m.PointPicker })))
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

  // Cada cálculo recebe um número; só o mais recente pode gravar (respostas antigas são descartadas).
  const seq = useRef(0)
  const failedKey = useRef(null)
  const calc = async () => {
    if (s.collapsed.length) return setErr(collapseMessage(s))
    const my = ++seq.current
    const key = s.key
    setErr(null)
    setBusy(true)
    try {
      // Cada trecho com o caminho escolhido (padrão: mais rápido); pontos de passagem não são paradas.
      const res = await computeRoute(s.points, departureAt(), s.choices.map((c) => (c ? { preference: c.preference, avoid: c.avoid, vias: c.vias } : null)))
      if (my !== seq.current) return
      failedKey.current = null
      update((l, fresh) => {
        // Os pontos (ou os caminhos escolhidos) mudaram enquanto calculava: esta resposta já não vale.
        if (tripSummary(fresh, l, which).routeKey !== key) return
        l[tripKey].route = { ...res, key }
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
      if (my !== seq.current) return
      failedKey.current = key
      setErr(e.message)
    } finally {
      if (my === seq.current) setBusy(false)
    }
  }

  // Recalcula sozinha quando endereços, paradas ou a ordem mudam (mudar só a permanência não chama o serviço).
  const autoKey = cap?.provider && s.enabled && s.points.length >= 2 && !s.complete && !s.collapsed.length && !s.unverified.length ? s.key : null
  useEffect(() => {
    if (!autoKey || failedKey.current === autoKey) return
    const t = setTimeout(() => calc(), 600)
    return () => clearTimeout(t)
  }, [autoKey])

  // Localiza de novo os pontos que caíram no mesmo lugar ou estão aproximados.
  const [fixing, setFixing] = useState(false)
  const relocate = async () => {
    const idx = [...new Set([...s.collapsed.flatMap((c) => [c.i, c.j]), ...s.approx])]
    setFixing(true)
    setErr(null)
    const missing = []
    const found = []
    for (const i of idx) {
      const p = s.points[i]
      const list = await geocode(p.formatted || p.address).catch(() => [])
      const g = list.find((x) => x.precision === 'numero' || x.precision === 'ponto')
      if (g) found.push({ p, g })
      else missing.push(p.label || p.address)
    }
    if (found.length) {
      const fix = (pl) => {
        if (!pl) return pl
        const hit = found.find(({ p }) => (p.id && pl.id === p.id) || pl.address === p.address)
        return hit ? { ...pl, formatted: hit.g.formatted, lat: hit.g.lat, lon: hit.g.lon, precision: hit.g.precision } : pl
      }
      update((l) => {
        l.origin = fix(l.origin)
        l.destination = fix(l.destination)
        l.kit.origin = fix(l.kit.origin)
        l.kit.destination = fix(l.kit.destination)
        for (const t of [l.outbound, l.back, l.kit]) t.stops = t.stops.map(fix)
      })
      // Os favoritos com o mesmo endereço também são corrigidos (senão o erro volta ao escolher o favorito).
      const pd = getProfile().data
      saveProfile({ ...pd, favorites: pd.favorites.map((f) => ({ ...fix(f), id: f.id, label: f.label, dwellMin: f.dwellMin })) })
    }
    setFixing(false)
    if (missing.length) setErr(`Não consegui confirmar o número de: ${missing.join(', ')}. Busque de novo com o CEP e o número, ou cole as coordenadas do ponto (do Google Maps: toque e segure no local).`)
    else notify(`${found.length} ${found.length === 1 ? 'endereço localizado' : 'endereços localizados'} de novo`)
  }

  const saveManual = (legs) => update((l) => { l[tripKey].route = { provider: 'manual', legs, key: s.key, fetchedAt: new Date().toISOString() } })

  // Trecho em destaque no mapa, trecho com o seletor de caminho aberto e parada em edição.
  const [legSel, setLegSel] = useState(null)
  const [pickLeg, setPickLeg] = useState(null)
  const [editStop, setEditStop] = useState(null)
  const mapRef = useRef(null)
  const showLeg = (i) => { setLegSel(i); mapRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
  /** Guarda o caminho escolhido para o trecho i e, se a rota atual estiver em dia, troca só esse trecho (sem nova consulta). */
  const applyChoice = (i, option) => {
    const a = s.points[i]
    const b = s.points[i + 1]
    const c = normalizeChoice({ ...option.choice, label: option.label })
    update((l, fresh) => {
      const before = tripSummary(fresh, l, which)
      const t = l[tripKey]
      t.legChoices = { ...(t.legChoices ?? {}) }
      if (c) t.legChoices[legKey(a, b)] = c
      else delete t.legChoices[legKey(a, b)]
      if (before.complete && t.route) {
        const pts = tripPoints(fresh, l, which)
        const legs = [...t.route.legs]
        legs[i] = { distanceKm: option.distanceKm, durationMin: option.durationMin, trafficMin: null, distanceM: option.distanceM, durationSec: option.durationSec, polyline: option.polyline, roads: option.roads }
        t.route = { ...t.route, legs, key: routeKey(pts, tripChoices(t, pts)), polyline: legs.every((x) => x.polyline) ? '' : t.route.polyline }
      }
    })
    setPickLeg(null)
    setLegSel(i)
    notify(`Caminho de ${a.label || 'Saída'} → ${b.label || 'Destino'}: ${option.label}`)
  }
  const stopIdAt = (i) => (editableStops && s.points[i]?.role === 'stop' ? s.points[i].id : null)
  const times = which === 'ida' && s.complete ? legTimes(schedule, s) : null
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
              <StopsEditor stops={editableStops} setStops={setStops} cap={cap} onEdit={setEditStop} />
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
              {s.collapsed.length > 0 && (
                <div className="alert alert-error small" role="alert" style={{ marginBottom: 10 }} data-testid="collapsed">
                  <div>
                    {collapseMessage(s)}
                    <button type="button" className="btn btn-block" style={{ marginTop: 8 }} disabled={fixing} onClick={relocate} data-testid="relocate">{fixing ? 'Localizando…' : 'Localizar de novo'}</button>
                  </div>
                </div>
              )}
              {!s.collapsed.length && s.approx.length > 0 && (
                <div className="alert alert-warn small" style={{ marginBottom: 10 }} data-testid="approx">
                  <div>
                    Localização aproximada: {s.approx.map((i) => `${s.points[i].label || 'Destino'} (${precisionLabel(s.points[i])})`).join(', ')}. A rota usa esse ponto e pode variar; confirme o ponto exato (busque com o número ou cole as coordenadas do mapa).
                    <button type="button" className="link-btn" disabled={fixing} onClick={relocate}>{fixing ? 'Localizando…' : 'Tentar localizar o número'}</button>
                  </div>
                </div>
              )}
              {s.invalid && !s.collapsed.length && <div className="alert alert-warn small" style={{ marginBottom: 10 }}><div>A rota salva tinha trechos de 0 km (pontos no mesmo lugar do mapa) e foi descartada.</div></div>}
              {s.stale && !s.invalid && !busy && <div className="alert alert-warn small" style={{ marginBottom: 10 }}><div>Os endereços ou a ordem mudaram desde o último cálculo.{cap?.provider ? ' A rota será recalculada.' : ' Informe os trechos de novo.'}</div></div>}
              {s.complete ? (
                <>
                  <LegsTable s={s} selected={legSel} onShow={showLeg} onPick={cap?.provider === 'ors' ? setPickLeg : null} />
                  <div className="route-total">
                    <b>{formatKm(s.distanceKm)}</b>
                    <span>{minLabel(s.trafficMin ?? s.durationMin)} dirigindo{s.trafficMin != null ? ' com trânsito previsto' : ''}</span>
                  </div>
                  {s.dwellMin > 0 && <p className="small route-dwell" data-testid="route-dwell">+ {minLabel(s.dwellMin)} nas paradas = <b>{minLabel(s.totalMin)}</b> de deslocamento</p>}
                  <p className="note">
                    Fonte: {PROVIDER_LABEL[s.route.provider]}
                    {s.route.provider === 'google' && (s.route.traffic ? ' · trânsito previsto para o horário de saída' : ' · sem previsão de trânsito (data no passado)')}
                    {s.route.provider === 'ors' && ' · sem trânsito'}
                    {s.route.tolls ? ` · pedágios estimados: ${formatMoney(s.route.tolls.amount)}` : s.route.hasTolls ? ' · há pedágios, sem tarifa informada (preencha em Custos)' : ''}
                    {s.route.fetchedAt && s.route.provider !== 'manual' ? ` · calculado em ${new Date(s.route.fetchedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </>
              ) : (
                <p className="small muted" style={{ marginTop: 0 }} data-testid="route-pending">{busy ? 'Calculando a rota…' : `${s.points.length - 1} ${s.points.length - 1 === 1 ? 'trecho' : 'trechos'} a calcular.`}</p>
              )}
              {err && <div className="alert alert-error small" role="alert" style={{ marginBottom: 10 }}><div>{err}</div></div>}
              <div className="btn-row">
                {cap?.provider ? <button type="button" className="btn btn-primary" disabled={busy || s.collapsed.length > 0} onClick={calc}>{busy ? 'Calculando…' : s.complete ? 'Recalcular rota' : 'Calcular rota'}</button> : <span />}
                <button type="button" className="btn" onClick={() => setManual((v) => !v)}>{manual ? 'Fechar' : 'Informar à mão'}</button>
              </div>
              {(manual || (!cap?.provider && !s.complete)) && <ManualLegs points={s.points} legs={s.complete ? s.legs : null} onSave={(legs) => { saveManual(legs); setManual(false); notify('Trechos salvos') }} />}
              {which === 'volta' && ret && <p className="small" style={{ marginBottom: 0 }}>Saindo às {log.back.departTime}, chegada prevista em casa às <b>{minToHm(ret.arrival)}</b>.</p>}
              {which === 'kit' && kitS && <p className="small" style={{ marginBottom: 0 }}>Para chegar às {r.kitPickupTime} ({formatDateBR(r.kitPickupDate)}), saia às <b>{minToHm(kitS.depart)}</b> (com margem).</p>}
            </div>
          )}

          {coordsForMap.length >= 2 && (
            <Suspense fallback={<div className="route-map placeholder" />}>
              <div ref={mapRef}>
                <RouteMap polyline={s.route?.polyline} points={coordsForMap} labels={s.points.map((p) => p.label || (p.role === 'origin' ? 'Saída' : 'Destino'))} legs={s.complete && s.legs.some((l) => l.polyline) ? s.legs : null} selected={legSel} onMarker={(i) => stopIdAt(i) && setEditStop(stopIdAt(i))} />
                {legSel != null && s.complete && (
                  <div className="map-leg-info small" data-testid="map-leg-info">
                    <b>{s.points[legSel].label || 'Saída'} → {s.points[legSel + 1].label || 'Destino'}</b> · {formatKm(s.legKm[legSel])} · {s.legMin[legSel]} min
                    <button type="button" className="link-btn" onClick={() => setLegSel(null)}>Ver a rota inteira</button>
                  </div>
                )}
              </div>
            </Suspense>
          )}
          {s.complete && coordsForMap.length < 2 && <p className="note">O mapa aparece quando os endereços são verificados ou a rota é calculada pelo serviço de mapas.</p>}

          {times && <TripTimes times={times} provider={s.route?.provider} />}
          {pickLeg != null && s.points[pickLeg + 1] && (
            <RoutePicker a={s.points[pickLeg]} b={s.points[pickLeg + 1]} current={s.complete ? { ...s.legs[pickLeg], choice: s.choices[pickLeg] } : null} onClose={() => setPickLeg(null)} onApply={(o) => applyChoice(pickLeg, o)} />
          )}
          {editStop && editableStops?.some((x) => x.id === editStop) && (
            <StopEditSheet stop={editableStops.find((x) => x.id === editStop)} cap={cap} near={s.points[0]} onClose={() => setEditStop(null)}
              onSave={(st) => { setStops((list) => list.map((x) => (x.id === st.id ? st : x))); setEditStop(null); notify('Parada atualizada') }}
              onDelete={() => { setStops((list) => list.filter((x) => x.id !== editStop)); setEditStop(null); notify('Parada excluída') }} />
          )}

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

function StopsEditor({ stops, setStops, cap, onEdit }) {
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
  // Arrastar e soltar pela alça (funciona com o dedo): a ordem definida por você é a referência.
  const listRef = useRef(null)
  const [drag, setDrag] = useState(null) // { from, over }
  const onHandleDown = (i) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ from: i, over: i })
  }
  const onHandleMove = (e) => {
    if (!drag) return
    const items = [...(listRef.current?.querySelectorAll(':scope > li') ?? [])]
    const over = items.findIndex((li) => { const r = li.getBoundingClientRect(); return e.clientY >= r.top && e.clientY <= r.bottom })
    if (over >= 0 && over !== drag.over) setDrag({ ...drag, over })
  }
  const onHandleUp = () => {
    if (drag && drag.over !== drag.from) move(drag.from, drag.over - drag.from)
    setDrag(null)
  }
  return (
    <>
      <ol className="stops" data-testid="stops" ref={listRef}>
        {stops.map((st, i) => (
          <li key={st.id} className={drag?.over === i && drag.from !== i ? 'drop-here' : drag?.from === i ? 'dragging' : ''}>
            <button type="button" className="drag-handle" aria-label={`Arrastar ${st.label || 'parada'} para mudar a ordem`} onPointerDown={onHandleDown(i)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={() => setDrag(null)}>⠿</button>
            <div className="st-main">
              <b>{i + 1}. {st.label || 'Parada'}</b>
              <span className="muted small">{isPrecise(st) ? '✓ ' : st.lat != null ? '≈ ' : ''}{st.formatted || st.address}{st.lat != null && !isPrecise(st) ? ' (aproximado)' : ''}{st.reference ? ` · ${st.reference}` : ''}</span>
            </div>
            <label className="st-dwell">
              <MinutesInput value={st.dwellMin} max={600} label={`Minutos em ${st.label || 'parada'}`} onChange={(v) => setStops((list) => list.map((x) => (x.id === st.id ? { ...x, dwellMin: v } : x)))} />
              <span>min</span>
            </label>
            <div className="st-actions">
              <button type="button" className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label="Descer" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>↓</button>
              {onEdit && <button type="button" className="icon-btn" aria-label={`Editar ${st.label || 'parada'}`} onClick={() => onEdit(st.id)} data-testid="stop-edit-btn"><IconEdit /></button>}
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
  const [adjust, setAdjust] = useState(false)
  if (!dest) {
    return <PlaceField label="Local da largada" place={null} cap={cap} testid="destination" hint="Fica salvo no cadastro da prova." onChange={(p) => update((l, fresh) => { l.destination = { ...p, address: venueAddress({ ...fresh, venueAddress: p.address }) }; return { venueAddress: p.address } })} />
  }
  return (
    <div className="trip-fixed" data-testid="destination">
      <span className="tf-k">Destino</span>
      <span>{isPrecise(dest) ? '✓ ' : dest.lat != null ? '≈ ' : ''}{dest.formatted || dest.address}{dest.lat != null && !isPrecise(dest) ? ' (aproximado)' : ''}</span>
      {cap && (!isPrecise(dest) || adjust) && (
        <PlaceField label={dest.lat == null ? 'Confirmar o local da largada' : 'Ponto exato do destino (busque com o número ou cole as coordenadas do mapa)'} place={dest} cap={cap} testid="destination-fix" noFav onChange={(p) => { update((l) => { l.destination = { ...p, address: dest.address } }); setAdjust(false) }} />
      )}
      <div className="btn-inline">
        {cap && isPrecise(dest) && !adjust && <button type="button" className="link-btn" onClick={() => setAdjust(true)}>Ajustar o ponto</button>}
        <Link to={`/corridas/${r.id}/editar`} className="link-btn">Mudar no cadastro</Link>
      </div>
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

const PRECISE_TXT = (p) => (p.precision === 'manual' ? '✓ ponto marcado por você' : p.precision === 'gps' ? '✓ localização do GPS' : isPrecise(p) ? '✓ localização confirmada' : p.lat != null ? `≈ ${precisionLabel(p)}` : 'sem localização')
const AVOID_TXT = { highways: 'evitar rodovias', tollways: 'evitar pedágios' }
const choiceText = (c) => (!c ? 'Mais rápida' : c.label || [c.preference === 'shortest' ? 'Menor distância' : null, ...c.avoid.map((a) => AVOID_TXT[a])].filter(Boolean).join(', '))

/** Trechos: compacto por padrão (nome → nome, km, min); tocar abre os detalhes e as ações. */
function LegsTable({ s, selected, onShow, onPick }) {
  const [open, setOpen] = useState(null)
  const { points, legs, legKm, legMin, choices } = s
  return (
    <div className="legs-list" data-testid="legs" role="list">
      <div className="legs-head" aria-hidden="true"><span>Trecho</span><span>km</span><span>Tempo</span></div>
      {legs.map((l, i) => {
        const a = points[i]
        const b = points[i + 1]
        const isOpen = open === i
        const traffic = l.trafficMin != null && l.trafficMin !== l.durationMin
        return (
          <div key={i} className={`leg-row${isOpen ? ' open' : ''}${selected === i ? ' sel' : ''}`} role="listitem" data-testid="leg">
            <button type="button" className="leg-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span className="leg-name">{a.label || 'Saída'} → {b.label || 'Destino'}{choices[i] && <span className="leg-tag">{choiceText(choices[i])}</span>}</span>
              <span className="leg-km">{formatKm(legKm[i], { unit: false })}</span>
              <span className="leg-min">{traffic ? <><b>{l.trafficMin}</b> <span className="muted">({legMin[i]})</span></> : legMin[i]} min</span>
            </button>
            {isOpen && (
              <div className="leg-detail small" data-testid="leg-detail">
                <div><span className="muted">Caminho:</span> {choiceText(choices[i])}{choices[i]?.vias?.length ? ` · ${choices[i].vias.length} ${choices[i].vias.length === 1 ? 'ponto' : 'pontos'} de passagem` : ''}</div>
                {l.roads?.length > 0 && <div><span className="muted">Principais vias:</span> {l.roads.join(' · ')}</div>}
                <div><span className="muted">{a.label || 'Saída'}:</span> {PRECISE_TXT(a)}</div>
                <div><span className="muted">{b.label || 'Destino'}:</span> {PRECISE_TXT(b)}</div>
                <div className="btn-inline">
                  <button type="button" className="link-btn" onClick={() => onShow(i)}>Ver no mapa</button>
                  {onPick && <button type="button" className="link-btn" onClick={() => onPick(i)} data-testid="leg-pick">Alterar caminho</button>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const diffTxt = (d, unit, fmt = (x) => x) => (Math.abs(d) < (unit === 'km' ? 0.05 : 1) ? 'igual' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${unit}`)

/**
 * Caminhos para um trecho: os que o serviço calcular (mais rápida, menor distância, evitar rodovias,
 * evitar pedágios, alternativas) e o personalizado por pontos de passagem tocados no mapa.
 */
function RoutePicker({ a, b, current, onClose, onApply }) {
  const [options, setOptions] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [vias, setVias] = useState(() => current?.choice?.vias ?? [])
  const [custom, setCustom] = useState(false)
  const seq = useRef(0)
  const load = async (v = vias) => {
    const my = ++seq.current
    setBusy(true)
    setErr(null)
    try {
      const list = await routeAlternatives(a, b, v)
      if (my !== seq.current) return
      setOptions(list)
      setChosen((c) => (v.length && list.some((o) => o.id === 'custom') ? 'custom' : c ?? list[0]?.id ?? null))
    } catch (e) {
      if (my === seq.current) setErr(e.message)
    } finally {
      if (my === seq.current) setBusy(false)
    }
  }
  useEffect(() => { load() }, [])
  const opt = options?.find((o) => o.id === chosen)
  const fmtKm = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
  return (
    <Sheet title={`${a.label || 'Saída'} → ${b.label || 'Destino'}`} onClose={onClose}>
      <div data-testid="route-picker">
        <p className="muted small" style={{ marginTop: 0 }}>Escolha o caminho deste trecho. Só aparecem as opções que o serviço de mapas conseguiu calcular; “evitar rodovias” é uma preferência, não uma garantia.</p>
        {busy && <p className="small" data-testid="picker-busy">Calculando caminhos…</p>}
        {err && <div className="alert alert-error small" role="alert"><div>{err}</div></div>}
        {options && (
          <ul className="route-options" aria-label="Caminhos possíveis">
            {options.map((o) => {
              const dKm = current?.distanceM != null ? (o.distanceM - current.distanceM) / 1000 : null
              const dMin = current?.durationSec != null ? (o.durationSec - current.durationSec) / 60 : null
              return (
                <li key={o.id}>
                  <button type="button" className={`route-option${chosen === o.id ? ' on' : ''}`} aria-pressed={chosen === o.id} onClick={() => setChosen(o.id)} data-testid={`opt-${o.id}`}>
                    <span className="ro-top"><b>{o.label}</b>{o.also?.length ? <span className="muted"> = {o.also.join(', ')}</span> : null}</span>
                    <span className="ro-val">{fmtKm(o.distanceM / 1000)} km · {Math.round(o.durationSec / 60)} min</span>
                    {o.roads?.length > 0 && <span className="ro-roads muted">{o.roads.join(' · ')}</span>}
                    {dKm != null && <span className="ro-diff">vs. atual: {diffTxt(dKm, 'km', fmtKm)} · {diffTxt(dMin, 'min', Math.round)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {options?.length > 0 && (
          <Suspense fallback={<div className="route-map placeholder" />}>
            <RouteMap points={[a, b]} labels={[a.label || 'Saída', b.label || 'Destino']} alternatives={options} altSelected={chosen} vias={custom ? vias : null}
              onMapClick={custom ? (lat, lon) => setVias((v) => (v.length >= 5 ? v : [...v, { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 }])) : null}
              onViaMove={custom ? (i, lat, lon) => setVias((v) => v.map((x, k) => (k === i ? { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 } : x))) : null}
              height={260} testid="picker-map" />
          </Suspense>
        )}
        <div className="card custom-route" style={{ marginTop: 10 }}>
          {!custom ? (
            <button type="button" className="link-btn" onClick={() => setCustom(true)} data-testid="custom-start">+ Rota personalizada (pontos de passagem)</button>
          ) : (
            <>
              <b className="small">Rota personalizada</b>
              <p className="muted small" style={{ margin: '4px 0 8px' }}>Toque no mapa por onde você quer passar (ex.: na Av. Guilherme Porcari). Pontos de passagem só orientam o caminho: não são paradas e não somam tempo de permanência. Arraste para ajustar.</p>
              {vias.length === 0 && <p className="small muted">Nenhum ponto ainda.</p>}
              <ol className="via-list">
                {vias.map((v, i) => <li key={i}><span>Ponto {i + 1}: {v.lat.toFixed(5)}, {v.lon.toFixed(5)}</span> <button type="button" className="link-btn muted-btn" onClick={() => setVias((x) => x.filter((_, k) => k !== i))}>Remover</button></li>)}
              </ol>
              <button type="button" className="btn btn-block" disabled={!vias.length || busy} onClick={() => load(vias)} data-testid="custom-calc">{busy ? 'Calculando…' : 'Calcular por esses pontos'}</button>
            </>
          )}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!opt} onClick={() => onApply(opt)} data-testid="picker-apply">Usar este caminho</button>
        </div>
      </div>
    </Sheet>
  )
}

/** Horários do trajeto da ida (a partir da agenda): sair de casa, chegar e sair de cada parada, chegar ao destino. */
function legTimes(schedule, s) {
  if (!schedule) return null
  const out = [{ key: 'sair', label: `Sair de ${s.points[0].label || 'casa'}`, at: schedule.depart }]
  s.points.slice(1, -1).forEach((p, i) => {
    const it = schedule.items.find((x) => x.key === `parada-${i}`)
    if (it) out.push({ key: `p${i}`, label: p.label || `Parada ${i + 1}`, at: it.at, leave: it.leaveAt })
  })
  const park = schedule.items.find((x) => x.key === 'estacionar')
  if (park) out.push({ key: 'dest', label: `Chegar a ${s.points.at(-1).label || 'destino'}`, at: park.at })
  return { list: out, buffer: schedule.prep.bufferMin, arrival: schedule.arrivalTarget, noTraffic: schedule.noTraffic }
}

function TripTimes({ times, provider }) {
  return (
    <div className="card trip-times" data-testid="trip-times" style={{ marginTop: 12 }}>
      <div className="section-sub"><b>Horários do trajeto</b></div>
      <ol className="tt-list">
        {times.list.map((t) => (
          <li key={t.key}>
            <span className="tt-at">{minToHm(t.at)}</span>
            <span className="tt-what">{t.label}{t.leave != null && <span className="muted"> · sair {minToHm(t.leave)}</span>}</span>
          </li>
        ))}
      </ol>
      <p className="note" style={{ marginBottom: 0 }}>
        Saída = chegada desejada ({minToHm(times.arrival)}) − direção − paradas − margem ({times.buffer} min). {provider === 'ors' || times.noTraffic ? 'Tempos sem trânsito (o OpenRouteService não prevê trânsito).' : 'Com trânsito previsto pelo Google para o horário.'} Ajuste a chegada e a margem na aba Agenda.
      </p>
    </div>
  )
}

/** Edição completa de uma parada: mantém o id e a posição; só busca de novo se o endereço mudar. */
function StopEditSheet({ stop, cap, near, onClose, onSave, onDelete }) {
  const { confirm } = useUI()
  const init = useMemo(() => ({
    label: stop.label || '',
    dwellMin: stop.dwellMin ?? 5,
    reference: stop.reference || '',
    parts: { street: '', number: '', complement: '', district: '', city: '', cep: '', ...(stop.parts ?? {}) },
    place: { address: stop.address, formatted: stop.formatted, lat: stop.lat, lon: stop.lon, precision: stop.precision }
  }), [stop.id])
  const [f, setF] = useState(init)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [latTxt, setLatTxt] = useState(stop.lat != null ? String(stop.lat) : '')
  const [lonTxt, setLonTxt] = useState(stop.lon != null ? String(stop.lon) : '')
  const dirty = JSON.stringify(f) !== JSON.stringify(init)
  const setPart = (k, v) => setF((x) => ({ ...x, parts: { ...x.parts, [k]: v } }))
  const setPoint = (lat, lon, precision = 'manual') => {
    const la = Math.round(lat * 1e6) / 1e6
    const lo = Math.round(lon * 1e6) / 1e6
    setLatTxt(String(la))
    setLonTxt(String(lo))
    setF((x) => ({ ...x, place: { ...x.place, lat: la, lon: lo, precision } }))
  }
  const typedQuery = partsToQuery(f.parts) || f.place.address
  const search = async () => {
    setErr(null)
    if (typedQuery.trim().length < 5) return setErr('Preencha a rua e a cidade (ou o CEP).')
    setBusy('busca')
    try {
      const list = await geocode(typedQuery, { near })
      setResults(list)
      if (!list.length) setErr('Não encontrei. Confira a rua e a cidade, ou marque o ponto no mapa.')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const pick = (g) => {
    setF((x) => ({ ...x, place: { address: partsToQuery(x.parts) || g.formatted, formatted: g.formatted, lat: g.lat, lon: g.lon, precision: g.precision || (g.partial ? 'area' : 'numero') } }))
    setLatTxt(String(g.lat))
    setLonTxt(String(g.lon))
    setResults(null)
  }
  const useHere = async () => {
    setErr(null)
    setBusy('local')
    try {
      const g = await locateMe()
      setF((x) => ({ ...x, place: { ...x.place, formatted: g.formatted || x.place.formatted, lat: g.lat, lon: g.lon, precision: 'gps' } }))
      setLatTxt(String(g.lat))
      setLonTxt(String(g.lon))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const typeCoord = (which, v) => {
    if (which === 'lat') setLatTxt(v)
    else setLonTxt(v)
    const la = Number(String(which === 'lat' ? v : latTxt).replace(',', '.'))
    const lo = Number(String(which === 'lon' ? v : lonTxt).replace(',', '.'))
    if (la >= -34 && la <= 5.4 && lo >= -74 && lo <= -34.7) setF((x) => ({ ...x, place: { ...x.place, lat: la, lon: lo, precision: 'manual' } }))
  }
  const save = () => {
    if (!f.label.trim()) return setErr('Dê um nome à parada (ex.: Dani).')
    if (!f.place.address && !typedQuery) return setErr('Informe o endereço.')
    const parts = Object.fromEntries(Object.entries(f.parts).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v))
    onSave({ ...stop, label: f.label.trim(), dwellMin: f.dwellMin, reference: f.reference.trim(), parts, ...f.place, address: f.place.address || typedQuery })
  }
  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Descartar alterações?', message: 'As mudanças nesta parada não foram salvas.', confirmLabel: 'Descartar' }))) return
    onClose()
  }
  const remove = async () => {
    if (await confirm({ title: `Excluir ${stop.label || 'a parada'}?`, message: 'A parada sai deste trajeto. A rota será recalculada.', confirmLabel: 'Excluir', danger: true })) onDelete()
  }
  const P = (k, label, o = {}) => (
    <div className="field" style={o.style}><label htmlFor={`se-${k}`}>{label}</label><input id={`se-${k}`} className="input" value={f.parts[k]} onChange={(e) => setPart(k, e.target.value)} {...o.input} /></div>
  )
  return (
    <Sheet title="Editar parada" onClose={cancel}>
      <div className="stop-edit" data-testid="stop-edit">
        {dirty && <div className="unsaved small" role="status" data-testid="unsaved">Alterações não salvas</div>}
        <div className="grid-2-1">
          <div className="field"><label htmlFor="se-label">Nome da parada</label><input id="se-label" className="input" value={f.label} onChange={(e) => setF((x) => ({ ...x, label: e.target.value }))} maxLength={60} /></div>
          <div className="field"><label htmlFor="se-dwell">Permanência</label><MinutesInput value={f.dwellMin} max={600} label="Minutos de permanência" onChange={(v) => setF((x) => ({ ...x, dwellMin: v }))} /></div>
        </div>
        <div className="list-group-title">Endereço</div>
        <p className="small" style={{ margin: '0 0 6px' }}>Atual: {f.place.formatted || f.place.address} <span className={isPrecise(f.place) ? 'delta-good' : 'place-approx'}>({PRECISE_TXT(f.place)})</span></p>
        <div className="grid-2-1">
          {P('street', 'Rua', { input: { placeholder: 'Ex.: Rua Beija-Flor' } })}
          {P('number', 'Número', { input: { inputMode: 'numeric', placeholder: '250' } })}
        </div>
        <div className="grid-2">
          {P('complement', 'Complemento')}
          {P('district', 'Bairro')}
        </div>
        <div className="grid-2">
          {P('city', 'Cidade', { input: { placeholder: 'Jundiaí' } })}
          {P('cep', 'CEP', { input: { inputMode: 'numeric', placeholder: '13212-812' } })}
        </div>
        <div className="field"><label htmlFor="se-ref">Ponto de referência <span className="opt">opcional</span></label><input id="se-ref" className="input" value={f.reference} onChange={(e) => setF((x) => ({ ...x, reference: e.target.value }))} maxLength={120} placeholder="Ex.: portão azul, em frente à padaria" /></div>
        <div className="btn-inline">
          <button type="button" className="btn btn-dark" disabled={!!busy} onClick={search} data-testid="se-search">{busy === 'busca' ? 'Buscando…' : 'Buscar endereço'}</button>
          <button type="button" className="link-btn" onClick={() => setMapOpen((v) => !v)} data-testid="se-map">{mapOpen ? 'Fechar mapa' : 'Localizar no mapa'}</button>
          <button type="button" className="link-btn" disabled={!!busy} onClick={useHere}>{busy === 'local' ? 'Localizando…' : '📍 Usar minha localização'}</button>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        {results?.length > 0 && (
          <ul className="geo-results" aria-label="Endereços encontrados">
            {results.map((g, i) => (
              <li key={i}><button type="button" onClick={() => pick(g)}>{g.formatted}<span className="geo-tags">{g.partial && <span>aproximado{PRECISION_LABEL[g.precision] ? `: ${PRECISION_LABEL[g.precision]}` : ''}</span>}</span></button></li>
            ))}
          </ul>
        )}
        {mapOpen && (
          <Suspense fallback={<div className="route-map placeholder" />}>
            <p className="small muted" style={{ margin: '8px 0 4px' }}>Arraste o marcador (ou toque no mapa) até o local exato. O ponto passa a valer como “marcado por você”.</p>
            <PointPicker point={f.place.lat != null ? { lat: f.place.lat, lon: f.place.lon } : null} around={near} onChange={(lat, lon) => setPoint(lat, lon)} />
          </Suspense>
        )}
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div className="field"><label htmlFor="se-lat">Latitude</label><input id="se-lat" className="input" inputMode="decimal" value={latTxt} onChange={(e) => typeCoord('lat', e.target.value)} placeholder="-23.19992" /></div>
          <div className="field"><label htmlFor="se-lon">Longitude</label><input id="se-lon" className="input" inputMode="decimal" value={lonTxt} onChange={(e) => typeCoord('lon', e.target.value)} placeholder="-47.00953" /></div>
        </div>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={cancel}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={save} data-testid="se-save">Salvar alterações</button>
        </div>
        <button type="button" className="link-btn muted-btn" style={{ marginTop: 8 }} onClick={remove}>Excluir parada</button>
      </div>
    </Sheet>
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

/** “Casa, Dani e Eloy Chaves estão no mesmo ponto do mapa…” */
function collapseMessage(s) {
  // Agrupa os pontos que coincidem entre si.
  const groups = []
  for (const { i, j } of s.collapsed) {
    const g = groups.find((x) => x.has(i) || x.has(j))
    if (g) { g.add(i); g.add(j) } else groups.push(new Set([i, j]))
  }
  const name = (i) => s.points[i].label || (i === 0 ? 'Saída' : 'Destino')
  const list = (g) => { const n = [...g].sort((a, b) => a - b).map(name); return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n.at(-1)}` : n[0] }
  return `${groups.map(list).join('; ')} estão no mesmo ponto do mapa: a localização veio aproximada (provavelmente o centro da cidade ou do CEP), e a rota daria 0 km entre eles. Localize esses endereços de novo.`
}
