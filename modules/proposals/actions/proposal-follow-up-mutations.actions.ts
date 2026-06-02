'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import {
  completeFollowUpCommitmentForWorkspace,
  skipFollowUpCommitmentForWorkspace,
  rescheduleFollowUpCommitmentForWorkspace,
} from '@/modules/proposals/services/proposal-follow-up-mutations.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface CompleteFollowUpCommitmentActionInput {
  commitmentId?: string
  completionNotes?: string
}

export interface CompleteFollowUpCommitmentActionData {
  commitmentId: string
  status: 'completed'
}

// ---------------------------------------------------------------------------
// Complete a follow-up commitment.
//
// tenantId, workspaceId, and actorUserId are derived from the server-side
// request context — they are never read from client input.
//
// Permission: crm.leads.edit (same permission used for all Phase 3R mutations).
// Audit: handled by the service layer — do not call recordActivityEvent here.
// ---------------------------------------------------------------------------

export async function completeFollowUpCommitmentAction(
  input: CompleteFollowUpCommitmentActionInput,
): Promise<ActionResult<CompleteFollowUpCommitmentActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.edit')

    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    const rawNotes = input.completionNotes?.trim()
    const completionNotes = rawNotes || undefined

    const result = await completeFollowUpCommitmentForWorkspace(
      ctx.tenantId,
      ctx.workspaceId,
      commitmentId,
      ctx.userId,
      completionNotes,
    )

    if (result.ok) {
      return {
        success: true,
        data: { commitmentId: result.commitment.id, status: 'completed' },
      }
    }

    switch (result.error) {
      case 'not_found':
        return { success: false, error: 'Follow-up commitment not found.' }
      case 'not_open':
        return { success: false, error: 'Follow-up commitment is no longer open.' }
      case 'write_failed':
        return { success: false, error: 'Failed to complete follow-up commitment.' }
      case 'audit_failed':
        return {
          success: false,
          error: 'Follow-up commitment completed but audit logging failed.',
        }
      default:
        return { success: false, error: 'An unexpected error occurred.' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface SkipFollowUpCommitmentActionInput {
  commitmentId?: string
  skippedReason?: string
}

export interface SkipFollowUpCommitmentActionData {
  commitmentId: string
  status: 'skipped'
}

// ---------------------------------------------------------------------------
// Skip a follow-up commitment.
//
// tenantId, workspaceId, and actorUserId are derived from the server-side
// request context — they are never read from client input.
//
// Permission: crm.leads.edit (same permission used for all Phase 3R mutations).
// Audit: handled by the service layer — do not call recordActivityEvent here.
// ---------------------------------------------------------------------------

export async function skipFollowUpCommitmentAction(
  input: SkipFollowUpCommitmentActionInput,
): Promise<ActionResult<SkipFollowUpCommitmentActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.edit')

    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    const rawReason = input.skippedReason?.trim()
    const skippedReason = rawReason || undefined

    const result = await skipFollowUpCommitmentForWorkspace(
      ctx.tenantId,
      ctx.workspaceId,
      commitmentId,
      ctx.userId,
      skippedReason,
    )

    if (result.ok) {
      return {
        success: true,
        data: { commitmentId: result.commitment.id, status: 'skipped' },
      }
    }

    switch (result.error) {
      case 'not_found':
        return { success: false, error: 'Follow-up commitment not found.' }
      case 'not_open':
        return { success: false, error: 'Follow-up commitment is no longer open.' }
      case 'write_failed':
        return { success: false, error: 'Failed to skip follow-up commitment.' }
      case 'audit_failed':
        return {
          success: false,
          error: 'Follow-up commitment skipped but audit logging failed.',
        }
      default:
        return { success: false, error: 'An unexpected error occurred.' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export interface RescheduleFollowUpCommitmentActionInput {
  commitmentId?: string
  nextFollowUpDueAt?: string
}

export interface RescheduleFollowUpCommitmentActionData {
  commitmentId: string
  status: 'open'
  nextFollowUpDueAt: string
}

// ---------------------------------------------------------------------------
// Reschedule a follow-up commitment.
//
// tenantId, workspaceId, and actorUserId are derived from the server-side
// request context — they are never read from client input.
//
// Permission: crm.leads.edit (same permission used for all Phase 3R mutations).
// Audit: handled by the service layer — do not call recordActivityEvent here.
// ---------------------------------------------------------------------------

export async function rescheduleFollowUpCommitmentAction(
  input: RescheduleFollowUpCommitmentActionInput,
): Promise<ActionResult<RescheduleFollowUpCommitmentActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.edit')

    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    const trimmedNextFollowUpDueAt = input.nextFollowUpDueAt?.trim() ?? ''
    if (!trimmedNextFollowUpDueAt) {
      return { success: false, error: 'nextFollowUpDueAt is required.' }
    }

    const parsedDate = new Date(trimmedNextFollowUpDueAt)
    if (isNaN(parsedDate.getTime())) {
      return { success: false, error: 'nextFollowUpDueAt must be a valid date/time.' }
    }

    const normalizedNextFollowUpDueAt = parsedDate.toISOString()

    const result = await rescheduleFollowUpCommitmentForWorkspace(
      ctx.tenantId,
      ctx.workspaceId,
      commitmentId,
      ctx.userId,
      normalizedNextFollowUpDueAt,
    )

    if (result.ok) {
      return {
        success: true,
        data: {
          commitmentId: result.commitment.id,
          status: 'open',
          nextFollowUpDueAt: result.commitment.follow_up_due_at,
        },
      }
    }

    switch (result.error) {
      case 'not_found':
        return { success: false, error: 'Follow-up commitment not found.' }
      case 'not_open':
        return { success: false, error: 'Follow-up commitment is no longer open.' }
      case 'write_failed':
        return { success: false, error: 'Failed to reschedule follow-up commitment.' }
      case 'audit_failed':
        return {
          success: false,
          error: 'Follow-up commitment rescheduled but audit logging failed.',
        }
      default:
        return { success: false, error: 'An unexpected error occurred.' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
