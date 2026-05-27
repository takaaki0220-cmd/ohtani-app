import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: '大谷翔平 リアルタイム成績',
        short_name: '大谷成績',
        description: 'MLB Stats API を使った大谷翔平の成績・ランキング表示',
        theme_color: '#005A9C',
        background_color: '#005A9C',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ja',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // index.html と静的アセットを先読みキャッシュ
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // MLB API のレスポンスをネットワーク優先でキャッシュ
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://statsapi.mlb.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-stats-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 30 }, // 30分
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
