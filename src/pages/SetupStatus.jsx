// Ajustes → “Está tudo ligado?”: o que está ativo e o que falta, num lugar só.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/ui.jsx'
import { IconAlert, IconCheck, IconInfo } from '../components/Icons.jsx'
import { useSync } from '../services/sync.js'
import { pushStatus, pushSupport } from '../services/push.js'
import { supabaseReady } from '../services/supabase.js'
import { getLocalKV } from '../services/kv.js'
import { useFicha } from '../services/ficha.js'
import { useCycle } from '../services/cycle.js'
import { activeProgram } from '../lib/ficha.js'
import { attention, setupChecks } from '../lib/setupStatus.js'
import { todayISO } from '../lib/dates.js'
import { APP_VERSION } from '../services/appUpdate.js'

async function probe(name) {
  try {
    const sb = await supabaseReady
    if (!sb) return 'unknown'
    const { error } = await sb.rpc(name)
    if (!error) return 'ok'
    return error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || '') ? 'missing' : 'unknown'
  } catch { return 'unknown' }
}

export default function SetupStatus() {
  const sync = useSync()
  const ficha = useFicha()
  const cycle = useCycle()
  const [push, setPush] = useState({ support: pushSupport() })
  const [rpc, setRpc] = useState({})
  const signed = sync.configured && sync.user
  useEffect(() => {
    pushStatus().then((s) => setPush((p) => ({ ...p, ...s }))).catch(() => {})
    fetch('/api/push').then((r) => r.json().then((b) => setPush((p) => ({ ...p, server: !!(r.ok && b.publicKey) })))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!signed) return
    Promise.all([probe('my_challenges'), probe('my_shared_reports')]).then(([challenges, reports]) => setRpc({ challenges, reports }))
  }, [signed])
  const rows = setupChecks({ sync, push, rpc, garmin: getLocalKV('garmin'), program: activeProgram(ficha), cycle, today: todayISO() })
  const groups = [...new Set(rows.map((r) => r.group))]
  const n = attention(rows)
  return (
    <>
      <TopBar title="Está tudo ligado?" back="/ajustes" />
      <div className="page" data-testid="setup-status">
        <div className={`card ss-sum${n ? ' warn' : ''}`} data-testid="setup-sum">
          {n ? <IconAlert /> : <IconCheck />}
          <span><b>{n ? `${n} ${n === 1 ? 'item pede' : 'itens pedem'} atenção` : 'Tudo certo por aqui'}</b><span className="muted small">Versão {APP_VERSION}. Itens opcionais desligados não contam.</span></span>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="list-group-title">{g}</div>
            <div className="card ss-list">
              {rows.filter((r) => r.group === g).map((r) => (
                <div key={r.id} className={`ss-row ss-${r.status}`} data-testid={`st-${r.id}`} data-status={r.status}>
                  <span className="ss-dot" aria-hidden="true">{r.status === 'ok' ? <IconCheck /> : r.status === 'warn' ? <IconAlert /> : r.status === 'check' ? <IconInfo /> : '–'}</span>
                  <div className="ss-body">
                    <b>{r.title}</b>
                    <span className="small">{r.text}</span>
                  </div>
                  {r.to && r.action && <Link to={r.to} className="link-btn ss-act">{r.action}</Link>}
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="note">O que depende do servidor (banco, envios automáticos) só dá para conferir com a conta conectada; os envios das 8h e 20h você confere na Vercel.</p>
      </div>
    </>
  )
}
