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
