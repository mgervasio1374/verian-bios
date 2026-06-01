/**
 * Phase 3R — Controlled Proposal Follow-Up Mutations
 * Test suite: source-reading tier — Slice 4 (repository write model)
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

const MUTATIONS_REPO    = 'modules/proposals/repositories/proposal-follow-up-mutations.repo.ts'
const MUTATIONS_SERVICE = 'modules/proposals/services/proposal-follow-up-mutations.service.ts'
const MUTATIONS_ACTION  = 'modules/proposals/actions/proposal-follow-up-mutations.actions.ts'
const MIGRATION_039     = 'supabase/migrations/20240039_phase3r_follow_up_skip_fields.sql'

// ---------------------------------------------------------------------------
// Slice 4 — Complete-only repository write model
// TC-3R-001 through TC-3R-030
// ---------------------------------------------------------------------------

describe('Slice 4: proposal follow-up mutations repo — completeFollowUpCommitment', () => {

  it('TC-3R-001: mutations repo file exists and is readable', () => {
    expect(() => readSrc(MUTATIONS_REPO)).not.toThrow()
  })

  it('TC-3R-002: completeFollowUpCommitment is exported', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('export async function completeFollowUpCommitment')
  })

  it('TC-3R-003: ProposalFollowUpMutationError class is exported', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('export class ProposalFollowUpMutationError')
  })

  it('TC-3R-004: ProposalFollowUpMutationCommitmentRow type is exported', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('export type ProposalFollowUpMutationCommitmentRow')
  })

  it('TC-3R-005: ProposalFollowUpMutationError exposes a code field', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).toContain('code')
    expect(src).toContain("'not_found'")
    expect(src).toContain("'not_open'")
    expect(src).toContain("'write_failed'")
  })

  it('TC-3R-006: function scopes fetch-before-write by tenant_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('TC-3R-007: function scopes fetch-before-write by workspace_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3R-008: function scopes fetch-before-write by commitment id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('id', commitmentId)")
  })

  it('TC-3R-009: function uses maybeSingle for the fetch step', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.maybeSingle()')
  })

  it('TC-3R-010: function throws not_found when commitment is absent', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'not_found'")
    expect(fnBody).toContain('!existing')
  })

  it('TC-3R-011: function checks commitment_status === open before update', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("commitment_status !== 'open'")
    expect(fnBody).toContain("'not_open'")
  })

  it('TC-3R-012: function writes commitment_status = completed', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("commitment_status:    'completed'")
  })

  it('TC-3R-013: function writes completed_at', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('completed_at:')
  })

  it('TC-3R-014: function writes completed_by_user_id = actorUserId', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('completed_by_user_id:')
    expect(fnBody).toContain('actorUserId')
  })

  it('TC-3R-015: function writes completion_notes', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('completion_notes:')
  })

  it('TC-3R-016: function trims completionNotes before writing', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.trim()')
  })

  it('TC-3R-017: function writes updated_at', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('updated_at:')
  })

  it('TC-3R-018: function does not write to proposal_events', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toMatch(/from\('proposal_events'\).*\.update\(/)
    expect(fnBody).not.toMatch(/from\('proposal_events'\).*\.insert\(/)
  })

  it('TC-3R-019: function does not call recordActivityEvent', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('recordActivityEvent')
  })

  it('TC-3R-020: function does not call requirePermission', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('requirePermission')
  })

  it('TC-3R-021: repo file does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-022: repo file does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-023: repo file does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_REPO)).not.toContain('email_drafts')
  })

  it('TC-3R-024: repo file does not export skip/reschedule/reopen/send/draft functions', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('skipFollowUpCommitment')
    expect(src).not.toContain('rescheduleFollowUpCommitment')
    expect(src).not.toContain('reopenFollowUpCommitment')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-025: repo file uses createSupabaseServiceClient, not browser client', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('createSupabaseServiceClient')
  })

  it('TC-3R-026: migration 20240039 does not yet exist (guard — skip fields deferred to Slice 3R-8)', () => {
    expect(() => readSrc(MIGRATION_039)).toThrow()
  })

  it('TC-3R-027: service file for follow-up mutations does not yet exist (guard — Slice 3R-5)', () => {
    expect(() => readSrc(MUTATIONS_SERVICE)).toThrow()
  })

  it('TC-3R-028: action file for follow-up mutations does not yet exist (guard — Slice 3R-6)', () => {
    expect(() => readSrc(MUTATIONS_ACTION)).toThrow()
  })

  it('TC-3R-029: repo file uses update().select().maybeSingle() for the write step', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.update(')
    expect(fnBody).toContain('.select()')
    expect(fnBody).toContain('.maybeSingle()')
  })

  it('TC-3R-030: repo file scopes the update by tenant_id and workspace_id — not bare commitmentId only', () => {
    const src = readSrc(MUTATIONS_REPO)
    // The update chain must also scope by tenant and workspace (defence-in-depth after fetch-before-write)
    const updateStart = src.indexOf('.update(')
    const updateSection = src.slice(updateStart, updateStart + 700)
    expect(updateSection).toContain(".eq('tenant_id', tenantId)")
    expect(updateSection).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3R-031: update predicate includes commitment_status = open race guard', () => {
    const src = readSrc(MUTATIONS_REPO)
    const updateStart = src.indexOf('.update(')
    const updateSection = src.slice(updateStart, updateStart + 700)
    expect(updateSection).toContain(".eq('commitment_status', 'open')")
  })

  it('TC-3R-032: no-row-after-update maps to not_open, not write_failed', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    // After the update, missing row must throw not_open (race condition)
    // rather than being lumped in with write_failed errors.
    const notOpenCount = (fnBody.match(/'not_open'/g) || []).length
    expect(notOpenCount).toBeGreaterThanOrEqual(2) // once for fetch guard, once for update race guard
    // The no-row case after update must NOT map to write_failed alone
    expect(fnBody).toContain('!updated')
  })

  it('TC-3R-033: whitespace-only completionNotes normalizes to null', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    // Whitespace-only string must be treated as absent (falsy check after trim)
    expect(fnBody).toContain('|| null')
  })

})
