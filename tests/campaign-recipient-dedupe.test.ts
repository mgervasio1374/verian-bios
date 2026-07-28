// One inbox, one enrollment per sequence.
//
// The imported book contains 147 addresses that appear on more than one company
// record: multi-location franchise operators. Company dedupe correctly keeps
// those companies distinct, so without a recipient-level guard a bulk assign
// enrolls the same owner once per location and they receive every touch of the
// sequence that many times. Complaints suspend a Resend account near 0.1%, well
// under the 2% bounce limit, so duplicate delivery is the sharper risk.
//
// Two layers are covered here:
//   assignment time — bulkAssignCampaignToCompanies refuses the second enrollment
//   send time       — checkCampaignRecipientDuplicate blocks anything that slipped past
//
// TC-CRD-01..08

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted:    [] as Array<Record<string, unknown>>,
  preEnrolled: [] as string[],
  sendRows:    [] as Array<Record<string, unknown>>,
  sendQuery:   null as Record<string, unknown> | null,
  sendError:   false,
}))

// ---- Assignment-time layer -------------------------------------------------

vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence.repo', () => ({
  getCampaignSequenceById: () => Promise.resolve({
    id: 'seq1', tenant_id: 't1', workspace_id: 'w1',
    campaign_type_id: 'type1', name: 'Cold Outreach',
  }),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-type.repo', () => ({
  getCampaignTypeById: () => Promise.resolve({ id: 'type1', slug: 'initial_contact' }),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence-step.repo', () => ({
  listCampaignSequenceStepsForSequence: () => Promise.resolve([]),
}))
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  getAssetById: () => Promise.resolve(null),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: () => Promise.resolve(null),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: () => Promise.resolve({ ids: [] }) },
}))

// Five locations, all owned by one operator who uses a single address. Mirrors
// the real 'Aaron Hagan owns five Mister Sparky franchises' row group.
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  listCompanies: () => Promise.resolve([
    { id: 'ms-kc',    customer_status: 'prospect' },
    { id: 'ms-scott', customer_status: 'prospect' },
    { id: 'ms-draper',customer_status: 'prospect' },
    { id: 'solo',     customer_status: 'prospect' },
  ]),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  listContacts: (opts: { companyId: string }) => Promise.resolve([
    opts.companyId === 'solo'
      ? { id: 'c-solo', email: 'someone.else@example.com', do_not_contact: false }
      // Same human, three companies. Case varies to prove normalization.
      : { id: `c-${opts.companyId}`,
          email: opts.companyId === 'ms-scott' ? 'Aaron.Hagan@MisterSparky.com'
                                               : 'aaron.hagan@mistersparky.com',
          do_not_contact: false },
  ]),
}))
vi.mock('@/modules/messaging/repositories/campaign-assignment.repo', () => ({
  getActiveDuplicateAssignment: () => Promise.resolve(null),
  getActiveDuplicateAssignmentContact: () => Promise.resolve(null),
  listActiveAssignmentEmailsForSequence: () => {
    if (h.preEnrolled.includes('__throw__')) return Promise.reject(new Error('db down'))
    return Promise.resolve(new Set(h.preEnrolled))
  },
  insertCampaignAssignment: (row: Record<string, unknown>) => {
    const persisted = { ...row, id: `asg-${h.inserted.length + 1}`, starts_at: null }
    h.inserted.push(persisted)
    return Promise.resolve(persisted)
  },
}))

// ---- Send-time layer -------------------------------------------------------

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      const capture = (k: string, v: unknown) => {
        h.sendQuery = { ...(h.sendQuery ?? {}), [k]: v }
        return b
      }
      Object.assign(b, {
        select:   () => b,
        eq:       (col: string, v: unknown) => capture(col, v),
        in:       (col: string, v: unknown) => capture(col, v),
        contains: (_col: string, v: unknown) => capture('contains', v),
        limit:    () => h.sendError
          ? Promise.resolve({ data: null, error: { message: 'boom' } })
          : Promise.resolve({ data: h.sendRows, error: null }),
      })
      return b
    },
  }),
}))

import { bulkAssignCampaignToCompanies } from '@/modules/messaging/services/campaign-assignment.service'
import { checkCampaignRecipientDuplicate } from '@/modules/messaging/services/campaign-recipient-guard.service'

beforeEach(() => {
  h.inserted    = []
  h.preEnrolled = []
  h.sendRows    = []
  h.sendQuery   = null
  h.sendError   = false
})

const bulk = (extra: Record<string, unknown> = {}) => bulkAssignCampaignToCompanies({
  tenantId: 't1', workspaceId: 'w1',
  companyIds: ['ms-kc', 'ms-scott', 'ms-draper', 'solo'],
  campaignSequenceId: 'seq1',
  autoApproveFirstTouch: false,
  ...extra,
})

describe('TC-CRD-01: one shared inbox enrolls once across many companies', () => {
  it('three locations owned by one person produce one assignment, not three', async () => {
    const tally = await bulk()
    expect(tally.created).toBe(2)                  // the operator, plus the unrelated company
    expect(tally.skippedDuplicateRecipient).toBe(2)

    const emails = h.inserted.map(r => r.contact_id)
    expect(emails).toHaveLength(2)
  })

  it('normalizes case, so a differently-cased address is still the same person', async () => {
    // ms-scott's address differs only in capitalization from ms-kc's.
    const tally = await bulk({ companyIds: ['ms-kc', 'ms-scott'] })
    expect(tally.created).toBe(1)
    expect(tally.skippedDuplicateRecipient).toBe(1)
  })
})

describe('TC-CRD-02: addresses already live on the sequence are not re-enrolled', () => {
  it('a prior run of the same bulk assign cannot double-enroll', async () => {
    h.preEnrolled = ['aaron.hagan@mistersparky.com']
    const tally = await bulk()
    expect(tally.created).toBe(1)                  // only the unrelated company
    expect(tally.skippedDuplicateRecipient).toBe(3)
  })
})

describe('TC-CRD-03: the enrollment lookup fails closed', () => {
  it('rejects rather than assuming nobody is enrolled', async () => {
    h.preEnrolled = ['__throw__']
    await expect(bulk()).rejects.toThrow()
    expect(h.inserted).toHaveLength(0)
  })
})

// ---- Send-time backstop ----------------------------------------------------

const guard = (over: Record<string, unknown> = {}) => checkCampaignRecipientDuplicate({
  tenantId: 't1',
  toEmail: 'aaron.hagan@mistersparky.com',
  campaignSequenceId: 'seq1',
  campaignAssignmentId: 'asg-current',
  ...over,
})

describe('TC-CRD-04: a later touch of the SAME assignment is never blocked', () => {
  it('multi-touch sequences keep working', async () => {
    h.sendRows = [{ id: 's1', metadata: { campaign_assignment_id: 'asg-current' } }]
    expect((await guard()).blocked).toBe(false)
  })
})

describe('TC-CRD-05: the same address reached via a DIFFERENT assignment is blocked', () => {
  it('blocks and names the conflicting enrollment', async () => {
    h.sendRows = [{ id: 's1', metadata: { campaign_assignment_id: 'asg-other' } }]
    const r = await guard()
    expect(r.blocked).toBe(true)
    if (r.blocked) {
      expect(r.reason).toBe('recipient_already_in_campaign')
      expect(r.conflictingAssignmentId).toBe('asg-other')
    }
  })

  it('blocks even when a same-assignment row is also present', async () => {
    h.sendRows = [
      { id: 's1', metadata: { campaign_assignment_id: 'asg-current' } },
      { id: 's2', metadata: { campaign_assignment_id: 'asg-other' } },
    ]
    expect((await guard()).blocked).toBe(true)
  })
})

describe('TC-CRD-06: non-campaign sends are out of scope', () => {
  it('no sequence id means no guard', async () => {
    h.sendRows = [{ id: 's1', metadata: { campaign_assignment_id: 'asg-other' } }]
    expect((await guard({ campaignSequenceId: null })).blocked).toBe(false)
  })
  it('no assignment id means no guard', async () => {
    h.sendRows = [{ id: 's1', metadata: { campaign_assignment_id: 'asg-other' } }]
    expect((await guard({ campaignAssignmentId: null })).blocked).toBe(false)
  })
})

describe('TC-CRD-07: address matching cannot use wildcards', () => {
  it("matches on an explicit value list, so '_' is not a single-char wildcard", async () => {
    await guard({ toEmail: 'first_last@example.com' })
    // Underscore-bearing address is passed through `.in`, never `.ilike`.
    expect(h.sendQuery?.to_email).toEqual(['first_last@example.com'])
  })
  it('queries both the stored and lowercased forms', async () => {
    await guard({ toEmail: 'Aaron.Hagan@MisterSparky.com' })
    expect(h.sendQuery?.to_email).toEqual([
      'Aaron.Hagan@MisterSparky.com',
      'aaron.hagan@mistersparky.com',
    ])
  })
  it('scopes the lookup to the sequence and to live sends only', async () => {
    await guard()
    expect(h.sendQuery?.contains).toEqual({ campaign_sequence_id: 'seq1' })
    expect(h.sendQuery?.status).toEqual(['queued', 'sent', 'provider_accepted'])
  })
})

describe('TC-CRD-08: the send-path guard never throws', () => {
  it('a query error returns not-blocked instead of failing the send', async () => {
    h.sendError = true
    expect((await guard()).blocked).toBe(false)
  })
})
