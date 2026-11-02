import { useState } from 'react'
import { resolveImport, signOut, useSync } from '../services/sync.js'
import { useStore } from '../services/store.js'

/** Primeiro login num aparelho que já tem dados: enviar para a conta ou descartar. */
export default function ImportPrompt() {
  const s = useSync()
  const { races, goals } = useStore()
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)
  if (s.phase !== 'needs-import') return null

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const what = [races.length && `${races.length} ${races.length === 1 ? 'corrida' : 'corridas'}`, goals.length && `${goals.length} ${goals.length === 1 ? 'objetivo' : 'objetivos'}`].filter(Boolean).join(' e ') || 'anexos'

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="imp-t">
        {!discard ? (
          <>
            <h2 id="imp-t">Levar os dados deste aparelho para a conta?</h2>
            <p>Este aparelho tem {what} salvos antes do login. Enviando, eles se juntam ao que já estiver na sua conta e aparecem nos outros aparelhos.</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => resolveImport(true))}>{busy ? 'Enviando…' : 'Enviar para minha conta'}</button>
            <button className="btn btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => setDiscard(true)}>Não enviar</button>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => run(signOut)}>Cancelar e sair da conta</button>
          </>
        ) : (
          <>
            <h2 id="imp-t">Apagar os dados deste aparelho?</h2>
            <p>As {what} que estão só neste aparelho serão apagados, e o app passa a mostrar apenas o que está na sua conta. Se tiver dúvida, volte e envie — depois dá para excluir o que não quiser.</p>
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={() => setDiscard(false)}>Voltar</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => run(() => resolveImport(false))}>Apagar e usar a conta</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
