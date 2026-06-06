/**
 * Phase 3Q — Proposal Follow-Up Work Queue
 * Test suite: source-reading tier — Slice 6 (read-only UI page + sidebar nav)
 *
 * Pattern: fs.readFileSync + toContain / not.toContain / regex
 * No Supabase mocking. No LLM mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const QUEUE_PAGE    = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx'
const QUEUE_ACTION  = 'modules/proposals/actions/proposal-follow-up-queue.actions.ts'
const SIDEBAR       = 'components/layout/Sidebar.tsx'

// ---------------------------------------------------------------------------
// Slice 6 — read-only follow-up queue UI
// TC-3Q-101 through TC-3Q-120
// ---------------------------------------------------------------------------

describe('Slice 6: follow-up queue UI page', () => {

  it('TC-3Q-101: follow-up queue page file exists and is readable', () => {
    expect(() => readSrc(QUEUE_PAGE)).not.toThrow()
  })

  it('TC-3Q-102: page imports getProposalFollowUpQueueAction from action file', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('getProposalFollowUpQueueAction')
    expect(src).toContain('proposal-follow-up-queue.actions')
  })

  it('TC-3Q-103: page destructures or references items from queue response', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('items')
  })

  it('TC-3Q-104: page references summary from queue response', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('summary')
  })

  it('TC-3Q-105: page references appliedFilters from queue response', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('appliedFilters')
  })

  it('TC-3Q-106: page references generatedAt from queue response', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('generatedAt')
  })

  it('TC-3Q-107: page references follow_up_due_at field', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('follow_up_due_at')
  })

  it('TC-3Q-108: page references proposal_status field', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('proposal_status')
  })

  it('TC-3Q-109: page references follow_up_sequence field', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('follow_up_sequence')
  })

  it('TC-3Q-110: page includes empty state for no open commitments', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('No open follow-up commitments')
  })

  it('TC-3Q-111: page includes empty state for no commitments matching filter', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('No commitments matching this filter')
  })

  it('TC-3Q-112: page includes error/failure state for load failure', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('Failed to load')
    expect(src).toContain('result.success')
  })

  it('TC-3Q-113: page is read-only — no insert, update, delete, or upsert in page source', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toMatch(/\.insert\(/)
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.delete\(/)
    expect(src).not.toMatch(/\.upsert\(/)
  })

  it('TC-3Q-114: page does not import mutation server actions', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('completeFollowUpAction')
    expect(src).not.toContain('skipFollowUpAction')
    expect(src).not.toContain('sendFollowUpAction')
    expect(src).not.toContain('scheduleFollowUpAction')
    expect(src).not.toContain('updateProposalStatusAction')
  })

  it('TC-3Q-115: page does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3Q-116: page does not reference campaign sending flag', () => {
    const src = readSrc(QUEUE_PAGE)
    // Phase 3T added a legitimate read of EMAIL_SENDING_ENABLED for the Send UI
    // feature flag gate — its presence is expected from that point forward.
    // CAMPAIGN_SENDING_ENABLED must still not appear.
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3Q-117: page links each row to the proposal event detail page', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('proposal-events')
    expect(src).toContain('proposal_event_id')
  })

  it('TC-3Q-118: page includes due filter tabs for overdue, today, and upcoming', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('overdue')
    expect(src).toContain('today')
    expect(src).toContain('upcoming')
  })

  it('TC-3Q-119: page does not include mutation action controls (complete, skip, send, reschedule)', () => {
    const src = readSrc(QUEUE_PAGE)
    // No action buttons — display-only page
    expect(src).not.toContain('completeFollowUp')
    expect(src).not.toContain('skipFollowUp')
    expect(src).not.toContain('sendFollowUp')
    expect(src).not.toContain('rescheduleFollowUp')
    // No form submitting data
    expect(src).not.toContain('<form')
    // No status-change buttons
    expect(src).not.toContain('Mark complete')
    expect(src).not.toContain('Mark as done')
  })

  it('TC-3Q-120: page does not reference scheduled_activities, calendar_event_id, or closed_reason', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('closed_reason')
  })

})

describe('Slice 6: follow-up queue sidebar navigation', () => {

  it('TC-3Q-121: sidebar includes Follow-Up Queue nav item', () => {
    expect(readSrc(SIDEBAR)).toContain('Follow-Ups')
  })

  it('TC-3Q-122: sidebar links to proposal-follow-ups route', () => {
    expect(readSrc(SIDEBAR)).toContain('proposal-follow-ups')
  })

  it('TC-3Q-123: sidebar imports ListChecks icon for the Follow-Up Queue item', () => {
    expect(readSrc(SIDEBAR)).toContain('ListChecks')
  })

  it('TC-3Q-124: action file still exists and is unchanged in structure (regression guard)', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).toContain('export async function getProposalFollowUpQueueAction')
    expect(src).toContain("'use server'")
  })

})

// ---------------------------------------------------------------------------
// Slice 7 — UI polish / filter state fix
// TC-3Q-125 through TC-3Q-130
// ---------------------------------------------------------------------------

describe('Slice 7: follow-up queue UI — filter state normalization and polish', () => {

  it('TC-3Q-125: page normalizes due=all to All Open active tab state', () => {
    const src = readSrc(QUEUE_PAGE)
    // activeDue must treat 'all' and undefined both as null (All Open)
    expect(src).toContain("due === 'all'")
    expect(src).toContain('activeDue')
  })

  it('TC-3Q-126: All Open tab href uses base URL — does not append ?due=all', () => {
    const src = readSrc(QUEUE_PAGE)
    // The All Open tab must link to the base route, not ?due=all
    expect(src).not.toContain('?due=all')
  })

  it('TC-3Q-127: filtered empty state uses isFiltered — due=all does not trigger filter-scoped wording', () => {
    const src = readSrc(QUEUE_PAGE)
    // isFiltered must exclude 'all' so ?due=all shows global empty state, not "No commitments matching"
    expect(src).toContain('isFiltered')
    expect(src).toContain("due !== 'all'")
  })

  it('TC-3Q-128: column header is Cadence (not Schedule Rule) to avoid confusion with scheduling actions', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('Cadence')
    expect(src).not.toContain('Schedule Rule')
  })

  it('TC-3Q-129: summary strip uses As of label for generatedAt', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('As of')
  })

  it('TC-3Q-130: page remains read-only after polish — no insert, update, delete, upsert, or forms', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toMatch(/\.insert\(/)
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.delete\(/)
    expect(src).not.toMatch(/\.upsert\(/)
    expect(src).not.toContain('<form')
  })

})

// ---------------------------------------------------------------------------
// Slice 14F — Permission-aware mutation controls
// TC-3Q-131 through TC-3Q-135
// ---------------------------------------------------------------------------

describe('Slice 14F: follow-up queue UI — permission-aware mutation visibility', () => {

  it('TC-3Q-131: page imports hasPermission to derive mutation visibility', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('hasPermission')
  })

  it('TC-3Q-132: page checks crm.leads.edit permission for mutation controls', () => {
    expect(readSrc(QUEUE_PAGE)).toContain("'crm.leads.edit'")
  })

  it('TC-3Q-133: page derives canMutate from permission check', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('canMutate')
  })

  it('TC-3Q-134: mutation controls are conditionally rendered based on canMutate', () => {
    const src = readSrc(QUEUE_PAGE)
    // canMutate gates all three mutation controls
    expect(src).toContain('canMutate')
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('SkipFollowUpButton')
    expect(src).toContain('RescheduleFollowUpButton')
  })

  it('TC-3Q-135: page falls back to canMutate=false on auth error', () => {
    // Hiding controls is safer than showing broken buttons if context resolution fails.
    expect(readSrc(QUEUE_PAGE)).toContain('canMutate = false')
  })

})
