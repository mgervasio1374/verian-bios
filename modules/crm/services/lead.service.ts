import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { softDeleteRecord } from '@/lib/db/soft-delete'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'

type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadUpdate = Database['public']['Tables']['leads']['Update']

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

  const lead = await leadRepo.createLead({
    ...data,
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
