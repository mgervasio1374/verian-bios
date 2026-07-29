'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { sendOpsEmailDiagnostic } from '@/modules/intelligence/alerting/alerting.service'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const REASON_HELP: Record<string, string> = {
  missing_alert_email:
    'ALERT_EMAIL is not set on this deployment. Set it in Vercel, then redeploy: environment changes do not reach a deployment that is already running.',
  missing_alert_from_email:
    'ALERT_FROM_EMAIL is not set on this deployment. Set it in Vercel, then redeploy.',
  provider_rejected:
    'Resend rejected the message. The most common cause is a from-address on a domain that is not verified in Resend.',
  threw:
    'The send threw before completing. RESEND_API_KEY may be missing or invalid on this deployment.',
}

/**
 * Prove the alerting channel works, on demand.
 *
 * The circuit breaker and every critical structured error depend on this path,
 * and until now there was no way to confirm it short of causing a real
 * incident. An untested alarm is not an alarm. Deliberately bypasses the
 * throttle and writes no structured error, so testing the channel neither
 * suppresses a real alert nor pollutes the error log with fake criticals.
 */
export async function sendTestOpsAlertAction(): Promise<ActionResult<{ to: string; from: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.send_emails')

    const stamp   = new Date().toISOString()
    const outcome = await sendOpsEmailDiagnostic(
      'Verian ops alert test',
      [
        'This is a test of the Verian ops alerting channel.',
        '',
        'If you are reading this, a circuit breaker trip or critical error will reach you',
        'at this address. Nothing is wrong; this was triggered manually from the',
        'Workflow Health page.',
        '',
        `Sent: ${stamp}`,
      ].join('\n'),
    )

    if (!outcome.ok) {
      const help = REASON_HELP[outcome.reason] ?? ''
      return {
        success: false,
        error: `${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ''}${help ? ` — ${help}` : ''}`,
      }
    }

    await recordActivity({
      tenantId:     ctx.tenantId,
      eventType:    ActivityEventType.OPS_ALERT_SENT,
      eventSource:  'ops_alerting',
      eventSummary: 'Ops alert channel test sent',
      metadata:     { alert_key: `test:${stamp}`, subject: 'Verian ops alert test', test: true },
    }).catch(() => {})

    return { success: true, data: { to: outcome.to, from: outcome.from } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
