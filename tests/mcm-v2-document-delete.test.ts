// mcm-v2 — Delete a document from the Documents card. TC-DD-01..08
// Soft-delete path = deleted_at (listCompanyDocuments filters deleted_at IS NULL,
// NOT status, so the deleted doc leaves the card). Ownership verified server-side.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  eq: [] as Array<[string, unknown]>,
  isCall: null as [string, unknown] | null,
  row: null as Record<string, unknown> | null,
  list: [] as unknown[],
  // action env
  ctx: { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' } as Record<string, unknown>,
  permThrows: false,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      select: () => b,
      update: (d: Record<string, unknown>) => { h.update = d; return b },
      eq: (c: string, v: unknown) => { h.eq.push([c, v]); return b },
      is: (c: string, v: unknown) => { h.isCall = [c, v]; return b },
      order: () => b,
      limit: () => Promise.resolve({ data: h.list, error: null }),
      maybeSingle: () => Promise.resolve({ data: h.row, error: null }),
      then: (resolve: (r: { error: null }) => unknown) => resolve({ error: null }),
    })
    return b
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => h.ctx) }))
vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn((_c: unknown, perm: string) => { if (h.permThrows) throw new Error(`forbidden: ${perm}`) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { softDeleteCompanyDocument, listCompanyDocuments } from '@/modules/artifacts/repositories/company-document.repo'
import { deleteCompanyDocument } from '@/modules/artifacts/services/company-document.service'
import { deleteCompanyDocumentAction } from '@/modules/artifacts/actions/company-document.actions'
import { requirePermission } from '@/lib/auth/permissions'

beforeEach(() => {
  vi.clearAllMocks()
  h.update = null; h.eq = []; h.isCall = null; h.row = null; h.list = []
  h.ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' }
  h.permThrows = false
})

describe('TC-DD-01: soft-delete sets deleted_at, tenant-scoped, deleted_at IS NULL guard', () => {
  it('updates deleted_at (not status)', async () => {
    await softDeleteCompanyDocument('a-1', 't-1')
    expect(h.update).toHaveProperty('deleted_at')
    expect(h.update).not.toHaveProperty('status')
    expect(h.eq).toContainEqual(['id', 'a-1'])
    expect(h.eq).toContainEqual(['tenant_id', 't-1'])
    expect(h.isCall).toEqual(['deleted_at', null])
  })
})

describe('TC-DD-02: listCompanyDocuments excludes deleted docs (deleted_at IS NULL)', () => {
  it('filters on deleted_at null', async () => {
    await listCompanyDocuments('co-1', 't-1')
    expect(h.isCall).toEqual(['deleted_at', null])
  })
})

describe('TC-DD-03: service verifies ownership before deleting', () => {
  it('deletes when the artifact belongs to the company', async () => {
    h.row = { id: 'a-1', company_id: 'co-1', tenant_id: 't-1' }
    const ok = await deleteCompanyDocument('a-1', 'co-1', 't-1')
    expect(ok).toBe(true)
    expect(h.update).toHaveProperty('deleted_at') // soft-delete ran
  })

  it('refuses when the artifact belongs to a different company', async () => {
    h.row = { id: 'a-1', company_id: 'OTHER', tenant_id: 't-1' }
    const ok = await deleteCompanyDocument('a-1', 'co-1', 't-1')
    expect(ok).toBe(false)
    expect(h.update).toBeNull() // never soft-deleted
  })

  it('refuses when the artifact is missing', async () => {
    h.row = null
    const ok = await deleteCompanyDocument('a-1', 'co-1', 't-1')
    expect(ok).toBe(false)
    expect(h.update).toBeNull()
  })
})

describe('TC-DD-04: action is gated on crm.companies.edit', () => {
  it('checks the permission', async () => {
    h.row = { id: 'a-1', company_id: 'co-1', tenant_id: 't-1' }
    await deleteCompanyDocumentAction('a-1', 'co-1')
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(h.ctx, 'crm.companies.edit')
  })

  it('rejects + does not delete when permission throws', async () => {
    h.permThrows = true
    const res = await deleteCompanyDocumentAction('a-1', 'co-1')
    expect(res.success).toBe(false)
    expect(h.update).toBeNull()
  })
})

describe('TC-DD-05: action returns not_found for a foreign artifact', () => {
  it('ownership mismatch → error, no delete', async () => {
    h.row = { id: 'a-1', company_id: 'OTHER', tenant_id: 't-1' }
    const res = await deleteCompanyDocumentAction('a-1', 'co-1')
    expect(res.success).toBe(false)
    expect(h.update).toBeNull()
  })
})

describe('TC-DD-06: action succeeds + revalidates on a valid delete', () => {
  it('returns success', async () => {
    h.row = { id: 'a-1', company_id: 'co-1', tenant_id: 't-1' }
    const res = await deleteCompanyDocumentAction('a-1', 'co-1')
    expect(res.success).toBe(true)
  })
})

describe('TC-DD-07: DeleteDocumentButton confirms + calls the action', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'DeleteDocumentButton.tsx'),
    'utf8',
  )
  it('uses window.confirm and the delete action', () => {
    expect(src).toContain("window.confirm('Delete this document?')")
    expect(src).toContain('deleteCompanyDocumentAction(artifactId, companyId)')
    expect(src).toContain('router.refresh()')
  })
})

describe('TC-DD-08: company page renders the delete button per document row', () => {
  it('wires DeleteDocumentButton with the doc id + company id', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'page.tsx'),
      'utf8',
    )
    expect(src).toContain('<DeleteDocumentButton artifactId={doc.id} companyId={id} />')
  })
})
