import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-256.png'],
      manifest: {
        name: 'PaceOn',
        short_name: 'PaceOn',
        description: 'Calendário de provas, inscrições e resultados',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#17152F',
        theme_color: '#FF5F24',
        shortcuts: [
          { name: 'Nova corrida', short_name: 'Nova corrida', url: '/corridas/nova', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Registrar resultado', short_name: 'Resultado', url: '/corridas?concluir=1', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Próxima prova', short_name: 'Próxima', url: '/proxima', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Treinos', short_name: 'Treinos', url: '/treinos', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] }
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /^\/agenda\//], importScripts: ['push-sw.js'] }
    })
  ],
  test: { environment: 'node' }
})
