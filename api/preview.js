// Função do Vercel: lê UMA página de inscrição indicada pela usuária e devolve só os campos sugeridos.
// Proteções: só http/https, bloqueia endereços internos (inclusive após redirecionamentos),
// limite de tempo e de tamanho, e nunca devolve o HTML bruto.
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { parseRacePage } from '../src/lib/pageParse.js'

const MAX_BYTES = 2_000_000
const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

export async function assertPublicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    throw Object.assign(new Error('Link inválido.'), { status: 400 })
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Use um link http ou https.'), { status: 400 })
  if (u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw Object.assign(new Error('Link não permitido.'), { status: 400 })
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw Object.assign(new Error('Link não permitido.'), { status: 400 })
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw Object.assign(new Error('Não encontrei esse site.'), { status: 422 })
  if (addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error('Link não permitido.'), { status: 400 })
  return u
}

async function fetchPage(raw) {
  let url = await assertPublicUrl(raw)
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; PaceOn/1.0; app pessoal)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9' }
      })
    } catch {
      clearTimeout(timer)
      throw Object.assign(new Error('O site não respondeu a tempo.'), { status: 504 })
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer)
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString())
      continue
    }
    if (!res.ok) {
      clearTimeout(timer)
      throw Object.assign(new Error(`O site respondeu com erro (${res.status}).`), { status: 502 })
    }
    if (!/html/i.test(res.headers.get('content-type') ?? '')) {
      clearTimeout(timer)
      throw Object.assign(new Error('O link não é uma página da web.'), { status: 422 })
    }
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_BYTES) {
          ctrl.abort()
          break
        }
        chunks.push(value)
      }
    } finally {
      clearTimeout(timer)
    }
    return { html: new TextDecoder('utf-8').decode(Buffer.concat(chunks)), finalUrl: url.toString() }
  }
  throw Object.assign(new Error('Redirecionamentos demais.'), { status: 502 })
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' })
  const raw = String(req.query?.url ?? '').trim()
  if (!raw || raw.length > 2000) return res.status(400).json({ error: 'Informe o link.' })
  try {
    const { html, finalUrl } = await fetchPage(raw)
    const { fields, sources } = parseRacePage(html, raw)
    return res.status(200).json({ fields, sources, finalUrl })
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível ler a página.' })
  }
}
