// Extrai sugestões de cadastro de uma página de inscrição (HTML).
// Ordem de confiança: dados estruturados (JSON-LD schema.org Event) > metatags (Open Graph) > texto.
// Sem DOM: funciona no servidor (função do Vercel) e nos testes.
import { cityFromWords, urlWords } from './cities.js'

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const UF_NAMES = {
  acre: 'AC', alagoas: 'AL', amapá: 'AP', amazonas: 'AM', bahia: 'BA', ceará: 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES', goiás: 'GO', maranhão: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', pará: 'PA', paraíba: 'PB', paraná: 'PR', pernambuco: 'PE', piauí: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondônia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', sergipe: 'SE', tocantins: 'TO'
}
const MONTHS = { janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', Aacute: 'Á', Eacute: 'É', Ccedil: 'Ç', ordm: 'º', ordf: 'ª' }
export function decode(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
}

const clean = (s) => decode(s).replace(/\s+/g, ' ').trim()

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return null
  const c = tag.match(/content=["']([^"']*)["']/i)?.[1]
  return c ? clean(c) : null
}

function jsonLdBlocks(html) {
  const out = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()))
    } catch {
      /* bloco malformado: ignora */
    }
  }
  return out
}

function findEvent(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const e = findEvent(n)
      if (e) return e
    }
    return null
  }
  const t = [].concat(node['@type'] ?? [])
  if (t.some((x) => /Event$/i.test(String(x)))) return node
  if (node['@graph']) return findEvent(node['@graph'])
  return null
}

/** "2026-12-31T08:00:00-03:00" → { date, time } sem converter fuso (como está escrito na página). */
function splitISO(s) {
  const m = String(s ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return {}
  return { date: m[1], time: m[2] && !(m[2] === '00' && m[3] === '00') ? `${m[2]}:${m[3]}` : '' }
}

function ufFrom(s) {
  if (!s) return ''
  const t = String(s).trim()
  if (UFS.includes(t.toUpperCase())) return t.toUpperCase()
  return UF_NAMES[t.toLowerCase()] ?? ''
}

function validDate(y, m, d) {
  const dt = new Date(y, m - 1, d)
  return y >= 2000 && y <= 2100 && dt.getMonth() === m - 1 && dt.getDate() === d
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Datas no texto: 31/12/2026 ou 31 de dezembro de 2026. */
export function textDates(text) {
  const out = []
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]]
    if (validDate(y, mo, d)) out.push(iso(y, mo, d))
  }
  for (const m of text.matchAll(/\b(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/gi)) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo && validDate(+m[3], mo, +m[1])) out.push(iso(+m[3], mo, +m[1]))
  }
  return out
}

/** Distâncias citadas: "5K", "10 km", "21,1km", "meia maratona", "maratona". */
export function textDistances(text) {
  const found = new Map()
  const add = (n, w = 1) => {
    if (!(n >= 1 && n <= 100)) return
    const k = Math.round(n * 1000) / 1000
    found.set(k, (found.get(k) ?? 0) + w)
  }
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s?(km|k)\b/gi)) add(Number(m[1].replace(',', '.')))
  if (/meia[\s-]maratona/i.test(text)) add(21.1, 2)
  if (/(?<!meia[\s-])\bmaratona\b(?!\s+de\s+revezamento)/i.test(text.replace(/meia[\s-]maratona/gi, ''))) add(42.195, 1)
  // Normaliza variações: 21 / 21,0975 → 21,1 ; 42 / 42,2 → 42,195
  const norm = new Map()
  for (const [k, v] of found) {
    const n = Math.abs(k - 21.1) < 0.1 || k === 21 ? 21.1 : Math.abs(k - 42.195) < 0.1 || k === 42 ? 42.195 : k
    norm.set(n, (norm.get(n) ?? 0) + v)
  }
  return [...norm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k).sort((a, b) => a - b)
}

function visibleText(html) {
  return clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

function cityUf(text) {
  // "Jundiaí - SP", "Jundiaí/SP", "Jundiaí, SP"
  const re = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõçÁÉÍÓÚ'’-]+(?:\s(?:d[aeo]s?|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç'’-]+)){0,3})\s?(?:-|\/|,|–)\s?(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/
  const m = text.match(re)
  return m ? { city: m[1].trim(), state: m[2] } : null
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o'])

/** ".../evento/corrida-encantada-itupeva-2026" → "Corrida Encantada Itupeva 2026". */
export function nameFromUrl(pageUrl) {
  let u
  try {
    u = new URL(pageUrl)
  } catch {
    return null
  }
  const segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, ''))
  const slug = [...segs].reverse().find((s) => /[a-zà-ú]{3,}[-_][a-zà-ú0-9]/i.test(s) && !/^\d+$/.test(s))
  if (!slug) return null
  const words = slug.split(/[-_+]+/).filter(Boolean)
  if (words.length < 2) return null
  // Remove identificadores longos (ex.: ids numéricos ou hashes no fim).
  const kept = words.filter((w) => !/^[0-9a-f]{8,}$/i.test(w) && !(/^\d+$/.test(w) && w.length > 4))
  const title = kept
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : /^\d+k$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
  return title.length >= 6 ? title.slice(0, 120) : null
}

function isGenericTitle(name, pageUrl) {
  if (!name) return true
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '').split('.')[0].toLowerCase()
    const n = name.toLowerCase().replace(/\s+/g, '')
    return n.length < 6 || n.includes(host) || host.includes(n)
  } catch {
    return false
  }
}

/** "Largada às 7h", "largada: 07:30" → "07:00", "07:30". */
export function largadaTime(text) {
  const m = text.match(/largada[^0-9]{0,30}(\d{1,2})\s?(?:h|:)\s?(\d{2})?/i)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function stripSiteSuffix(title) {
  const t = clean(title)
  const parts = t.split(/\s+[|•·–—-]\s+/)
  return parts[0].length >= 6 ? parts[0] : t
}

function minPrice(offers) {
  const list = [].concat(offers ?? [])
  const prices = []
  for (const o of list) {
    for (const k of ['lowPrice', 'price']) {
      const v = Number(String(o?.[k] ?? '').replace(',', '.'))
      if (v > 0 && v < 100000) prices.push(v)
    }
  }
  return prices.length ? Math.min(...prices) : null
}

/**
 * Retorna { fields: { name, date, startTime, city, state, venueName, venueAddress, distances, fee, organizer }, sources }.
 * `sources[campo]` diz de onde veio (dados estruturados, metatag ou texto) para a interface indicar a confiança.
 */
export function parseRacePage(html, pageUrl = '') {
  const f = {}
  const src = {}
  const set = (k, v, from) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length) || f[k] != null) return
    f[k] = v
    src[k] = from
  }

  const ev = jsonLdBlocks(html).map(findEvent).find(Boolean)
  if (ev) {
    set('name', ev.name && clean(ev.name), 'estruturado')
    const { date, time } = splitISO(ev.startDate)
    set('date', date, 'estruturado')
    set('startTime', time, 'estruturado')
    const loc = [].concat(ev.location ?? [])[0]
    if (loc && typeof loc === 'object') {
      set('venueName', loc.name && clean(loc.name), 'estruturado')
      const a = loc.address
      if (typeof a === 'string') set('venueAddress', clean(a), 'estruturado')
      else if (a && typeof a === 'object') {
        set('venueAddress', clean([a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ')), 'estruturado')
        set('city', a.addressLocality && clean(a.addressLocality), 'estruturado')
        set('state', ufFrom(a.addressRegion), 'estruturado')
      }
    }
    const org = [].concat(ev.organizer ?? [])[0]
    set('organizer', org && clean(typeof org === 'string' ? org : org.name), 'estruturado')
    set('fee', minPrice(ev.offers), 'estruturado')
    if (ev.description) set('distances', textDistances(clean(ev.description)), 'estruturado')
  }

  const ogTitle = meta(html, 'og:title')
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  set('name', ogTitle ? stripSiteSuffix(ogTitle) : title ? stripSiteSuffix(title) : null, 'metatag')

  const text = visibleText(html)
  const desc = meta(html, 'og:description') ?? meta(html, 'description') ?? ''
  const all = `${f.name ?? ''} \n ${desc} \n ${text}`
  set('distances', textDistances(all), 'texto')
  const cu = cityUf(`${desc}\n${text}`)
  if (cu) {
    set('city', cu.city, 'texto')
    set('state', cu.state, 'texto')
  }
  const dates = textDates(`${desc}\n${text}`)
  set('date', dates[0], 'texto')
  set('startTime', largadaTime(text), 'texto')

  // Página montada só no navegador (sem conteúdo no HTML): aproveita o próprio link.
  if (pageUrl) set('name', nameFromUrl(pageUrl), 'link')
  // Cidade pelas palavras do link, quando a página não trouxe.
  if (pageUrl && f.city == null) {
    const c = cityFromWords(urlWords(pageUrl))
    if (c) {
      set('city', c.city, 'link')
      if (c.state) set('state', c.state, 'link')
      else if (c.states.length > 1) f.stateOptions = c.states
    }
  }
  // Título genérico do site (ex.: só "Raveli Sports") não serve como nome da prova.
  if (src.name === 'metatag' && pageUrl && isGenericTitle(f.name, pageUrl)) {
    const fromUrl = nameFromUrl(pageUrl)
    if (fromUrl) {
      f.name = fromUrl
      src.name = 'link'
    }
  }

  if (pageUrl) f.signupUrl = pageUrl
  return { fields: f, sources: src }
}
