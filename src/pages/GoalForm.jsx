import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getGoal, saveGoal } from '../services/store.js'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { COMMON_DISTANCES, GOAL_STATUSES, GOAL_TYPES, GOAL_TYPE_BY_ID, emptyGoal, validateGoal } from '../lib/model.js'
import { suggestGoalTitle } from '../lib/goals.js'
import { BUDGET_SCOPES } from '../lib/budget.js'
import TimeInput from '../components/TimeInput.jsx'
import { todayISO } from '../lib/dates.js'
import { durationToInput, formatKm, kmToInput, moneyToInput, parseDuration, parseKm, parseMoney, parseNumber } from '../lib/format.js'

const PERIOD_TYPES = ['quantidade', 'km', 'orcamento']

function toForm(g) {
  return {
    title: g.title,
    type: g.type,
    distanceKm: kmToInput(g.distanceKm),
    target: g.type === 'tempo' ? durationToInput(g.targetValue) : g.type === 'orcamento' ? moneyToInput(g.targetValue) : g.type === 'primeira' || g.targetValue == null ? '' : kmToInput(g.targetValue),
    unit: g.unit,
    manualValue: g.manualValue == null ? '' : kmToInput(g.manualValue),
    startDate: g.startDate ?? '',
    deadline: g.deadline ?? '',
    status: g.status,
    notes: g.notes,
    budgetScope: g.budgetScope === 'total' ? 'total' : 'inscricoes',
    alertPct: g.alertPct ?? 80
  }
}

function fromForm(f, base) {
  const errors = {}
  const g = { ...base, type: f.type, status: f.status, notes: f.notes.trim(), unit: '', distanceKm: null, targetValue: null, manualValue: null, budgetScope: f.budgetScope, alertPct: Number(f.alertPct) }
  if (f.type === 'primeira' || f.type === 'tempo') {
    g.distanceKm = parseKm(f.distanceKm)
    if (f.distanceKm && g.distanceKm == null) errors.distanceKm = 'Use km, ex.: 5, 10 ou 21,1.'
  }
  if (f.type === 'tempo') {
    g.targetValue = parseDuration(f.target)
    if (f.target && g.targetValue == null) errors.targetValue = 'Tempo inválido. Digite só números: 3000 = 30:00 · 15959 = 1:59:59.'
  } else if (f.type === 'orcamento') {
    g.targetValue = parseMoney(f.target)
    if (f.target && g.targetValue == null) errors.targetValue = 'Valor inválido. Ex.: 1.500,00'
  } else if (f.type === 'km') {
    g.targetValue = parseNumber(f.target)
    if (Number.isNaN(g.targetValue)) errors.targetValue = 'Use um número em km, ex.: 100 ou 150,5.'
  } else if (f.type === 'quantidade') {
    g.targetValue = parseNumber(f.target)
    if (Number.isNaN(g.targetValue)) errors.targetValue = 'Use um número inteiro.'
  } else if (f.type === 'primeira') {
    g.targetValue = g.distanceKm
  } else {
    g.targetValue = parseNumber(f.target)
    if (Number.isNaN(g.targetValue)) errors.targetValue = 'Use um número.'
    g.unit = f.unit.trim().slice(0, 20)
    g.manualValue = parseNumber(f.manualValue)
    if (Number.isNaN(g.manualValue)) errors.manualValue = 'Use um número.'
  }
  g.startDate = f.startDate || null
  g.deadline = f.deadline || null
  g.title = f.title.trim() || suggestGoalTitle(g)
  const all = { ...validateGoal(g), ...errors }
  if (errors.targetValue || errors.distanceKm || errors.manualValue) delete all.title
  return { goal: g, errors: Object.fromEntries(Object.entries(all).filter(([, v]) => v)) }
}

export default function GoalForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { notify } = useUI()
  const existing = id ? getGoal(id) : null
  const [params] = useSearchParams()
  // Atalho "Definir orçamento" (?tipo=orcamento&ano=2027): já abre no tipo e no ano certos.
  const [base] = useState(() => {
    if (existing) return existing
    const tipo = GOAL_TYPE_BY_ID[params.get('tipo')] ? params.get('tipo') : 'tempo'
    const g = emptyGoal(tipo)
    const ano = /^\d{4}$/.test(params.get('ano') ?? '') ? params.get('ano') : null
    if (PERIOD_TYPES.includes(tipo)) {
      const y = ano ?? todayISO().slice(0, 4)
      g.startDate = `${y}-01-01`
      g.deadline = `${y}-12-31`
    }
    return g
  })
  const [f, setF] = useState(() => toForm(base))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)

  if (id && !existing) return <Navigate to="/objetivos" replace />

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const pickType = (type) => {
    setErrors({})
    setF((p) => {
      const next = { ...p, type, target: p.type === type ? p.target : '' }
      // Objetivos de período começam com o ano corrente, editável.
      if (!existing && PERIOD_TYPES.includes(type) && !p.startDate && !p.deadline) {
        const y = todayISO().slice(0, 4)
        next.startDate = `${y}-01-01`
        next.deadline = `${y}-12-31`
      }
      return next
    })
  }

  const preview = fromForm(f, base).goal
  const suggestion = suggestGoalTitle(preview)

  const onSubmit = (e) => {
    e.preventDefault()
    const { goal, errors: errs } = fromForm(f, base)
    setErrors(errs)
    if (Object.keys(errs).length) {
      setSaveError('Confira os campos destacados.')
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    try {
      const saved = saveGoal(goal)
      notify(existing ? 'Objetivo atualizado' : 'Objetivo criado')
      nav(`/objetivos/${saved.id}`, { replace: true })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const inv = (k) => (errors[k] ? 'true' : 'false')
  const t = f.type

  return (
    <>
      <TopBar title={existing ? 'Editar objetivo' : 'Novo objetivo'} back={existing ? `/objetivos/${existing.id}` : '/objetivos'} />
      <form className="page form" onSubmit={onSubmit} noValidate>
        <div className="card">
          <Field label="Tipo de objetivo">
            <div className="type-list" role="radiogroup" aria-label="Tipo de objetivo">
              {GOAL_TYPES.map((gt) => (
                <button type="button" key={gt.id} role="radio" aria-checked={t === gt.id} className="type-opt" onClick={() => pickType(gt.id)}>
                  <b>{gt.label}</b>
                  <span>{gt.example}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          {(t === 'primeira' || t === 'tempo') && (
            <Field label="Distância" htmlFor="g-distance" error={errors.distanceKm} hint="Distância oficial da prova.">
              <div className="seg" style={{ marginBottom: 8 }} role="group" aria-label="Distâncias comuns">
                {COMMON_DISTANCES.map((d) => (
                  <button type="button" key={d} aria-pressed={parseKm(f.distanceKm) === d} onClick={() => set('distanceKm')(kmToInput(d))}>{formatKm(d, { unit: false })}</button>
                ))}
              </div>
              <input id="g-distance" className="input" inputMode="decimal" value={f.distanceKm} onChange={set('distanceKm')} aria-invalid={inv('distanceKm')} placeholder="km" />
            </Field>
          )}

          {t === 'tempo' && (
            <Field label="Abaixo de" htmlFor="g-target" error={errors.targetValue} hint="Tempo líquido. Digite só números: 3500 = 35:00 · 15500 = 1:55:00.">
              <TimeInput id="g-target" value={f.target} onChange={set('target')} invalid={!!errors.targetValue} />
            </Field>
          )}
          {t === 'quantidade' && (
            <Field label="Quantidade de provas" htmlFor="g-target" error={errors.targetValue}>
              <input id="g-target" className="input" inputMode="numeric" value={f.target} onChange={set('target')} aria-invalid={inv('targetValue')} placeholder="Ex.: 8" />
            </Field>
          )}
          {t === 'km' && (
            <Field label="Distância acumulada (km)" htmlFor="g-target" error={errors.targetValue} hint="Soma das distâncias oficiais das provas concluídas registradas — não inclui treinos.">
              <input id="g-target" className="input" inputMode="decimal" value={f.target} onChange={set('target')} aria-invalid={inv('targetValue')} placeholder="Ex.: 100" />
            </Field>
          )}
          {t === 'orcamento' && (
            <>
              <Field label="Orçamento (R$)" htmlFor="g-target" error={errors.targetValue}>
                <input id="g-target" className="input" inputMode="decimal" value={f.target} onChange={set('target')} aria-invalid={inv('targetValue')} placeholder="Ex.: 1.500,00" />
              </Field>
              <Field label="O que entra na conta">
                <div className="seg seg-col" role="radiogroup" aria-label="O que entra no orçamento">
                  {BUDGET_SCOPES.map((s) => (
                    <button type="button" key={s.id} role="radio" aria-checked={f.budgetScope === s.id} aria-pressed={f.budgetScope === s.id} onClick={() => set('budgetScope')(s.id)}>{s.label}</button>
                  ))}
                </div>
              </Field>
              <Field label="Avisar quando chegar a" error={errors.alertPct} hint="Aparece no Início e, com as notificações ativas, no celular. Também avisa se estourar.">
                <div className="seg" role="group" aria-label="Porcentagem para avisar">
                  {[70, 80, 90, 100].map((p) => (
                    <button type="button" key={p} aria-pressed={Number(f.alertPct) === p} onClick={() => set('alertPct')(p)}>{p}%</button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {t === 'manual' && (
            <>
              <div className="grid-2">
                <Field label="Valor alvo" htmlFor="g-target" error={errors.targetValue}>
                  <input id="g-target" className="input" inputMode="decimal" value={f.target} onChange={set('target')} aria-invalid={inv('targetValue')} placeholder="Ex.: 1" />
                </Field>
                <Field label="Unidade" optional htmlFor="g-unit">
                  <input id="g-unit" className="input" value={f.unit} onChange={set('unit')} placeholder="Ex.: provas, vezes" maxLength={20} />
                </Field>
              </div>
              <Field label="Progresso atual" htmlFor="g-manual" error={errors.manualValue} hint="Você atualiza à mão quando avançar.">
                <input id="g-manual" className="input" inputMode="decimal" value={f.manualValue} onChange={set('manualValue')} aria-invalid={inv('manualValue')} placeholder="0" />
              </Field>
            </>
          )}

          <Field label="Título" htmlFor="g-title" error={errors.title} hint={!f.title && suggestion ? `Se ficar vazio: “${suggestion}”` : null}>
            <input id="g-title" className="input" value={f.title} onChange={set('title')} aria-invalid={inv('title')} placeholder={suggestion || GOAL_TYPE_BY_ID[t]?.example} maxLength={120} />
          </Field>

          <div className="grid-2">
            <Field label="Contar a partir de" optional htmlFor="g-start" error={errors.startDate}>
              <input id="g-start" type="date" className="input" value={f.startDate} onChange={set('startDate')} aria-invalid={inv('startDate')} />
            </Field>
            <Field label="Prazo" optional htmlFor="g-deadline" error={errors.deadline}>
              <input id="g-deadline" type="date" className="input" value={f.deadline} onChange={set('deadline')} aria-invalid={inv('deadline')} />
            </Field>
          </div>
          {t !== 'manual' && <p className="hint" style={{ marginTop: -6 }}>Só entram provas com data dentro desse intervalo. Deixe em branco para considerar todas.</p>}
        </div>

        <details className="section" open={!!(existing && (existing.notes || existing.status !== 'andamento'))}>
          <summary>Status e observações</summary>
          <div className="body">
            <Field label="Status">
              <div className="seg" role="group" aria-label="Status do objetivo">
                {GOAL_STATUSES.map((s) => (
                  <button type="button" key={s.id} aria-pressed={f.status === s.id} onClick={() => set('status')(s.id)}><span aria-hidden="true">{s.icon} </span>{s.label}</button>
                ))}
              </div>
            </Field>
            <Field label="Observações" htmlFor="g-notes"><textarea id="g-notes" className="input" value={f.notes} onChange={set('notes')} /></Field>
          </div>
        </details>

        {saveError && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>{saveError}</div>}
        <div className="sticky-actions">
          <button type="submit" className="btn btn-primary">{existing ? 'Salvar alterações' : 'Salvar objetivo'}</button>
        </div>
      </form>
    </>
  )
}
