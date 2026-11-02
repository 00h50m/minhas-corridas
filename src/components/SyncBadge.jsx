import { Link } from 'react-router-dom'
import { IconCloud } from './Icons.jsx'
import { useSync } from '../services/sync.js'
import { syncLabel } from '../pages/Account.jsx'

/** Indicador compacto da conta/sincronização no topo do Início. */
export default function SyncBadge() {
  const s = useSync()
  if (!s.configured) return null
  const label = s.user ? syncLabel(s) : 'Entrar para sincronizar'
  const tone = !s.user ? 'off' : s.phase === 'error' ? 'error' : s.phase === 'offline' || s.pending ? 'pending' : s.phase === 'syncing' ? 'syncing' : 'ok'
  return (
    <Link to="/conta" className={`icon-btn sync-badge sb-${tone}`} aria-label={`Conta: ${label}`} title={label}>
      <IconCloud />
      <span className="sb-dot" aria-hidden="true" />
    </Link>
  )
}
