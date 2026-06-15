import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { getPipelineStages } from '@/lib/config/resolve'
import { softDeleteRecord } from '@/lib/db/soft-delete'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'

type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadUpdate = Database['public']['Tables']['leads']['Update']

// Pure, case-insensitive substring filter shared by the leads page's pipeline
// stages AND the imported "Needs Review" queue, so a single search box narrows
// both lists consistently. The lead `name` embeds the contact + company
// ("<Contact> at <Company>"), so a name match covers searching by either.
// Empty/whitespace query → pass-through (returns the input list unchanged).
export function filterLeadsByQuery<T extends { name: string | null }>(
  leads: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return leads
  return leads.filter((l) => (l.name ?? '').toLowerCase().includes(q))
}

function derivePriority(estimatedValue?: number | null): string {
  if (!estimatedValue) return 'medium'
  if (estimatedValue >= 15000) return 'critical'
  if (estimatedValue >= 8000) return 'high'
  if (estimatedValue >= 3000) return 'medium'
  return 'low'
}

export async function listLeads(
  ctx: RequestContext,
  opts: { stage?: string; status?: string; search?: string; limit?: number; offset?: number } = {}
) {
  requirePermission(ctx, 'crm.leads.view')
  return leadRepo.listLeads({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}

export async function getLead(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.leads.view')
  const lead = await leadRepo.getLead(id, ctx.tenantId)
  if (!lead) throw new NotFoundError('Lead')
  return lead
}

export async function createLead(
  ctx: RequestContext,
  data: Omit<LeadInsert, 'tenant_id' | 'workspace_id' | 'created_by' | 'priority'> & { priority?: string }
) {
  requirePermission(ctx, 'crm.leads.create')

  const priority = data.priority ?? derivePriority(data.estimated_value)

  // PROD-BUG-001 prevention: if no contact was supplied but the company has
  // exactly one contact, link it. Conservative — skip when zero or ambiguous
  // (>1), so we never guess the wrong recipient.
  let contactId = data.contact_id ?? null
  if (!contactId && data.company_id) {
    const companyContacts = await contactRepo.listContacts({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
      companyId:   data.company_id,
      limit:       2,
    }).catch(() => [])
    if (companyContacts.length === 1) contactId = companyContacts[0].id
  }

  const lead = await leadRepo.createLead({
    ...data,
    contact_id: contactId,
    priority,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'lead.created', {
    leadId: lead.id,
    name: lead.name,
    stage: lead.stage,
    priority: lead.priority,
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    companyId: lead.company_id,
    contactId: lead.contact_id,
  })

  return lead
}

export async function updateLead(
  ctx: RequestContext,
  id: string,
  data: Omit<LeadUpdate, 'tenant_id' | 'workspace_id' | 'updated_by'>
) {
  requirePermission(ctx, 'crm.leads.edit')

  const existing = await leadRepo.getLead(id, ctx.tenantId)
  if (!existing) throw new NotFoundError('Lead')

  const lead = await leadRepo.updateLead(id, ctx.tenantId, {
    ...data,
    updated_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'lead.updated', {
    leadId: id,
    tenantId: ctx.tenantId,
  })

  if (data.stage && data.stage !== existing.stage) {
    await enqueueEvent(ctx, 'lead.stage_changed', {
      leadId: id,
      fromStage: existing.stage,
      toStage: data.stage,
      tenantId: ctx.tenantId,
    })
  }

  return lead
}

export async function deleteLead(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.leads.delete')
  const existing = await leadRepo.getLead(id, ctx.tenantId)
  if (!existing) throw new NotFoundError('Lead')

  await softDeleteRecord('leads', id, ctx)

  await enqueueEvent(ctx, 'lead.deleted', {
    leadId: id,
    tenantId: ctx.tenantId,
  })
}

export async function listLeadsByStage(ctx: RequestContext) {
  requirePermission(ctx, 'crm.leads.view')
  return leadRepo.listLeadsByStage(ctx.tenantId, ctx.workspaceId)
}

// PROD-BUG-003 (#31): imported leads land with status='imported_unreviewed' and
// so render nowhere in the pipeline (which shows status='open'). Surface them
// for triage, and release them into the entry pipeline stage on demand.

export async function listImportedUnreviewedLeads(ctx: RequestContext) {
  requirePermission(ctx, 'crm.leads.view')
  return leadRepo.listLeadsByStatus(ctx.tenantId, ctx.workspaceId, 'imported_unreviewed')
}

export async function releaseImportedLeads(
  ctx: RequestContext,
  leadIds: string[],
): Promise<{ released: number }> {
  requirePermission(ctx, 'crm.leads.edit')

  const ids = Array.from(new Set((leadIds ?? []).map(s => s?.trim()).filter(Boolean)))
  if (ids.length === 0) return { released: 0 }

  // Recompute the entry stage server-side — never trust a client-supplied stage.
  // First non-terminal stage by position is the pipeline entry.
  const stages = await getPipelineStages(ctx.tenantId, 'lead')
  const entryStage = stages.filter(s => !s.is_terminal)[0]
  if (!entryStage) throw new Error('No active pipeline stage is configured.')

  let released = 0
  for (const id of ids) {
    const lead = await leadRepo.getLead(id, ctx.tenantId)
    // Tenant-scoped via getLead; only release leads that are actually awaiting review.
    if (!lead || lead.status !== 'imported_unreviewed') continue
    await leadRepo.updateLead(id, ctx.tenantId, {
      status:           'open',
      stage:            entryStage.slug,
      workflow_enabled: true,
    })
    released++
  }

  return { released }
}
