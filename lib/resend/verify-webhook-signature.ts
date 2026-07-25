import crypto from 'crypto'

// Standard Webhooks HMAC-SHA256 verification (the spec Svix — and therefore
// Resend — signs with). Extracted here so the inbound adapter can verify with
// exactly the same logic the outbound /api/webhooks/resend route uses.
//
// NOTE: the outbound route still carries its own private copy of this function.
// It is hardened, on the critical delivery-telemetry path, and deduping it is a
// refactor for its own slice — not something to fold into an unrelated change.

export interface WebhookSignatureHeaders {
  webhookId:        string
  webhookTimestamp: string
  webhookSignature: string
}

// Resend signs via Svix, which sends svix-* headers; the Standard Webhooks
// convention names them webhook-*. The HMAC content and format are identical —
// only the header names differ — so accept either. Missing this fallback is what
// 401'd every delivery and let Svix auto-disable the endpoint on 6/25.
export function readSignatureHeaders(get: (name: string) => string | null): WebhookSignatureHeaders {
  return {
    webhookId:        get('webhook-id')        ?? get('svix-id')        ?? '',
    webhookTimestamp: get('webhook-timestamp') ?? get('svix-timestamp') ?? '',
    webhookSignature: get('webhook-signature') ?? get('svix-signature') ?? '',
  }
}

export function verifyResendSignature(
  body: string,
  headers: WebhookSignatureHeaders,
  secret: string,
): boolean {
  const { webhookId, webhookTimestamp, webhookSignature } = headers
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false
  try {
    // Resend secrets are prefixed with "whsec_" followed by base64.
    const keyBase64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
    const keyBytes  = Buffer.from(keyBase64, 'base64')

    // Signed content = msgId + "." + timestamp + "." + body
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
    const expectedSig = crypto
      .createHmac('sha256', keyBytes)
      .update(signedContent, 'utf8')
      .digest('base64')
    const expectedBuf = Buffer.from(expectedSig, 'base64')

    // Header may carry multiple signatures: "v1,<b64> v1,<b64>"
    const sigs = webhookSignature.split(' ').map(s => (s.startsWith('v1,') ? s.slice(3) : s))

    return sigs.some(sig => {
      try {
        const sigBuf = Buffer.from(sig, 'base64')
        return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}
