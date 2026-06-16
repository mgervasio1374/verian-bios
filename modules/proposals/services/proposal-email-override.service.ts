import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'

// Operator override for the "Approve & Send" proposal email. Stored on the
// proposal_events.metadata jsonb (no migration) and honored at send time by
// approveAndSendProposal. Editable only while the proposal is still a draft.

const SEND = 'messaging.send_emails'

export type ProposalEmailOverrideError = 'proposal_not_found' | 'not_editable'

export async function saveProposalEmailOverride(
  ctx: RequestContext,
  eventId: string,
  override: { subject?: string | null; bodyText?: string | null },
): Promise<void> {
  requirePermission(ctx, SEND)

  const event = await eventRepo.getProposalEventById(ctx.tenantId, ctx.workspaceId, eventId)
  if (!event) throw new NotFoundError('Proposal event')
  if (event.proposal_status !== 'draft') throw new Error('not_editable')

  // Normalize: store trimmed strings, drop empties so a blank field falls back
  // to the default at compose time.
  const subject  = override.subject?.trim()  || null
  const bodyText = override.bodyText?.trim() || null

  await eventRepo.setProposalEmailOverride(ctx.tenantId, ctx.workspaceId, eventId, { subject, bodyText })
}

export async function clearProposalEmailOverride(
  ctx: RequestContext,
  eventId: string,
): Promise<void> {
  requirePermission(ctx, SEND)

  const event = await eventRepo.getProposalEventById(ctx.tenantId, ctx.workspaceId, eventId)
  if (!event) throw new NotFoundError('Proposal event')
  if (event.proposal_status !== 'draft') throw new Error('not_editable')

  await eventRepo.setProposalEmailOverride(ctx.tenantId, ctx.workspaceId, eventId, null)
}
