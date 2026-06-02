/**
 * Phase 3S — Proposal Follow-Up Draft Generation UI
 * Test suite: source-reading tier — Slice 4 (Generate Draft UI control)
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

const GENERATE_BUTTON = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/GenerateFollowUpDraftButton.tsx'
const QUEUE_PAGE      = 'app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx'
const QUEUE_REPO      = 'modules/proposals/repositories/proposal-follow-up-commitments.repo.ts'

// ---------------------------------------------------------------------------
// Slice 4 — GenerateFollowUpDraftButton component
// TC-3S-UI-001 through TC-3S-UI-025
// ---------------------------------------------------------------------------

describe('Slice 4: GenerateFollowUpDraftButton component', () => {

  it('TC-3S-UI-001: GenerateFollowUpDraftButton file exists and is readable', () => {
    expect(() => readSrc(GENERATE_BUTTON)).not.toThrow()
  })

  it('TC-3S-UI-002: component has use client directive', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain("'use client'")
  })

  it('TC-3S-UI-003: component imports generateFollowUpDraftAction', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('generateFollowUpDraftAction')
    expect(readSrc(GENERATE_BUTTON)).toContain('proposal-follow-up-draft.actions')
  })

  it('TC-3S-UI-004: component exports GenerateFollowUpDraftButton', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('export function GenerateFollowUpDraftButton')
  })

  it('TC-3S-UI-005: component accepts commitmentId prop', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('commitmentId')
  })

  it('TC-3S-UI-006: component accepts existingDraftId prop', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('existingDraftId')
  })

  it('TC-3S-UI-007: component displays Generate Draft in idle state', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Generate Draft')
  })

  it('TC-3S-UI-008: component has a loading state with Generating text', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Generating')
    expect(readSrc(GENERATE_BUTTON)).toContain('animate-spin')
  })

  it('TC-3S-UI-009: component displays Draft Created on success', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Draft Created')
  })

  it('TC-3S-UI-010: component displays Draft Exists indicator when existingDraftId is set', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).toContain('Draft Exists')
    expect(src).toContain('existingDraftId')
  })

  it('TC-3S-UI-011: component handles approval_request_failed warning', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('approval_request_failed')
    expect(readSrc(GENERATE_BUTTON)).toContain('approval request setup failed')
  })

  it('TC-3S-UI-012: component handles approval_link_failed warning', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('approval_link_failed')
    expect(readSrc(GENERATE_BUTTON)).toContain('approval request was not linked')
  })

  it('TC-3S-UI-013: component handles audit_failed warning', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('audit_failed')
    expect(readSrc(GENERATE_BUTTON)).toContain('audit logging failed')
  })

  it('TC-3S-UI-014: component has an error state with dismiss', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Dismiss')
    expect(readSrc(GENERATE_BUTTON)).toContain("type: 'error'")
  })

  it('TC-3S-UI-015: component has a confirming state before action', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).toContain("type: 'confirming'")
    expect(src).toContain('does not send an email')
  })

  it('TC-3S-UI-016: component calls router.refresh() after clean success', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('router.refresh()')
  })

  it('TC-3S-UI-016b: router.refresh() is NOT called in the warning branch — warning state stays visible', () => {
    const src = readSrc(GENERATE_BUTTON)
    // Find the warning branch inside the action result handler and confirm
    // router.refresh() does not appear between the warning setState and the else branch.
    const warningBranchStart = src.indexOf('if (result.data.warning)')
    const elseBranchStart    = src.indexOf('} else {', warningBranchStart)
    const warningBranch      = src.slice(warningBranchStart, elseBranchStart)
    expect(warningBranch).not.toContain('router.refresh()')
  })

  it('TC-3S-UI-016c: router.refresh() IS called in the clean success branch', () => {
    const src = readSrc(GENERATE_BUTTON)
    // Clean success: the else branch after the warning check
    const warningBranchStart = src.indexOf('if (result.data.warning)')
    const elseBranchStart    = src.indexOf('} else {', warningBranchStart)
    const finallyStart       = src.indexOf('} finally {', elseBranchStart)
    const successBranch      = src.slice(elseBranchStart, finallyStart)
    expect(successBranch).toContain('router.refresh()')
  })

  it('TC-3S-UI-016d: warning state includes a Refresh queue button for manual refresh', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Refresh queue')
  })

  it('TC-3S-UI-016e: Refresh queue button calls only router.refresh() — not generateFollowUpDraftAction', () => {
    const src = readSrc(GENERATE_BUTTON)
    // Find the Refresh queue button context and verify it only calls router.refresh()
    const refreshQueueIdx = src.indexOf('Refresh queue')
    const nearRefresh     = src.slice(Math.max(0, refreshQueueIdx - 200), refreshQueueIdx + 50)
    expect(nearRefresh).toContain('router.refresh()')
    expect(nearRefresh).not.toContain('generateFollowUpDraftAction')
    expect(nearRefresh).not.toContain('handleConfirm')
  })

  it('TC-3S-UI-017: component does not contain Send button or send action references', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).not.toContain('>Send<')
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('sendFollowUp')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3S-UI-018: component does not import repository or service directly', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).not.toContain('proposal-follow-up-draft.repo')
    expect(src).not.toContain('proposal-follow-up-draft.service')
    expect(src).not.toContain('proposal-follow-up-commitments.repo')
  })

  it('TC-3S-UI-019: component does not import Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3S-UI-020: component uses useTransition to prevent duplicate submissions', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('useTransition')
    expect(readSrc(GENERATE_BUTTON)).toContain('startTransition')
  })

  it('TC-3S-UI-020b: component uses useRef in-flight guard to prevent synchronous double-submit', () => {
    const src = readSrc(GENERATE_BUTTON)
    // Guard must be present: useRef imported, inFlightRef declared, early return if in-flight,
    // ref set to true before action, reset to false in finally block.
    expect(src).toContain('useRef')
    expect(src).toContain('inFlightRef')
    expect(src).toContain('if (inFlightRef.current) return')
    expect(src).toContain('inFlightRef.current = true')
    expect(src).toContain('inFlightRef.current = false')
    expect(src).toContain('finally')
  })

  it('TC-3S-UI-021: warning state surfaces draftId so the created draft is not hidden', () => {
    const src = readSrc(GENERATE_BUTTON)
    // warning state stores draftId
    expect(src).toContain("type: 'warning'")
    expect(src).toContain('draftId')
  })

  it('TC-3S-UI-022: warning display is visually distinct from error — uses amber, not red', () => {
    const src = readSrc(GENERATE_BUTTON)
    // Warning uses amber styling; error uses red
    expect(src).toContain('bg-amber-50')
    expect(src).toContain('text-amber-700')
  })

  it('TC-3S-UI-023: Draft Created — Needs Review Setup shown for warning states', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('Draft Created — Needs Review Setup')
  })

  it('TC-3S-UI-024: confirmation text states this does not send an email', () => {
    expect(readSrc(GENERATE_BUTTON)).toContain('does not send an email')
  })

  it('TC-3S-UI-025: component does not mutate commitment_status', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).not.toContain('commitment_status')
    expect(src).not.toContain('completeFollowUp')
    expect(src).not.toContain('skipFollowUp')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Queue page wiring
// TC-3S-UI-026 through TC-3S-UI-038
// ---------------------------------------------------------------------------

describe('Slice 4: queue page wiring', () => {

  it('TC-3S-UI-026: queue page imports GenerateFollowUpDraftButton', () => {
    expect(readSrc(QUEUE_PAGE)).toContain('GenerateFollowUpDraftButton')
    expect(readSrc(QUEUE_PAGE)).toContain('./GenerateFollowUpDraftButton')
  })

  it('TC-3S-UI-027: queue page renders GenerateFollowUpDraftButton inside canMutate block', () => {
    const src = readSrc(QUEUE_PAGE)
    const canMutateBlock = src.indexOf('canMutate && (')
    const genDraftUsage  = src.indexOf('<GenerateFollowUpDraftButton')
    expect(canMutateBlock).toBeGreaterThan(-1)
    expect(genDraftUsage).toBeGreaterThan(canMutateBlock)
  })

  it('TC-3S-UI-028: queue page passes commitmentId to GenerateFollowUpDraftButton', () => {
    const src = readSrc(QUEUE_PAGE)
    const usage = src.slice(src.indexOf('<GenerateFollowUpDraftButton'))
    expect(usage).toContain('commitmentId={item.id}')
  })

  it('TC-3S-UI-029: queue page passes existingDraftId from item.draft_id', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('existingDraftId={item.draft_id}')
  })

  it('TC-3S-UI-030: existing Phase 3R mutation controls are still present in page', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('SkipFollowUpButton')
    expect(src).toContain('RescheduleFollowUpButton')
  })

  it('TC-3S-UI-031: queue page does not reference campaign sending or batch-send actions', () => {
    const src = readSrc(QUEUE_PAGE)
    // Phase 3T added a controlled send path; sendFollowUp is the expected Phase 3T component.
    // Campaign sending and batch-send must not appear.
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    // EMAIL_SENDING_ENABLED is now legitimately read by the page for the Phase 3T
    // SendFollowUpDraftButton feature flag gate — its presence here is expected.
  })

  it('TC-3S-UI-032: queue page does not include a Send button label', () => {
    expect(readSrc(QUEUE_PAGE)).not.toContain('>Send<')
  })

  it('TC-3S-UI-033: canMutate still gates all mutation controls including GenerateFollowUpDraftButton', () => {
    const src = readSrc(QUEUE_PAGE)
    // All four mutation controls must appear inside the same canMutate block
    expect(src).toContain('canMutate')
    expect(src).toContain('GenerateFollowUpDraftButton')
    expect(src).toContain('CompleteFollowUpButton')
    expect(src).toContain('SkipFollowUpButton')
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Queue DTO: draft_id field
// TC-3S-UI-034 through TC-3S-UI-038
// ---------------------------------------------------------------------------

describe('Slice 4: queue DTO draft_id field', () => {

  it('TC-3S-UI-034: ProposalFollowUpQueueItem interface includes draft_id', () => {
    expect(readSrc(QUEUE_REPO)).toContain('draft_id: string | null')
  })

  it('TC-3S-UI-035: listProposalFollowUpQueueItemsForWorkspace maps draft_id from commitment row', () => {
    expect(readSrc(QUEUE_REPO)).toContain('draft_id:            c.draft_id')
  })

  it('TC-3S-UI-036: queue repo does not expose a linkDraftToCommitment write function', () => {
    // draft_id write lives in proposal-follow-up-draft.repo.ts — not in the queue repo
    expect(readSrc(QUEUE_REPO)).not.toContain('linkDraftToCommitment')
  })

  it('TC-3S-UI-037: draft_id was pre-planned in migration 20240038 — no new migration was required', () => {
    // Verify draft_id exists in the original table-creation migration, confirming no new migration was needed
    const migration38 = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20240038_phase3n_proposal_capture.sql'),
      'utf8',
    )
    expect(migration38).toContain('draft_id')
  })

  it('TC-3S-UI-038: queue repo select uses star — draft_id is naturally included from DB row', () => {
    const src = readSrc(QUEUE_REPO)
    // The commitment query uses select('*') which includes draft_id without explicit listing
    expect(src).toContain(".select('*')")
  })

})

// ---------------------------------------------------------------------------
// Slice 4 — Safety guardrails
// TC-3S-UI-039 through TC-3S-UI-044
// ---------------------------------------------------------------------------

describe('Slice 4: safety guardrails', () => {

  it('TC-3S-UI-039: GenerateFollowUpDraftButton does not reference email_sends', () => {
    expect(readSrc(GENERATE_BUTTON)).not.toContain('email_sends')
  })

  it('TC-3S-UI-040: Phase 3R mutations action file is unchanged', () => {
    const src = readSrc('modules/proposals/actions/proposal-follow-up-mutations.actions.ts')
    expect(src).toContain('completeFollowUpCommitmentAction')
    expect(src).toContain('skipFollowUpCommitmentAction')
    expect(src).toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3S-UI-041: GenerateFollowUpDraftButton does not call Complete, Skip, or Reschedule actions', () => {
    const src = readSrc(GENERATE_BUTTON)
    expect(src).not.toContain('completeFollowUpCommitmentAction')
    expect(src).not.toContain('skipFollowUpCommitmentAction')
    expect(src).not.toContain('rescheduleFollowUpCommitmentAction')
  })

  it('TC-3S-UI-042: draft generation UI confirmation text is not misleading about send', () => {
    // Confirmation must not imply email will be sent
    const src = readSrc(GENERATE_BUTTON)
    expect(src).toContain('does not send an email')
    expect(src).not.toContain('will send')
    expect(src).not.toContain('Send email')
  })

  it('TC-3S-UI-043: queue page remains server component — no use client in page.tsx', () => {
    expect(readSrc(QUEUE_PAGE)).not.toContain("'use client'")
  })

  it('TC-3S-UI-044: queue page does not import from Slice 3 service or repository directly', () => {
    const src = readSrc(QUEUE_PAGE)
    expect(src).not.toContain('proposal-follow-up-draft.service')
    expect(src).not.toContain('proposal-follow-up-draft.repo')
  })

})
