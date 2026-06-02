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
const COMPLETE_BUTTON   = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/CompleteFollowUpButton.tsx'
const QUEUE_PAGE        = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx'

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
    // Bound at the Skip comment block so only the Complete function body is checked.
    const fnEnd   = src.indexOf('// Skip follow-up commitment', fnStart)
    const fnBody  = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined)
    expect(fnBody).not.toContain('recordActivityEvent')
  })

  it('TC-3R-020: function does not call requirePermission', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function completeFollowUpCommitment')
    // Bound at the Skip comment block so only the Complete function body is checked.
    const fnEnd   = src.indexOf('// Skip follow-up commitment', fnStart)
    const fnBody  = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined)
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

  it('TC-3R-024: repo file does not export reschedule/reopen/send/draft functions (skip now permitted)', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('rescheduleFollowUpCommitment')
    expect(src).not.toContain('reopenFollowUpCommitment')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-025: repo file uses createSupabaseServiceClient, not browser client', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('createSupabaseServiceClient')
  })

  it('TC-3R-026: migration 20240039 exists (Slice 3R-8 complete)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

  it('TC-3R-027: service file for follow-up mutations exists (Slice 3R-5 complete)', () => {
    expect(() => readSrc(MUTATIONS_SERVICE)).not.toThrow()
  })

  it('TC-3R-028: action file for follow-up mutations exists (Slice 3R-6 complete)', () => {
    expect(() => readSrc(MUTATIONS_ACTION)).not.toThrow()
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

// ---------------------------------------------------------------------------
// Slice 5 — Complete-only service layer with activity_events audit
// TC-3R-034 through TC-3R-059
// ---------------------------------------------------------------------------

describe('Slice 5: proposal follow-up mutations service — completeFollowUpCommitmentForWorkspace', () => {

  it('TC-3R-034: mutations service file exists and is readable', () => {
    expect(() => readSrc(MUTATIONS_SERVICE)).not.toThrow()
  })

  it('TC-3R-035: completeFollowUpCommitmentForWorkspace is exported', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('export async function completeFollowUpCommitmentForWorkspace')
  })

  it('TC-3R-036: CompleteFollowUpCommitmentResult type is exported', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('export type CompleteFollowUpCommitmentResult')
  })

  it('TC-3R-037: service imports and calls completeFollowUpCommitment from repo', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('completeFollowUpCommitment')
    expect(src).toContain('proposal-follow-up-mutations.repo')
  })

  it('TC-3R-038: service imports and calls recordActivityEvent', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('recordActivityEvent')
    expect(src).toContain('activity-event.repo')
  })

  it('TC-3R-039: service uses ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('ActivityEventType')
    expect(src).toContain('PROPOSAL_FOLLOW_UP_COMPLETED')
  })

  it('TC-3R-040: service passes tenantId and workspaceId to both repo and audit calls', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function completeFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    // tenantId and workspaceId appear as args and are forwarded to both calls
    expect(fnBody).toContain('tenantId')
    expect(fnBody).toContain('workspaceId')
  })

  it('TC-3R-041: service uses entityType proposal_follow_up_commitment in audit', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'proposal_follow_up_commitment'")
  })

  it('TC-3R-042: service includes actor_user_id in audit properties', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('actor_user_id')
  })

  it('TC-3R-043: service includes proposal_event_id in audit properties', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('proposal_event_id')
  })

  it('TC-3R-044: service includes follow_up_commitment_id in audit properties', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('follow_up_commitment_id')
  })

  it('TC-3R-045: service uses eventSource operator_action', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'operator_action'")
  })

  it('TC-3R-046: service forwards leadId from the committed row to audit', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('lead_id')
  })

  it('TC-3R-047: service maps ProposalFollowUpMutationError not_found to ok:false error:not_found', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('ProposalFollowUpMutationError')
    expect(src).toContain("'not_found'")
  })

  it('TC-3R-048: service maps ProposalFollowUpMutationError not_open to ok:false error:not_open', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'not_open'")
  })

  it('TC-3R-049: service maps ProposalFollowUpMutationError write_failed to ok:false error:write_failed', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'write_failed'")
  })

  it('TC-3R-050: service maps unknown errors to ok:false error:unknown_error', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'unknown_error'")
  })

  it('TC-3R-051: service includes audit_failed result path', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'audit_failed'")
  })

  it('TC-3R-052: service includes ok:true with commitment in success result', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('ok: true')
    expect(readSrc(MUTATIONS_SERVICE)).toContain('commitment')
  })

  it('TC-3R-053: service does not call requirePermission', () => {
    expect(readSrc(MUTATIONS_SERVICE)).not.toContain('requirePermission')
  })

  it('TC-3R-054: service does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-055: service does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-056: service does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_SERVICE)).not.toContain('email_drafts')
  })

  it('TC-3R-057: service does not export reschedule/reopen/send/draft functions (skip now permitted)', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('rescheduleFollowUp')
    expect(src).not.toContain('reopenFollowUp')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-058: action file for follow-up mutations exists (Slice 3R-6 complete)', () => {
    expect(() => readSrc(MUTATIONS_ACTION)).not.toThrow()
  })

  it('TC-3R-059: migration 20240039 exists (Slice 3R-8 complete)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

})

// ---------------------------------------------------------------------------
// Slice 6 — Complete-only server action with crm.leads.edit permission
// TC-3R-060 through TC-3R-086
// ---------------------------------------------------------------------------

describe('Slice 6: proposal follow-up mutations action — completeFollowUpCommitmentAction', () => {

  it('TC-3R-060: mutations action file exists and is readable', () => {
    expect(() => readSrc(MUTATIONS_ACTION)).not.toThrow()
  })

  it('TC-3R-061: action file declares use server', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'use server'")
  })

  it('TC-3R-062: completeFollowUpCommitmentAction is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export async function completeFollowUpCommitmentAction')
  })

  it('TC-3R-063: CompleteFollowUpCommitmentActionInput is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export interface CompleteFollowUpCommitmentActionInput')
  })

  it('TC-3R-064: CompleteFollowUpCommitmentActionData is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export interface CompleteFollowUpCommitmentActionData')
  })

  it('TC-3R-065: action imports and calls completeFollowUpCommitmentForWorkspace', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('completeFollowUpCommitmentForWorkspace')
    expect(src).toContain('proposal-follow-up-mutations.service')
  })

  it('TC-3R-066: action does not import from the mutations repo directly', () => {
    // Action must go through the service — repo import would be a bypass.
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('proposal-follow-up-mutations.repo')
  })

  it('TC-3R-067: action uses buildRequestContext', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('buildRequestContext')
  })

  it('TC-3R-068: action uses requirePermission', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('requirePermission')
  })

  it('TC-3R-069: action requires crm.leads.edit permission', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'crm.leads.edit'")
  })

  it('TC-3R-070: action passes ctx.tenantId to service, not input.tenantId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('ctx.tenantId')
    expect(src).not.toContain('input.tenantId')
  })

  it('TC-3R-071: action passes ctx.workspaceId to service, not input.workspaceId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('ctx.workspaceId')
    expect(src).not.toContain('input.workspaceId')
  })

  it('TC-3R-072: action passes ctx.userId as actorUserId, not input.actorUserId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('ctx.userId')
    expect(src).not.toContain('input.actorUserId')
  })

  it('TC-3R-073: action trims commitmentId from input', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('commitmentId')
    expect(src).toContain('.trim()')
  })

  it('TC-3R-074: action validates commitmentId is non-empty after trim', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('commitmentId is required')
  })

  it('TC-3R-075: action trims completionNotes from input', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('completionNotes')
    expect(src).toContain('.trim()')
  })

  it('TC-3R-076: action maps not_found to success:false', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'not_found'")
  })

  it('TC-3R-077: action maps not_open to success:false', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'not_open'")
  })

  it('TC-3R-078: action maps write_failed to success:false', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'write_failed'")
  })

  it('TC-3R-079: action maps audit_failed to success:false', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'audit_failed'")
  })

  it('TC-3R-080: action does not import recordActivityEvent', () => {
    // Audit belongs to the service layer; action must not import the audit repo.
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('activity-event.repo')
  })

  it('TC-3R-081: action does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-082: action does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-083: action does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('email_drafts')
  })

  it('TC-3R-084: action does not export reschedule/reopen/send/draft functions (skip action now permitted)', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('rescheduleFollowUp')
    expect(src).not.toContain('reopenFollowUp')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-085: action returns status completed in success data', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("status: 'completed'")
  })

  it('TC-3R-086: migration 20240039 exists (Slice 3R-8 complete)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

})

// ---------------------------------------------------------------------------
// Slice 7 — Complete UI confirmation control
// TC-3R-087 through TC-3R-105
// ---------------------------------------------------------------------------

describe('Slice 7: proposal follow-up complete UI control — CompleteFollowUpButton', () => {

  it('TC-3R-087: CompleteFollowUpButton component file exists and is readable', () => {
    expect(() => readSrc(COMPLETE_BUTTON)).not.toThrow()
  })

  it('TC-3R-088: component declares use client', () => {
    expect(readSrc(COMPLETE_BUTTON)).toContain("'use client'")
  })

  it('TC-3R-089: CompleteFollowUpButton is exported', () => {
    expect(readSrc(COMPLETE_BUTTON)).toContain('export function CompleteFollowUpButton')
  })

  it('TC-3R-090: component imports completeFollowUpCommitmentAction from action file', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).toContain('completeFollowUpCommitmentAction')
    expect(src).toContain('proposal-follow-up-mutations.actions')
  })

  it('TC-3R-091: component does not import from mutations service directly', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('proposal-follow-up-mutations.service')
  })

  it('TC-3R-092: component does not import from mutations repo directly', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('proposal-follow-up-mutations.repo')
  })

  it('TC-3R-093: component accepts commitmentId prop', () => {
    expect(readSrc(COMPLETE_BUTTON)).toContain('commitmentId')
  })

  it('TC-3R-094: component does not reference tenantId, workspaceId, or actorUserId', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).not.toContain('tenantId')
    expect(src).not.toContain('workspaceId')
    expect(src).not.toContain('actorUserId')
  })

  it('TC-3R-095: component includes confirmation text for completing commitment', () => {
    expect(readSrc(COMPLETE_BUTTON)).toContain('Mark this follow-up commitment complete?')
  })

  it('TC-3R-096: component calls router.refresh() after successful completion', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).toContain('router.refresh()')
    expect(src).toContain('useRouter')
  })

  it('TC-3R-097: component includes error state with message display', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).toContain("type: 'error'")
    expect(src).toContain('state.message')
  })

  it('TC-3R-098: component does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-099: component does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-100: component does not reference email_drafts', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('email_drafts')
  })

  it('TC-3R-101: component does not export skip/reschedule/reopen/send/draft functions', () => {
    const src = readSrc(COMPLETE_BUTTON)
    expect(src).not.toContain('skipFollowUp')
    expect(src).not.toContain('rescheduleFollowUp')
    expect(src).not.toContain('reopenFollowUp')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-102: follow-up queue page imports CompleteFollowUpButton', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('CompleteFollowUpButton')
  })

  it('TC-3R-103: queue page passes commitmentId to CompleteFollowUpButton', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('commitmentId={item.id}')
  })

  it('TC-3R-104: queue page does not pass tenantId, workspaceId, or actorUserId to button', () => {
    const src = readSrc(QUEUE_PAGE)
    // Server page passes only the commitment id — never session-derived fields
    expect(src).not.toContain('tenantId={')
    expect(src).not.toContain('workspaceId={')
    expect(src).not.toContain('actorUserId={')
  })

  it('TC-3R-105: migration 20240039 exists (Slice 3R-8 complete)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

})

// ---------------------------------------------------------------------------
// Slice 8 — Migration 20240039: Skip fields
// TC-3R-106 through TC-3R-125
// ---------------------------------------------------------------------------

describe('Slice 8: migration 20240039 — proposal_follow_up_commitments skip fields', () => {

  it('TC-3R-106: migration file 20240039 exists and is readable', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

  it('TC-3R-107: migration targets proposal_follow_up_commitments table', () => {
    expect(readSrc(MIGRATION_039)).toContain('proposal_follow_up_commitments')
  })

  it('TC-3R-108: migration adds skipped_at column', () => {
    expect(readSrc(MIGRATION_039)).toContain('skipped_at')
  })

  it('TC-3R-109: migration adds skipped_reason column', () => {
    expect(readSrc(MIGRATION_039)).toContain('skipped_reason')
  })

  it('TC-3R-110: migration adds skipped_by_user_id column', () => {
    expect(readSrc(MIGRATION_039)).toContain('skipped_by_user_id')
  })

  it('TC-3R-111: migration uses ADD COLUMN IF NOT EXISTS', () => {
    expect(readSrc(MIGRATION_039)).toContain('ADD COLUMN IF NOT EXISTS')
  })

  it('TC-3R-112: migration adds FK for skipped_by_user_id to auth.users', () => {
    const src = readSrc(MIGRATION_039)
    expect(src).toContain('skipped_by_user_id_fkey')
    expect(src).toContain('auth.users')
  })

  it('TC-3R-113: migration does not add reschedule fields', () => {
    const src = readSrc(MIGRATION_039)
    expect(src).not.toContain('rescheduled_from')
    expect(src).not.toContain('rescheduled_to')
    expect(src).not.toContain('reschedule_count')
    expect(src).not.toContain('reschedule_')
  })

  it('TC-3R-114: migration does not add reopen fields', () => {
    expect(readSrc(MIGRATION_039)).not.toContain('reopened_')
  })

  it('TC-3R-115: migration does not add send or draft fields', () => {
    const src = readSrc(MIGRATION_039)
    expect(src).not.toContain('sent_at')
    expect(src).not.toContain('draft_generated_at')
  })

  it('TC-3R-116: types/database.ts includes skipped_at in proposal_follow_up_commitments Row', () => {
    const src = readSrc('types/database.ts')
    expect(src).toContain('skipped_at')
  })

  it('TC-3R-117: types/database.ts includes skipped_reason in proposal_follow_up_commitments Row', () => {
    const src = readSrc('types/database.ts')
    expect(src).toContain('skipped_reason')
  })

  it('TC-3R-118: types/database.ts includes skipped_by_user_id in proposal_follow_up_commitments Row', () => {
    const src = readSrc('types/database.ts')
    expect(src).toContain('skipped_by_user_id')
  })

  it('TC-3R-119: types/database.ts includes skipped_by_user_id FK relationship entry', () => {
    expect(readSrc('types/database.ts')).toContain('proposal_follow_up_commitments_skipped_by_user_id_fkey')
  })

  it('TC-3R-120: Skip repository function exists (Slice 3R-9 complete)', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('skipFollowUpCommitment')
  })

  it('TC-3R-121: Skip service function exists (Slice 3R-10 complete)', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('skipFollowUpCommitmentForWorkspace')
  })

  it('TC-3R-122: Skip action function exists (Slice 3R-11 complete)', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('skipFollowUpCommitmentAction')
  })

  it('TC-3R-123: no Skip UI control exists yet (guard — Slice 3R-9)', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('skip')
  })

  it('TC-3R-124: Complete repository mutation is unchanged — still uses open-status race guard', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).toContain('completeFollowUpCommitment')
    expect(src).toContain(".eq('commitment_status', 'open')")
  })

  it('TC-3R-125: Complete service audit path is unchanged — still uses PROPOSAL_FOLLOW_UP_COMPLETED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('PROPOSAL_FOLLOW_UP_COMPLETED')
    expect(src).toContain('recordActivityEvent')
  })

})

// ---------------------------------------------------------------------------
// Slice 9 — Skip repository write model
// TC-3R-126 through TC-3R-158
// ---------------------------------------------------------------------------

describe('Slice 9: proposal follow-up mutations repo — skipFollowUpCommitment', () => {

  it('TC-3R-126: skipFollowUpCommitment is exported', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('export async function skipFollowUpCommitment')
  })

  it('TC-3R-127: Skip function scopes fetch-before-write by tenant_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('tenant_id', tenantId)")
  })

  it('TC-3R-128: Skip function scopes fetch-before-write by workspace_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3R-129: Skip function scopes fetch-before-write by commitment id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain(".eq('id', commitmentId)")
  })

  it('TC-3R-130: Skip function uses maybeSingle for the fetch step', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.maybeSingle()')
  })

  it('TC-3R-131: Skip function throws not_found when commitment is absent', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'not_found'")
    expect(fnBody).toContain('!existing')
  })

  it('TC-3R-132: Skip function checks commitment_status !== open before update', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("commitment_status !== 'open'")
    expect(fnBody).toContain("'not_open'")
  })

  it('TC-3R-133: Skip update predicate includes commitment_status = open race guard', () => {
    const src = readSrc(MUTATIONS_REPO)
    const updateStart = src.indexOf('.update(', src.indexOf('export async function skipFollowUpCommitment'))
    const updateSection = src.slice(updateStart, updateStart + 700)
    expect(updateSection).toContain(".eq('commitment_status', 'open')")
  })

  it('TC-3R-134: Skip update predicate includes tenant_id and workspace_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const updateStart = src.indexOf('.update(', src.indexOf('export async function skipFollowUpCommitment'))
    const updateSection = src.slice(updateStart, updateStart + 700)
    expect(updateSection).toContain(".eq('tenant_id', tenantId)")
    expect(updateSection).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3R-135: Skip no-row-after-update maps to not_open, not write_failed', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    const notOpenCount = (fnBody.match(/'not_open'/g) || []).length
    expect(notOpenCount).toBeGreaterThanOrEqual(2) // fetch guard + race guard
    expect(fnBody).toContain('!updated')
  })

  it('TC-3R-136: Skip writes commitment_status = skipped', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("commitment_status:  'skipped'")
  })

  it('TC-3R-137: Skip writes skipped_at', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skipped_at:')
  })

  it('TC-3R-138: Skip writes skipped_by_user_id = actorUserId', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skipped_by_user_id:')
    expect(fnBody).toContain('actorUserId')
  })

  it('TC-3R-139: Skip writes skipped_reason', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skipped_reason:')
  })

  it('TC-3R-140: Skip writes updated_at', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('updated_at:')
  })

  it('TC-3R-141: Skip normalizes whitespace-only skippedReason to null', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('|| null')
  })

  it('TC-3R-142: Skip trims skippedReason before writing', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.trim()')
  })

  it('TC-3R-143: Skip does not write completed_at or completed_by_user_id', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('completed_at:')
    expect(fnBody).not.toContain('completed_by_user_id:')
  })

  it('TC-3R-144: Skip does not write completion_notes', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('completion_notes:')
  })

  it('TC-3R-145: Skip does not mutate proposal_events', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toMatch(/from\('proposal_events'\).*\.update\(/)
    expect(fnBody).not.toMatch(/from\('proposal_events'\).*\.insert\(/)
  })

  it('TC-3R-146: Skip does not call recordActivityEvent', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('recordActivityEvent')
  })

  it('TC-3R-147: Skip does not call requirePermission', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).not.toContain('requirePermission')
  })

  it('TC-3R-148: repo file does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-149: repo file does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-150: repo file does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_REPO)).not.toContain('email_drafts')
  })

  it('TC-3R-151: repo file does not export reschedule or reopen functions', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).not.toContain('rescheduleFollowUpCommitment')
    expect(src).not.toContain('reopenFollowUpCommitment')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-152: Skip function uses update().select().maybeSingle() for write step', () => {
    const src = readSrc(MUTATIONS_REPO)
    const fnStart = src.indexOf('export async function skipFollowUpCommitment')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('.update(')
    expect(fnBody).toContain('.select()')
    expect(fnBody).toContain('.maybeSingle()')
  })

  it('TC-3R-153: Skip service function exists (Slice 3R-10 complete)', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('skipFollowUpCommitmentForWorkspace')
  })

  it('TC-3R-154: Skip action function exists (Slice 3R-11 complete)', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('skipFollowUpCommitmentAction')
  })

  it('TC-3R-155: no Skip UI control exists yet (guard — future slice)', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('skip')
  })

  it('TC-3R-156: migration 20240039 exists (guard — applied separately)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

  it('TC-3R-157: Complete repository mutation is unchanged by Slice 9', () => {
    const src = readSrc(MUTATIONS_REPO)
    expect(src).toContain('export async function completeFollowUpCommitment')
    expect(src).toContain(".eq('commitment_status', 'open')")
    expect(src).toContain("commitment_status:    'completed'")
  })

  it('TC-3R-158: repo uses createSupabaseServiceClient, not browser client', () => {
    expect(readSrc(MUTATIONS_REPO)).toContain('createSupabaseServiceClient')
  })

})

// ---------------------------------------------------------------------------
// Slice 10 — Skip service layer with activity_events audit
// TC-3R-159 through TC-3R-185
// ---------------------------------------------------------------------------

describe('Slice 10: proposal follow-up mutations service — skipFollowUpCommitmentForWorkspace', () => {

  it('TC-3R-159: skipFollowUpCommitmentForWorkspace is exported', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('export async function skipFollowUpCommitmentForWorkspace')
  })

  it('TC-3R-160: SkipFollowUpCommitmentResult type is exported', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain('export type SkipFollowUpCommitmentResult')
  })

  it('TC-3R-161: service imports and calls skipFollowUpCommitment from repo', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('skipFollowUpCommitment')
    expect(src).toContain('proposal-follow-up-mutations.repo')
  })

  it('TC-3R-162: service imports and calls recordActivityEvent', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('recordActivityEvent')
    expect(src).toContain('activity-event.repo')
  })

  it('TC-3R-163: service uses ActivityEventType.PROPOSAL_FOLLOW_UP_SKIPPED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('ActivityEventType')
    expect(src).toContain('PROPOSAL_FOLLOW_UP_SKIPPED')
  })

  it('TC-3R-164: service passes tenantId and workspaceId to both repo and audit calls', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('tenantId')
    expect(fnBody).toContain('workspaceId')
  })

  it('TC-3R-165: service uses entityType proposal_follow_up_commitment in audit', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'proposal_follow_up_commitment'")
  })

  it('TC-3R-166: service includes actor_user_id in Skip audit properties', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('actor_user_id')
  })

  it('TC-3R-167: service includes proposal_event_id in Skip audit properties', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('proposal_event_id')
  })

  it('TC-3R-168: service includes follow_up_commitment_id in Skip audit properties', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('follow_up_commitment_id')
  })

  it('TC-3R-169: service includes skipped_at in Skip audit properties', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skipped_at')
  })

  it('TC-3R-170: service includes skipped_reason in Skip audit properties', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skipped_reason')
  })

  it('TC-3R-171: service uses eventSource operator_action', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'operator_action'")
  })

  it('TC-3R-172: service forwards leadId from the skipped row to audit', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentForWorkspace')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('lead_id')
  })

  it('TC-3R-173: service maps ProposalFollowUpMutationError not_found', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('ProposalFollowUpMutationError')
    expect(src).toContain("'not_found'")
  })

  it('TC-3R-174: service maps ProposalFollowUpMutationError not_open', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'not_open'")
  })

  it('TC-3R-175: service maps ProposalFollowUpMutationError write_failed', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'write_failed'")
  })

  it('TC-3R-176: service maps unknown errors to unknown_error', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'unknown_error'")
  })

  it('TC-3R-177: service includes audit_failed result path', () => {
    expect(readSrc(MUTATIONS_SERVICE)).toContain("'audit_failed'")
  })

  it('TC-3R-178: service does not call requirePermission', () => {
    expect(readSrc(MUTATIONS_SERVICE)).not.toContain('requirePermission')
  })

  it('TC-3R-179: service does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-180: service does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-181: service does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_SERVICE)).not.toContain('email_drafts')
  })

  it('TC-3R-182: service does not export reschedule/reopen/send/draft functions', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).not.toContain('rescheduleFollowUp')
    expect(src).not.toContain('reopenFollowUp')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-183: Skip action function exists (Slice 3R-11 complete)', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('skipFollowUpCommitmentAction')
  })

  it('TC-3R-184: Complete service audit path is unchanged — still uses PROPOSAL_FOLLOW_UP_COMPLETED', () => {
    const src = readSrc(MUTATIONS_SERVICE)
    expect(src).toContain('PROPOSAL_FOLLOW_UP_COMPLETED')
    expect(src).toContain('completeFollowUpCommitmentForWorkspace')
  })

  it('TC-3R-185: migration 20240039 exists (guard — applied separately)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

})

// ---------------------------------------------------------------------------
// Slice 11 — Skip server action with crm.leads.edit permission
// TC-3R-186 through TC-3R-212
// ---------------------------------------------------------------------------

describe('Slice 11: proposal follow-up mutations action — skipFollowUpCommitmentAction', () => {

  it('TC-3R-186: skipFollowUpCommitmentAction is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export async function skipFollowUpCommitmentAction')
  })

  it('TC-3R-187: SkipFollowUpCommitmentActionInput is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export interface SkipFollowUpCommitmentActionInput')
  })

  it('TC-3R-188: SkipFollowUpCommitmentActionData is exported', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('export interface SkipFollowUpCommitmentActionData')
  })

  it('TC-3R-189: action imports and calls skipFollowUpCommitmentForWorkspace from service', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('skipFollowUpCommitmentForWorkspace')
    expect(src).toContain('proposal-follow-up-mutations.service')
  })

  it('TC-3R-190: action does not import from the mutations repo directly', () => {
    // Action must go through the service — repo import would be a bypass.
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('proposal-follow-up-mutations.repo')
  })

  it('TC-3R-191: action uses buildRequestContext', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('buildRequestContext')
  })

  it('TC-3R-192: action uses requirePermission', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain('requirePermission')
  })

  it('TC-3R-193: action requires crm.leads.edit permission', () => {
    expect(readSrc(MUTATIONS_ACTION)).toContain("'crm.leads.edit'")
  })

  it('TC-3R-194: Skip action passes ctx.tenantId to service, not input.tenantId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('ctx.tenantId')
    expect(fnBody).not.toContain('input.tenantId')
  })

  it('TC-3R-195: Skip action passes ctx.workspaceId to service, not input.workspaceId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('ctx.workspaceId')
    expect(fnBody).not.toContain('input.workspaceId')
  })

  it('TC-3R-196: Skip action passes ctx.userId as actorUserId, not input.actorUserId', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('ctx.userId')
    expect(fnBody).not.toContain('input.actorUserId')
  })

  it('TC-3R-197: Skip action trims commitmentId from input', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('commitmentId')
    expect(fnBody).toContain('.trim()')
  })

  it('TC-3R-198: Skip action validates commitmentId is non-empty after trim', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('commitmentId is required')
  })

  it('TC-3R-199: Skip action trims skippedReason from input', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain('skippedReason')
    expect(fnBody).toContain('.trim()')
  })

  it('TC-3R-200: Skip action maps not_found to success:false', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'not_found'")
  })

  it('TC-3R-201: Skip action maps not_open to success:false', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'not_open'")
  })

  it('TC-3R-202: Skip action maps write_failed to success:false', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'write_failed'")
  })

  it('TC-3R-203: Skip action maps audit_failed to success:false', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("'audit_failed'")
  })

  it('TC-3R-204: Skip action does not import recordActivityEvent', () => {
    // Audit belongs to the service layer; action must not import the audit repo.
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('activity-event.repo')
  })

  it('TC-3R-205: Skip action does not reference Resend, Inngest, OpenAI, Anthropic', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3R-206: Skip action does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3R-207: Skip action does not reference email_drafts', () => {
    expect(readSrc(MUTATIONS_ACTION)).not.toContain('email_drafts')
  })

  it('TC-3R-208: action file does not export reschedule/reopen/send/draft functions', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).not.toContain('rescheduleFollowUp')
    expect(src).not.toContain('reopenFollowUp')
    expect(src).not.toContain('generateFollowUpDraft')
    expect(src).not.toContain('sendFollowUp')
  })

  it('TC-3R-209: Skip action returns status skipped in success data', () => {
    const src = readSrc(MUTATIONS_ACTION)
    const fnStart = src.indexOf('export async function skipFollowUpCommitmentAction')
    const fnBody  = src.slice(fnStart)
    expect(fnBody).toContain("status: 'skipped'")
  })

  it('TC-3R-210: no Skip UI control exists yet (guard — future slice)', () => {
    expect(readSrc(COMPLETE_BUTTON)).not.toContain('skipFollowUp')
  })

  it('TC-3R-211: migration 20240039 exists (guard — applied separately)', () => {
    expect(() => readSrc(MIGRATION_039)).not.toThrow()
  })

  it('TC-3R-212: Complete action is unchanged — still exports completeFollowUpCommitmentAction', () => {
    const src = readSrc(MUTATIONS_ACTION)
    expect(src).toContain('export async function completeFollowUpCommitmentAction')
    expect(src).toContain("status: 'completed'")
  })

})
