// #31 / PROD-BUG-003 — imported-leads review queue. Behavioral.
// TC-ILR-01..04

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  // listLeadsByStatus mock: captured args + returned rows
  statusQuery:  null as { tenantId: string; workspaceId: string; status: string } | null,
  statusRows:   [] as Array<Record<string, unknown>>,
  // lead store for getLead / updateLead
  leads:        {} as Record<string, Record<string, unknown>>,
  updates:      [] as Array<{ id: string; patch: Record<string, unknown> }>,
  stages:       [] as Array<{ slug: string; is_terminal: boolean; position: number }>,
}))

vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  listLeadsByStatus: (tenantId: string, workspaceId: string, status: string) => {
    h.statusQuery = { tenantId, workspaceId, status }
    return Promise.resolve(h.statusRows.filter(r => r.status === status))
  },
  getLead: (id: string) => Promise.resolve(h.leads[id] ?? null),
  updateLead: (id: string, _tenantId: string, patch: Record<string, unknown>) => {
    h.updates.push({ id, patch })
    h.leads[id] = { ...h.leads[id], ...patch }
    return Promise.resolve(h.leads[id])
  },
}))
vi.mock('@/lib/config/resolve', () => ({
  getPipelineStages: () => Promise.resolve(h.stages),
}))
vi.mock('@/modules/workflow/services/event-dispatch.service', () => ({ enqueueEvent: () => Promise.resolve() }))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => {} }))

import {
  listImportedUnreviewedLeads,
  releaseImportedLeads,
} from '@/modules/crm/services/lead.service'

const ctx = { tenantId: 't1', workspaceId: 'w1', userId: 'u1' } as never

beforeEach(() => {
  h.statusQuery = null
  h.statusRows = []
  h.leads = {}
  h.updates = []
  h.stages = [
    { slug: 'won',       is_terminal: true,  position: 9 },
    { slug: 'new',       is_terminal: false, position: 1 },
    { slug: 'contacted', is_terminal: false, position: 2 },
  ]
})

// ---------------------------------------------------------------------------
// TC-ILR-01: listImportedUnreviewedLeads queries the right status, tenant-scoped
// ---------------------------------------------------------------------------

describe('TC-ILR-01: listImportedUnreviewedLeads (behavioral)', () => {
  it('queries status=imported_unreviewed, tenant + workspace scoped', async () => {
    h.statusRows = [
      { id: 'a', status: 'imported_unreviewed' },
      { id: 'b', status: 'open' },
    ]
    const rows = await listImportedUnreviewedLeads(ctx)
    expect(h.statusQuery).toEqual({ tenantId: 't1', workspaceId: 'w1', status: 'imported_unreviewed' })
    expect(rows.map(r => (r as { id: string }).id)).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// TC-ILR-02: release moves leads into the first active stage + workflow on
// ---------------------------------------------------------------------------

describe('TC-ILR-02: releaseImportedLeads (behavioral)', () => {
  it('sets status=open, stage=first active stage slug (by position), workflow_enabled=true', async () => {
    h.leads = {
      a: { id: 'a', status: 'imported_unreviewed', stage: 'new' },
      b: { id: 'b', status: 'imported_unreviewed', stage: 'new' },
    }
    const result = await releaseImportedLeads(ctx, ['a', 'b'])
    expect(result).toEqual({ released: 2 })

    // entry stage is the first NON-terminal by position → 'new'
    for (const id of ['a', 'b']) {
      expect(h.leads[id]).toMatchObject({ status: 'open', stage: 'new', workflow_enabled: true })
    }
  })

  it('a released lead then satisfies the pipeline query and not the imported bucket', async () => {
    h.leads = { a: { id: 'a', status: 'imported_unreviewed', stage: 'new', tenant_id: 't1', workspace_id: 'w1' } }
    await releaseImportedLeads(ctx, ['a'])
    // it left the imported bucket (status no longer imported_unreviewed)
    expect(h.leads.a.status).not.toBe('imported_unreviewed')
    // and is now 'open' (the pipeline query is status='open')
    expect(h.leads.a.status).toBe('open')
  })

  it('skips ids that are not imported_unreviewed (tenant-scoped, only the bucket)', async () => {
    h.leads = {
      a: { id: 'a', status: 'imported_unreviewed', stage: 'new' },
      b: { id: 'b', status: 'open', stage: 'contacted' }, // already in pipeline
    }
    const result = await releaseImportedLeads(ctx, ['a', 'b', 'missing'])
    expect(result).toEqual({ released: 1 })
    expect(h.updates.map(u => u.id)).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// TC-ILR-03: empty / whitespace id list → no-op
// ---------------------------------------------------------------------------

describe('TC-ILR-03: empty release is a no-op (behavioral)', () => {
  it('empty array → { released: 0 } and no updates', async () => {
    expect(await releaseImportedLeads(ctx, [])).toEqual({ released: 0 })
    expect(h.updates).toHaveLength(0)
  })

  it('whitespace-only ids are dropped → { released: 0 }', async () => {
    expect(await releaseImportedLeads(ctx, ['', '   '])).toEqual({ released: 0 })
    expect(h.updates).toHaveLength(0)
  })
})
