'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import {
  createOpportunityFromLead,
  getOpportunityForLead,
} from '@/modules/crm/services/opportunity.service'

export async function convertLeadToOpportunityAction(
  leadId: string,
  input: { name?: string; value?: number | null; expectedCloseDate?: string | null } = {},
): Promise<ActionResult<{ opportunityId: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.opportunities.create')

    if (!leadId) return { success: false, error: 'Lead ID is required.' }

    // Guard: a lead can only be converted once.
    const existing = await getOpportunityForLead(leadId, ctx.tenantId)
    if (existing) {
      return { success: false, error: `This lead is already converted to opportunity "${existing.name}".` }
    }

    const { opportunityId } = await createOpportunityFromLead({
      leadId,
      tenantId:          ctx.tenantId,
      workspaceId:       ctx.workspaceId,
      userId:            ctx.userId,
      name:              input.name,
      value:             input.value ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
    })

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    revalidatePath('/[workspaceSlug]/opportunities', 'page')
    return { success: true, data: { opportunityId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
