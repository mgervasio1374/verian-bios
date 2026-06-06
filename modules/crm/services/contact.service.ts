import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { softDeleteRecord } from '@/lib/db/soft-delete'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'

type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']

export async function listContacts(
  ctx: RequestContext,
  opts: { companyId?: string; search?: string; limit?: number } = {}
) {
  requirePermission(ctx, 'crm.contacts.view')
  return contactRepo.listContacts({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}

export async function listContactsWithCompany(
  ctx: RequestContext,
  opts: { search?: string; limit?: number } = {}
) {
  requirePermission(ctx, 'crm.contacts.view')
  return contactRepo.listContactsWithCompany({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}

export async function getContact(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.contacts.view')
  const contact = await contactRepo.getContact(id, ctx.tenantId)
  if (!contact) throw new NotFoundError('Contact')
  return contact
}

export async function createContact(
  ctx: RequestContext,
  data: Omit<ContactInsert, 'tenant_id' | 'workspace_id' | 'created_by'>
) {
  requirePermission(ctx, 'crm.contacts.create')

  const contact = await contactRepo.createContact({
    ...data,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'contact.created', {
    contactId: contact.id,
    tenantId: ctx.tenantId,
  })

  return contact
}

export async function updateContact(
  ctx: RequestContext,
  id: string,
  data: Omit<ContactUpdate, 'tenant_id' | 'workspace_id' | 'updated_by'>
) {
  requirePermission(ctx, 'crm.contacts.edit')
  const contact = await contactRepo.updateContact(id, ctx.tenantId, {
    ...data,
    updated_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'contact.updated', { contactId: id, tenantId: ctx.tenantId })
  return contact
}

export async function deleteContact(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.contacts.edit')
  const existing = await contactRepo.getContact(id, ctx.tenantId)
  if (!existing) throw new NotFoundError('Contact')

  await softDeleteRecord('contacts', id, ctx)
  await enqueueEvent(ctx, 'contact.deleted', { contactId: id, tenantId: ctx.tenantId })
}
