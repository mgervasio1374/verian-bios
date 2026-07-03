import type { RequestContext } from '@/types/context'
import { requirePermission } from '@/lib/auth/permissions'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import * as noteRepo from '@/modules/crm/repositories/company-note.repo'

// Company notes: operator-entered context on a company. Stored as CRM
// activities (type 'note'); additionally mirrored into activity_events
// ('note_added') so the note shows in the company's right-rail timeline.

export const NOTE_MAX_LENGTH = 4000

export async function createCompanyNote(
  ctx: RequestContext,
  input: { companyId: string; body: string },
): Promise<{ id: string }> {
  requirePermission(ctx, 'crm.companies.edit')

  const body = input.body.trim()
  if (!body) throw new Error('note_empty')
  if (body.length > NOTE_MAX_LENGTH) throw new Error('note_too_long')

  const note = await noteRepo.insertCompanyNote({
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    company_id: input.companyId,
    body,
    performed_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  // Timeline mirror — awaited but non-fatal (ISSUE-008 pattern).
  const excerpt = body.length > 120 ? `${body.slice(0, 117)}…` : body
  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'note_added',
    eventSource: 'crm_notes',
    entityType: 'activity',
    entityId: note.id,
    companyId: input.companyId,
    eventSummary: `Note: ${excerpt}`,
    metadata: { activity_id: note.id },
  }).catch(() => null)

  return note
}

export async function listCompanyNotes(
  ctx: RequestContext,
  companyId: string,
): Promise<noteRepo.CompanyNoteRow[]> {
  requirePermission(ctx, 'crm.companies.view')
  return noteRepo.listCompanyNotes(ctx.tenantId, ctx.workspaceId, companyId)
}
