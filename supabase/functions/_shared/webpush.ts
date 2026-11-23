// Web Push utan externa bibliotek: VAPID-signering (RFC 8292) och
// meddelandekryptering aes128gcm (RFC 8291/8188) med enbart WebCrypto —
// fungerar likadant i Deno (edge functions) och Node.

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string }
export type VapidKeys = { publicKey: string; privateKey: string; subject: string }

const enc = new TextEncoder()

export function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// HKDF med en enda utdata-block (räcker för ≤ 32 byte).
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

async function vapidAuthorization(endpoint: string, vapid: VapidKeys): Promise<string> {
  const pub = b64urlToBytes(vapid.publicKey)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  // WebCrypto ger signaturen som r||s (64 byte) — precis det JWS ES256 vill ha.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${vapid.publicKey}`
}

export async function encryptPayload(sub: PushSubscriptionKeys, payload: Uint8Array, salt?: Uint8Array, asKeys?: CryptoKeyPair) {
  const uaPublic = b64urlToBytes(sub.p256dh)
  const authSecret = b64urlToBytes(sub.auth)
  const localKeys = asKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, localKeys.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(s, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(s, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // En enda post: innehåll + avgränsare 0x02 (sista posten).
  const plaintext = concat(payload, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(s, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

export type PushResult = { ok: boolean; status: number; gone: boolean; text?: string }

export async function sendWebPush(sub: PushSubscriptionKeys, data: unknown, vapid: VapidKeys, ttlSeconds = 900): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(data)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body,
  })
  const text = res.ok ? undefined : await res.text().catch(() => '')
  // 404/410 = prenumerationen finns inte längre (avinstallerad, avslagen).
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, text }
}
