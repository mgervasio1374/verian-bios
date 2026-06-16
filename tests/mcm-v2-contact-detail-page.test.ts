// mcm-v2 — Contact detail page (#4b). Covers the three contact-scoped fetches,
// the CompanyActivityTimeline title/emptyText props (defaults preserved), and
// source-reads of the contact page + the company contact-name link.
// TC-CDP-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- contact-scoped fetch query shapes ------------------------------------

const h = vi.hoisted(() => ({ eqCalls: [] as Array<[string, unknown]>, orderArg: null as [string, unknown] | null, limitArg: null as number | null }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      select: () => b,
      eq: (c: string, v: unknown) => { h.eqCalls.push([c, v]); return b },
      is: () => b,
      order: (c: string, o: unknown) => { h.orderArg = [c, o]; return b },
      limit: (n: number) => { h.limitArg = n; return Promise.resolve({ data: [{ id: 'x' }], error: null }) },
    })
    return b
  },
}))

import { listProposalEventsForContact } from '@/modules/proposals/repositories/proposal-events.repo'
import { listContactDocuments } from '@/modules/artifacts/repositories/company-document.repo'
import { listContactActivityEvents } from '@/modules/intelligence/repositories/activity-event.repo'

beforeEach(() => { h.eqCalls = []; h.orderArg = null; h.limitArg = null })

describe('TC-CDP-01: listProposalEventsForContact query shape', () => {
  it('filters tenant+workspace+contact, orders created_at desc, applies limit', async () => {
    await listProposalEventsForContact('t-1', 'ws-1', 'ct-1', { limit: 20 })
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.eqCalls).toContainEqual(['workspace_id', 'ws-1'])
    expect(h.eqCalls).toContainEqual(['contact_id', 'ct-1'])
    expect(h.orderArg).toEqual(['created_at', { ascending: false }])
    expect(h.limitArg).toBe(20)
  })
})

describe('TC-CDP-02: listContactDocuments query shape', () => {
  it('filters tenant+contact, orders created_at desc, default limit 20', async () => {
    await listContactDocuments('ct-1', 't-1')
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.eqCalls).toContainEqual(['contact_id', 'ct-1'])
    expect(h.orderArg).toEqual(['created_at', { ascending: false }])
    expect(h.limitArg).toBe(20)
  })
})

describe('TC-CDP-03: listContactActivityEvents query shape', () => {
  it('filters tenant+contact, orders occurred_at desc, default limit 50', async () => {
    await listContactActivityEvents('t-1', 'ct-1')
    expect(h.eqCalls).toContainEqual(['tenant_id', 't-1'])
    expect(h.eqCalls).toContainEqual(['contact_id', 'ct-1'])
    expect(h.orderArg).toEqual(['occurred_at', { ascending: false }])
    expect(h.limitArg).toBe(50)
  })
})

// ---- CompanyActivityTimeline title/emptyText props ------------------------

import { CompanyActivityTimeline } from '@/app/(workspace)/[workspaceSlug]/companies/[id]/CompanyActivityTimeline'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(node: any): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && node.props) return textOf(node.props.children)
  return ''
}

describe('TC-CDP-04: timeline props override title/empty (defaults preserved)', () => {
  it('custom title + emptyText render when passed (empty list)', () => {
    const el = CompanyActivityTimeline({ events: [], title: 'Contact Activity', emptyText: 'No activity recorded yet for this contact.' })
    const text = textOf(el)
    expect(text).toContain('Contact Activity')
    expect(text).toContain('No activity recorded yet for this contact.')
  })

  it('defaults preserve the company behavior', () => {
    const el = CompanyActivityTimeline({ events: [] })
    const text = textOf(el)
    expect(text).toContain('Company Activity')
    expect(text).toContain('No activity recorded yet for this company.')
  })
})

// ---- source-reads ---------------------------------------------------------

describe('TC-CDP-05: contact page wires fetches + cards', () => {
  const src = readFileSync(join(process.cwd(), 'app', '(workspace)', '[workspaceSlug]', 'contacts', '[id]', 'page.tsx'), 'utf8')
  it('loads the three contact-scoped fetches', () => {
    expect(src).toContain('listProposalEventsForContact(ctx.tenantId, ctx.workspaceId, id')
    expect(src).toContain('listDocumentsForContact(id, ctx.tenantId')
    expect(src).toContain('listContactActivityEvents(ctx.tenantId, id')
  })
  it('renders ProposalsCard + the contact-titled activity timeline', () => {
    expect(src).toContain('<ProposalsCard proposals={proposals} workspaceSlug={workspaceSlug} />')
    expect(src).toContain('title="Contact Activity"')
    expect(src).toContain('emptyText="No activity recorded yet for this contact."')
    expect(src).toContain('Documents')
  })
})

describe('TC-CDP-06: company Contacts card links each contact to /contacts/[id]', () => {
  it('wraps the contact name in a link to the contact detail', () => {
    const src = readFileSync(join(process.cwd(), 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'page.tsx'), 'utf8')
    expect(src).toContain('href={`/${workspaceSlug}/contacts/${c.id}`}')
  })
})
