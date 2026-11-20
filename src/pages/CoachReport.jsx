// Relatório para o treinador: escolher o período, ver o resumo, baixar em PDF (impressão), copiar o
// texto ou criar um link só de leitura (precisa de conta e do trecho 15 do SQL).
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import CopyBox from '../components/CopyBox.jsx'
import ReportView from '../components/ReportView.jsx'
import { IconDownload, IconShare } from '../components/Icons.jsx'
import { useStore } from '../services/store.js'
import { useFicha } from '../services/ficha.js'
import { useSync } from '../services/sync.js'
import { activeProgram } from '../lib/ficha.js'
import { buildReport, defaultPeriod, reportText } from '../lib/coachReport.js'
import { addDaysISO, formatDateBR, todayISO } from '../lib/dates.js'
import { createSharedReport, deleteSharedReport, getSharedReport, mySharedReports } from '../services/reports.js'

export default function CoachReport() {
  const { workouts, races } = useStore()
  const ficha = useFicha()
  const program = activeProgram(ficha)
  const sync = useSync()
  const { notify, confirm } = useUI()
  const today = todayISO()
  const def = defaultPeriod(program, today)
  const [from, setFrom] = useState(def.from)
  const [to, setTo] = useState(def.to)
  const r = useMemo(() => buildReport({ program, workouts, races, from, to }), [program, workouts, races, from, to])
  const [links, setLinks] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const canLink = sync.configured && sync.user
  useEffect(() => { if (canLink) mySharedReports().then(setLinks).catch(() => setLinks([])) }, [canLink])

  const title = `Relatório ${formatDateBR(from).slice(0, 5)} a ${formatDateBR(to)}`
  const makeLink = async () => {
    setBusy(true); setErr(null)
    try {
      const token = await createSharedReport(title, r)
      const url = `${location.origin}/r/${token}`
      setLinks(await mySharedReports().catch(() => []))
      try { if (navigator.share) await navigator.share({ title, text: `${title} (treinos, cargas e corridas)`, url }); else { await navigator.clipboard.writeText(url); notify('Link copiado') } } catch { /* cancelado */ }
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const removeLink = async (t) => {
    if (!(await confirm({ title: 'Apagar este link?', message: 'Quem tiver o link não vai mais conseguir abrir o relatório.', confirmLabel: 'Apagar', danger: true }))) return
    try { await deleteSharedReport(t); setLinks((l) => l.filter((x) => x.token !== t)); notify('Link apagado') } catch (e) { notify(e.message) }
  }
  const quick = [
    program?.from && { label: 'Período da ficha', from: def.from, to: def.to },
    { label: 'Últimos 30 dias', from: addDaysISO(today, -29), to: today },
    { label: 'Últimas 4 semanas', from: addDaysISO(today, -27), to: today }
  ].filter(Boolean)

  return (
    <>
      <TopBar title="Relatório" sub="para o treinador" back="/academia" />
      <div className="page" data-testid="coach-report">
        <div className="no-print">
          <div className="seg" role="group" aria-label="Período">
            {quick.map((q) => <button key={q.label} type="button" aria-pressed={from === q.from && to === q.to} onClick={() => { setFrom(q.from); setTo(q.to) }}>{q.label}</button>)}
          </div>
          <div className="grid-2" style={{ marginTop: 8 }}>
            <input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="De" data-testid="rp-from" />
            <input className="input" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Até" data-testid="rp-to" />
          </div>
        </div>

        <ReportView r={r} />

        <div className="no-print rp-actions">
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => window.print()} data-testid="rp-pdf"><IconDownload /> Baixar PDF</button>
            {canLink && <button type="button" className="btn" onClick={makeLink} disabled={busy} data-testid="rp-link"><IconShare /> {busy ? 'Criando…' : 'Link para o treinador'}</button>}
          </div>
          {!canLink && <p className="note">Para mandar um link que o treinador abre sem conta, <Link to="/conta">entre na sua conta</Link>. O PDF e o texto funcionam sem conta.</p>}
          {err && <div className="alert alert-error small" role="alert" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 10 }}><CopyBox label="Copiar resumo em texto" text={reportText(r)} done="Resumo copiado: cole na conversa" testid="rp-text" /></div>
          {links?.length > 0 && (
            <div className="card small" style={{ marginTop: 12 }} data-testid="rp-links">
              <b>Links ativos</b>
              {links.map((l) => (
                <div key={l.token} className="rp-linkrow">
                  <a href={`/r/${l.token}`} target="_blank" rel="noreferrer">{l.title}</a>
                  <span className="muted">vence {formatDateBR(l.expires_at.slice(0, 10))}</span>
                  <button type="button" className="link-btn muted-btn" onClick={() => removeLink(l.token)}>Apagar</button>
                </div>
              ))}
            </div>
          )}
          <p className="note">O link mostra só este resumo (contagens, cargas, km), vence em 90 dias e pode ser apagado a qualquer momento.</p>
        </div>
      </div>
    </>
  )
}

/** /r/:token — o relatório como o treinador vê (sem conta). */
export function SharedReport() {
  const { token } = useParams()
  const [rep, setRep] = useState(undefined)
  const [err, setErr] = useState(null)
  useEffect(() => { getSharedReport(token).then(setRep).catch((e) => setErr(e.message)) }, [token])
  return (
    <div className="shared-report">
      <header className="sr-top"><b>PaceOn</b><span className="muted small">relatório compartilhado</span></header>
      <div className="page">
        {err && <div className="alert alert-error small" role="alert">{err}</div>}
        {rep === undefined && !err && <div className="card muted small">Carregando…</div>}
        {rep === null && <div className="card small" data-testid="sr-missing">Este link venceu ou foi apagado. Peça um novo para a atleta.</div>}
        {rep && <ReportView r={rep.data} />}
        {rep && <div className="no-print" style={{ marginTop: 10 }}><button type="button" className="btn" onClick={() => window.print()}><IconDownload /> Baixar PDF</button></div>}
      </div>
    </div>
  )
}
