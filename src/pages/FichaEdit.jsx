// Cadastro da ficha da academia com os mesmos campos do PDF do treinador: treino (A, B, C…), exercício,
// observação, séries, repetições, descanso e conjugado. Dá para preencher campo a campo ou colar o texto
// (o caminho mais rápido para o Claude no Chrome, que lê o PDF e escreve o texto).
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import CopyBox from '../components/CopyBox.jsx'
import { IconPlus } from '../components/Icons.jsx'
import { getFicha, saveFicha } from '../services/ficha.js'
import { activeProgram, claudeFichaPrompt, emptyExercise, emptyProgram, emptySheet, fichaToText, normalizeProgram, parseFichaText } from '../lib/ficha.js'

const nextLabel = (sheets) => {
  const used = new Set(sheets.map((s) => s.label))
  for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) return l }
  return String(sheets.length + 1)
}

export default function FichaEdit() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { notify, confirm } = useUI()
  const ficha = getFicha()
  const isNew = params.get('nova') === '1' || !activeProgram(ficha)
  const [p, setP] = useState(() => (isNew ? emptyProgram() : structuredClone(activeProgram(ficha))))
  const [cur, setCur] = useState(0)
  const [text, setText] = useState('')
  const [skipped, setSkipped] = useState([])
  const [err, setErr] = useState(null)
  const set = (patch) => setP((x) => ({ ...x, ...patch }))
  const sheet = p.sheets[cur] ?? p.sheets[0]
  const setSheet = (fn) => setP((x) => ({ ...x, sheets: x.sheets.map((s, i) => (i === cur ? fn(s) : s)) }))
  const setEx = (j, patch) => setSheet((s) => ({ ...s, exercises: s.exercises.map((e, k) => (k === j ? { ...e, ...patch } : e)) }))
  const moveEx = (j, d) => setSheet((s) => { const a = [...s.exercises]; [a[j], a[j + d]] = [a[j + d], a[j]]; return { ...s, exercises: a } })

  const readText = async () => {
    const r = parseFichaText(text)
    setSkipped(r.skipped)
    if (!r.sheets.length) { setErr('Não encontrei exercícios no texto. Use uma linha por exercício: exercício | séries | repetições | descanso.'); return }
    const hasData = p.sheets.some((s) => s.exercises.some((e) => e.name))
    if (hasData && !(await confirm({ title: 'Trocar os treinos pelos do texto?', message: `O texto tem ${r.sheets.length} ${r.sheets.length === 1 ? 'treino' : 'treinos'} (${r.sheets.map((s) => s.label).join(', ')}). Os treinos já preenchidos aqui serão substituídos.`, confirmLabel: 'Trocar' }))) return
    setErr(null)
    set({ sheets: r.sheets, ...Object.fromEntries(Object.entries(r.meta).filter(([, v]) => v)) })
    setCur(0)
    notify(`${r.sheets.length} ${r.sheets.length === 1 ? 'treino lido' : 'treinos lidos'}: confira e salve`)
  }

  const save = () => {
    const n = normalizeProgram(p)
    if (!n.sheets.length) { setErr('Cadastre pelo menos um treino com um exercício (o nome do exercício é obrigatório).'); return }
    const others = ficha.programs.filter((x) => x.id !== n.id)
    saveFicha({ programs: [...others, n], activeId: n.id })
    notify('Ficha salva')
    nav('/academia', { replace: true })
  }

  return (
    <>
      <TopBar title={isNew ? 'Nova ficha' : 'Editar ficha'} sub="academia" back="/academia" />
      <div className="page form ficha-edit" data-testid="ficha-edit">
        <div className="grid-2">
          <Field label="Nome da ficha" htmlFor="ficha-title">
            <input id="ficha-title" className="input" value={p.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} placeholder="Treino em academia" />
          </Field>
          <Field label="Objetivo" optional htmlFor="ficha-goal">
            <input id="ficha-goal" className="input" value={p.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={80} placeholder="Ex.: Emagrecimento - Definição" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Início" optional htmlFor="ficha-from"><input id="ficha-from" className="input" type="date" value={p.from ?? ''} onChange={(e) => set({ from: e.target.value || null })} /></Field>
          <Field label="Fim" optional htmlFor="ficha-to"><input id="ficha-to" className="input" type="date" value={p.to ?? ''} onChange={(e) => set({ to: e.target.value || null })} /></Field>
        </div>
        <Field label="Treinador(a)" optional htmlFor="ficha-coach">
          <input id="ficha-coach" className="input" value={p.coach} onChange={(e) => set({ coach: e.target.value })} maxLength={60} />
        </Field>

        <details className="card ficha-paste" open={isNew} data-testid="ficha-paste">
          <summary><b>Colar ficha em texto</b> <span className="muted small">o jeito mais rápido (e o que o Claude no Chrome usa)</span></summary>
          <p className="small muted" style={{ margin: '8px 0' }}>Uma linha por exercício: <code>exercício (observação) | séries | repetições | descanso | conjugado</code>. Comece cada treino com “TREINO A”, “TREINO B”…; “conjugado” no fim marca o par com o exercício seguinte. No topo, se quiser: <code>OBJETIVO:</code>, <code>PERÍODO: 02/11/2026 a 04/12/2026</code>, <code>TREINADOR:</code>.</p>
          <textarea id="ficha-text" className="input mono" rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Colar ficha em texto" data-testid="ficha-text"
            placeholder={'TREINO A\nAgachamento barra livre pernas abduzidas | 3 | 8 + diminuir o peso + 10 | — | conjugado\nAgachamento peso corporal | 3 | 12 (com peso) + 15 (sem peso) | 1 minuto e meio'} />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={readText} disabled={!text.trim()} data-testid="ficha-parse">Ler texto</button>
            {p.sheets.some((s) => s.exercises.some((e) => e.name)) && <button type="button" className="btn" onClick={() => setText(fichaToText(normalizeProgram(p)))}>Ver a ficha em texto</button>}
          </div>
          {skipped.length > 0 && <div className="alert alert-warn small" style={{ marginTop: 8 }} data-testid="ficha-skipped">Não entendi {skipped.length === 1 ? 'esta linha' : 'estas linhas'} (precisa de pelo menos “exercício | séries | repetições”): <ul>{skipped.map((l) => <li key={l}>{l}</li>)}</ul></div>}
          <div style={{ marginTop: 10 }}>
            <CopyBox label="Copiar prompt para o Claude no Chrome" text={claudeFichaPrompt(`${location.origin}/academia/editar${isNew ? '?nova=1' : ''}`)} done="Prompt copiado: cole no Claude no Chrome" testid="ficha-claude"
              hint="Abra o PDF da ficha numa aba e esta página em outra. Cole o prompt no Claude no Chrome: ele lê o PDF, escreve o texto aqui, toca em “Ler texto” e confere com você antes de salvar." />
          </div>
        </details>

        <div className="section-title"><h2>Treinos</h2></div>
        <div className="ficha-tabs" role="tablist" aria-label="Treinos da ficha">
          {p.sheets.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={i === cur} className={i === cur ? 'on' : ''} onClick={() => setCur(i)} data-testid={`ficha-tab-${s.label}`}>Treino {s.label}</button>
          ))}
          <button type="button" className="add" onClick={() => { setP((x) => ({ ...x, sheets: [...x.sheets, emptySheet(nextLabel(x.sheets))] })); setCur(p.sheets.length) }} data-testid="ficha-add-sheet"><IconPlus /> Treino</button>
        </div>

        {sheet && (
          <div className="ficha-sheet" data-testid="ficha-sheet">
            <div className="grid-2">
              <Field label="Treino" htmlFor="ficha-label">
                <input id="ficha-label" className="input" value={sheet.label} onChange={(e) => setSheet((s) => ({ ...s, label: e.target.value.slice(0, 20) }))} placeholder="A" />
              </Field>
              <div className="field ficha-del-sheet">
                {p.sheets.length > 1 && <button type="button" className="link-btn muted-btn" onClick={() => { setP((x) => ({ ...x, sheets: x.sheets.filter((_, i) => i !== cur) })); setCur(0) }}>Remover o Treino {sheet.label}</button>}
              </div>
            </div>
            {sheet.exercises.map((x, j) => {
              const n = String(j + 1).padStart(2, '0')
              const pairedWithPrev = j > 0 && sheet.exercises[j - 1].withNext
              return (
                <div key={x.id} className={`card ficha-ex${x.withNext ? ' paired-next' : ''}${pairedWithPrev ? ' paired-prev' : ''}`} data-testid="ficha-ex">
                  <div className="ficha-ex-head">
                    <span className="ficha-n">{n}</span>
                    <span className="ficha-tools">
                      <button type="button" className="link-btn" onClick={() => moveEx(j, -1)} disabled={j === 0} aria-label={`Subir exercício ${n}`}>↑</button>
                      <button type="button" className="link-btn" onClick={() => moveEx(j, 1)} disabled={j === sheet.exercises.length - 1} aria-label={`Descer exercício ${n}`}>↓</button>
                      <button type="button" className="link-btn muted-btn" onClick={() => setSheet((s) => ({ ...s, exercises: s.exercises.filter((_, k) => k !== j) }))} aria-label={`Remover exercício ${n}`}>Remover</button>
                    </span>
                  </div>
                  <Field label={`Exercício ${n}`} htmlFor={`ex-${j}-name`}>
                    <input id={`ex-${j}-name`} className="input" value={x.name} onChange={(e) => setEx(j, { name: e.target.value })} maxLength={80} placeholder="Ex.: Agachamento barra livre pernas abduzidas" data-testid="ficha-ex-name" />
                  </Field>
                  <Field label="Observação" optional htmlFor={`ex-${j}-note`}>
                    <input id={`ex-${j}-note`} className="input" value={x.note} onChange={(e) => setEx(j, { note: e.target.value })} maxLength={80} placeholder="Ex.: pegada pronada" />
                  </Field>
                  <div className="ficha-nums">
                    <Field label="Séries" htmlFor={`ex-${j}-sets`}>
                      <input id={`ex-${j}-sets`} className="input" inputMode="numeric" value={x.sets ?? ''} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setEx(j, { sets: v ? Number(v) : null }) }} onFocus={(e) => e.target.select()} data-testid="ficha-ex-sets" />
                    </Field>
                    <Field label="Repetições" htmlFor={`ex-${j}-reps`}>
                      <input id={`ex-${j}-reps`} className="input" value={x.reps} onChange={(e) => setEx(j, { reps: e.target.value })} maxLength={120} placeholder="12 ou 8 + diminuir o peso + 10" data-testid="ficha-ex-reps" />
                    </Field>
                    <Field label="Descanso" optional htmlFor={`ex-${j}-rest`}>
                      <input id={`ex-${j}-rest`} className="input" value={x.rest} onChange={(e) => setEx(j, { rest: e.target.value })} maxLength={40} placeholder="1 minuto" data-testid="ficha-ex-rest" />
                    </Field>
                  </div>
                  {j < sheet.exercises.length - 1 && (
                    <label className="check ficha-pair">
                      <input type="checkbox" checked={x.withNext} onChange={(e) => setEx(j, { withNext: e.target.checked })} data-testid="ficha-ex-pair" /> Conjugado com o próximo ({String(j + 2).padStart(2, '0')})
                    </label>
                  )}
                </div>
              )
            })}
            <button type="button" className="btn btn-block" onClick={() => setSheet((s) => ({ ...s, exercises: [...s.exercises, emptyExercise()] }))} disabled={sheet.exercises.length >= 30} data-testid="ficha-add-ex"><IconPlus /> Exercício</button>
          </div>
        )}

        {err && <div className="alert alert-error small" role="alert" style={{ marginTop: 10 }}>{err}</div>}
        <div className="ficha-save">
          <button type="button" className="btn btn-primary btn-block" onClick={save} data-testid="ficha-save">Salvar ficha</button>
        </div>
        <p className="note">Só o nome do exercício é obrigatório. As repetições e o descanso ficam como o treinador escreveu. <Link to="/academia">Voltar sem salvar</Link></p>
      </div>
    </>
  )
}
