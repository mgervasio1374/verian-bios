import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
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
// Durability contract: the RAW payload is written to the webhook_events ledger
// (source 'inbound_email') BEFORE any processing. A processing failure records
// error_message and leaves the row unprocessed (replayable via the partial
// index on processed=false) — then still returns 200 so the provider doesn't
// retry-storm an app bug. Only a failure to persist the ledger row itself
// returns 500: at that point provider retry is the only durability we have.
// Auth/parse failures are rejected before the ledger (provider-side errors).

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

  // ---- Durable ledger write BEFORE processing ----
  // The raw payload must survive any downstream bug. If this insert fails we
  // return 500 (provider retry is then the only copy of the message).
  const supabase = createSupabaseServiceClient()
  const { data: ledgerRow, error: ledgerError } = await supabase
    .from('webhook_events')
    .insert({
      source:     'inbound_email',
      event_type: 'email.inbound',
      headers:    { ...replyHeaders },
      payload:    payload as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (ledgerError || !ledgerRow?.id) {
    console.error('[inbound-email] ledger write failed:', ledgerError?.message ?? 'no row returned')
    return NextResponse.json({ error: 'Failed to persist inbound message' }, { status: 500 })
  }

  // ---- Process inline (no Inngest this slice). Always 200 past this point. ----
  try {
    const result = await captureInboundReply(normalized)
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', ledgerRow.id)
    return NextResponse.json({ received: true, status: result.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[inbound-email] capture error:', message)
    // Record the failure on the ledger row; it stays processed=false → replayable.
    await supabase
      .from('webhook_events')
      .update({ error_message: message })
      .eq('id', ledgerRow.id)
      .then(() => {}, () => {}) // best-effort; the raw payload is already safe
    // Do NOT return 500 — the provider would retry and re-hit the same app bug.
    return NextResponse.json({ received: true, status: 'error' })
  }
}
