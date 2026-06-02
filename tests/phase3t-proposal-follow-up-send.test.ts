/**
 * Phase 3T — Proposal Follow-Up Approved Send Path
 * Test suite: source-reading tier — Slice 3 (backend send action foundation)
 *
 * Pattern: fs.readFileSync + toContain / not.toContain / regex
 * No Supabase mocking. No Resend mocking. No LLM mocking.
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

const SEND_ACTION  = 'modules/proposals/actions/proposal-follow-up-send.actions.ts'
const AGENT_TYPES  = 'modules/intelligence/types.agent.ts'

// ---------------------------------------------------------------------------
// Slice 3 — Action existence and shape
// TC-3T-001 through TC-3T-010
// ---------------------------------------------------------------------------

describe('Slice 3: sendFollowUpDraftAction — existence and shape', () => {

  it('TC-3T-001: action file exists and is readable', () => {
    expect(() => readSrc(SEND_ACTION)).not.toThrow()
  })

  it('TC-3T-002: action file has use server directive', () => {
    expect(readSrc(SEND_ACTION)).toContain("'use server'")
  })

  it('TC-3T-003: sendFollowUpDraftAction is exported', () => {
    expect(readSrc(SEND_ACTION)).toContain('export async function sendFollowUpDraftAction')
  })

  it('TC-3T-004: action accepts commitmentId input', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('commitmentId')
    expect(src).toContain('SendFollowUpDraftActionInput')
  })

  it('TC-3T-005: action input interface uses commitmentId (NOT a public draftId-only input)', () => {
    const src = readSrc(SEND_ACTION)
    const inputInterface = src.slice(
      src.indexOf('export interface SendFollowUpDraftActionInput'),
      src.indexOf('export interface SendFollowUpDraftActionData'),
    )
    expect(inputInterface).toContain('commitmentId')
    // Input interface must not have draftId as a standalone public field
    expect(inputInterface).not.toContain('draftId')
  })

  it('TC-3T-006: action requires messaging.send_emails permission', () => {
    expect(readSrc(SEND_ACTION)).toContain("requirePermission(ctx, 'messaging.send_emails')")
  })

  it('TC-3T-007: action does not use crm.leads.edit as the sole permission', () => {
    const src = readSrc(SEND_ACTION)
    // crm.leads.edit must not appear as the requirePermission argument
    expect(src).not.toContain("requirePermission(ctx, 'crm.leads.edit')")
  })

  it('TC-3T-008: action uses buildRequestContext for tenant/workspace/user', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('buildRequestContext')
    expect(src).toContain('ctx.tenantId')
    expect(src).toContain('ctx.workspaceId')
    expect(src).toContain('ctx.userId')
  })

  it('TC-3T-009: action comment explains crm.leads.edit is not sufficient', () => {
    expect(readSrc(SEND_ACTION)).toContain('crm.leads.edit')
    expect(readSrc(SEND_ACTION)).toContain('not sufficient')
  })

  it('TC-3T-010: action imports sendApprovedDraft from email-send.service', () => {
    expect(readSrc(SEND_ACTION)).toContain('sendApprovedDraft')
    expect(readSrc(SEND_ACTION)).toContain('email-send.service')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Context validation steps (in order)
// TC-3T-011 through TC-3T-022
// ---------------------------------------------------------------------------

describe('Slice 3: sendFollowUpDraftAction — context validation', () => {

  it('TC-3T-011: action validates commitmentId is present', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('commitmentId is required')
  })

  it('TC-3T-012: action loads commitment scoped by tenant_id and workspace_id', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('fetchCommitmentForDraftGeneration')
    expect(src).toContain('ctx.tenantId')
    expect(src).toContain('ctx.workspaceId')
  })

  it('TC-3T-013: action returns commitment_not_found safely when commitment is absent', () => {
    expect(readSrc(SEND_ACTION)).toContain('Commitment not found')
  })

  it('TC-3T-014: action verifies commitment.draft_id is non-null before proceeding', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('commitment.draft_id')
    expect(src).toContain('No draft is linked to this commitment')
  })

  it('TC-3T-015: action derives draftId from commitment.draft_id (server-side)', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('const draftId = commitment.draft_id')
  })

  it('TC-3T-016: action loads draft scoped by tenant_id and workspace_id', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('getEmailDraftForSending')
    expect(src).toContain('ctx.tenantId')
    expect(src).toContain('ctx.workspaceId')
  })

  it('TC-3T-016b: action strictly rejects draft workspace mismatch before readiness/send', () => {
    const src = readSrc(SEND_ACTION)
    // Explicit strict workspace guard covers the nullable-workspace_id gap in
    // getEmailDraftForSending (which only rejects when workspace_id is non-null).
    expect(src).toContain('draft.workspace_id !== ctx.workspaceId')
    // Guard must appear after the draft load and before checkDraftSendReadiness
    const workspaceGuard   = src.indexOf('draft.workspace_id !== ctx.workspaceId')
    const readinessCall    = src.indexOf('checkDraftSendReadiness(')
    const sendCall         = src.indexOf('sendApprovedDraft(ctx')
    expect(workspaceGuard).toBeGreaterThan(-1)
    expect(readinessCall).toBeGreaterThan(workspaceGuard)
    expect(sendCall).toBeGreaterThan(workspaceGuard)
  })

  it('TC-3T-017: action validates draft.subject_type = proposal_follow_up_commitment', () => {
    expect(readSrc(SEND_ACTION)).toContain("draft.subject_type !== 'proposal_follow_up_commitment'")
  })

  it('TC-3T-018: action validates draft.subject_id = commitmentId', () => {
    expect(readSrc(SEND_ACTION)).toContain('draft.subject_id !== commitmentId')
  })

  it('TC-3T-019: action validates draft.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP', () => {
    expect(readSrc(SEND_ACTION)).toContain('DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP')
    expect(readSrc(SEND_ACTION)).toContain('draft.source_type !== DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP')
  })

  it('TC-3T-020: action validates campaign_assignment_id is null before sendApprovedDraft', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('draft.campaign_assignment_id !== null')
    expect(src).toContain('campaign assignment')
    // Must appear before sendApprovedDraft call
    const campaignCheck = src.indexOf('draft.campaign_assignment_id !== null')
    const sendCall      = src.indexOf('sendApprovedDraft(ctx')
    expect(campaignCheck).toBeGreaterThan(-1)
    expect(sendCall).toBeGreaterThan(campaignCheck)
  })

  it('TC-3T-021: action validates superseded_at is null before sendApprovedDraft', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('draft.superseded_at !== null')
    expect(src).toContain('superseded')
    // Must appear before sendApprovedDraft call
    const supersededCheck = src.indexOf('draft.superseded_at !== null')
    const sendCall        = src.indexOf('sendApprovedDraft(ctx')
    expect(supersededCheck).toBeGreaterThan(-1)
    expect(sendCall).toBeGreaterThan(supersededCheck)
  })

  it('TC-3T-022: action rejects non-follow-up drafts with a safe error', () => {
    expect(readSrc(SEND_ACTION)).toContain('not a proposal follow-up draft')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Readiness check and order
// TC-3T-023 through TC-3T-029
// ---------------------------------------------------------------------------

describe('Slice 3: sendFollowUpDraftAction — readiness check and ordering', () => {

  it('TC-3T-023: action imports and calls checkDraftSendReadiness', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('checkDraftSendReadiness')
    expect(src).toContain('draft-send-readiness.service')
  })

  it('TC-3T-024: checkDraftSendReadiness appears before sendApprovedDraft in action source', () => {
    const src = readSrc(SEND_ACTION)
    const readinessIdx = src.indexOf('checkDraftSendReadiness(')
    const sendIdx      = src.indexOf('sendApprovedDraft(ctx')
    expect(readinessIdx).toBeGreaterThan(-1)
    expect(sendIdx).toBeGreaterThan(readinessIdx)
  })

  it('TC-3T-025: proposal-follow-up context checks appear before sendApprovedDraft', () => {
    const src = readSrc(SEND_ACTION)
    // commitment load appears before sendApprovedDraft
    const commitmentIdx = src.indexOf('fetchCommitmentForDraftGeneration(')
    const sendIdx       = src.indexOf('sendApprovedDraft(ctx')
    expect(commitmentIdx).toBeGreaterThan(-1)
    expect(sendIdx).toBeGreaterThan(commitmentIdx)
  })

  it('TC-3T-026: readiness failure returns before send (not-ready blocks sendApprovedDraft)', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('readiness.ready')
    expect(src).toContain('Draft is not ready to send')
    // The readiness gate must appear before sendApprovedDraft
    const readinessGate = src.indexOf('readiness.ready')
    const sendCall      = src.indexOf('sendApprovedDraft(ctx')
    expect(readinessGate).toBeLessThan(sendCall)
  })

  it('TC-3T-027: blocked readiness reasons are surfaced in the error response', () => {
    expect(readSrc(SEND_ACTION)).toContain('readiness.blockedReasons')
  })

  it('TC-3T-028: readiness check passes missing_approval_request as a blocked reason', () => {
    // approvalRequestId is passed to checkDraftSendReadiness (draft.approval_request_id)
    expect(readSrc(SEND_ACTION)).toContain('draft.approval_request_id')
  })

  it('TC-3T-029: readiness check passes both body fields (html and text) to checkDraftSendReadiness', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('draft.body_html')
    expect(src).toContain('draft.body_text')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Send delegation and guardrails
// TC-3T-030 through TC-3T-042
// ---------------------------------------------------------------------------

describe('Slice 3: sendFollowUpDraftAction — send delegation and safety guardrails', () => {

  it('TC-3T-030: action calls sendApprovedDraft after all validation', () => {
    expect(readSrc(SEND_ACTION)).toContain('sendApprovedDraft(ctx, draftId)')
  })

  it('TC-3T-031: action does not call Resend directly', () => {
    expect(readSrc(SEND_ACTION)).not.toContain("from 'resend'")
    expect(readSrc(SEND_ACTION)).not.toContain('resend.emails.send')
  })

  it('TC-3T-032: action does not insert into email_sends directly', () => {
    expect(readSrc(SEND_ACTION)).not.toContain('createEmailSend')
    expect(readSrc(SEND_ACTION)).not.toContain("from('email_sends')")
  })

  it('TC-3T-033: action does not reference CAMPAIGN_SENDING_ENABLED', () => {
    expect(readSrc(SEND_ACTION)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3T-034: action does not enable or mutate EMAIL_SENDING_ENABLED', () => {
    const src = readSrc(SEND_ACTION)
    // Must not write the flag; reference is only in a comment
    expect(src).not.toContain('EMAIL_SENDING_ENABLED = ')
    expect(src).not.toContain("setBooleanControl")
  })

  it('TC-3T-035: action does not import Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3T-036: action does not mutate commitment_status', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).not.toContain("commitment_status: 'completed'")
    expect(src).not.toContain("commitment_status: 'skipped'")
    expect(src).not.toContain('commitment_status')
  })

  it('TC-3T-037: action does not mutate proposal status', () => {
    expect(readSrc(SEND_ACTION)).not.toContain('proposal_status')
  })

  it('TC-3T-038: action does not call Complete, Skip, or Reschedule actions', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).not.toContain('completeFollowUpCommitmentAction')
    expect(src).not.toContain('skipFollowUpCommitmentAction')
    expect(src).not.toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3T-039: action delegates email sending flag enforcement to sendApprovedDraft', () => {
    const src = readSrc(SEND_ACTION)
    // The action calls sendApprovedDraft, which independently enforces the email sending flag.
    // The action does not call getBooleanControl or setBooleanControl on the flag directly.
    expect(src).toContain('sendApprovedDraft(ctx, draftId)')
    expect(src).not.toContain('getBooleanControl')
    expect(src).not.toContain('setBooleanControl')
    expect(src).not.toContain('SystemControlKey')
  })

  it('TC-3T-040: action returns ActionResult-shaped response on success', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('success: true')
    expect(src).toContain('success: false')
  })

  it('TC-3T-041: success data includes draftId and sendId', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('draftId')
    expect(src).toContain('sendId')
  })

  it('TC-3T-042: action emits PROPOSAL_FOLLOW_UP_DRAFT_SENT event after send success', () => {
    const src = readSrc(SEND_ACTION)
    expect(src).toContain('PROPOSAL_FOLLOW_UP_DRAFT_SENT')
    expect(src).toContain('recordActivityEvent')
    // Event emission must appear after sendApprovedDraft returns ok: true
    const sendOk        = src.indexOf('sendResult.ok')
    const eventEmission = src.indexOf('PROPOSAL_FOLLOW_UP_DRAFT_SENT')
    expect(sendOk).toBeGreaterThan(-1)
    expect(eventEmission).toBeGreaterThan(sendOk)
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Activity event constant
// TC-3T-043 through TC-3T-044
// ---------------------------------------------------------------------------

describe('Slice 3: activity event constant', () => {

  it('TC-3T-043: ActivityEventType includes PROPOSAL_FOLLOW_UP_DRAFT_SENT', () => {
    expect(readSrc(AGENT_TYPES)).toContain('PROPOSAL_FOLLOW_UP_DRAFT_SENT')
    expect(readSrc(AGENT_TYPES)).toContain("'proposal_follow_up_draft_sent'")
  })

  it('TC-3T-044: PROPOSAL_FOLLOW_UP_DRAFT_SENT is in the Phase 3T section of types.agent.ts', () => {
    const src      = readSrc(AGENT_TYPES)
    const phase3t  = src.indexOf('Phase 3T')
    const sentConst = src.indexOf('PROPOSAL_FOLLOW_UP_DRAFT_SENT')
    expect(phase3t).toBeGreaterThan(-1)
    expect(sentConst).toBeGreaterThan(phase3t)
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Provider-success/local-update failure documentation
// TC-3T-045
// ---------------------------------------------------------------------------

describe('Slice 3: provider-success/local-update failure risk documentation', () => {

  it('TC-3T-045: action documents provider-success/local-update failure risk and flag precondition', () => {
    const src = readSrc(SEND_ACTION)
    // The risk comment must be present in the action file
    expect(src).toContain('Provider-success/local-update failure risk')
    expect(src).toContain('resend_message_id is NOT persisted')
    expect(src).toContain('email sending feature flag must remain disabled')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Phase 3R/3S regression guard
// TC-3T-046 through TC-3T-047
// ---------------------------------------------------------------------------

describe('Slice 3: regression guard — Phase 3R/3S behavior unchanged', () => {

  it('TC-3T-046: Phase 3R mutation actions are unchanged', () => {
    const src = readSrc('modules/proposals/actions/proposal-follow-up-mutations.actions.ts')
    expect(src).toContain('completeFollowUpCommitmentAction')
    expect(src).toContain('skipFollowUpCommitmentAction')
    expect(src).toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3T-047: Phase 3S draft generation action is unchanged', () => {
    const src = readSrc('modules/proposals/actions/proposal-follow-up-draft.actions.ts')
    expect(src).toContain('generateFollowUpDraftAction')
    expect(src).not.toContain('sendFollowUpDraftAction')
  })

})
