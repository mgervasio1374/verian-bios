// mcm-v2 — Company Proposals card. Covers the by-company fetch query shape and
// the ProposalsCard rendering (rows, link href, savings, empty state).
// TC-CPC-01..04

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- listProposalEventsForCompany query shape -----------------------------

const h = vi.hoisted(() => ({ eqCalls: [] as Array<[string, unknown]>, isCalls: [] as Array<[string, unknown]>, orderArg: null as [string, unknown] | null, limitArg: null as number | null }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      select: () => b,
      eq: (c: string, v: unknown) => { h.eqCalls.push([c, v]); return b },
      is: (c: string, v: unknown) => { h.isCalls.push([c, v]); return b },
      order: (c: string, o: unknown) => { h.orderArg = [c, o]; return b },
      limit: (n: number) => { h.limitArg = n; return Promise.resolve({ data: [{ id: 'pe-1' }], error: null }) },
    })
    return b
  },
}))

import { listProposalEventsForCompany } from '@/modules/proposals/repositories/proposal-events.repo'

beforeEach(() => { h.eqCalls = []; h.isCalls = []; h.orderArg = null; h.limitArg = null })

describe('TC-CPC-01: listProposalEventsForCompany query shape', () => {
  it('filters tenant+workspace+company, excludes deleted, orders desc, applies limit', async () => {
    const rows = await listProposalEventsForCompany('t-1', 'ws-1', 'co-1', { limit: 20 })
    expect(rows).toEqual([{ id: 'pe-1' }])
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.eqCalls).toContainEqual(['workspace_id', 'ws-1'])
    expect(h.eqCalls).toContainEqual(['company_id', 'co-1'])
    expect(h.isCalls).toContainEqual(['deleted_at', null])
    expect(h.orderArg).toEqual(['created_at', { ascending: false }])
    expect(h.limitArg).toBe(20)
  })

  it('defaults the limit to 20', async () => {
    await listProposalEventsForCompany('t-1', 'ws-1', 'co-1')
    expect(h.limitArg).toBe(20)
  })
})

// ---- ProposalsCard rendering (direct invoke, node env) --------------------

import { ProposalsCard } from '@/app/(workspace)/[workspaceSlug]/components/ProposalsCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(node: any): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && node.props) return textOf(node.props.children)
  return ''
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectHrefs(node: any, acc: string[] = []): string[] {
  if (node == null || typeof node !== 'object') return acc
  if (Array.isArray(node)) { node.forEach(n => collectHrefs(n, acc)); return acc }
  if (node.props) {
    if (typeof node.props.href === 'string') acc.push(node.props.href)
    collectHrefs(node.props.children, acc)
  }
  return acc
}

const proposal = {
  id: 'pe-9', proposal_status: 'sent', proposal_amount: 10980, proposal_currency: 'USD',
  estimated_savings: 915, proposal_sent_at: '2026-06-15T00:00:00Z', first_viewed_at: null,
  share_token: 'tok', proposal_reference: null, created_at: '2026-06-14T00:00:00Z', contact_id: 'ct-1',
}

describe('TC-CPC-02: renders a row per proposal with status + link + savings', () => {
  it('shows the status, the savings amount, and links to the proposal-event detail', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = ProposalsCard({ proposals: [proposal] as any, workspaceSlug: 'acme' })
    const text  = textOf(el)
    const hrefs = collectHrefs(el)
    expect(text).toContain('sent')
    expect(text).toContain('USD 10,980')
    expect(text).toContain('/yr est. savings')
    expect(text).toContain('USD 915')          // monthly savings shown too
    expect(hrefs).toContain('/acme/proposal-events/pe-9')
  })
})

describe('TC-CPC-03: empty state', () => {
  it('shows "No proposals yet." for an empty list', () => {
    const el = ProposalsCard({ proposals: [], workspaceSlug: 'acme' })
    expect(textOf(el)).toContain('No proposals yet.')
  })
})

describe('TC-CPC-04: company page wires the card + fetch', () => {
  it('imports the card + fetch and renders it with proposals', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'page.tsx'),
      'utf8',
    )
    expect(src).toContain('listProposalEventsForCompany(ctx.tenantId, ctx.workspaceId, id, { limit: 20 })')
    expect(src).toContain('<ProposalsCard proposals={proposals} workspaceSlug={workspaceSlug} />')
    // prior cards still present
    expect(src).toContain('Savings Analysis')
    expect(src).toContain('<IngestStatementForm')
    expect(src).toContain('<CompanyActivityTimeline events={activityEvents}')
  })
})
