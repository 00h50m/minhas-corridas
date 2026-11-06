import { Link } from 'react-router-dom'
import { useProfile } from '../services/profile.js'
import { initials } from '../lib/profile.js'

/** Foto (ou iniciais) da pessoa. */
export function Avatar({ size = 40, profile }) {
  const mine = useProfile()
  const p = profile ?? mine
  const ini = initials(p.data)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {p.avatar ? <img src={p.avatar} alt="" /> : ini ? <span>{ini}</span> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>}
    </span>
  )
}

/** Botão do topo do Início que leva ao perfil. */
export function AvatarButton() {
  const p = useProfile()
  return (
    <Link to="/perfil" className="avatar-btn" aria-label="Meu perfil" data-testid="avatar-btn">
      <Avatar size={40} profile={p} />
    </Link>
  )
}
