'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { convertCaptureToProposalEvent } from '@/modules/proposals/services/capture-to-event-conversion.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface ConvertCaptureToProposalEventActionInput {
  captureId: string
  proposalSentAt: string
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string
  estimatedSavings?: number | null
  scheduleRuleKey?: string
}

export async function convertCaptureToProposalEventAction(
  input: ConvertCaptureToProposalEventActionInput
): Promise<ActionResult<{
  proposalEventId: string
  captureId: string
  commitmentCount: number
}>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId, workspaceId, and userId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.captureId) {
      return { success: false, error: 'invalid_input: captureId is required' }
    }
    if (!input.proposalSentAt) {
      return { success: false, error: 'invalid_input: proposalSentAt is required' }
    }

    const result = await convertCaptureToProposalEvent(
      ctx.tenantId,
      ctx.workspaceId,
      ctx.userId,
      {
        captureId:         input.captureId,
        proposalSentAt:    input.proposalSentAt,
        proposalReference: input.proposalReference ?? null,
        proposalAmount:    input.proposalAmount ?? null,
        proposalCurrency:  input.proposalCurrency,
        estimatedSavings:  input.estimatedSavings ?? null,
        scheduleRuleKey:   input.scheduleRuleKey,
      }
    )

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: {
        proposalEventId: result.proposalEventId,
        captureId:       result.captureId,
        commitmentCount: result.commitmentCount,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
