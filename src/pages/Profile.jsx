// Meu perfil (opcional): nome, foto, dados para as provas e contato de emergência.
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Field, TopBar, useUI } from '../components/ui.jsx'
import { IconCamera, IconInfo } from '../components/Icons.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { removeAvatar, saveProfile, setAvatarFromFile, useProfile } from '../services/profile.js'
import { useSync } from '../services/sync.js'
import { BLOOD_TYPES, SEX_OPTIONS, SHIRT_SIZES, ageCategory, ageOn, callName, validateProfile } from '../lib/profile.js'
import { UFS } from '../lib/model.js'
import { FUELS } from '../lib/logistics.js'
import { todayISO } from '../lib/dates.js'

export default function Profile() {
  const prof = useProfile()
  const sync = useSync()
  const nav = useNavigate()
  const { notify } = useUI()
  const [f, setF] = useState(() => ({ ...prof.data, birthDate: prof.data.birthDate ?? '' }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [photoErr, setPhotoErr] = useState(null)
  const fileRef = useRef()
  const today = todayISO()
  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }
  const draft = { ...f, birthDate: f.birthDate || null }
  const cat = ageCategory(draft, today)
  const age = draft.birthDate ? ageOn(draft.birthDate, today) : null

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoErr(null)
    setBusy(true)
    try {
      await setAvatarFromFile(file)
      notify('Foto atualizada')
    } catch (err) {
      setPhotoErr(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    const errs = validateProfile(draft, today)
    setErrors(errs)
    if (Object.keys(errs).length) return
    try {
      saveProfile(draft)
      notify('Perfil salvo')
      nav(-1)
    } catch (err) {
      setErrors({ save: err.message })
    }
  }

  return (
    <>
      <TopBar title="Meu perfil" back="/" />
      <form className="page form" onSubmit={onSubmit} noValidate>
        <div className="card profile-head">
          <button type="button" className="avatar-edit" onClick={() => fileRef.current?.click()} disabled={busy} aria-label={prof.avatar ? 'Trocar foto' : 'Adicionar foto'}>
            <Avatar size={96} profile={prof} />
            <span className="cam"><IconCamera /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} data-testid="avatar-input" />
          <div style={{ minWidth: 0 }}>
            <div className="ph-name">{callName(draft) || 'Seu nome'}</div>
            <div className="muted small">{sync.user ? sync.user.email : 'Sem conta: o perfil fica só neste aparelho.'}</div>
            {prof.avatar && <button type="button" className="link-btn" onClick={() => { removeAvatar(); notify('Foto removida') }}>Remover foto</button>}
          </div>
        </div>
        {photoErr && <div className="alert alert-error small" role="alert" style={{ marginTop: 10 }}><div>{photoErr}</div></div>}
        {prof.remoteError === 'sql' && <div className="alert alert-warn small" style={{ marginTop: 10 }}><IconInfo /><div>O perfil está salvo neste aparelho, mas ainda não vai para a conta: rode o trecho 9 do <code>supabase/schema.sql</code> no Supabase.</div></div>}
        <p className="note">Tudo aqui é opcional. Para usar o app basta o e-mail e a senha.</p>

        <div className="section-title"><h2>Sobre você</h2></div>
        <div className="card">
          <Field label="Nome" optional htmlFor="p-name"><input id="p-name" className="input" value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} placeholder="Ex.: Giovanna Pupo" /></Field>
          <Field label="Como quer ser chamada(o)" optional htmlFor="p-nick" hint={!f.nickname && callName(draft) ? `Se ficar vazio: “${callName(draft)}”` : 'Aparece na saudação do Início.'}>
            <input id="p-nick" className="input" value={f.nickname} onChange={set('nickname')} maxLength={30} placeholder="Ex.: Gi" />
          </Field>
          <div className="grid-2">
            <Field label="Cidade" optional htmlFor="p-city"><input id="p-city" className="input" value={f.city} onChange={set('city')} maxLength={60} /></Field>
            <Field label="UF" optional htmlFor="p-state">
              <select id="p-state" className="input" value={f.state} onChange={set('state')}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
            </Field>
          </div>
          <Field label="Equipe ou assessoria" optional htmlFor="p-team"><input id="p-team" className="input" value={f.team} onChange={set('team')} maxLength={60} /></Field>
        </div>

        <div className="section-title"><h2>Nas provas</h2></div>
        <div className="card">
          <Field label="Data de nascimento" optional htmlFor="p-birth" error={errors.birthDate} hint={age != null && !errors.birthDate ? `${age} anos` : 'Usada para calcular sua faixa etária nas provas.'}>
            <input id="p-birth" type="date" className="input" value={f.birthDate} max={today} onChange={set('birthDate')} aria-invalid={errors.birthDate ? 'true' : 'false'} />
          </Field>
          <Field label="Categoria nas provas" optional>
            <div className="seg" role="radiogroup" aria-label="Categoria nas provas">
              {SEX_OPTIONS.map((o) => <button type="button" key={o.id || 'nd'} role="radio" aria-checked={f.sex === o.id} aria-pressed={f.sex === o.id} onClick={() => set('sex')(o.id)}>{o.label}</button>)}
            </div>
          </Field>
          {cat && <div className="alert alert-info small" style={{ marginBottom: 12 }}><IconInfo /><div>Sua faixa em {today.slice(0, 4)}: <b>{cat.label}</b> (idade em 31/12). A faixa de cada prova pode variar conforme o regulamento.</div></div>}
          <Field label="Tamanho de camiseta" optional hint="Já vem preenchido ao cadastrar provas com camiseta.">
            <div className="seg" role="radiogroup" aria-label="Tamanho de camiseta">
              {SHIRT_SIZES.map((s) => <button type="button" key={s} role="radio" aria-checked={f.shirtSize === s} aria-pressed={f.shirtSize === s} onClick={() => set('shirtSize')(f.shirtSize === s ? '' : s)}>{s}</button>)}
            </div>
          </Field>
          <label className="check"><input type="checkbox" checked={f.showNameOnCard} onChange={set('showNameOnCard')} /> Mostrar meu nome no card de compartilhar</label>
        </div>

        <div className="section-title"><h2>Veículo</h2></div>
        <div className="card" data-testid="vehicle">
          <p className="small muted" style={{ marginTop: 0 }}>Usado na Logística para calcular o combustível: distância ÷ consumo × preço por litro.</p>
          <div className="grid-2">
            <Field label="Consumo médio (km/l)" optional htmlFor="p-kml"><input id="p-kml" className="input" inputMode="decimal" value={f.vehicle.kmPerL ?? ''} onChange={(e) => setF((p) => ({ ...p, vehicle: { ...p.vehicle, kmPerL: e.target.value.replace(',', '.') } }))} placeholder="Ex.: 7" /></Field>
            <Field label="Preço do litro (R$)" optional htmlFor="p-price"><input id="p-price" className="input" inputMode="decimal" value={f.vehicle.pricePerL ?? ''} onChange={(e) => setF((p) => ({ ...p, vehicle: { ...p.vehicle, pricePerL: e.target.value.replace(',', '.') } }))} placeholder="Ex.: 4,29" /></Field>
          </div>
          <div className="seg" role="radiogroup" aria-label="Combustível">
            {FUELS.map((x) => <button type="button" key={x.id} role="radio" aria-checked={f.vehicle.fuel === x.id} aria-pressed={f.vehicle.fuel === x.id} onClick={() => setF((p) => ({ ...p, vehicle: { ...p.vehicle, fuel: x.id } }))}>{x.label}</button>)}
          </div>
        </div>

        {f.favorites.length > 0 && (
          <>
            <div className="section-title"><h2>Endereços favoritos</h2></div>
            <div className="card">
              <ul className="plain-list" data-testid="favorites">
                {f.favorites.map((x) => (
                  <li key={x.id}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>★ {x.label}</b><br /><span className="muted small">{x.formatted || x.address}</span></span>
                    <button type="button" className="link-btn" onClick={() => setF((p) => ({ ...p, favorites: p.favorites.filter((y) => y.id !== x.id) }))}>Remover</button>
                  </li>
                ))}
              </ul>
              <p className="note">Adicione favoritos na Logística de uma prova (☆ Salvar nos favoritos).</p>
            </div>
          </>
        )}

        <div className="section-title"><h2>Emergência</h2></div>
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>Aparece no modo dia da prova, para mostrar rápido se precisar.</p>
          <Field label="Contato de emergência" optional htmlFor="p-ename"><input id="p-ename" className="input" value={f.emergencyName} onChange={set('emergencyName')} maxLength={60} placeholder="Nome e parentesco" /></Field>
          <Field label="Telefone" optional htmlFor="p-ephone" error={errors.emergencyPhone}><input id="p-ephone" className="input" type="tel" inputMode="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} maxLength={30} placeholder="(11) 99999-9999" aria-invalid={errors.emergencyPhone ? 'true' : 'false'} /></Field>
          <Field label="Tipo sanguíneo" optional>
            <div className="seg" role="radiogroup" aria-label="Tipo sanguíneo">
              {BLOOD_TYPES.map((b) => <button type="button" key={b} role="radio" aria-checked={f.bloodType === b} aria-pressed={f.bloodType === b} onClick={() => set('bloodType')(f.bloodType === b ? '' : b)}>{b}</button>)}
            </div>
          </Field>
        </div>
        <p className="note">{sync.user ? 'Fica na sua conta (só você vê) e aparece nos aparelhos em que você entrar.' : <>Sem conta, fica só neste aparelho. <Link to="/conta">Entrar ou criar conta</Link> para levar para outros aparelhos.</>}</p>

        {errors.save && <div className="alert alert-error" role="alert">{errors.save}</div>}
        <div className="sticky-actions"><button type="submit" className="btn btn-primary">Salvar perfil</button></div>
      </form>
    </>
  )
}
