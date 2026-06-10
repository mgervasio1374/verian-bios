// Manual Campaign Mode — per-assignment auto-approve-first-touch flag
// TC-AAPT-01 through TC-AAPT-05
//
// Behavioral: classifyDraftReadyItem with the new flag.
// Source-read: router wiring, service/repo persistence, safety guards.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyDraftReadyItem } from '@/modules/campaign-sequence/services/campaign-approval-router.service'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const ROUTER  = 'modules/campaign-sequence/services/campaign-approval-router.service.ts'
const SERVICE = 'modules/messaging/services/campaign-assignment.service.ts'
const TYPES   = 'modules/messaging/types/campaign-assignment.types.ts'

// ---------------------------------------------------------------------------
// TC-AAPT-01: classifyDraftReadyItem — step 1 + flag (behavioral)
// ---------------------------------------------------------------------------

describe('TC-AAPT-01: classifyDraftReadyItem step-1 behaviour with autoApproveFirstTouch (behavioral)', () => {
  it('step 1, flag=true  -> auto_approve', () => {
    expect(classifyDraftReadyItem(1, false, true)).toBe('auto_approve')
  })

  it('step 1, flag=false -> requires_approval (default OFF)', () => {
    expect(classifyDraftReadyItem(1, false, false)).toBe('requires_approval')
  })

  it('step 1, flag=true, gated=true -> auto_approve (gating irrelevant for step 1)', () => {
    expect(classifyDraftReadyItem(1, true, true)).toBe('auto_approve')
  })

  it('step 1, flag omitted -> requires_approval (default preserves existing behavior)', () => {
    expect(classifyDraftReadyItem(1, false)).toBe('requires_approval')
  })
})

// ---------------------------------------------------------------------------
// TC-AAPT-02: classifyDraftReadyItem — steps >= 2 are unchanged (behavioral)
// ---------------------------------------------------------------------------

describe('TC-AAPT-02: classifyDraftReadyItem steps >= 2 unchanged by flag (behavioral)', () => {
  it('step 2, gated=true,  flag=true  -> auto_approve (gating drives step 2)', () => {
    expect(classifyDraftReadyItem(2, true, true)).toBe('auto_approve')
  })

  it('step 2, gated=false, flag=true  -> hold (flag has no effect on step 2)', () => {
    expect(classifyDraftReadyItem(2, false, true)).toBe('hold')
  })

  it('step 2, gated=true,  flag=false -> auto_approve', () => {
    expect(classifyDraftReadyItem(2, true, false)).toBe('auto_approve')
  })

  it('step 3, gated=false, flag=true  -> hold', () => {
    expect(classifyDraftReadyItem(3, false, true)).toBe('hold')
  })

  it('step 5, gated=true,  flag=true  -> auto_approve', () => {
    expect(classifyDraftReadyItem(5, true, true)).toBe('auto_approve')
  })
})

// ---------------------------------------------------------------------------
// TC-AAPT-03: router loads assignment for step 1 to read the flag (source-read)
// ---------------------------------------------------------------------------

describe('TC-AAPT-03: router loads assignment for step 1 to read auto_approve_first_touch (source-read)', () => {
  const router = read(ROUTER)

  it('imports getAssignmentById', () => {
    expect(router).toContain('getAssignmentById')
    expect(router).toContain('campaign-assignment.repo')
  })

  it('reads auto_approve_first_touch from the loaded assignment', () => {
    expect(router).toContain('auto_approve_first_touch')
  })

  it('loads assignment only when step_number === 1 (not for step >= 2)', () => {
    const loadIdx  = router.indexOf('auto_approve_first_touch')
    expect(loadIdx).toBeGreaterThan(-1)
    const preamble = router.slice(Math.max(0, loadIdx - 300), loadIdx)
    expect(preamble).toContain('step_number === 1')
  })

  it('passes autoApproveFirstTouch as 3rd arg to classifyDraftReadyItem', () => {
    const classifyIdx = router.indexOf('classifyDraftReadyItem(step.step_number, gated, autoApproveFirstTouch)')
    expect(classifyIdx).toBeGreaterThan(-1)
  })
})

// ---------------------------------------------------------------------------
// TC-AAPT-04: flagged step-1 takes auto path (not queued for human approval)
// ---------------------------------------------------------------------------

describe('TC-AAPT-04: a flagged step-1 item flows through the auto_approve branch (source-read)', () => {
  const router = read(ROUTER)

  it('auto_approve branch uses campaign_auto_send (not campaign_manual_first_touch)', () => {
    // When auto_approve is the classification, the code reaches the auto branch.
    // The auto branch must NOT use campaign_manual_first_touch (that would wrongly
    // trigger the on-approval-approved first-touch handler).
    const autoSendIdx  = router.indexOf("'campaign_auto_send'")
    const manualIdx    = router.indexOf("'campaign_manual_first_touch'")
    // campaign_auto_send must appear in the file
    expect(autoSendIdx).toBeGreaterThan(-1)
    // campaign_manual_first_touch must only appear in the requires_approval branch (before auto branch)
    expect(manualIdx).toBeGreaterThan(-1)
    expect(manualIdx).toBeLessThan(autoSendIdx)
  })

  it('auto_approve branch does NOT land item at awaiting_approval', () => {
    // Only the requires_approval branch transitions to awaiting_approval
    const awaitIdx   = router.indexOf("'awaiting_approval'")
    const autoSendIdx = router.indexOf("'campaign_auto_send'")
    expect(awaitIdx).toBeGreaterThan(-1)
    expect(autoSendIdx).toBeGreaterThan(-1)
    // awaiting_approval must appear BEFORE campaign_auto_send (in the requires_approval branch)
    expect(awaitIdx).toBeLessThan(autoSendIdx)
  })

  it('auto_approve branch lands item at approved and marks draft approved', () => {
    const autoSendIdx = router.indexOf("'campaign_auto_send'")
    const block       = router.slice(autoSendIdx, autoSendIdx + 1400)
    expect(block).toContain("status:          'approved'")
    expect(block).toContain("'approved'")
  })

  it('audit reason is bulk_preapproved_first_touch for step 1 (not hybrid_auto_send_gated)', () => {
    expect(router).toContain('bulk_preapproved_first_touch')
    // hybrid_auto_send_gated still present for step >= 2 path
    expect(router).toContain('hybrid_auto_send_gated')
    // The conditional is driven by step_number === 1
    const condIdx = router.indexOf('bulk_preapproved_first_touch')
    const preamble = router.slice(Math.max(0, condIdx - 150), condIdx)
    expect(preamble).toContain('step_number === 1')
  })
})

// ---------------------------------------------------------------------------
// TC-AAPT-05: service and types accept and persist autoApproveFirstTouch
// ---------------------------------------------------------------------------

describe('TC-AAPT-05: service and types wire autoApproveFirstTouch through to the insert (source-read)', () => {
  const service = read(SERVICE)
  const types   = read(TYPES)

  it('CreateAssignmentInput includes autoApproveFirstTouch as optional boolean', () => {
    expect(types).toContain('autoApproveFirstTouch')
    expect(types).toContain('boolean')
  })

  it('CampaignAssignment domain type includes auto_approve_first_touch', () => {
    expect(types).toContain('auto_approve_first_touch')
  })

  it('service inserts auto_approve_first_touch with fallback to false', () => {
    expect(service).toContain('auto_approve_first_touch')
    const insertIdx = service.indexOf('auto_approve_first_touch')
    const line      = service.slice(insertIdx, insertIdx + 80)
    expect(line).toContain('false')
  })

  it('default is OFF — false is the fallback so existing calls are unchanged', () => {
    const insertIdx = service.indexOf('auto_approve_first_touch')
    const line      = service.slice(insertIdx, insertIdx + 80)
    // Must use ?? false (not ?? true) so default is off
    expect(line).toContain('?? false')
  })
})
