// mcm-v2 — Review-proposal preview link. An operator can preview the hosted
// proposal before sending; previewing must NOT record a merchant view. Behavioral
// tests for the non-tracking preview path in the public loader, plus a
// source-read that the detail page surfaces a non-tracking review link.
// TC-RP-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventByShareToken: vi.fn(),
  markProposalViewedIfUnseen:   vi.fn(async () => true),
}))

import { getPublicProposalByToken } from '@/modules/proposals/services/public-proposal.service'
import { getProposalEventByShareToken, markProposalViewedIfUnseen } from '@/modules/proposals/repositories/proposal-events.repo'

function sentUnseen() {
  return {
    id: 'pe-1', proposal_status: 'sent', first_viewed_at: null,
    estimated_savings: 915, proposal_amount: 10_980, created_at: '2026-06-15T00:00:00Z',
    metadata: { company_name: 'Harbor Diner' },
  }
}

describe('TC-RP-01: preview skips the view-flip on a sent + unseen proposal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preview: true → does not call the flip and returns status "sent"', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce(sentUnseen() as never)
    const view = await getPublicProposalByToken('tok', { preview: true })
    expect(view!.proposalStatus).toBe('sent')
    expect(vi.mocked(markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })
})

describe('TC-RP-02: default (no preview) still records the view', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no opts → calls the flip and returns status "viewed"', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce(sentUnseen() as never)
    const view = await getPublicProposalByToken('tok')
    expect(vi.mocked(markProposalViewedIfUnseen)).toHaveBeenCalledTimes(1)
    expect(view!.proposalStatus).toBe('viewed')
  })

  it('preview: false behaves like default', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce(sentUnseen() as never)
    const view = await getPublicProposalByToken('tok', { preview: false })
    expect(vi.mocked(markProposalViewedIfUnseen)).toHaveBeenCalledTimes(1)
    expect(view!.proposalStatus).toBe('viewed')
  })
})

describe('TC-RP-03: a draft never flips, with or without preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('draft + preview → no flip, status "draft"', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce({
      ...sentUnseen(), proposal_status: 'draft',
    } as never)
    const view = await getPublicProposalByToken('tok', { preview: true })
    expect(view!.proposalStatus).toBe('draft')
    expect(vi.mocked(markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })

  it('draft + default → no flip, status "draft"', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce({
      ...sentUnseen(), proposal_status: 'draft',
    } as never)
    const view = await getPublicProposalByToken('tok')
    expect(view!.proposalStatus).toBe('draft')
    expect(vi.mocked(markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })
})

describe('TC-RP-04: detail page surfaces a non-tracking review link', () => {
  it('renders /p/{share_token}?preview=1 in a new tab, gated on share_token', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'proposal-events', '[eventId]', 'page.tsx'),
      'utf8'
    )
    expect(src).toContain('/p/${event.share_token}?preview=1')
    expect(src).toContain('target="_blank"')
    expect(src).toContain('rel="noopener noreferrer"')
    expect(src).toContain('Review proposal →')
    // gated so it's omitted when there's no token
    expect(src).toMatch(/event\.share_token &&/)
  })
})
