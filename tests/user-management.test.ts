// User Management slice — behavioral tests for the member-management service.
// Covers the guard invariants: permission gate, GoTrue-only creation with
// one-time temp password, existing-user add, revoked-row reactivation,
// compensating cleanup, self/protected/last-admin mutation guards, and the
// soft-revoke removal contract. TC-UM-01..10

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RequestContext } from '@/types/context'

// ---- Mocks ------------------------------------------------------------------

const repo = vi.hoisted(() => ({
  memberships: [] as Array<Record<string, unknown>>,
  membershipForUser: null as Record<string, unknown> | null,
  membershipById: null as Record<string, unknown> | null,
  adminCount: 2,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ membershipId: string; patch: Record<string, unknown> }>,
  insertThrows: false,
  roles: [
    { id: 'role-wa', slug: 'workspace_admin', name: 'Workspace Admin', description: null },
    { id: 'role-m', slug: 'member', name: 'Member', description: null },
    { id: 'role-v', slug: 'viewer', name: 'Viewer', description: null },
  ],
}))
vi.mock('@/modules/platform/repositories/member.repo', () => ({
  listActiveMemberships: vi.fn(async () => repo.memberships),
  getMembershipById: vi.fn(async () => repo.membershipById),
  getMembershipForUser: vi.fn(async () => repo.membershipForUser),
  insertMembership: vi.fn(async (input: Record<string, unknown>) => {
    if (repo.insertThrows) throw new Error('insertMembership: boom')
    repo.inserts.push(input)
    return { id: 'mem-new' }
  }),
  updateMembership: vi.fn(async (_t: string, _w: string, membershipId: string, patch: Record<string, unknown>) => {
    repo.updates.push({ membershipId, patch })
  }),
  countActiveAdminMemberships: vi.fn(async () => repo.adminCount),
  listSystemRolesBySlugs: vi.fn(async (slugs: string[]) =>
    repo.roles.filter((r) => slugs.includes(r.slug))),
}))

const auth = vi.hoisted(() => ({
  createThrows: null as string | null,
  createdUsers: [] as Array<{ email: string; password: string }>,
  deleted: [] as string[],
  existingByEmail: null as { id: string; email: string } | null,
  emailMap: new Map<string, { id: string; email: string | null; createdAt: string | null; lastSignInAt: string | null }>(),
  passwordSets: [] as Array<{ userId: string; password: string }>,
}))
vi.mock('@/lib/auth/admin-users', () => ({
  createAuthUser: vi.fn(async (email: string, password: string) => {
    if (auth.createThrows) throw new Error(auth.createThrows)
    auth.createdUsers.push({ email, password })
    return { id: 'user-new', email, createdAt: null, lastSignInAt: null }
  }),
  deleteAuthUser: vi.fn(async (id: string) => { auth.deleted.push(id) }),
  findAuthUserByEmail: vi.fn(async () => auth.existingByEmail
    ? { ...auth.existingByEmail, createdAt: null, lastSignInAt: null }
    : null),
  listAuthUsersByIds: vi.fn(async () => auth.emailMap),
  setAuthUserPassword: vi.fn(async (userId: string, password: string) => {
    auth.passwordSets.push({ userId, password })
  }),
}))

const audit = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async (e: Record<string, unknown>) => { audit.events.push(e) }),
}))

import {
  listWorkspaceMembers,
  createWorkspaceUser,
  changeMemberRole,
  removeMember,
  resetMemberPassword,
  generateTempPassword,
  MANAGE_MEMBERS_PERMISSION,
} from '@/modules/platform/services/member-management.service'

// ---- Context helpers ---------------------------------------------------------

function ctxWith(permissions: string[], roleSlug = 'workspace_admin'): RequestContext {
  return {
    tenantId: 't-1',
    workspaceId: 'ws-1',
    userId: 'user-me',
    roleSlug,
    permissions,
    requestId: 'req-1',
  }
}
const ADMIN_CTX = () => ctxWith([MANAGE_MEMBERS_PERMISSION])
const NO_PERM_CTX = () => ctxWith(['crm.leads.view'], 'member')

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    tenant_id: 't-1',
    workspace_id: 'ws-1',
    user_id: 'user-other',
    role_id: 'role-m',
    status: 'active',
    created_at: '2026-07-01T00:00:00Z',
    joined_at: '2026-07-01T00:00:00Z',
    role_slug: 'member',
    role_name: 'Member',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.memberships = []
  repo.membershipForUser = null
  repo.membershipById = null
  repo.adminCount = 2
  repo.inserts = []
  repo.updates = []
  repo.insertThrows = false
  auth.createThrows = null
  auth.createdUsers = []
  auth.deleted = []
  auth.existingByEmail = null
  auth.emailMap = new Map()
  auth.passwordSets = []
  audit.events = []
})

// ---- Tests --------------------------------------------------------------------

describe('TC-UM-01: permission gate on every operation', () => {
  it('all four service functions reject a caller without workspace.manage_members', async () => {
    await expect(listWorkspaceMembers(NO_PERM_CTX())).rejects.toThrow('workspace.manage_members')
    await expect(createWorkspaceUser(NO_PERM_CTX(), { email: 'a@b.com', roleSlug: 'member' }))
      .rejects.toThrow('workspace.manage_members')
    await expect(changeMemberRole(NO_PERM_CTX(), { membershipId: 'mem-1', roleSlug: 'member' }))
      .rejects.toThrow('workspace.manage_members')
    await expect(removeMember(NO_PERM_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('workspace.manage_members')
  })

  it('platform_admin passes without the explicit permission (hasPermission bypass)', async () => {
    const ctx = ctxWith([], 'platform_admin')
    await expect(listWorkspaceMembers(ctx)).resolves.toEqual([])
  })
})

describe('TC-UM-02: create — brand-new user gets a one-time temp password', () => {
  it('creates via GoTrue admin, inserts membership, returns the password', async () => {
    const result = await createWorkspaceUser(ADMIN_CTX(), { email: 'New@Person.com', roleSlug: 'member' })
    expect(auth.createdUsers).toHaveLength(1)
    expect(auth.createdUsers[0].email).toBe('new@person.com') // normalized
    expect(result.tempPassword).toMatch(/^Verian-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/)
    expect(result.reactivated).toBe(false)
    expect(repo.inserts).toHaveLength(1)
    expect(repo.inserts[0].role_id).toBe('role-m')
    expect(repo.inserts[0].invited_by).toBe('user-me')
    expect(audit.events.some((e) => e.eventType === 'member_created')).toBe(true)
  })
})

describe('TC-UM-03: create — validation', () => {
  it('rejects a malformed email before touching auth', async () => {
    await expect(createWorkspaceUser(ADMIN_CTX(), { email: 'not-an-email', roleSlug: 'member' }))
      .rejects.toThrow('invalid_email')
    expect(auth.createdUsers).toHaveLength(0)
  })

  it('rejects non-assignable roles (platform_admin cannot be granted here)', async () => {
    await expect(createWorkspaceUser(ADMIN_CTX(), { email: 'a@b.com', roleSlug: 'platform_admin' }))
      .rejects.toThrow('invalid_role')
  })
})

describe('TC-UM-04: create — existing auth user is added without a new password', () => {
  it('duplicate-email fallback adds a membership for the existing account', async () => {
    auth.createThrows = 'auth.admin.createUser: A user with this email address has already been registered'
    auth.existingByEmail = { id: 'user-existing', email: 'exists@b.com' }
    const result = await createWorkspaceUser(ADMIN_CTX(), { email: 'exists@b.com', roleSlug: 'viewer' })
    expect(result.tempPassword).toBeNull()
    expect(result.userId).toBe('user-existing')
    expect(repo.inserts).toHaveLength(1)
  })

  it('active existing membership → already_a_member', async () => {
    auth.createThrows = 'already registered'
    auth.existingByEmail = { id: 'user-existing', email: 'exists@b.com' }
    repo.membershipForUser = membership({ user_id: 'user-existing', status: 'active' })
    await expect(createWorkspaceUser(ADMIN_CTX(), { email: 'exists@b.com', roleSlug: 'member' }))
      .rejects.toThrow('already_a_member')
  })
})

describe('TC-UM-05: create — revoked membership is REACTIVATED (unique row reuse)', () => {
  it('flips the revoked row back to active with the requested role', async () => {
    auth.createThrows = 'already registered'
    auth.existingByEmail = { id: 'user-back', email: 'back@b.com' }
    repo.membershipForUser = membership({ id: 'mem-old', user_id: 'user-back', status: 'revoked' })
    const result = await createWorkspaceUser(ADMIN_CTX(), { email: 'back@b.com', roleSlug: 'member' })
    expect(result.reactivated).toBe(true)
    expect(repo.updates).toEqual([
      { membershipId: 'mem-old', patch: { role_id: 'role-m', status: 'active' } },
    ])
    expect(repo.inserts).toHaveLength(0)
  })
})

describe('TC-UM-06: create — compensating cleanup on membership failure', () => {
  it('deletes the freshly created auth user when the membership insert fails', async () => {
    repo.insertThrows = true
    await expect(createWorkspaceUser(ADMIN_CTX(), { email: 'a@b.com', roleSlug: 'member' }))
      .rejects.toThrow('insertMembership')
    expect(auth.deleted).toEqual(['user-new'])
  })
})

describe('TC-UM-07: mutation guards', () => {
  it('cannot modify your own membership', async () => {
    repo.membershipById = membership({ user_id: 'user-me' })
    await expect(changeMemberRole(ADMIN_CTX(), { membershipId: 'mem-1', roleSlug: 'viewer' }))
      .rejects.toThrow('cannot_modify_self')
    await expect(removeMember(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('cannot_modify_self')
  })

  it('platform/tenant admin memberships are protected from this surface', async () => {
    repo.membershipById = membership({ role_slug: 'tenant_admin', role_id: 'role-ta' })
    await expect(removeMember(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('protected_role')
  })

  it('revoked memberships read as not found', async () => {
    repo.membershipById = membership({ status: 'revoked' })
    await expect(removeMember(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('member_not_found')
  })
})

describe('TC-UM-08: last-admin protection', () => {
  it('blocks removing the last workspace admin', async () => {
    repo.membershipById = membership({ role_slug: 'workspace_admin', role_id: 'role-wa' })
    repo.adminCount = 1
    await expect(removeMember(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('last_admin')
  })

  it('blocks demoting the last workspace admin to member', async () => {
    repo.membershipById = membership({ role_slug: 'workspace_admin', role_id: 'role-wa' })
    repo.adminCount = 1
    await expect(changeMemberRole(ADMIN_CTX(), { membershipId: 'mem-1', roleSlug: 'member' }))
      .rejects.toThrow('last_admin')
  })

  it('allows demotion when another admin remains', async () => {
    repo.membershipById = membership({ role_slug: 'workspace_admin', role_id: 'role-wa' })
    repo.adminCount = 2
    await changeMemberRole(ADMIN_CTX(), { membershipId: 'mem-1', roleSlug: 'member' })
    expect(repo.updates).toEqual([{ membershipId: 'mem-1', patch: { role_id: 'role-m' } }])
  })
})

describe('TC-UM-09: removal is a soft revoke', () => {
  it('sets status=revoked (never deletes) and records the audit event', async () => {
    repo.membershipById = membership()
    await removeMember(ADMIN_CTX(), { membershipId: 'mem-1' })
    expect(repo.updates).toEqual([{ membershipId: 'mem-1', patch: { status: 'revoked' } }])
    expect(audit.events.some((e) => e.eventType === 'member_removed')).toBe(true)
  })
})

describe('TC-UM-11: operator password reset', () => {
  it('sets a fresh temp password via the GoTrue admin API and returns it once', async () => {
    repo.membershipById = membership()
    auth.emailMap = new Map([['user-other', { id: 'user-other', email: 'other@b.com', createdAt: null, lastSignInAt: null }]])
    const result = await resetMemberPassword(ADMIN_CTX(), { membershipId: 'mem-1' })
    expect(auth.passwordSets).toHaveLength(1)
    expect(auth.passwordSets[0].userId).toBe('user-other')
    expect(result.tempPassword).toBe(auth.passwordSets[0].password)
    expect(result.tempPassword).toMatch(/^Verian-/)
    expect(result.email).toBe('other@b.com')
    expect(audit.events.some((e) => e.eventType === 'member_password_reset')).toBe(true)
  })

  it('shares the mutation guards: self and protected roles are blocked', async () => {
    repo.membershipById = membership({ user_id: 'user-me' })
    await expect(resetMemberPassword(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('cannot_modify_self')
    repo.membershipById = membership({ role_slug: 'platform_admin' })
    await expect(resetMemberPassword(ADMIN_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('protected_role')
    expect(auth.passwordSets).toHaveLength(0)
  })

  it('requires the manage-members permission', async () => {
    await expect(resetMemberPassword(NO_PERM_CTX(), { membershipId: 'mem-1' }))
      .rejects.toThrow('workspace.manage_members')
  })
})

describe('TC-UM-10: temp password generator', () => {
  it('emits the readable format from an unambiguous alphabet', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateTempPassword()
      expect(pw).toMatch(/^Verian-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/)
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it('does not repeat across calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()))
    expect(seen.size).toBe(50)
  })
})
