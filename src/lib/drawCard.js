// Desenha o card de resultado num <canvas> (só no navegador). Conteúdo vem de shareCardInfo().
const DISPLAY = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif'
const TEXT = '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
const BRAND = '#FF5F24'
const HERO = '#17152F'
const CREAM = '#FFF4EC'

let logo = null

/** Fontes e logo do card (o logo é opcional: sem ele, só o nome). */
export async function loadCardFonts() {
  const img = new Image()
  img.src = '/logo-256.png'
  const logoReady = img.decode().then(() => (logo = img)).catch(() => {})
  if (!document.fonts?.load) return logoReady
  await Promise.all([
    logoReady,
    document.fonts.load(`800 100px "Barlow Condensed"`),
    document.fonts.load(`700 100px "Barlow Condensed"`),
    document.fonts.load(`800 40px "Nunito Sans"`),
    document.fonts.load(`700 40px "Nunito Sans"`)
  ]).catch(() => {})
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxW || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    kept[maxLines - 1] = last.trimEnd() + '…'
    return kept
  }
  return lines
}

/** Ajusta o tamanho da fonte para caber na largura. */
function fit(ctx, text, font, size, maxW, min = 40) {
  let s = size
  ctx.font = font(s)
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 4
    ctx.font = font(s)
  }
  return s
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCover(ctx, img, W, H) {
  const s = Math.max(W / img.width, H / img.height)
  const w = img.width * s
  const h = img.height * s
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
}

function background(ctx, W, H, photo) {
  if (photo) {
    drawCover(ctx, photo, W, H)
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(18,17,31,0.55)')
    g.addColorStop(0.35, 'rgba(18,17,31,0.25)')
    g.addColorStop(0.6, 'rgba(18,17,31,0.7)')
    g.addColorStop(1, 'rgba(18,17,31,0.92)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    return
  }
  ctx.fillStyle = HERO
  ctx.fillRect(0, 0, W, H)
  // Traçado decorativo, como a arte do app.
  ctx.save()
  ctx.globalAlpha = 0.32
  ctx.strokeStyle = BRAND
  ctx.lineWidth = 34
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-60, H * 0.5)
  ctx.bezierCurveTo(W * 0.3, H * 0.5, W * 0.35, H * 0.16, W * 0.62, H * 0.2)
  ctx.bezierCurveTo(W * 0.85, H * 0.23, W * 0.88, H * 0.36, W + 60, H * 0.31)
  ctx.stroke()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = CREAM
  ctx.beginPath()
  ctx.arc(W * 0.9, H * 0.08, W * 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function splitBars(ctx, secs, x, y, w, h) {
  const min = Math.min(...secs)
  const max = Math.max(...secs)
  const n = secs.length
  const gap = n > 30 ? 3 : n > 15 ? 6 : 10
  const bw = (w - gap * (n - 1)) / n
  const iFast = secs.indexOf(min)
  for (let i = 0; i < n; i++) {
    // Mais rápido = barra mais alta. Altura mínima de 30% para leitura.
    const t = max === min ? 1 : (max - secs[i]) / (max - min)
    const bh = h * (0.3 + 0.7 * t)
    ctx.fillStyle = i === iFast ? BRAND : 'rgba(255,244,236,0.55)'
    roundRect(ctx, x + i * (bw + gap), y + h - bh, bw, bh, Math.min(8, bw / 2))
    ctx.fill()
  }
}

/**
 * Desenha `info` (de shareCardInfo) em `canvas` no formato { w, h }. `photo`: ImageBitmap opcional.
 */
export function drawCard(canvas, info, format, photo = null) {
  const W = format.w
  const H = format.h
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const pad = 84
  const inner = W - pad * 2
  background(ctx, W, H, photo)
  ctx.textBaseline = 'alphabetic'

  // Topo: marca do app (logo + PACEON), data e local
  let y = pad + (H > 1500 ? 80 : 0)
  if (logo) {
    ctx.save()
    roundRect(ctx, pad, y, 54, 54, 14)
    ctx.clip()
    ctx.drawImage(logo, pad, y, 54, 54)
    ctx.restore()
  }
  const bx = logo ? pad + 70 : pad
  ctx.font = `italic 800 34px ${TEXT}`
  ctx.fillStyle = '#fff'
  ctx.fillText('PACE', bx, y + 40)
  ctx.fillStyle = BRAND
  ctx.fillText('ON', bx + ctx.measureText('PACE').width, y + 40)
  if (info.athlete) {
    const brandEnd = bx + ctx.measureText('PACEON').width + 30
    ctx.textAlign = 'right'
    ctx.fillStyle = CREAM
    fit(ctx, info.athlete, (n) => `800 ${n}px ${TEXT}`, 32, W - pad - brandEnd, 20)
    ctx.fillText(info.athlete, W - pad, y + 39)
    ctx.textAlign = 'left'
  }
  y += 54 + 56
  const meta = [info.date, info.place].filter(Boolean).join('  ·  ')
  if (meta) {
    ctx.fillStyle = 'rgba(255,244,236,0.82)'
    ctx.font = `700 34px ${TEXT}`
    ctx.fillText(meta, pad, y)
    y += 24
  }

  // Nome da prova
  // Nome: tenta caber em 2 linhas diminuindo a fonte; nomes muito longos vão para 3 (e só então “…”).
  const upper = info.name.toUpperCase()
  let nSize = 84
  let nameLines
  for (const size of [84, 74, 64]) {
    nSize = size
    ctx.font = `800 ${size}px ${DISPLAY}`
    nameLines = wrap(ctx, upper, inner, 2)
    if (!nameLines.at(-1).endsWith('…')) break
  }
  if (nameLines.at(-1).endsWith('…')) nameLines = wrap(ctx, upper, inner, H > 1100 ? 3 : 2)
  ctx.fillStyle = '#fff'
  for (const l of nameLines) {
    y += nSize + 2
    ctx.fillText(l, pad, y)
  }

  // Bloco de baixo, ancorado no rodapé
  const bottom = H - pad - (H > 1500 ? 110 : 0)
  let by = bottom

  const splitsH = info.splits && H >= 1300 ? 150 : 0
  if (splitsH) {
    splitBars(ctx, info.splits, pad, by - splitsH, inner, splitsH)
    by -= splitsH + 22
    ctx.fillStyle = 'rgba(255,244,236,0.75)'
    ctx.font = `800 24px ${TEXT}`
    ctx.fillText(`PARCIAIS POR KM  ·  ${info.splits.length} KM`, pad, by)
    by -= 54
  }

  // Estatísticas
  if (info.stats.length) {
    const colW = inner / info.stats.length
    info.stats.forEach((s, i) => {
      const x = pad + i * colW
      ctx.fillStyle = '#fff'
      fit(ctx, s.value, (n) => `800 ${n}px ${DISPLAY}`, 76, colW - 20, 44)
      ctx.fillText(s.value, x, by)
      ctx.fillStyle = 'rgba(255,244,236,0.7)'
      ctx.font = `800 22px ${TEXT}`
      ctx.fillText(s.label, x, by - 84)
    })
    by -= 84 + 62
  }

  // Tempo
  ctx.fillStyle = '#fff'
  const tSize = fit(ctx, info.time, (n) => `800 ${n}px ${DISPLAY}`, H > 1500 ? 300 : H > 1200 ? 250 : 210, inner, 120)
  ctx.fillText(info.time, pad - tSize * 0.02, by)
  by -= tSize * 0.78 + 26
  ctx.fillStyle = 'rgba(255,244,236,0.75)'
  ctx.font = `800 26px ${TEXT}`
  ctx.fillText(info.timeLabel, pad, by)
  by -= 54

  // Distância
  ctx.fillStyle = BRAND
  const dSize = fit(ctx, info.distance, (n) => `800 ${n}px ${DISPLAY}`, H > 1200 ? 110 : 92, inner, 60)
  ctx.fillText(info.distance, pad, by)
  by -= dSize * 0.75 + 26

  // Selos (acima da distância, se houver espaço até o nome)
  if (info.badges.length) {
    ctx.font = `800 30px ${TEXT}`
    let x = pad
    const bh = 58
    const top = by - bh
    if (top > y + 12) {
      for (const b of info.badges) {
        const label = b.label.toUpperCase()
        const w = ctx.measureText(label).width + 44
        if (x + w > W - pad) break
        ctx.fillStyle = b.id === 'recorde' || b.id === 'primeira' ? BRAND : 'rgba(255,244,236,0.16)'
        roundRect(ctx, x, top, w, bh, bh / 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(label, x + 22, top + 40)
        x += w + 14
      }
    }
  }
  return canvas
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'))
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * Card da retrospectiva do ano. `data`: { year, athlete, stats: [{ value, label }] (até 4),
 * highlight: { title, line } | null, months: [12], footer: string }.
 */
export function drawYearCard(canvas, data, format) {
  const W = format.w
  const H = format.h
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const pad = 84
  const inner = W - pad * 2
  background(ctx, W, H, null)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Marca e nome
  let y = pad + (H > 1500 ? 80 : 0)
  if (logo) {
    ctx.save()
    roundRect(ctx, pad, y, 54, 54, 14)
    ctx.clip()
    ctx.drawImage(logo, pad, y, 54, 54)
    ctx.restore()
  }
  const bx = logo ? pad + 70 : pad
  ctx.font = `italic 800 34px ${TEXT}`
  ctx.fillStyle = '#fff'
  ctx.fillText('PACE', bx, y + 40)
  ctx.fillStyle = BRAND
  ctx.fillText('ON', bx + ctx.measureText('PACE').width, y + 40)
  if (data.athlete) {
    ctx.textAlign = 'right'
    ctx.fillStyle = CREAM
    fit(ctx, data.athlete, (n) => `800 ${n}px ${TEXT}`, 32, inner - 300, 20)
    ctx.fillText(data.athlete, W - pad, y + 39)
    ctx.textAlign = 'left'
  }
  y += 54 + 90

  // Título
  ctx.fillStyle = 'rgba(255,244,236,0.8)'
  ctx.font = `800 34px ${TEXT}`
  ctx.fillText('RETROSPECTIVA', pad, y)
  y += 20 + (H > 1200 ? 200 : 170)
  ctx.fillStyle = BRAND
  ctx.font = `800 ${H > 1200 ? 230 : 190}px ${DISPLAY}`
  ctx.fillText(String(data.year), pad - 6, y)
  y += 40

  // Números (grade 2×2)
  const cols = 2
  const cellW = inner / cols
  const cellH = H > 1500 ? 210 : H > 1200 ? 185 : 150
  data.stats.slice(0, 4).forEach((s, i) => {
    const cx = pad + (i % cols) * cellW
    const cy = y + Math.floor(i / cols) * cellH
    ctx.fillStyle = '#fff'
    fit(ctx, s.value, (n) => `800 ${n}px ${DISPLAY}`, H > 1200 ? 110 : 92, cellW - 24, 50)
    ctx.fillText(s.value, cx, cy + (H > 1200 ? 100 : 84))
    ctx.fillStyle = 'rgba(255,244,236,0.72)'
    ctx.font = `800 26px ${TEXT}`
    ctx.fillText(s.label.toUpperCase(), cx, cy + (H > 1200 ? 140 : 118))
  })
  y += Math.ceil(Math.min(4, data.stats.length) / cols) * cellH + 10

  // Destaque
  if (data.highlight && H > 1100) {
    ctx.fillStyle = 'rgba(255,244,236,0.1)'
    roundRect(ctx, pad, y, inner, 150, 26)
    ctx.fill()
    ctx.fillStyle = BRAND
    ctx.font = `800 24px ${TEXT}`
    ctx.fillText(data.highlight.title.toUpperCase(), pad + 30, y + 46)
    ctx.fillStyle = '#fff'
    ctx.font = `800 40px ${TEXT}`
    const line = wrap(ctx, data.highlight.line, inner - 60, 2)
    line.forEach((l, i) => ctx.fillText(l, pad + 30, y + 96 + i * 44))
    y += 150 + 40
  }

  // Provas por mês
  const bottom = H - pad - (H > 1500 ? 110 : 0)
  const chartH = Math.max(90, Math.min(220, bottom - y - 60))
  const maxM = Math.max(1, ...data.months)
  const gap = 14
  const bw = (inner - gap * 11) / 12
  data.months.forEach((n, i) => {
    const h = n ? Math.max(14, (n / maxM) * (chartH - 30)) : 6
    ctx.fillStyle = n === maxM && n > 0 ? BRAND : n ? 'rgba(255,244,236,0.6)' : 'rgba(255,244,236,0.15)'
    roundRect(ctx, pad + i * (bw + gap), bottom - 40 - h, bw, h, Math.min(8, bw / 2))
    ctx.fill()
    ctx.fillStyle = 'rgba(255,244,236,0.7)'
    ctx.font = `800 22px ${TEXT}`
    ctx.textAlign = 'center'
    ctx.fillText(MONTHS[i], pad + i * (bw + gap) + bw / 2, bottom)
    ctx.textAlign = 'left'
  })
  if (data.footer) {
    ctx.fillStyle = 'rgba(255,244,236,0.75)'
    ctx.font = `800 24px ${TEXT}`
    ctx.fillText(data.footer.toUpperCase(), pad, bottom - 40 - chartH - 12)
  }
  return canvas
}
