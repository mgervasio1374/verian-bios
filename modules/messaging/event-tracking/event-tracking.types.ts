// ============================================================
// Phase 3B — Event Tracking / Send Outcome Tracking Types
// All types, constants, and interfaces for Event Tracking.
// Uses `as const` throughout — no TypeScript enum keyword.
//
// Guardrails enforced by type design:
//   - No scoring fields
//   - No copy fields (body_text, subject_line)
//   - No Learning Agent fields
//   - Observation payloads only
// ============================================================

export const ET_ACTION_TYPES = {
  ET_SEND_INITIATED:        'ET_SEND_INITIATED',
  ET_SEND_SUCCEEDED:        'ET_SEND_SUCCEEDED',
  ET_SEND_FAILED:           'ET_SEND_FAILED',
  ET_EMAIL_DELIVERED:       'ET_EMAIL_DELIVERED',
  ET_EMAIL_BOUNCED:         'ET_EMAIL_BOUNCED',
  ET_EMAIL_COMPLAINED:      'ET_EMAIL_COMPLAINED',
  ET_EMAIL_DELIVERY_FAILED: 'ET_EMAIL_DELIVERY_FAILED',
  ET_EMAIL_OPENED:          'ET_EMAIL_OPENED',
  ET_EMAIL_CLICKED:         'ET_EMAIL_CLICKED',
} as const

export type EtActionType = typeof ET_ACTION_TYPES[keyof typeof ET_ACTION_TYPES]

// ---- Phase 3B metadata shape ----
// Extracted from email_drafts.ai_generation_metadata (at send time)
// or from email_sends.metadata (at webhook time, after enrichment).

export interface EtPhase3bMeta {
  source:             string           // 'phase_3b_send_bridge'
  message_version_id: string | null
  strategy_id:        string | null
  quality_review_id:  string | null
  version_label:      string | null
  composite_score:    number | null
  approved_by:        string | null
  lead_id:            string | null    // stored in email_sends.metadata at send time
  send_initiated_by:  string | null    // ctx.userId at send time
}

// ---- Internal send event payload ----
// Written to activity_events.metadata for ET_SEND_INITIATED, ET_SEND_SUCCEEDED, ET_SEND_FAILED

export interface EtSendEventPayload {
  action_type:          EtActionType
  email_send_id:        string
  draft_id:             string
  message_version_id:   string | null
  strategy_id:          string | null
  quality_review_id:    string | null
  version_label:        string | null
  composite_score:      number | null
  approved_by:          string | null
  send_initiated_by:    string | null
  to_email:             string | null
  resend_message_id?:   string | null  // present on ET_SEND_SUCCEEDED
  error_reason?:        string         // present on ET_SEND_FAILED
  timestamp:            string
}

// ---- Webhook outcome event payload ----
// Written to activity_events.metadata for webhook-driven ET_ events

export interface EtOutcomeEventPayload {
  action_type:        EtActionType
  email_send_id:      string
  draft_id:           string | null
  message_version_id: string | null
  strategy_id:        string | null
  quality_review_id:  string | null
  version_label:      string | null
  composite_score:    number | null
  approved_by:        string | null
  send_initiated_by:  string | null
  resend_message_id:  string
  resend_event_type:  string           // e.g., 'email.delivered'
  occurred_at:        string
  timestamp:          string
}

// ---- UI send status result ----
// Returned by getSendStatusForDraft for message workspace display

export interface SendStatusResult {
  sendId:     string
  sendStatus: string  // 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
}
