import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'
import crypto from 'crypto'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import * as etAttribution from '@/modules/messaging/event-tracking/event-tracking.attribution'
import * as etAudit from '@/modules/messaging/event-tracking/event-tracking.audit'

// ---- Types ----

interface ResendWebhookPayload {
  type: string
  created_at: string
  data: {
    email_id?: string
    to?: string[]
    [key: string]: unknown
  }
}

// ---- Status map ----
// Per spec: only terminal delivery states update email_sends.status.
// Opens and clicks are recorded as events but do NOT change send status
// (they cannot override 'delivered', 'bounced', etc.).

const EVENT_TO_SEND_STATUS: Record<string, string> = {
  'email.delivered':  'delivered',
  'email.bounced':    'bounced',
  'email.complained': 'complained',
  'email.failed':     'failed',
  // email.opened, email.clicked, email.delivery_delayed → no status change
}

// Phase 3B Event Tracking: Resend event type → ET_ activity type map.
// email.delivery_delayed is deliberately absent — log-only, no activity event.
const RESEND_EVENT_TO_ET_TYPE = etAttribution.RESEND_EVENT_TO_ET_TYPE

// ---- Signature verification ----
// Uses Standard Webhooks HMAC-SHA256 spec (same as Resend/svix).
// Only enforced when RESEND_WEBHOOK_SECRET is set in the environment.

function verifyResendSignature(
  body: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  secret: string
): boolean {
  try {
    // Resend secrets are prefixed with "whsec_" followed by base64
    const keyBase64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
    const keyBytes = Buffer.from(keyBase64, 'base64')

    // Signed content = msgId + "." + timestamp + "." + body
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
    const expectedSig = crypto
      .createHmac('sha256', keyBytes)
      .update(signedContent, 'utf8')
      .digest('base64')
    const expectedBuf = Buffer.from(expectedSig, 'base64')

    // Header may contain multiple signatures: "v1,<b64> v1,<b64>"
    const sigs = webhookSignature.split(' ').map(s =>
      s.startsWith('v1,') ? s.slice(3) : s
    )

    return sigs.some(sig => {
      try {
        const sigBuf = Buffer.from(sig, 'base64')
        return sigBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(sigBuf, expectedBuf)
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

// ---- Route handler ----

export async function POST(req: NextRequest) {
  const body = await req.text()
  const headersList = await headers()

  const webhookId        = headersList.get('webhook-id') ?? ''
  const webhookTimestamp = headersList.get('webhook-timestamp') ?? ''
  const webhookSignature = headersList.get('webhook-signature') ?? ''

  // Signature verification (enforced only when secret is configured)
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET
  if (signingSecret) {
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 401 })
    }

    // Reject stale webhooks (> 5 minutes old)
    const now = Math.floor(Date.now() / 1000)
    const webhookTs = parseInt(webhookTimestamp, 10)
    if (isNaN(webhookTs) || Math.abs(now - webhookTs) > 300) {
      return NextResponse.json({ error: 'Webhook timestamp out of tolerance' }, { status: 401 })
    }

    if (!verifyResendSignature(body, webhookId, webhookTimestamp, webhookSignature, signingSecret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  }

  // Parse payload
  let payload: ResendWebhookPayload
  try {
    payload = JSON.parse(body) as ResendWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // The provider_event_id is stable across retries (Webhook-Id is stable in svix/standard-webhooks).
  // Fallback: synthetic ID from message+type+time for dev/test environments without the header.
  const resendMessageId = (payload.data?.email_id as string | undefined) ?? null
  const providerEventId = webhookId
    || (resendMessageId
      ? `${resendMessageId}:${payload.type}:${payload.created_at}`
      : null)

  const supabase = createSupabaseServiceClient()

  // Record raw inbound webhook for audit trail
  const { data: webhookEventRow } = await supabase
    .from('webhook_events')
    .insert({
      source:     'resend',
      event_type: payload.type,
      headers:    Object.fromEntries(headersList.entries()),
      payload:    payload as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  // Process the event — errors are caught so Resend always gets 200
  // (Resend retries on non-2xx; we want to avoid retry storms on app bugs)
  try {
    await processResendEvent(payload, providerEventId)
  } catch (err) {
    console.error('[resend-webhook] Processing error:', {
      type:    payload.type,
      emailId: resendMessageId,
      error:   err instanceof Error ? err.message : String(err),
    })
    // Do NOT return 500 — Resend would retry and create further processing errors
  }

  // Mark webhook_event as processed (best-effort)
  if (webhookEventRow?.id) {
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', webhookEventRow.id)
  }

  return NextResponse.json({ received: true })
}

// ---- Event processing ----

async function processResendEvent(
  payload: ResendWebhookPayload,
  providerEventId: string | null
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const resendMessageId = payload.data?.email_id as string | undefined
  if (!resendMessageId) {
    // No email_id → cannot link to a send; record and exit
    console.warn('[resend-webhook] No email_id in payload, event type:', payload.type)
    return
  }

  // Find the email_send record by provider message ID.
  // Select includes metadata, workspace_id, contact_id, company_id, draft_id
  // for Phase 3B Event Tracking attribution.
  const { data: emailSend } = await supabase
    .from('email_sends')
    .select('id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata, status')
    .eq('resend_message_id', resendMessageId)
    .single()

  if (!emailSend) {
    // Unknown message ID — could be a send from a different system or stale
    console.warn('[resend-webhook] No email_send matched resend_message_id:', resendMessageId)
    return
  }

  const eventType   = payload.type
  const occurredAt  = payload.created_at ?? new Date().toISOString()

  // ---- Insert email_event (idempotent via provider_event_id) ----
  const { error: insertError } = await supabase
    .from('email_events')
    .insert({
      tenant_id:         emailSend.tenant_id,
      email_send_id:     emailSend.id,
      resend_message_id: resendMessageId,
      event_type:        eventType,
      occurred_at:       occurredAt,
      payload:           payload.data as Record<string, unknown>,
      provider_event_id: providerEventId,
    })

  if (insertError) {
    // 23505 = unique_violation on provider_event_id → duplicate webhook delivery → safe to ignore
    if (insertError.code === '23505') {
      console.log('[resend-webhook] Duplicate event ignored:', providerEventId)
      return
    }
    throw new Error(`email_events insert: ${insertError.message}`)
  }

  // Phase 3B Event Tracking: emit activity event for Phase 3B-originated sends.
  // Runs AFTER the 23505 idempotency guard — duplicate webhooks skip this block.
  // All errors are non-fatal; webhook continues to return 200.
  const sendMeta = (emailSend.metadata ?? {}) as Record<string, unknown>
  if (etAttribution.isPhase3bSend(sendMeta)) {
    const phase3bMeta = etAttribution.extractPhase3bMeta(sendMeta)
    const etType = RESEND_EVENT_TO_ET_TYPE[eventType]
    if (etType && phase3bMeta) {
      activityEventService.recordActivity({
        tenantId:     emailSend.tenant_id,
        workspaceId:  (emailSend.workspace_id as string | null) ?? undefined,
        eventType:    etType,
        entityType:   'message_version',
        entityId:     phase3bMeta.message_version_id ?? undefined,
        eventSummary: `${etType} for version ${phase3bMeta.version_label ?? '?'}`,
        leadId:       phase3bMeta.lead_id ?? undefined,
        contactId:    (emailSend.contact_id as string | null) ?? undefined,
        companyId:    (emailSend.company_id as string | null) ?? undefined,
        metadata: etAudit.buildWebhookOutcomePayload({
          etActionType:    etType,
          emailSendId:     emailSend.id,
          draftId:         (emailSend.draft_id as string | null) ?? null,
          phase3bMeta,
          resendMessageId,
          resendEventType: eventType,
          occurredAt,
        }) as unknown as Record<string, unknown>,
      }).catch(() => {})
    }
  }

  // ---- Update email_send status (terminal delivery states only) ----
  const newStatus = EVENT_TO_SEND_STATUS[eventType]
  if (newStatus) {
    await supabase
      .from('email_sends')
      .update({ status: newStatus })
      .eq('id', emailSend.id)
  }
  // email.opened, email.clicked → no status update (events are recorded above)

  // ---- Complaint → auto-unsubscribe ----
  if (eventType === 'email.complained') {
    const toEmail = Array.isArray(payload.data?.to) ? (payload.data.to[0] as string) : null
    if (toEmail) {
      await supabase
        .from('unsubscribes')
        .upsert(
          {
            tenant_id:     emailSend.tenant_id,
            email:         toEmail,
            source:        'complaint',
            email_send_id: emailSend.id,
          },
          { onConflict: 'tenant_id,email' }
        )
    }
  }
}
