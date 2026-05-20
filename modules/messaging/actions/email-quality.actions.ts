'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'
import * as emailQualityRepo from '@/modules/messaging/repositories/email-quality.repo'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { EmailQualityReviewRow } from '@/modules/messaging/repositories/email-quality.repo'

const ADMIN_ROLES = new Set(['system', 'platform_admin', 'tenant_admin'])

// ---- Run quality review (manual trigger) ----

export async function reviewEmailDraftQualityAction(
  emailDraftId: string
): Promise<ActionResult<EmailQualityReviewRow>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const stored = await reviewAndPersistEmailDraftQuality(emailDraftId, ctx.tenantId)
    return { success: true, data: stored }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Get existing review ----

export async function getEmailDraftQualityReviewAction(
  emailDraftId: string
): Promise<ActionResult<EmailQualityReviewRow | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const review = await emailQualityRepo.getEmailQualityReview(emailDraftId, ctx.tenantId)
    return { success: true, data: review }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Backfill: review recent drafts that have no quality review ----

export async function runEmailQualityReviewBackfillAction(): Promise<
  ActionResult<{ scanned: number; reviewed: number; skipped: number }>
> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    if (!ADMIN_ROLES.has(ctx.roleSlug)) {
      return { success: false, error: 'Admin access required.' }
    }

    const svc = createSupabaseServiceClient()

    // Load up to 25 recent drafts with body_text
    const { data: drafts, error: draftsErr } = await svc
      .from('email_drafts')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .not('body_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(25)

    if (draftsErr) return { success: false, error: draftsErr.message }
    if (!drafts?.length) return { success: true, data: { scanned: 0, reviewed: 0, skipped: 0 } }

    // Find which already have a review
    const draftIds = drafts.map(d => d.id)
    const { data: existing } = await svc
      .from('email_quality_reviews')
      .select('email_draft_id')
      .in('email_draft_id', draftIds)
      .eq('tenant_id', ctx.tenantId)
    const alreadyReviewed = new Set((existing ?? []).map(r => r.email_draft_id))

    let reviewed = 0
    let skipped  = 0
    for (const draft of drafts) {
      if (alreadyReviewed.has(draft.id)) { skipped++; continue }
      await reviewAndPersistEmailDraftQuality(draft.id, ctx.tenantId).catch(() => null)
      reviewed++
    }

    return { success: true, data: { scanned: drafts.length, reviewed, skipped } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
