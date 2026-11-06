// Convite para instalar o app: botão do navegador quando existe; passo a passo no iPhone.
import { useState } from 'react'
import { useUI } from './ui.jsx'
import { installAvailable, promptInstall, snoozeInstall, useInstall } from '../services/install.js'

const BENEFITS = 'Abre em tela cheia pelo ícone, funciona sem internet e recebe os avisos de prazos.'

const ShareIcon = () => (
  <svg className="ios-share" viewBox="0 0 24 24" aria-label="ícone Compartilhar" role="img"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 11H5.5v9.5h13V11H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

function Steps({ platform }) {
  if (platform === 'ios-safari') {
    return (
      <ol className="install-steps">
        <li>Toque em <b>Compartilhar</b> <ShareIcon /> na barra do Safari (embaixo no iPhone, em cima no iPad).</li>
        <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>
        <li>Toque em <b>Adicionar</b>. Depois, abra o PaceOn pelo ícone.</li>
      </ol>
    )
  }
  if (platform === 'ios-other') {
    return (
      <ol className="install-steps">
        <li>Toque em <b>Compartilhar</b> <ShareIcon /> (ao lado do endereço).</li>
        <li>Toque em <b>Adicionar à Tela de Início</b> (iOS 16.4 ou mais novo). Se não aparecer, abra este endereço no <b>Safari</b>.</li>
      </ol>
    )
  }
  if (platform === 'android') {
    return (
      <ol className="install-steps">
        <li>Abra o menu do navegador (<b>⋮</b> ou <b>☰</b>).</li>
        <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
      </ol>
    )
  }
  return <p className="small" style={{ margin: '8px 0 0' }}>No Chrome ou no Edge, use o ícone de instalar na barra de endereço (ou o menu → Instalar PaceOn).</p>
}

function InApp({ platform }) {
  const { notify } = useUI()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin)
      notify('Link copiado')
    } catch {
      notify(location.origin)
    }
  }
  return (
    <>
      <p className="small" style={{ margin: '8px 0 0' }}>Você está no navegador de outro app (Instagram, WhatsApp…), que não instala apps. Abra o endereço no <b>{platform === 'ios-inapp' ? 'Safari' : 'Chrome'}</b>: toque em ⋯ e em “Abrir no navegador”, ou copie o link.</p>
      <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={copy}>Copiar link do app</button>
    </>
  )
}

/** Cartão do Início: aparece só se dá para instalar e não foi dispensado (volta em 30 dias). */
export function InstallBanner() {
  const s = useInstall()
  const [open, setOpen] = useState(false)
  if (!installAvailable(s) || s.snoozed) return null
  const manual = !s.canPrompt
  return (
    <div className="card install-card" data-testid="install-banner">
      <div className="ic-top">
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Instale o PaceOn</b>
          <div className="muted small">{BENEFITS}{s.platform.startsWith('ios') && !s.platform.endsWith('inapp') ? ' No iPhone, os avisos só funcionam com o app instalado.' : ''}</div>
        </div>
      </div>
      {s.platform.endsWith('inapp') ? <InApp platform={s.platform} /> : manual && open && <Steps platform={s.platform} />}
      <div className="ic-actions">
        {s.canPrompt ? (
          <button type="button" className="btn btn-primary" onClick={() => promptInstall()}>Instalar</button>
        ) : !s.platform.endsWith('inapp') && !open ? (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Como instalar</button>
        ) : null}
        <button type="button" className="link-btn muted-btn" onClick={snoozeInstall}>Agora não</button>
      </div>
    </div>
  )
}

/** Seção completa em Ajustes (sempre disponível). */
export function InstallSection() {
  const s = useInstall()
  if (s.installed) {
    return <div className="card small" data-testid="install-section"><b>✓ App instalado neste aparelho.</b><div className="muted" style={{ marginTop: 4 }}>{BENEFITS}</div></div>
  }
  return (
    <div className="card" data-testid="install-section">
      <p className="small" style={{ marginTop: 0 }}>{BENEFITS}</p>
      {s.canPrompt && <button type="button" className="btn btn-primary btn-block" onClick={() => promptInstall()}>Instalar o PaceOn</button>}
      {s.platform.endsWith('inapp') ? <InApp platform={s.platform} /> : !s.canPrompt && <Steps platform={s.platform} />}
      <p className="note">Já instalou num aparelho? Os dados só aparecem nos outros com a mesma conta.</p>
    </div>
  )
}
