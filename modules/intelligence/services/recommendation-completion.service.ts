import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

export interface RecommendationCompletionInput {
  tenantId:           string
  workspaceId?:       string
  subjectType:        string    // 'lead' or 'company'
  subjectId:          string
  companyId?:         string    // for activity event FK
  leadId?:            string    // for activity event FK (when subjectType='lead')
  reason:             string
  approvalRequestId?: string
  emailDraftId?:      string
  workflowRunId?:     string
}

// Marks all active (pending/new/reviewed) recommendations for a subject as
// accepted/acted_on, then records a recommendation_completed activity event.
// Returns the number of recommendations updated (0 if none were pending).
// Never throws — callers should .catch(() => null) if they want non-fatal behavior.
export async function completeRecommendationsForApprovedAction(
  input: RecommendationCompletionInput
): Promise<number> {
  const count = await recommendationRepo.markActiveRecommendationsResolvedForSubject(
    input.tenantId,
    input.subjectType,
    input.subjectId,
    {
      outcomeNotes:  input.reason,
      outcomeStatus: 'acted_on',
    }
  )

  if (count > 0) {
    await activityEventService.recordActivity({
      tenantId:     input.tenantId,
      workspaceId:  input.workspaceId,
      eventType:    ActivityEventType.RECOMMENDATION_COMPLETED,
      eventSource:  'approval_flow',
      entityType:   input.subjectType,
      entityId:     input.subjectId,
      companyId:    input.companyId,
      leadId:       input.leadId ?? (input.subjectType === 'lead' ? input.subjectId : undefined),
      eventSummary: `${count} recommendation(s) completed: ${input.reason}`,
      metadata: {
        recommendations_completed: count,
        approval_request_id:       input.approvalRequestId ?? null,
        email_draft_id:            input.emailDraftId      ?? null,
        workflow_run_id:           input.workflowRunId     ?? null,
        reason:                    input.reason,
      },
    }).catch(() => null)
  }

  return count
}
