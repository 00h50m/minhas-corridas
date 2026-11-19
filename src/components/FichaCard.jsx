// Em Treinos: a ficha da academia com o próximo da sequência e “Fiz hoje”; sem ficha, o convite
// discreto para cadastrar (só para quem já faz academia ou ainda não tem nada).
import { Link } from 'react-router-dom'
import { IconCheck, IconDumbbell } from './Icons.jsx'
import { useFicha } from '../services/ficha.js'
import { activeProgram, nextSheet, sheetName } from '../lib/ficha.js'
import { todayISO } from '../lib/dates.js'
import { useMarkSheet } from '../pages/Ficha.jsx'

export default function FichaCard({ workouts }) {
  const ficha = useFicha()
  const p = activeProgram(ficha)
  const mark = useMarkSheet()
  if (!p) {
    return (
      <Link to="/academia" className="card ficha-card ficha-card-empty" data-testid="ficha-card" style={{ marginTop: 10 }}>
        <span className="ficha-next-ic"><IconDumbbell /></span>
        <span style={{ flex: 1, minWidth: 0 }}><b>Ficha da academia</b><span className="muted small"> · cadastre a do seu treinador (Treino A, B, C…)</span></span>
        <span aria-hidden="true">›</span>
      </Link>
    )
  }
  const next = nextSheet(p, workouts)
  const today = todayISO()
  const doneToday = workouts.find((w) => w.status === 'feito' && w.date === today && w.ficha?.programId === p.id)
  return (
    <div className="card ficha-card" data-testid="ficha-card" style={{ marginTop: 10 }}>
      <span className="ficha-next-ic"><IconDumbbell /></span>
      <Link to="/academia" className="ficha-card-body">
        <b>Academia</b>
        <span className="muted small">{doneToday ? `Hoje: Treino ${doneToday.ficha.label} feito` : `Próximo: ${sheetName(next)}`} · ver ficha</span>
      </Link>
      {!doneToday && next && <button type="button" className="btn btn-sm btn-primary" onClick={() => mark(p, next, today)} data-testid="ficha-card-done"><IconCheck /> Fiz {next.label}</button>}
    </div>
  )
}
