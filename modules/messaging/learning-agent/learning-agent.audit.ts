// ============================================================
// Phase 3B — Learning Agent Audit Payload Builders
// Pure functions only — no I/O, no async, no side effects.
// ============================================================

import { LA_ACTION_TYPES } from './learning-agent.types'
import type { LaSignalsComputedPayload, LaSignalsFailedPayload } from './learning-agent.types'

// ---- buildSignalsComputedPayload ----
// Emitted when the Learning Agent completes a successful computation run.

export function buildSignalsComputedPayload(params: {
  runId:          string
  tenantId:       string
  snapshotsCount: number
  totalSends:     number
  lookbackDays:   number
  windowStart:    string
  windowEnd:      string
  triggeredBy:    string
}): LaSignalsComputedPayload {
  return {
    action_type:      LA_ACTION_TYPES.LA_SIGNALS_COMPUTED,
    run_id:           params.runId,
    tenant_id:        params.tenantId,
    signals_computed: params.snapshotsCount,
    total_sends:      params.totalSends,
    lookback_days:    params.lookbackDays,
    window_start:     params.windowStart,
    window_end:       params.windowEnd,
    triggered_by:     params.triggeredBy,
    computed_at:      new Date().toISOString(),
  }
}

// ---- buildSignalsFailedPayload ----
// Emitted when the Learning Agent computation fails partway through.

export function buildSignalsFailedPayload(params: {
  runId:       string
  tenantId:    string
  errorReason: string
  triggeredBy: string
}): LaSignalsFailedPayload {
  return {
    action_type:  LA_ACTION_TYPES.LA_SIGNALS_COMPUTATION_FAILED,
    run_id:       params.runId,
    tenant_id:    params.tenantId,
    error_reason: params.errorReason,
    triggered_by: params.triggeredBy,
    timestamp:    new Date().toISOString(),
  }
}
