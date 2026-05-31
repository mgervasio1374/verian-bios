/**
 * Phase 3P — Proposal Event Visibility / Follow-Up Commitment Review UI
 * Test suite: source-reading tier — Slice 2 (repository methods)
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
// Repository paths
// ---------------------------------------------------------------------------

const EVENTS_REPO      = 'modules/proposals/repositories/proposal-events.repo.ts'
const COMMITMENTS_REPO = 'modules/proposals/repositories/proposal-follow-up-commitments.repo.ts'

// ---------------------------------------------------------------------------
// Slice 2 — listProposalEventInboxItemsForWorkspace
// TC-3P-001 through TC-3P-023
// ---------------------------------------------------------------------------

describe('Slice 2: proposal events repo — listProposalEventInboxItemsForWorkspace', () => {

  it('TC-3P-001: events repo file exists and is readable', () => {
    expect(() => readSrc(EVENTS_REPO)).not.toThrow()
  })

  it('TC-3P-002: ProposalEventInboxItem interface is exported', () => {
    expect(readSrc(EVENTS_REPO)).toContain('export interface ProposalEventInboxItem')
  })

  it('TC-3P-003: ListProposalEventInboxItemsOptions interface is exported', () => {
    expect(readSrc(EVENTS_REPO)).toContain('export interface ListProposalEventInboxItemsOptions')
  })

  it('TC-3P-004: listProposalEventInboxItemsForWorkspace function is exported', () => {
    expect(readSrc(EVENTS_REPO)).toContain('export async function listProposalEventInboxItemsForWorkspace')
  })

  it('TC-3P-005: function scopes events by tenant_id', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('TC-3P-006: function scopes events by workspace_id', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3P-007: function filters deleted_at IS NULL', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain(".is('deleted_at', null)")
  })

  it('TC-3P-008: function sorts by proposal_sent_at descending', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'proposal_sent_at'")
    expect(fnBody).toContain('ascending: false')
  })

  it('TC-3P-009: function defaults limit to 100 and offset to 0', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('?? 100')
    expect(fnBody).toContain('?? 0')
  })

  it('TC-3P-009b: function applies offset via .range(offset, offset + limit - 1)', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('.range(')
    expect(fnBody).toContain('offset + limit - 1')
  })

  it('TC-3P-010: open status maps to sent and viewed', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("=== 'open'")
    expect(fnBody).toContain("'sent'")
    expect(fnBody).toContain("'viewed'")
  })

  it('TC-3P-011: closed status maps to accepted, rejected, expired, withdrawn', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("=== 'closed'")
    expect(fnBody).toContain("'accepted'")
    expect(fnBody).toContain("'rejected'")
    expect(fnBody).toContain("'expired'")
    expect(fnBody).toContain("'withdrawn'")
  })

  it('TC-3P-012: captureSource option filters on capture_source column', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain("'capture_source'")
    expect(fnBody).toContain('captureSource')
  })

  it('TC-3P-013: function returns [] early when no events are found', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('events.length === 0')
    expect(fnBody).toContain('return []')
  })

  it('TC-3P-014: enrichment query scopes proposal_follow_up_commitments by tenant_id', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    const commitStart = fnBody.indexOf("from('proposal_follow_up_commitments')")
    expect(commitStart).toBeGreaterThan(-1)
    const commitSection = fnBody.slice(commitStart, commitStart + 500)
    expect(commitSection).toContain(".eq('tenant_id'")
  })

  it('TC-3P-015: enrichment query scopes proposal_follow_up_commitments by workspace_id', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    const commitStart = fnBody.indexOf("from('proposal_follow_up_commitments')")
    expect(commitStart).toBeGreaterThan(-1)
    const commitSection = fnBody.slice(commitStart, commitStart + 500)
    expect(commitSection).toContain(".eq('workspace_id'")
  })

  it('TC-3P-016: enrichment uses a single batch IN query on event IDs — not per-row N+1', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    // Only one query against proposal_follow_up_commitments in this function
    const commitQueryCount = (fnBody.match(/from\('proposal_follow_up_commitments'\)/g) || []).length
    expect(commitQueryCount).toBe(1)
    // That query uses .in() with event IDs
    const commitStart = fnBody.indexOf("from('proposal_follow_up_commitments')")
    const commitSection = fnBody.slice(commitStart, commitStart + 600)
    expect(commitSection).toContain('.in(')
    expect(commitSection).toContain('eventIds')
  })

  it('TC-3P-017: next_open_follow_up_due_at is computed per event from open commitments', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('next_open_follow_up_due_at')
    expect(fnBody).toContain('openCommitments')
    expect(fnBody).toContain('follow_up_due_at')
  })

  it('TC-3P-018: open_commitment_count is computed per event', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('open_commitment_count')
    expect(fnBody).toContain('openCommitments.length')
  })

  it('TC-3P-019: total_commitment_count is computed per event', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('total_commitment_count')
    expect(fnBody).toContain('eventCommitments.length')
  })

  it('TC-3P-020: listProposalEventInboxItemsForWorkspace does not call insert, update, delete, or upsert', () => {
    const src = readSrc(EVENTS_REPO)
    const fnStart = src.indexOf('export async function listProposalEventInboxItemsForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toMatch(/\.insert\(/)
    expect(fnBody).not.toMatch(/\.update\(/)
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toMatch(/\.upsert\(/)
  })

  it('TC-3P-021: events repo does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(EVENTS_REPO)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3P-022: events repo does not import or reference Resend, Inngest, or LLM providers', () => {
    const src = readSrc(EVENTS_REPO)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3P-023: events repo does not reference sendEmail, scheduled_activities, or calendar_event_id', () => {
    const src = readSrc(EVENTS_REPO)
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_event_id')
  })

})

// ---------------------------------------------------------------------------
// Slice 2 — listCommitmentsForProposalEvent
// TC-3P-024 through TC-3P-040
// ---------------------------------------------------------------------------

describe('Slice 2: commitments repo — listCommitmentsForProposalEvent', () => {

  it('TC-3P-024: commitments repo file exists and is readable', () => {
    expect(() => readSrc(COMMITMENTS_REPO)).not.toThrow()
  })

  it('TC-3P-025: listCommitmentsForProposalEvent function is exported', () => {
    expect(readSrc(COMMITMENTS_REPO)).toContain('export async function listCommitmentsForProposalEvent')
  })

  it('TC-3P-026: listCommitmentsForProposalEvent filters by tenant_id', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain(".eq('tenant_id'")
  })

  it('TC-3P-027: listCommitmentsForProposalEvent filters by workspace_id', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain(".eq('workspace_id'")
  })

  it('TC-3P-028: listCommitmentsForProposalEvent filters by proposal_event_id', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain(".eq('proposal_event_id'")
  })

  it('TC-3P-029: listCommitmentsForProposalEvent orders by follow_up_sequence ascending', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain("'follow_up_sequence'")
    expect(fnBody).toContain('ascending: true')
  })

  it('TC-3P-030: listCommitmentsForProposalEvent does not reference closed_reason', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('closed_reason')
  })

  it('TC-3P-031: listCommitmentsForProposalEvent does not call insert, update, delete, or upsert', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toMatch(/\.insert\(/)
    expect(fnBody).not.toMatch(/\.update\(/)
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toMatch(/\.upsert\(/)
  })

  it('TC-3P-032: listCommitmentsForProposalEvent does not reference email/campaign/automation/LLM patterns', () => {
    const src = readSrc(COMMITMENTS_REPO)
    const fnStart = src.indexOf('export async function listCommitmentsForProposalEvent')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toContain('sendEmail')
    expect(fnBody).not.toContain('Resend')
    expect(fnBody).not.toContain('Inngest')
    expect(fnBody).not.toContain('OpenAI')
    expect(fnBody).not.toContain('Anthropic')
    expect(fnBody).not.toContain('EMAIL_SENDING_ENABLED')
    expect(fnBody).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  // Interface shape verification
  it('TC-3P-033: ProposalEventInboxItem includes next_open_follow_up_due_at field', () => {
    const src = readSrc(EVENTS_REPO)
    const ifaceStart = src.indexOf('export interface ProposalEventInboxItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 800)
    expect(ifaceBody).toContain('next_open_follow_up_due_at')
  })

  it('TC-3P-034: ProposalEventInboxItem includes open_commitment_count field', () => {
    const src = readSrc(EVENTS_REPO)
    const ifaceStart = src.indexOf('export interface ProposalEventInboxItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 800)
    expect(ifaceBody).toContain('open_commitment_count')
  })

  it('TC-3P-035: ProposalEventInboxItem includes total_commitment_count field', () => {
    const src = readSrc(EVENTS_REPO)
    const ifaceStart = src.indexOf('export interface ProposalEventInboxItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 800)
    expect(ifaceBody).toContain('total_commitment_count')
  })

  it('TC-3P-036: ProposalEventInboxItem does not include closed_reason', () => {
    const src = readSrc(EVENTS_REPO)
    const ifaceStart = src.indexOf('export interface ProposalEventInboxItem')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 800)
    expect(ifaceBody).not.toContain('closed_reason')
  })

  it('TC-3P-037: ListProposalEventInboxItemsOptions has status, captureSource, limit, offset fields', () => {
    const src = readSrc(EVENTS_REPO)
    const ifaceStart = src.indexOf('export interface ListProposalEventInboxItemsOptions')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('status?')
    expect(ifaceBody).toContain('captureSource?')
    expect(ifaceBody).toContain('limit?')
    expect(ifaceBody).toContain('offset?')
  })

  it('TC-3P-038: listProposalEventInboxItemsForWorkspace uses service client, not browser client', () => {
    expect(readSrc(EVENTS_REPO)).toContain("createSupabaseServiceClient")
  })

  it('TC-3P-039: listCommitmentsForProposalEvent uses service client, not browser client', () => {
    expect(readSrc(COMMITMENTS_REPO)).toContain("createSupabaseServiceClient")
  })

  it('TC-3P-040: both new methods return array types (not single row or void)', () => {
    const eventsSrc = readSrc(EVENTS_REPO)
    const commitsSrc = readSrc(COMMITMENTS_REPO)
    expect(eventsSrc).toContain('Promise<ProposalEventInboxItem[]>')
    expect(commitsSrc).toContain('Promise<CommitmentRow[]>')
  })

})
