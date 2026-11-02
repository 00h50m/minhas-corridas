import { formatDuration, parseDuration } from '../lib/format.js'

/**
 * Campo de tempo que funciona com o teclado numérico do celular (sem ":").
 * Mostra como o tempo foi entendido e formata ao sair do campo.
 */
export default function TimeInput({ id, value, onChange, invalid, placeholder = 'só números', autoFocus }) {
  const sec = parseDuration(value)
  const pretty = sec != null ? formatDuration(sec) : null
  const showPreview = value && pretty && pretty !== String(value).trim()
  return (
    <>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => pretty && pretty !== value && onChange(pretty)}
        aria-invalid={invalid ? 'true' : 'false'}
        aria-describedby={showPreview ? `${id}-preview` : undefined}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {showPreview && <div id={`${id}-preview`} className="time-preview" aria-live="polite">= {pretty}</div>}
    </>
  )
}
