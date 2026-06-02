import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CommitmentRow = Database['public']['Tables']['proposal_follow_up_commitments']['Row']

// Public type alias for the row returned by mutation functions in this file.
export type ProposalFollowUpMutationCommitmentRow = CommitmentRow

// ---------------------------------------------------------------------------
// Typed error — lets the service layer distinguish not_found from not_open
// without string-matching on Error.message.
// ---------------------------------------------------------------------------

export class ProposalFollowUpMutationError extends Error {
  constructor(
    public readonly code: 'not_found' | 'not_open' | 'write_failed',
    message: string,
  ) {
    super(message)
    this.name = 'ProposalFollowUpMutationError'
  }
}

// ---------------------------------------------------------------------------
// Complete follow-up commitment
//
// Marks a single open commitment as completed by the acting operator.
// Performs a fetch-before-write scoped by (tenantId, workspaceId) so that a
// bare commitmentId can never be used to mutate a row from a different tenant
// or workspace.
//
// Throws ProposalFollowUpMutationError:
//   code 'not_found'  — commitment does not exist in this tenant/workspace
//   code 'not_open'   — commitment_status is not 'open'
//   code 'write_failed' — Supabase update returned an error
//
// Does NOT:
//   - Call recordActivityEvent (audit belongs to the service layer)
//   - Call requirePermission   (permission belongs to the server action layer)
//   - Send email or enqueue background jobs
// ---------------------------------------------------------------------------

export async function completeFollowUpCommitment(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  completionNotes?: string,
): Promise<ProposalFollowUpMutationCommitmentRow> {
  const supabase = createSupabaseServiceClient()

  // Fetch-before-write — scope by (tenant_id, workspace_id, id).
  const { data: existing, error: fetchError } = await supabase
    .from('proposal_follow_up_commitments')
    .select('id, commitment_status, tenant_id, workspace_id')
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (fetchError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `completeFollowUpCommitment fetch: ${fetchError.message}`,
    )
  }

  if (!existing) {
    throw new ProposalFollowUpMutationError(
      'not_found',
      `completeFollowUpCommitment: commitment ${commitmentId} not found in tenant ${tenantId} / workspace ${workspaceId}`,
    )
  }

  // Only open commitments may be completed.
  if (existing.commitment_status !== 'open') {
    throw new ProposalFollowUpMutationError(
      'not_open',
      `completeFollowUpCommitment: commitment ${commitmentId} has status '${existing.commitment_status}', expected 'open'`,
    )
  }

  const now = new Date().toISOString()
  // Normalize: whitespace-only notes are treated as absent.
  const normalizedNotes = completionNotes?.trim() || null

  const { data: updated, error: updateError } = await supabase
    .from('proposal_follow_up_commitments')
    .update({
      commitment_status:    'completed',
      completed_at:         now,
      completed_by_user_id: actorUserId,
      completion_notes:     normalizedNotes,
      updated_at:           now,
    })
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    // Race guard: if another request closed this commitment between our fetch
    // and this update, the predicate matches nothing and no row is returned.
    .eq('commitment_status', 'open')
    .select()
    .maybeSingle()

  if (updateError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `completeFollowUpCommitment update: ${updateError.message}`,
    )
  }

  if (!updated) {
    // Row was open at fetch time but status changed before the update landed.
    throw new ProposalFollowUpMutationError(
      'not_open',
      `completeFollowUpCommitment: commitment ${commitmentId} was no longer open at update time`,
    )
  }

  return updated
}

// ---------------------------------------------------------------------------
// Skip follow-up commitment
//
// Marks a single open commitment as skipped by the acting operator.
// Performs a fetch-before-write scoped by (tenantId, workspaceId) so that a
// bare commitmentId can never be used to mutate a row from a different tenant
// or workspace.
//
// Throws ProposalFollowUpMutationError:
//   code 'not_found'    — commitment does not exist in this tenant/workspace
//   code 'not_open'     — commitment_status is not 'open'
//   code 'write_failed' — Supabase update returned an error
//
// Does NOT:
//   - Call recordActivityEvent (audit belongs to the service layer)
//   - Call requirePermission   (permission belongs to the server action layer)
//   - Send email or enqueue background jobs
// ---------------------------------------------------------------------------

export async function skipFollowUpCommitment(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  skippedReason?: string,
): Promise<ProposalFollowUpMutationCommitmentRow> {
  const supabase = createSupabaseServiceClient()

  // Fetch-before-write — scope by (tenant_id, workspace_id, id).
  const { data: existing, error: fetchError } = await supabase
    .from('proposal_follow_up_commitments')
    .select('id, commitment_status, tenant_id, workspace_id')
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (fetchError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `skipFollowUpCommitment fetch: ${fetchError.message}`,
    )
  }

  if (!existing) {
    throw new ProposalFollowUpMutationError(
      'not_found',
      `skipFollowUpCommitment: commitment ${commitmentId} not found in tenant ${tenantId} / workspace ${workspaceId}`,
    )
  }

  // Only open commitments may be skipped.
  if (existing.commitment_status !== 'open') {
    throw new ProposalFollowUpMutationError(
      'not_open',
      `skipFollowUpCommitment: commitment ${commitmentId} has status '${existing.commitment_status}', expected 'open'`,
    )
  }

  const now = new Date().toISOString()
  // Normalize: whitespace-only reason is treated as absent.
  const normalizedReason = skippedReason?.trim() || null

  const { data: updated, error: updateError } = await supabase
    .from('proposal_follow_up_commitments')
    .update({
      commitment_status:  'skipped',
      skipped_at:         now,
      skipped_by_user_id: actorUserId,
      skipped_reason:     normalizedReason,
      updated_at:         now,
    })
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    // Race guard: if another request closed this commitment between our fetch
    // and this update, the predicate matches nothing and no row is returned.
    .eq('commitment_status', 'open')
    .select()
    .maybeSingle()

  if (updateError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `skipFollowUpCommitment update: ${updateError.message}`,
    )
  }

  if (!updated) {
    // Row was open at fetch time but status changed before the update landed.
    throw new ProposalFollowUpMutationError(
      'not_open',
      `skipFollowUpCommitment: commitment ${commitmentId} was no longer open at update time`,
    )
  }

  return updated
}

// ---------------------------------------------------------------------------
// Reschedule follow-up commitment
//
// Updates the due date of a single open commitment. commitment_status remains
// 'open' — this is not a terminal state transition. The commitment stays on
// the queue at the new date.
//
// Also fetches and returns the previous follow_up_due_at so the service layer
// can record it in the audit event without a second round-trip.
//
// Throws ProposalFollowUpMutationError:
//   code 'not_found'    — commitment does not exist in this tenant/workspace
//   code 'not_open'     — commitment_status is not 'open'
//   code 'write_failed' — Supabase update returned an error
//
// Does NOT:
//   - Change commitment_status (commitment stays 'open')
//   - Call recordActivityEvent (audit belongs to the service layer)
//   - Call requirePermission   (permission belongs to the server action layer)
//   - Send email or enqueue background jobs
// ---------------------------------------------------------------------------

export interface RescheduleFollowUpCommitmentResult {
  previousFollowUpDueAt: string
  commitment: ProposalFollowUpMutationCommitmentRow
}

export async function rescheduleFollowUpCommitment(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  _actorUserId: string,
  nextFollowUpDueAt: string,
): Promise<RescheduleFollowUpCommitmentResult> {
  const supabase = createSupabaseServiceClient()

  // Fetch-before-write — scope by (tenant_id, workspace_id, id).
  // Also select follow_up_due_at so the service layer can record previous_follow_up_due_at.
  const { data: existing, error: fetchError } = await supabase
    .from('proposal_follow_up_commitments')
    .select('id, commitment_status, tenant_id, workspace_id, follow_up_due_at')
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (fetchError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `rescheduleFollowUpCommitment fetch: ${fetchError.message}`,
    )
  }

  if (!existing) {
    throw new ProposalFollowUpMutationError(
      'not_found',
      `rescheduleFollowUpCommitment: commitment ${commitmentId} not found in tenant ${tenantId} / workspace ${workspaceId}`,
    )
  }

  // Only open commitments may be rescheduled.
  if (existing.commitment_status !== 'open') {
    throw new ProposalFollowUpMutationError(
      'not_open',
      `rescheduleFollowUpCommitment: commitment ${commitmentId} has status '${existing.commitment_status}', expected 'open'`,
    )
  }

  // Capture the previous due date before update — returned to the service layer
  // so it can include previous_follow_up_due_at in the audit event.
  const previousFollowUpDueAt = existing.follow_up_due_at

  const now = new Date().toISOString()

  const { data: updated, error: updateError } = await supabase
    .from('proposal_follow_up_commitments')
    .update({
      follow_up_due_at: nextFollowUpDueAt,
      updated_at:       now,
    })
    .eq('id', commitmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    // Race guard — two predicates:
    // 1. commitment_status = 'open': guards against concurrent complete/skip/close.
    // 2. follow_up_due_at = previousFollowUpDueAt: guards against concurrent
    //    reschedule-vs-reschedule, ensuring previousFollowUpDueAt in the return
    //    value is the value that was actually superseded.
    .eq('commitment_status', 'open')
    .eq('follow_up_due_at', previousFollowUpDueAt)
    .select()
    .maybeSingle()

  if (updateError) {
    throw new ProposalFollowUpMutationError(
      'write_failed',
      `rescheduleFollowUpCommitment update: ${updateError.message}`,
    )
  }

  if (!updated) {
    // Row was open at fetch time but status changed before the update landed.
    throw new ProposalFollowUpMutationError(
      'not_open',
      `rescheduleFollowUpCommitment: commitment ${commitmentId} was no longer open at update time`,
    )
  }

  return { previousFollowUpDueAt, commitment: updated }
}
