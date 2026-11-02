import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { repeatRace } from '../lib/alerts.js'
import LinkImport from '../components/LinkImport.jsx'
import { weekdayShort } from '../lib/dates.js'
import { getRace, saveRace, useStore } from '../services/store.js'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { IconAlert, IconInfo } from '../components/Icons.jsx'
import { COMMON_DISTANCES, MONEY_FIELDS, STATUSES, UFS, defaultChecklist, emptyRace, validateRace } from '../lib/model.js'
import { raceCosts } from '../lib/costs.js'
import { formatDateBR } from '../lib/dates.js'
import { durationToInput, formatKm, formatMoney, kmToInput, moneyToInput, parseDuration, parseKm, parseMoney } from '../lib/format.js'
import { nearbyRaces } from '../lib/stats.js'

const TEXT_FIELDS = ['name', 'city', 'state', 'status', 'startTime', 'venueName', 'venueAddress', 'signupUrl', 'organizer', 'shirtSize', 'kitItems', 'kitPickupTime', 'kitPickupAddress', 'kitPickupBy', 'bibNumber', 'companions', 'leaveHomeTime', 'notes', 'otherDesc']

function toForm(r) {
  const f = {}
  for (const k of TEXT_FIELDS) f[k] = r[k] ?? ''
  f.date = r.date ?? ''
  f.dateTBD = !r.date && !!r.id
  f.distanceKm = kmToInput(r.distanceKm)
  f.availableDistances = r.availableDistances ?? []
  f.otherDistance = ''
  for (const k of MONEY_FIELDS) f[k] = moneyToInput(r[k])
  f.signupDeadline = r.signupDeadline ?? ''
  f.lotChangeDate = r.lotChangeDate ?? ''
  f.kitPickupDate = r.kitPickupDate ?? ''
  f.shirtIncluded = !!r.shirtIncluded
  f.targetTime = durationToInput(r.targetTime)
  return f
}

/** Converte o formulário em corrida + erros de formato. */
function fromForm(f, base) {
  const errors = {}
  const r = { ...base }
  for (const k of TEXT_FIELDS) r[k] = typeof f[k] === 'string' ? f[k].trim() : f[k]
  r.date = f.dateTBD || !f.date ? null : f.date
  if (!f.dateTBD && !f.date) errors.date = 'Escolha a data ou marque “data a confirmar”.'

  r.distanceKm = null
  if (f.distanceKm) {
    r.distanceKm = parseKm(f.distanceKm)
    if (r.distanceKm == null) errors.distanceKm = 'Use um número em km, ex.: 5, 10 ou 21,1.'
  }
  r.availableDistances = [...f.availableDistances].sort((a, b) => a - b)
  if (r.distanceKm != null && r.availableDistances.length && !r.availableDistances.some((d) => Math.abs(d - r.distanceKm) < 0.001)) {
    r.availableDistances = [...r.availableDistances, r.distanceKm].sort((a, b) => a - b)
  }

  for (const k of MONEY_FIELDS) {
    r[k] = null
    if (f[k]) {
      r[k] = parseMoney(f[k])
      if (r[k] == null) errors[k] = 'Valor inválido. Ex.: 129,90'
    }
  }
  r.signupDeadline = f.signupDeadline || null
  r.lotChangeDate = f.lotChangeDate || null
  r.kitPickupDate = f.kitPickupDate || null
  r.shirtIncluded = f.shirtIncluded
  if (!r.shirtIncluded) r.shirtSize = ''
  r.targetTime = null
  if (f.targetTime) {
    r.targetTime = parseDuration(f.targetTime)
    if (r.targetTime == null) errors.targetTime = 'Use mm:ss ou h:mm:ss, ex.: 29:59 ou 1:55:00.'
  }
  if (!r.checklist) r.checklist = defaultChecklist(r.status)
  return { race: r, errors: { ...validateRace(r), ...errors } }
}

function summaryOf(...vals) {
  return vals.filter(Boolean).join(' · ')
}

export default function RaceForm() {
  const { id } = useParams()
  const { races } = useStore()
  const nav = useNavigate()
  const { notify } = useUI()
  const existing = id ? getRace(id) : null
  const [params] = useSearchParams()
  const source = !existing && params.get('repetir') ? getRace(params.get('repetir')) : null
  const [base] = useState(() => existing ?? (source ? { ...emptyRace(), ...repeatRace(source) } : emptyRace()))
  const [f, setF] = useState(() => toForm(base))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)

  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#custos') return
    const el = document.getElementById('custos')
    if (el) {
      el.open = true
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [hash])

  const nearby = useMemo(() => nearbyRaces(races, f.dateTBD ? null : f.date || null, existing?.id), [races, f.date, f.dateTBD, existing?.id])

  if (id && !existing) return <Navigate to="/corridas" replace />

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const pickDistance = (d) => {
    setF((p) => ({ ...p, distanceKm: kmToInput(d) }))
    setErrors((p) => ({ ...p, distanceKm: undefined }))
  }

  const toggleAvailable = (d) => {
    setF((p) => {
      const has = p.availableDistances.some((x) => Math.abs(x - d) < 0.001)
      return { ...p, availableDistances: has ? p.availableDistances.filter((x) => Math.abs(x - d) >= 0.001) : [...p.availableDistances, d] }
    })
  }

  const addOtherDistance = () => {
    const d = parseKm(f.otherDistance)
    if (d == null) {
      setErrors((p) => ({ ...p, otherDistance: 'Distância inválida.' }))
      return
    }
    if (!f.availableDistances.some((x) => Math.abs(x - d) < 0.001)) setF((p) => ({ ...p, availableDistances: [...p.availableDistances, d], otherDistance: '' }))
    else setF((p) => ({ ...p, otherDistance: '' }))
    setErrors((p) => ({ ...p, otherDistance: undefined }))
  }

  const applyFromLink = (v) => {
    setF((p) => {
      const n = { ...p }
      for (const k of ['name', 'startTime', 'city', 'venueName', 'venueAddress', 'organizer', 'signupUrl']) if (v[k]) n[k] = String(v[k]).slice(0, k === 'name' ? 120 : 300)
      if (v.state && UFS.includes(v.state)) n.state = v.state
      if (v.date) {
        n.date = v.date
        n.dateTBD = false
      }
      if (v.fee != null) n.fee = moneyToInput(v.fee)
      if (v.distances?.length) {
        n.availableDistances = [...new Set([...p.availableDistances, ...v.distances])]
        if (v.distances.length === 1 && !p.distanceKm) n.distanceKm = kmToInput(v.distances[0])
      }
      return n
    })
    setErrors({})
    notify('Campos preenchidos — confira antes de salvar')
  }

  const onSubmit = (e) => {
    e.preventDefault()
    const { race, errors: errs } = fromForm(f, base)
    const clean = Object.fromEntries(Object.entries(errs).filter(([, v]) => v))
    setErrors(clean)
    if (Object.keys(clean).length) {
      setSaveError('Confira os campos destacados.')
      // Abre seção com erro e rola até ela.
      setTimeout(() => {
        const el = document.querySelector('[aria-invalid="true"]')
        el?.closest('details')?.setAttribute('open', '')
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }, 0)
      return
    }
    try {
      const saved = saveRace(race)
      notify(existing ? 'Corrida atualizada' : 'Corrida cadastrada')
      nav(`/corridas/${saved.id}`, { replace: true })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const allDistances = [...new Set([...COMMON_DISTANCES, ...f.availableDistances])].sort((a, b) => a - b)
  const inv = (k) => (errors[k] ? 'true' : 'false')
  const feeTotal = (parseMoney(f.fee) ?? 0) + (parseMoney(f.extraFees) ?? 0)
  const liveCosts = raceCosts(Object.fromEntries([['status', f.status], ...MONEY_FIELDS.map((k) => [k, parseMoney(f[k])])]))
  const money = (k, label, hint) => (
    <Field label={label} htmlFor={k} error={errors[k]} hint={hint}>
      <input id={k} inputMode="decimal" className="input" value={f[k]} onChange={set(k)} aria-invalid={inv(k)} placeholder="0,00" />
    </Field>
  )

  return (
    <>
      <TopBar title={existing ? 'Editar corrida' : 'Nova corrida'} back={existing ? `/corridas/${existing.id}` : '/corridas'} />
      <form className="page form" onSubmit={onSubmit} noValidate>
        {!existing && !source && <LinkImport onApply={applyFromLink} />}
        <div className="card" style={!existing && !source ? { marginTop: 12 } : undefined}>
          <Field label="Nome da prova" htmlFor="name" error={errors.name}>
            <input id="name" className="input" value={f.name} onChange={set('name')} aria-invalid={inv('name')} placeholder="Ex.: Corrida de São Silvestre" autoComplete="off" maxLength={120} autoFocus={!existing} />
          </Field>

          {source && (
            <div className="alert alert-info small" style={{ marginBottom: 14 }}>
              <IconInfo />
              <div>
                Copiado de <b>{source.name}</b>. Na edição anterior foi em {formatDateBR(source.date)} ({weekdayShort(source.date)}). Confira a nova data, os valores e o kit — eles mudam de um ano para o outro.
              </div>
            </div>
          )}
          <Field label="Data" htmlFor="date" error={errors.date}>
            {!f.dateTBD && <input id="date" type="date" className="input" value={f.date} onChange={set('date')} aria-invalid={inv('date')} min="1900-01-01" max="2200-12-31" />}
            <label className="check">
              <input type="checkbox" checked={f.dateTBD} onChange={(e) => { set('dateTBD')(e); setErrors((p) => ({ ...p, date: undefined })) }} />
              Data a confirmar
            </label>
          </Field>

          {(nearby.sameDay.length > 0 || nearby.adjacent.length > 0) && (
            <div className={`alert ${nearby.sameDay.length ? 'alert-warn' : 'alert-info'}`} style={{ marginBottom: 14 }}>
              {nearby.sameDay.length ? <IconAlert /> : <IconInfo />}
              <div>
                {nearby.sameDay.length > 0 && <div><b>Mesma data:</b> {nearby.sameDay.map((r) => r.name).join(', ')}.</div>}
                {nearby.adjacent.length > 0 && <div><b>Dia seguido:</b> {nearby.adjacent.map((r) => `${r.name} (${formatDateBR(r.date)})`).join(', ')}.</div>}
                <div className="small">É só um aviso — você pode salvar normalmente.</div>
              </div>
            </div>
          )}

          <div className="grid-2-1">
            <Field label="Cidade" htmlFor="city">
              <input id="city" className="input" value={f.city} onChange={set('city')} placeholder="Ex.: São Paulo" autoComplete="address-level2" />
            </Field>
            <Field label="UF" htmlFor="state" error={errors.state}>
              <select id="state" className="input" value={f.state} onChange={set('state')} aria-invalid={inv('state')}>
                <option value="">—</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Distância em que vou correr" htmlFor="distanceKm" error={errors.distanceKm} hint="Toque numa opção ou digite em km.">
            <div className="seg" style={{ marginBottom: 8 }} role="group" aria-label="Distâncias comuns">
              {COMMON_DISTANCES.map((d) => (
                <button type="button" key={d} aria-pressed={parseKm(f.distanceKm) === d} onClick={() => pickDistance(d)}>{formatKm(d, { unit: false })}</button>
              ))}
            </div>
            <input id="distanceKm" className="input" inputMode="decimal" value={f.distanceKm} onChange={set('distanceKm')} aria-invalid={inv('distanceKm')} placeholder="km" />
          </Field>

          <Field label="Status" error={errors.status}>
            <div className="seg" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <button type="button" key={s.id} aria-pressed={f.status === s.id} onClick={() => set('status')(s.id)}>
                  <span aria-hidden="true">{s.icon} </span>{s.label}
                </button>
              ))}
            </div>
          </Field>
          {f.status === 'concluida' && !existing?.result && (
            <div className="alert alert-info"><IconInfo /><div>Depois de salvar, você poderá registrar o tempo e o resultado.</div></div>
          )}
        </div>

        <details className="section">
          <summary>Largada e local<span className="sum">{summaryOf(f.startTime, f.venueName)}</span></summary>
          <div className="body">
            <div className="grid-2">
              <Field label="Horário da largada" htmlFor="startTime" error={errors.startTime}>
                <input id="startTime" type="time" className="input" value={f.startTime} onChange={set('startTime')} aria-invalid={inv('startTime')} />
              </Field>
              <Field label="Sair de casa às" htmlFor="leaveHomeTime" error={errors.leaveHomeTime}>
                <input id="leaveHomeTime" type="time" className="input" value={f.leaveHomeTime} onChange={set('leaveHomeTime')} aria-invalid={inv('leaveHomeTime')} />
              </Field>
            </div>
            <Field label="Nome do local" htmlFor="venueName"><input id="venueName" className="input" value={f.venueName} onChange={set('venueName')} placeholder="Ex.: Parque Ibirapuera" /></Field>
            <Field label="Endereço" htmlFor="venueAddress"><input id="venueAddress" className="input" value={f.venueAddress} onChange={set('venueAddress')} /></Field>
            <Field label="Companhia para a prova" htmlFor="companions"><input id="companions" className="input" value={f.companions} onChange={set('companions')} placeholder="Quem vai junto" /></Field>
          </div>
        </details>

        <details className="section">
          <summary>Inscrição e valores<span className="sum">{summaryOf(feeTotal > 0 && formatMoney(feeTotal), f.signupDeadline && `até ${formatDateBR(f.signupDeadline)}`)}</span></summary>
          <div className="body">
            <Field label="Link da inscrição" htmlFor="signupUrl" error={errors.signupUrl}>
              <input id="signupUrl" type="url" inputMode="url" className="input" value={f.signupUrl} onChange={set('signupUrl')} aria-invalid={inv('signupUrl')} placeholder="https://" />
            </Field>
            <Field label="Organizador" htmlFor="organizer"><input id="organizer" className="input" value={f.organizer} onChange={set('organizer')} /></Field>
            <div className="grid-2">
              <Field label="Inscrição (R$)" htmlFor="fee" error={errors.fee}>
                <input id="fee" inputMode="decimal" className="input" value={f.fee} onChange={set('fee')} aria-invalid={inv('fee')} placeholder="0,00" />
              </Field>
              <Field label="Taxas (R$)" htmlFor="extraFees" error={errors.extraFees}>
                <input id="extraFees" inputMode="decimal" className="input" value={f.extraFees} onChange={set('extraFees')} aria-invalid={inv('extraFees')} placeholder="0,00" />
              </Field>
            </div>
            {money('feePaid', 'Valor pago da inscrição (R$)', 'Preencha quando pagar. Ele substitui a estimativa (inscrição + taxas) — não soma de novo.')}
            <div className="grid-2">
              <Field label="Prazo de inscrição" htmlFor="signupDeadline" error={errors.signupDeadline}>
                <input id="signupDeadline" type="date" className="input" value={f.signupDeadline} onChange={set('signupDeadline')} aria-invalid={inv('signupDeadline')} />
              </Field>
              <Field label="Muda de lote em" htmlFor="lotChangeDate" error={errors.lotChangeDate}>
                <input id="lotChangeDate" type="date" className="input" value={f.lotChangeDate} onChange={set('lotChangeDate')} aria-invalid={inv('lotChangeDate')} />
              </Field>
            </div>
            <Field label="Número de peito" htmlFor="bibNumber"><input id="bibNumber" className="input" value={f.bibNumber} onChange={set('bibNumber')} /></Field>
          </div>
        </details>

        <details className="section" id="custos">
          <summary>Transporte, hospedagem e outros<span className="sum">{liveCosts.hasAny ? formatMoney(liveCosts.committed ? liveCosts.total : liveCosts.planned ?? 0) : ''}</span></summary>
          <div className="body">
            <p className="hint" style={{ marginTop: 0 }}>Informe o estimado para planejar e o pago quando acertar. Em cada categoria, o valor pago substitui o estimado.</p>
            <div className="list-group-title" style={{ marginTop: 4 }}>Transporte</div>
            <div className="grid-2">{money('transportEst', 'Estimado')}{money('transportPaid', 'Pago')}</div>
            <div className="list-group-title" style={{ marginTop: 4 }}>Hospedagem</div>
            <div className="grid-2">{money('lodgingEst', 'Estimado')}{money('lodgingPaid', 'Pago')}</div>
            <div className="list-group-title" style={{ marginTop: 4 }}>Outros</div>
            <div className="grid-2">{money('otherEst', 'Estimado')}{money('otherPaid', 'Pago')}</div>
            <Field label="O que entra em outros" htmlFor="otherDesc"><input id="otherDesc" className="input" value={f.otherDesc} onChange={set('otherDesc')} placeholder="Ex.: alimentação, estacionamento" maxLength={80} /></Field>
          </div>
        </details>

        <details className="section">
          <summary>Kit e retirada<span className="sum">{summaryOf(f.kitPickupDate && formatDateBR(f.kitPickupDate), f.kitPickupBy)}</span></summary>
          <div className="body">
            <label className="check"><input id="shirtIncluded" type="checkbox" checked={f.shirtIncluded} onChange={set("shirtIncluded")} /> Camiseta incluída</label>
            {f.shirtIncluded && (
              <Field label="Tamanho escolhido" htmlFor="shirtSize">
                <input id="shirtSize" className="input" value={f.shirtSize} onChange={set('shirtSize')} placeholder="Ex.: P, M, Baby look M" />
              </Field>
            )}
            <Field label="Itens do kit" htmlFor="kitItems"><textarea id="kitItems" className="input" value={f.kitItems} onChange={set('kitItems')} placeholder="Ex.: camiseta, medalha, sacochila" /></Field>
            <div className="grid-2">
              <Field label="Data da retirada" htmlFor="kitPickupDate" error={errors.kitPickupDate}>
                <input id="kitPickupDate" type="date" className="input" value={f.kitPickupDate} onChange={set('kitPickupDate')} aria-invalid={inv('kitPickupDate')} />
              </Field>
              <Field label="Horário" htmlFor="kitPickupTime" error={errors.kitPickupTime}>
                <input id="kitPickupTime" type="time" className="input" value={f.kitPickupTime} onChange={set('kitPickupTime')} aria-invalid={inv('kitPickupTime')} />
              </Field>
            </div>
            <Field label="Endereço da retirada" htmlFor="kitPickupAddress"><input id="kitPickupAddress" className="input" value={f.kitPickupAddress} onChange={set('kitPickupAddress')} /></Field>
            <Field label="Quem retira" htmlFor="kitPickupBy" hint="Deixe vazio se for você mesma."><input id="kitPickupBy" className="input" value={f.kitPickupBy} onChange={set('kitPickupBy')} placeholder="Ex.: assessoria, amiga" /></Field>
          </div>
        </details>

        <details className="section">
          <summary>Distâncias do evento<span className="sum">{f.availableDistances.length ? [...f.availableDistances].sort((a, b) => a - b).map((d) => formatKm(d, { unit: false })).join(' / ') + ' km' : ''}</span></summary>
          <div className="body">
            <p className="hint" style={{ marginTop: 0 }}>Marque todas as opções que o evento oferece. A sua distância fica em destaque.</p>
            <div className="seg" role="group" aria-label="Distâncias disponíveis">
              {allDistances.map((d) => {
                const on = f.availableDistances.some((x) => Math.abs(x - d) < 0.001)
                const mine = parseKm(f.distanceKm) === d
                return (
                  <button type="button" key={d} aria-pressed={on} className={mine && on ? 'chosen' : ''} onClick={() => toggleAvailable(d)}>
                    {formatKm(d)}{mine ? ' • minha' : ''}
                  </button>
                )
              })}
            </div>
            <div className="grid-2-1" style={{ marginTop: 10 }}>
              <Field error={errors.otherDistance}>
                <input className="input" inputMode="decimal" value={f.otherDistance} onChange={set('otherDistance')} placeholder="Outra (km)" aria-label="Outra distância em km" aria-invalid={inv('otherDistance')} />
              </Field>
              <button type="button" className="btn" onClick={addOtherDistance}>Adicionar</button>
            </div>
          </div>
        </details>

        <details className="section">
          <summary>Meta e observações<span className="sum">{f.targetTime && `meta ${f.targetTime}`}</span></summary>
          <div className="body">
            <Field label="Meta de tempo para esta prova" htmlFor="targetTime" error={errors.targetTime} hint="Usada para comparar com o resultado. Ex.: 29:59 ou 1:55:00.">
              <input id="targetTime" className="input" inputMode="numeric" value={f.targetTime} onChange={set('targetTime')} aria-invalid={inv('targetTime')} placeholder="h:mm:ss" />
            </Field>
            <Field label="Observações" htmlFor="notes"><textarea id="notes" className="input" value={f.notes} onChange={set('notes')} /></Field>
          </div>
        </details>

        {saveError && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>{saveError}</div>}

        <div className="sticky-actions">
          <button type="submit" className="btn btn-primary">{existing ? 'Salvar alterações' : 'Salvar corrida'}</button>
        </div>
      </form>
    </>
  )
}
