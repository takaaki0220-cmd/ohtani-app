// カスタム Service Worker（vite-plugin-pwa injectManifest）
// プリキャッシュ + MLB API ランタイムキャッシュ + プッシュ通知ハンドラ
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// MLB Stats API はネットワーク優先（オフライン時は30分以内のキャッシュ）
registerRoute(
  ({ url }) => url.origin === 'https://statsapi.mlb.com',
  new NetworkFirst({
    cacheName: 'mlb-stats-api',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 30 })],
  }),
)

// プッシュ受信 → 通知表示
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || '大谷翔平'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 通知タップ → アプリを開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())
