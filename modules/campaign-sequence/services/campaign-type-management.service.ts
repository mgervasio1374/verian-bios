// MCM v2 A2 — Campaign Types write/management service. SEPARATE from the pinned
// read-only campaign-type.service.ts (TC-G2-S6-003/004 keep that file write-free).
// All writes are gated on messaging.manage_templates.

import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import {
  insertCampaignType,
  updateCampaignType,
  getCampaignTypeById,
} from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import type { CampaignTypeRow } from '@/modules/campaign-sequence/types'
import type { RequestContext } from '@/types/context'

// PURE: derive a slug from a campaign-type name. lowercase, non-alphanumeric runs
// → '_', trimmed of leading/trailing '_'. Empty / symbol-only input → ''.
export function slugifyCampaignTypeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Creates a custom campaign type. The slug is server-derived from the name and is
// IMMUTABLE thereafter (assets store the slug as their linkage string).
export async function createCampaignType(
  ctx: RequestContext,
  input: { name: string; description?: string | null },
): Promise<CampaignTypeRow> {
  requirePermission(ctx, 'messaging.manage_templates')

  const name = input.name.trim()
  const slug = slugifyCampaignTypeName(name)
  if (!slug) throw new Error('A campaign type name must contain letters or numbers.')

  return insertCampaignType({
    tenant_id:          ctx.tenantId,
    workspace_id:       ctx.workspaceId,
    name,
    slug,
    description:        input.description?.trim() || null,
    status:            'active',
    created_by_user_id: ctx.userId === 'system' ? null : ctx.userId,
  })
}

// Renames / re-describes a campaign type. NEVER touches slug or status.
export async function updateCampaignTypeDetails(
  ctx: RequestContext,
  id: string,
  input: { name: string; description?: string | null },
): Promise<CampaignTypeRow> {
  requirePermission(ctx, 'messaging.manage_templates')

  const existing = await getCampaignTypeById(id, ctx.tenantId, ctx.workspaceId)
  if (!existing) throw new NotFoundError('Campaign type')

  return updateCampaignType(id, ctx.tenantId, ctx.workspaceId, {
    name:        input.name.trim(),
    description: input.description?.trim() || null,
  })
}

// Toggles status (active ↔ retired). Status-only — does NOT touch retired_at, so
// it never frees/reclaims a slug (mirrors the learned-skill retire precedent).
export async function setCampaignTypeStatus(
  ctx: RequestContext,
  id: string,
  status: 'active' | 'retired',
): Promise<CampaignTypeRow> {
  requirePermission(ctx, 'messaging.manage_templates')

  const existing = await getCampaignTypeById(id, ctx.tenantId, ctx.workspaceId)
  if (!existing) throw new NotFoundError('Campaign type')

  return updateCampaignType(id, ctx.tenantId, ctx.workspaceId, { status })
}
