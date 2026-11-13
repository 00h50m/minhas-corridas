// Campo de endereço: busca (CEP, OpenStreetMap, serviço configurado), sugestões ao digitar,
// minha localização, favoritos (lugares do perfil) e "usar como digitado".
import { useEffect, useState } from 'react'
import { getProfile, saveProfile, useProfile } from '../services/profile.js'
import { SOURCE_LABEL, geocode, locateMe } from '../services/routing.js'
import { useUI } from './ui.jsx'
import { PRECISION_LABEL, isPrecise } from '../lib/geo.js'

const newId = () => Math.random().toString(36).slice(2, 10)

export default function PlaceField({ label, name, place, onChange, cap, testid, hint, locate = false, near = null, noFav = false }) {
  const prof = useProfile()
  const { notify } = useUI()
  const [text, setText] = useState(place?.address ?? '')
  const [typed, setTyped] = useState(false) // só sugere depois que a pessoa digita
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(null) // 'busca' | 'local'
  const [err, setErr] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [favName, setFavName] = useState(null)
  useEffect(() => { setText(place?.address ?? ''); setTyped(false) }, [place?.address])
  const favs = prof.data.favorites
  const asLabel = place?.label || name || label

  // Sugestões enquanto digita (a partir de 5 letras, com uma pausa curta).
  useEffect(() => {
    if (!typed || text.trim().length < 5) return
    let alive = true
    const t = setTimeout(() => {
      geocode(text.trim(), { suggest: true, near })
        .then((list) => alive && list.length && setResults(list))
        .catch(() => {})
    }, 450)
    return () => { alive = false; clearTimeout(t) }
  }, [text, typed])

  const search = async () => {
    setErr(null)
    setNotFound(false)
    if (text.trim().length < 5) return setErr('Digite o CEP ou o endereço: rua, número, bairro e cidade.')
    setBusy('busca')
    try {
      const list = await geocode(text.trim(), { near })
      setResults(list)
      if (!list.length) { setNotFound(true); setErr('Não encontrei. Tente o CEP (ex.: 13214-000, 95) ou rua + cidade.') }
    } catch (e) {
      setNotFound(true)
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const pick = (g) => {
    onChange({ label: asLabel, address: g.formatted || text.trim(), formatted: g.formatted, lat: g.lat, lon: g.lon, precision: g.precision || (g.partial ? 'area' : 'numero') })
    setResults(null)
    setTyped(false)
  }
  const useTyped = () => {
    if (text.trim().length < 5) return setErr('Digite o endereço completo.')
    onChange({ label: asLabel, address: text.trim(), formatted: '', lat: null, lon: null })
    setResults(null)
    setErr(null)
    setNotFound(false)
  }
  const useLocation = async () => {
    setErr(null)
    setBusy('local')
    try {
      const g = await locateMe()
      setText(g.formatted || '')
      pick(g)
      notify('Localização usada')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const saveFav = () => {
    const nm = (favName || '').trim()
    if (!nm) return
    const p = getProfile().data
    const others = p.favorites.filter((f) => f.label.toLowerCase() !== nm.toLowerCase())
    saveProfile({ ...p, favorites: [...others, { ...place, label: nm, id: newId() }].slice(-20) })
    setFavName(null)
    notify('Endereço salvo nos favoritos')
  }
  return (
    <div className="place-field" data-testid={testid}>
      <label className="lbl">{label}</label>
      {favs.length > 0 && (
        <div className="fav-chips" role="group" aria-label="Favoritos">
          {favs.map((f) => <button key={f.id} type="button" className={place?.address === f.address ? 'on' : ''} onClick={() => { onChange({ ...f, label: f.label }); setResults(null) }}>★ {f.label}</button>)}
        </div>
      )}
      <div className="grid-2-1">
        <input className="input" value={text} onChange={(e) => { setText(e.target.value); setTyped(true); setErr(null); setNotFound(false) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} placeholder="CEP, rua e número, ou coordenadas" aria-label={label} autoComplete="street-address" />
        <button type="button" className="btn btn-dark" disabled={!!busy} onClick={search}>{busy === 'busca' ? '…' : 'Buscar'}</button>
      </div>
      <div className="hint">{hint || 'Dica: o CEP acha qualquer rua. Ex.: “13214-000, 95”.'}</div>
      {locate && <button type="button" className="link-btn" disabled={!!busy} onClick={useLocation}>{busy === 'local' ? 'Localizando…' : '📍 Usar minha localização'}</button>}
      {err && <div className="err" role="alert">{err}</div>}
      {results?.length > 0 && (
        <ul className="geo-results" aria-label="Endereços encontrados">
          {results.map((g, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(g)}>
                {g.formatted}
                <span className="geo-tags">{g.source && <span>{SOURCE_LABEL[g.source] || g.source}</span>}{g.partial && <span>aproximado{PRECISION_LABEL[g.precision] ? `: ${PRECISION_LABEL[g.precision]}` : ''}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(notFound || (text.trim().length >= 5 && !place && !results?.length && typed)) && (
        <button type="button" className="link-btn muted-btn" onClick={useTyped}>Usar como digitado (sem verificar)</button>
      )}
      {place && (
        <div className="place-ok small">
          {isPrecise(place) ? <span className="delta-good">✓ {place.formatted || place.address}</span>
            : place.lat != null ? <span className="place-approx" data-testid="place-approx">≈ {place.formatted || place.address} <b>· localização aproximada ({PRECISION_LABEL[place.precision] || 'sem confirmar o número'}).</b> Para o ponto exato, busque com o número ou cole as coordenadas do mapa (ex.: -23.0512, -46.9734).</span>
            : <span className="muted">Endereço sem verificação: {place.address}</span>}
          {noFav ? null : favName == null ? (
            <button type="button" className="link-btn" onClick={() => setFavName(place.label || '')}>☆ Salvar nos favoritos</button>
          ) : (
            <span className="fav-name">
              <input className="input" value={favName} onChange={(e) => setFavName(e.target.value)} placeholder="Nome (ex.: Casa)" maxLength={30} aria-label="Nome do favorito" />
              <button type="button" className="btn" onClick={saveFav}>Salvar</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
