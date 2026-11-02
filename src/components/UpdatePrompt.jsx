import { useRegisterSW } from 'virtual:pwa-register/react'

/** Avisa quando há uma versão nova publicada e atualiza com um toque. */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // Procura atualização ao voltar para o app e a cada hora.
      const check = () => navigator.onLine !== false && reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      setInterval(check, 60 * 60 * 1000)
    }
  })
  if (!needRefresh) return null
  return (
    <div className="update-bar" role="status">
      <span>Nova versão do app disponível.</span>
      <button className="btn btn-primary" onClick={() => updateServiceWorker(true)}>Atualizar</button>
      <button className="mini-btn" aria-label="Depois" onClick={() => setNeedRefresh(false)}>✕</button>
    </div>
  )
}
