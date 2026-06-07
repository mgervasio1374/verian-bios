/**
 * Phase 3U — Send Reliability Hardening
 * Test suite: source-reading tier — Slice 3 (sendApprovedDraft hardening)
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

const SEND_REPO    = 'modules/messaging/repositories/email-send.repo.ts'
const SEND_SERVICE = 'modules/messaging/services/email-send.service.ts'
const SEND_ACTION  = 'modules/proposals/actions/proposal-follow-up-send.actions.ts'

// ---------------------------------------------------------------------------
// Slice 3 — Repository: getBlockingSendForDraft
// TC-3U-001 through TC-3U-009
// ---------------------------------------------------------------------------

describe('Slice 3: getBlockingSendForDraft repository helper', () => {

  it('TC-3U-001: email-send.repo.ts exports getBlockingSendForDraft', () => {
    expect(readSrc(SEND_REPO)).toContain('export async function getBlockingSendForDraft')
  })

  it('TC-3U-002: getBlockingSendForDraft checks queued status', () => {
    const src = readSrc(SEND_REPO)
    const fnStart = src.indexOf('export async function getBlockingSendForDraft')
    const fn = src.slice(fnStart, fnStart + 1500)
    expect(fn).toContain("'queued'")
  })

  it('TC-3U-003: getBlockingSendForDraft checks sent status', () => {
    const src = readSrc(SEND_REPO)
    const fnStart = src.indexOf('export async function getBlockingSendForDraft')
    const fn = src.slice(fnStart, fnStart + 1500)
    expect(fn).toContain("'sent'")
  })

  it('TC-3U-004: getBlockingSendForDraft checks provider_accepted status', () => {
    const src = readSrc(SEND_REPO)
    const fnStart = src.indexOf('export async function getBlockingSendForDraft')
    const fn = src.slice(fnStart, fnStart + 1500)
    expect(fn).toContain("'provider_accepted'")
  })

  it('TC-3U-005: getBlockingSendForDraft checks failed + resend_message_id IS NOT NULL', () => {
    const src = readSrc(SEND_REPO)
    const fnStart = src.indexOf('export async function getBlockingSendForDraft')
    const fn = src.slice(fnStart, fnStart + 1500)
    expect(fn).toContain("'failed'")
    expect(fn).toContain('resend_message_id')
    // must not be the only check — checks both active statuses AND failed+id case
    expect(fn).toContain('maybeSingle')
  })

  it('TC-3U-006: getBlockingSendForDraft does not block failed + resend_message_id null', () => {
    const src = readSrc(SEND_REPO)
    const fnStart = src.indexOf('export async function getBlockingSendForDraft')
    const fn = src.slice(fnStart, fnStart + 1500)
    // Does NOT apply .in(['failed']) for the null-resend_message_id case —
    // clean failures (no ID) are not blocking
    expect(fn).not.toMatch(/\.in\('status',\s*\['failed'\]\)/)
  })

  it('TC-3U-007: getActiveSendForDraft still exists in repo (not removed)', () => {
    expect(readSrc(SEND_REPO)).toContain('export async function getActiveSendForDraft')
  })

  it('TC-3U-008: repo comment notes provider_accepted is application-guarded, not covered by DB unique index', () => {
    const src = readSrc(SEND_REPO)
    expect(src).toContain('provider_accepted')
    expect(src).toContain('email_sends_draft_active_unique')
    expect(src).toContain('application-guarded')
  })

  it('TC-3U-009: repo comment mentions resend_message_id IS NOT NULL as a future index option', () => {
    expect(readSrc(SEND_REPO)).toContain('resend_message_id IS NOT NULL')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — sendApprovedDraft: idempotency check
// TC-3U-010 through TC-3U-015
// ---------------------------------------------------------------------------

describe('Slice 3: sendApprovedDraft idempotency check hardening', () => {

  it('TC-3U-010: sendApprovedDraft imports/calls getBlockingSendForDraft', () => {
    expect(readSrc(SEND_SERVICE)).toContain('getBlockingSendForDraft')
  })

  it('TC-3U-011: getBlockingSendForDraft call appears before createEmailSend in service', () => {
    const src     = readSrc(SEND_SERVICE)
    const blockIdx  = src.indexOf('getBlockingSendForDraft(draftId')
    const createIdx = src.indexOf('createEmailSend(')
    expect(blockIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(blockIdx)
  })

  it('TC-3U-012: sendApprovedDraft does not rely only on getActiveSendForDraft for duplicate guard', () => {
    const src = readSrc(SEND_SERVICE)
    // getBlockingSendForDraft is the main guard; getActiveSendForDraft may still be imported
    // but must not be the sole idempotency check before createEmailSend
    const blockIdx  = src.indexOf('getBlockingSendForDraft(draftId')
    const activeIdx = src.indexOf('getActiveSendForDraft(')
    // getBlockingSendForDraft must exist
    expect(blockIdx).toBeGreaterThan(-1)
    // If getActiveSendForDraft appears, it must not appear before createEmailSend as the guard
    if (activeIdx !== -1) {
      const createIdx = src.indexOf('createEmailSend(')
      // getActiveSendForDraft must not be the guard — getBlockingSendForDraft replaces it
      expect(blockIdx).toBeLessThan(createIdx)
    }
  })

  it('TC-3U-013: alreadySent flag treats provider_accepted as sent-equivalent', () => {
    const src = readSrc(SEND_SERVICE)
    expect(src).toContain("existingSend.status === 'provider_accepted'")
    // The alreadySent condition must include provider_accepted
    const alreadySentBlock = src.slice(src.indexOf('alreadySent:'), src.indexOf('alreadySent:') + 300)
    expect(alreadySentBlock).toContain("'provider_accepted'")
  })

  it('TC-3U-014: alreadySent flag treats failed + resend_message_id as blocking/sent-equivalent', () => {
    const src = readSrc(SEND_SERVICE)
    const alreadySentBlock = src.slice(src.indexOf('alreadySent:'), src.indexOf('alreadySent:') + 300)
    expect(alreadySentBlock).toContain('resend_message_id')
  })

  it('TC-3U-015: service comment explains provider_accepted is application-guarded', () => {
    expect(readSrc(SEND_SERVICE)).toContain('application-guarded')
    expect(readSrc(SEND_SERVICE)).toContain('email_sends_draft_active_unique')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — provider_accepted persistence ordering
// TC-3U-016 through TC-3U-023
// ---------------------------------------------------------------------------

describe('Slice 3: provider_accepted persistence before local finalization', () => {

  it('TC-3U-016: provider_accepted status appears in send service source', () => {
    expect(readSrc(SEND_SERVICE)).toContain("'provider_accepted'")
  })

  it('TC-3U-017: updateEmailSend with provider_accepted appears before Promise.all', () => {
    const src      = readSrc(SEND_SERVICE)
    const paIdx    = src.indexOf("status:          'provider_accepted'")
    const promIdx  = src.indexOf('await Promise.all(')
    expect(paIdx).toBeGreaterThan(-1)
    expect(promIdx).toBeGreaterThan(paIdx)
  })

  it('TC-3U-018: provider_accepted update appears before updateDraftStatus call', () => {
    const src    = readSrc(SEND_SERVICE)
    const paIdx  = src.indexOf("status:          'provider_accepted'")
    const dsIdx  = src.indexOf('updateDraftStatus(draftId')
    expect(paIdx).toBeGreaterThan(-1)
    expect(dsIdx).toBeGreaterThan(paIdx)
  })

  it('TC-3U-019: provider_accepted metadata includes provider_success: true', () => {
    const src     = readSrc(SEND_SERVICE)
    const paStart = src.indexOf("status:          'provider_accepted'")
    const paBlock = src.slice(paStart, paStart + 300)
    expect(paBlock).toContain('provider_success:      true')
  })

  it('TC-3U-020: provider_accepted metadata includes provider_accepted_at timestamp', () => {
    const src     = readSrc(SEND_SERVICE)
    const paStart = src.indexOf("status:          'provider_accepted'")
    const paBlock = src.slice(paStart, paStart + 300)
    expect(paBlock).toContain('provider_accepted_at:')
  })

  it('TC-3U-021: provider_accepted metadata includes resend_message_id', () => {
    const src     = readSrc(SEND_SERVICE)
    const paStart = src.indexOf("status:          'provider_accepted'")
    const paBlock = src.slice(paStart, paStart + 300)
    expect(paBlock).toContain('resend_message_id:')
  })

  it('TC-3U-022: provider_accepted update includes resendMessageId in the call', () => {
    const src     = readSrc(SEND_SERVICE)
    const paStart = src.indexOf("status:          'provider_accepted'")
    const paBlock = src.slice(Math.max(0, paStart - 50), paStart + 200)
    expect(paBlock).toContain('resendMessageId')
  })

  it('TC-3U-023: Phase 3U comment explains provider_accepted persistence before Promise.all', () => {
    expect(readSrc(SEND_SERVICE)).toContain('Phase 3U: persist provider ID immediately before local finalization')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — catch block: provider-success/local-finalization failure
// TC-3U-024 through TC-3U-034
// ---------------------------------------------------------------------------

describe('Slice 3: catch block — provider-success/local-finalization failure handling', () => {

  it('TC-3U-024: catch block checks resendMessageId !== null to distinguish failure types', () => {
    const src = readSrc(SEND_SERVICE)
    expect(src).toContain('resendMessageId !== null')
  })

  it('TC-3U-025b: provider-known catch branch writes status provider_accepted in catch updateEmailSend', () => {
    const src = readSrc(SEND_SERVICE)
    // Find the catch branch for provider-known failure
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    // The catch updateEmailSend must explicitly set status provider_accepted
    expect(provSuccessBranch).toContain("status:         'provider_accepted'")
  })

  it('TC-3U-025c: provider-known catch branch writes top-level resendMessageId to preserve provider ID column', () => {
    const src = readSrc(SEND_SERVICE)
    // Find the catch branch for provider-known failure
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    // Top-level resendMessageId field (not only in metadata) must be in the update
    expect(provSuccessBranch).toContain('resendMessageId,')
    // Comment explains this closes the gap
    expect(provSuccessBranch).toContain('explicit — write to column, not only metadata')
  })

  it('TC-3U-025: provider-success path does NOT overwrite status to failed', () => {
    const src = readSrc(SEND_SERVICE)
    // Find the provider-success catch branch and confirm no status: 'failed' in it
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    expect(provSuccessBranch).not.toContain("status:        'failed'")
  })

  it('TC-3U-026: provider-success path writes failure_reason = local_finalization_failed_after_provider_success', () => {
    expect(readSrc(SEND_SERVICE)).toContain("'local_finalization_failed_after_provider_success'")
  })

  it('TC-3U-027: provider-success catch path writes metadata.provider_success = true', () => {
    const src = readSrc(SEND_SERVICE)
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    expect(provSuccessBranch).toContain('provider_success:')
    expect(provSuccessBranch).toContain('true')
  })

  it('TC-3U-028: provider-success catch path writes resend_message_id to metadata', () => {
    const src = readSrc(SEND_SERVICE)
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    expect(provSuccessBranch).toContain('resend_message_id:')
  })

  it('TC-3U-029: provider-success catch path writes local_finalization_failed_at timestamp', () => {
    const src = readSrc(SEND_SERVICE)
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    expect(provSuccessBranch).toContain('local_finalization_failed_at:')
  })

  it('TC-3U-030: return reason for provider-success/local-failure is local_finalization_failed_after_provider_success', () => {
    const src = readSrc(SEND_SERVICE)
    expect(src).toContain("reason: 'local_finalization_failed_after_provider_success'")
  })

  it('TC-3U-031: ET_SEND_FAILED metadata for provider-success path explicitly includes provider_success: true', () => {
    const src              = readSrc(SEND_SERVICE)
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    // Explicit enrichment (buildSendFailedPayload does not add these)
    expect(provSuccessBranch).toContain('// Explicit enrichment')
    expect(provSuccessBranch).toContain('provider_success:')
  })

  it('TC-3U-032: ET_SEND_FAILED metadata for provider-success path includes resend_message_id', () => {
    const src              = readSrc(SEND_SERVICE)
    const provSuccessStart = src.indexOf('resendMessageId !== null')
    const elseStart        = src.indexOf('} else {', provSuccessStart)
    const provSuccessBranch = src.slice(provSuccessStart, elseStart)
    expect(provSuccessBranch).toContain('resend_message_id:')
  })

  it('TC-3U-033: clean failure path (no provider ID) still sets status failed', () => {
    const src = readSrc(SEND_SERVICE)
    // The clean failure branch marks email_sends with status 'failed'
    expect(src).toContain("status:        'failed'")
    // And sets provider_success: false in metadata
    expect(src).toContain('provider_success: false')
  })

  it('TC-3U-034: timeout/no-ID ambiguity is documented in code comments', () => {
    const src = readSrc(SEND_SERVICE)
    // Comment must acknowledge timeout ambiguity without claiming "definitely not sent"
    expect(src).toContain('timeout')
    expect(src).toContain('ambiguous')
    expect(src).toContain('reconciliation')
  })

})

// ---------------------------------------------------------------------------
// Slice 3 — Guardrails
// TC-3U-035 through TC-3U-043
// ---------------------------------------------------------------------------

describe('Slice 3: guardrails', () => {

  it('TC-3U-035: EMAIL_SENDING_ENABLED gate still present in send service', () => {
    expect(readSrc(SEND_SERVICE)).toContain('EMAIL_SENDING_ENABLED')
  })

  it('TC-3U-036: CAMPAIGN_SENDING_ENABLED not referenced in send service', () => {
    expect(readSrc(SEND_SERVICE)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3U-037: no proposal or commitment status mutation in send service', () => {
    const src = readSrc(SEND_SERVICE)
    expect(src).not.toContain('commitment_status')
    expect(src).not.toContain('proposal_status')
  })

  it('TC-3U-038: no Inngest, OpenAI, or Anthropic in send service', () => {
    const src = readSrc(SEND_SERVICE)
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3U-039: no Inngest, OpenAI, or Anthropic in send repo', () => {
    const src = readSrc(SEND_REPO)
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3U-040: Phase 3T proposal send action still delegates to sendApprovedDraft', () => {
    expect(readSrc(SEND_ACTION)).toContain('sendApprovedDraft(ctx, draftId)')
  })

  it('TC-3U-041: no migration files created during Phase 3U Slice 3', () => {
    const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
    const phase3uMigrations = migrations.filter(f => f.toLowerCase().includes('phase3u'))
    expect(phase3uMigrations).toHaveLength(0)
  })

  it('TC-3U-042: no UI files were changed in Phase 3U Slice 3', () => {
    // SendFollowUpDraftButton should not import sendApprovedDraft directly
    const sendButton = readSrc('app/(workspace)/[workspaceSlug]/proposal-follow-ups/SendFollowUpDraftButton.tsx')
    expect(sendButton).not.toContain('sendApprovedDraft')
    expect(sendButton).not.toContain('email-send.service')
  })

  it('TC-3U-043: buildSendFailedPayload helper is not assumed to include provider_success', () => {
    const src = readSrc(SEND_SERVICE)
    // The service must explicitly add provider_success to metadata at the call site
    expect(src).toContain('// Explicit enrichment')
    expect(src).toContain('buildSendFailedPayload does not include')
  })

})
