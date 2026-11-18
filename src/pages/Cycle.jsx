// Ciclo menstrual: ativar (consentimento), registro rápido, previsão, a próxima prova, sinais de atenção,
// histórico (inclusive do Flo, à mão) e importação do Garmin. Sincroniza com a conta.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar, useUI } from '../components/ui.jsx'
import { useStore } from '../services/store.js'
import { deleteCycle, saveCycle, useCycle } from '../services/cycle.js'
import { useGarmin } from '../services/garmin.js'
import { FLOW, SYMPTOMS, cycleSignals, cycleStats, dayOfCycle, endPeriod, logDay, mergeStarts, ongoing, phaseLabel, predictNext, raceCycleNote, startPeriod } from '../lib/cycle.js'
import { daysBetween, formatDateBR, todayISO } from '../lib/dates.js'
import { dayLabel } from '../lib/reschedule.js'

const br = (iso) => formatDateBR(iso).slice(0, 5)

export default function Cycle() {
  const c = useCycle()
  return (
    <>
      <TopBar title="Ciclo menstrual" sub={c.enabled ? 'seus treinos e provas' : 'opcional'} back="/perfil" />
      <div className="page" data-testid="cycle">
        {c.enabled ? <Enabled c={c} /> : <Intro c={c} />}
      </div>
    </>
  )
}

function Intro({ c }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="card" data-testid="cycle-intro">
      <b>Para que serve</b>
      <ul className="small cy-list">
        <li>Registrar a menstruação e como você está em <b>2 toques</b>.</li>
        <li>Prever os próximos dias pelo <b>seu</b> histórico (não por uma regra geral).</li>
        <li>Saber em que dia do ciclo cai cada <b>prova</b> e se preparar na reta final.</li>
        <li>Avisar com cuidado quando algo merece conversa com sua ginecologista.</li>
      </ul>
      <p className="small muted">O app não muda nem prescreve treinos por fase do ciclo: o efeito médio é pequeno e varia muito de pessoa para pessoa — o que vale é como <b>você</b> se sente. Não é método contraceptivo nem de fertilidade.</p>
      <label className="check small"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="cycle-consent" /> Concordo em registrar dados do meu ciclo, que são dados de saúde. Eles ficam no aparelho e na minha conta do PaceOn (sincronizados), nunca aparecem em stories, cards ou agenda e posso apagar tudo a qualquer momento.</label>
      <button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={() => saveCycle({ ...c, enabled: true, consentAt: new Date().toISOString() })} data-testid="cycle-enable" style={{ marginTop: 10 }}>Ativar</button>
    </div>
  )
}

function Enabled({ c }) {
  const { notify, confirm } = useUI()
  const { races } = useStore()
  const g = useGarmin()
  const today = todayISO()
  const [past, setPast] = useState({ start: '', end: '' })
  const [gMsg, setGMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const next = predictNext(c, today)
  const now = ongoing(c, today)
  const n = dayOfCycle(c, today)
  const phase = phaseLabel(c, today, today)
  const s = cycleStats(c.periods)
  const signals = cycleSignals(c, today)
  const race = races.filter((r) => r.status === 'inscrita' && r.date && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  const note = race ? raceCycleNote(c, race, today) : null
  const todayLog = c.days[today] ?? { flow: 0, symptoms: [], energy: null }
  const setLog = (patch) => saveCycle(logDay(c, today, patch))

  const importGarmin = async () => {
    setBusy(true)
    setGMsg(null)
    try {
      const { garminCycle } = await import('../services/garmin.js')
      const r = await garminCycle()
      if (!r.starts?.length) {
        setGMsg(r.shape?.keys?.length ? `O Garmin respondeu num formato que o app não reconheceu (campos: ${r.shape.keys.join(', ')}) — mande um print para ajustar.` : 'O Garmin não mandou registros de ciclo (você registra o ciclo no Garmin Connect?).')
      } else {
        const m = mergeStarts(c, r.starts, r.periodLen)
        saveCycle(m.cycle)
        setGMsg(m.added ? `${m.added} ${m.added === 1 ? 'menstruação importada' : 'menstruações importadas'} do Garmin.` : 'Nada novo: as datas do Garmin já estavam aqui.')
      }
    } catch (e) {
      setGMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card cy-now" data-testid="cycle-now">
        {n ? <div className="cy-day"><b>Dia {n}</b> do ciclo{phase ? <span className="muted"> · {phase}</span> : null}</div> : <div className="cy-day"><b>Registre a última menstruação</b> para começar.</div>}
        {next && (
          <p className="small" style={{ margin: '6px 0 0' }} data-testid="cycle-next">
            Próxima menstruação: <b>{next.confidence === 'boa' ? `~${br(next.start)}` : `entre ${br(next.from)} e ${br(next.to)}`}</b>
            {next.confidence === 'aprendendo' && <span className="muted"> · ainda aprendendo (2 ciclos registrados deixam mais preciso)</span>}
            {next.confidence === 'irregular' && <span className="muted"> · seus ciclos variam mais de 7 dias, então a previsão é uma faixa</span>}
            {next.late && <span className="muted"> · passou da data prevista sem registro</span>}
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          {now
            ? <button type="button" className="btn" onClick={() => { saveCycle(endPeriod(c, today)); notify('Fim da menstruação registrado') }} data-testid="cycle-end">Terminou hoje</button>
            : <button type="button" className="btn btn-primary" onClick={() => { saveCycle(startPeriod(c, today)); notify('Início da menstruação registrado') }} data-testid="cycle-start">Menstruação começou hoje</button>}
        </div>
      </div>

      <div className="section-title"><h2>Como está hoje</h2></div>
      <div className="card" data-testid="cycle-log">
        {(now || todayLog.flow > 0) && (
          <>
            <div className="small cy-label">Fluxo</div>
            <div className="seg" role="group" aria-label="Fluxo">
              {FLOW.map((f, i) => <button key={f} type="button" aria-pressed={todayLog.flow === i} onClick={() => setLog({ flow: i })} data-testid={`cycle-flow-${i}`}>{f}</button>)}
            </div>
          </>
        )}
        <div className="small cy-label">Sintomas</div>
        <div className="chips">
          {SYMPTOMS.map((sy) => {
            const on = todayLog.symptoms.includes(sy.id)
            return <button key={sy.id} type="button" className={`chip-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setLog({ symptoms: on ? todayLog.symptoms.filter((x) => x !== sy.id) : [...todayLog.symptoms, sy.id] })} data-testid={`cycle-sym-${sy.id}`}>{sy.label}</button>
          })}
        </div>
        <div className="small cy-label">Energia</div>
        <div className="seg" role="group" aria-label="Energia de 1 a 5">
          {[1, 2, 3, 4, 5].map((e) => <button key={e} type="button" aria-pressed={todayLog.energy === e} onClick={() => setLog({ energy: todayLog.energy === e ? null : e })} data-testid={`cycle-energy-${e}`}>{e}</button>)}
        </div>
        <p className="note" style={{ marginBottom: 0 }}>Aparece em “Como você chega hoje” no treino do dia.</p>
      </div>

      {race && (
        <>
          <div className="section-title"><h2>Próxima prova</h2></div>
          <div className="card small" data-testid="cycle-race">
            <b>{race.name}</b> · {dayLabel(race.date)} (faltam {daysBetween(today, race.date)} dias)
            <div style={{ marginTop: 4 }}>{note ? note.text : 'Pela sua previsão, a prova não cai perto da menstruação.'}</div>
            {note && <div style={{ marginTop: 4 }}>A <Link to={`/corridas/${race.id}`}>reta final</Link> ganhou itens para isso (testar o absorvente/coletor no longão, banheiros no percurso, kit do ciclo).</div>}
          </div>
        </>
      )}

      {signals.map((sg) => (
        <div key={sg.id} className="card small cy-signal" data-testid="cycle-signal">
          <div>💬 {sg.text}</div>
          <button type="button" className="link-btn muted-btn" onClick={() => saveCycle({ ...c, dismissed: [...c.dismissed, sg.id] })}>Entendi, não mostrar de novo</button>
        </div>
      ))}

      <div className="section-title"><h2>Histórico</h2><span className="muted small">{s.count ? `ciclo médio ${s.avg} dias · menstruação ${s.bleed} dias` : ''}</span></div>
      <div className="card small" data-testid="cycle-history">
        {c.periods.length === 0 && <p className="muted" style={{ marginTop: 0 }}>Nenhuma menstruação registrada ainda.</p>}
        <ul className="cy-periods">
          {[...c.periods].reverse().slice(0, 12).map((p) => (
            <li key={p.start}>
              <span>{formatDateBR(p.start)}{p.end ? ` a ${br(p.end)}` : ''}{p.source === 'garmin' && <span className="muted"> · Garmin</span>}</span>
              <button type="button" className="link-btn muted-btn" onClick={() => saveCycle({ ...c, periods: c.periods.filter((x) => x.start !== p.start) })} aria-label={`Remover ${formatDateBR(p.start)}`}>Remover</button>
            </li>
          ))}
        </ul>
        <div className="small cy-label">Adicionar menstruação passada (ex.: do Flo)</div>
        <div className="cy-past">
          <input className="input" type="date" max={today} value={past.start} onChange={(e) => setPast((x) => ({ ...x, start: e.target.value }))} aria-label="Início" data-testid="cycle-past-start" />
          <input className="input" type="date" max={today} value={past.end} onChange={(e) => setPast((x) => ({ ...x, end: e.target.value }))} aria-label="Fim (opcional)" data-testid="cycle-past-end" />
          <button type="button" className="btn" disabled={!past.start} onClick={() => { const after = startPeriod(c, past.start); saveCycle(past.end ? endPeriod(after, past.end) : after); setPast({ start: '', end: '' }); notify('Menstruação adicionada') }} data-testid="cycle-past-add">Adicionar</button>
        </div>
        <p className="note">No Flo: Calendário → toque nas datas das últimas menstruações e copie aqui (início e, se quiser, fim). O Flo não oferece acesso para outros apps importarem sozinhos. Três ou mais deixam a previsão bem melhor.</p>
        {g && <button type="button" className="btn btn-block" disabled={busy} onClick={importGarmin} data-testid="cycle-garmin">{busy ? 'Buscando no Garmin…' : '⌚ Importar do Garmin'}</button>}
        {!g && <p className="note">Com o Garmin conectado (em Treinos), dá para importar as datas que você registra lá.</p>}
        {gMsg && <div className="alert small" role="status" style={{ marginTop: 8 }} data-testid="cycle-garmin-msg">{gMsg}</div>}
      </div>

      <div className="section-title"><h2>Ajustes</h2></div>
      <div className="card small">
        <label className="cy-label" htmlFor="cy-horm">Anticoncepcional hormonal</label>
        <select id="cy-horm" className="input" value={c.hormonal} onChange={(e) => saveCycle({ ...c, hormonal: e.target.value })}>
          <option value="nenhum">Não uso</option>
          <option value="pilula">Pílula</option>
          <option value="diu-hormonal">DIU hormonal</option>
          <option value="implante">Implante</option>
          <option value="outro">Outro</option>
        </select>
        {c.hormonal !== 'nenhum' && <p className="note">Com anticoncepcional hormonal, o sangramento costuma seguir a cartela (sangramento de privação), e a previsão vale como lembrete.</p>}
        <div className="btn-inline" style={{ marginTop: 10 }}>
          <button type="button" className="link-btn" onClick={() => saveCycle({ ...c, enabled: false })} data-testid="cycle-disable">Desativar (guarda o histórico)</button>
          <button type="button" className="link-btn muted-btn" onClick={async () => { if (await confirm({ title: 'Apagar todos os dados do ciclo?', message: 'Some deste aparelho e da sua conta. Não dá para desfazer.', confirmLabel: 'Apagar', danger: true })) { deleteCycle(); notify('Dados do ciclo apagados') } }} data-testid="cycle-delete">Apagar tudo</button>
        </div>
      </div>
      <p className="note">Dados de saúde: ficam no aparelho e na sua conta (sincronizados), nunca em stories, cards de compartilhamento, agenda, prompts ou no Intervals.icu. Não é método contraceptivo nem de fertilidade. As sugestões não substituem uma consulta.</p>
    </>
  )
}
