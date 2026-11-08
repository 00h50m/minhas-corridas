// Linha do tempo da agenda do dia (logística e modo dia da prova).
import { minToHm } from '../lib/schedule.js'

export default function Timeline({ schedule, now = null }) {
  return (
    <ol className="timeline" data-testid="timeline">
      {schedule.items.map((i) => (
        <li key={i.key} className={`${i.highlight ? 'hl' : ''} k-${i.key.replace(/-\d+$/, '')}${now != null && i.at <= now ? ' past' : ''}`}>
          <span className="tl-time">{minToHm(i.at)}</span>
          <span className="tl-body"><b>{i.label}</b>{i.detail && <span className="muted small">{i.detail}</span>}</span>
        </li>
      ))}
    </ol>
  )
}
