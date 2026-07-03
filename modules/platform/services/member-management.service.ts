import crypto from 'node:crypto'
import type { RequestContext } from '@/types/context'
import { requirePermission } from '@/lib/auth/permissions'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import * as memberRepo from '@/modules/platform/repositories/member.repo'
import * as adminUsers from '@/lib/auth/admin-users'

// User Management service (audit gap: the settings page was a read-only stub;
// users were created via SQL/admin API by hand).
//
// Invariants:
// - User creation goes through the GoTrue admin API ONLY — raw-SQL crypt()
//   hashes are proven not to verify against production GoTrue.
// - Removal is a soft revoke (status='revoked'): resolveMembership filters
//   status='active', and UNIQUE (workspace_id, user_id) means re-adding a
//   removed user REACTIVATES the same row.
// - platform_admin / tenant_admin memberships are never mutated from this
//   surface — those are managed at the platform level, not the workspace page.
// - You cannot mutate your own membership (no self-lockout mid-session).
// - The last active admin of a workspace can be neither demoted nor removed.

export const MANAGE_MEMBERS_PERMISSION = 'workspace.manage_members'

// Roles assignable from this page. platform/tenant admin assignment is a
// platform-level operation, deliberately excluded.
export const ASSIGNABLE_ROLE_SLUGS = ['workspace_admin', 'member', 'viewer'] as const
export type AssignableRoleSlug = (typeof ASSIGNABLE_ROLE_SLUGS)[number]

// Roles that count toward the "last admin" guard.
export const ADMIN_ROLE_SLUGS = ['platform_admin', 'tenant_admin', 'workspace_admin']

// Roles this page refuses to touch.
const PROTECTED_ROLE_SLUGS = ['platform_admin', 'tenant_admin']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface WorkspaceMember {
  membershipId: string
  userId: string
  email: string | null
  roleSlug: string
  roleName: string
  joinedAt: string | null
  lastSignInAt: string | null
  isSelf: boolean
  isProtected: boolean
}

export interface CreateWorkspaceUserResult {
  userId: string
  email: string
  roleSlug: string
  // Present ONLY when a brand-new auth user was created — shown once, never stored.
  tempPassword: string | null
  reactivated: boolean
}

// Readable one-time password: prefix + 3 groups from an unambiguous alphabet
// (no 0/O/1/l/I). ~62 bits of entropy — plenty for a hand-delivered temp
// credential the user changes at first login.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
export function generateTempPassword(): string {
  const group = (len: number) =>
    Array.from(crypto.randomBytes(len))
      .map((b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length])
      .join('')
  return `Verian-${group(4)}-${group(4)}-${group(4)}`
}

function isDuplicateUserError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return message.includes('already') || message.includes('duplicate') || message.includes('exists')
}

export async function listWorkspaceMembers(ctx: RequestContext): Promise<WorkspaceMember[]> {
  requirePermission(ctx, MANAGE_MEMBERS_PERMISSION)
  const memberships = await memberRepo.listActiveMemberships(ctx.tenantId, ctx.workspaceId)
  const emailMap = await adminUsers.listAuthUsersByIds(memberships.map((m) => m.user_id))
  return memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    email: emailMap.get(m.user_id)?.email ?? null,
    roleSlug: m.role_slug,
    roleName: m.role_name,
    joinedAt: m.joined_at ?? m.created_at,
    lastSignInAt: emailMap.get(m.user_id)?.lastSignInAt ?? null,
    isSelf: m.user_id === ctx.userId,
    isProtected: PROTECTED_ROLE_SLUGS.includes(m.role_slug),
  }))
}

export async function listAssignableRoles(ctx: RequestContext): Promise<memberRepo.RoleRow[]> {
  requirePermission(ctx, MANAGE_MEMBERS_PERMISSION)
  const roles = await memberRepo.listSystemRolesBySlugs([...ASSIGNABLE_ROLE_SLUGS])
  // Stable, meaningful order: admin first, then member, then viewer.
  return roles.sort(
    (a, b) =>
      ASSIGNABLE_ROLE_SLUGS.indexOf(a.slug as AssignableRoleSlug) -
      ASSIGNABLE_ROLE_SLUGS.indexOf(b.slug as AssignableRoleSlug),
  )
}

export async function createWorkspaceUser(
  ctx: RequestContext,
  input: { email: string; roleSlug: string },
): Promise<CreateWorkspaceUserResult> {
  requirePermission(ctx, MANAGE_MEMBERS_PERMISSION)

  const email = input.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new Error('invalid_email')
  if (!(ASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(input.roleSlug)) {
    throw new Error('invalid_role')
  }

  const roles = await memberRepo.listSystemRolesBySlugs([input.roleSlug])
  const role = roles[0]
  if (!role) throw new Error('invalid_role')

  // Create the auth user; on duplicate, fall back to the existing account
  // (the natural "add an existing user to this workspace" case).
  let userId: string
  let tempPassword: string | null = null
  let createdNewAuthUser = false
  try {
    const password = generateTempPassword()
    const created = await adminUsers.createAuthUser(email, password)
    userId = created.id
    tempPassword = password
    createdNewAuthUser = true
  } catch (err) {
    if (!isDuplicateUserError(err)) throw err
    const existing = await adminUsers.findAuthUserByEmail(email)
    if (!existing) throw new Error('user_lookup_failed')
    userId = existing.id
  }

  // Membership: reactivate a revoked row, reject an active one, else insert.
  const existingMembership = await memberRepo.getMembershipForUser(
    ctx.tenantId, ctx.workspaceId, userId,
  )
  let reactivated = false
  if (existingMembership) {
    if (existingMembership.status === 'active') throw new Error('already_a_member')
    await memberRepo.updateMembership(ctx.tenantId, ctx.workspaceId, existingMembership.id, {
      role_id: role.id,
      status: 'active',
    })
    reactivated = true
  } else {
    try {
      await memberRepo.insertMembership({
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        user_id: userId,
        role_id: role.id,
        invited_by: ctx.userId === 'system' ? null : ctx.userId,
      })
    } catch (err) {
      // Compensate: never leave an orphaned brand-new auth user behind.
      if (createdNewAuthUser) await adminUsers.deleteAuthUser(userId).catch(() => null)
      throw err
    }
  }

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'member_created',
    eventSource: 'member_management',
    entityType: 'membership',
    eventSummary: `${reactivated ? 'Reactivated' : 'Added'} workspace member ${email} as ${input.roleSlug}`,
    metadata: {
      member_user_id: userId,
      email,
      role_slug: input.roleSlug,
      new_auth_user: createdNewAuthUser,
      reactivated,
      acted_by: ctx.userId,
    },
  }).catch(() => null)

  return { userId, email, roleSlug: input.roleSlug, tempPassword, reactivated }
}

async function loadMutableMembership(
  ctx: RequestContext,
  membershipId: string,
): Promise<memberRepo.MembershipWithRole> {
  const membership = await memberRepo.getMembershipById(ctx.tenantId, ctx.workspaceId, membershipId)
  if (!membership || membership.status !== 'active') throw new Error('member_not_found')
  if (membership.user_id === ctx.userId) throw new Error('cannot_modify_self')
  if (PROTECTED_ROLE_SLUGS.includes(membership.role_slug)) throw new Error('protected_role')
  return membership
}

async function assertNotLastAdmin(
  ctx: RequestContext,
  membership: memberRepo.MembershipWithRole,
): Promise<void> {
  if (!ADMIN_ROLE_SLUGS.includes(membership.role_slug)) return
  const adminCount = await memberRepo.countActiveAdminMemberships(
    ctx.tenantId, ctx.workspaceId, ADMIN_ROLE_SLUGS,
  )
  if (adminCount <= 1) throw new Error('last_admin')
}

export async function changeMemberRole(
  ctx: RequestContext,
  input: { membershipId: string; roleSlug: string },
): Promise<void> {
  requirePermission(ctx, MANAGE_MEMBERS_PERMISSION)
  if (!(ASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(input.roleSlug)) {
    throw new Error('invalid_role')
  }
  const membership = await loadMutableMembership(ctx, input.membershipId)
  if (membership.role_slug === input.roleSlug) return

  // Demoting an admin needs another admin left standing.
  if (!ADMIN_ROLE_SLUGS.includes(input.roleSlug)) await assertNotLastAdmin(ctx, membership)

  const roles = await memberRepo.listSystemRolesBySlugs([input.roleSlug])
  const role = roles[0]
  if (!role) throw new Error('invalid_role')

  await memberRepo.updateMembership(ctx.tenantId, ctx.workspaceId, membership.id, {
    role_id: role.id,
  })

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'member_role_changed',
    eventSource: 'member_management',
    entityType: 'membership',
    entityId: membership.id,
    eventSummary: `Member role changed: ${membership.role_slug} → ${input.roleSlug}`,
    metadata: {
      member_user_id: membership.user_id,
      previous_role: membership.role_slug,
      new_role: input.roleSlug,
      acted_by: ctx.userId,
    },
  }).catch(() => null)
}

export async function removeMember(
  ctx: RequestContext,
  input: { membershipId: string },
): Promise<void> {
  requirePermission(ctx, MANAGE_MEMBERS_PERMISSION)
  const membership = await loadMutableMembership(ctx, input.membershipId)
  await assertNotLastAdmin(ctx, membership)

  await memberRepo.updateMembership(ctx.tenantId, ctx.workspaceId, membership.id, {
    status: 'revoked',
  })

  await recordActivity({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    eventType: 'member_removed',
    eventSource: 'member_management',
    entityType: 'membership',
    entityId: membership.id,
    eventSummary: `Workspace member removed (${membership.role_slug})`,
    metadata: {
      member_user_id: membership.user_id,
      role_slug: membership.role_slug,
      acted_by: ctx.userId,
    },
  }).catch(() => null)
}
