'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { updateProposalStatus } from '@/modules/proposals/services/proposal-status.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface UpdateProposalStatusActionInput {
  proposalEventId: string
  status: string
}

export async function updateProposalStatusAction(
  input: UpdateProposalStatusActionInput
): Promise<ActionResult<{ proposalEventId: string; status: string; closedCommitmentIds: string[] }>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.proposalEventId) {
      return { success: false, error: 'invalid_input: proposalEventId is required' }
    }
    if (!input.status) {
      return { success: false, error: 'invalid_input: status is required' }
    }

    const result = await updateProposalStatus(ctx.tenantId, ctx.workspaceId, {
      proposalEventId: input.proposalEventId,
      status:          input.status,
    })

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: {
        proposalEventId:    result.proposalEventId,
        status:             result.status,
        closedCommitmentIds: result.closedCommitmentIds,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
