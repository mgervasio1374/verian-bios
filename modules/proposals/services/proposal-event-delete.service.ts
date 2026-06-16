import { getProposalEventById, softDeleteProposalEvent } from '@/modules/proposals/repositories/proposal-events.repo'

export interface DeleteProposalEventResult {
  ok:        boolean
  error?:    string
  companyId: string | null
}

// Loads the event first (to capture its company_id for the post-delete redirect),
// then soft-deletes it. Tenant/workspace-scoped via the repo. Returns the company
// id so the caller can navigate back to the company.
export async function deleteProposalEventForWorkspace(
  tenantId:    string,
  workspaceId: string,
  eventId:     string,
): Promise<DeleteProposalEventResult> {
  const event = await getProposalEventById(tenantId, workspaceId, eventId)
  if (!event) return { ok: false, error: 'not_found', companyId: null }

  await softDeleteProposalEvent(tenantId, workspaceId, eventId)
  return { ok: true, companyId: event.company_id ?? null }
}
