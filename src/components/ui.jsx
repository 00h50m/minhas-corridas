import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { STATUS_BY_ID } from '../lib/model.js'
import { dayOfMonth, formatDateBR, monthShort, weekdayShort } from '../lib/dates.js'
import { formatKm } from '../lib/format.js'
import { IconBack, IconHistory, IconHome, IconPlus, IconFlag, IconSettings, RunnerArt } from './Icons.jsx'

export function TopBar({ title, sub, back, right }) {
  const nav = useNavigate()
  const goBack = () => (window.history.length > 1 ? nav(-1) : nav(back || '/'))
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={goBack} aria-label="Voltar">
          <IconBack />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  )
}

export function BottomNav() {
  const cls = ({ isActive }) => 'nav-item' + (isActive ? ' active' : '')
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <div className="inner">
        <NavLink to="/" end className={cls}><IconHome /><span>Início</span></NavLink>
        <NavLink to="/corridas" className={cls}><IconFlag /><span>Corridas</span></NavLink>
        <Link to="/corridas/nova" className="nav-fab" aria-label="Cadastrar corrida"><IconPlus /></Link>
        <NavLink to="/historico" className={cls}><IconHistory /><span>Histórico</span></NavLink>
        <NavLink to="/ajustes" className={cls}><IconSettings /><span>Ajustes</span></NavLink>
      </div>
    </nav>
  )
}

export function StatusBadge({ status }) {
  const s = STATUS_BY_ID[status]
  if (!s) return null
  return (
    <span className={`status status-${status}`}>
      <span className="ic" aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  )
}

export function DateTile({ date }) {
  if (!date) {
    return (
      <div className="date-tile tbd" aria-label="Data a confirmar">
        <span className="d">?</span>
        <span className="m">a conf.</span>
      </div>
    )
  }
  return (
    <div className="date-tile" aria-label={formatDateBR(date)}>
      <span className="w">{weekdayShort(date)}</span>
      <span className="d">{dayOfMonth(date)}</span>
      <span className="m">{monthShort(date)}</span>
    </div>
  )
}

export function RaceItem({ race, extra }) {
  const place = [race.city, race.state].filter(Boolean).join('/')
  return (
    <Link to={`/corridas/${race.id}`} className={`race-item b-${race.status}`}>
      <DateTile date={race.date} />
      <div className="race-body">
        <div className="t">{race.name}</div>
        <div className="s">
          {[race.date ? formatDateBR(race.date) : 'Data a confirmar', race.startTime, place].filter(Boolean).join(' · ')}
        </div>
        <div className="row">
          <StatusBadge status={race.status} />
          {race.distanceKm != null && <span className="chip">{formatKm(race.distanceKm)}</span>}
          {extra}
        </div>
      </div>
    </Link>
  )
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="card empty">
      <div className="art"><RunnerArt /></div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function Field({ label, optional, error, hint, htmlFor, children }) {
  return (
    <div className="field">
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {optional && <span className="opt">opcional</span>}
        </label>
      )}
      {children}
      {error && <div className="err" role="alert">{error}</div>}
      {!error && hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/* Confirmação e avisos */

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toast, setToast] = useState(null)
  const timer = useRef()

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), [])
  const notify = useCallback((msg) => {
    clearTimeout(timer.current)
    setToast(msg)
    timer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  const close = (v) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <UIContext.Provider value={{ confirm, notify }}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </UIContext.Provider>
  )
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, onClose }) {
  const ref = useRef()
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onClick={() => onClose(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-t">{title}</h2>
        {message && <p>{message}</p>}
        <div className="btn-row">
          <button className="btn" onClick={() => onClose(false)} ref={ref}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function useUI() {
  return useContext(UIContext)
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
