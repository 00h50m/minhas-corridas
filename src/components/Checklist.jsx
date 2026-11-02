import { useState } from 'react'
import { getRace, saveRace } from '../services/store.js'
import { useUI } from './ui.jsx'
import { IconPlus, IconX } from './Icons.jsx'
import { DEFAULT_CHECKLIST, newId } from '../lib/model.js'

/** Checklist editável da prova. Cada mudança é salva na hora. */
export default function Checklist({ race }) {
  const { notify } = useUI()
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const items = race.checklist ?? []
  const done = items.filter((i) => i.done).length

  // Sempre parte da versão salva mais recente da corrida.
  const update = (fn) => {
    const fresh = getRace(race.id)
    if (!fresh) return
    try {
      saveRace({ ...fresh, checklist: fn(fresh.checklist ?? []) })
    } catch (e) {
      notify(e.message)
    }
  }

  const toggle = (id) => update((list) => list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))

  const remove = (item) => {
    const index = items.findIndex((i) => i.id === item.id)
    update((list) => list.filter((i) => i.id !== item.id))
    notify(`“${item.text}” removido`, {
      actionLabel: 'Desfazer',
      onAction: () => update((list) => (list.some((i) => i.id === item.id) ? list : [...list.slice(0, index), item, ...list.slice(index)]))
    })
  }

  const add = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) {
      setErr('Escreva o item.')
      return
    }
    if (t.length > 120) {
      setErr('Máximo de 120 caracteres.')
      return
    }
    if (items.some((i) => i.text.toLocaleLowerCase('pt-BR') === t.toLocaleLowerCase('pt-BR'))) {
      setErr('Esse item já está na lista.')
      return
    }
    update((list) => [...list, { id: newId(), text: t, done: false }])
    setText('')
    setErr(null)
  }

  const missing = DEFAULT_CHECKLIST.filter((t) => !items.some((i) => i.text === t))
  const restore = () => update((list) => [...list, ...missing.map((t) => ({ id: newId(), text: t, done: false }))])

  return (
    <div className="card checklist">
      <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>
        {items.length ? `${done} de ${items.length} ${items.length === 1 ? 'item feito' : 'itens feitos'}` : 'Lista vazia'}
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={i.done} onChange={() => toggle(i.id)} />
              <span>{i.text}</span>
            </label>
            <button type="button" className="mini-btn" onClick={() => remove(i)} aria-label={`Remover “${i.text}”`}><IconX /></button>
          </li>
        ))}
      </ul>
      <form className="add-row" onSubmit={add}>
        <input className="input" value={text} onChange={(e) => { setText(e.target.value); setErr(null) }} placeholder="Novo item" aria-label="Novo item do checklist" aria-invalid={err ? 'true' : 'false'} maxLength={140} />
        <button type="submit" className="btn btn-dark" aria-label="Adicionar item"><IconPlus /></button>
      </form>
      {err && <div className="err" role="alert">{err}</div>}
      {missing.length > 0 && (
        <button type="button" className="link-btn" onClick={restore}>Adicionar sugestões que faltam ({missing.length})</button>
      )}
    </div>
  )
}
