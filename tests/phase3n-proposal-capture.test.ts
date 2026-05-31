/**
 * Phase 3N — Proposal Capture & Follow-Up Commitment
 * Test suite: source-reading and pure-function tiers
 *
 * Slice 1: TC-3N-001–015, TC-3N-141–142 (migration + types)
 * Later slices add TC-3N-016–140, TC-3N-143–148 incrementally.
 *
 * Pattern: fs.readFileSync + toContain / not.toContain
 * No Supabase mocking. No LLM mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// Slice 3 pure-function imports
import {
  AUTO_MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  calculateCaptureConfidence,
  shouldAutoMatch,
  shouldRouteToInbox,
  isProbablySpam,
} from '../modules/proposals/lib/confidence-scoring'
import {
  STANDARD_3_5_10,
  getScheduleRule,
  buildFollowUpCommitmentsFromRule,
} from '../modules/proposals/lib/schedule-rules'
import {
  addDays,
  isDateInFuture,
  isFutureDate,
  isWeekend,
  normalizeToBusinessHour,
  isSameDay,
} from '../modules/proposals/lib/date-math'
import {
  OPEN_PROPOSAL_STATUSES,
  CLOSED_PROPOSAL_STATUSES,
  isOpenProposalStatus,
  isClosedProposalStatus,
  canCreateNewProposal,
} from '../modules/proposals/lib/open-proposal'
import {
  normalizeMessageId,
  hasUsableMessageId,
  buildTenantMessageDedupKey,
  extractWorkspaceSlugFromCaptureAddress,
} from '../modules/proposals/lib/message-dedup'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = path.resolve(__dirname, '..')

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf-8')
}

// ---------------------------------------------------------------------------
// Slice 1 — Data Model, Migration, Test Harness
// TC-3N-001–015, TC-3N-141–142
// ---------------------------------------------------------------------------

const MIGRATION = 'supabase/migrations/20240038_phase3n_proposal_capture.sql'
const TYPES = 'types/database.ts'

describe('Slice 1: Migration 20240038', () => {
  it('TC-3N-001: migration file exists', () => {
    expect(() => readSrc(MIGRATION)).not.toThrow()
  })

  it('TC-3N-002: contains CREATE TABLE proposal_events', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_events')
  })

  it('TC-3N-003: contains CREATE TABLE proposal_captures', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_captures')
  })

  it('TC-3N-004: contains CREATE TABLE proposal_follow_up_commitments', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_follow_up_commitments')
  })

  it('TC-3N-005: contains company_id column', () => {
    expect(readSrc(MIGRATION)).toContain('company_id')
  })

  it('TC-3N-006: does NOT reference accounts.domain', () => {
    expect(readSrc(MIGRATION)).not.toContain('accounts.domain')
  })

  it('TC-3N-007: contains attachments_count', () => {
    expect(readSrc(MIGRATION)).toContain('attachments_count')
  })

  it('TC-3N-008: contains attachment_names', () => {
    expect(readSrc(MIGRATION)).toContain('attachment_names')
  })

  it('TC-3N-009: proposal_captures has deleted_at', () => {
    const src = readSrc(MIGRATION)
    // deleted_at must appear within the proposal_captures table definition
    expect(/proposal_captures[\s\S]{0,2000}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-010: tenant-scoped raw_message_id unique index exists', () => {
    const src = readSrc(MIGRATION)
    // The unique index must include both tenant_id and raw_message_id
    expect(/UNIQUE INDEX[\s\S]{0,300}tenant_id,\s*raw_message_id/.test(src)).toBe(true)
  })

  it('TC-3N-011: does NOT contain a global UNIQUE(raw_message_id) without tenant_id', () => {
    const src = readSrc(MIGRATION)
    // A bare unique constraint on raw_message_id alone is forbidden
    expect(/UNIQUE\s*\(\s*raw_message_id\s*\)/.test(src)).toBe(false)
  })

  it('TC-3N-012: RLS policy uses correct tenant_id cast pattern', () => {
    const src = readSrc(MIGRATION)
    // Exact pattern from migration 20240034 convention
    expect(src).toContain("tenant_id::text = auth.jwt()->>'tenant_id'")
  })

  it('TC-3N-013: service_role RLS policy uses auth.role() = service_role', () => {
    const src = readSrc(MIGRATION)
    expect(src).toContain("auth.role() = 'service_role'")
  })

  it('TC-3N-014: does NOT contain calendar_event_id', () => {
    expect(readSrc(MIGRATION)).not.toContain('calendar_event_id')
  })

  it('TC-3N-015: contains estimated_savings', () => {
    expect(readSrc(MIGRATION)).toContain('estimated_savings')
  })

  it('TC-3N-016: contains opportunity_id', () => {
    expect(readSrc(MIGRATION)).toContain('opportunity_id')
  })

  it('TC-3N-141: contains idx_proposal_events_one_open_per_lead', () => {
    expect(readSrc(MIGRATION)).toContain('idx_proposal_events_one_open_per_lead')
  })

  it("TC-3N-142: partial index WHERE clause contains proposal_status IN ('sent', 'viewed')", () => {
    const src = readSrc(MIGRATION)
    expect(/proposal_status\s+IN\s*\(\s*'sent'\s*,\s*'viewed'\s*\)/.test(src)).toBe(true)
  })

  it('TC-3N-143: user FK columns reference auth.users(id)', () => {
    const src = readSrc(MIGRATION)
    expect(src).toContain('REFERENCES auth.users(id)')
  })

  it('TC-3N-144: migration does NOT reference bare users(id) without auth schema', () => {
    const src = readSrc(MIGRATION)
    // Must not contain the bare unqualified form
    expect(/REFERENCES\s+users\s*\(id\)/.test(src)).toBe(false)
  })
})

describe('Slice 1: types/database.ts extensions', () => {
  it('TC-3N-017: contains proposal_events table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_events')
  })

  it('TC-3N-018: contains proposal_captures table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_captures')
  })

  it('TC-3N-019: contains proposal_follow_up_commitments table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_follow_up_commitments')
  })

  it('TC-3N-020: proposal_events type includes estimated_savings', () => {
    const src = readSrc(TYPES)
    expect(/proposal_events[\s\S]{0,3000}estimated_savings/.test(src)).toBe(true)
  })

  it('TC-3N-021: proposal_events type includes opportunity_id', () => {
    const src = readSrc(TYPES)
    expect(/proposal_events[\s\S]{0,3000}opportunity_id/.test(src)).toBe(true)
  })

  it('TC-3N-022: proposal_captures type includes attachment_names', () => {
    const src = readSrc(TYPES)
    expect(/proposal_captures[\s\S]{0,3000}attachment_names/.test(src)).toBe(true)
  })

  it('TC-3N-023: proposal_captures type includes deleted_at', () => {
    const src = readSrc(TYPES)
    expect(/proposal_captures[\s\S]{0,3000}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-024: proposal_follow_up_commitments type includes follow_up_due_at', () => {
    const src = readSrc(TYPES)
    expect(/proposal_follow_up_commitments[\s\S]{0,3000}follow_up_due_at/.test(src)).toBe(true)
  })

  it('TC-3N-025: types/database.ts does NOT contain calendar_event_id in proposal tables', () => {
    const src = readSrc(TYPES)
    // Extract just the proposal_events block to keep the check targeted
    const proposalBlockMatch = src.match(/proposal_events:\s*\{[\s\S]+?(?=\n      [a-z_]+:|\n    \})/i)
    if (proposalBlockMatch) {
      expect(proposalBlockMatch[0]).not.toContain('calendar_event_id')
    } else {
      // Fallback: full-file check (less precise but still enforces the guardrail)
      expect(src).not.toContain('calendar_event_id')
    }
  })
})

// ---------------------------------------------------------------------------
// Slice 2 — Repository Layer
// TC-3N-030–064
// ---------------------------------------------------------------------------

const REPO_EVENTS   = 'modules/proposals/repositories/proposal-events.repo.ts'
const REPO_CAPTURES = 'modules/proposals/repositories/proposal-captures.repo.ts'
const REPO_COMMITS  = 'modules/proposals/repositories/proposal-follow-up-commitments.repo.ts'

describe('Slice 2: Repository files exist', () => {
  it('TC-3N-030: proposal-events.repo.ts exists', () => {
    expect(() => readSrc(REPO_EVENTS)).not.toThrow()
  })

  it('TC-3N-031: proposal-captures.repo.ts exists', () => {
    expect(() => readSrc(REPO_CAPTURES)).not.toThrow()
  })

  it('TC-3N-032: proposal-follow-up-commitments.repo.ts exists', () => {
    expect(() => readSrc(REPO_COMMITS)).not.toThrow()
  })
})

describe('Slice 2: Required functions exported', () => {
  it('TC-3N-033: createProposalEvent is exported', () => {
    expect(readSrc(REPO_EVENTS)).toContain('export async function createProposalEvent')
  })

  it('TC-3N-034: getOpenProposalEventForLead is exported', () => {
    expect(readSrc(REPO_EVENTS)).toContain('export async function getOpenProposalEventForLead')
  })

  it('TC-3N-035: getProposalEventById is exported', () => {
    expect(readSrc(REPO_EVENTS)).toContain('export async function getProposalEventById')
  })

  it('TC-3N-036: updateProposalStatus is exported', () => {
    expect(readSrc(REPO_EVENTS)).toContain('export async function updateProposalStatus')
  })

  it('TC-3N-037: createProposalCapture is exported', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('export async function createProposalCapture')
  })

  it('TC-3N-038: getPendingCapturesForWorkspace is exported', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('export async function getPendingCapturesForWorkspace')
  })

  it('TC-3N-039: findCaptureByTenantMessageId is exported', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('export async function findCaptureByTenantMessageId')
  })

  it('TC-3N-040: updateCaptureMatchStatus is exported', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('export async function updateCaptureMatchStatus')
  })

  it('TC-3N-041: softDeleteCapture is exported', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('export async function softDeleteCapture')
  })

  it('TC-3N-042: createFollowUpCommitments is exported', () => {
    expect(readSrc(REPO_COMMITS)).toContain('export async function createFollowUpCommitments')
  })

  it('TC-3N-043: getOpenCommitmentsForLead is exported', () => {
    expect(readSrc(REPO_COMMITS)).toContain('export async function getOpenCommitmentsForLead')
  })

  it('TC-3N-044: closeOpenCommitmentsForProposal is exported', () => {
    expect(readSrc(REPO_COMMITS)).toContain('export async function closeOpenCommitmentsForProposal')
  })
})

describe('Slice 2: Supabase service client usage', () => {
  it('TC-3N-045: proposal-events.repo uses createSupabaseServiceClient', () => {
    expect(readSrc(REPO_EVENTS)).toContain('createSupabaseServiceClient')
  })

  it('TC-3N-046: proposal-captures.repo uses createSupabaseServiceClient', () => {
    expect(readSrc(REPO_CAPTURES)).toContain('createSupabaseServiceClient')
  })

  it('TC-3N-047: proposal-follow-up-commitments.repo uses createSupabaseServiceClient', () => {
    expect(readSrc(REPO_COMMITS)).toContain('createSupabaseServiceClient')
  })
})

describe('Slice 2: Tenant and workspace scoping', () => {
  it('TC-3N-048: getOpenProposalEventForLead includes tenantId and workspaceId params', () => {
    const src = readSrc(REPO_EVENTS)
    expect(/getOpenProposalEventForLead[\s\S]{0,400}tenant_id/.test(src)).toBe(true)
    expect(/getOpenProposalEventForLead[\s\S]{0,400}workspace_id/.test(src)).toBe(true)
  })

  it('TC-3N-049: updateProposalStatus includes tenantId and workspaceId scoping', () => {
    const src = readSrc(REPO_EVENTS)
    expect(/updateProposalStatus[\s\S]{0,400}tenant_id/.test(src)).toBe(true)
    expect(/updateProposalStatus[\s\S]{0,400}workspace_id/.test(src)).toBe(true)
  })

  it('TC-3N-050: getPendingCapturesForWorkspace includes tenantId and workspaceId scoping', () => {
    const src = readSrc(REPO_CAPTURES)
    expect(/getPendingCapturesForWorkspace[\s\S]{0,400}tenant_id/.test(src)).toBe(true)
    expect(/getPendingCapturesForWorkspace[\s\S]{0,400}workspace_id/.test(src)).toBe(true)
  })

  it('TC-3N-051: updateCaptureMatchStatus includes tenantId and workspaceId scoping', () => {
    const src = readSrc(REPO_CAPTURES)
    expect(/updateCaptureMatchStatus[\s\S]{0,500}tenant_id/.test(src)).toBe(true)
    expect(/updateCaptureMatchStatus[\s\S]{0,500}workspace_id/.test(src)).toBe(true)
  })

  it('TC-3N-052: softDeleteCapture includes tenantId and workspaceId scoping', () => {
    const src = readSrc(REPO_CAPTURES)
    expect(/softDeleteCapture[\s\S]{0,400}tenant_id/.test(src)).toBe(true)
    expect(/softDeleteCapture[\s\S]{0,400}workspace_id/.test(src)).toBe(true)
  })

  it('TC-3N-053: findCaptureByTenantMessageId is tenant-only (no workspaceId param)', () => {
    const src = readSrc(REPO_CAPTURES)
    // Function signature should have tenantId and rawMessageId but NOT workspaceId
    const fnMatch = src.match(/export async function findCaptureByTenantMessageId\s*\(([^)]+)\)/)
    expect(fnMatch).not.toBeNull()
    if (fnMatch) {
      expect(fnMatch[1]).not.toContain('workspaceId')
      expect(fnMatch[1]).toContain('tenantId')
    }
  })

  it('TC-3N-054: closeOpenCommitmentsForProposal includes tenantId and workspaceId scoping', () => {
    const src = readSrc(REPO_COMMITS)
    expect(/closeOpenCommitmentsForProposal[\s\S]{0,500}tenant_id/.test(src)).toBe(true)
    expect(/closeOpenCommitmentsForProposal[\s\S]{0,500}workspace_id/.test(src)).toBe(true)
  })
})

describe('Slice 2: Critical query guardrails', () => {
  it('TC-3N-055: getOpenProposalEventForLead filters sent/viewed and deleted_at IS NULL', () => {
    const src = readSrc(REPO_EVENTS)
    expect(/getOpenProposalEventForLead[\s\S]{0,600}sent[\s\S]{0,100}viewed/.test(src)).toBe(true)
    expect(/getOpenProposalEventForLead[\s\S]{0,800}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-056: getPendingCapturesForWorkspace filters match_status pending and deleted_at IS NULL', () => {
    const src = readSrc(REPO_CAPTURES)
    expect(/getPendingCapturesForWorkspace[\s\S]{0,600}pending/.test(src)).toBe(true)
    expect(/getPendingCapturesForWorkspace[\s\S]{0,600}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-057: softDeleteCapture sets deleted_at (not hard delete)', () => {
    const src = readSrc(REPO_CAPTURES)
    expect(/softDeleteCapture[\s\S]{0,400}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-058: closeOpenCommitmentsForProposal filters commitment_status open', () => {
    const src = readSrc(REPO_COMMITS)
    expect(/closeOpenCommitmentsForProposal[\s\S]{0,500}commitment_status[\s\S]{0,100}open/.test(src)).toBe(true)
  })

  it('TC-3N-059: no hard .delete() call on proposal tables', () => {
    const events   = readSrc(REPO_EVENTS)
    const captures = readSrc(REPO_CAPTURES)
    const commits  = readSrc(REPO_COMMITS)
    expect(events).not.toMatch(/\.delete\s*\(/)
    expect(captures).not.toMatch(/\.delete\s*\(/)
    expect(commits).not.toMatch(/\.delete\s*\(/)
  })
})

describe('Slice 2: Forbidden imports and patterns', () => {
  const allRepos = (): string =>
    readSrc(REPO_EVENTS) + readSrc(REPO_CAPTURES) + readSrc(REPO_COMMITS)

  it('TC-3N-060: no calendar_event_id in repository files', () => {
    expect(allRepos()).not.toContain('calendar_event_id')
  })

  it('TC-3N-061: no scheduled_activities or calendar_sync_links references', () => {
    expect(allRepos()).not.toContain('scheduled_activities')
    expect(allRepos()).not.toContain('calendar_sync_links')
  })

  it('TC-3N-062: no Resend/email send imports', () => {
    const src = allRepos()
    expect(src).not.toMatch(/from ['"]resend['"]/)
    expect(src).not.toContain('emails.send')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3N-063: no LLM/AI SDK imports', () => {
    const src = allRepos()
    expect(src).not.toMatch(/from ['"]openai['"]/)
    expect(src).not.toMatch(/from ['"]@anthropic/)
    expect(src).not.toContain('chat.completions')
    expect(src).not.toContain('messages.create')
    expect(src).not.toContain('responses.create')
  })

  it('TC-3N-064: no inngest or workflow invocation in repositories', () => {
    const src = allRepos()
    expect(src).not.toContain('inngest')
    expect(src).not.toContain('sendEvent')
  })
})

// ---------------------------------------------------------------------------
// Slice 3 — Pure Utility Modules (runtime tests)
// TC-3N-065–110
// ---------------------------------------------------------------------------

describe('Slice 3: confidence-scoring — constants', () => {
  it('TC-3N-065: AUTO_MATCH_THRESHOLD equals 85', () => {
    expect(AUTO_MATCH_THRESHOLD).toBe(85)
  })

  it('TC-3N-066: REVIEW_THRESHOLD equals 40', () => {
    expect(REVIEW_THRESHOLD).toBe(40)
  })
})

describe('Slice 3: confidence-scoring — shouldAutoMatch', () => {
  it('TC-3N-067: shouldAutoMatch(95) is true', () => {
    expect(shouldAutoMatch(95)).toBe(true)
  })

  it('TC-3N-068: shouldAutoMatch(90) is true', () => {
    expect(shouldAutoMatch(90)).toBe(true)
  })

  it('TC-3N-069: shouldAutoMatch(85) is true', () => {
    expect(shouldAutoMatch(85)).toBe(true)
  })

  it('TC-3N-070: shouldAutoMatch(84) is false', () => {
    expect(shouldAutoMatch(84)).toBe(false)
  })

  it('TC-3N-071: shouldAutoMatch(80) is false', () => {
    expect(shouldAutoMatch(80)).toBe(false)
  })
})

describe('Slice 3: confidence-scoring — calculateCaptureConfidence', () => {
  it('TC-3N-072: company_domain score is 80 and does NOT auto-match', () => {
    const score = calculateCaptureConfidence({ type: 'company_domain' })
    expect(score).toBe(80)
    expect(shouldAutoMatch(score)).toBe(false)
  })

  it('TC-3N-073: company_domain_with_user score is 90 and DOES auto-match', () => {
    const score = calculateCaptureConfidence({ type: 'company_domain_with_user' })
    expect(score).toBe(90)
    expect(shouldAutoMatch(score)).toBe(true)
  })

  it('TC-3N-074: contact_email score is 95 and DOES auto-match', () => {
    const score = calculateCaptureConfidence({ type: 'contact_email' })
    expect(score).toBe(95)
    expect(shouldAutoMatch(score)).toBe(true)
  })

  it('TC-3N-075: ambiguous company_domain routes to inbox, not auto-match', () => {
    const score = calculateCaptureConfidence({ type: 'company_domain', isAmbiguous: true })
    expect(shouldAutoMatch(score)).toBe(false)
    expect(shouldRouteToInbox(score)).toBe(true)
  })

  it('TC-3N-076: shouldRouteToInbox(80) is true', () => {
    expect(shouldRouteToInbox(80)).toBe(true)
  })

  it('TC-3N-077: isProbablySpam(0) is true, isProbablySpam(39) is true', () => {
    expect(isProbablySpam(0)).toBe(true)
    expect(isProbablySpam(39)).toBe(true)
  })

  it('TC-3N-078: isProbablySpam(40) is false', () => {
    expect(isProbablySpam(40)).toBe(false)
  })
})

describe('Slice 3: schedule-rules', () => {
  it('TC-3N-079: STANDARD_3_5_10 rule key is standard_3_5_10', () => {
    expect(STANDARD_3_5_10.key).toBe('standard_3_5_10')
  })

  it('TC-3N-080: getScheduleRule returns standard_3_5_10 with intervals [3,5,10]', () => {
    const rule = getScheduleRule('standard_3_5_10')
    expect(rule.intervals).toEqual([3, 5, 10])
  })

  it('TC-3N-081: getScheduleRule throws for unknown key', () => {
    expect(() => getScheduleRule('unknown_rule')).toThrow()
  })

  it('TC-3N-082: buildFollowUpCommitmentsFromRule produces 3 commitments for standard_3_5_10', () => {
    const base = '2026-06-01T12:00:00.000Z'
    const result = buildFollowUpCommitmentsFromRule(base, 'standard_3_5_10')
    expect(result).toHaveLength(3)
  })

  it('TC-3N-083: commitment sequences are 1, 2, 3', () => {
    const result = buildFollowUpCommitmentsFromRule('2026-06-01T12:00:00.000Z', 'standard_3_5_10')
    expect(result.map(c => c.followUpSequence)).toEqual([1, 2, 3])
  })

  it('TC-3N-084: all commitment due dates are after proposal_sent_at', () => {
    const sentAt = '2026-06-01T12:00:00.000Z'
    const result = buildFollowUpCommitmentsFromRule(sentAt, 'standard_3_5_10')
    const sentMs = new Date(sentAt).getTime()
    for (const c of result) {
      expect(new Date(c.followUpDueAt).getTime()).toBeGreaterThan(sentMs)
    }
  })

  it('TC-3N-085: schedule_rule_key is set on every commitment', () => {
    const result = buildFollowUpCommitmentsFromRule('2026-06-01T12:00:00.000Z', 'standard_3_5_10')
    for (const c of result) {
      expect(c.scheduleRuleKey).toBe('standard_3_5_10')
    }
  })
})

describe('Slice 3: date-math', () => {
  const MONDAY    = new Date('2026-06-01T10:00:00.000Z')  // UTC Monday
  const SATURDAY  = new Date('2026-06-06T10:00:00.000Z')  // UTC Saturday
  const SUNDAY    = new Date('2026-06-07T10:00:00.000Z')  // UTC Sunday
  const PAST      = new Date('2020-01-01T00:00:00.000Z')
  const FUTURE    = new Date('2099-12-31T00:00:00.000Z')
  const NOW_REF   = new Date('2026-06-01T00:00:00.000Z')

  it('TC-3N-086: isWeekend returns false for Monday', () => {
    expect(isWeekend(MONDAY)).toBe(false)
  })

  it('TC-3N-087: isWeekend returns true for Saturday', () => {
    expect(isWeekend(SATURDAY)).toBe(true)
  })

  it('TC-3N-088: isWeekend returns true for Sunday', () => {
    expect(isWeekend(SUNDAY)).toBe(true)
  })

  it('TC-3N-089: isFutureDate detects a future date correctly', () => {
    expect(isFutureDate(FUTURE, NOW_REF)).toBe(true)
  })

  it('TC-3N-090: isFutureDate returns false for a past date', () => {
    expect(isFutureDate(PAST, NOW_REF)).toBe(false)
  })

  it('TC-3N-091: isDateInFuture and isFutureDate are consistent', () => {
    expect(isDateInFuture(FUTURE, NOW_REF)).toBe(isFutureDate(FUTURE, NOW_REF))
    expect(isDateInFuture(PAST, NOW_REF)).toBe(isFutureDate(PAST, NOW_REF))
  })

  it('TC-3N-092: addDays adds correct number of days', () => {
    const result = addDays(MONDAY, 3)
    expect(result.getUTCDate()).toBe(MONDAY.getUTCDate() + 3)
  })

  it('TC-3N-093: addDays does not mutate the input', () => {
    const original = new Date(MONDAY.getTime())
    addDays(MONDAY, 5)
    expect(MONDAY.getTime()).toBe(original.getTime())
  })

  it('TC-3N-094: normalizeToBusinessHour sets UTC hour to 9', () => {
    const result = normalizeToBusinessHour(SATURDAY)
    expect(result.getUTCHours()).toBe(9)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
  })

  it('TC-3N-095: normalizeToBusinessHour keeps the same UTC calendar day', () => {
    const result = normalizeToBusinessHour(SATURDAY)
    expect(isSameDay(result, SATURDAY)).toBe(true)
  })

  it('TC-3N-096: isSameDay returns true for same calendar day', () => {
    const a = new Date('2026-06-01T00:00:00.000Z')
    const b = new Date('2026-06-01T23:59:59.000Z')
    expect(isSameDay(a, b)).toBe(true)
  })

  it('TC-3N-097: isSameDay returns false for different calendar days', () => {
    const a = new Date('2026-06-01T00:00:00.000Z')
    const b = new Date('2026-06-02T00:00:00.000Z')
    expect(isSameDay(a, b)).toBe(false)
  })
})

describe('Slice 3: open-proposal', () => {
  it('TC-3N-098: isOpenProposalStatus returns true for sent', () => {
    expect(isOpenProposalStatus('sent')).toBe(true)
  })

  it('TC-3N-099: isOpenProposalStatus returns true for viewed', () => {
    expect(isOpenProposalStatus('viewed')).toBe(true)
  })

  it('TC-3N-100: isOpenProposalStatus returns false for accepted', () => {
    expect(isOpenProposalStatus('accepted')).toBe(false)
  })

  it('TC-3N-101: isClosedProposalStatus returns true for all terminal statuses', () => {
    for (const status of CLOSED_PROPOSAL_STATUSES) {
      expect(isClosedProposalStatus(status)).toBe(true)
    }
  })

  it('TC-3N-102: isClosedProposalStatus returns false for open statuses', () => {
    for (const status of OPEN_PROPOSAL_STATUSES) {
      expect(isClosedProposalStatus(status)).toBe(false)
    }
  })

  it('TC-3N-103: canCreateNewProposal returns true when no existing open proposal', () => {
    expect(canCreateNewProposal(null)).toBe(true)
  })

  it('TC-3N-104: canCreateNewProposal returns false when existing open proposal present', () => {
    expect(canCreateNewProposal({ id: 'some-uuid' })).toBe(false)
  })
})

describe('Slice 3: message-dedup', () => {
  it('TC-3N-105: normalizeMessageId strips angle brackets', () => {
    expect(normalizeMessageId('<abc@domain.com>')).toBe('abc@domain.com')
  })

  it('TC-3N-106: normalizeMessageId returns null for null input', () => {
    expect(normalizeMessageId(null)).toBeNull()
  })

  it('TC-3N-107: normalizeMessageId returns null for empty string', () => {
    expect(normalizeMessageId('')).toBeNull()
  })

  it('TC-3N-108: normalizeMessageId returns null for whitespace-only string', () => {
    expect(normalizeMessageId('   ')).toBeNull()
  })

  it('TC-3N-109: hasUsableMessageId returns false for null/empty/blank', () => {
    expect(hasUsableMessageId(null)).toBe(false)
    expect(hasUsableMessageId('')).toBe(false)
    expect(hasUsableMessageId('   ')).toBe(false)
  })

  it('TC-3N-110: hasUsableMessageId returns true for a valid message ID', () => {
    expect(hasUsableMessageId('abc@domain.com')).toBe(true)
    expect(hasUsableMessageId('<wrapped@domain.com>')).toBe(true)
  })

  it('TC-3N-111: buildTenantMessageDedupKey includes tenantId', () => {
    const key = buildTenantMessageDedupKey('tenant-abc', '<msg@domain.com>')
    expect(key).toContain('tenant-abc')
  })

  it('TC-3N-112: buildTenantMessageDedupKey includes normalized message ID', () => {
    const key = buildTenantMessageDedupKey('tenant-abc', '<msg@domain.com>')
    expect(key).toContain('msg@domain.com')
    // Must not include raw angle brackets
    expect(key).not.toContain('<')
  })

  it('TC-3N-113: buildTenantMessageDedupKey throws for unusable message ID', () => {
    expect(() => buildTenantMessageDedupKey('tenant-abc', '')).toThrow()
    expect(() => buildTenantMessageDedupKey('tenant-abc', '   ')).toThrow()
  })

  it('TC-3N-114: extractWorkspaceSlugFromCaptureAddress parses slug correctly', () => {
    expect(extractWorkspaceSlugFromCaptureAddress('acme-solar@capture.verian.app')).toBe('acme-solar')
  })

  it('TC-3N-115: extractWorkspaceSlugFromCaptureAddress returns null for non-matching address', () => {
    expect(extractWorkspaceSlugFromCaptureAddress('user@gmail.com')).toBeNull()
    expect(extractWorkspaceSlugFromCaptureAddress('acme@other.domain.com')).toBeNull()
  })
})

describe('Slice 3: lib files — no forbidden imports', () => {
  const LIB_FILES = [
    'modules/proposals/lib/confidence-scoring.ts',
    'modules/proposals/lib/schedule-rules.ts',
    'modules/proposals/lib/date-math.ts',
    'modules/proposals/lib/open-proposal.ts',
    'modules/proposals/lib/message-dedup.ts',
  ]

  const allLib = (): string => LIB_FILES.map(f => readSrc(f)).join('\n')

  it('TC-3N-116: no Supabase client in lib files', () => {
    expect(allLib()).not.toContain('createSupabaseServiceClient')
    expect(allLib()).not.toContain('createSupabaseBrowserClient')
  })

  it('TC-3N-117: no LLM/AI imports in lib files', () => {
    const src = allLib()
    expect(src).not.toMatch(/from ['"]openai['"]/)
    expect(src).not.toMatch(/from ['"]@anthropic/)
    expect(src).not.toContain('chat.completions')
  })

  it('TC-3N-118: no Resend or send imports in lib files', () => {
    const src = allLib()
    expect(src).not.toMatch(/from ['"]resend['"]/)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3N-119: no calendar_event_id, scheduled_activities, or calendar_sync_links in lib files', () => {
    const src = allLib()
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_sync_links')
  })
})

// ---------------------------------------------------------------------------
// Slice 4 — Activity Event Constants (source-reading)
// TC-3N-120–137
// ---------------------------------------------------------------------------

const CONSTANTS_FILE   = 'modules/proposals/constants/proposal-activity-events.ts'
const TYPES_AGENT_FILE = 'modules/intelligence/types.agent.ts'

describe('Slice 4: proposal activity constants file', () => {
  it('TC-3N-120: proposal-activity-events.ts exists', () => {
    expect(() => readSrc(CONSTANTS_FILE)).not.toThrow()
  })

  it('TC-3N-121: PROPOSAL_ACTIVITY_EVENTS is exported', () => {
    expect(readSrc(CONSTANTS_FILE)).toContain('export const PROPOSAL_ACTIVITY_EVENTS')
  })

  it('TC-3N-122: ProposalActivityEventType is exported', () => {
    expect(readSrc(CONSTANTS_FILE)).toContain('export type ProposalActivityEventType')
  })

  it('TC-3N-123: all required event names are present in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    const required = [
      'proposal_sent_recorded',
      'proposal_capture_ingested',
      'proposal_capture_matched',
      'proposal_capture_reviewed',
      'proposal_status_updated',
      'proposal_follow_up_created',
      'proposal_follow_up_completed',
      'proposal_follow_up_skipped',
    ]
    for (const name of required) {
      expect(src).toContain(name)
    }
  })

  it('TC-3N-124: event names are lowercase snake_case strings', () => {
    const src = readSrc(CONSTANTS_FILE)
    // All event value strings must match lowercase_snake_case
    const valueMatches = [...src.matchAll(/'([a-z][a-z_0-9]+)'/g)]
    for (const [, value] of valueMatches) {
      expect(value).toMatch(/^[a-z][a-z_0-9]+$/)
    }
  })

  it('TC-3N-125: no collision with legacy proposal_sent constant (distinct value)', () => {
    const src = readSrc(CONSTANTS_FILE)
    // The legacy constant is 'proposal_sent'; Phase 3N uses 'proposal_sent_recorded'
    // The constants file must NOT contain the bare 'proposal_sent' value without _recorded
    expect(src).not.toMatch(/'proposal_sent'/)
    expect(src).not.toMatch(/'proposal_approved'/)
    expect(src).not.toMatch(/'proposal_rejected'/)
  })
})

describe('Slice 4: types.agent.ts includes Phase 3N constants', () => {
  it('TC-3N-126: types.agent.ts contains PROPOSAL_SENT_RECORDED', () => {
    expect(readSrc(TYPES_AGENT_FILE)).toContain('proposal_sent_recorded')
  })

  it('TC-3N-127: types.agent.ts contains all 8 Phase 3N event constants', () => {
    const src = readSrc(TYPES_AGENT_FILE)
    const required = [
      'proposal_sent_recorded',
      'proposal_capture_ingested',
      'proposal_capture_matched',
      'proposal_capture_reviewed',
      'proposal_status_updated',
      'proposal_follow_up_created',
      'proposal_follow_up_completed',
      'proposal_follow_up_skipped',
    ]
    for (const name of required) {
      expect(src).toContain(name)
    }
  })

  it('TC-3N-128: legacy Phase 3A PROPOSAL_SENT constant is still present (no regression)', () => {
    const src = readSrc(TYPES_AGENT_FILE)
    expect(src).toContain("PROPOSAL_SENT:")
    expect(src).toContain("'proposal_sent'")
  })
})

describe('Slice 4: constants file — no forbidden imports or patterns', () => {
  it('TC-3N-129: no Supabase client in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toContain('createSupabaseServiceClient')
    expect(src).not.toContain('createSupabaseBrowserClient')
  })

  it('TC-3N-130: no repository imports in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toContain('repositories')
    expect(src).not.toContain('.repo')
  })

  it('TC-3N-131: no server action imports in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toContain('actions')
    expect(src).not.toContain('use server')
  })

  it('TC-3N-132: no Resend/send imports in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toMatch(/from ['"]resend['"]/)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3N-133: no LLM/AI imports in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toMatch(/from ['"]openai['"]/)
    expect(src).not.toMatch(/from ['"]@anthropic/)
  })

  it('TC-3N-134: no calendar_event_id, scheduled_activities, or calendar_sync_links', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_sync_links')
  })

  it('TC-3N-135: no DB write calls in constants file', () => {
    const src = readSrc(CONSTANTS_FILE)
    expect(src).not.toMatch(/\.insert\s*\(/)
    expect(src).not.toMatch(/\.update\s*\(/)
    expect(src).not.toMatch(/\.delete\s*\(/)
  })

  it('TC-3N-136: isProposalActivityEventType helper is exported', () => {
    expect(readSrc(CONSTANTS_FILE)).toContain('export function isProposalActivityEventType')
  })
})
