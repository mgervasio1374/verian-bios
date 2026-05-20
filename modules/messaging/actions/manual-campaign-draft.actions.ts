'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { generateManualCampaignDraft } from '@/modules/messaging/services/manual-campaign-draft.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

const VALID_CAMPAIGN_TYPES = new Set([
  'new_lead_outreach',
  'statement_review_followup',
  'processing_cost_review',
  'home_services_outreach',
  'reengagement',
])

export async function generateManualCampaignDraftAction(
  leadId:       string,
  campaignType: string
): Promise<ActionResult<{ draftId: string; approvalRequestId: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!leadId)                            return { success: false, error: 'Lead ID is required.' }
    if (!VALID_CAMPAIGN_TYPES.has(campaignType)) {
      return { success: false, error: `Invalid campaign type: ${campaignType}` }
    }

    const result = await generateManualCampaignDraft({
      tenantId:     ctx.tenantId,
      workspaceId:  ctx.workspaceId,
      leadId,
      campaignType,
      requestedBy:  ctx.userId === 'system' ? undefined : ctx.userId,
    })

    if (!result.ok) return { success: false, error: result.reason }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: { draftId: result.draftId, approvalRequestId: result.approvalRequestId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
