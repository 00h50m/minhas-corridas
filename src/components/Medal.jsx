// Medalha do passaporte: anel na cor do app com o que foi conquistado escrito dentro ("5K · 1ª vez",
// "40 · sub 5K", "10 · provas"). Sem emoji; bloqueada fica cinza.
export default function Medal({ mark, size = '', locked = false }) {
  if (!mark) return null
  return (
    <span className={`medal ${size}${locked ? ' locked' : ''}`} aria-hidden="true">
      <b className={mark.big.length > 3 ? 'long' : ''}>{mark.big}</b>
      {mark.small && <small>{mark.small}</small>}
    </span>
  )
}
