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
