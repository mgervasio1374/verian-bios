import * as captureRepo from '@/modules/proposals/repositories/proposal-captures.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import { PROPOSAL_ACTIVITY_EVENTS } from '@/modules/proposals/constants/proposal-activity-events'
import type { Database } from '@/types/database'

type ProposalCaptureRow = Database['public']['Tables']['proposal_captures']['Row']

export type ReviewAction = 'match' | 'dismiss'

export interface ReviewProposalCaptureInput {
  captureId: string
  action: ReviewAction
  leadId?: string | null
  contactId?: string | null
  reviewNotes?: string | null
}

export type ListProposalCapturesForReviewResult =
  | { ok: true; captures: ProposalCaptureRow[] }
  | { ok: false; error: 'load_failed' }

export type ReviewProposalCaptureResult =
  | { ok: true; captureId: string; status: 'matched' | 'dismissed' }
  | { ok: false; error: 'capture_not_found' | 'lead_not_found' | 'invalid_input' | 'review_failed' }

export async function listProposalCapturesForReview(
  tenantId: string,
  workspaceId: string
): Promise<ListProposalCapturesForReviewResult> {
  try {
    const captures = await captureRepo.getPendingCapturesForWorkspace(tenantId, workspaceId)
    return { ok: true, captures }
  } catch {
    return { ok: false, error: 'load_failed' }
  }
}

export async function reviewProposalCapture(
  tenantId: string,
  workspaceId: string,
  userId: string,
  input: ReviewProposalCaptureInput
): Promise<ReviewProposalCaptureResult> {
  if (!input.captureId || !input.action) {
    return { ok: false, error: 'invalid_input' }
  }

  // 1. Load and validate the capture — must belong to this tenant + workspace.
  // getCaptureById scopes to tenantId + workspaceId — returns null for missing or cross-workspace.
  const capture = await captureRepo.getCaptureById(tenantId, workspaceId, input.captureId)
  if (!capture) {
    return { ok: false, error: 'capture_not_found' }
  }

  const now = new Date().toISOString()
  const reviewerId = userId !== 'system' ? userId : null

  if (input.action === 'dismiss') {
    // 2a. Dismiss: mark capture as dismissed with review metadata.
    try {
      const updated = await captureRepo.updateCaptureMatchStatus(
        tenantId, workspaceId, input.captureId, {
          matchStatus:      'dismissed',
          reviewedByUserId: reviewerId,
          reviewedAt:       now,
          reviewNotes:      input.reviewNotes ?? null,
        }
      )
      if (!updated) return { ok: false, error: 'capture_not_found' }
    } catch {
      return { ok: false, error: 'review_failed' }
    }

    // TODO: emit audit event once activity logging is integrated:
    //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_REVIEWED
    // Pattern: activityEventService.recordActivity(...).catch(() => null)
    void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_REVIEWED  // reference for tree-shaking safety

    return { ok: true, captureId: input.captureId, status: 'dismissed' }
  }

  if (input.action === 'match') {
    // 2b. Match: leadId is required.
    if (!input.leadId) {
      return { ok: false, error: 'invalid_input' }
    }

    // 3. Validate lead belongs to same tenant + workspace.
    // company_id is derived from lead — never from the account domain field or client input.
    const lead = await leadRepo.getLead(input.leadId, tenantId)
    if (!lead || lead.workspace_id !== workspaceId) {
      // Do not leak cross-workspace existence.
      return { ok: false, error: 'lead_not_found' }
    }
    const companyId: string | null = lead.company_id ?? null

    // 4. Update capture to matched.
    // NOTE: Slice 7 marks the capture as matched only — proposal event creation
    // remains a separate step (manual capture flow or later ingest pipeline).
    try {
      const updated = await captureRepo.updateCaptureMatchStatus(
        tenantId, workspaceId, input.captureId, {
          matchStatus:      'matched',
          matchedLeadId:    input.leadId,
          matchedContactId: input.contactId ?? null,
          matchedCompanyId: companyId,
          matchedByUserId:  reviewerId,
          matchedAt:        now,
          reviewedByUserId: reviewerId,
          reviewedAt:       now,
          reviewNotes:      input.reviewNotes ?? null,
        }
      )
      if (!updated) return { ok: false, error: 'capture_not_found' }
    } catch {
      return { ok: false, error: 'review_failed' }
    }

    // TODO: emit audit events once activity logging is integrated:
    //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_MATCHED  (capture linked to lead)
    //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_REVIEWED (reviewed by operator)
    // Pattern: activityEventService.recordActivity(...).catch(() => null)
    void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_MATCHED   // reference for tree-shaking safety
    void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_CAPTURE_REVIEWED  // reference for tree-shaking safety

    return { ok: true, captureId: input.captureId, status: 'matched' }
  }

  return { ok: false, error: 'invalid_input' }
}
