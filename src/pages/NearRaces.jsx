// Provas perto de você: buscas prontas por cidade e mês e as provas do ano passado nesta época.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { useProfile } from '../services/profile.js'
import { TopBar } from '../components/ui.jsx'
import { editionLink, lastYearAgain, nearCities, nextMonths, searchLinks } from '../lib/nearRaces.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { UFS } from '../lib/model.js'

export default function NearRaces() {
  const { races } = useStore()
  const profile = useProfile()
  const today = todayISO()
  const cities = nearCities(profile, races)
  const months = nextMonths(today)
  const ck = (c) => `${c.city}|${c.state}`
  const [selKey, setSelKey] = useState(() => (cities[0] ? ck(cities[0]) : null))
  const sel = cities.find((c) => ck(c) === selKey) ?? null
  const [typed, setTyped] = useState({ city: '', state: profile?.state || '' })
  const [mi, setMi] = useState(0)
  const again = lastYearAgain(races, today)
  const year = Number(today.slice(0, 4))
  const place = sel ?? (typed.city.trim() ? { city: typed.city.trim(), state: typed.state } : null)

  return (
    <>
      <TopBar title="Provas perto de você" back="/passaporte" />
      <div className="page" data-testid="near-races">
        {again.length > 0 && (
          <>
            <div className="list-group-title">Nesta época no ano passado</div>
            <div className="card" data-testid="near-again">
              <p className="small muted" style={{ marginTop: 0 }}>As edições novas costumam abrir inscrição agora.</p>
              {again.map((r) => (
                <div key={r.id} className="near-again">
                  <div><b>{r.name}</b><div className="muted small">{formatDateBR(r.date)}{r.city ? ` · ${r.city}${r.state ? `/${r.state}` : ''}` : ''}</div></div>
                  <div className="btn-inline">
                    <a href={editionLink(r, year)} target="_blank" rel="noopener noreferrer" className="link-btn">Buscar {year}</a>
                    <Link to={`/corridas/nova?repetir=${r.id}`} className="link-btn">Repetir</Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="list-group-title">Onde procurar</div>
        <div className="card">
          {cities.length > 0 && (
            <div className="seg" role="group" aria-label="Cidade" data-testid="near-cities">
              {cities.map((c) => (
                <button key={ck(c)} type="button" aria-pressed={selKey === ck(c)} onClick={() => setSelKey(ck(c))}>{c.city}{c.state ? `/${c.state}` : ''}</button>
              ))}
              <button type="button" aria-pressed={!sel} onClick={() => setSelKey(null)} data-testid="near-other">Outra</button>
            </div>
          )}
          {!sel && (
            <div className="grid-2" style={{ marginTop: 10 }}>
              <input className="input" value={typed.city} onChange={(e) => setTyped((t) => ({ ...t, city: e.target.value }))} placeholder="Cidade" aria-label="Cidade" maxLength={60} data-testid="near-city" />
              <select className="input" value={typed.state} onChange={(e) => setTyped((t) => ({ ...t, state: e.target.value }))} aria-label="UF">
                <option value="">UF</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div className="seg" role="group" aria-label="Mês" style={{ marginTop: 10 }}>
            {months.map((m, i) => <button key={m.label} type="button" aria-pressed={mi === i} onClick={() => setMi(i)}>{m.label.split(' ')[0]}</button>)}
          </div>
          {place ? (
            <div className="near-links" data-testid="near-links">
              {searchLinks(place, months[mi]).map((l, i) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className={`btn ${i === 0 ? 'btn-primary' : ''}`} data-testid={`near-${l.id}`}>{l.label} ↗</a>
              ))}
            </div>
          ) : <p className="muted small">Escolha ou digite uma cidade.</p>}
        </div>
        {!profile?.city && <p className="note">Dica: coloque sua cidade em <Link to="/perfil">Perfil</Link> para ela aparecer primeiro.</p>}

        <div className="card small" style={{ marginTop: 12 }}>
          <b>Achou uma prova?</b> Copie o link da página de inscrição e cadastre: o app preenche nome, data e cidade.
          <div style={{ marginTop: 8 }}><Link to="/corridas/nova" className="btn btn-block" data-testid="near-add">+ Cadastrar prova pelo link</Link></div>
        </div>
        <p className="note">As buscas abrem no navegador (Google, inclusive dentro dos sites de inscrição). Não existe uma lista aberta e oficial de todas as provas do Brasil; por isso o app não mostra o calendário direto aqui.</p>
      </div>
    </>
  )
}
