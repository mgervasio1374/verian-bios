'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as scoringPipeline from '@/modules/intelligence/services/scoring-pipeline.service'
import * as emailDraftService from '@/modules/messaging/services/email-draft.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface LeadScoringResult {
  fitScore:       number
  urgencyScore:   number
  ruleMatched:    string | undefined
  recommendation: {
    id:       string
    title:    string
    body:     string | null
    priority: string
  }
  draftCreated:     boolean
  draftId:          string | null
  draftSkipReason:  string | null
}

export async function triggerLeadScoringAction(
  leadId: string
): Promise<ActionResult<LeadScoringResult>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    // Confirm lead belongs to this tenant
    const lead = await leadRepo.getLead(leadId, ctx.tenantId)
    if (!lead) return { success: false, error: 'Lead not found.' }

    // Run full pipeline: fit score + urgency score + recommendation (all DB-persisted)
    const pipeline = await scoringPipeline.runLeadScoringPipeline(ctx, leadId, null)

    const ruleMatched = (pipeline.recommendation.raw_output as Record<string, unknown>)
      ?.rule_matched as string | undefined

    // Only attempt draft creation if no active draft exists — avoid superseding an in-flight approval
    let draftCreated    = false
    let draftId:         string | null = null
    let draftSkipReason: string | null = null

    const existingDraft = await emailDraftRepo.getPendingDraftForLead(ctx.tenantId, leadId)
    if (existingDraft) {
      draftSkipReason = 'existing_draft_preserved'
    } else {
      const draftResult = await emailDraftService.createLeadEmailDraft(ctx, leadId, null)
      if (draftResult.ok) {
        draftCreated    = true
        draftId         = draftResult.draftId
      } else {
        draftSkipReason = draftResult.reason
      }
    }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')

    return {
      success: true,
      data: {
        fitScore:     pipeline.fitScore.score,
        urgencyScore: pipeline.urgencyScore.score,
        ruleMatched,
        recommendation: {
          id:       pipeline.recommendation.id,
          title:    pipeline.recommendation.title,
          body:     pipeline.recommendation.body,
          priority: pipeline.recommendation.priority,
        },
        draftCreated,
        draftId,
        draftSkipReason,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
