import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { reviewEmailDraftQuality } from '@/modules/messaging/services/email-quality.service'
import * as emailQualityRepo from '@/modules/messaging/repositories/email-quality.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { runEmailRewriteLoop } from '@/modules/messaging/services/email-rewrite-loop.service'
import type { EmailQualityReviewRow } from '@/modules/messaging/repositories/email-quality.repo'

const QUALITY_TARGET_SCORE = 85

/**
 * Load, score, and persist an email quality review for the given draft.
 * Idempotent — upserts on email_draft_id so safe to call twice.
 * Throws if the draft is not found or has no body_text; callers should .catch(() => null).
 */
export async function reviewAndPersistEmailDraftQuality(
  emailDraftId: string,
  tenantId: string,
  workspaceId?: string | null
): Promise<EmailQualityReviewRow> {
  const supabase = createSupabaseServiceClient()

  const { data: draft, error: draftErr } = await supabase
    .from('email_drafts')
    .select('id, subject, body_text, lead_id, company_id, workspace_id, ai_generation_metadata')
    .eq('id', emailDraftId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (draftErr || !draft) throw new Error('Email draft not found')
  if (!draft.body_text)   throw new Error('Draft has no body text to review')

  // Resolve lead and company context for personalization scoring
  let context: { leadName?: string; companyName?: string; industry?: string; source?: string; stage?: string } | undefined
  if (draft.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('name, stage, source, company_id')
      .eq('id', draft.lead_id)
      .single()
    if (lead) {
      context = { leadName: lead.name, stage: lead.stage, source: lead.source ?? undefined }
      if (lead.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('name, industry')
          .eq('id', lead.company_id)
          .single()
        if (company) {
          context.companyName = company.name
          context.industry    = company.industry ?? undefined
        }
      }
    }
  }

  const aiMeta = (draft.ai_generation_metadata ?? {}) as Record<string, unknown>
  const templateSlug       = typeof aiMeta.template_slug       === 'string' ? aiMeta.template_slug       : undefined
  const recommendationRule = typeof aiMeta.recommendation_rule === 'string' ? aiMeta.recommendation_rule : undefined

  const effectiveWorkspace = workspaceId ?? draft.workspace_id ?? undefined

  const review = reviewEmailDraftQuality({
    tenantId,
    workspaceId:       typeof effectiveWorkspace === 'string' ? effectiveWorkspace : undefined,
    leadId:            draft.lead_id    ?? undefined,
    companyId:         draft.company_id ?? undefined,
    emailDraftId,
    subject:           draft.subject,
    bodyText:          draft.body_text,
    templateSlug,
    recommendationRule,
    context,
  })

  const stored = await emailQualityRepo.upsertEmailQualityReview(
    tenantId,
    draft.workspace_id,
    emailDraftId,
    draft.lead_id,
    draft.company_id,
    review
  )

  await activityEventService.recordActivity({
    tenantId,
    workspaceId:  typeof effectiveWorkspace === 'string' ? effectiveWorkspace : undefined,
    eventType:    ActivityEventType.EMAIL_QUALITY_REVIEWED,
    eventSource:  'email_quality_agent',
    entityType:   'email_draft',
    entityId:     emailDraftId,
    leadId:       draft.lead_id    ?? undefined,
    companyId:    draft.company_id ?? undefined,
    eventSummary: `Email quality auto-reviewed: ${review.overallScore}/100 (${review.status})`,
    metadata: {
      email_draft_id:            emailDraftId,
      lead_id:                   draft.lead_id,
      company_id:                draft.company_id,
      overall_score:             review.overallScore,
      status:                    review.status,
      rubric_version:            review.rubricVersion,
      suggested_score:           review.suggestedOverallScore ?? null,
      suggested_status:          review.suggestedStatus       ?? null,
      suggested_improvement_delta: review.suggestedOverallScore != null
        ? review.suggestedOverallScore - review.overallScore
        : null,
    },
  }).catch(() => null)

  // Auto-run rewrite loop if score is below the quality target (non-fatal)
  if (stored.overall_score < QUALITY_TARGET_SCORE) {
    await runEmailRewriteLoop({
      tenantId,
      workspaceId:  typeof effectiveWorkspace === 'string' ? effectiveWorkspace : null,
      emailDraftId,
    }).catch(() => null)
  }

  return stored
}
