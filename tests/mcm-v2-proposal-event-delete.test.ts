// mcm-v2 — Proposal event nav links + soft-delete. TC-PED-01..07

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Repo soft-delete — query-builder mirror
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  eq: [] as Array<[string, unknown]>,
  isCall: null as [string, unknown] | null,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      update: (d: Record<string, unknown>) => { h.update = d; return b },
      eq: (c: string, v: unknown) => { h.eq.push([c, v]); return b },
      is: (c: string, v: unknown) => { h.isCall = [c, v]; return Promise.resolve({ error: null }) },
    })
    return b
  },
}))

import { softDeleteProposalEvent } from '@/modules/proposals/repositories/proposal-events.repo'

beforeEach(() => { h.update = null; h.eq = []; h.isCall = null })

describe('TC-PED-01: softDeleteProposalEvent sets deleted_at, tenant/workspace/id scoped', () => {
  it('updates deleted_at with the right scope + deleted_at IS NULL guard', async () => {
    await softDeleteProposalEvent('t-1', 'ws-1', 'ev-1')
    expect(h.update).toHaveProperty('deleted_at')
    expect(typeof h.update!.deleted_at).toBe('string')
    expect(h.eq).toContainEqual(['id', 'ev-1'])
    expect(h.eq).toContainEqual(['tenant_id', 't-1'])
    expect(h.eq).toContainEqual(['workspace_id', 'ws-1'])
    expect(h.isCall).toEqual(['deleted_at', null])
  })
})

// ---------------------------------------------------------------------------
// Action — gating + companyId return
// ---------------------------------------------------------------------------

const a = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin', permissions: ['crm.companies.edit'] } as Record<string, unknown>,
  permThrows: false,
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => a.ctx) }))
vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn((_ctx: unknown, perm: string) => {
    if (a.permThrows) throw new Error(`forbidden: ${perm}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/proposals/services/proposal-event-delete.service', () => ({
  deleteProposalEventForWorkspace: vi.fn(async () => ({ ok: true, companyId: 'co-1' })),
}))

import { deleteProposalEventAction } from '@/modules/proposals/actions/proposal-event-delete.actions'
import { requirePermission } from '@/lib/auth/permissions'
import { deleteProposalEventForWorkspace } from '@/modules/proposals/services/proposal-event-delete.service'

beforeEach(() => {
  vi.clearAllMocks()
  a.permThrows = false
  a.ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin', permissions: ['crm.companies.edit'] }
})

describe('TC-PED-02: action is gated on crm.companies.edit', () => {
  it('checks the permission', async () => {
    await deleteProposalEventAction('ev-1')
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(a.ctx, 'crm.companies.edit')
  })
})

describe('TC-PED-03: action returns the companyId on success', () => {
  it('routes to the service and returns companyId', async () => {
    const res = await deleteProposalEventAction('ev-1')
    expect(res.success).toBe(true)
    expect(res.success && res.data.companyId).toBe('co-1')
    expect(vi.mocked(deleteProposalEventForWorkspace)).toHaveBeenCalledWith('t-1', 'ws-1', 'ev-1')
  })
})

describe('TC-PED-04: permission failure blocks the delete', () => {
  it('returns an error and never calls the service', async () => {
    a.permThrows = true
    const res = await deleteProposalEventAction('ev-1')
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteProposalEventForWorkspace)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Source-reads — nav links, button confirm, no guardrail-tripping copy
// ---------------------------------------------------------------------------

const PAGE = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'proposal-events', '[eventId]', 'page.tsx')
const BUTTON = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'proposal-events', '[eventId]', 'DeleteProposalButton.tsx')

describe('TC-PED-05: Linked Records card links company/contact/lead', () => {
  const src = readFileSync(PAGE, 'utf8')
  it('renders the three nav links', () => {
    expect(src).toContain('/${workspaceSlug}/companies/${event.company_id}')
    expect(src).toContain('/${workspaceSlug}/contacts/${event.contact_id}')
    expect(src).toContain('/${workspaceSlug}/leads/${event.lead_id}')
  })
  it('renders the delete button in the header', () => {
    expect(src).toContain('<DeleteProposalButton eventId={event.id} workspaceSlug={workspaceSlug} />')
  })
  it('does not introduce phase3p-forbidden copy', () => {
    expect(src).not.toContain('Send Email')
    expect(src).not.toContain('Complete Follow-Up')
    expect(src).not.toContain('Skip Follow-Up')
  })
})

describe('TC-PED-06: DeleteProposalButton confirms before deleting + redirects to company', () => {
  const src = readFileSync(BUTTON, 'utf8')
  it('uses window.confirm and the delete action', () => {
    expect(src).toContain('window.confirm')
    expect(src).toContain('deleteProposalEventAction(eventId)')
  })
  it('redirects to the company, fallback to proposal-events', () => {
    expect(src).toContain('/${workspaceSlug}/companies/${result.data.companyId}')
    expect(src).toContain('/${workspaceSlug}/proposal-events')
  })
})

describe('TC-PED-07: action revalidates the affected pages', () => {
  it('revalidates company detail, proposal-events, proposals', () => {
    const src = readFileSync(
      join(__dirname, '..', 'modules', 'proposals', 'actions', 'proposal-event-delete.actions.ts'),
      'utf8',
    )
    expect(src).toContain("revalidatePath('/[workspaceSlug]/companies/[id]', 'page')")
    expect(src).toContain("revalidatePath('/[workspaceSlug]/proposal-events', 'page')")
    expect(src).toContain("revalidatePath('/[workspaceSlug]/proposals', 'page')")
  })
})
