// Ficha da academia: os treinos do treinador (A, B, C…) como no PDF, qual é o próximo da sequência e
// “Fiz hoje” para registrar o treino feito (entra na semana, no calendário e na comparação com o relógio).
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, Sheet, TopBar, useUI } from '../components/ui.jsx'
import CopyBox from '../components/CopyBox.jsx'
import { IconCheck, IconDumbbell, IconEdit, IconPlus } from '../components/Icons.jsx'
import { saveWorkout, useStore } from '../services/store.js'
import { useFicha } from '../services/ficha.js'
import { activeProgram, blocks, claudeFichaPrompt, lastDone, nextSheet, sheetName, workoutFromSheet } from '../lib/ficha.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { dayLabel } from '../lib/reschedule.js'

/** Registra o treino da ficha como feito numa data, ou começa agora (abre o “treinando agora”). */
export function useMarkSheet() {
  const { workouts } = useStore()
  const { notify } = useUI()
  const nav = useNavigate()
  return (program, sheet, date, { start = false } = {}) => {
    const same = workouts.find((w) => w.date === date && w.ficha?.sheetId === sheet.id && (start || w.status === 'feito'))
    if (same && start) { nav(`/treinos/${same.id}/agora`); return same }
    if (same) { notify(`${sheetName(sheet)} já está registrado em ${formatDateBR(date).slice(0, 5)}`); return same }
    const planned = workouts.find((w) => w.date === date && w.sport === 'academia' && w.status === 'planejado')
    const saved = saveWorkout(workoutFromSheet(program, sheet, date, planned, start ? 'planejado' : 'feito'))
    if (start) { nav(`/treinos/${saved.id}/agora`); return saved }
    notify(`${sheetName(sheet)} registrado${date === todayISO() ? ' hoje' : ` em ${formatDateBR(date).slice(0, 5)}`}`)
    return saved
  }
}

export default function Ficha() {
  const ficha = useFicha()
  const { workouts } = useStore()
  const p = activeProgram(ficha)
  const mark = useMarkSheet()
  const today = todayISO()
  const [other, setOther] = useState(null)

  if (!p) {
    return (
      <>
        <TopBar title="Ficha da academia" back="/treinos" />
        <div className="page">
          <EmptyState
            title="Sua ficha da academia"
            text="Cadastre os treinos do seu treinador (A, B, C…) com os exercícios, séries, repetições, descanso e conjugados, como estão no PDF. Depois é só tocar em “Fiz hoje” no treino que você fez."
            action={<Link to="/academia/editar?nova=1" className="btn btn-primary btn-block" data-testid="ficha-new"><IconPlus /> Cadastrar ficha</Link>}
          />
          <div className="card small" style={{ marginTop: 12 }}>
            <b>Com o Claude no Chrome</b>
            <p className="muted" style={{ margin: '4px 0 8px' }}>Abra o PDF da ficha numa aba e o PaceOn em outra; o Claude lê o PDF e preenche tudo.</p>
            <CopyBox label="Copiar prompt para o Claude no Chrome" text={claudeFichaPrompt(`${location.origin}/academia/editar?nova=1`)} done="Prompt copiado: cole no Claude no Chrome" testid="ficha-claude-empty" />
          </div>
        </div>
      </>
    )
  }

  const next = nextSheet(p, workouts)
  const last = lastDone(p, workouts)
  const expired = p.to && p.to < today
  return (
    <>
      <TopBar title="Ficha da academia" sub={p.goal || p.title} back="/treinos" right={<Link to="/academia/editar" className="icon-btn" aria-label="Editar ficha"><IconEdit /></Link>} />
      <div className="page ficha-page" data-testid="ficha">
        <div className="card ficha-head">
          <b>{p.title}</b>
          <span className="muted small">
            {[p.goal, p.from && p.to ? `${formatDateBR(p.from).slice(0, 5)} a ${formatDateBR(p.to)}` : null, p.coach && `treinador(a) ${p.coach}`].filter(Boolean).join(' · ')}
          </span>
          {expired && <div className="alert alert-warn small" style={{ marginTop: 8 }} data-testid="ficha-expired">O período desta ficha terminou em {formatDateBR(p.to)}. Quando receber a nova, <Link to="/academia/editar?nova=1">cadastre a nova ficha</Link> (esta fica no histórico).</div>}
        </div>

        {next && (
          <div className="card ficha-next" data-testid="ficha-next">
            <span className="ficha-next-ic"><IconDumbbell /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="muted small">Próximo da sequência</span>
              <b>{sheetName(next)}</b>
              <span className="muted small">{next.exercises.length} exercícios{last[next.id] ? ` · último em ${dayLabel(last[next.id])}` : ''}</span>
            </div>
            <div className="ficha-next-b">
              <button type="button" className="btn btn-primary" onClick={() => mark(p, next, today, { start: true })} data-testid="ficha-start-next">Começar</button>
              <button type="button" className="link-btn" onClick={() => mark(p, next, today)} data-testid="ficha-done-next"><IconCheck /> Já fiz</button>
            </div>
          </div>
        )}

        {p.sheets.map((s) => (
          <div key={s.id} className="ficha-sheet-view" data-testid="ficha-sheet-view">
            <div className="section-title ficha-sheet-title">
              <h2>{sheetName(s)}</h2>
              <span className="muted small">{last[s.id] ? `feito ${dayLabel(last[s.id])}` : 'ainda não feito'}</span>
            </div>
            <div className="card ficha-table">
              {blocks(s).map((b, bi) => (
                <div key={bi} className={`ficha-block${b.length > 1 ? ' pair' : ''}`}>
                  {b.length > 1 && <span className="ficha-pair-tag">conjugado</span>}
                  {b.map((x) => {
                    const n = String(s.exercises.indexOf(x) + 1).padStart(2, '0')
                    return (
                      <div key={x.id} className="ficha-row">
                        <span className="ficha-n">{n}</span>
                        <div className="ficha-row-body">
                          <b>{x.name}</b>
                          {x.note && <span className="muted small ficha-note">{x.note}</span>}
                          <span className="ficha-meta small">
                            {x.sets ? <span><b>{x.sets}</b> {x.sets === 1 ? 'série' : 'séries'}</span> : null}
                            {x.reps && <span>{x.reps}</span>}
                            {x.rest && <span className="muted">descanso {x.rest}</span>}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="btn-row ficha-actions">
              <button type="button" className="btn btn-sm" onClick={() => mark(p, s, today, { start: true })} data-testid={`ficha-start-${s.label}`}>Começar agora</button>
              <button type="button" className="btn btn-sm" onClick={() => mark(p, s, today)} data-testid={`ficha-done-${s.label}`}><IconCheck /> Fiz hoje</button>
              <button type="button" className="link-btn" onClick={() => setOther(s)}>Fiz em outro dia</button>
            </div>
          </div>
        ))}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <Link to="/academia/editar" className="btn"><IconEdit /> Editar ficha</Link>
          <Link to="/academia/editar?nova=1" className="btn">Nova ficha</Link>
        </div>
        <p className="note">O app guarda a ficha do seu treinador e registra o que você fez; ele não monta nem muda treinos. Com o relógio, as séries do arquivo aparecem ao lado da ficha no treino.</p>
      </div>
      {other && <OtherDay p={p} s={other} onClose={() => setOther(null)} mark={mark} />}
    </>
  )
}

function OtherDay({ p, s, onClose, mark }) {
  const [d, setD] = useState(todayISO())
  return (
    <Sheet title={`${sheetName(s)}: quando você fez?`} onClose={onClose}>
      <input className="input" type="date" max={todayISO()} value={d} onChange={(e) => setD(e.target.value)} aria-label="Data do treino" data-testid="ficha-other-date" />
      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={!d} onClick={() => { mark(p, s, d); onClose() }} data-testid="ficha-other-save">Registrar</button>
    </Sheet>
  )
}
