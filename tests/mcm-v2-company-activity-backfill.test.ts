// mcm-v2 — Company activity backfill. recordActivityEvent derives company_id from
// a lead/contact when absent; the campaign-assignment emit now carries contactId;
// the 20240062 migration backfills + synthesizes with idempotent NOT EXISTS guards.
// TC-CAB-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- recordActivityEvent company-id derivation ----------------------------

const h = vi.hoisted(() => ({
  leadCompany:    null as string | null,
  contactCompany: null as string | null,
  throwOnLookup:  false,
  insertedRow:    null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        insert: (row: Record<string, unknown>) => { h.insertedRow = row; return b },
        single: () => Promise.resolve({ data: { id: 'ev-1', ...(h.insertedRow ?? {}) }, error: null }),
        maybeSingle: () => {
          if (h.throwOnLookup) return Promise.reject(new Error('lookup boom'))
          const company = table === 'leads' ? h.leadCompany : table === 'contacts' ? h.contactCompany : null
          return Promise.resolve({ data: company ? { company_id: company } : null, error: null })
        },
      })
      return b
    },
  }),
}))

import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'

beforeEach(() => {
  h.leadCompany = null; h.contactCompany = null; h.throwOnLookup = false; h.insertedRow = null
})

describe('TC-CAB-01: derives company_id from the lead when companyId absent', () => {
  it('looks up leads.company_id and sets it on the inserted row', async () => {
    h.leadCompany = 'co-from-lead'
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x', leadId: 'ld-1' })
    expect(h.insertedRow!.company_id).toBe('co-from-lead')
    expect(h.insertedRow!.lead_id).toBe('ld-1')
  })
})

describe('TC-CAB-02: derives from the contact when only contactId present', () => {
  it('falls back to contacts.company_id', async () => {
    h.contactCompany = 'co-from-contact'
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x', contactId: 'ct-1' })
    expect(h.insertedRow!.company_id).toBe('co-from-contact')
  })

  it('prefers the lead company over the contact company', async () => {
    h.leadCompany = 'co-lead'; h.contactCompany = 'co-contact'
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x', leadId: 'ld-1', contactId: 'ct-1' })
    expect(h.insertedRow!.company_id).toBe('co-lead')
  })
})

describe('TC-CAB-03: company_id stays null when nothing resolves', () => {
  it('no lead/contact → null', async () => {
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x' })
    expect(h.insertedRow!.company_id).toBeNull()
  })

  it('lead/contact present but no company on them → null', async () => {
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x', leadId: 'ld-1', contactId: 'ct-1' })
    expect(h.insertedRow!.company_id).toBeNull()
  })
})

describe('TC-CAB-04: provided companyId is never overwritten; lookup failure non-fatal', () => {
  it('explicit companyId wins (no lookup)', async () => {
    h.leadCompany = 'co-from-lead'
    await recordActivityEvent({ tenantId: 't-1', eventType: 'x', companyId: 'co-explicit', leadId: 'ld-1' })
    expect(h.insertedRow!.company_id).toBe('co-explicit')
  })

  it('a lookup failure still inserts the event (company_id null)', async () => {
    h.throwOnLookup = true
    const res = await recordActivityEvent({ tenantId: 't-1', eventType: 'x', leadId: 'ld-1' })
    expect(res.id).toBe('ev-1')
    expect(h.insertedRow!.company_id).toBeNull()
  })
})

// ---- source-reads: emit contactId + migration shape -----------------------

describe('TC-CAB-05: campaign-assignment CAMPAIGN_ASSIGNED emit carries contactId', () => {
  it('the recordActivity call passes contactId alongside leadId', () => {
    const src = readFileSync(join(process.cwd(), 'modules/messaging/services/campaign-assignment.service.ts'), 'utf8')
    // the assignment-created emit block now includes contactId: input.contactId
    const idx = src.indexOf("entityType:  'campaign_assignment'")
    const block = src.slice(idx, idx + 400)
    expect(block).toContain('leadId:      input.leadId')
    expect(block).toContain('contactId:   input.contactId')
  })
})

describe('TC-CAB-06: migration 20240062 backfills + synthesizes idempotently', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20240062_company_activity_backfill.sql'), 'utf8')

  it('2a populates campaign-assignment events from the assignment (uuid join)', () => {
    expect(sql).toContain('UPDATE activity_events ae')
    expect(sql).toContain('FROM campaign_assignments ca')
    expect(sql).toContain('ae.entity_id   = ca.id')
    expect(sql).toMatch(/ae\.company_id\s+IS NULL/)
  })

  it('2b backfills company_id on remaining lead/contact events', () => {
    expect(sql).toMatch(/SET company_id = COALESCE\(/)
    expect(sql).toContain('(lead_id IS NOT NULL OR contact_id IS NOT NULL)')
  })

  it('2c/2d synthesize from proposal_events + artifacts with NOT EXISTS guards', () => {
    expect(sql).toContain('FROM proposal_events pe')
    expect(sql).toContain("WHEN 'savings_analysis' THEN 'savings_analysis_generated' ELSE 'proposal_created'")
    expect(sql).toContain('FROM artifacts a')
    expect(sql).toContain("'company_document_uploaded'")
    // re-runnable: both INSERTs guard on metadata.source_id + backfill flag
    expect((sql.match(/NOT EXISTS \(\s*SELECT 1 FROM activity_events x/g) ?? []).length).toBe(2)
    expect(sql).toContain("x.metadata->>'backfill'  = 'true'")
  })
})
