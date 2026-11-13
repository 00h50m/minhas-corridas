// Pessoas e lugares: endereços de sempre e quem você costuma buscar ou leva junto às provas.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import { IconPlus } from '../components/Icons.jsx'
import PlaceField from '../components/PlaceField.jsx'
import { getProfile, saveProfile, useProfile } from '../services/profile.js'
import { routeCapabilities } from '../services/routing.js'
import { firstName, phoneForWhatsapp } from '../lib/people.js'
import { isPrecise, precisionLabel } from '../lib/geo.js'
import { getState, saveRace } from '../services/store.js'
import { todayISO } from '../lib/dates.js'

const newId = () => Math.random().toString(36).slice(2, 10)
const save = (patch) => saveProfile({ ...getProfile().data, ...patch })

export default function PeoplePlaces() {
  const prof = useProfile()
  const [cap, setCap] = useState(null)
  useEffect(() => { routeCapabilities().then(setCap) }, [])
  const { favorites: places, people } = prof.data
  return (
    <>
      <TopBar title="Pessoas e lugares" back="/perfil" />
      <div className="page">
        <p className="note" style={{ marginTop: 0 }}>Cadastre quem você costuma buscar e os endereços de sempre. Na Logística de cada prova, eles viram paradas com um toque, e a agenda calcula a hora de passar em cada um.</p>

        <div className="section-title"><h2>Pessoas</h2></div>
        {people.length === 0 && <div className="card muted small">Ninguém cadastrado ainda.</div>}
        {people.map((p) => <PersonCard key={p.id} person={p} places={places} cap={cap} />)}
        <PersonForm places={places} cap={cap} />

        <div className="section-title"><h2>Lugares</h2></div>
        {places.length === 0 && <div className="card muted small">Nenhum lugar salvo. Exemplos: Casa, Academia, Posto da esquina.</div>}
        {places.map((pl) => <PlaceCard key={pl.id} place={pl} people={people} cap={cap} />)}
        <PlaceForm cap={cap} />

        <p className="note">Ficam no aparelho e na sua conta, como o resto do app. São dados de outras pessoas: guarde só o necessário. <Link to="/privacidade">Privacidade</Link></p>
      </div>
    </>
  )
}

function PersonCard({ person: p, places, cap }) {
  const { confirm, notify } = useUI()
  const [editing, setEditing] = useState(false)
  const place = places.find((x) => x.id === p.placeId)
  const remove = async () => {
    if (!(await confirm({ title: `Remover ${p.name}?`, message: 'As provas em que ela foi marcada continuam salvas; só o cadastro sai.', confirmLabel: 'Remover', danger: true }))) return
    save({ people: getProfile().data.people.filter((x) => x.id !== p.id) })
    notify('Pessoa removida')
  }
  if (editing) return <PersonForm person={p} places={places} cap={cap} onDone={() => setEditing(false)} />
  return (
    <div className="card pp-card" data-testid="person">
      <div className="pp-main">
        <b>{p.name}</b>
        <span className="muted small">{[p.phone, place ? `★ ${place.label}` : null].filter(Boolean).join(' · ') || 'Sem telefone nem endereço'}</span>
      </div>
      <div className="pp-actions">
        {phoneForWhatsapp(p.phone) && <a className="link-btn" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>Ligar</a>}
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>Editar</button>
        <button type="button" className="link-btn muted-btn" onClick={remove}>Remover</button>
      </div>
    </div>
  )
}

function PersonForm({ person = null, places, cap, onDone }) {
  const { notify } = useUI()
  const [open, setOpen] = useState(!!person)
  const [name, setName] = useState(person?.name ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [placeId, setPlaceId] = useState(person?.placeId ?? '')
  const [newPlace, setNewPlace] = useState(null)
  const [err, setErr] = useState(null)
  if (!open) return <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><IconPlus /> Adicionar pessoa</button>
  const submit = () => {
    if (!name.trim()) return setErr('Informe o nome.')
    if (phone.trim() && !phoneForWhatsapp(phone)) return setErr('Telefone com DDD, ex.: (11) 98888-7777.')
    const data = getProfile().data
    let favorites = data.favorites
    let pid = placeId === '__novo' ? null : placeId || null
    if (placeId === '__novo' && newPlace) {
      const id = newId()
      favorites = [...favorites, { ...newPlace, id, label: `Casa da ${firstName(name)}`.slice(0, 60), dwellMin: 5 }]
      pid = id
    }
    const entry = { id: person?.id ?? newId(), name: name.trim(), phone: phone.trim(), placeId: pid }
    const people = person ? data.people.map((x) => (x.id === person.id ? entry : x)) : [...data.people, entry]
    saveProfile({ ...data, favorites, people })
    notify(person ? 'Pessoa atualizada' : 'Pessoa cadastrada')
    if (onDone) onDone()
    else { setOpen(false); setName(''); setPhone(''); setPlaceId(''); setNewPlace(null); setErr(null) }
  }
  return (
    <div className="card pp-form" data-testid="person-form">
      <div className="field"><label htmlFor={`pn-${person?.id ?? 'novo'}`}>Nome</label><input id={`pn-${person?.id ?? 'novo'}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex.: Ana" /></div>
      <div className="field"><label htmlFor={`pt-${person?.id ?? 'novo'}`}>Telefone <span className="opt">opcional, para mandar o horário no WhatsApp</span></label><input id={`pt-${person?.id ?? 'novo'}`} className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="(11) 98888-7777" /></div>
      <div className="field">
        <label htmlFor={`pl-${person?.id ?? 'novo'}`}>Onde buscar <span className="opt">opcional</span></label>
        <select id={`pl-${person?.id ?? 'novo'}`} className="input" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
          <option value="">— não busco</option>
          {places.map((pl) => <option key={pl.id} value={pl.id}>★ {pl.label}</option>)}
          <option value="__novo">+ Novo endereço…</option>
        </select>
      </div>
      {placeId === '__novo' && <PlaceField label="Endereço para buscar" place={newPlace} cap={cap} testid="person-place" noFav onChange={setNewPlace} />}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => (onDone ? onDone() : setOpen(false))}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={placeId === '__novo' && !newPlace}>Salvar</button>
      </div>
    </div>
  )
}

/** Provas futuras cuja logística usa este endereço (saída, destino, paradas, kit). */
function racesUsing(address) {
  const today = todayISO()
  return getState().races.filter((r) => r.logistics && (!r.date || r.date >= today) && placesOf(r.logistics).some((x) => x?.address === address))
}
const placesOf = (l) => [l.origin, l.destination, l.kit?.origin, l.kit?.destination, ...(l.outbound?.stops ?? []), ...(l.back?.stops ?? []), ...(l.kit?.stops ?? [])]

function PlaceCard({ place: pl, people, cap }) {
  const { confirm, notify } = useUI()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(pl.label)
  const [dwell, setDwell] = useState(pl.dwellMin ?? '')
  const [newPlace, setNewPlace] = useState(null)
  const users = people.filter((p) => p.placeId === pl.id)
  const remove = async () => {
    if (!(await confirm({ title: `Remover ${pl.label}?`, message: users.length ? `${users.map((u) => u.name).join(', ')} ficará sem endereço de busca.` : 'O endereço sai dos favoritos.', confirmLabel: 'Remover', danger: true }))) return
    const data = getProfile().data
    save({ favorites: data.favorites.filter((x) => x.id !== pl.id), people: data.people.map((p) => (p.placeId === pl.id ? { ...p, placeId: null } : p)) })
    notify('Lugar removido')
  }
  const submit = async () => {
    if (!label.trim()) return
    const d = String(dwell).trim() === '' ? null : Math.max(0, Math.min(600, Number(dwell) || 0))
    const moved = newPlace && (newPlace.address !== pl.address || newPlace.lat !== pl.lat || newPlace.lon !== pl.lon)
    const loc = moved ? { address: newPlace.address, formatted: newPlace.formatted, lat: newPlace.lat, lon: newPlace.lon, precision: newPlace.precision } : {}
    save({ favorites: getProfile().data.favorites.map((x) => (x.id === pl.id ? { ...x, ...loc, label: label.trim(), dwellMin: d } : x)) })
    setEditing(false)
    setNewPlace(null)
    notify('Lugar atualizado')
    // Rotas já planejadas não mudam sozinhas: pergunta antes de atualizar as provas que usam o endereço antigo.
    if (moved) {
      const used = racesUsing(pl.address)
      if (used.length && (await confirm({ title: 'Atualizar nas provas?', message: `${used.map((r) => r.name).join(', ')} ${used.length === 1 ? 'usa' : 'usam'} o endereço antigo de ${pl.label}. Atualizar para o novo? As rotas dessas provas serão recalculadas.`, confirmLabel: 'Atualizar' }))) {
        for (const r of used) {
          const l = structuredClone(r.logistics)
          const fix = (x) => (x?.address === pl.address ? { ...x, ...loc } : x)
          l.origin = fix(l.origin)
          l.destination = fix(l.destination)
          l.kit.origin = fix(l.kit.origin)
          l.kit.destination = fix(l.kit.destination)
          for (const t of [l.outbound, l.back, l.kit]) t.stops = t.stops.map(fix)
          saveRace({ ...r, logistics: l })
        }
        notify(`${used.length} ${used.length === 1 ? 'prova atualizada' : 'provas atualizadas'}`)
      }
    }
  }
  return (
    <div className="card pp-card" data-testid="place">
      {editing ? (
        <div style={{ width: '100%' }}>
          <div className="grid-2-1">
            <div className="field"><label htmlFor={`ln-${pl.id}`}>Nome</label><input id={`ln-${pl.id}`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} /></div>
            <div className="field"><label htmlFor={`ld-${pl.id}`}>Parada (min)</label><input id={`ld-${pl.id}`} className="input" inputMode="numeric" value={dwell} onChange={(e) => setDwell(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="5" /></div>
          </div>
          <PlaceField label="Endereço (busque de novo para mudar o local ou o ponto)" place={newPlace ?? pl} cap={cap} testid={`place-edit-${pl.id}`} noFav onChange={setNewPlace} />
          <div className="btn-row"><button type="button" className="btn" onClick={() => { setEditing(false); setNewPlace(null) }}>Cancelar</button><button type="button" className="btn btn-primary" onClick={submit}>Salvar</button></div>
        </div>
      ) : (
        <>
          <div className="pp-main">
            <b>★ {pl.label}</b>
            <span className="muted small">{isPrecise(pl) ? '✓ ' : pl.lat != null ? '≈ ' : ''}{pl.formatted || pl.address}{pl.lat != null && !isPrecise(pl) ? ` (${precisionLabel(pl)})` : ''}{pl.reference ? ` · ${pl.reference}` : ''}{pl.dwellMin != null ? ` · parada de ${pl.dwellMin} min` : ''}{users.length ? ` · ${users.map((u) => u.name).join(', ')}` : ''}</span>
          </div>
          <div className="pp-actions">
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>Editar</button>
            <button type="button" className="link-btn muted-btn" onClick={remove}>Remover</button>
          </div>
        </>
      )}
    </div>
  )
}

function PlaceForm({ cap }) {
  const { notify } = useUI()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [dwell, setDwell] = useState('')
  const [place, setPlace] = useState(null)
  const [err, setErr] = useState(null)
  if (!open) return <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><IconPlus /> Adicionar lugar</button>
  const submit = () => {
    if (!label.trim()) return setErr('Dê um nome ao lugar (ex.: Academia).')
    if (!place) return setErr('Busque e escolha o endereço.')
    const d = String(dwell).trim() === '' ? null : Math.max(0, Math.min(600, Number(dwell) || 0))
    const data = getProfile().data
    save({ favorites: [...data.favorites, { ...place, label: label.trim(), id: newId(), dwellMin: d }] })
    notify('Lugar salvo')
    setOpen(false); setLabel(''); setDwell(''); setPlace(null); setErr(null)
  }
  return (
    <div className="card pp-form" data-testid="place-form">
      <div className="grid-2-1">
        <div className="field"><label htmlFor="new-place-name">Nome</label><input id="new-place-name" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Ex.: Academia" /></div>
        <div className="field"><label htmlFor="new-place-dwell">Parada (min)</label><input id="new-place-dwell" className="input" inputMode="numeric" value={dwell} onChange={(e) => setDwell(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="5" /></div>
      </div>
      <PlaceField label="Endereço" place={place} cap={cap} testid="new-place" locate noFav onChange={setPlace} />
      {err && <div className="err" role="alert">{err}</div>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={submit}>Salvar lugar</button>
      </div>
    </div>
  )
}
