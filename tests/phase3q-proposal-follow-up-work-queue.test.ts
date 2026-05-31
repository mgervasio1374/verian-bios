/**
 * Phase 3Q — Proposal Follow-Up Work Queue
 * Test suite: source-reading tier — Slice 2 (repository read model)
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
// Repository path
// ---------------------------------------------------------------------------

const QUEUE_REPO = 'modules/proposals/repositories/proposal-follow-up-commitments.repo.ts'

// ---------------------------------------------------------------------------
// Slice 2 — listProposalFollowUpQueueItemsForWorkspace
// TC-3Q-001 through TC-3Q-034
// ---------------------------------------------------------------------------

describe('Slice 2: follow-up queue repo — listProposalFollowUpQueueItemsForWorkspace', () => {

  it('TC-3Q-001: commitments repo file exists and is readable', () => {
    expect(() => readSrc(QUEUE_REPO)).not.toThrow()
  })

  it('TC-3Q-002: ProposalFollowUpQueueItem interface is exported', () => {
    expect(readSrc(QUEUE_REPO)).toContain('export interface ProposalFollowUpQueueItem')
  })

  it('TC-3Q-003: ListProposalFollowUpQueueOptions interface is exported', () => {
    expect(readSrc(QUEUE_REPO)).toContain('export interface ListProposalFollowUpQueueOptions')
  })

  it('TC-3Q-004: listProposalFollowUpQueueItemsForWorkspace function is exported', () => {
    expect(readSrc(QUEUE_REPO)).toContain('export async function listProposalFollowUpQueueItemsForWorkspace')
  })

  it('TC-3Q-005: function scopes commitments by tenant_id', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('TC-3Q-006: function scopes commitments by workspace_id', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3Q-007: function filters commitment_status = open by default', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".eq('commitment_status', 'open')")
  })

  it('TC-3Q-008: function sorts by follow_up_due_at ASC', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'follow_up_due_at'")
    expect(fnBody).toContain('ascending: true')
  })

  it('TC-3Q-009: function applies limit and offset via .range()', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('.range(')
    expect(fnBody).toContain('offset + limit - 1')
    expect(fnBody).toContain('?? 100')
    expect(fnBody).toContain('?? 0')
  })

  it('TC-3Q-010: function supports due=overdue filter using .lt() on follow_up_due_at', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'overdue'")
    expect(fnBody).toContain('.lt(')
  })

  it('TC-3Q-011: function supports due=today filter using UTC day boundaries', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'today'")
    expect(fnBody).toContain('dayStart')
    expect(fnBody).toContain('dayEnd')
    expect(fnBody).toContain('.gte(')
  })

  it('TC-3Q-012: function supports due=upcoming filter using .gte() on follow_up_due_at', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'upcoming'")
  })

  it('TC-3Q-013: function returns [] early when no commitments are found', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('commitments.length === 0')
    expect(fnBody).toContain('return []')
  })

  it('TC-3Q-014: enrichment uses a single batch query against proposal_events — not N+1', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    // Exactly one .from('proposal_events') within this function
    const eventQueryCount = (fnBody.match(/from\('proposal_events'\)/g) || []).length
    expect(eventQueryCount).toBe(1)
    // That query uses .in() with eventIds
    const eventsQueryStart = fnBody.indexOf("from('proposal_events')")
    const eventsSection = fnBody.slice(eventsQueryStart, eventsQueryStart + 400)
    expect(eventsSection).toContain('.in(')
    expect(eventsSection).toContain('eventIds')
  })

  it('TC-3Q-015: enrichment scopes the proposal_events batch query by tenant_id', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    const eventsStart = fnBody.indexOf("from('proposal_events')")
    const eventsSection = fnBody.slice(eventsStart, eventsStart + 500)
    expect(eventsSection).toContain(".eq('tenant_id'")
  })

  it('TC-3Q-016: enrichment scopes the proposal_events batch query by workspace_id', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    const eventsStart = fnBody.indexOf("from('proposal_events')")
    const eventsSection = fnBody.slice(eventsStart, eventsStart + 500)
    expect(eventsSection).toContain(".eq('workspace_id'")
  })

  it('TC-3Q-017: function omits commitments whose proposal event is not found — no partial enrichment rows', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('if (!event) continue')
  })

  it('TC-3Q-018: read model includes proposal_status field', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('proposal_status')
  })

  it('TC-3Q-019: read model includes proposal_sent_at field', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('proposal_sent_at')
  })

  it('TC-3Q-020: read model includes proposal_currency field', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('proposal_currency')
  })

  it('TC-3Q-021: read model includes capture_source field', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('capture_source')
  })

  it('TC-3Q-022: read model includes company_id (nullable)', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('company_id')
  })

  it('TC-3Q-023: read model includes contact_id (nullable)', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('contact_id')
  })

  it('TC-3Q-024: read model includes lead_id (nullable)', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    expect(ifaceBody).toContain('lead_id')
  })

  it('TC-3Q-025: listProposalFollowUpQueueItemsForWorkspace does not call insert, update, delete, or upsert', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toMatch(/\.insert\(/)
    expect(fnBody).not.toMatch(/\.update\(/)
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toMatch(/\.upsert\(/)
  })

  it('TC-3Q-026: function does not reference closed_reason', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('closed_reason')
  })

  it('TC-3Q-027: function does not reference sendEmail, Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('sendEmail')
    expect(fnBody).not.toContain('Resend')
    expect(fnBody).not.toContain('Inngest')
    expect(fnBody).not.toContain('OpenAI')
    expect(fnBody).not.toContain('Anthropic')
  })

  it('TC-3Q-028: function does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('EMAIL_SENDING_ENABLED')
    expect(fnBody).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3Q-029: ListProposalFollowUpQueueOptions has due, followUpSequence, proposalStatus, limit, offset fields', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ListProposalFollowUpQueueOptions')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('due?')
    expect(ifaceBody).toContain('followUpSequence?')
    expect(ifaceBody).toContain('proposalStatus?')
    expect(ifaceBody).toContain('limit?')
    expect(ifaceBody).toContain('offset?')
  })

  it('TC-3Q-030: ProposalFollowUpQueueItem declares proposal_status, proposal_sent_at, proposal_currency, capture_source as non-nullable string', () => {
    const src = readSrc(QUEUE_REPO)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 1200)
    // Non-nullable declarations must be present
    expect(ifaceBody).toContain('proposal_status: string')
    expect(ifaceBody).toContain('proposal_sent_at: string')
    expect(ifaceBody).toContain('proposal_currency: string')
    expect(ifaceBody).toContain('capture_source: string')
    // Must NOT be declared as nullable
    expect(ifaceBody).not.toContain('proposal_status: string | null')
    expect(ifaceBody).not.toContain('proposal_sent_at: string | null')
    expect(ifaceBody).not.toContain('proposal_currency: string | null')
    expect(ifaceBody).not.toContain('capture_source: string | null')
  })

  it('TC-3Q-031: function uses createSupabaseServiceClient, not browser client', () => {
    expect(readSrc(QUEUE_REPO)).toContain('createSupabaseServiceClient')
  })

  it('TC-3Q-032: function does not reference scheduled_activities or calendar_event_id', () => {
    const src = readSrc(QUEUE_REPO)
    const fnStart = src.indexOf('export async function listProposalFollowUpQueueItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('scheduled_activities')
    expect(fnBody).not.toContain('calendar_event_id')
  })

  it('TC-3Q-033: no server action file for follow-up queue created in Slice 2 (guard)', () => {
    expect(() => readSrc('modules/proposals/actions/proposal-follow-up-queue.actions.ts')).toThrow()
  })

  it('TC-3Q-034: no UI page for follow-up queue created in Slice 2 (guard)', () => {
    expect(() => readSrc('app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx')).toThrow()
  })

})
