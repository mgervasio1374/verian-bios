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

// ---------------------------------------------------------------------------
// Slice 3 — Proposal Event Inbox UI
// TC-3P-041 through TC-3P-070
// ---------------------------------------------------------------------------

const EVENTS_PAGE   = 'app/(workspace)/[workspaceSlug]/proposal-events/page.tsx'
const SIDEBAR       = 'components/layout/Sidebar.tsx'

describe('Slice 3: proposal events inbox page', () => {

  it('TC-3P-041: proposal-events page file exists', () => {
    expect(() => readSrc(EVENTS_PAGE)).not.toThrow()
  })

  it('TC-3P-042: page imports listProposalEventInboxItemsForWorkspace', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('listProposalEventInboxItemsForWorkspace')
  })

  it('TC-3P-043: page imports createSupabaseServerClient', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('createSupabaseServerClient')
  })

  it('TC-3P-044: page imports buildRequestContext', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('buildRequestContext')
  })

  it('TC-3P-045: page calls requirePermission or equivalent permission check', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('requirePermission')
  })

  it('TC-3P-046: page passes ctx.tenantId to listProposalEventInboxItemsForWorkspace', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('ctx.tenantId')
  })

  it('TC-3P-047: page passes ctx.workspaceId to listProposalEventInboxItemsForWorkspace', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('ctx.workspaceId')
  })

  it('TC-3P-048: page does not accept tenantId, workspaceId, or userId from client query params', () => {
    const src = readSrc(EVENTS_PAGE)
    expect(src).not.toContain('searchParams.tenantId')
    expect(src).not.toContain('searchParams.workspaceId')
    expect(src).not.toContain('searchParams.userId')
  })

  it('TC-3P-049: page renders proposal_status', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('proposal_status')
  })

  it('TC-3P-050: page renders proposal_sent_at', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('proposal_sent_at')
  })

  it('TC-3P-051: page renders capture_source', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('capture_source')
  })

  it('TC-3P-052: page renders proposal_reference', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('proposal_reference')
  })

  it('TC-3P-053: page renders proposal_amount and proposal_currency', () => {
    const src = readSrc(EVENTS_PAGE)
    expect(src).toContain('proposal_amount')
    expect(src).toContain('proposal_currency')
  })

  it('TC-3P-054: page renders estimated_savings', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('estimated_savings')
  })

  it('TC-3P-055: page renders next_open_follow_up_due_at', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('next_open_follow_up_due_at')
  })

  it('TC-3P-056: page renders open_commitment_count and total_commitment_count', () => {
    const src = readSrc(EVENTS_PAGE)
    expect(src).toContain('open_commitment_count')
    expect(src).toContain('total_commitment_count')
  })

  it('TC-3P-057: page has empty state text', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('No proposal events yet.')
  })

  it('TC-3P-058: page links to dynamic proposal-events detail route', () => {
    expect(readSrc(EVENTS_PAGE)).toContain('proposal-events/${e.id}')
  })

  it('TC-3P-059: page does not contain Create Proposal Event button', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('Create Proposal Event')
  })

  it('TC-3P-060: page does not contain Send Email text', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('Send Email')
  })

  it('TC-3P-061: page does not contain Launch Campaign text', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('Launch Campaign')
  })

  it('TC-3P-062: page does not contain Start Follow-Up text', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('Start Follow-Up')
  })

  it('TC-3P-063: page does not import Resend, Inngest, or LLM providers', () => {
    const src = readSrc(EVENTS_PAGE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3P-064: page does not reference EMAIL_SENDING_ENABLED', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('TC-3P-065: page does not reference CAMPAIGN_SENDING_ENABLED', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3P-066: page does not call sendEmail', () => {
    expect(readSrc(EVENTS_PAGE)).not.toContain('sendEmail')
  })

  it('TC-3P-067: no server action file created in Slice 3 for proposal-events', () => {
    expect(() => readSrc('modules/proposals/actions/proposal-events.actions.ts')).toThrow()
  })

  it('TC-3P-068: proposal event detail page exists (created in Slice 4)', () => {
    expect(() => readSrc('app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx')).not.toThrow()
  })

})

describe('Slice 3: sidebar navigation', () => {

  it('TC-3P-069: sidebar includes Proposal Events nav item', () => {
    expect(readSrc(SIDEBAR)).toContain('Proposal Events')
  })

  it('TC-3P-070: sidebar Proposal Events link points to /proposal-events', () => {
    expect(readSrc(SIDEBAR)).toContain('proposal-events')
  })

  it('TC-3P-071: sidebar does not add sending or campaign language for Proposal Events', () => {
    const src = readSrc(SIDEBAR)
    const peStart = src.indexOf('Proposal Events')
    const peContext = src.slice(peStart, peStart + 200)
    expect(peContext).not.toContain('Send')
    expect(peContext).not.toContain('Campaign')
    expect(peContext).not.toContain('Email')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Proposal Event Detail UI
// TC-3P-072 through TC-3P-111
// ---------------------------------------------------------------------------

const EVENT_DETAIL_PAGE = 'app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx'

describe('Slice 4: proposal event detail page', () => {

  it('TC-3P-072: detail page file exists', () => {
    expect(() => readSrc(EVENT_DETAIL_PAGE)).not.toThrow()
  })

  it('TC-3P-073: page imports getProposalEventById', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('getProposalEventById')
  })

  it('TC-3P-074: page imports listCommitmentsForProposalEvent', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('listCommitmentsForProposalEvent')
  })

  it('TC-3P-075: page imports createSupabaseServerClient', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('createSupabaseServerClient')
  })

  it('TC-3P-076: page imports buildRequestContext', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('buildRequestContext')
  })

  it('TC-3P-077: page calls requirePermission', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('requirePermission')
  })

  it('TC-3P-078: page passes ctx.tenantId and ctx.workspaceId to getProposalEventById', () => {
    const src = readSrc(EVENT_DETAIL_PAGE)
    expect(src).toContain('ctx.tenantId')
    expect(src).toContain('ctx.workspaceId')
    expect(src).toContain('getProposalEventById')
  })

  it('TC-3P-079: page passes ctx.tenantId and ctx.workspaceId to listCommitmentsForProposalEvent', () => {
    const src = readSrc(EVENT_DETAIL_PAGE)
    // Use the call-site occurrence (last indexOf, past the import line)
    const fnCall = src.lastIndexOf('listCommitmentsForProposalEvent')
    const callSite = src.slice(fnCall, fnCall + 200)
    expect(callSite).toContain('ctx.tenantId')
    expect(callSite).toContain('ctx.workspaceId')
  })

  it('TC-3P-080: page calls notFound() when proposal event is missing', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('notFound()')
  })

  it('TC-3P-081: page renders proposal_status', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('proposal_status')
  })

  it('TC-3P-082: page renders proposal_sent_at', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('proposal_sent_at')
  })

  it('TC-3P-083: page renders proposal_reference', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('proposal_reference')
  })

  it('TC-3P-084: page renders proposal_amount and proposal_currency', () => {
    const src = readSrc(EVENT_DETAIL_PAGE)
    expect(src).toContain('proposal_amount')
    expect(src).toContain('proposal_currency')
  })

  it('TC-3P-085: page renders estimated_savings', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('estimated_savings')
  })

  it('TC-3P-086: page renders capture_source', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('capture_source')
  })

  it('TC-3P-087: page renders lead_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('lead_id')
  })

  it('TC-3P-088: page renders company_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('company_id')
  })

  it('TC-3P-089: page renders contact_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('contact_id')
  })

  it('TC-3P-090: page renders capture_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('capture_id')
  })

  it('TC-3P-091: page links capture_id to /proposal-inbox/[captureId]', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('proposal-inbox/${event.capture_id}')
  })

  it('TC-3P-092: page renders follow_up_sequence', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('follow_up_sequence')
  })

  it('TC-3P-093: page renders follow_up_due_at', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('follow_up_due_at')
  })

  it('TC-3P-094: page renders commitment_status', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('commitment_status')
  })

  it('TC-3P-095: page renders schedule_rule_key', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('schedule_rule_key')
  })

  it('TC-3P-096: page renders assigned_to_user_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('assigned_to_user_id')
  })

  it('TC-3P-097: page renders completed_at', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('completed_at')
  })

  it('TC-3P-098: page renders completed_by_user_id', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('completed_by_user_id')
  })

  it('TC-3P-099: page renders completion_notes', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).toContain('completion_notes')
  })

  it('TC-3P-100: page does not reference closed_reason', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('closed_reason')
  })

  it('TC-3P-101: page does not contain Send Email text', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('Send Email')
  })

  it('TC-3P-102: page does not contain Launch Campaign text', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('Launch Campaign')
  })

  it('TC-3P-103: page does not contain Start Follow-Up text', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('Start Follow-Up')
  })

  it('TC-3P-104: page does not contain Complete Follow-Up text', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('Complete Follow-Up')
  })

  it('TC-3P-105: page does not contain Skip Follow-Up text', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('Skip Follow-Up')
  })

  it('TC-3P-106: page does not import Resend, Inngest, or LLM providers', () => {
    const src = readSrc(EVENT_DETAIL_PAGE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3P-107: page does not reference EMAIL_SENDING_ENABLED', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('TC-3P-108: page does not reference CAMPAIGN_SENDING_ENABLED', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3P-109: page does not call sendEmail', () => {
    expect(readSrc(EVENT_DETAIL_PAGE)).not.toContain('sendEmail')
  })

  it('TC-3P-110: no proposal-events server action file created in this slice', () => {
    expect(() => readSrc('modules/proposals/actions/proposal-events.actions.ts')).toThrow()
  })

  it('TC-3P-111: no ProposalStatusControl component created in this slice', () => {
    const detailDir = 'app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/ProposalStatusControl.tsx'
    expect(() => readSrc(detailDir)).toThrow()
  })

})
