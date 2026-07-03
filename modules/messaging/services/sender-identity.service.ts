import type { RequestContext } from '@/types/context'
import { requirePermission } from '@/lib/auth/permissions'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import * as identityRepo from '@/modules/messaging/repositories/sender-identity.repo'

// Sender-identity management. Invariants:
// - Everything gates on messaging.manage_templates (admin-level; base member lacks it).
// - New identities start unverified: the send path ignores them (falls back to
//   the default) until the operator confirms the sending domain/address is
//   authenticated in Resend and marks them verified.
// - Only a VERIFIED identity can become the default, and the current default
//   cannot be unverified — the default is the send path's guaranteed fallback.

const MANAGE_PERMISSION = 'messaging.manage_templates'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const SIGNATURE_MAX_LENGTH = 2000

export async function listSenderIdentities(ctx: RequestContext): Promise<identityRepo.SenderIdentityRow[]> {
  requirePermission(ctx, MANAGE_PERMISSION)
  return identityRepo.listAllSenderIdentities(ctx.tenantId)
}

export async function createSenderIdentity(
  ctx: RequestContext,
  input: { name: string; email: string; replyTo?: string | null; signature?: string | null },
): Promise<{ id: string }> {
  requirePermission(ctx, MANAGE_PERMISSION)

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const replyTo = input.replyTo?.trim() || null
  const signature = input.signature?.trim() || null

  if (!name) throw new Error('name_required')
  if (!EMAIL_PATTERN.test(email)) throw new Error('invalid_email')
  if (replyTo && !EMAIL_PATTERN.test(replyTo)) throw new Error('invalid_reply_to')
  if (signature && signature.length > SIGNATURE_MAX_LENGTH) throw new Error('signature_too_long')

  const existing = await identityRepo.findSenderIdentityByEmail(ctx.tenantId, email)
  if (existing) throw new Error('email_in_use')

  const created = await identityRepo.insertSenderIdentity({
    tenant_id: ctx.tenantId,
    name,
    email,
    reply_to: replyTo,
    signature,
    created_by: ctx.userId === 'system' ? null : ctx.userId,
  })

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'sender_identity_created',
    eventSource: 'sender_identity_management',
    entityType: 'sender_identity',
    entityId: created.id,
    eventSummary: `Sender identity created: ${name} <${email}> (unverified)`,
    metadata: { name, email, acted_by: ctx.userId },
  }).catch(() => null)

  return created
}

export async function updateSenderIdentity(
  ctx: RequestContext,
  input: { identityId: string; name?: string; replyTo?: string | null; signature?: string | null },
): Promise<void> {
  requirePermission(ctx, MANAGE_PERMISSION)

  const identity = await identityRepo.getSenderIdentityRow(ctx.tenantId, input.identityId)
  if (!identity) throw new Error('identity_not_found')

  const patch: { name?: string; reply_to?: string | null; signature?: string | null } = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('name_required')
    patch.name = name
  }
  if (input.replyTo !== undefined) {
    const replyTo = input.replyTo?.trim() || null
    if (replyTo && !EMAIL_PATTERN.test(replyTo)) throw new Error('invalid_reply_to')
    patch.reply_to = replyTo
  }
  if (input.signature !== undefined) {
    const signature = input.signature?.trim() || null
    if (signature && signature.length > SIGNATURE_MAX_LENGTH) throw new Error('signature_too_long')
    patch.signature = signature
  }
  if (Object.keys(patch).length === 0) return

  await identityRepo.updateSenderIdentity(ctx.tenantId, input.identityId, patch)

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'sender_identity_updated',
    eventSource: 'sender_identity_management',
    entityType: 'sender_identity',
    entityId: input.identityId,
    eventSummary: `Sender identity updated: ${identity.name} <${identity.email}>`,
    metadata: { fields: Object.keys(patch), acted_by: ctx.userId },
  }).catch(() => null)
}

export async function setSenderIdentityVerified(
  ctx: RequestContext,
  input: { identityId: string; verified: boolean },
): Promise<void> {
  requirePermission(ctx, MANAGE_PERMISSION)

  const identity = await identityRepo.getSenderIdentityRow(ctx.tenantId, input.identityId)
  if (!identity) throw new Error('identity_not_found')
  if (!input.verified && identity.is_default) throw new Error('cannot_unverify_default')
  if (identity.is_verified === input.verified) return

  await identityRepo.setSenderIdentityVerified(ctx.tenantId, input.identityId, input.verified)

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'sender_identity_verified',
    eventSource: 'sender_identity_management',
    entityType: 'sender_identity',
    entityId: input.identityId,
    eventSummary: `Sender identity ${input.verified ? 'marked verified' : 'unverified'}: ${identity.email}`,
    metadata: { verified: input.verified, acted_by: ctx.userId },
  }).catch(() => null)
}

export async function makeDefaultSenderIdentity(
  ctx: RequestContext,
  input: { identityId: string },
): Promise<void> {
  requirePermission(ctx, MANAGE_PERMISSION)

  const identity = await identityRepo.getSenderIdentityRow(ctx.tenantId, input.identityId)
  if (!identity) throw new Error('identity_not_found')
  if (!identity.is_verified) throw new Error('not_verified')
  if (identity.is_default) return

  await identityRepo.setDefaultSenderIdentity(ctx.tenantId, input.identityId)

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'sender_identity_default_changed',
    eventSource: 'sender_identity_management',
    entityType: 'sender_identity',
    entityId: input.identityId,
    eventSummary: `Default sender identity changed to ${identity.name} <${identity.email}>`,
    metadata: { acted_by: ctx.userId },
  }).catch(() => null)
}
