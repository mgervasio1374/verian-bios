import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getBooleanControl, upsertTenantBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import { SystemControlKey, ActivityEventType } from '@/modules/intelligence/types.agent'

// Send circuit breaker — an automatic kill switch on deliverability.
//
// A campaign mailing a stale list can destroy a sending domain faster than any
// human notices: providers read double-digit bounces from a young sender as
// proof of a purchased list, and SES/Resend enforce account-level thresholds
// whose breach suspends ALL sending, transactional included. This trips the
// global dispatch gate before that happens.
//
// Two independent limits, because they fail differently:
//   • BOUNCE    2%   — the operator-chosen warmup ceiling. SES tolerates ~5%,
//                      so 2% stops us well short of provider action.
//   • COMPLAINT 0.1% — SES's own limit. Complaints are far more damaging per
//                      event than bounces and recover far more slowly.
//
// MIN_SAMPLE exists because warmup volume is tiny: at 20 sends/day a single
// bounce is 5%, and a breaker that trips on statistical noise gets disabled by
// the operator, which is worse than having none.
//
// The breaker NEVER re-arms itself. Tripping requires a human to review the
// list and re-enable dispatch in System Controls — an automatic reset would
// just resume burning the domain.

export const BOUNCE_RATE_LIMIT    = 0.02   // 2%
export const COMPLAINT_RATE_LIMIT = 0.001  // 0.1%
export const MIN_SAMPLE           = 50
export const WINDOW_DAYS          = 7

export interface SendHealthCounts {
  total:      number
  bounced:    number
  complained: number
}

export type BreakerVerdict =
  | { trip: false; reason: 'below_sample' | 'healthy'; bounceRate: number; complaintRate: number; sample: number }
  | { trip: true;  reason: 'bounce_rate' | 'complaint_rate'; bounceRate: number; complaintRate: number; sample: number; detail: string }

// Pure. Rates are computed over total ATTEMPTED sends in the window, which is
// how providers compute them — not over delivered mail, which would flatter us.
export function evaluateSendHealth(counts: SendHealthCounts): BreakerVerdict {
  const { total, bounced, complained } = counts
  const bounceRate    = total > 0 ? bounced / total : 0
  const complaintRate = total > 0 ? complained / total : 0
  const base = { bounceRate, complaintRate, sample: total }

  if (total < MIN_SAMPLE) return { trip: false, reason: 'below_sample', ...base }

  // Complaints first: the lower threshold and the harsher penalty.
  if (complaintRate >= COMPLAINT_RATE_LIMIT) {
    return {
      trip: true, reason: 'complaint_rate', ...base,
      detail: `complaint rate ${(complaintRate * 100).toFixed(2)}% (${complained}/${total}) reached the ` +
              `${(COMPLAINT_RATE_LIMIT * 100).toFixed(2)}% limit over the last ${WINDOW_DAYS} days`,
    }
  }
  if (bounceRate >= BOUNCE_RATE_LIMIT) {
    return {
      trip: true, reason: 'bounce_rate', ...base,
      detail: `bounce rate ${(bounceRate * 100).toFixed(2)}% (${bounced}/${total}) reached the ` +
              `${(BOUNCE_RATE_LIMIT * 100).toFixed(1)}% limit over the last ${WINDOW_DAYS} days`,
    }
  }
  return { trip: false, reason: 'healthy', ...base }
}

// Rolling-window counts straight off email_sends. Errors surface to the caller,
// which always treats them as non-fatal.
export async function loadSendHealthCounts(
  tenantId: string,
  now: Date = new Date(),
): Promise<SendHealthCounts> {
  const supabase = createSupabaseServiceClient()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('email_sends')
    .select('status')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
  if (error) throw new Error(`loadSendHealthCounts: ${error.message}`)

  const rows = (data ?? []) as Array<{ status: string | null }>
  return {
    total:      rows.length,
    bounced:    rows.filter(r => r.status === 'bounced').length,
    complained: rows.filter(r => r.status === 'complained').length,
  }
}

export type BreakerOutcome =
  | { tripped: false; reason: string; verdict?: BreakerVerdict }
  | { tripped: true;  verdict: BreakerVerdict }

// Evaluate and, if breached, kill campaign dispatch for the tenant.
//
// NEVER throws: this runs inside the Resend webhook, where an exception would
// turn into a non-200 and make Svix retry and eventually auto-disable the
// endpoint — the exact silent failure that cost us delivery telemetry on 6/25.
export async function checkSendCircuitBreaker(
  tenantId: string,
  now: Date = new Date(),
): Promise<BreakerOutcome> {
  try {
    // Already off? Nothing to trip, and no repeat alert.
    const dispatchOn = await getBooleanControl(
      SystemControlKey.CAMPAIGN_SEND_DISPATCH_ENABLED, tenantId, false,
    ).catch(() => false)
    if (!dispatchOn) return { tripped: false, reason: 'dispatch_already_off' }

    const counts  = await loadSendHealthCounts(tenantId, now)
    const verdict = evaluateSendHealth(counts)
    if (!verdict.trip) return { tripped: false, reason: verdict.reason, verdict }

    // 1. Kill the gate first — everything after this is notification.
    await upsertTenantBooleanControl(
      SystemControlKey.CAMPAIGN_SEND_DISPATCH_ENABLED,
      false,
      tenantId,
      {
        label:       'Campaign Send Dispatch Enabled',
        description: 'Set from the System Controls UI.',
        updatedBy:   null,
      },
    )

    // 2. Page a human. severity 'critical' routes through the alerting hook.
    await createStructuredError({
      tenantId,
      failureType:  'send_circuit_breaker',
      errorCode:    'SEND_CIRCUIT_BREAKER_TRIPPED',
      errorMessage:
        `Campaign sending STOPPED automatically: ${verdict.detail}. ` +
        'Dispatch is now OFF and will NOT re-arm on its own. Review the list, then re-enable ' +
        'campaign_send_dispatch_enabled in System Controls.',
      severity:     'critical',
      module:       'send_circuit_breaker',
    } as never).catch(() => {})

    // 3. Durable record of why, for the operator and the timeline.
    await recordActivity({
      tenantId,
      eventType:    ActivityEventType.SEND_CIRCUIT_BREAKER_TRIPPED,
      eventSource:  'send_circuit_breaker',
      eventSummary: `Campaign sending stopped: ${verdict.detail}`,
      metadata: {
        reason:         verdict.reason,
        bounce_rate:    verdict.bounceRate,
        complaint_rate: verdict.complaintRate,
        sample:         verdict.sample,
        window_days:    WINDOW_DAYS,
      },
    }).catch(() => {})

    return { tripped: true, verdict }
  } catch (err) {
    console.error('[send-circuit-breaker]', err instanceof Error ? err.message : String(err))
    return { tripped: false, reason: 'error' }
  }
}
