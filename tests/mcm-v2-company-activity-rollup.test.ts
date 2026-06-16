// mcm-v2 — Company Activity rollup. listCompanyActivityEvents now matches
// company_id OR the company's lead/contact events; company-level actions emit
// company-scoped activity_events.
// TC-CAR-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- listCompanyActivityEvents .or() builder -------------------------------

const h = vi.hoisted(() => ({
  leadIds:    [] as string[],
  contactIds: [] as string[],
  orArg:      null as string | null,
  eqCalls:    [] as Array<[string, unknown]>,
  limitArg:   null as number | null,
  ordered:    false,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      Object.assign(b, {
        select: () => b,
        eq: (c: string, v: unknown) => { if (table === 'activity_events') h.eqCalls.push([c, v]); return b },
        is: () => b,
        or: (clause: string) => { h.orArg = clause; return b },
        order: () => { h.ordered = true; return b },
        limit: (n: number) => { h.limitArg = n; return Promise.resolve({ data: [{ id: 'ev-1' }], error: null }) },
        // leads/contacts id loads are awaited directly (thenable)
        then: (res: (v: { data: Array<{ id: string }>; error: null }) => unknown) => {
          const ids = table === 'leads' ? h.leadIds : table === 'contacts' ? h.contactIds : []
          return Promise.resolve({ data: ids.map(id => ({ id })), error: null }).then(res)
        },
      })
      return b
    },
  }),
}))

import { listCompanyActivityEvents } from '@/modules/intelligence/repositories/activity-event.repo'

beforeEach(() => {
  h.leadIds = []; h.contactIds = []; h.orArg = null; h.eqCalls = []; h.limitArg = null; h.ordered = false
})

describe('TC-CAR-01: rollup .or() includes company + lead + contact clauses', () => {
  it('builds all three clauses when the company has leads and contacts', async () => {
    h.leadIds = ['L1', 'L2']
    h.contactIds = ['C1']
    await listCompanyActivityEvents('t-1', 'co-1', { limit: 30 })

    expect(h.orArg).toContain('company_id.eq.co-1')
    expect(h.orArg).toContain('lead_id.in.(L1,L2)')
    expect(h.orArg).toContain('contact_id.in.(C1)')
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.ordered).toBe(true)
    expect(h.limitArg).toBe(30)
  })
})

describe('TC-CAR-02: omits in() clauses when there are none', () => {
  it('only company_id.eq when no leads/contacts', async () => {
    await listCompanyActivityEvents('t-1', 'co-1')
    expect(h.orArg).toBe('company_id.eq.co-1')
    expect(h.orArg).not.toContain('lead_id.in')
    expect(h.orArg).not.toContain('contact_id.in')
    expect(h.limitArg).toBe(50) // default
  })

  it('includes only lead clause when contacts are empty', async () => {
    h.leadIds = ['L9']
    await listCompanyActivityEvents('t-1', 'co-1')
    expect(h.orArg).toContain('lead_id.in.(L9)')
    expect(h.orArg).not.toContain('contact_id.in')
  })
})

// ---- Company-level actions emit company-scoped activity --------------------

vi.mock('@/modules/intelligence/repositories/activity-event.repo', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return { ...actual, recordActivityEvent: vi.fn(async () => ({ id: 'act-1' })) }
})

// savings-certificate deps
vi.mock('@/lib/pdf/proposal', () => ({ generateProposalPdf: vi.fn(async () => new Uint8Array([1])) }))
vi.mock('@/lib/statement/proposal-summary', () => ({ generateProposalSummary: vi.fn(async () => 'summary') }))
vi.mock('@/modules/artifacts/services/artifact.service', () => ({
  uploadGeneratedArtifact: vi.fn(async () => ({ artifactId: 'art-1', storagePath: 't/x.pdf' })),
  getArtifactDownloadUrl:  vi.fn(async () => 'https://signed/x.pdf'),
}))
vi.mock('@/modules/proposals/repositories/savings-analysis.repo', () => ({ recordSavingsAnalysis: vi.fn(async () => ({ id: 'ext-1' })) }))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({ createProposalEvent: vi.fn(async () => ({ id: 'pe-1' })) }))

import { generateSavingsCertificate } from '@/modules/proposals/services/savings-certificate.service'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'

const ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'operator', permissions: ['*'], requestId: 'r-1' } as never

describe('TC-CAR-03: generateSavingsCertificate records a company-scoped event', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits savings_analysis_generated with companyId set', async () => {
    const res = await generateSavingsCertificate(ctx, {
      companyId: 'co-1', companyName: 'Harbor Diner', contactName: 'Pat', contactEmail: 'p@h.co',
      contactId: 'ct-1', leadId: 'ld-1', monthlyVolume: 100000, currentMonthlyFees: 3200, transactionCount: 2000,
    })
    expect(res.proposalEventId).toBe('pe-1')
    const arg = vi.mocked(recordActivityEvent).mock.calls[0][0]
    expect(arg.eventType).toBe('savings_analysis_generated')
    expect(arg.companyId).toBe('co-1')
    expect(arg.contactId).toBe('ct-1')
  })

  it('a recordActivityEvent failure is non-fatal', async () => {
    vi.mocked(recordActivityEvent).mockRejectedValueOnce(new Error('boom'))
    const res = await generateSavingsCertificate(ctx, {
      companyId: 'co-1', companyName: 'Harbor Diner', contactName: null, contactEmail: null,
      monthlyVolume: 100000, currentMonthlyFees: 3200, transactionCount: 2000,
    })
    expect(res.proposalEventId).toBe('pe-1') // primary result still returned
  })
})

// ---- recordCompanyDocument emits the event --------------------------------

vi.mock('@/modules/artifacts/repositories/company-document.repo', () => ({
  createCompanyDocument: vi.fn(async () => ({ id: 'doc-1', name: 'statement.pdf' })),
}))

import { recordCompanyDocument } from '@/modules/artifacts/services/company-document.service'

describe('TC-CAR-04: recordCompanyDocument records a company-scoped event', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits company_document_uploaded with companyId + the doc name', async () => {
    const doc = await recordCompanyDocument({ tenantId: 't-1', workspaceId: 'ws-1', companyId: 'co-1', name: 'statement.pdf', artifactType: 'other' })
    expect(doc.id).toBe('doc-1')
    const arg = vi.mocked(recordActivityEvent).mock.calls[0][0]
    expect(arg.eventType).toBe('company_document_uploaded')
    expect(arg.companyId).toBe('co-1')
    expect(arg.eventSummary).toContain('statement.pdf')
  })

  it('a recordActivityEvent failure is non-fatal', async () => {
    vi.mocked(recordActivityEvent).mockRejectedValueOnce(new Error('boom'))
    const doc = await recordCompanyDocument({ tenantId: 't-1', companyId: 'co-1', name: 'x.pdf', artifactType: 'other' })
    expect(doc.id).toBe('doc-1')
  })
})

describe('TC-CAR-05: labels exist for the new event types', () => {
  it('CompanyActivityTimeline maps the new event types', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'CompanyActivityTimeline.tsx'),
      'utf8',
    )
    expect(src).toContain("savings_analysis_generated:       'Savings analysis generated'")
    expect(src).toContain("statement_ingested:               'Statement ingested'")
    expect(src).toContain("company_document_uploaded:        'Document uploaded'")
  })
})
