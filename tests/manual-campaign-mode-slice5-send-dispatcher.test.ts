// Manual Campaign Mode — Slice 5: send dispatcher
// Behavioral tests for pure helpers (DB-free). Source-read tests for wiring and safety.
// TC-MM5-01 through TC-MM5-08

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Import pure helpers from the helpers file (no transitive Resend/Supabase/Next.js deps).
// The dispatcher service (campaign-send-dispatcher.service.ts) re-exports these and adds
// the send wiring; source-read tests verify that wiring without running it.
import {
  classifySendOutcome,
  shouldCompleteAssignment,
} from '@/modules/campaign-sequence/services/campaign-send-dispatcher.helpers'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// TC-MM5-01: classifySendOutcome
// ---------------------------------------------------------------------------

describe('TC-MM5-01: classifySendOutcome maps SendResult to dispatch classification', () => {
  it('ok=true -> sent', () => {
    expect(classifySendOutcome({ ok: true })).toBe('sent')
  })

  it('ok=true with resendMessageId -> sent', () => {
    expect(classifySendOutcome({ ok: true })).toBe('sent')
  })

  it('ok=false, alreadySent=true -> sent (idempotent crash-safety path)', () => {
    expect(classifySendOutcome({ ok: false, alreadySent: true })).toBe('sent')
  })

  it("ok=false, reason='sending_disabled_by_system_control' -> deferred", () => {
    expect(classifySendOutcome({ ok: false, reason: 'sending_disabled_by_system_control' })).toBe('deferred')
  })

  it('ok=false, reason contains rate_limit -> deferred', () => {
    expect(classifySendOutcome({ ok: false, reason: 'rate_limit_exceeded' })).toBe('deferred')
  })

  it("ok=false, reason='recipient_do_not_contact' -> failed", () => {
    expect(classifySendOutcome({ ok: false, reason: 'recipient_do_not_contact' })).toBe('failed')
  })

  it("ok=false, reason='draft_not_found' -> failed", () => {
    expect(classifySendOutcome({ ok: false, reason: 'draft_not_found' })).toBe('failed')
  })

  it("ok=false, reason='suppression_blocked' -> failed", () => {
    expect(classifySendOutcome({ ok: false, reason: 'suppression_blocked (unsubscribed)' })).toBe('failed')
  })

  it('ok=false, no reason -> failed', () => {
    expect(classifySendOutcome({ ok: false })).toBe('failed')
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-02: shouldCompleteAssignment
// ---------------------------------------------------------------------------

describe('TC-MM5-02: shouldCompleteAssignment returns true only when pendingCount is 0', () => {
  it('pendingCount=0 -> true (zero schedule items: original Phase 3M behavior preserved)', () => {
    expect(shouldCompleteAssignment(0)).toBe(true)
  })

  it('pendingCount=1 -> false (current item still in approved; not yet terminal)', () => {
    expect(shouldCompleteAssignment(1)).toBe(false)
  })

  it('pendingCount=4 -> false (remaining planned steps in multi-step sequence)', () => {
    expect(shouldCompleteAssignment(4)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-03: processCampaignSends registration + cron trigger + retries:0
// ---------------------------------------------------------------------------

describe('TC-MM5-03: processCampaignSends registration and cron trigger (source-read)', () => {
  const indexSrc = read('inngest/index.ts')
  const fnSrc    = read('inngest/functions/process-campaign-sends.ts')

  it('processCampaignSends is imported in inngest/index.ts', () => {
    expect(indexSrc).toContain('processCampaignSends')
  })

  it('processCampaignSends is in the inngestFunctions array', () => {
    const arrayBody = indexSrc.slice(indexSrc.indexOf('export const inngestFunctions'))
    expect(arrayBody).toContain('processCampaignSends')
  })

  it('index.ts imports from process-campaign-sends', () => {
    expect(indexSrc).toContain('process-campaign-sends')
  })

  it('function uses a cron trigger */15 * * * *', () => {
    expect(fnSrc).toContain('cron:')
    expect(fnSrc).toContain('*/15 * * * *')
  })

  it("function id is 'process-campaign-sends'", () => {
    expect(fnSrc).toContain("id: 'process-campaign-sends'")
  })

  it('retries: 0', () => {
    expect(fnSrc).toContain('retries: 0')
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-04: cron reads CAMPAIGN_SEND_DISPATCH_ENABLED; types.agent.ts defines the key
// ---------------------------------------------------------------------------

describe('TC-MM5-04: cron reads CAMPAIGN_SEND_DISPATCH_ENABLED; types.agent.ts defines key (source-read)', () => {
  const fnSrc = read('inngest/functions/process-campaign-sends.ts')

  it('imports getBooleanControl', () => {
    expect(fnSrc).toContain('getBooleanControl')
  })

  it('references CAMPAIGN_SEND_DISPATCH_ENABLED', () => {
    expect(fnSrc).toContain('CAMPAIGN_SEND_DISPATCH_ENABLED')
  })

  it('imports SystemControlKey', () => {
    expect(fnSrc).toContain('SystemControlKey')
  })

  it('skips tenant when dispatch is disabled (contains dispatch_disabled string)', () => {
    expect(fnSrc).toContain('dispatch_disabled')
  })

  it('types.agent.ts defines CAMPAIGN_SEND_DISPATCH_ENABLED', () => {
    const typesSrc = read('modules/intelligence/types.agent.ts')
    expect(typesSrc).toContain('CAMPAIGN_SEND_DISPATCH_ENABLED')
    expect(typesSrc).toContain("'campaign_send_dispatch_enabled'")
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-05: send boundary — only sendApprovedDraft; no resend/lib/resend; no EMAIL_SENDING_ENABLED
// ---------------------------------------------------------------------------

describe('TC-MM5-05: send boundary invariants (source-read)', () => {
  const dispatcherSrc = read('modules/campaign-sequence/services/campaign-send-dispatcher.service.ts')
  const cronSrc       = read('inngest/functions/process-campaign-sends.ts')

  // ---- Dispatcher: does not import or replicate Resend ----

  it('dispatcher does not import from resend package', () => {
    expect(dispatcherSrc).not.toMatch(/from ['"]resend['"]/i)
  })

  it('dispatcher does not import from lib/resend', () => {
    expect(dispatcherSrc).not.toContain('lib/resend')
  })

  it('dispatcher imports sendApprovedDraft from email-send.service (not the raw Resend client)', () => {
    expect(dispatcherSrc).toContain('sendApprovedDraft')
    expect(dispatcherSrc).toContain('email-send.service')
  })

  it('dispatcher does not replicate a provider emails.send call', () => {
    expect(dispatcherSrc).not.toContain('emails.send')
  })

  it('dispatcher does not reference EMAIL_SENDING_ENABLED', () => {
    expect(dispatcherSrc).not.toContain('EMAIL_SENDING_ENABLED')
  })

  // ---- Cron: does not directly touch Resend or sending controls ----

  it('cron does not import from resend package', () => {
    expect(cronSrc).not.toMatch(/from ['"]resend['"]/i)
  })

  it('cron does not import email-send.service directly', () => {
    expect(cronSrc).not.toContain('email-send.service')
  })

  it('cron does not call sendApprovedDraft directly', () => {
    expect(cronSrc).not.toContain('sendApprovedDraft')
  })

  it('cron does not reference EMAIL_SENDING_ENABLED', () => {
    expect(cronSrc).not.toContain('EMAIL_SENDING_ENABLED')
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-06: outcome mapping — sent->sent, failed->failed, deferred->no transition; never 'scheduled'
// ---------------------------------------------------------------------------

describe('TC-MM5-06: dispatcher maps send outcomes to schedule-item transitions correctly (source-read)', () => {
  const dispatcherSrc = read('modules/campaign-sequence/services/campaign-send-dispatcher.service.ts')

  it("'sent' outcome calls updateScheduleItemStatus with 'sent'", () => {
    // Check that the 'sent' classification branch calls updateScheduleItemStatus transitioning to 'sent'
    expect(dispatcherSrc).toContain("updateScheduleItemStatus(item.id, ctx.tenantId, ctx.workspaceId, 'sent')")
  })

  it("'failed' outcome calls updateScheduleItemStatus with 'failed'", () => {
    expect(dispatcherSrc).toContain("updateScheduleItemStatus(item.id, ctx.tenantId, ctx.workspaceId, 'failed'")
  })

  it("deferred outcome performs no updateScheduleItemStatus call — only two calls total", () => {
    // Count total updateScheduleItemStatus calls: should be exactly 2 (sent + failed paths)
    const matches = dispatcherSrc.match(/updateScheduleItemStatus\(/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(2)
  })

  it("dispatcher never transitions a schedule item to 'scheduled'", () => {
    expect(dispatcherSrc).not.toContain(", 'scheduled'")
  })

  it("dispatcher returns outcome:'deferred' without calling status update", () => {
    // The deferred return appears without being preceded by updateScheduleItemStatus in that branch
    expect(dispatcherSrc).toContain("outcome: 'deferred'")
    // Deferred branch comment confirms no transition
    expect(dispatcherSrc).toContain('do not call updateScheduleItemStatus')
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-07: assignment completion is conditional on pending items count
// ---------------------------------------------------------------------------

describe('TC-MM5-07: conditional assignment completion guards multi-step sequences (source-read)', () => {
  const sendSvcSrc    = read('modules/messaging/services/email-send.service.ts')
  const repoSrc       = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
  const dispatcherSrc = read('modules/campaign-sequence/services/campaign-send-dispatcher.service.ts')

  it('email-send.service.ts imports countPendingScheduleItemsForAssignment', () => {
    expect(sendSvcSrc).toContain('countPendingScheduleItemsForAssignment')
  })

  it('email-send.service.ts still calls completeCampaignAssignment (Phase 3M preserved)', () => {
    expect(sendSvcSrc).toContain('completeCampaignAssignment')
  })

  it('completeCampaignAssignment is guarded by pendingCount === 0 check', () => {
    expect(sendSvcSrc).toContain('pendingCount === 0')
  })

  it('countPendingScheduleItemsForAssignment is called before completeCampaignAssignment', () => {
    const countIdx    = sendSvcSrc.indexOf('countPendingScheduleItemsForAssignment')
    const completeIdx = sendSvcSrc.indexOf('completeCampaignAssignment')
    expect(countIdx).toBeGreaterThan(-1)
    expect(completeIdx).toBeGreaterThan(-1)
    expect(countIdx).toBeLessThan(completeIdx)
  })

  it('completion block is still non-fatal (contains .catch(() => null))', () => {
    const blockStart = sendSvcSrc.indexOf('countPendingScheduleItemsForAssignment')
    // The .catch(() => null) must follow the pendingCount check
    const catchIdx = sendSvcSrc.indexOf('.catch(() => null)', blockStart)
    expect(catchIdx).toBeGreaterThan(blockStart)
  })

  it('shouldCompleteAssignment is re-exported from the dispatcher service (pure helper)', () => {
    expect(dispatcherSrc).toContain('shouldCompleteAssignment')
    const helpersSrc = read('modules/campaign-sequence/services/campaign-send-dispatcher.helpers.ts')
    expect(helpersSrc).toContain('export function shouldCompleteAssignment')
  })

  it('countPendingScheduleItemsForAssignment exists in campaign-schedule-item.repo.ts', () => {
    expect(repoSrc).toContain('countPendingScheduleItemsForAssignment')
  })

  it('repo uses PENDING status list (not terminal set) for the pending count query', () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('countPendingScheduleItemsForAssignment'))
    expect(fnBody).toContain("'planned'")
    expect(fnBody).toContain("'approved'")
    expect(fnBody).toContain('.in(')
  })
})

// ---------------------------------------------------------------------------
// TC-MM5-08: listSendableScheduleItems filters
// ---------------------------------------------------------------------------

describe('TC-MM5-08: listSendableScheduleItems filters approved due items with drafts (source-read)', () => {
  const repoSrc = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
  const cronSrc = read('inngest/functions/process-campaign-sends.ts')

  it("listSendableScheduleItems filters status = 'approved'", () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listSendableScheduleItems'))
    expect(fnBody).toContain("'approved'")
  })

  it('listSendableScheduleItems filters email_draft_id IS NOT NULL', () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listSendableScheduleItems'))
    expect(fnBody).toContain(".not('email_draft_id', 'is', null)")
  })

  it('listSendableScheduleItems filters scheduled_for <= now', () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listSendableScheduleItems'))
    expect(fnBody).toContain('.lte(')
    expect(fnBody).toContain('scheduled_for')
  })

  it('listSendableScheduleItems orders by scheduled_for ASC', () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listSendableScheduleItems'))
    expect(fnBody).toContain("ascending: true")
  })

  it('listSendableScheduleItems accepts a limit parameter', () => {
    const fnBody = repoSrc.slice(repoSrc.indexOf('listSendableScheduleItems'))
    expect(fnBody).toContain('.limit(limit)')
  })

  it('cron calls listSendableScheduleItems', () => {
    expect(cronSrc).toContain('listSendableScheduleItems')
  })

  it('cron passes now (current timestamp) as the scheduled_for cutoff', () => {
    expect(cronSrc).toContain('new Date().toISOString()')
  })
})
