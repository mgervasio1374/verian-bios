import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

// Ops Alerting v1 — the single path from "something broke" to "a human is told".
// Plain email via the existing Resend client, gated on ALERT_EMAIL +
// ALERT_FROM_EMAIL. Dedup is durable and serverless-safe with zero schema
// changes: every send is recorded as an OPS_ALERT_SENT activity event carrying
// metadata.alert_key, and a repeat of the same key within the throttle window
// is skipped. sendOpsAlert NEVER throws — alerting must never break the code
// path that errored.

export const ALERT_THROTTLE_MINUTES = 60

export interface SendOpsAlertInput {
  tenantId?: string
  key: string
  subject: string
  body: string
}

export type SendOpsAlertResult =
  | { sent: true }
  | { sent: false; reason: 'alerting_disabled' | 'throttled' | 'send_failed' }

export function isAlertingEnabled(): boolean {
  return Boolean(process.env.ALERT_EMAIL && process.env.ALERT_FROM_EMAIL)
}

// True when an OPS_ALERT_SENT event with this alert_key exists inside the
// throttle window. Fails OPEN (not throttled) on any query error — a duplicate
// email beats a swallowed alert.
export async function isAlertThrottled(key: string, now: Date = new Date()): Promise<boolean> {
  try {
    const supabase = createSupabaseServiceClient()
    const cutoff = new Date(now.getTime() - ALERT_THROTTLE_MINUTES * 60_000).toISOString()
    const { data, error } = await supabase
      .from('activity_events')
      .select('id')
      .eq('event_type', ActivityEventType.OPS_ALERT_SENT)
      .contains('metadata', { alert_key: key })
      .gte('occurred_at', cutoff)
      .limit(1)
    if (error) return false
    return (data ?? []).length > 0
  } catch {
    return false
  }
}

// Raw env-gated send. Returns false instead of throwing.
// The Resend client is imported lazily AFTER the env gate: its constructor
// throws without RESEND_API_KEY, and this module is reached from the
// createStructuredError chokepoint — loading it eagerly would make every
// importer (and every test) depend on Resend env/mocks.
export async function sendOpsEmail(subject: string, body: string): Promise<boolean> {
  const to = process.env.ALERT_EMAIL
  const from = process.env.ALERT_FROM_EMAIL
  if (!to || !from) return false
  try {
    const { resend } = await import('@/lib/resend/client')
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text: body,
    })
    return !error
  } catch {
    return false
  }
}

// Durable throttle marker. Without a tenantId there is nothing to attribute
// the event to, so the send goes unrecorded (that key just won't dedup).
export async function markAlertSent(
  tenantId: string | undefined,
  key: string,
  subject: string,
): Promise<void> {
  if (!tenantId) return
  try {
    await recordActivity({
      tenantId,
      eventType: ActivityEventType.OPS_ALERT_SENT,
      eventSource: 'ops_alerting',
      eventSummary: `Ops alert sent: ${subject}`,
      metadata: { alert_key: key, subject },
    })
  } catch {
    // non-fatal — the alert itself already went out
  }
}

export async function sendOpsAlert(input: SendOpsAlertInput): Promise<SendOpsAlertResult> {
  try {
    if (!isAlertingEnabled()) return { sent: false, reason: 'alerting_disabled' }
    if (await isAlertThrottled(input.key)) return { sent: false, reason: 'throttled' }
    const ok = await sendOpsEmail(input.subject, input.body)
    if (!ok) return { sent: false, reason: 'send_failed' }
    await markAlertSent(input.tenantId, input.key, input.subject)
    return { sent: true }
  } catch {
    return { sent: false, reason: 'send_failed' }
  }
}
