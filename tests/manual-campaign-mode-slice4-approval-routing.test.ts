// Manual Campaign Mode — Slice 4: hybrid approval routing
// Behavioral tests for pure helpers (DB-free). Source-read tests for wiring and safety.
// TC-MM4-01 through TC-MM4-08

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  isAssignmentGated,
  classifyDraftReadyItem,
} from '@/modules/campaign-sequence/services/campaign-approval-router.service'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// TC-MM4-01: isAssignmentGated
// ---------------------------------------------------------------------------

describe('TC-MM4-01: isAssignmentGated returns true only for approved/scheduled/sent', () => {
  it('approved -> true', () => {
    expect(isAssignmentGated('approved')).toBe(true)
  })

  it('scheduled -> true', () => {
    expect(isAssignmentGated('scheduled')).toBe(true)
  })

  it('sent -> true', () => {
    expect(isAssignmentGated('sent')).toBe(true)
  })

  it('null -> false', () => {
    expect(isAssignmentGated(null)).toBe(false)
  })

  it('planned -> false', () => {
    expect(isAssignmentGated('planned')).toBe(false)
  })

  it('draft_needed -> false', () => {
    expect(isAssignmentGated('draft_needed')).toBe(false)
  })

  it('draft_ready -> false', () => {
    expect(isAssignmentGated('draft_ready')).toBe(false)
  })

  it('awaiting_approval -> false', () => {
    expect(isAssignmentGated('awaiting_approval')).toBe(false)
  })

  it('blocked -> false', () => {
    expect(isAssignmentGated('blocked')).toBe(false)
  })

  it('failed -> false', () => {
    expect(isAssignmentGated('failed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-02: classifyDraftReadyItem
// ---------------------------------------------------------------------------

describe('TC-MM4-02: classifyDraftReadyItem routes step1 to approval, step2+ by gating', () => {
  it('step 1, gated=false -> requires_approval', () => {
    expect(classifyDraftReadyItem(1, false)).toBe('requires_approval')
  })

  it('step 1, gated=true -> requires_approval (gating irrelevant for step 1)', () => {
    expect(classifyDraftReadyItem(1, true)).toBe('requires_approval')
  })

  it('step 2, gated=true -> auto_approve', () => {
    expect(classifyDraftReadyItem(2, true)).toBe('auto_approve')
  })

  it('step 2, gated=false -> hold', () => {
    expect(classifyDraftReadyItem(2, false)).toBe('hold')
  })

  it('step 3, gated=true -> auto_approve', () => {
    expect(classifyDraftReadyItem(3, true)).toBe('auto_approve')
  })

  it('step 3, gated=false -> hold', () => {
    expect(classifyDraftReadyItem(3, false)).toBe('hold')
  })

  it('step 5, gated=true -> auto_approve', () => {
    expect(classifyDraftReadyItem(5, true)).toBe('auto_approve')
  })

  it('step 5, gated=false -> hold', () => {
    expect(classifyDraftReadyItem(5, false)).toBe('hold')
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-03: processCampaignApprovals registered + cron trigger + retries:0
// ---------------------------------------------------------------------------

describe('TC-MM4-03: processCampaignApprovals registration and cron trigger (source-read)', () => {
  const indexSrc = read('inngest/index.ts')
  const fnSrc    = read('inngest/functions/process-campaign-approvals.ts')

  it('processCampaignApprovals is imported in inngest/index.ts', () => {
    expect(indexSrc).toContain('processCampaignApprovals')
  })

  it('processCampaignApprovals is in the inngestFunctions array', () => {
    const arrayBody = indexSrc.slice(indexSrc.indexOf('export const inngestFunctions'))
    expect(arrayBody).toContain('processCampaignApprovals')
  })

  it('index.ts imports from process-campaign-approvals', () => {
    expect(indexSrc).toContain('process-campaign-approvals')
  })

  it('function uses a cron trigger', () => {
    expect(fnSrc).toContain('cron:')
    expect(fnSrc).toContain('*/15 * * * *')
  })

  it("function id is 'process-campaign-approvals'", () => {
    expect(fnSrc).toContain("id: 'process-campaign-approvals'")
  })

  it('retries: 0', () => {
    expect(fnSrc).toContain('retries: 0')
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-04: cron reads CAMPAIGN_APPROVAL_ROUTING_ENABLED and short-circuits per tenant
// ---------------------------------------------------------------------------

describe('TC-MM4-04: cron reads CAMPAIGN_APPROVAL_ROUTING_ENABLED; types.agent.ts defines the key (source-read)', () => {
  const fnSrc = read('inngest/functions/process-campaign-approvals.ts')

  it('imports getBooleanControl', () => {
    expect(fnSrc).toContain('getBooleanControl')
  })

  it('references CAMPAIGN_APPROVAL_ROUTING_ENABLED', () => {
    expect(fnSrc).toContain('CAMPAIGN_APPROVAL_ROUTING_ENABLED')
  })

  it('imports SystemControlKey', () => {
    expect(fnSrc).toContain('SystemControlKey')
  })

  it('skips tenant when routing is disabled (contains routing_disabled string)', () => {
    expect(fnSrc).toContain('routing_disabled')
  })

  it('types.agent.ts defines CAMPAIGN_APPROVAL_ROUTING_ENABLED', () => {
    const typesSrc = read('modules/intelligence/types.agent.ts')
    expect(typesSrc).toContain('CAMPAIGN_APPROVAL_ROUTING_ENABLED')
    expect(typesSrc).toContain("'campaign_approval_routing_enabled'")
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-05: safety — no resend/send imports; no sendApprovedDraft; no EMAIL_SENDING_ENABLED write;
//            no 'scheduled'/'sent' item transitions; no 'sent' draft transitions
// ---------------------------------------------------------------------------

describe('TC-MM4-05: safety invariants across router, cron, and resolution service (source-read)', () => {
  const routerSrc     = read('modules/campaign-sequence/services/campaign-approval-router.service.ts')
  const cronSrc       = read('inngest/functions/process-campaign-approvals.ts')
  const resolutionSrc = read('modules/campaign-sequence/services/campaign-approval-resolution.service.ts')

  // ---- No resend / email-send / sendApprovedDraft ----

  it('router does not import resend', () => {
    expect(routerSrc).not.toMatch(/from.*resend/i)
  })

  it('router does not import email-send.service', () => {
    expect(routerSrc).not.toContain('email-send.service')
  })

  it('router does not reference sendApprovedDraft', () => {
    expect(routerSrc).not.toContain('sendApprovedDraft')
  })

  it('cron does not import resend', () => {
    expect(cronSrc).not.toMatch(/from.*resend/i)
  })

  it('cron does not import email-send.service', () => {
    expect(cronSrc).not.toContain('email-send.service')
  })

  it('cron does not reference sendApprovedDraft', () => {
    expect(cronSrc).not.toContain('sendApprovedDraft')
  })

  it('resolution service does not import resend', () => {
    expect(resolutionSrc).not.toMatch(/from.*resend/i)
  })

  it('resolution service does not import email-send.service', () => {
    expect(resolutionSrc).not.toContain('email-send.service')
  })

  it('resolution service does not reference sendApprovedDraft', () => {
    expect(resolutionSrc).not.toContain('sendApprovedDraft')
  })

  // ---- No EMAIL_SENDING_ENABLED write ----

  it('router does not reference EMAIL_SENDING_ENABLED', () => {
    expect(routerSrc).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('cron does not reference EMAIL_SENDING_ENABLED', () => {
    expect(cronSrc).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('resolution service does not reference EMAIL_SENDING_ENABLED', () => {
    expect(resolutionSrc).not.toContain('EMAIL_SENDING_ENABLED')
  })

  // ---- No item transition to 'scheduled' or 'sent' ----
  // Note: isAssignmentGated in the router uses === comparisons with 'scheduled'/'sent';
  // these check "comma + space + quote" patterns which only appear as updateScheduleItemStatus args.

  it('router does not transition a schedule item to scheduled', () => {
    // updateScheduleItemStatus 4th arg pattern: ", 'scheduled'"
    expect(routerSrc).not.toContain(", 'scheduled'")
  })

  it('router does not transition a schedule item to sent', () => {
    // updateScheduleItemStatus 4th arg pattern: ", 'sent'"
    expect(routerSrc).not.toContain(", 'sent'")
  })

  it('cron does not reference scheduled or sent as schedule item target statuses', () => {
    expect(cronSrc).not.toContain("'scheduled'")
    expect(cronSrc).not.toContain("'sent'")
  })

  it('resolution service does not transition a schedule item to scheduled or sent', () => {
    expect(resolutionSrc).not.toContain("'scheduled'")
    // resolution service only transitions to 'approved' and 'skipped'
    expect(resolutionSrc).not.toContain(", 'sent'")
  })

  // ---- No draft transition to 'sent' ----

  it('router does not set a draft to status sent', () => {
    expect(routerSrc).not.toContain("status: 'sent'")
    expect(routerSrc).not.toContain("status:          'sent'")
  })

  it('resolution service does not set a draft to status sent', () => {
    expect(resolutionSrc).not.toContain("status: 'sent'")
    expect(resolutionSrc).not.toContain("status:          'sent'")
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-06: first-touch path wiring
// ---------------------------------------------------------------------------

describe('TC-MM4-06: first-touch path creates pending approval_request and lands item at awaiting_approval (source-read)', () => {
  const routerSrc     = read('modules/campaign-sequence/services/campaign-approval-router.service.ts')
  const resolutionSrc = read('modules/campaign-sequence/services/campaign-approval-resolution.service.ts')

  it("router contains requestType 'campaign_manual_first_touch'", () => {
    expect(routerSrc).toContain("'campaign_manual_first_touch'")
  })

  it("router lands item at 'awaiting_approval'", () => {
    expect(routerSrc).toContain("'awaiting_approval'")
  })

  it("router links approval_request_id when advancing to awaiting_approval", () => {
    const awaitIdx = routerSrc.indexOf("'awaiting_approval'")
    expect(awaitIdx).toBeGreaterThan(-1)
    // The updateScheduleItemStatus call that targets awaiting_approval must include approval_request_id
    const callSlice = routerSrc.slice(
      routerSrc.lastIndexOf('updateScheduleItemStatus', awaitIdx),
      awaitIdx + 150,
    )
    expect(callSlice).toContain('approval_request_id')
  })

  it('router does NOT mark the draft approved in the first-touch branch', () => {
    // updateDraftStatus in router only appears AFTER 'campaign_auto_send' (in the auto_approve branch)
    // Verify: updateDraftStatus index > campaign_auto_send index
    const autoSendIdx       = routerSrc.indexOf("'campaign_auto_send'")
    const updateDraftIdx    = routerSrc.indexOf('updateDraftStatus')
    expect(autoSendIdx).toBeGreaterThan(-1)
    expect(updateDraftIdx).toBeGreaterThan(-1)
    expect(updateDraftIdx).toBeGreaterThan(autoSendIdx)
  })

  it('router links approval to draft via linkApprovalToEmailDraft in first-touch branch', () => {
    const ftIdx      = routerSrc.indexOf("'campaign_manual_first_touch'")
    const linkIdx    = routerSrc.indexOf('linkApprovalToEmailDraft', ftIdx)
    const autoIdx    = routerSrc.indexOf("'campaign_auto_send'", ftIdx)
    // linkApprovalToEmailDraft must appear between the first-touch section and auto_send section
    expect(linkIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeLessThan(autoIdx)
  })

  it('resolution service sets draft to approved when first touch is approved (human path)', () => {
    expect(resolutionSrc).toContain('handleCampaignFirstTouchApproved')
    expect(resolutionSrc).toContain("status:          'approved'")
  })

  it('resolution service imports updateScheduleItemStatus from schedule-item service', () => {
    expect(resolutionSrc).toContain('updateScheduleItemStatus')
    expect(resolutionSrc).toContain('campaign-schedule-item.service')
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-07: auto-approve path wiring
// ---------------------------------------------------------------------------

describe('TC-MM4-07: auto-approve resolves via approvalRepo directly, sets draft approved, lands item at approved (source-read)', () => {
  const routerSrc = read('modules/campaign-sequence/services/campaign-approval-router.service.ts')

  it("router contains requestType 'campaign_auto_send'", () => {
    expect(routerSrc).toContain("'campaign_auto_send'")
  })

  it('router imports from approval.repo (resolves directly, not via approveRequest service)', () => {
    expect(routerSrc).toContain('approval.repo')
    expect(routerSrc).not.toContain('approval.service')
  })

  it('router calls resolveApprovalRequest (direct repo call)', () => {
    expect(routerSrc).toContain('resolveApprovalRequest')
  })

  it('router does NOT call approveRequest (the service function that emits events)', () => {
    expect(routerSrc).not.toContain('approveRequest(')
  })

  it('router decisionData contains auto_approved: true and hybrid_auto_send_gated reason', () => {
    expect(routerSrc).toContain('auto_approved: true')
    expect(routerSrc).toContain('hybrid_auto_send_gated')
  })

  it("router sets draft status to 'approved' in auto_approve branch", () => {
    expect(routerSrc).toContain("status:          'approved'")
  })

  it("router lands item at 'approved' in auto_approve branch", () => {
    // The 'approved' target for updateScheduleItemStatus appears after 'campaign_auto_send'
    const autoSendIdx  = routerSrc.indexOf("'campaign_auto_send'")
    const itemApproved = routerSrc.indexOf("'approved'", autoSendIdx)
    expect(itemApproved).toBeGreaterThan(autoSendIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-MM4-08: approval resolution handler wiring + listDraftReadyItems filters
// ---------------------------------------------------------------------------

describe('TC-MM4-08: approval handlers dispatch by requestType; listDraftReadyItems filters (source-read)', () => {
  const handlerSrc    = read('inngest/functions/on-approval-decided.ts')
  const resolutionSrc = read('modules/campaign-sequence/services/campaign-approval-resolution.service.ts')
  const repoSrc       = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')

  it("on-approval-decided.ts references 'campaign_manual_first_touch'", () => {
    expect(handlerSrc).toContain("'campaign_manual_first_touch'")
  })

  it('on-approval-decided.ts imports handleCampaignFirstTouchApproved', () => {
    expect(handlerSrc).toContain('handleCampaignFirstTouchApproved')
    expect(handlerSrc).toContain('campaign-approval-resolution.service')
  })

  it('on-approval-decided.ts imports handleCampaignFirstTouchRejected', () => {
    expect(handlerSrc).toContain('handleCampaignFirstTouchRejected')
  })

  it('onApprovalApproved handler dispatches to handleCampaignFirstTouchApproved', () => {
    const approvedFnBody = handlerSrc.slice(
      handlerSrc.indexOf("id: 'on-approval-approved'"),
      handlerSrc.indexOf("id: 'on-approval-rejected'"),
    )
    expect(approvedFnBody).toContain('handleCampaignFirstTouchApproved')
  })

  it('onApprovalRejected handler dispatches to handleCampaignFirstTouchRejected', () => {
    const rejectedFnBody = handlerSrc.slice(
      handlerSrc.indexOf("id: 'on-approval-rejected'"),
    )
    expect(rejectedFnBody).toContain('handleCampaignFirstTouchRejected')
  })

  it("resolution service sets item to 'approved' when first touch approved", () => {
    const approvedFn = resolutionSrc.slice(
      resolutionSrc.indexOf('handleCampaignFirstTouchApproved'),
      resolutionSrc.indexOf('handleCampaignFirstTouchRejected'),
    )
    expect(approvedFn).toContain("'approved'")
  })

  it("resolution service sets item to 'skipped' when first touch rejected", () => {
    const rejectedFn = resolutionSrc.slice(
      resolutionSrc.indexOf('handleCampaignFirstTouchRejected'),
    )
    expect(rejectedFn).toContain("'skipped'")
  })

  it("listDraftReadyItems filters status = 'draft_ready'", () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listDraftReadyItems'))
    expect(fnBody).toContain("'draft_ready'")
  })

  it("listDraftReadyItems filters approval_request_id IS NULL", () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listDraftReadyItems'))
    expect(fnBody).toContain(".is('approval_request_id', null)")
  })

  it("listDraftReadyItems filters email_draft_id IS NOT NULL", () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listDraftReadyItems'))
    expect(fnBody).toContain(".not('email_draft_id', 'is', null)")
  })

  it("getFirstTouchItemForAssignment looks up the step with step_number = 1", () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('getFirstTouchItemForAssignment'))
    expect(fnBody).toContain('step_number')
    expect(fnBody).toContain('1')
  })
})
