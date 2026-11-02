import { useState } from 'react'
import { IconExternal, IconInfo } from './Icons.jsx'
import { formatDateBR } from '../lib/dates.js'
import { formatKm, formatMoney } from '../lib/format.js'

const LABELS = {
  name: 'Nome',
  date: 'Data',
  startTime: 'Largada',
  city: 'Cidade',
  state: 'UF',
  venueName: 'Local',
  venueAddress: 'Endereço',
  organizer: 'Organizador',
  fee: 'Inscrição a partir de',
  distances: 'Distâncias do evento',
  signupUrl: 'Link da inscrição'
}
const ORDER = Object.keys(LABELS)

function show(k, v) {
  if (k === 'date') return formatDateBR(v)
  if (k === 'fee') return formatMoney(v)
  if (k === 'distances') return v.map((d) => formatKm(d, { unit: false })).join(' / ') + ' km'
  return String(v)
}

/** Lê a página de inscrição (função /api/preview) e sugere campos para conferir antes de aplicar. */
export default function LinkImport({ onApply }) {
  const [url, setUrl] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const [picked, setPicked] = useState({})

  const search = async (e) => {
    e.preventDefault()
    const u = url.trim()
    if (!/^https?:\/\/\S+\.\S+/i.test(u)) {
      setState({ status: 'error', error: 'Cole o link completo, começando com https://' })
      return
    }
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/preview?url=${encodeURIComponent(u)}`)
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('json')) throw new Error('A leitura de links só funciona no app publicado, com internet.')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível ler a página.')
      const keys = ORDER.filter((k) => data.fields[k] != null && data.fields[k] !== '' && !(Array.isArray(data.fields[k]) && !data.fields[k].length))
      if (keys.filter((k) => k !== 'signupUrl').length === 0) {
        onApply({ signupUrl: u })
        setState({ status: 'error', error: 'Não encontrei dados da prova nessa página (o site deve montar o conteúdo só no navegador). Coloquei o link no campo “Link da inscrição”; preencha o resto à mão.' })
        return
      }
      setPicked(Object.fromEntries(keys.map((k) => [k, true])))
      setState({ status: 'done', fields: data.fields, sources: data.sources ?? {}, keys })
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      setState({ status: 'error', error: offline ? 'Sem internet. Tente de novo quando estiver conectada.' : err.message })
    }
  }

  const apply = () => {
    const chosen = Object.fromEntries(state.keys.filter((k) => picked[k]).map((k) => [k, state.fields[k]]))
    if (!chosen.signupUrl && url.trim()) chosen.signupUrl = url.trim()
    onApply(chosen)
    setState({ status: 'applied', count: Object.keys(chosen).length })
  }

  return (
    <details className="section link-import" open={state.status !== 'idle' && state.status !== 'applied'}>
      <summary>Preencher pelo link da inscrição<span className="sum">{state.status === 'applied' ? `${state.count} campos aplicados` : 'opcional'}</span></summary>
      <div className="body" style={{ paddingBottom: 16 }}>
        <div className="add-row" style={{ marginTop: 0 }}>
          <input className="input" type="url" inputMode="url" placeholder="https://… página da prova" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(e)} aria-label="Link da página de inscrição" />
          <button type="button" className="btn btn-dark" onClick={search} disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Lendo…' : 'Buscar'}</button>
        </div>
        <p className="hint">O app lê só esta página e mostra o que encontrou para você conferir. Funciona melhor em sites que publicam dados da prova de forma organizada; em outros, pode vir incompleto.</p>
        {state.status === 'error' && <div className="alert alert-error small" role="alert">{state.error}</div>}
        {state.status === 'done' && (
          <div className="found">
            <div className="small muted" style={{ fontWeight: 700, margin: '6px 0' }}>Encontrado — desmarque o que estiver errado:</div>
            <ul>
              {state.keys.map((k) => (
                <li key={k}>
                  <label>
                    <input type="checkbox" checked={!!picked[k]} onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.checked }))} />
                    <span>
                      <span className="k">{LABELS[k]}</span>
                      <b>{show(k, state.fields[k])}</b>
                      {k === 'city' && state.fields.stateOptions?.length > 1 && <span className="muted small">existe em {state.fields.stateOptions.join(', ')} — escolha a UF no formulário</span>}
                      {(state.sources[k] === 'texto' || state.sources[k] === 'link') && <span className="flag flag-warn">{state.sources[k] === 'link' ? 'tirado do link · confira' : 'confira'}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {state.sources.name === 'link' && state.keys.length <= 2 && (
              <div className="alert alert-info small"><IconInfo /><div>Essa página não traz os dados da prova para leitura automática — só deu para aproveitar o nome do link. Data, cidade e distâncias você preenche à mão.</div></div>
            )}
            {state.sources.date === 'texto' && (
              <div className="alert alert-warn small"><IconInfo /><div>A data veio do texto da página — pode ser outra data citada (como prazo de inscrição). Confira.</div></div>
            )}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <a className="btn" href={url.trim()} target="_blank" rel="noreferrer"><IconExternal /> Ver página</a>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={!Object.values(picked).some(Boolean)}>Aplicar</button>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
