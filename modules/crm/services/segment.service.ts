import * as segmentRepo from '@/modules/crm/repositories/segment.repo'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'

export async function listSegments(ctx: RequestContext) {
  requirePermission(ctx, 'crm.companies.view')
  return segmentRepo.listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId)
}

export async function getSegment(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.companies.view')
  const segment = await segmentRepo.getSegmentById(id, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')
  return segment
}

export async function createSegment(
  ctx: RequestContext,
  data: { name: string; description?: string | null }
) {
  requirePermission(ctx, 'crm.companies.create')

  return segmentRepo.insertSegment({
    tenant_id:          ctx.tenantId,
    workspace_id:       ctx.workspaceId,
    name:               data.name,
    description:        data.description ?? null,
    created_by_user_id: ctx.userId === 'system' ? null : ctx.userId,
  })
}

export async function updateSegment(
  ctx: RequestContext,
  id: string,
  data: { name?: string; description?: string | null }
) {
  requirePermission(ctx, 'crm.companies.edit')
  const existing = await segmentRepo.getSegmentById(id, ctx.tenantId, ctx.workspaceId)
  if (!existing) throw new NotFoundError('Segment')

  return segmentRepo.updateSegment(id, ctx.tenantId, ctx.workspaceId, data)
}

export async function deleteSegment(ctx: RequestContext, id: string) {
  requirePermission(ctx, 'crm.companies.edit')
  const existing = await segmentRepo.getSegmentById(id, ctx.tenantId, ctx.workspaceId)
  if (!existing) throw new NotFoundError('Segment')

  await segmentRepo.deleteSegment(id, ctx.tenantId, ctx.workspaceId)
}

export async function addCompanyToSegment(
  ctx: RequestContext,
  segmentId: string,
  companyId: string
) {
  requirePermission(ctx, 'crm.companies.edit')
  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  await segmentRepo.addCompanyToSegment(companyId, segmentId, ctx.tenantId)
}

const MAX_BULK_ADD_COMPANIES = 500

export async function addCompaniesToSegment(
  ctx: RequestContext,
  segmentId: string,
  companyIds: string[]
) {
  requirePermission(ctx, 'crm.companies.edit')

  if (companyIds.length > MAX_BULK_ADD_COMPANIES) {
    throw new Error(
      `Cannot add more than ${MAX_BULK_ADD_COMPANIES} companies to a segment at once. Narrow the selection and try again.`
    )
  }

  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  await segmentRepo.addCompaniesToSegment(companyIds, segmentId, ctx.tenantId)
}

export async function listSegmentsForCompany(ctx: RequestContext, companyId: string) {
  requirePermission(ctx, 'crm.companies.view')
  return segmentRepo.listSegmentsForCompany(companyId, ctx.tenantId)
}

export async function listCompanyIdsForSegment(ctx: RequestContext, segmentId: string) {
  requirePermission(ctx, 'crm.companies.view')
  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  return segmentRepo.listCompanyIdsForSegment(segmentId, ctx.tenantId)
}

export async function removeCompanyFromSegment(
  ctx: RequestContext,
  segmentId: string,
  companyId: string
) {
  requirePermission(ctx, 'crm.companies.edit')
  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  await segmentRepo.removeCompanyFromSegment(companyId, segmentId)
}

export async function listSegmentMembers(ctx: RequestContext, segmentId: string) {
  requirePermission(ctx, 'crm.companies.view')
  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  return segmentRepo.listSegmentMembers(segmentId, ctx.tenantId)
}

export async function searchCompaniesNotInSegment(
  ctx: RequestContext,
  segmentId: string,
  search: string
) {
  requirePermission(ctx, 'crm.companies.view')
  const segment = await segmentRepo.getSegmentById(segmentId, ctx.tenantId, ctx.workspaceId)
  if (!segment) throw new NotFoundError('Segment')

  return segmentRepo.searchCompaniesNotInSegment(segmentId, ctx.tenantId, ctx.workspaceId, search)
}
