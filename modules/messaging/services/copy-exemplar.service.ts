import * as exemplarRepo from '@/modules/messaging/repositories/copy-exemplar.repo'
import { mapRelationshipToSkillSlug } from '@/modules/messaging/copywriting/rewrite-llm'
import { requirePermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/auth/errors'
import type { RequestContext } from '@/types/context'
import type { CopyExemplarRow } from '@/modules/messaging/repositories/copy-exemplar.repo'

// The four rewrite context skill slugs an authored exemplar may target.
export const EXEMPLAR_SKILL_SLUGS = [
  'cold_outreach',
  'new_inquiry_response',
  'statement_review_follow_up',
  're_engagement',
] as const

const MANAGE = 'messaging.manage_templates'

export async function listExemplars(ctx: RequestContext): Promise<CopyExemplarRow[]> {
  requirePermission(ctx, MANAGE)
  return exemplarRepo.listExemplars(ctx.tenantId)
}

// Manual authoring: capture a canonical "house voice" email for a context.
export async function createExemplar(
  ctx: RequestContext,
  input: { skillSlug: string; subject: string; body: string; relationshipContext?: string | null },
): Promise<CopyExemplarRow> {
  requirePermission(ctx, MANAGE)

  if (!input.subject.trim()) throw new Error('Subject is required.')
  if (!input.body.trim())    throw new Error('Body is required.')
  if (!(EXEMPLAR_SKILL_SLUGS as readonly string[]).includes(input.skillSlug)) {
    throw new Error('Invalid skill.')
  }

  return exemplarRepo.insertExemplar({
    tenant_id:            ctx.tenantId,
    workspace_id:         ctx.workspaceId ?? null,
    skill_slug:           input.skillSlug,
    relationship_context: input.relationshipContext ?? null,
    subject:              input.subject.trim(),
    body_text:            input.body.trim(),
    source:               'authored',
    created_by:           ctx.userId === 'system' ? null : ctx.userId,
  })
}

// Promote an existing rewrite variant into an exemplar — captures the operator's
// human review as durable, compounding voice knowledge. skill_slug is derived
// from the version's relationship_context (fallback cold_outreach).
export async function promoteVersionToExemplar(
  ctx: RequestContext,
  emailDraftVersionId: string,
): Promise<CopyExemplarRow> {
  requirePermission(ctx, MANAGE)

  const version = await exemplarRepo.loadVersionForExemplar(emailDraftVersionId, ctx.tenantId)
  if (!version) throw new NotFoundError('Email draft version')

  const relationshipContext =
    typeof version.metadata?.relationship_context === 'string'
      ? (version.metadata.relationship_context as string)
      : null
  const skillSlug = mapRelationshipToSkillSlug(relationshipContext ?? 'cold_outreach')

  return exemplarRepo.insertExemplar({
    tenant_id:            ctx.tenantId,
    workspace_id:         ctx.workspaceId ?? null,
    skill_slug:           skillSlug,
    relationship_context: relationshipContext,
    subject:              version.subject,
    body_text:            version.body_text,
    source:               'promoted',
    source_version_id:    emailDraftVersionId,
    created_by:           ctx.userId === 'system' ? null : ctx.userId,
  })
}

export async function deactivateExemplar(ctx: RequestContext, id: string): Promise<void> {
  requirePermission(ctx, MANAGE)
  await exemplarRepo.deactivateExemplar(id, ctx.tenantId)
}
