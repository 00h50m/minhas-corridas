// "Montar o próximo bloco": a partir da marca nos 5 km, 4 semanas novas nos mesmos dias, com pace recalculado
// e um objetivo novo ligado. Mostra tudo antes de criar.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveGoal, saveWorkout } from '../services/store.js'
import { Sheet, useUI } from './ui.jsx'
import { buildNextBlock, nextStart, usualDays } from '../lib/nextBlock.js'
import { formatDateBR, weekdayShort } from '../lib/dates.js'
import { formatDuration, parseDuration } from '../lib/format.js'
import { summary } from '../lib/workout.js'
import { emptyGoal } from '../lib/model.js'

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function NextBlock({ goal: g, plan, mark, today }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="next-block" data-testid="next-block">
      <p className="small" style={{ margin: '10px 0 6px' }}>{mark ? <>Com a sua marca de <b>{formatDuration(mark)}</b>, dá para montar as próximas 4 semanas já com o pace novo.</> : 'Informe seu tempo atual nos 5 km para montar as próximas 4 semanas.'}</p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(true)} data-testid="next-block-open">Montar o próximo bloco</button>
      {open && <NextBlockSheet goal={g} plan={plan} mark={mark} today={today} onClose={() => setOpen(false)} />}
    </div>
  )
}

function NextBlockSheet({ goal: g, plan, mark, today, onClose }) {
  const nav = useNavigate()
  const { notify } = useUI()
  const [txt, setTxt] = useState(mark ? formatDuration(mark) : '')
  const time5k = parseDuration(txt)
  const valid = time5k != null && time5k >= 12 * 60 && time5k <= 75 * 60
  const blockNo = (Number(/^B(\d+) /.exec(plan?.list.find((w) => /^B\d+ /.test(w.name))?.name ?? '')?.[1]) || 1) + 1
  const b = useMemo(() => (valid ? buildNextBlock({ time5k, startMonday: nextStart(plan?.last, today), days: usualDays(plan?.list ?? []), block: blockNo }) : null), [time5k, valid])
  const create = () => {
    const ng = saveGoal({ ...emptyGoal('tempo'), title: `Correr 5 km abaixo de ${formatDuration(b.target)}`, distanceKm: 5, targetValue: b.target, startDate: b.workouts[0].date, deadline: b.end, notes: `Bloco ${blockNo}, a partir de ${formatDuration(time5k)} nos 5 km.` })
    for (const w of b.workouts) saveWorkout({ ...w, id: null, goalId: ng.id, status: 'planejado', result: null })
    notify(`Bloco ${blockNo} criado: 8 treinos e o objetivo de ${formatDuration(b.target)}`)
    onClose()
    nav(`/objetivos/${ng.id}`)
  }
  return (
    <Sheet title="Próximo bloco (4 semanas)" onClose={onClose}>
      <div data-testid="next-block-sheet">
        <div className="field">
          <label htmlFor="nb-time">Seu tempo atual nos 5 km</label>
          <input id="nb-time" className="input" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ex.: 38:40" />
          {!valid && txt && <div className="err">Digite o tempo dos 5 km, ex.: 38:40.</div>}
        </div>
        {b && (
          <>
            <div className="card nb-sum small">
              <div>Meta do bloco: <b>{formatDuration(b.target)}</b> nos 5 km (teste em {formatDateBR(b.end).slice(0, 5)})</div>
              <div>Leve <b>{fmt(b.zones.leve.min)}–{fmt(b.zones.leve.max)}</b> · ritmo <b>{fmt(b.zones.ritmo.min)}–{fmt(b.zones.ritmo.max)}</b> · forte <b>{fmt(b.zones.forte.min)}–{fmt(b.zones.forte.max)}</b> /km</div>
            </div>
            <ol className="nb-list small">
              {b.workouts.map((w) => (
                <li key={w.name}><b>{weekdayShort(w.date)} {formatDateBR(w.date).slice(0, 5)}</b> · {w.name.replace(/^B\d+ /, '')}<div className="muted">{summary(w.items)}</div></li>
              ))}
            </ol>
            <p className="note">Mesmos dias da semana do bloco atual, com o volume subindo (25 → 30 → 35 min) e a semana 4 mais leve antes do teste. É um ponto de partida: ajuste o que quiser depois, em cada treino. Se tiver treinador, siga a orientação dele.</p>
          </>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!b} onClick={create} data-testid="next-block-create">Criar bloco</button>
        </div>
      </div>
    </Sheet>
  )
}
