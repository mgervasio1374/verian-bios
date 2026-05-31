'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { createManualProposalCapture } from '@/modules/proposals/services/manual-proposal-capture.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface CreateManualProposalCaptureActionInput {
  leadId: string
  contactId?: string | null
  proposalSentAt: string
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string
  estimatedSavings?: number | null
  opportunityId?: string | null
  scheduleRuleKey?: string
}

export async function createManualProposalCaptureAction(
  input: CreateManualProposalCaptureActionInput
): Promise<ActionResult<{ proposalEventId: string; captureId: string | null; commitmentCount: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.leadId) {
      return { success: false, error: 'invalid_input: leadId is required' }
    }
    if (!input.proposalSentAt) {
      return { success: false, error: 'invalid_input: proposalSentAt is required' }
    }

    const result = await createManualProposalCapture(
      ctx.tenantId,
      ctx.workspaceId,
      ctx.userId,
      {
        leadId:            input.leadId,
        contactId:         input.contactId ?? null,
        proposalSentAt:    input.proposalSentAt,
        proposalReference: input.proposalReference ?? null,
        proposalAmount:    input.proposalAmount ?? null,
        proposalCurrency:  input.proposalCurrency,
        estimatedSavings:  input.estimatedSavings ?? null,
        opportunityId:     input.opportunityId ?? null,
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
        commitmentCount: result.commitmentIds.length,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
