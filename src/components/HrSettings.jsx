// Perfil → Frequência cardíaca: FC máxima e de repouso, zonas (do Garmin, digitadas ou pela FC máxima).
import { IconWatch } from './Icons.jsx'
import { useState } from 'react'
import { saveProfile, useProfile } from '../services/profile.js'
import { useGarmin } from '../services/garmin.js'
import { useUI } from './ui.jsx'
import { useZones } from './HrZones.jsx'
import { ZONE_NAMES } from '../lib/hrZones.js'

export default function HrSettings() {
  const prof = useProfile()
  const g = useGarmin()
  const { notify } = useUI()
  const hr = prof.data.hr ?? {}
  const zones = useZones()
  const [edit, setEdit] = useState(false)
  const [floors, setFloors] = useState(() => zones?.floors ?? ['', '', '', '', ''])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = (patch) => saveProfile({ ...prof.data, hr: { ...hr, ...patch } })
  const [maxText, setMaxText] = useState(hr.max ? String(hr.max) : '')
  const [restText, setRestText] = useState(hr.rest ? String(hr.rest) : '')
  // Salva quando o número faz sentido (FC máxima 120–230; repouso 30–100); vazio apaga.
  const onNum = (setText, field, lo, hi) => (e) => {
    const t = e.target.value.replace(/\D/g, '').slice(0, 3)
    setText(t)
    const v = Number(t)
    if (!t) save({ [field]: null })
    else if (v >= lo && v <= hi) save({ [field]: v })
  }

  const fromGarmin = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { garminHrZones } = await import('../services/garmin.js')
      const r = await garminHrZones()
      if (!r.zones) {
        setMsg(r.shape?.keys?.length ? `O Garmin respondeu num formato que o app não reconheceu (campos: ${r.shape.keys.join(', ')}) — mande um print para ajustar.` : 'O Garmin não mandou zonas.')
        return
      }
      save({ floors: r.zones.floors, max: r.zones.max ?? hr.max, rest: r.zones.rest ?? hr.rest, source: 'garmin' })
      if (r.zones.max) setMaxText(String(r.zones.max))
      if (r.zones.rest) setRestText(String(r.zones.rest))
      setFloors(r.zones.floors)
      notify('Zonas do Garmin importadas')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }
  const saveFloors = () => {
    const f = floors.map(Number)
    if (!f.every((x, i) => x >= 40 && x <= 230 && (i === 0 || x > f[i - 1]))) { setMsg('Os pisos precisam subir de zona em zona (ex.: 100, 120, 140, 155, 170).'); return }
    save({ floors: f, source: 'manual' })
    setEdit(false)
    setMsg(null)
    notify('Zonas salvas')
  }

  return (
    <div className="card small" id="fc" data-testid="hr-settings">
      <div className="grid-2">
        <label className="cy-label" style={{ margin: 0 }}>FC máxima
          <input className="input" inputMode="numeric" value={maxText} onChange={onNum(setMaxText, 'max', 120, 230)} aria-invalid={maxText && !(Number(maxText) >= 120 && Number(maxText) <= 230) ? 'true' : 'false'} placeholder="ex.: 190" data-testid="hr-max" />
        </label>
        <label className="cy-label" style={{ margin: 0 }}>FC de repouso <span className="muted">(opcional)</span>
          <input className="input" inputMode="numeric" value={restText} onChange={onNum(setRestText, 'rest', 30, 100)} placeholder="ex.: 55" />
        </label>
      </div>
      {zones ? (
        <ul className="hrz-legend" style={{ marginTop: 10 }} data-testid="hr-zones">
          {zones.floors.map((f, i) => <li key={i}><span className="hrz-dot" style={{ background: ['#9aa5b1', '#3b82f6', '#22a06b', '#f59e0b', '#ef4444'][i] }} /><span>{ZONE_NAMES[i]}</span><b>{f}{i < 4 ? `–${zones.floors[i + 1] - 1}` : '+'}</b><span className="muted">bpm</span></li>)}
        </ul>
      ) : <p className="muted" style={{ marginBottom: 0 }}>Informe a FC máxima (ou a data de nascimento no perfil, ou importe do Garmin) para calcular as zonas.</p>}
      {zones && <p className="note" style={{ margin: '4px 0 0' }} data-testid="hr-source">Em uso: {zones.label}.</p>}
      <div className="btn-inline" style={{ marginTop: 8 }}>
        {g && <button type="button" className="link-btn" disabled={busy} onClick={fromGarmin} data-testid="hr-garmin"><IconWatch /> {busy ? 'Buscando…' : 'Importar zonas do Garmin'}</button>}
        <button type="button" className="link-btn" onClick={() => { setEdit((v) => !v); setFloors(zones?.floors ?? ['', '', '', '', '']) }} data-testid="hr-edit">{edit ? 'Cancelar' : 'Digitar as zonas'}</button>
        {hr.floors && <button type="button" className="link-btn muted-btn" onClick={() => { save({ floors: null, source: null }); notify('Zonas pela FC máxima') }}>Usar a FC máxima</button>}
      </div>
      {edit && (
        <div style={{ marginTop: 8 }}>
          <div className="hrz-floors">
            {floors.map((f, i) => <label key={i}>Z{i + 1} a partir de<input className="input" inputMode="numeric" value={f} onChange={(e) => setFloors((x) => x.map((y, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 3) : y)))} data-testid={`hr-floor-${i}`} /></label>)}
          </div>
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={saveFloors} data-testid="hr-save-floors">Salvar zonas</button>
        </div>
      )}
      {msg && <div className="alert small" role="status" style={{ marginTop: 8 }}>{msg}</div>}
      <p className="note" style={{ marginBottom: 0 }}>Sem as zonas do relógio, o app usa o padrão do Garmin por % da FC máxima (Z1 50–60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 90%+). Se não souber a sua FC máxima, ele usa a maior que aparece nas suas atividades (com 3 ou mais) ou 220 − idade. As zonas do relógio costumam ser mais certas.</p>
    </div>
  )
}
