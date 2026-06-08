// Verian Agent Bridge — audit ledger type definitions.
// Type definitions only. No runtime objects, functions, classes, or side effects.
// These types define the shape of a future append-only audit ledger — they do not
// authorize execution, model calls, DB writes, sending, or routing.
// dryRunOnly: true preserves the dry-run boundary on all audit records.

import type { VerianPolicyProfileId } from '@/modules/verian-policy/types'
import type {
  VerianBridgeTaskId,
} from '@/modules/verian-agent-bridge/types'
import type { VerianBridgeReviewQueueState } from '@/modules/verian-agent-bridge/review-queue/types'

// ---------------------------------------------------------------------------
// Audit event type
// ---------------------------------------------------------------------------

// All events that the audit ledger must record.
// Every queue state transition must produce a corresponding audit event.
export type VerianBridgeAuditEventType =
  | 'packet_created'
  | 'policy_check_passed'
  | 'policy_check_warning'
  | 'policy_check_blocked'
  | 'human_approval_requested'
  | 'human_approved'
  | 'human_denied'
  | 'revision_requested'
  | 'codex_review_required'
  | 'codex_review_received'
  | 'manual_handoff_prepared'
  | 'packet_archived'
  // Slice 11 addition — requires migration 20240044 (applied local + staging):
  | 'policy_review_submitted'

// ---------------------------------------------------------------------------
// Audit actor
// ---------------------------------------------------------------------------

// Who performed the action that generated the audit event.
export type VerianBridgeAuditActor =
  | 'michael'
  | 'system'
  | 'agent'
  | 'codex'

// ---------------------------------------------------------------------------
// Audit record
// ---------------------------------------------------------------------------

// String alias for audit record IDs — will be refined to a branded type in a future slice.
export type VerianBridgeAuditRecordId = string

// An immutable audit event record.
// Append-only: records must never be mutated or deleted after creation.
// promptSummary/promptHash allow future verification that an approved prompt matches the executed prompt.
// dryRunOnly: true — audit records exist within the dry-run boundary until execution is explicitly authorized.
export type VerianBridgeAuditRecord = {
  readonly id: VerianBridgeAuditRecordId
  readonly taskId: VerianBridgeTaskId
  readonly packetId: string
  readonly queueItemId?: string
  readonly policyId: VerianPolicyProfileId
  readonly eventType: VerianBridgeAuditEventType
  readonly actor: VerianBridgeAuditActor
  readonly previousState?: VerianBridgeReviewQueueState
  readonly nextState?: VerianBridgeReviewQueueState
  readonly summary: string
  readonly evidence?: readonly string[]
  readonly promptSummary?: string
  readonly promptHash?: string
  readonly createdAt: string
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Codex review artifact
// ---------------------------------------------------------------------------

// Records a Codex review artifact linked to a queue item.
// Codex review cannot auto-apply suggestions — it produces this record only.
// dryRunOnly: true — the artifact does not authorize execution.
export type VerianBridgeCodexReviewArtifact = {
  readonly artifactId: string
  readonly queueItemId: string
  readonly taskId: VerianBridgeTaskId
  readonly reviewedBy: 'codex'
  readonly reviewStatus: 'pass' | 'pass_with_notes' | 'blocked'
  readonly blockingIssues: readonly string[]
  readonly nonBlockingIssues: readonly string[]
  readonly summary: string
  readonly createdAt: string
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Audit append request
// ---------------------------------------------------------------------------

// Input shape for creating a new audit record.
// The ledger implementation must treat this as append-only — no update or delete.
// dryRunOnly: true is required on all append requests.
export type VerianBridgeAuditAppendRequest = {
  readonly eventType: VerianBridgeAuditEventType
  readonly actor: VerianBridgeAuditActor
  readonly taskId: VerianBridgeTaskId
  readonly packetId: string
  readonly queueItemId?: string
  readonly policyId: VerianPolicyProfileId
  readonly previousState?: VerianBridgeReviewQueueState
  readonly nextState?: VerianBridgeReviewQueueState
  readonly summary: string
  readonly evidence?: readonly string[]
  readonly promptSummary?: string
  readonly promptHash?: string
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Audit ledger rules
// ---------------------------------------------------------------------------

// Enumerated rules that any audit ledger implementation must enforce.
// This type is used for documentation and future source-reading tests only.
export type VerianBridgeAuditLedgerRule =
  | 'append_only'
  | 'no_silent_mutation'
  | 'preserve_policy_check_result'
  | 'preserve_actor'
  | 'preserve_timestamp'
  | 'preserve_denials'
  | 'preserve_revision_requests'
  | 'preserve_codex_artifacts'
  | 'dry_run_only'
