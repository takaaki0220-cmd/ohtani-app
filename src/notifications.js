// プッシュ通知のクライアント側ヘルパー

export const DEFAULT_PREFS = { hr: true, start: true, pitching: true, final: true }

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function permissionState() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'default'
}

// 既存の購読があるか
export async function getExistingSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// 通知を有効化（許可要求 → 購読 → サーバー登録）
export async function enablePush(prefs) {
  if (!pushSupported()) throw new Error('この端末は通知に対応していません')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('通知が許可されませんでした')

  const reg = await navigator.serviceWorker.ready
  const vapid = await (await fetch('/api/vapid-public-key')).text()
  if (!vapid) throw new Error('サーバー設定が未完了です')

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    })
  }
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub, prefs }),
  })
  return sub
}

// 通知設定（イベント別ON/OFF）を更新
export async function savePrefs(prefs) {
  const sub = await getExistingSubscription()
  if (!sub) return
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub, prefs }),
  })
}

// 通知を無効化
export async function disablePush() {
  const sub = await getExistingSubscription()
  if (!sub) return
  await fetch('/api/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
}
