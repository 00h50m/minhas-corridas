// Retrospectiva do ano: números, destaques, lugares e card para compartilhar.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../services/store.js'
import { useProfile } from '../services/profile.js'
import { EmptyState, TopBar, useUI } from '../components/ui.jsx'
import { IconDownload, IconShare } from '../components/Icons.jsx'
import { formatHours, reviewYears, yearReview } from '../lib/yearReview.js'
import { CARD_FORMATS } from '../lib/shareCard.js'
import { canvasToBlob, drawYearCard, loadCardFonts } from '../lib/drawCard.js'
import { formatDateBR, todayISO } from '../lib/dates.js'
import { formatDuration, formatKm, formatMoney, formatPace } from '../lib/format.js'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function cardData(rv, athlete) {
  const stats = [
    { value: String(rv.count), label: rv.count === 1 ? 'prova' : 'provas' },
    { value: formatKm(rv.km, { unit: false }), label: 'km em provas' },
    { value: formatHours(rv.timeSec).replace(' min', ''), label: 'correndo' },
    rv.prs.length ? { value: String(rv.prs.length), label: rv.prs.length === 1 ? 'recorde' : 'recordes' } : { value: String(rv.places.length), label: rv.places.length === 1 ? 'cidade' : 'cidades' }
  ]
  const h = rv.highlight
  const highlight = !h ? null
    : h.why === 'pr' ? { title: 'Destaque do ano', line: `${h.race.name}: recorde nos ${h.label} (−${formatDuration(h.gain)})` }
      : h.why === 'meta' ? { title: 'Destaque do ano', line: `${h.race.name}: meta batida por ${formatDuration(h.gain)}` }
        : { title: 'Prova mais longa', line: `${h.race.name} · ${formatKm(h.race.result.officialDistanceKm)}` }
  return { year: rv.year, athlete, stats, highlight, months: rv.months, footer: 'Provas por mês' }
}

export default function YearReview() {
  const { ano } = useParams()
  const nav = useNavigate()
  const { races, goals } = useStore()
  const prof = useProfile()
  const { notify } = useUI()
  const today = todayISO()
  const year = Number(ano)
  const years = reviewYears(races)
  const rv = useMemo(() => (Number.isInteger(year) ? yearReview(races, goals, year, today, prof.data.people) : null), [races, goals, year, today, prof.data.people])
  const canvasRef = useRef()
  const [format, setFormat] = useState('feed')
  const fullName = prof.data.name || prof.data.nickname
  const [showName, setShowName] = useState(!!fullName && prof.data.showNameOnCard)
  const [ready, setReady] = useState(false)
  useEffect(() => { loadCardFonts().finally(() => setReady(true)) }, [])
  useEffect(() => {
    if (ready && rv && !rv.empty && canvasRef.current) drawYearCard(canvasRef.current, cardData(rv, showName ? fullName : ''), CARD_FORMATS[format])
  }, [ready, rv, format, showName, fullName])

  if (!rv) return <Navigate to="/historico" replace />
  const name = `retrospectiva-${year}.png`
  const getFile = async () => new File([await canvasToBlob(canvasRef.current)], name, { type: 'image/png' })
  const download = async (file) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const onShare = async () => {
    const file = await getFile()
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Meu ${year} na corrida` }) } catch (e) { if (e?.name !== 'AbortError') notify('Não foi possível compartilhar') }
    } else {
      await download(file)
      notify('Imagem baixada')
    }
  }
  const maxM = Math.max(1, ...rv.months)

  return (
    <>
      <TopBar title={`Retrospectiva ${year}`} back="/historico" />
      <div className="page retro">
        {years.length > 1 && (
          <div className="seg" role="group" aria-label="Ano" style={{ marginBottom: 12 }}>
            {years.map((y) => <button key={y} type="button" aria-pressed={y === year} onClick={() => nav(`/retrospectiva/${y}`, { replace: true })}>{y}</button>)}
          </div>
        )}
        {rv.empty ? (
          <EmptyState title={`Nenhuma prova concluída em ${year}`} text={rv.nextYear || year >= Number(today.slice(0, 4)) ? 'Quando você registrar resultados, a retrospectiva do ano aparece aqui.' : 'Escolha outro ano ou registre resultados antigos.'} action={<Link to="/historico" className="btn btn-dark btn-block">Ver histórico</Link>} />
        ) : (
          <>
            <div className="hero retro-hero">
              <div className="eyebrow">{prof.data.nickname || prof.data.name ? `${prof.data.nickname || prof.data.name.split(' ')[0]}, seu ano na corrida` : 'Seu ano na corrida'}</div>
              <div className="retro-grid" data-testid="retro-numbers">
                <div><b>{rv.count}</b><span>{rv.count === 1 ? 'prova' : 'provas'}</span></div>
                <div><b>{formatKm(rv.km, { unit: false })}</b><span>km em provas</span></div>
                <div><b>{formatHours(rv.timeSec)}</b><span>correndo</span></div>
                <div><b>{rv.prs.length}</b><span>{rv.prs.length === 1 ? 'recorde' : 'recordes'}</span></div>
              </div>
            </div>

            {rv.highlight && (
              <>
                <div className="section-title"><h2>Destaque</h2></div>
                <Link to={`/corridas/${rv.highlight.race.id}`} className="card retro-highlight" data-testid="retro-highlight">
                  <b>{rv.highlight.race.name}</b>
                  <span className="muted small">{formatDateBR(rv.highlight.race.date)} · {formatKm(rv.highlight.race.result.officialDistanceKm)} · {formatDuration(rv.highlight.race.result.netTime)}</span>
                  <span className="flag flag-brand" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    {rv.highlight.why === 'pr' ? `Recorde nos ${rv.highlight.label}: −${formatDuration(rv.highlight.gain)}` : rv.highlight.why === 'meta' ? `Meta batida por ${formatDuration(rv.highlight.gain)}` : 'Prova mais longa do ano'}
                  </span>
                </Link>
              </>
            )}

            <div className="section-title"><h2>Mês a mês</h2></div>
            <div className="card">
              <div className="retro-months" role="img" aria-label={`Provas por mês em ${year}`}>
                {rv.months.map((n, i) => (
                  <div key={i} className={`rm ${n === maxM && n ? 'top' : ''}`}>
                    <span className="bar" style={{ height: `${n ? Math.max(10, (n / maxM) * 100) : 4}%` }} />
                    <span className="n">{n || ''}</span>
                    <span className="m">{MONTHS[i]}</span>
                  </div>
                ))}
              </div>
              {rv.topMonth != null && (() => {
                const top = rv.months.map((n, i) => (n === maxM ? MONTHS_FULL[i] : null)).filter(Boolean)
                const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} e ${top.at(-1)}` : top[0]
                return <p className="note">{top.length > 1 ? 'Meses mais ativos' : 'Mês mais ativo'}: <b>{list}</b> ({maxM} {maxM === 1 ? 'prova' : 'provas'}{top.length > 1 ? ' cada' : ''}).</p>
              })()}
            </div>

            {(rv.prs.length > 0 || rv.firsts.length > 0) && (
              <>
                <div className="section-title"><h2>Conquistas</h2></div>
                <div className="card">
                  <ul className="plain-list">
                    {rv.prs.map((p) => <li key={'pr' + p.key}><span style={{ flex: 1 }}>🏅 Recorde nos {p.label}<br /><span className="muted small">{p.race.name} · {formatDuration(p.race.result.netTime)}</span></span><span className="right small delta-good">−{formatDuration(p.gain)}</span></li>)}
                    {rv.firsts.map((f) => <li key={'f' + f.key}><span style={{ flex: 1 }}>✨ Primeira vez: {f.label}<br /><span className="muted small">{f.race.name} · {formatDuration(f.race.result.netTime)}</span></span></li>)}
                  </ul>
                </div>
              </>
            )}

            <div className="section-title"><h2>Em números</h2></div>
            <div className="card">
              <dl className="kv">
                {rv.distances.length > 0 && <><dt>Distâncias</dt><dd>{rv.distances.map((d) => `${d.label} (${d.count})`).join(' · ')}</dd></>}
                {rv.avgPace && <><dt>Pace médio</dt><dd>{formatPace(rv.avgPace)}</dd></>}
                {rv.fastest && <><dt>Pace mais rápido</dt><dd>{formatPace(rv.fastest.result.netTime / rv.fastest.result.officialDistanceKm)} · {rv.fastest.name}</dd></>}
                {rv.longest && <><dt>Mais longa</dt><dd>{formatKm(rv.longest.result.officialDistanceKm)} · {rv.longest.name}</dd></>}
                {rv.targets.set > 0 && <><dt>Metas de tempo</dt><dd>{rv.targets.hit} de {rv.targets.set} batidas</dd></>}
                {rv.goalsDone.length > 0 && <><dt>Objetivos</dt><dd>{rv.goalsDone.map((g) => g.title).join(' · ')}</dd></>}
                {rv.companions.length > 0 && <><dt>Com quem correu</dt><dd>{rv.companions.map((c) => `${c.name} (${c.count})`).join(' · ')}</dd></>}
                {rv.places.length > 0 && <><dt>Lugares</dt><dd>{rv.places.length} {rv.places.length === 1 ? 'cidade' : 'cidades'}{rv.states.length > 1 ? ` em ${rv.states.length} estados` : ''}: {rv.places.map((p) => p.city).join(', ')}</dd></>}
                <dt>Gastos com provas</dt><dd>{formatMoney(rv.spent)}</dd>
                {rv.kmDriven > 0 && <><dt>Dirigiu para correr</dt><dd>{formatKm(rv.kmDriven)}</dd></>}
                {rv.nextYear > 0 && <><dt>Em {year + 1}</dt><dd>{rv.nextYear} {rv.nextYear === 1 ? 'prova' : 'provas'} no radar</dd></>}
              </dl>
            </div>

            <div className="section-title"><h2>Compartilhar</h2></div>
            <div className={`card-preview fmt-${format}`}>
              <canvas ref={canvasRef} data-testid="retro-canvas" role="img" aria-label={`Card da retrospectiva ${year}`} />
            </div>
            <div className="tabs" role="tablist" style={{ marginTop: 12 }} aria-label="Formato">
              {Object.values(CARD_FORMATS).map((f) => <button key={f.id} role="tab" aria-selected={format === f.id} onClick={() => setFormat(f.id)}>{f.label}</button>)}
            </div>
            {fullName && <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Mostrar meu nome</label>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={!ready} onClick={onShare}><IconShare /> Compartilhar</button>
            <button className="btn btn-block" style={{ marginTop: 10 }} disabled={!ready} onClick={async () => { await download(await getFile()); notify('Imagem baixada') }}><IconDownload /> Baixar imagem (PNG)</button>
            <p className="note">O card não mostra gastos nem endereços.</p>
          </>
        )}
      </div>
    </>
  )
}
