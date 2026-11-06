// Gera os ícones do app a partir da arte original da marca (brand/paceon-original.png).
// Uso: node scripts/icons.mjs
import sharp from 'sharp'

const SRC = 'brand/paceon-original.png'
const BOX = { left: 28, top: 35, width: 1187, height: 1182 } // quadrado arredondado, sem o fundo preto
const NAVY = '#17152F'
const S = 1024
const R = Math.round(S * 0.262) // raio dos cantos da arte

const mask = (size, r) => Buffer.from(`<svg width="${size}" height="${size}"><rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${r}" ry="${r}" fill="#fff"/></svg>`)

// 1) Arte com cantos transparentes, 1024 px
const art = await sharp(SRC).extract(BOX).resize(S, S, { fit: 'fill' }).ensureAlpha()
  .composite([{ input: mask(S, R), blend: 'dest-in' }]).png().toBuffer()
// (a arte intermediária não é salva: dá para regerar daqui)

// 2) Ícones "any" (Android/computador): com cantos transparentes
await sharp(art).resize(512, 512).png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/icon-512.png')
await sharp(art).resize(192, 192).png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/icon-192.png')
await sharp(art).resize(64, 64).png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/favicon.png')
// Logo usada dentro do app (topo e card de compartilhar)
await sharp(art).resize(256, 256).png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/logo-256.png')

// Arte sem os cantos arredondados (ampliada 8% e cortada no centro), para ícones de borda a borda
const fullBleed = async (size) => {
  const big = Math.round(size * 1.08)
  const off = Math.round((big - size) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: await sharp(art).resize(big, big).extract({ left: off, top: off, width: size, height: size }).toBuffer() }])
    .flatten({ background: NAVY }).png().toBuffer()
}

// 3) Maskable (o Android recorta em círculo ou outra forma): o conteúdo fica na área segura
//    (círculo de 80%), sobre a mesma arte desfocada, com borda suave para não aparecer emenda.
{
  const size = 512
  const inner = Math.round(size * 0.84)
  const feather = Buffer.from(`<svg width="${inner}" height="${inner}"><rect x="14" y="14" width="${inner - 28}" height="${inner - 28}" rx="60" fill="#fff"/></svg>`)
  const fg = await sharp(await fullBleed(inner)).ensureAlpha()
    .composite([{ input: await sharp(feather).blur(10).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer()
  await sharp(await sharp(await fullBleed(size)).blur(70).toBuffer())
    .composite([{ input: fg, gravity: 'center' }])
    .png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/icon-maskable-512.png')
}

// 4) iPhone (opaco; o iOS arredonda sozinho)
await sharp(await fullBleed(180)).png({ palette: true, quality: 92, dither: 1, compressionLevel: 9 }).toFile('public/apple-touch-icon.png')

console.log('Ícones gerados.')
