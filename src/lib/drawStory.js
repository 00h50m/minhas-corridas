// Desenha os stories (1080×1920) da rotina de corredora num <canvas>. Conteúdo vem de storyData.js.
import { BRAND, CREAM, DISPLAY, TEXT, background, fit, getLogo, roundRect, wrap } from './drawCard.js'

export const STORY = { w: 1080, h: 1920 }
const PAD = 90
const DIM = 'rgba(255,244,236,0.78)'
const SOFT = 'rgba(255,244,236,0.14)'

function brand(ctx, y) {
  const logo = getLogo()
  if (logo) {
    ctx.save()
    roundRect(ctx, PAD, y, 64, 64, 16)
    ctx.clip()
    ctx.drawImage(logo, PAD, y, 64, 64)
    ctx.restore()
  }
  const x = logo ? PAD + 82 : PAD
  ctx.font = `italic 800 40px ${TEXT}`
  ctx.fillStyle = '#fff'
  ctx.fillText('PACE', x, y + 47)
  ctx.fillStyle = BRAND
  ctx.fillText('ON', x + ctx.measureText('PACE').width, y + 47)
}

function title(ctx, text, sub, y) {
  ctx.fillStyle = '#fff'
  const size = fit(ctx, text.toUpperCase(), (n) => `800 ${n}px ${DISPLAY}`, 130, STORY.w - PAD * 2, 70)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(text.toUpperCase(), PAD, y)
  if (sub) {
    ctx.font = `700 38px ${TEXT}`
    ctx.fillStyle = DIM
    ctx.fillText(sub, PAD, y + 62)
  }
}

function footer(ctx, text = 'rotina de corredora · PaceOn') {
  ctx.font = `700 30px ${TEXT}`
  ctx.fillStyle = 'rgba(255,244,236,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText(text, STORY.w / 2, STORY.h - 80)
  ctx.textAlign = 'left'
}

function stat(ctx, x, y, w, value, label, color = '#fff') {
  ctx.fillStyle = color
  const size = fit(ctx, value, (n) => `800 ${n}px ${DISPLAY}`, 150, w - 50, 60)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(value, x, y)
  ctx.fillStyle = DIM
  ctx.font = `700 32px ${TEXT}`
  const lines = wrap(ctx, label, w - 10, 2)
  lines.forEach((l, i) => ctx.fillText(l, x, y + 48 + i * 38))
}

function card(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(18,17,31,0.55)'
  roundRect(ctx, x, y, w, h, 36)
  ctx.fill()
  ctx.strokeStyle = SOFT
  ctx.lineWidth = 2
  ctx.stroke()
}

/* ---------- Modelos ---------- */

function proximas(ctx, s) {
  title(ctx, s.title, s.subtitle, 420)
  let y = 560
  const rowH = Math.min(240, (STORY.h - 260 - y) / s.items.length)
  for (const it of s.items) {
    // Data
    ctx.fillStyle = it.confirmed ? BRAND : SOFT
    roundRect(ctx, PAD, y, 170, rowH - 34, 30)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = `800 30px ${TEXT}`
    ctx.fillText(it.weekday, PAD + 85, y + 48)
    ctx.font = `800 84px ${DISPLAY}`
    ctx.fillText(it.day, PAD + 85, y + 128)
    ctx.font = `800 30px ${TEXT}`
    ctx.fillText(it.month, PAD + 85, y + 166)
    ctx.textAlign = 'left'
    // Nome e linha
    const x = PAD + 206
    const w = STORY.w - PAD - x
    ctx.fillStyle = '#fff'
    ctx.font = `800 52px ${TEXT}`
    const lines = wrap(ctx, it.name, w, 2)
    lines.forEach((l, i) => ctx.fillText(l, x, y + 62 + i * 60))
    ctx.fillStyle = DIM
    ctx.font = `700 34px ${TEXT}`
    const meta = [it.line, it.days === 0 ? 'hoje' : it.days === 1 ? 'amanhã' : `em ${it.days} dias`].filter(Boolean).join(' · ')
    ctx.fillText(wrap(ctx, meta, w, 1)[0], x, y + 62 + lines.length * 60 + 4)
    y += rowH
  }
}

function temporada(ctx, s) {
  title(ctx, s.title, null, 420)
  const w = (STORY.w - PAD * 2) / 3
  s.stats.forEach((st, i) => stat(ctx, PAD + i * w, 660, w, st.value, st.label, i === 0 ? BRAND : '#fff'))
  let y = 820
  if (s.bests.length) {
    ctx.fillStyle = DIM
    ctx.font = `800 32px ${TEXT}`
    ctx.fillText('MELHORES TEMPOS NO ANO', PAD, y + 40)
    y += 70
    for (const b of s.bests) {
      card(ctx, PAD, y, STORY.w - PAD * 2, 130)
      ctx.fillStyle = '#fff'
      ctx.font = `800 46px ${TEXT}`
      ctx.fillText(b.label, PAD + 40, y + 82)
      ctx.textAlign = 'right'
      ctx.font = `800 80px ${DISPLAY}`
      ctx.fillText(b.value, STORY.w - PAD - 40, y + 92)
      ctx.textAlign = 'left'
      y += 150
    }
  }
  if (s.next) {
    y = Math.max(y + 30, 1300)
    card(ctx, PAD, y, STORY.w - PAD * 2, 300)
    ctx.fillStyle = BRAND
    ctx.font = `800 32px ${TEXT}`
    ctx.fillText(s.next.days === 0 ? 'É HOJE' : `PRÓXIMA · EM ${s.next.days} ${s.next.days === 1 ? 'DIA' : 'DIAS'}`, PAD + 40, y + 70)
    ctx.fillStyle = '#fff'
    ctx.font = `800 58px ${TEXT}`
    const lines = wrap(ctx, s.next.name, STORY.w - PAD * 2 - 80, 2)
    lines.forEach((l, i) => ctx.fillText(l, PAD + 40, y + 150 + i * 64))
    ctx.fillStyle = DIM
    ctx.font = `700 36px ${TEXT}`
    ctx.fillText(s.next.when, PAD + 40, y + 150 + lines.length * 64 + 8)
  }
}

const MARK = { feito: '✓', pulado: '–', passou: '!', hoje: '●', futuro: '○' }
function semana(ctx, s) {
  title(ctx, s.title, s.subtitle, 420)
  const n = 7
  const gap = 16
  const cw = (STORY.w - PAD * 2 - gap * (n - 1)) / n
  const y = 580
  s.days.forEach((d, i) => {
    const x = PAD + i * (cw + gap)
    ctx.fillStyle = d.state === 'feito' ? BRAND : d.state ? SOFT : 'rgba(255,244,236,0.05)'
    roundRect(ctx, x, y, cw, 230, 28)
    ctx.fill()
    if (d.today) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke() }
    ctx.textAlign = 'center'
    ctx.fillStyle = d.state === 'feito' ? '#fff' : DIM
    ctx.font = `800 26px ${TEXT}`
    ctx.fillText(d.dow, x + cw / 2, y + 50)
    ctx.fillStyle = '#fff'
    ctx.font = `800 60px ${DISPLAY}`
    ctx.fillText(d.day, x + cw / 2, y + 125)
    ctx.font = `900 44px ${TEXT}`
    ctx.fillText(d.state ? MARK[d.state] : '', x + cw / 2, y + 195)
    ctx.textAlign = 'left'
  })
  const w = (STORY.w - PAD * 2) / s.stats.length
  s.stats.forEach((st, i) => stat(ctx, PAD + i * w, 1020, w, st.value, st.label, i === 0 ? BRAND : '#fff'))
  // Barra de progresso
  const by = 1180
  ctx.fillStyle = SOFT
  roundRect(ctx, PAD, by, STORY.w - PAD * 2, 26, 13)
  ctx.fill()
  if (s.pct > 0) {
    ctx.fillStyle = BRAND
    roundRect(ctx, PAD, by, Math.max(26, (STORY.w - PAD * 2) * s.pct), 26, 13)
    ctx.fill()
  }
  if (s.streak > 0) {
    card(ctx, PAD, 1300, STORY.w - PAD * 2, 170)
    ctx.fillStyle = '#fff'
    ctx.font = `800 54px ${TEXT}`
    dot(ctx, PAD + 52, 1388, 12)
    ctx.fillText(`${s.streak} ${s.streak === 1 ? 'semana cumprida' : 'semanas seguidas'}`, PAD + 84, 1405)
  }
}

function contagem(ctx, s) {
  ctx.textAlign = 'center'
  const cx = STORY.w / 2
  if (s.lead) {
    ctx.fillStyle = DIM
    ctx.font = `800 60px ${TEXT}`
    ctx.fillText(s.lead.toUpperCase(), cx, 560)
  }
  ctx.fillStyle = BRAND
  const size = fit(ctx, s.big, (n) => `800 ${n}px ${DISPLAY}`, 520, STORY.w - PAD * 2, 200)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(s.big, cx, 560 + size * 0.86)
  let y = 560 + size * 0.86 + 20
  if (s.unit) {
    ctx.fillStyle = '#fff'
    ctx.font = `800 96px ${DISPLAY}`
    ctx.fillText(s.unit, cx, y + 90)
    y += 130
  }
  ctx.fillStyle = '#fff'
  ctx.font = `800 70px ${TEXT}`
  const lines = wrap(ctx, s.name, STORY.w - PAD * 2, 3)
  lines.forEach((l, i) => ctx.fillText(l, cx, y + 110 + i * 80))
  y += 110 + lines.length * 80
  ctx.fillStyle = DIM
  ctx.font = `700 40px ${TEXT}`
  ctx.fillText(s.when, cx, y + 10)
  if (s.line) ctx.fillText(s.line, cx, y + 66)
  if (s.goal) {
    ctx.fillStyle = BRAND
    ctx.font = `800 44px ${TEXT}`
    ctx.fillText(s.goal, cx, y + 150)
  }
  ctx.textAlign = 'left'
}

function evolucao(ctx, s) {
  title(ctx, s.title, `${s.count} ${s.count === 1 ? 'marca' : 'marcas'} · provas e testes de treino`, 420)
  const x0 = PAD + 40
  const x1 = STORY.w - PAD - 20
  const y0 = 620
  const y1 = 1120
  card(ctx, PAD, y0 - 60, STORY.w - PAD * 2, y1 - y0 + 170)
  const paces = s.points.map((p) => p.pace)
  const min = Math.min(...paces)
  const max = Math.max(...paces)
  const span = Math.max(max - min, 15)
  const x = (i) => x0 + (i * (x1 - x0)) / Math.max(1, s.points.length - 1)
  const y = (v) => y0 + ((v - min) / span) * (y1 - y0) // mais rápido = mais alto
  ctx.strokeStyle = BRAND
  ctx.lineWidth = 10
  ctx.lineJoin = 'round'
  ctx.beginPath()
  s.points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.pace)) : ctx.moveTo(x(i), y(p.pace))))
  ctx.stroke()
  s.points.forEach((p, i) => {
    ctx.fillStyle = p.kind === 'teste' ? '#2ecc71' : BRAND
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 5
    ctx.beginPath()
    if (p.kind === 'teste') { ctx.moveTo(x(i), y(p.pace) - 22); ctx.lineTo(x(i) + 22, y(p.pace)); ctx.lineTo(x(i), y(p.pace) + 22); ctx.lineTo(x(i) - 22, y(p.pace)); ctx.closePath() } else ctx.arc(x(i), y(p.pace), 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
  ctx.fillStyle = DIM
  ctx.font = `700 30px ${TEXT}`
  ctx.fillText(s.points[0].date, x0 - 10, y1 + 80)
  ctx.textAlign = 'right'
  ctx.fillText(s.points.at(-1).date, x1 + 10, y1 + 80)
  ctx.textAlign = 'left'
  const w = (STORY.w - PAD * 2) / 2
  stat(ctx, PAD, 1440, w, s.last, `pace atual (era ${s.first})`, BRAND)
  stat(ctx, PAD + w, 1440, w, s.best, 'melhor nos 5 km')
  ctx.fillStyle = '#fff'
  ctx.font = `800 46px ${TEXT}`
  ctx.fillText(s.gain, PAD, 1620)
}

function treino(ctx, s) {
  title(ctx, s.title, s.when, 420)
  ctx.fillStyle = '#fff'
  ctx.font = `800 64px ${TEXT}`
  const lines = wrap(ctx, s.name, STORY.w - PAD * 2, 2)
  lines.forEach((l, i) => ctx.fillText(l, PAD, 620 + i * 74))
  let y = 620 + lines.length * 74 + 20
  if (s.plan) {
    card(ctx, PAD, y, STORY.w - PAD * 2, 300)
    ctx.fillStyle = DIM
    ctx.font = `800 30px ${TEXT}`
    ctx.fillText('PLANEJADO', PAD + 40, y + 60)
    ctx.fillStyle = '#fff'
    ctx.font = `700 38px ${TEXT}`
    wrap(ctx, s.plan, STORY.w - PAD * 2 - 80, 4).forEach((l, i) => ctx.fillText(l, PAD + 40, y + 120 + i * 48))
    y += 380
  } else if (s.sport) {
    ctx.fillStyle = BRAND
    const size = fit(ctx, s.sport.toUpperCase(), (n) => `800 ${n}px ${DISPLAY}`, 120, STORY.w - PAD * 2, 60)
    ctx.font = `800 ${size}px ${DISPLAY}`
    ctx.fillText(s.sport.toUpperCase(), PAD, y + 110)
    y += 150
    if (s.exercises?.length) {
      card(ctx, PAD, y, STORY.w - PAD * 2, 90 + s.exercises.length * 62 + (s.setsTotal ? 50 : 0))
      ctx.fillStyle = DIM
      ctx.font = `800 30px ${TEXT}`
      ctx.fillText('EXERCÍCIOS', PAD + 40, y + 60)
      ctx.font = `700 38px ${TEXT}`
      s.exercises.forEach((e, i) => { dot(ctx, PAD + 50, y + 108 + i * 62, 9); ctx.fillStyle = '#fff'; ctx.fillText(wrap(ctx, e, STORY.w - PAD * 2 - 110, 1)[0], PAD + 76, y + 120 + i * 62) })
      if (s.setsTotal) { ctx.fillStyle = DIM; ctx.font = `700 32px ${TEXT}`; ctx.fillText(s.setsTotal, PAD + 40, y + 120 + s.exercises.length * 62) }
      y += 120 + s.exercises.length * 62 + (s.setsTotal ? 50 : 0)
    }
  }
  const w = (STORY.w - PAD * 2) / s.stats.length
  s.stats.forEach((st, i) => stat(ctx, PAD + i * w, y + 120, w, st.value, st.label, i === 0 ? BRAND : '#fff'))
  if (s.hits) {
    ctx.font = `800 48px ${TEXT}`
    ctx.fillStyle = BRAND
    ctx.fillText(s.hits, PAD, y + 330)
  }
  if (s.week) {
    card(ctx, PAD, STORY.h - 330, STORY.w - PAD * 2, 110)
    dot(ctx, PAD + 52, STORY.h - 275, 12)
    ctx.fillStyle = '#fff'
    ctx.font = `800 44px ${TEXT}`
    ctx.fillText(s.week, PAD + 84, STORY.h - 260)
  }
}

/** Medalha no estilo do app: fita e anel laranja, fundo escuro e o que foi conquistado escrito dentro. */
function medal(ctx, cx, cy, mark) {
  ctx.save()
  ctx.textAlign = 'center'
  // fita
  ctx.fillStyle = BRAND
  ctx.beginPath()
  ctx.moveTo(cx - 150, cy - 290); ctx.lineTo(cx - 50, cy - 290); ctx.lineTo(cx + 20, cy - 150); ctx.lineTo(cx - 80, cy - 150); ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(255,95,36,0.55)'
  ctx.beginPath()
  ctx.moveTo(cx + 150, cy - 290); ctx.lineTo(cx + 50, cy - 290); ctx.lineTo(cx - 20, cy - 150); ctx.lineTo(cx + 80, cy - 150); ctx.closePath(); ctx.fill()
  // disco
  ctx.fillStyle = '#231f3d'
  ctx.beginPath(); ctx.arc(cx, cy, 215, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = BRAND
  ctx.lineWidth = 22
  ctx.beginPath(); ctx.arc(cx, cy, 204, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,244,236,0.18)'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(cx, cy, 170, 0, Math.PI * 2); ctx.stroke()
  // texto
  ctx.textBaseline = 'middle'
  const big = String(mark?.big ?? '')
  ctx.fillStyle = '#fff'
  const size = fit(ctx, big, (n) => `800 ${n}px ${DISPLAY}`, 170, 280, 70)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(big, cx, cy - (mark?.small ? 18 : 0))
  if (mark?.small) {
    ctx.fillStyle = BRAND
    ctx.font = `800 40px ${TEXT}`
    ctx.fillText(String(mark.small).toUpperCase(), cx, cy + size * 0.45)
  }
  ctx.restore()
}

/** Bolinha laranja antes de uma linha de texto (no lugar de emoji). */
function dot(ctx, x, y, r = 10) {
  ctx.save()
  ctx.fillStyle = BRAND
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function resultado(ctx, s) {
  const cx = STORY.w / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = DIM
  ctx.font = `800 52px ${TEXT}`
  ctx.fillText('PROVA CONCLUÍDA', cx, 340)
  medal(ctx, cx, 730, { big: s.distance ?? 'PROVA', small: 'concluída' })
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = `800 64px ${TEXT}`
  const lines = wrap(ctx, s.name, STORY.w - PAD * 2, 2)
  lines.forEach((l, i) => ctx.fillText(l, cx, 1040 + i * 74))
  let y = 1040 + lines.length * 74
  ctx.fillStyle = DIM
  ctx.font = `700 38px ${TEXT}`
  ctx.fillText([s.when, s.line].filter(Boolean).join(' · '), cx, y + 6)
  ctx.fillStyle = BRAND
  const size = fit(ctx, s.big, (n) => `800 ${n}px ${DISPLAY}`, 200, STORY.w - PAD * 2, 90)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(s.big, cx, y + 70 + size * 0.85)
  y += 70 + size * 0.85
  if (!s.official && s.big !== 'CONCLUÍDA') {
    ctx.fillStyle = DIM
    ctx.font = `700 30px ${TEXT}`
    ctx.fillText('tempo do relógio', cx, y + 46)
    y += 30
  }
  ctx.textAlign = 'left'
  if (s.stats.length) {
    const w = (STORY.w - PAD * 2) / s.stats.length
    s.stats.forEach((st, i) => {
      const x = PAD + i * w
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      const sz = fit(ctx, st.value, (n) => `800 ${n}px ${DISPLAY}`, 96, w - 40, 50)
      ctx.font = `800 ${sz}px ${DISPLAY}`
      ctx.fillText(st.value, x + w / 2, y + 140)
      ctx.fillStyle = DIM
      ctx.font = `700 30px ${TEXT}`
      ctx.fillText(st.label, x + w / 2, y + 184)
    })
    ctx.textAlign = 'left'
    y += 200
  }
  if (s.badges.length) {
    ctx.font = `800 36px ${TEXT}`
    const chips = s.badges.map((b) => ({ b, w: ctx.measureText(b).width + 56 }))
    let row = []
    const rows = []
    let rw = 0
    for (const c of chips) {
      if (rw + c.w > STORY.w - PAD * 2 && row.length) { rows.push(row); row = []; rw = 0 }
      row.push(c); rw += c.w + 16
    }
    if (row.length) rows.push(row)
    rows.slice(0, 2).forEach((r, ri) => {
      const total = r.reduce((a, c) => a + c.w, 0) + 16 * (r.length - 1)
      let x = cx - total / 2
      const by = y + 50 + ri * 86
      for (const c of r) {
        ctx.fillStyle = BRAND
        roundRect(ctx, x, by, c.w, 68, 34)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.fillText(c.b, x + c.w / 2, by + 46)
        ctx.textAlign = 'left'
        x += c.w + 16
      }
    })
  }
}

const KIND_COLOR = { corrida: BRAND, prova: '#ffd166', forca: '#22a06b', outra: '#5b8def' }

function mes(ctx, s) {
  title(ctx, s.title, s.counts, 420)
  const cols = 7
  const gap = 12
  const cw = (STORY.w - PAD * 2 - gap * (cols - 1)) / cols
  const ch = 104
  const y0 = 600
  ctx.textAlign = 'center'
  ctx.fillStyle = DIM
  ctx.font = `800 28px ${TEXT}`
  ;['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].forEach((d, i) => ctx.fillText(d, PAD + i * (cw + gap) + cw / 2, y0 - 18))
  s.days.forEach((d, i) => {
    const k = i + s.offset
    const x = PAD + (k % cols) * (cw + gap)
    const y = y0 + Math.floor(k / cols) * (ch + gap)
    ctx.fillStyle = d.kind ? KIND_COLOR[d.kind] : 'rgba(255,244,236,0.06)'
    roundRect(ctx, x, y, cw, ch, 22)
    ctx.fill()
    if (d.today) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke() }
    ctx.fillStyle = d.kind === 'prova' ? '#3b2a00' : d.kind ? '#fff' : DIM
    ctx.font = `800 40px ${DISPLAY}`
    ctx.fillText(String(d.day), x + cw / 2, y + ch / 2 + 6)
    if (d.kind === 'prova') { ctx.strokeStyle = '#3b2a00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + cw / 2, y + ch - 18, 7, 0, Math.PI * 2); ctx.stroke() }
  })
  const rows = Math.ceil((s.days.length + s.offset) / cols)
  let y = y0 + rows * (ch + gap) + 40
  // legenda
  ctx.textAlign = 'left'
  ctx.font = `700 30px ${TEXT}`
  let lx = PAD
  for (const [k, label] of [['corrida', 'corrida'], ['prova', 'prova'], ['forca', 'força'], ['outra', 'outra']].filter(([k]) => !s.kinds || s.kinds.includes(k))) {
    ctx.fillStyle = KIND_COLOR[k]
    roundRect(ctx, lx, y - 24, 28, 28, 8)
    ctx.fill()
    ctx.fillStyle = DIM
    ctx.fillText(label, lx + 40, y)
    lx += 40 + ctx.measureText(label).width + 40
  }
  y += 150
  const w = (STORY.w - PAD * 2) / s.stats.length
  s.stats.forEach((st, i) => stat(ctx, PAD + i * w, y, w, st.value, st.label, i === 0 ? BRAND : '#fff'))
  if (s.badges.length) {
    ctx.fillStyle = '#fff'
    ctx.font = `800 36px ${TEXT}`
    s.badges.forEach((b, i) => { dot(ctx, PAD + 10, y + 148 + i * 52, 9); ctx.fillText(wrap(ctx, b, STORY.w - PAD * 2 - 34, 1)[0], PAD + 34, y + 160 + i * 52) })
  }
}

function conquista(ctx, s) {
  const cx = STORY.w / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = DIM
  ctx.font = `800 52px ${TEXT}`
  ctx.fillText((s.kicker ?? 'Conquista').toUpperCase(), cx, 430)
  medal(ctx, cx, 760, s.mark)
  // texto
  ctx.fillStyle = '#fff'
  const size = fit(ctx, s.name.toUpperCase(), (n) => `800 ${n}px ${DISPLAY}`, 130, STORY.w - PAD * 2, 70)
  ctx.font = `800 ${size}px ${DISPLAY}`
  ctx.fillText(s.name.toUpperCase(), cx, 1150)
  ctx.fillStyle = DIM
  ctx.font = `700 42px ${TEXT}`
  const lines = wrap(ctx, s.desc, STORY.w - PAD * 2, 3)
  lines.forEach((l, i) => ctx.fillText(l, cx, 1240 + i * 56))
  let y = 1240 + lines.length * 56 + 40
  ctx.fillStyle = BRAND
  ctx.font = `800 44px ${TEXT}`
  ctx.fillText(s.when, cx, y)
  if (s.line) {
    ctx.fillStyle = '#fff'
    ctx.font = `700 38px ${TEXT}`
    wrap(ctx, s.line, STORY.w - PAD * 2, 2).forEach((l, i) => ctx.fillText(l, cx, y + 64 + i * 50))
  }
  card(ctx, PAD + 120, 1600, STORY.w - PAD * 2 - 240, 110)
  ctx.fillStyle = '#fff'
  ctx.font = `800 40px ${TEXT}`
  ctx.fillText(`${s.total} ${s.total === 1 ? 'conquista' : 'conquistas'} no passaporte`, cx, 1670)
  ctx.textAlign = 'left'
}

const DRAW = { proximas, temporada, semana, contagem, evolucao, treino, conquista, resultado, mes }

/** Desenha o story `id` com o conteúdo `s` (de storyFor). photo: ImageBitmap opcional. */
export function drawStory(canvas, id, s, photo = null) {
  canvas.width = STORY.w
  canvas.height = STORY.h
  const ctx = canvas.getContext('2d')
  background(ctx, STORY.w, STORY.h, photo)
  ctx.textBaseline = 'alphabetic'
  brand(ctx, 150)
  DRAW[id](ctx, s)
  footer(ctx)
  return canvas
}
