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
