import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { captureInboundReply, type NormalizedInboundReply } from '@/modules/messaging/inbound/inbound-reply.service'
import type { InboundReplyHeaders } from '@/modules/messaging/inbound/inbound-reply-classify'
import {
  fetchReceivedEmail,
  firstAddress,
  htmlToText,
  pickHeader,
} from '@/lib/resend/inbound-content'
import { readSignatureHeaders, verifyResendSignature } from '@/lib/resend/verify-webhook-signature'

// MCM v2 — Resend Inbound adapter.
//
// prospect replies → bruce@outreach.321swipe.com → Resend Inbound (MX) → POST here.
// Sibling of /api/webhooks/inbound-email, which stays provider-agnostic (shared
// secret + pre-normalized JSON). This route speaks Resend specifically: Svix
// signatures in, Resend's own payload shape, and the extra content fetch Resend
// requires (its webhook carries metadata ONLY — no body, no headers — both of
// which our matching and opt-out classification depend on).
//
// Durability contract mirrors the inbound-email route exactly:
//   • RAW webhook payload → webhook_events ledger BEFORE any processing.
//   • Ledger write failure → 500 (provider retry is then the only copy).
//   • Anything after that → 200, with failures recorded on the ledger row and
//     processed=false so they stay replayable. A non-200 would make Svix retry
//     and eventually auto-disable the endpoint — the silent failure that killed
//     delivery telemetry on 6/25.

const LEDGER_SOURCE = 'resend_inbound'
const INBOUND_EVENT = 'email.received'

interface ResendInboundWebhook {
  type?:       string
  created_at?: string
  data?: {
    email_id?:      string
    from?:          unknown
    to?:            unknown
    received_for?:  unknown
    subject?:       string
    message_id?:    string
    created_at?:    string
  }
}

export async function POST(req: NextRequest) {
  const headersList = await headers()
  const rawBody = await req.text()

  // ---- Auth: Standard Webhooks / Svix HMAC — FAIL CLOSED ----
  // A missing signing secret is a deployment misconfiguration, never a license
  // to process unsigned provider events. 503 (not 401) so Svix keeps retrying
  // while the operator fixes the environment.
  const signingSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error('[resend-inbound] RESEND_INBOUND_WEBHOOK_SECRET is not set — rejecting delivery')
    return NextResponse.json({ error: 'Webhook signing secret not configured' }, { status: 503 })
  }
  const sigHeaders = readSignatureHeaders(name => headersList.get(name))
  if (!verifyResendSignature(rawBody, sigHeaders, signingSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ---- Parse ----
  let payload: ResendInboundWebhook
  try {
    payload = JSON.parse(rawBody) as ResendInboundWebhook
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ---- Durable ledger write BEFORE processing ----
  const supabase = createSupabaseServiceClient()
  const { data: ledgerRow, error: ledgerError } = await supabase
    .from('webhook_events')
    .insert({
      source:     LEDGER_SOURCE,
      event_type: payload.type ?? 'unknown',
      headers:    { webhook_id: sigHeaders.webhookId, webhook_timestamp: sigHeaders.webhookTimestamp },
      payload:    payload as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (ledgerError || !ledgerRow?.id) {
    console.error('[resend-inbound] ledger write failed:', ledgerError?.message ?? 'no row returned')
    return NextResponse.json({ error: 'Failed to persist inbound message' }, { status: 500 })
  }
  const ledgerId = ledgerRow.id as string

  const markProcessed = async (status: string) => {
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', ledgerId)
      .then(() => {}, () => {})
    return NextResponse.json({ received: true, status })
  }

  // Leaves processed=false → replayable via the partial index.
  const markFailed = async (status: string, message: string) => {
    console.error(`[resend-inbound] ${status}:`, message)
    await supabase
      .from('webhook_events')
      .update({ error_message: message })
      .eq('id', ledgerId)
      .then(() => {}, () => {})
    return NextResponse.json({ received: true, status })
  }

  // ---- Only inbound receipts are actionable; anything else is ledgered and done ----
  if (payload.type !== INBOUND_EVENT) {
    return markProcessed('ignored')
  }

  const emailId = payload.data?.email_id
  if (!emailId) {
    return markFailed('error', 'email.received payload missing data.email_id')
  }

  // ---- Fetch the body + headers the webhook deliberately omits ----
  const fetched = await fetchReceivedEmail(emailId)
  if (!fetched.ok) {
    // Replayable: the raw webhook is safe, and the message is still retrievable
    // from Resend by email_id once the cause (key, network, rate limit) clears.
    return markFailed('retrieve_failed', fetched.error)
  }
  const content = fetched.content

  // Persist the fetched content next to the raw webhook so an unexpected
  // response shape is diagnosable from the ledger alone.
  await supabase
    .from('webhook_events')
    .update({ payload: { webhook: payload, retrieved: content.raw } as unknown as Record<string, unknown> })
    .eq('id', ledgerId)
    .then(() => {}, () => {})

  // ---- Map → NormalizedInboundReply (webhook metadata as fallback) ----
  const from = content.from ?? firstAddress(payload.data?.from)
  if (!from) {
    return markFailed('error', 'no sender address on webhook or retrieved message')
  }

  const replyHeaders: InboundReplyHeaders = {
    message_id:     pickHeader(content.headers, 'message-id')     ?? payload.data?.message_id ?? null,
    in_reply_to:    pickHeader(content.headers, 'in-reply-to')    ?? null,
    references:     pickHeader(content.headers, 'references')     ?? null,
    auto_submitted: pickHeader(content.headers, 'auto-submitted') ?? null,
    x_autoreply:    pickHeader(content.headers, 'x-autoreply')    ?? null,
    precedence:     pickHeader(content.headers, 'precedence')     ?? null,
  }

  // Prefer text; auto-replies are frequently HTML-only and opt-out
  // classification is substring-based, so approximate text still works.
  const text = content.text ?? (content.html ? htmlToText(content.html) : null)

  const normalized: NormalizedInboundReply = {
    from,
    to:         content.to ?? firstAddress(payload.data?.to) ?? firstAddress(payload.data?.received_for),
    subject:    content.subject ?? payload.data?.subject ?? null,
    text,
    headers:    replyHeaders,
    receivedAt: content.createdAt ?? payload.data?.created_at ?? payload.created_at ?? new Date().toISOString(),
  }

  // ---- Process inline. Always 200 past the ledger. ----
  try {
    const result = await captureInboundReply(normalized)
    return markProcessed(result.status)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return markFailed('error', message)
  }
}
