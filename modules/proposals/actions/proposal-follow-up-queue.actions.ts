'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getProposalFollowUpQueueForWorkspace } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import type { ProposalFollowUpQueueResponse } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface GetProposalFollowUpQueueActionInput {
  due?: 'overdue' | 'today' | 'upcoming' | 'all'
  followUpSequence?: number
  proposalStatus?: string | string[]
  limit?: number
  offset?: number
}

export async function getProposalFollowUpQueueAction(
  input?: GetProposalFollowUpQueueActionInput
): Promise<ActionResult<ProposalFollowUpQueueResponse>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const result = await getProposalFollowUpQueueForWorkspace(ctx.tenantId, ctx.workspaceId, {
      due:              input?.due,
      followUpSequence: input?.followUpSequence,
      proposalStatus:   input?.proposalStatus,
      limit:            input?.limit,
      offset:           input?.offset,
    })

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: {
        items:          result.items,
        summary:        result.summary,
        appliedFilters: result.appliedFilters,
        generatedAt:    result.generatedAt,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
