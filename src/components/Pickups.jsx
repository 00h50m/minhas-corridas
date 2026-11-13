// "Avisar quem vou buscar": horário de cada busca (pela agenda) e mensagem pronta no WhatsApp.
import { useProfile } from '../services/profile.js'
import { minToHm } from '../lib/schedule.js'
import { pickupMessage, pickups, whatsappLink } from '../lib/people.js'

export default function Pickups({ race, schedule, stops }) {
  const people = useProfile().data.people
  const list = pickups(schedule, stops, people)
  if (!list.length) return null
  return (
    <div className="card" style={{ marginTop: 12 }} data-testid="pickups">
      <div className="list-group-title" style={{ marginTop: 0 }}>Avisar quem você vai buscar</div>
      <ul className="pickups">
        {list.map(({ person, at }) => (
          <li key={person.id}>
            <span><b>{person.name}</b> <span className="muted small">às {minToHm(at, { withDay: false })}</span></span>
            <a className="wa-btn" href={whatsappLink(person.phone, pickupMessage({ person, race, at }))} target="_blank" rel="noreferrer" data-testid="wa-link">WhatsApp</a>
          </li>
        ))}
      </ul>
      <p className="note">A mensagem já vem com o horário calculado. Se a largada ou a rota mudar, o horário muda junto — avise de novo.{list.some((x) => !x.person.phone) ? ' Sem telefone cadastrado, o WhatsApp abre para você escolher o contato.' : ''}</p>
    </div>
  )
}
