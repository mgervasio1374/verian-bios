'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { deleteProposalEventForWorkspace } from '@/modules/proposals/services/proposal-event-delete.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

// Soft-deletes a mis-keyed proposal event. Gated crm.companies.edit. Returns the
// event's company_id so the client can redirect back to the company.
export async function deleteProposalEventAction(
  eventId: string
): Promise<ActionResult<{ companyId: string | null }>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId/workspaceId from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.edit')

    if (!eventId) {
      return { success: false, error: 'invalid_input: eventId is required' }
    }

    const result = await deleteProposalEventForWorkspace(ctx.tenantId, ctx.workspaceId, eventId)
    if (!result.ok) {
      return { success: false, error: result.error ?? 'delete_failed' }
    }

    // Refresh the company detail, the proposal-events inbox, and the proposals page.
    revalidatePath('/[workspaceSlug]/companies/[id]', 'page')
    revalidatePath('/[workspaceSlug]/proposal-events', 'page')
    revalidatePath('/[workspaceSlug]/proposals', 'page')

    return { success: true, data: { companyId: result.companyId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
