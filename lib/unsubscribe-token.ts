import { createHmac, timingSafeEqual } from 'node:crypto'

// Signed, stateless unsubscribe token for CAN-SPAM one-click opt-out.
//
// Format:  base64url(JSON{t,e}) + "." + base64url(HMAC-SHA256(secret, payload))
// The email is lowercased before signing so verification is case-insensitive.
// No expiry — an unsubscribe link must keep working indefinitely.
//
// The secret is read from UNSUBSCRIBE_TOKEN_SECRET at call time (not module load),
// so deployments can drop the value in without a rebuild. When the secret is unset,
// signing returns '' (callers fall back to a mailto opt-out) and verifying returns
// null (no token can be trusted without a configured secret).

interface UnsubscribePayload {
  t: string // tenantId
  e: string // email (lowercased)
}

function getSecret(): string | null {
  const s = process.env.UNSUBSCRIBE_TOKEN_SECRET
  return s && s.length > 0 ? s : null
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url')
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function signUnsubscribeToken(tenantId: string, email: string): string {
  const secret = getSecret()
  if (!secret) return ''

  const payload: UnsubscribePayload = { t: tenantId, e: email.toLowerCase() }
  const payloadB64 = b64url(JSON.stringify(payload))
  const sig = sign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

export function verifyUnsubscribeToken(
  token: string
): { tenantId: string; email: string } | null {
  const secret = getSecret()
  if (!secret) return null
  if (!token || typeof token !== 'string') return null

  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null

  const payloadB64 = token.slice(0, dot)
  const providedSig = token.slice(dot + 1)
  const expectedSig = sign(payloadB64, secret)

  // Constant-time compare — equal length required by timingSafeEqual.
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as UnsubscribePayload
    if (!decoded || typeof decoded.t !== 'string' || typeof decoded.e !== 'string') return null
    if (!decoded.t || !decoded.e) return null
    return { tenantId: decoded.t, email: decoded.e.toLowerCase() }
  } catch {
    return null
  }
}
