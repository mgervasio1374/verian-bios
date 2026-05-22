// ============================================================
// Phase 3B — Event Tracking Attribution Helpers
// Pure functions only — no I/O, no async, no side effects.
// All inputs must be pre-loaded by the caller.
//
// RESEND_EVENT_TO_ET_TYPE: email.delivery_delayed is deliberately
// absent — that event remains log-only with no activity event.
// ============================================================

import type { EtPhase3bMeta, EtActionType } from './event-tracking.types'

// ---- Resend event type → ET_ activity type mapping ----
// email.delivery_delayed is absent — log-only, no activity event.

export const RESEND_EVENT_TO_ET_TYPE: Record<string, EtActionType> = {
  'email.delivered':   'ET_EMAIL_DELIVERED',
  'email.bounced':     'ET_EMAIL_BOUNCED',
  'email.complained':  'ET_EMAIL_COMPLAINED',
  'email.failed':      'ET_EMAIL_DELIVERY_FAILED',
  'email.opened':      'ET_EMAIL_OPENED',
  'email.clicked':     'ET_EMAIL_CLICKED',
}

// ---- extractPhase3bMeta ----
// Reads Phase 3B fields from ai_generation_metadata (at send time)
// or from email_sends.metadata (at webhook time after enrichment).
// Returns null if source is not 'phase_3b_send_bridge' or input is null.

export function extractPhase3bMeta(
  aiGenerationMetadata: Record<string, unknown> | null | undefined
): EtPhase3bMeta | null {
  if (!aiGenerationMetadata) return null
  if (aiGenerationMetadata['source'] !== 'phase_3b_send_bridge') return null

  return {
    source:             'phase_3b_send_bridge',
    message_version_id: typeof aiGenerationMetadata['message_version_id'] === 'string'
      ? aiGenerationMetadata['message_version_id'] : null,
    strategy_id:        typeof aiGenerationMetadata['strategy_id'] === 'string'
      ? aiGenerationMetadata['strategy_id'] : null,
    quality_review_id:  typeof aiGenerationMetadata['quality_review_id'] === 'string'
      ? aiGenerationMetadata['quality_review_id'] : null,
    version_label:      typeof aiGenerationMetadata['version_label'] === 'string'
      ? aiGenerationMetadata['version_label'] : null,
    composite_score:    typeof aiGenerationMetadata['composite_score'] === 'number'
      ? aiGenerationMetadata['composite_score'] : null,
    approved_by:        typeof aiGenerationMetadata['approved_by'] === 'string'
      ? aiGenerationMetadata['approved_by'] : null,
    lead_id:            typeof aiGenerationMetadata['lead_id'] === 'string'
      ? aiGenerationMetadata['lead_id'] : null,
    send_initiated_by:  typeof aiGenerationMetadata['send_initiated_by'] === 'string'
      ? aiGenerationMetadata['send_initiated_by'] : null,
  }
}

// ---- isPhase3bSend ----
// Returns true if the send metadata indicates a Phase 3B-originated send.
// Used in the webhook handler to decide whether to emit ET_ activity events.

export function isPhase3bSend(
  sendMetadata: Record<string, unknown> | null | undefined
): boolean {
  return sendMetadata?.['source'] === 'phase_3b_send_bridge'
}

// ---- buildPhase3bSendMetadata ----
// Merges Phase 3B fields into the existing email_sends.metadata object.
// Called at send time when the draft came from the Phase 3B Send Bridge.
// No migration required — all data stored in existing metadata jsonb column.

export function buildPhase3bSendMetadata(
  phase3bMeta:     EtPhase3bMeta,
  sendInitiatedBy: string,
  leadId:          string | null,
  existingFields:  Record<string, unknown>
): Record<string, unknown> {
  return {
    ...existingFields,
    source:             'phase_3b_send_bridge',
    message_version_id: phase3bMeta.message_version_id,
    strategy_id:        phase3bMeta.strategy_id,
    quality_review_id:  phase3bMeta.quality_review_id,
    version_label:      phase3bMeta.version_label,
    composite_score:    phase3bMeta.composite_score,
    approved_by:        phase3bMeta.approved_by,
    send_initiated_by:  sendInitiatedBy,
    lead_id:            leadId,
  }
}
