// Encontra um município brasileiro nas palavras do link (ex.: ".../corrida-encantada-itupeva-2026" → Itupeva/SP).
// Lista oficial do IBGE (src/data/municipios.json). Usado só no servidor e nos testes.
import data from '../data/municipios.json' with { type: 'json' }

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Nomes de cidade que também são palavras comuns em nomes de provas: só valem com outras palavras do nome da cidade.
const AMBIGUOUS = new Set(['natal', 'vitoria', 'esperanca', 'alegre', 'alegria', 'bonito', 'paraiso', 'liberdade', 'uniao', 'independencia', 'triunfo', 'saudade', 'saudades', 'aurora', 'harmonia', 'progresso', 'cristal', 'diamante', 'colorado', 'encantado', 'sucesso', 'fortaleza', 'jardim', 'marilia', 'iracema', 'bela vista', 'boa vista', 'santa rita', 'sao joao', 'sao jose', 'campo', 'serra', 'ponte', 'porto', 'rio', 'mar', 'lagoa', 'palmas', 'estrela', 'ouro', 'prata', 'luz', 'flores', 'morro', 'castelo', 'barra', 'guarani', 'tupi', 'parque', 'central', 'nova', 'novo'])

let index = null
function build() {
  index = new Map() // nome normalizado → [{ name, uf }]
  for (const [uf, names] of Object.entries(data)) {
    if (uf.startsWith('_')) continue
    for (const name of names) {
      const k = norm(name)
      if (!index.has(k)) index.set(k, [])
      index.get(k).push({ name, uf })
    }
  }
}

/**
 * Procura o município com mais palavras dentro da lista de palavras.
 * Retorna { city, state, states } — `state` vazio quando o nome existe em mais de uma UF.
 */
export function cityFromWords(words) {
  if (!index) build()
  const w = words.map(norm).filter(Boolean)
  let best = null
  for (let i = 0; i < w.length; i++) {
    for (let len = Math.min(6, w.length - i); len >= 1; len--) {
      const key = w.slice(i, i + len).join(' ')
      if (key.length < 4 || /^\d+$/.test(key)) continue
      const hit = index.get(key)
      if (!hit) continue
      if (AMBIGUOUS.has(key)) continue
      // Preferência: mais palavras; empate → a que aparece mais perto do fim (onde o link costuma pôr a cidade).
      if (!best || len > best.len || (len === best.len && i > best.i)) best = { len, i, hit }
      break
    }
  }
  if (!best) return null
  const ufs = [...new Set(best.hit.map((h) => h.uf))]
  return { city: best.hit[0].name, state: ufs.length === 1 ? ufs[0] : '', states: ufs }
}

/** Palavras do caminho do link (sem domínio, ids e extensão). */
export function urlWords(pageUrl) {
  try {
    return new URL(pageUrl).pathname
      .split('/')
      .map((s) => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, ''))
      .flatMap((s) => s.split(/[-_+.\s]+/))
      .filter((x) => x && !/^[0-9a-f]{8,}$/i.test(x))
  } catch {
    return []
  }
}
