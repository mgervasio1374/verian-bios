import * as companyRepo from '@/modules/crm/repositories/company.repo'
import { enqueueEvent } from '@/modules/workflow/services/event-dispatch.service'
import { softDeleteRecord } from '@/lib/db/soft-delete'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'

type CompanyInsert = Database['public']['Tables']['companies']['Insert']
type CompanyUpdate = Database['public']['Tables']['companies']['Update']

export async function listCompanies(
  ctx: RequestContext,
  opts: {
    search?: string
    status?: string
    industry?: string
    customerStatus?: 'prospect' | 'customer' | 'former_customer'
    ids?: string[]
    orderBy?: string
    orderDir?: 'asc' | 'desc'
    limit?: number
    offset?: number
  } = {}
) {
  requirePermission(ctx, 'crm.companies.view')
  return companyRepo.listCompanies({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}

export async function setCompaniesCustomerStatus(
  ctx: RequestContext,
  ids: string[],
  customerStatus: 'prospect' | 'customer' | 'former_customer',
): Promise<number> {
  requirePermission(ctx, 'crm.companies.edit')
  return companyRepo.updateCompaniesCustomerStatus(ids, customerStatus, ctx.tenantId, ctx.workspaceId)
}

export async function getCompany(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.companies.view')
  const company = await companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)
  if (!company) throw new NotFoundError('Company')
  return company
}

export async function createCompany(
  ctx: RequestContext,
  data: Omit<CompanyInsert, 'tenant_id' | 'workspace_id' | 'created_by'>
) {
  requirePermission(ctx, 'crm.companies.create')

  const company = await companyRepo.createCompany({
    ...data,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'company.created', {
    companyId: company.id,
    name: company.name,
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
  })

  return company
}

export async function updateCompany(
  ctx: RequestContext,
  id: string,
  data: Omit<CompanyUpdate, 'tenant_id' | 'workspace_id' | 'updated_by'>
) {
  requirePermission(ctx, 'crm.companies.edit')

  const company = await companyRepo.updateCompany(id, ctx.tenantId, ctx.workspaceId, {
    ...data,
    updated_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await enqueueEvent(ctx, 'company.updated', {
    companyId: id,
    tenantId: ctx.tenantId,
  })

  return company
}

export async function deleteCompany(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.companies.edit')
  const existing = await companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)
  if (!existing) throw new NotFoundError('Company')

  await softDeleteRecord('companies', id, ctx)

  await enqueueEvent(ctx, 'company.deleted', {
    companyId: id,
    tenantId: ctx.tenantId,
  })
}

export async function countCompanies(ctx: RequestContext) {
  requirePermission(ctx, 'crm.companies.view')
  return companyRepo.countCompanies(ctx.tenantId, ctx.workspaceId)
}

// Filtered count — mirrors listCompanies' filters (same opts shape) for the
// Companies page header total + pagination.
export async function countCompaniesFiltered(
  ctx: RequestContext,
  opts: {
    search?: string
    status?: string
    industry?: string
    customerStatus?: 'prospect' | 'customer' | 'former_customer'
    ids?: string[]
  } = {}
) {
  requirePermission(ctx, 'crm.companies.view')
  return companyRepo.countCompaniesFiltered({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}
