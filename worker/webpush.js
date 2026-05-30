// Web Push (VAPID + aes128gcm) を Cloudflare Workers の Web Crypto だけで実装。
// 参考仕様: RFC 8291 (Message Encryption), RFC 8188 (aes128gcm), VAPID (RFC 8292)

const VAPID_SUBJECT = 'mailto:takaakitakaaki0220@gmail.com'

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

function bytesToB64url(u8) {
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...arrs) {
  const len = arrs.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBytes))
}

// VAPID JWT (ES256) を生成
async function createVapidJWT(audience, privateJwk) {
  const enc = (obj) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)))
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  }
  const unsigned = `${enc(header)}.${enc(payload)}`
  const key = await crypto.subtle.importKey(
    'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)),
  )
  return `${unsigned}.${bytesToB64url(sig)}`
}

// 通知ペイロードを aes128gcm で暗号化（単一レコード）
async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh) // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth) // 16 bytes

  // サーバー側の使い捨て ECDH 鍵ペア
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)) // 65 bytes
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const te = new TextEncoder()

  // RFC 8291: 認証シークレットと ECDH から IKM を導出
  const prkCombine = await hmacSha256(authSecret, ecdh)
  const keyInfo = concat(te.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic)
  const ikm = (await hmacSha256(prkCombine, concat(keyInfo, new Uint8Array([1])))).slice(0, 32)

  // RFC 8188: CEK と nonce を導出
  const prk = await hmacSha256(salt, ikm)
  const cekInfo = concat(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0]))
  const cek = (await hmacSha256(prk, concat(cekInfo, new Uint8Array([1])))).slice(0, 16)
  const nonceInfo = concat(te.encode('Content-Encoding: nonce'), new Uint8Array([0]))
  const nonce = (await hmacSha256(prk, concat(nonceInfo, new Uint8Array([1])))).slice(0, 12)

  // 平文 + 0x02（最終レコード区切り）を AES-128-GCM で暗号化
  const record = concat(plaintext, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record),
  )

  // ボディ: salt(16) | rs(4=4096) | idlen(1=65) | as_public(65) | ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0x00])
  const idlen = new Uint8Array([asPublic.length])
  return concat(salt, rs, idlen, asPublic, ciphertext)
}

// 1件の購読にプッシュ送信。戻り値は fetch の Response。
export async function sendPush(subscription, payloadObj, env) {
  const body = await encryptPayload(subscription, new TextEncoder().encode(JSON.stringify(payloadObj)))
  const audience = new URL(subscription.endpoint).origin
  const jwt = await createVapidJWT(audience, JSON.parse(env.VAPID_PRIVATE_JWK))
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  })
}
