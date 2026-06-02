/**
 * Phase 3S — Proposal Follow-Up Draft Generation
 * Test suite: source-reading tier — Slice 3 (template-path implementation)
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

const DRAFT_REPO    = 'modules/proposals/repositories/proposal-follow-up-draft.repo.ts'
const DRAFT_SERVICE = 'modules/proposals/services/proposal-follow-up-draft.service.ts'
const DRAFT_ACTION  = 'modules/proposals/actions/proposal-follow-up-draft.actions.ts'
const AGENT_TYPES   = 'modules/intelligence/types.agent.ts'
const DRAFT_SOURCE  = 'modules/messaging/drafts/draft-source.constants.ts'

// ---------------------------------------------------------------------------
// Slice 3 — Repository
// TC-3S-001 through TC-3S-015
// ---------------------------------------------------------------------------

describe('Slice 3: proposal-follow-up-draft repository', () => {

  it('TC-3S-001: draft repo file exists and is readable', () => {
    expect(() => readSrc(DRAFT_REPO)).not.toThrow()
  })

  it('TC-3S-002: createFollowUpEmailDraft is exported', () => {
    expect(readSrc(DRAFT_REPO)).toContain('export async function createFollowUpEmailDraft')
  })

  it('TC-3S-003: createFollowUpEmailDraft sets subject_type to proposal_follow_up_commitment', () => {
    expect(readSrc(DRAFT_REPO)).toContain("subject_type:         'proposal_follow_up_commitment'")
  })

  it('TC-3S-004: createFollowUpEmailDraft sets subject_id from commitmentId', () => {
    expect(readSrc(DRAFT_REPO)).toContain('subject_id:           input.commitmentId')
  })

  it('TC-3S-005: createFollowUpEmailDraft uses DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP', () => {
    expect(readSrc(DRAFT_REPO)).toContain('DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP')
  })

  it('TC-3S-006: createFollowUpEmailDraft sets generated_by_ai to false', () => {
    expect(readSrc(DRAFT_REPO)).toContain('generated_by_ai:      false')
  })

  it('TC-3S-007: createFollowUpEmailDraft sets status to pending_approval', () => {
    expect(readSrc(DRAFT_REPO)).toContain("status:               'pending_approval'")
  })

  it('TC-3S-008: createFollowUpEmailDraft sets created_by from actorUserId', () => {
    expect(readSrc(DRAFT_REPO)).toContain('created_by:           input.actorUserId')
  })

  it('TC-3S-009: linkDraftToCommitment is exported', () => {
    expect(readSrc(DRAFT_REPO)).toContain('export async function linkDraftToCommitment')
  })

  it('TC-3S-010: linkDraftToCommitment scopes update by id, tenant_id, workspace_id', () => {
    const src = readSrc(DRAFT_REPO)
    // Verify all three scope columns are used in the update
    const fnStart = src.indexOf('export async function linkDraftToCommitment')
    const fnEnd   = src.indexOf('export async function getActiveDraftForCommitment', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain('.eq(\'id\', commitmentId)')
    expect(fn).toContain('.eq(\'tenant_id\', tenantId)')
    expect(fn).toContain('.eq(\'workspace_id\', workspaceId)')
  })

  it('TC-3S-011: linkDraftToCommitment does not overwrite an existing draft_id — uses .is(draft_id, null) guard', () => {
    const src = readSrc(DRAFT_REPO)
    const fnStart = src.indexOf('export async function linkDraftToCommitment')
    const fnEnd   = src.indexOf('export async function getActiveDraftForCommitment', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain(".is('draft_id', null)")
  })

  it('TC-3S-012: getActiveDraftForCommitment is exported', () => {
    expect(readSrc(DRAFT_REPO)).toContain('export async function getActiveDraftForCommitment')
  })

  it('TC-3S-013: getActiveDraftForCommitment queries subject_type and subject_id', () => {
    const src = readSrc(DRAFT_REPO)
    const fnStart = src.indexOf('export async function getActiveDraftForCommitment')
    const fnEnd   = src.indexOf('export async function fetchCommitmentForDraftGeneration', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    expect(fn).toContain("'proposal_follow_up_commitment'")
    expect(fn).toContain('subject_id')
  })

  it('TC-3S-014: fetchCommitmentForDraftGeneration is exported', () => {
    expect(readSrc(DRAFT_REPO)).toContain('export async function fetchCommitmentForDraftGeneration')
  })

  it('TC-3S-015: repo does not import Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(DRAFT_REPO)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
    expect(src).not.toContain('email_sends')
  })

  it('TC-3S-016: repo does not call recordActivityEvent', () => {
    expect(readSrc(DRAFT_REPO)).not.toContain('recordActivityEvent')
  })

  it('TC-3S-017: repo does not call requirePermission', () => {
    expect(readSrc(DRAFT_REPO)).not.toContain('requirePermission')
  })

  it('TC-3S-018: repo uses createSupabaseServiceClient', () => {
    expect(readSrc(DRAFT_REPO)).toContain('createSupabaseServiceClient')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Service
// TC-3S-019 through TC-3S-041
// ---------------------------------------------------------------------------

describe('Slice 3: proposal-follow-up-draft service', () => {

  it('TC-3S-019: draft service file exists and is readable', () => {
    expect(() => readSrc(DRAFT_SERVICE)).not.toThrow()
  })

  it('TC-3S-020: generateProposalFollowUpDraftForWorkspace is exported', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('export async function generateProposalFollowUpDraftForWorkspace')
  })

  it('TC-3S-021: service checks commitment_status is open before writing', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("commitment.commitment_status !== 'open'")
  })

  it('TC-3S-022: service checks commitment.draft_id for duplicate detection', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('commitment.draft_id')
    expect(readSrc(DRAFT_SERVICE)).toContain("'draft_already_exists'")
  })

  it('TC-3S-023: service calls getActiveDraftForCommitment for subject-link duplicate check', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('getActiveDraftForCommitment')
  })

  it('TC-3S-024: service does not mutate commitment_status', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).not.toContain("commitment_status: 'completed'")
    expect(src).not.toContain("commitment_status: 'skipped'")
    expect(src).not.toContain("commitment_status: 'closed'")
    // The only reference is a read check
    expect(src).not.toMatch(/commitment_status:\s*'(?!open)/)
  })

  it('TC-3S-025: service calls linkDraftToCommitment after draft creation', () => {
    const src = readSrc(DRAFT_SERVICE)
    const draftCreate = src.indexOf('createFollowUpEmailDraft')
    const linkCall    = src.indexOf('linkDraftToCommitment')
    expect(draftCreate).toBeGreaterThan(-1)
    expect(linkCall).toBeGreaterThan(draftCreate)
  })

  it('TC-3S-026: service treats back-link failure as non-fatal — draft is not rolled back', () => {
    const src = readSrc(DRAFT_SERVICE)
    // The back-link call is wrapped in try/catch; failure sets linkWritten = false without throwing
    expect(src).toContain('linkWritten = false')
    // Verify the catch block is present around the back-link
    expect(src).toMatch(/try\s*\{[^}]*linkDraftToCommitment[\s\S]*?\}\s*catch/)
  })

  it('TC-3S-027: service does not reference email_sends', () => {
    expect(readSrc(DRAFT_SERVICE)).not.toContain('email_sends')
  })

  it('TC-3S-028: service does not import Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3S-029: service uses template path and sets generation_path to template', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("generation_path:        'template'")
  })

  it('TC-3S-030: service uses the email_proposal_follow_up template slug', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("'email_proposal_follow_up'")
  })

  it('TC-3S-031: service calls recordActivityEvent with PROPOSAL_FOLLOW_UP_DRAFT_CREATED', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('PROPOSAL_FOLLOW_UP_DRAFT_CREATED')
    expect(readSrc(DRAFT_SERVICE)).toContain('recordActivityEvent')
  })

  it('TC-3S-032: service returns audit_failed if recordActivityEvent throws — draft not rolled back', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain("'audit_failed'")
    // audit failure comes after draft creation, not before
    const auditFailed = src.lastIndexOf("'audit_failed'")
    const draftCreate = src.indexOf('createFollowUpEmailDraft')
    expect(auditFailed).toBeGreaterThan(draftCreate)
  })

  it('TC-3S-033: service creates approval request via approvalRepo', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('createApprovalRequest')
    expect(readSrc(DRAFT_SERVICE)).toContain("'proposal_follow_up_draft_review'")
  })

  it('TC-3S-034: service loads lead and contact before writing', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('leadRepo.getLead')
    expect(src).toContain('contactRepo.getContact')
  })

  it('TC-3S-035: service checks suppression before writing', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('suppressionRepo.checkEmailSuppression')
  })

  it('TC-3S-036: service does not call recordActivityEvent directly in the repo', () => {
    // Repo should not call recordActivityEvent — only service should
    expect(readSrc(DRAFT_REPO)).not.toContain('recordActivityEvent')
  })

  it('TC-3S-037: service does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3S-038: service handles missing lead gracefully — lead_not_found', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("'lead_not_found'")
  })

  it('TC-3S-039: service handles missing contact gracefully — no_contact_linked', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("'no_contact_linked'")
  })

  it('TC-3S-040: service handles do_not_contact flag', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('do_not_contact')
    expect(readSrc(DRAFT_SERVICE)).toContain("'contact_do_not_contact'")
  })

  it('TC-3S-041: service result includes linkWritten to surface back-link status', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain('linkWritten')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Action
// TC-3S-042 through TC-3S-055
// ---------------------------------------------------------------------------

describe('Slice 3: proposal-follow-up-draft action', () => {

  it('TC-3S-042: action file exists and is readable', () => {
    expect(() => readSrc(DRAFT_ACTION)).not.toThrow()
  })

  it('TC-3S-043: action file has use server directive', () => {
    expect(readSrc(DRAFT_ACTION)).toContain("'use server'")
  })

  it('TC-3S-044: generateFollowUpDraftAction is exported', () => {
    expect(readSrc(DRAFT_ACTION)).toContain('export async function generateFollowUpDraftAction')
  })

  it('TC-3S-045: action requires crm.leads.edit permission', () => {
    expect(readSrc(DRAFT_ACTION)).toContain("requirePermission(ctx, 'crm.leads.edit')")
  })

  it('TC-3S-046: action validates commitmentId is non-empty', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).toContain('commitmentId')
    expect(src).toContain('commitmentId is required')
  })

  it('TC-3S-047: action calls generateProposalFollowUpDraftForWorkspace', () => {
    expect(readSrc(DRAFT_ACTION)).toContain('generateProposalFollowUpDraftForWorkspace')
  })

  it('TC-3S-048: action does not call repository functions directly', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).not.toContain('createFollowUpEmailDraft')
    expect(src).not.toContain('linkDraftToCommitment')
    expect(src).not.toContain('getActiveDraftForCommitment')
  })

  it('TC-3S-049: action does not call recordActivityEvent', () => {
    expect(readSrc(DRAFT_ACTION)).not.toContain('recordActivityEvent')
  })

  it('TC-3S-050: action does not import Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3S-051: action does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3S-052: action returns ActionResult-shaped response', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).toContain('success: true')
    expect(src).toContain('success: false')
  })

  it('TC-3S-053: action includes draftId in success data', () => {
    expect(readSrc(DRAFT_ACTION)).toContain('draftId')
  })

  it('TC-3S-054: action handles draft_already_exists case explicitly', () => {
    expect(readSrc(DRAFT_ACTION)).toContain("'draft_already_exists'")
  })

  it('TC-3S-055: action uses buildRequestContext for tenantId/workspaceId/userId', () => {
    expect(readSrc(DRAFT_ACTION)).toContain('buildRequestContext')
    expect(readSrc(DRAFT_ACTION)).toContain('ctx.tenantId')
    expect(readSrc(DRAFT_ACTION)).toContain('ctx.workspaceId')
    expect(readSrc(DRAFT_ACTION)).toContain('ctx.userId')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Constants / Types
// TC-3S-056 through TC-3S-063
// ---------------------------------------------------------------------------

describe('Slice 3: constants and types', () => {

  it('TC-3S-056: ActivityEventType includes PROPOSAL_FOLLOW_UP_DRAFT_CREATED', () => {
    expect(readSrc(AGENT_TYPES)).toContain('PROPOSAL_FOLLOW_UP_DRAFT_CREATED')
    expect(readSrc(AGENT_TYPES)).toContain("'proposal_follow_up_draft_created'")
  })

  it('TC-3S-057: ActivityEventType includes PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED', () => {
    expect(readSrc(AGENT_TYPES)).toContain('PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED')
    expect(readSrc(AGENT_TYPES)).toContain("'proposal_follow_up_draft_generation_failed'")
  })

  it('TC-3S-058: DRAFT_SOURCE_BADGE includes FUTURE_FOLLOW_UP entry', () => {
    expect(readSrc(DRAFT_SOURCE)).toContain('FUTURE_FOLLOW_UP')
    expect(readSrc(DRAFT_SOURCE)).toContain('Follow-Up')
  })

  it('TC-3S-059: DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP constant is defined', () => {
    expect(readSrc(DRAFT_SOURCE)).toContain("FUTURE_FOLLOW_UP:           'future_follow_up'")
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Safety / Cross-cutting
// TC-3S-060 through TC-3S-070
// ---------------------------------------------------------------------------

describe('Slice 3: safety and cross-cutting guardrails', () => {

  it('TC-3S-060: no email_sends reference in any Phase 3S file', () => {
    expect(readSrc(DRAFT_REPO)).not.toContain('email_sends')
    expect(readSrc(DRAFT_SERVICE)).not.toContain('email_sends')
    expect(readSrc(DRAFT_ACTION)).not.toContain('email_sends')
  })

  it('TC-3S-061: no Resend import in any Phase 3S file', () => {
    expect(readSrc(DRAFT_REPO)).not.toContain('Resend')
    expect(readSrc(DRAFT_SERVICE)).not.toContain('Resend')
    expect(readSrc(DRAFT_ACTION)).not.toContain('Resend')
  })

  it('TC-3S-062: no Inngest import in any Phase 3S file', () => {
    expect(readSrc(DRAFT_REPO)).not.toContain('Inngest')
    expect(readSrc(DRAFT_SERVICE)).not.toContain('Inngest')
    expect(readSrc(DRAFT_ACTION)).not.toContain('Inngest')
  })

  it('TC-3S-063: no LLM imports (OpenAI, Anthropic) in any Phase 3S file', () => {
    for (const f of [DRAFT_REPO, DRAFT_SERVICE, DRAFT_ACTION]) {
      const src = readSrc(f)
      expect(src).not.toContain('OpenAI')
      expect(src).not.toContain('Anthropic')
    }
  })

  it('TC-3S-064: draft generation does not mutate commitment_status in repo', () => {
    const src = readSrc(DRAFT_REPO)
    expect(src).not.toContain("commitment_status: 'completed'")
    expect(src).not.toContain("commitment_status: 'skipped'")
    expect(src).not.toContain('commitment_status')
  })

  it('TC-3S-065: proposal_follow_up_commitments update in repo only touches draft_id', () => {
    const src = readSrc(DRAFT_REPO)
    const fnStart = src.indexOf('export async function linkDraftToCommitment')
    const fnEnd   = src.indexOf('export async function getActiveDraftForCommitment', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    // Only draft_id and updated_at should be in the update — not commitment_status
    expect(fn).toContain('draft_id: draftId')
    expect(fn).not.toContain('commitment_status')
  })

  it('TC-3S-066: draft status is pending_approval — not approved, sent, or draft', () => {
    const src = readSrc(DRAFT_REPO)
    // The status written must be pending_approval
    expect(src).toContain("status:               'pending_approval'")
    // Must never be set to 'approved' or 'sent' by this code
    expect(src).not.toContain("status: 'approved'")
    expect(src).not.toContain("status: 'sent'")
  })

  it('TC-3S-067: service does not complete or skip the commitment', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).not.toContain('completeFollowUpCommitment')
    expect(src).not.toContain('skipFollowUpCommitment')
    expect(src).not.toContain('rescheduleFollowUpCommitment')
  })

  it('TC-3S-068: Phase 3R mutation files are not modified by Phase 3S', () => {
    // Complete/Skip/Reschedule actions must still contain their original exports
    const mutActions = readSrc('modules/proposals/actions/proposal-follow-up-mutations.actions.ts')
    expect(mutActions).toContain('completeFollowUpCommitmentAction')
    expect(mutActions).toContain('skipFollowUpCommitmentAction')
    expect(mutActions).toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3S-069: service does not create an email_drafts row for a non-open commitment', () => {
    const src = readSrc(DRAFT_SERVICE)
    // Guard must appear before the actual await call to createFollowUpEmailDraft
    const guardIdx  = src.indexOf("commitment.commitment_status !== 'open'")
    // Find the actual await call (not the import at the top)
    const awaitIdx  = src.indexOf('await createFollowUpEmailDraft')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(awaitIdx).toBeGreaterThan(guardIdx)
  })

  it('TC-3S-070: service result type includes ok, error, existingDraftId, linkWritten', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('ok: true')
    expect(src).toContain('ok: false')
    expect(src).toContain('existingDraftId')
    expect(src).toContain('linkWritten')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Codex Fix: workspace validation
// TC-3S-071 through TC-3S-076
// ---------------------------------------------------------------------------

describe('Slice 3 Codex fix: workspace validation for lead and contact', () => {

  it('TC-3S-071: service checks lead.workspace_id !== workspaceId after loading lead', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('lead.workspace_id !== workspaceId')
  })

  it('TC-3S-072: service checks contact.workspace_id !== workspaceId after loading contact', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('contact.workspace_id !== workspaceId')
  })

  it('TC-3S-073: workspace mismatch on lead returns lead_not_found before draft creation', () => {
    const src = readSrc(DRAFT_SERVICE)
    // Workspace check must appear before createFollowUpEmailDraft
    const leadWsIdx   = src.indexOf('lead.workspace_id !== workspaceId')
    const awaitDraft  = src.indexOf('await createFollowUpEmailDraft')
    expect(leadWsIdx).toBeGreaterThan(-1)
    expect(awaitDraft).toBeGreaterThan(leadWsIdx)
  })

  it('TC-3S-074: workspace mismatch on contact returns no_contact_linked before draft creation', () => {
    const src = readSrc(DRAFT_SERVICE)
    // Contact workspace check must appear before createFollowUpEmailDraft
    const contactWsIdx = src.indexOf('contact.workspace_id !== workspaceId')
    const awaitDraft   = src.indexOf('await createFollowUpEmailDraft')
    expect(contactWsIdx).toBeGreaterThan(-1)
    expect(awaitDraft).toBeGreaterThan(contactWsIdx)
  })

  it('TC-3S-075: lead workspace check comes after loading lead and before loading contact', () => {
    const src = readSrc(DRAFT_SERVICE)
    const loadLead    = src.indexOf('leadRepo.getLead')
    const leadWsCheck = src.indexOf('lead.workspace_id !== workspaceId')
    const loadContact = src.indexOf('contactRepo.getContact')
    expect(loadLead).toBeLessThan(leadWsCheck)
    expect(leadWsCheck).toBeLessThan(loadContact)
  })

  it('TC-3S-076: contact workspace check comes after loading contact and before suppression check', () => {
    const src = readSrc(DRAFT_SERVICE)
    const loadContact    = src.indexOf('contactRepo.getContact')
    const contactWsCheck = src.indexOf('contact.workspace_id !== workspaceId')
    const suppression    = src.indexOf('checkEmailSuppression')
    expect(loadContact).toBeLessThan(contactWsCheck)
    expect(contactWsCheck).toBeLessThan(suppression)
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Codex Fix: approval partial-success behavior
// TC-3S-077 through TC-3S-083
// ---------------------------------------------------------------------------

describe('Slice 3 Codex fix: approval partial-success behavior', () => {

  it('TC-3S-077: service returns ok true with approvalLinked false on approval_request failure', () => {
    const src = readSrc(DRAFT_SERVICE)
    // The warning constant must appear in the return statement (last occurrence is the return, not the type)
    expect(src).toContain("warning:           'approval_request_failed'")
    // The return that contains the warning must also have ok: true and approvalLinked: false
    const lastWarnIdx = src.lastIndexOf("'approval_request_failed'")
    const returnBlock = src.slice(Math.max(0, lastWarnIdx - 300), lastWarnIdx + 20)
    expect(returnBlock).toContain('ok: true')
    expect(returnBlock).toContain('approvalLinked:    false')
  })

  it('TC-3S-078: service returns ok true with approvalLinked false on approval link failure', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain("warning:           'approval_link_failed'")
    // Same approach — find the last occurrence (return statement, not type declaration)
    const lastWarnIdx = src.lastIndexOf("'approval_link_failed'")
    const returnBlock = src.slice(Math.max(0, lastWarnIdx - 300), lastWarnIdx + 20)
    expect(returnBlock).toContain('ok: true')
    expect(returnBlock).toContain('approvalLinked:    false')
  })

  it('TC-3S-079: service returns ok true with warning audit_failed instead of ok false', () => {
    const src = readSrc(DRAFT_SERVICE)
    // Audit failure must return ok: true — draft is not rolled back
    expect(src).toContain("warning:           'audit_failed'")
    const warnIdx = src.lastIndexOf("'audit_failed'")
    const nearOk  = src.slice(Math.max(0, warnIdx - 200), warnIdx + 50)
    expect(nearOk).toContain('ok: true')
  })

  it('TC-3S-080: service success result type includes approvalLinked field', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('approvalLinked')
  })

  it('TC-3S-081: service success result type includes optional warning field', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain('warning?:')
    // Verify warning type is declared
    expect(src).toContain('GenerateFollowUpDraftWarning')
  })

  it('TC-3S-082: action surfaces approvalLinked and warning in success data', () => {
    const src = readSrc(DRAFT_ACTION)
    expect(src).toContain('approvalLinked')
    expect(src).toContain('warning')
  })

  it('TC-3S-083: action no longer includes approval_failed or audit_failed as ok:false error cases', () => {
    const src = readSrc(DRAFT_ACTION)
    // These are now partial-success states in the service, not ok:false errors
    expect(src).not.toContain("'approval_failed'")
    expect(src).not.toContain("'audit_failed'")
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Codex Fix: fail closed on read errors
// TC-3S-084 through TC-3S-089
// ---------------------------------------------------------------------------

describe('Slice 3 Codex fix: fail closed on duplicate-check and read errors', () => {

  it('TC-3S-084: getActiveDraftForCommitment throws on Supabase read error', () => {
    const src = readSrc(DRAFT_REPO)
    const fnStart = src.indexOf('export async function getActiveDraftForCommitment')
    const fnEnd   = src.indexOf('export async function fetchCommitmentForDraftGeneration', fnStart)
    const fn = src.slice(fnStart, fnEnd)
    // Must check for error and throw — not silently return null
    expect(fn).toContain('if (error) throw')
    expect(fn).toContain('getActiveDraftForCommitment')
  })

  it('TC-3S-085: fetchCommitmentForDraftGeneration throws on Supabase read error', () => {
    const src = readSrc(DRAFT_REPO)
    const fnStart = src.indexOf('export async function fetchCommitmentForDraftGeneration')
    const fn = src.slice(fnStart)
    expect(fn).toContain('if (error) throw')
    expect(fn).toContain('fetchCommitmentForDraftGeneration')
  })

  it('TC-3S-086: service error type includes read_failed', () => {
    expect(readSrc(DRAFT_SERVICE)).toContain("'read_failed'")
  })

  it('TC-3S-087: service wraps fetchCommitmentForDraftGeneration in try/catch returning read_failed', () => {
    const src = readSrc(DRAFT_SERVICE)
    expect(src).toContain("error: 'read_failed'")
    // The catch block for the commitment fetch returns read_failed
    const readFailedIdx = src.indexOf("error: 'read_failed'")
    const nearFetch     = src.slice(Math.max(0, readFailedIdx - 300), readFailedIdx + 50)
    expect(nearFetch).toContain('fetchCommitmentForDraftGeneration')
  })

  it('TC-3S-088: service wraps getActiveDraftForCommitment in try/catch returning read_failed', () => {
    const src = readSrc(DRAFT_SERVICE)
    // Both read_failed returns must exist; second one covers subject-link check
    const firstIdx  = src.indexOf("error: 'read_failed'")
    const secondIdx = src.indexOf("error: 'read_failed'", firstIdx + 1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    const nearSecond = src.slice(Math.max(0, secondIdx - 400), secondIdx + 50)
    expect(nearSecond).toContain('getActiveDraftForCommitment')
  })

  it('TC-3S-089: action exposes read_failed case to caller', () => {
    expect(readSrc(DRAFT_ACTION)).toContain("'read_failed'")
  })

})
