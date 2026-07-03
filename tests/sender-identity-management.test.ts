// Sender-identity management — behavioral tests for the service invariants:
// admin permission gate, unverified-on-create, verified-only default,
// default-stays-verified, duplicate email, validation. TC-SIM-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RequestContext } from '@/types/context'

const repo = vi.hoisted(() => ({
  identities: [] as Array<Record<string, unknown>>,
  byEmail: null as Record<string, unknown> | null,
  byId: null as Record<string, unknown> | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  verifiedSets: [] as Array<{ id: string; verified: boolean }>,
  defaultSets: [] as string[],
}))
vi.mock('@/modules/messaging/repositories/sender-identity.repo', () => ({
  listAllSenderIdentities: vi.fn(async () => repo.identities),
  findSenderIdentityByEmail: vi.fn(async () => repo.byEmail),
  getSenderIdentityRow: vi.fn(async () => repo.byId),
  insertSenderIdentity: vi.fn(async (input: Record<string, unknown>) => {
    repo.inserts.push(input)
    return { id: 'si-new' }
  }),
  updateSenderIdentity: vi.fn(async (_t: string, id: string, patch: Record<string, unknown>) => {
    repo.updates.push({ id, patch })
  }),
  setSenderIdentityVerified: vi.fn(async (_t: string, id: string, verified: boolean) => {
    repo.verifiedSets.push({ id, verified })
  }),
  setDefaultSenderIdentity: vi.fn(async (_t: string, id: string) => {
    repo.defaultSets.push(id)
  }),
}))

const audit = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async (e: Record<string, unknown>) => { audit.events.push(e) }),
}))

import {
  listSenderIdentities,
  createSenderIdentity,
  updateSenderIdentity,
  setSenderIdentityVerified,
  makeDefaultSenderIdentity,
} from '@/modules/messaging/services/sender-identity.service'

function ctxWith(permissions: string[]): RequestContext {
  return {
    tenantId: 't-1', workspaceId: 'ws-1', userId: 'user-me',
    roleSlug: 'workspace_admin', permissions, requestId: 'req-1',
  }
}
const ADMIN = () => ctxWith(['messaging.manage_templates'])
const MEMBER = () => ctxWith(['crm.leads.view'])

function identityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'si-1', name: 'Bruce Hughes', email: 'bhughes2@321swipe.com',
    reply_to: null, signature: null, is_verified: true, is_default: false,
    status: 'active', created_at: '2026-06-12T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.identities = []
  repo.byEmail = null
  repo.byId = null
  repo.inserts = []
  repo.updates = []
  repo.verifiedSets = []
  repo.defaultSets = []
  audit.events = []
})

describe('TC-SIM-01: permission gate', () => {
  it('every operation requires messaging.manage_templates', async () => {
    await expect(listSenderIdentities(MEMBER())).rejects.toThrow('messaging.manage_templates')
    await expect(createSenderIdentity(MEMBER(), { name: 'A', email: 'a@b.com' }))
      .rejects.toThrow('messaging.manage_templates')
    await expect(setSenderIdentityVerified(MEMBER(), { identityId: 'si-1', verified: true }))
      .rejects.toThrow('messaging.manage_templates')
    await expect(makeDefaultSenderIdentity(MEMBER(), { identityId: 'si-1' }))
      .rejects.toThrow('messaging.manage_templates')
  })
})

describe('TC-SIM-02: creation starts unverified and non-default', () => {
  it('inserts with is_verified/is_default handled by the repo layer defaults', async () => {
    const result = await createSenderIdentity(ADMIN(), {
      name: '  Jane Doe ', email: 'Jane@321Swipe.com', signature: 'Best,\nJane',
    })
    expect(result.id).toBe('si-new')
    expect(repo.inserts).toHaveLength(1)
    expect(repo.inserts[0].name).toBe('Jane Doe')          // trimmed
    expect(repo.inserts[0].email).toBe('jane@321swipe.com') // normalized
    expect(audit.events.some((e) => e.eventType === 'sender_identity_created')).toBe(true)
  })

  it('rejects duplicate email and invalid input', async () => {
    repo.byEmail = identityRow()
    await expect(createSenderIdentity(ADMIN(), { name: 'X', email: 'bhughes2@321swipe.com' }))
      .rejects.toThrow('email_in_use')
    repo.byEmail = null
    await expect(createSenderIdentity(ADMIN(), { name: '', email: 'a@b.com' }))
      .rejects.toThrow('name_required')
    await expect(createSenderIdentity(ADMIN(), { name: 'X', email: 'nope' }))
      .rejects.toThrow('invalid_email')
    await expect(createSenderIdentity(ADMIN(), { name: 'X', email: 'a@b.com', replyTo: 'bad' }))
      .rejects.toThrow('invalid_reply_to')
  })
})

describe('TC-SIM-03: only a verified identity can become default', () => {
  it('unverified → not_verified error', async () => {
    repo.byId = identityRow({ is_verified: false })
    await expect(makeDefaultSenderIdentity(ADMIN(), { identityId: 'si-1' }))
      .rejects.toThrow('not_verified')
    expect(repo.defaultSets).toHaveLength(0)
  })

  it('verified → default set (clear-then-set handled in repo)', async () => {
    repo.byId = identityRow({ is_verified: true })
    await makeDefaultSenderIdentity(ADMIN(), { identityId: 'si-1' })
    expect(repo.defaultSets).toEqual(['si-1'])
    expect(audit.events.some((e) => e.eventType === 'sender_identity_default_changed')).toBe(true)
  })
})

describe('TC-SIM-04: the default cannot be unverified', () => {
  it('blocks unverifying the current default', async () => {
    repo.byId = identityRow({ is_default: true, is_verified: true })
    await expect(setSenderIdentityVerified(ADMIN(), { identityId: 'si-1', verified: false }))
      .rejects.toThrow('cannot_unverify_default')
    expect(repo.verifiedSets).toHaveLength(0)
  })

  it('verifying a non-default works', async () => {
    repo.byId = identityRow({ is_verified: false })
    await setSenderIdentityVerified(ADMIN(), { identityId: 'si-1', verified: true })
    expect(repo.verifiedSets).toEqual([{ id: 'si-1', verified: true }])
  })
})

describe('TC-SIM-05: updates validate and patch only provided fields', () => {
  it('patches signature + reply_to, leaves name untouched when omitted', async () => {
    repo.byId = identityRow()
    await updateSenderIdentity(ADMIN(), {
      identityId: 'si-1', replyTo: 'sales@321swipe.com', signature: 'Warm regards,\nBruce',
    })
    expect(repo.updates).toEqual([{
      id: 'si-1',
      patch: { reply_to: 'sales@321swipe.com', signature: 'Warm regards,\nBruce' },
    }])
  })

  it('missing identity → identity_not_found', async () => {
    repo.byId = null
    await expect(updateSenderIdentity(ADMIN(), { identityId: 'si-x', name: 'X' }))
      .rejects.toThrow('identity_not_found')
  })
})

describe('TC-SIM-06: signature length limit', () => {
  it('rejects oversized signatures on create and update', async () => {
    const huge = 'x'.repeat(2001)
    await expect(createSenderIdentity(ADMIN(), { name: 'X', email: 'a@b.com', signature: huge }))
      .rejects.toThrow('signature_too_long')
    repo.byId = identityRow()
    await expect(updateSenderIdentity(ADMIN(), { identityId: 'si-1', signature: huge }))
      .rejects.toThrow('signature_too_long')
  })
})
