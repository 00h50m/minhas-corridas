// Botão "copiar" com o texto à vista (se o navegador não deixar copiar, dá para selecionar à mão).
import { useState } from 'react'
import { useUI } from './ui.jsx'

export default function CopyBox({ label, text, done = 'Copiado', testid, hint = null }) {
  const { notify } = useUI()
  const [open, setOpen] = useState(false)
  const copy = async () => {
    setOpen(true)
    try {
      await navigator.clipboard.writeText(text)
      notify(done)
    } catch {
      notify('Selecione o texto abaixo e copie')
    }
  }
  return (
    <div className="copy-box" data-testid={testid}>
      <button type="button" className="btn btn-block" onClick={copy}>{label}</button>
      {open && (
        <>
          {hint && <p className="note" style={{ margin: '6px 0' }}>{hint}</p>}
          <textarea className="input copy-text" readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} onFocus={(e) => e.target.select()} aria-label={label} />
        </>
      )}
    </div>
  )
}
