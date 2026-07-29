import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey, ActivityEventType } from '@/modules/intelligence/types.agent'

// Is sending currently halted, and why?
//
// The circuit breaker kills campaign_send_dispatch_enabled and never re-arms,
// which is correct, but until now that state was visible only as a raw toggle
// in System Controls and a row in the structured-errors table. A safety system
// that can fire without telling anyone is half a safety system: paired with an
// unproven alert email, a trip could go unnoticed until someone wondered why
// nothing had sent.
//
// Read-only and non-throwing. It renders on pages whose primary job is
// something else, so a failure here must degrade to "no banner", never to a
// broken page.

export interface SendHaltStatus {
  halted:     boolean
  /** Present when the halt is attributable to a breaker trip. */
  reason:     string | null
  trippedAt:  string | null
  /** True when dispatch is off but no trip was recorded, i.e. a manual hold. */
  manualHold: boolean
}

const OK: SendHaltStatus = { halted: false, reason: null, trippedAt: null, manualHold: false }

export async function getSendHaltStatus(tenantId: string): Promise<SendHaltStatus> {
  try {
    const dispatchOn = await getBooleanControl(
      SystemControlKey.CAMPAIGN_SEND_DISPATCH_ENABLED, tenantId, false,
    ).catch(() => true)   // unknown gate state must not cry wolf
    if (dispatchOn) return OK

    const supabase = createSupabaseServiceClient()
    const { data } = await supabase
      .from('activity_events')
      .select('event_summary, created_at, metadata')
      .eq('tenant_id', tenantId)
      .eq('event_type', ActivityEventType.SEND_CIRCUIT_BREAKER_TRIPPED)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return { halted: true, reason: null, trippedAt: null, manualHold: true }

    return {
      halted:     true,
      reason:     (data.event_summary as string | null) ?? null,
      trippedAt:  (data.created_at as string | null) ?? null,
      manualHold: false,
    }
  } catch {
    return OK
  }
}
