/**
 * Phase 3T — Approved Send UI Control
 * Test suite: source-reading tier — Slice 4 (Send UI)
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

const SEND_BUTTON  = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/SendFollowUpDraftButton.tsx'
const QUEUE_PAGE   = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx'
const QUEUE_REPO   = 'modules/proposals/repositories/proposal-follow-up-commitments.repo.ts'

// ---------------------------------------------------------------------------
// Slice 4 — SendFollowUpDraftButton component
// TC-3T-UI-001 through TC-3T-UI-030
// ---------------------------------------------------------------------------

describe('Slice 4: SendFollowUpDraftButton component', () => {

  it('TC-3T-UI-001: SendFollowUpDraftButton file exists and is readable', () => {
    expect(() => readSrc(SEND_BUTTON)).not.toThrow()
  })

  it('TC-3T-UI-002: component has use client directive', () => {
    expect(readSrc(SEND_BUTTON)).toContain("'use client'")
  })

  it('TC-3T-UI-003: component imports sendFollowUpDraftAction', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain('sendFollowUpDraftAction')
    expect(src).toContain('proposal-follow-up-send.actions')
  })

  it('TC-3T-UI-004: component accepts commitmentId prop', () => {
    expect(readSrc(SEND_BUTTON)).toContain('commitmentId')
  })

  it('TC-3T-UI-005: component accepts draftStatus prop', () => {
    expect(readSrc(SEND_BUTTON)).toContain('draftStatus')
  })

  it('TC-3T-UI-006: component accepts emailSendingEnabled prop', () => {
    expect(readSrc(SEND_BUTTON)).toContain('emailSendingEnabled')
  })

  it('TC-3T-UI-007: component calls sendFollowUpDraftAction with { commitmentId }', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain('sendFollowUpDraftAction({ commitmentId })')
  })

  it('TC-3T-UI-008: component does not pass draftId as the primary action input', () => {
    const src = readSrc(SEND_BUTTON)
    // Must not call the action with draftId as the input field
    expect(src).not.toContain('sendFollowUpDraftAction({ draftId })')
    expect(src).not.toContain('sendFollowUpDraftAction({ draftId:')
  })

  it('TC-3T-UI-009: component does not import repositories or services directly', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).not.toContain('proposal-follow-up-draft.repo')
    expect(src).not.toContain('email-send.service')
    expect(src).not.toContain('email-send.repo')
    expect(src).not.toContain('proposal-follow-up-commitments.repo')
  })

  it('TC-3T-UI-010: component does not import Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3T-UI-011: component does not reference the campaign sending feature flag', () => {
    expect(readSrc(SEND_BUTTON)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3T-UI-012: component does not mutate the email sending feature flag', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).not.toContain('setBooleanControl')
    expect(src).not.toContain('getBooleanControl')
    expect(src).not.toContain('SystemControlKey')
  })

  it('TC-3T-UI-013: component gates active send on emailSendingEnabled and approved status', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain('emailSendingEnabled')
    expect(src).toContain("'approved'")
  })

  it('TC-3T-UI-014: component shows Email sending disabled when flag is false', () => {
    expect(readSrc(SEND_BUTTON)).toContain('Email sending disabled')
  })

  it('TC-3T-UI-015: component shows Draft pending approval state', () => {
    expect(readSrc(SEND_BUTTON)).toContain('Draft pending approval')
  })

  it('TC-3T-UI-016: component shows Send Email button text in idle state', () => {
    expect(readSrc(SEND_BUTTON)).toContain('Send Email')
  })

  it('TC-3T-UI-017: component has a confirmation step before calling the action', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain("type: 'confirming'")
    expect(src).toContain('Send this follow-up email')
  })

  it('TC-3T-UI-018: confirmation step describes action and is not campaign language', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain('approved draft')
    expect(src).not.toContain('campaign')
    expect(src).not.toContain('launch')
    expect(src).not.toContain('blast')
  })

  it('TC-3T-UI-019: component uses useRef in-flight guard to prevent double-submit', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).toContain('useRef')
    expect(src).toContain('inFlightRef')
    expect(src).toContain('if (inFlightRef.current) return')
    expect(src).toContain('inFlightRef.current = true')
    expect(src).toContain('inFlightRef.current = false')
    expect(src).toContain('finally')
  })

  it('TC-3T-UI-020: Confirm button disabled while in-flight', () => {
    expect(readSrc(SEND_BUTTON)).toContain('inFlightRef.current')
  })

  it('TC-3T-UI-021: component shows Sending… loading state', () => {
    expect(readSrc(SEND_BUTTON)).toContain('Sending…')
    expect(readSrc(SEND_BUTTON)).toContain('animate-spin')
  })

  it('TC-3T-UI-022: component shows Sent success state', () => {
    expect(readSrc(SEND_BUTTON)).toContain('Sent')
    expect(readSrc(SEND_BUTTON)).toContain("type: 'success'")
  })

  it('TC-3T-UI-023: component shows error state with dismiss', () => {
    expect(readSrc(SEND_BUTTON)).toContain("type: 'error'")
    expect(readSrc(SEND_BUTTON)).toContain('Dismiss')
  })

  it('TC-3T-UI-024: component calls router.refresh() after successful send', () => {
    expect(readSrc(SEND_BUTTON)).toContain('router.refresh()')
  })

  it('TC-3T-UI-025: component uses useTransition for async protection', () => {
    expect(readSrc(SEND_BUTTON)).toContain('useTransition')
    expect(readSrc(SEND_BUTTON)).toContain('startTransition')
  })

  it('TC-3T-UI-026: component does not call Complete, Skip, or Reschedule actions', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).not.toContain('completeFollowUpCommitmentAction')
    expect(src).not.toContain('skipFollowUpCommitmentAction')
    expect(src).not.toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3T-UI-027: component does not auto-complete the commitment after send', () => {
    const src = readSrc(SEND_BUTTON)
    // No implicit commitment mutation — mark complete is a separate explicit Phase 3R action
    expect(src).not.toContain('commitment_status')
    expect(src).not.toContain('mark follow-up complete')
  })

  it('TC-3T-UI-028: component returns null for missing draft', () => {
    expect(readSrc(SEND_BUTTON)).toContain('if (!draftStatus) return null')
  })

  it('TC-3T-UI-029: component returns null for non-sendable draft statuses', () => {
    // Rejected, superseded, etc. get a null return
    expect(readSrc(SEND_BUTTON)).toContain("if (draftStatus !== 'approved') return null")
  })

  it('TC-3T-UI-030: component does not contain direct email_sends insert', () => {
    expect(readSrc(SEND_BUTTON)).not.toContain("from('email_sends')")
    expect(readSrc(SEND_BUTTON)).not.toContain('createEmailSend')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Queue page wiring
// TC-3T-UI-031 through TC-3T-UI-042
// ---------------------------------------------------------------------------

describe('Slice 4: queue page wiring', () => {

  it('TC-3T-UI-031: queue page imports SendFollowUpDraftButton', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('SendFollowUpDraftButton')
    expect(src).toContain('./SendFollowUpDraftButton')
  })

  it('TC-3T-UI-031b: queue page derives canSendEmail from messaging.send_emails permission', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('canSendEmail')
    expect(src).toContain("hasPermission(ctx, 'messaging.send_emails')")
  })

  it('TC-3T-UI-031c: SendFollowUpDraftButton is gated by canSendEmail, not canMutate', () => {
    const src = readSrc(QUEUE_PAGE)
    // canSendEmail must gate the send button
    expect(src).toContain('canSendEmail &&')
    // The send button must not be nested inside the canMutate block
    const canMutateBlock = src.slice(src.indexOf('canMutate && ('), src.indexOf('{canSendEmail &&'))
    expect(canMutateBlock).not.toContain('SendFollowUpDraftButton')
  })

  it('TC-3T-UI-031d: Generate/Complete/Skip/Reschedule remain under canMutate, not canSendEmail', () => {
    const src = readSrc(QUEUE_PAGE)
    const canMutateBlock = src.slice(src.indexOf('canMutate && ('), src.indexOf('{canSendEmail &&'))
    expect(canMutateBlock).toContain('CompleteFollowUpButton')
    expect(canMutateBlock).toContain('SkipFollowUpButton')
    expect(canMutateBlock).toContain('RescheduleFollowUpButton')
    expect(canMutateBlock).toContain('GenerateFollowUpDraftButton')
  })

  it('TC-3T-UI-031e: canSendEmail falls back to false on error', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('canSendEmail    = false')
  })

  it('TC-3T-UI-032: queue page reads emailSendingEnabled from system control', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('emailSendingEnabled')
    expect(src).toContain('getBooleanControl')
    expect(src).toContain('SystemControlKey')
  })

  it('TC-3T-UI-033: emailSendingEnabled defaults to false on error', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('emailSendingEnabled = false')
  })

  it('TC-3T-UI-034: queue page passes commitmentId to SendFollowUpDraftButton', () => {
    const src = readSrc(QUEUE_PAGE)
    const usage = src.slice(src.indexOf('<SendFollowUpDraftButton'))
    expect(usage).toContain('commitmentId={item.id}')
  })

  it('TC-3T-UI-035: queue page passes draftStatus from item.draft_status', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('draftStatus={item.draft_status}')
  })

  it('TC-3T-UI-036: queue page passes emailSendingEnabled to SendFollowUpDraftButton', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('emailSendingEnabled={emailSendingEnabled}')
  })

  it('TC-3T-UI-037: queue page keeps GenerateFollowUpDraftButton', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('GenerateFollowUpDraftButton')
  })

  it('TC-3T-UI-038: queue page keeps Complete, Skip, Reschedule controls', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('SkipFollowUpButton')
    expect(src).toContain('RescheduleFollowUpButton')
  })

  it('TC-3T-UI-039: send UI is not wired to draftId as the primary action input', () => {
    const src = readSrc(QUEUE_PAGE)
    // Page must not pass draftId to SendFollowUpDraftButton
    expect(src).not.toContain('draftId={item.draft_id}')
  })

  it('TC-3T-UI-040: queue page does not reference campaign sending feature flag', () => {
    expect(readSrc(QUEUE_PAGE)).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3T-UI-041: queue page remains server component — no use client', () => {
    expect(readSrc(QUEUE_PAGE)).not.toContain("'use client'")
  })

  it('TC-3T-UI-042: emailSendingEnabled falls back safely — not hardcoded true', () => {
    // Ensure page does not hardcode emailSendingEnabled = true
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('emailSendingEnabled = true')
    // It starts as false and is only set true via getBooleanControl
    expect(src).toContain('emailSendingEnabled = false')
    expect(src).toContain('getBooleanControl')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Queue read model
// TC-3T-UI-043 through TC-3T-UI-049
// ---------------------------------------------------------------------------

describe('Slice 4: queue read model draft_status', () => {

  it('TC-3T-UI-043: ProposalFollowUpQueueItem includes draft_status', () => {
    expect(readSrc(QUEUE_REPO)).toContain('draft_status: string | null')
  })

  it('TC-3T-UI-044: ProposalFollowUpQueueItem includes draft_sent_at', () => {
    expect(readSrc(QUEUE_REPO)).toContain('draft_sent_at: string | null')
  })

  it('TC-3T-UI-045: queue repository batch-loads email_draft statuses — not N+1', () => {
    const src = readSrc(QUEUE_REPO)
    // Uses .in('id', draftIds) to batch-load, not per-row queries
    expect(src).toContain("from('email_drafts')")
    expect(src).toContain(".in('id', draftIds)")
  })

  it('TC-3T-UI-045b: draft status batch query is scoped by tenant_id AND workspace_id', () => {
    const src = readSrc(QUEUE_REPO)
    // Find the email_drafts batch query block
    const batchStart = src.indexOf("from('email_drafts')")
    const batchEnd   = src.indexOf('for (const d of rawDrafts', batchStart)
    const batchQuery = src.slice(batchStart, batchEnd)
    expect(batchQuery).toContain(".eq('tenant_id', tenantId)")
    expect(batchQuery).toContain(".eq('workspace_id', workspaceId)")
  })

  it('TC-3T-UI-046: mapper sets draft_status read-only from batch load', () => {
    expect(readSrc(QUEUE_REPO)).toContain('draft_status:')
    expect(readSrc(QUEUE_REPO)).toContain('draftStatusMap')
  })

  it('TC-3T-UI-047: draft_status is null when draft_id is null', () => {
    const src = readSrc(QUEUE_REPO)
    expect(src).toContain('c.draft_id ? (draftStatusMap.get(c.draft_id)')
  })

  it('TC-3T-UI-048: no migration created for draft_status addition', () => {
    // email_drafts.status already existed — no migration needed
    const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
    // No migration file added after 20240039
    const afterCurrent = migrations.filter(f => /^202400[4-9]/.test(f) || /^2024[1-9]/.test(f))
    expect(afterCurrent).toHaveLength(0)
  })

  it('TC-3T-UI-049: queue repo does not update draft_status — it is read-only in the queue path', () => {
    // draft_status is derived from a batch-loaded email_drafts read; it is never written
    // by the queue repository. linkDraftToCommitment only writes draft_id, not draft_status.
    const src = readSrc(QUEUE_REPO)
    // The only .update() call in the file is linkDraftToCommitment — confirm draft_status is not in it
    const linkFnStart = src.indexOf('export async function linkDraftToCommitment')
    const linkFnEnd   = src.indexOf('export async function getActiveDraftForCommitment', linkFnStart)
    const linkFn = src.slice(linkFnStart, linkFnEnd)
    expect(linkFn).not.toContain('draft_status')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Safety guardrails
// TC-3T-UI-050 through TC-3T-UI-056
// ---------------------------------------------------------------------------

describe('Slice 4: safety guardrails', () => {

  it('TC-3T-UI-050: SendFollowUpDraftButton has no Resend or send provider import', () => {
    expect(readSrc(SEND_BUTTON)).not.toContain("from 'resend'")
    expect(readSrc(SEND_BUTTON)).not.toContain('resend.emails.send')
  })

  it('TC-3T-UI-051: Phase 3R Phase 3S controls are unchanged in page', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('SkipFollowUpButton')
    expect(src).toContain('RescheduleFollowUpButton')
    expect(src).toContain('GenerateFollowUpDraftButton')
  })

  it('TC-3T-UI-052: SendFollowUpDraftButton does not call Complete or Skip or Reschedule', () => {
    const src = readSrc(SEND_BUTTON)
    expect(src).not.toContain('completeFollowUpCommitmentAction')
    expect(src).not.toContain('skipFollowUpCommitmentAction')
    expect(src).not.toContain('rescheduleFollowUpCommitmentAction')
    expect(src).not.toContain('generateFollowUpDraftAction')
  })

  it('TC-3T-UI-053: queue page does not hardcode email sending as enabled', () => {
    // Must not bypass flag by setting emailSendingEnabled = true statically
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('emailSendingEnabled = true')
  })

  it('TC-3T-UI-054: no direct email_sends insert in any Slice 4 file', () => {
    for (const f of [SEND_BUTTON, QUEUE_PAGE]) {
      const src = readSrc(f)
      expect(src).not.toContain("from('email_sends')")
      expect(src).not.toContain('createEmailSend')
    }
  })

  it('TC-3T-UI-055: SendFollowUpDraftButton does not reference proposal_status', () => {
    // The page legitimately reads proposal_status for display; the button must not
    expect(readSrc(SEND_BUTTON)).not.toContain('proposal_status')
  })

  it('TC-3T-UI-056: no commitment_status mutation in SendFollowUpDraftButton', () => {
    expect(readSrc(SEND_BUTTON)).not.toContain('commitment_status')
  })

})
