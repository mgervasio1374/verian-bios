import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { captureInboundReply, type NormalizedInboundReply } from '@/modules/messaging/inbound/inbound-reply.service'
import type { InboundReplyHeaders } from '@/modules/messaging/inbound/inbound-reply-classify'

// MCM v2 — Inbound Reply Capture (P3.5).
// prospect replies → reply@<capture-subdomain> (Resend Inbound, MX) → POST here.
// Transport/MX wiring is ops, not code: this endpoint is provider-agnostic and
// accepts a normalized JSON payload, so any inbound transport can feed it.
//
// Auth: shared-secret header (constant-time compare). Upgradeable to
// Standard-Webhooks HMAC if Resend Inbound starts signing inbound deliveries
// (the outbound /api/webhooks/resend route already does HMAC verification).
//
// Always returns 200 once authenticated — never throws to the caller, so a
// processing bug cannot trigger provider retry storms. Auth/parse failures are
// the only non-200 responses.

interface InboundEmailPayload {
  from?: string
  to?: string
  subject?: string
  text?: string
  headers?: {
    message_id?: string
    in_reply_to?: string
    references?: string
    auto_submitted?: string
    x_autoreply?: string
    precedence?: string
  }
  received_at?: string
}

// Constant-time secret comparison. Returns false on any length mismatch or
// missing value without leaking timing information.
function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const headersList = await headers()

  // ---- Auth: shared secret (constant-time) ----
  const provided = headersList.get('x-inbound-secret')
  if (!secretMatches(provided, process.env.INBOUND_EMAIL_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ---- Parse ----
  let payload: InboundEmailPayload
  try {
    payload = (await req.json()) as InboundEmailPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ---- Validate ----
  if (!payload.from || typeof payload.from !== 'string') {
    return NextResponse.json({ error: 'Missing required field: from' }, { status: 400 })
  }

  const replyHeaders: InboundReplyHeaders = {
    message_id:     payload.headers?.message_id     ?? null,
    in_reply_to:    payload.headers?.in_reply_to    ?? null,
    references:     payload.headers?.references      ?? null,
    auto_submitted: payload.headers?.auto_submitted ?? null,
    x_autoreply:    payload.headers?.x_autoreply    ?? null,
    precedence:     payload.headers?.precedence     ?? null,
  }

  const normalized: NormalizedInboundReply = {
    from:       payload.from,
    to:         payload.to ?? null,
    subject:    payload.subject ?? null,
    text:       payload.text ?? null,
    headers:    replyHeaders,
    receivedAt: payload.received_at ?? new Date().toISOString(),
  }

  // ---- Process inline (no Inngest this slice). Always 200. ----
  try {
    const result = await captureInboundReply(normalized)
    return NextResponse.json({ received: true, status: result.status })
  } catch (err) {
    console.error('[inbound-email] capture error:', err instanceof Error ? err.message : String(err))
    // Do NOT return 500 — the provider would retry. The reply is best-effort.
    return NextResponse.json({ received: true, status: 'error' })
  }
}
