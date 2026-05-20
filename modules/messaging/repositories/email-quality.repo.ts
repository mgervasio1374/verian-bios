import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type { EmailQualityReview } from '@/modules/messaging/services/email-quality.service'

type EmailQualityReviewRow = Database['public']['Tables']['email_quality_reviews']['Row']

export type { EmailQualityReviewRow }

export async function upsertEmailQualityReview(
  tenantId:      string,
  workspaceId:   string | null,
  emailDraftId:  string,
  leadId:        string | null,
  companyId:     string | null,
  review:        EmailQualityReview
): Promise<EmailQualityReviewRow> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('email_quality_reviews')
    .upsert(
      {
        tenant_id:             tenantId,
        workspace_id:          workspaceId,
        email_draft_id:        emailDraftId,
        lead_id:               leadId,
        company_id:            companyId,
        overall_score:         review.overallScore,
        subject_score:         review.subjectScore,
        opening_score:         review.openingScore,
        personalization_score: review.personalizationScore,
        value_clarity_score:   review.valueClarityScore,
        cta_score:             review.ctaScore,
        trust_score:           review.trustScore,
        brevity_score:         review.brevityScore,
        spam_risk_score:       review.spamRiskScore,
        brand_fit_score:       review.brandFitScore,
        human_tone_score:      review.humanToneScore,
        status:                review.status,
        strengths:             review.strengths,
        weaknesses:            review.weaknesses,
        risk_flags:            review.riskFlags,
        suggested_subject:             review.suggestedSubject           ?? null,
        suggested_body:                review.suggestedBody              ?? null,
        review_summary:                review.reviewSummary,
        rubric_version:                review.rubricVersion,
        suggested_overall_score:       review.suggestedOverallScore      ?? null,
        suggested_status:              review.suggestedStatus            ?? null,
        suggested_weaknesses:          review.suggestedWeaknesses        ?? [],
        suggested_risk_flags:          review.suggestedRiskFlags         ?? [],
        suggested_review_summary:      review.suggestedReviewSummary     ?? null,
      },
      { onConflict: 'email_draft_id' }
    )
    .select()
    .single()

  if (error) throw new Error(`upsertEmailQualityReview: ${error.message}`)
  return data
}

export async function updateEmailQualityReviewLoopResult(
  emailDraftId:        string,
  tenantId:            string,
  loopResult: {
    bestVersionId:     string | null
    bestVersionNumber: number
    bestVersionScore:  number
    loopStatus:        string
    iterations:        number
  }
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('email_quality_reviews')
    .update({
      best_version_id:     loopResult.bestVersionId,
      best_version_number: loopResult.bestVersionNumber,
      best_version_score:  loopResult.bestVersionScore,
      rewrite_loop_status: loopResult.loopStatus,
      rewrite_iterations:  loopResult.iterations,
    })
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
}

export async function getEmailQualityReview(
  emailDraftId: string,
  tenantId:     string
): Promise<EmailQualityReviewRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_quality_reviews')
    .select('*')
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ?? null
}
