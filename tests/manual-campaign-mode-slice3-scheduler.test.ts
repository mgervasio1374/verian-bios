// Manual Campaign Mode — Slice 3: campaign schedule scheduler
// Behavioral tests for pure helpers (DB-free). Source-read tests for wiring and safety.
// TC-MM3-01 through TC-MM3-07

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  isScheduleItemDue,
  isItemEligibleForPromotion,
} from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import type { CampaignScheduleItemRow } from '@/modules/campaign-sequence/types'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Record<string, unknown> = {}): CampaignScheduleItemRow {
  return {
    id:                         'item-001',
    tenant_id:                  'tenant-001',
    workspace_id:               'ws-001',
    campaign_assignment_id:     'asgn-001',
    campaign_sequence_id:       'seq-001',
    campaign_sequence_step_id:  'step-001',
    lead_id:                    'lead-001',
    contact_id:                 null,
    company_id:                 null,
    scheduled_for:              '2026-01-15T00:00:00.000Z',
    status:                     'planned',
    email_draft_id:             null,
    approval_request_id:        null,
    status_reason:              null,
    stopped_at:                 null,
    stopped_reason:             null,
    response_detected_at:       null,
    created_at:                 '2026-01-01T00:00:00.000Z',
    updated_at:                 '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as CampaignScheduleItemRow
}

const PAST = new Date('2026-06-01T00:00:00.000Z')
const FUTURE = new Date('2025-01-01T00:00:00.000Z') // scheduled_for is Jan-15-2026, so this is before it

// ---------------------------------------------------------------------------
// TC-MM3-01: isScheduleItemDue
// ---------------------------------------------------------------------------

describe('TC-MM3-01: isScheduleItemDue returns true iff status is eligible and scheduled_for <= now', () => {
  it('planned item with scheduled_for in the past → true', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'planned' })
    expect(isScheduleItemDue(item, PAST)).toBe(true)
  })

  it('draft_needed item with scheduled_for in the past → true', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'draft_needed' })
    expect(isScheduleItemDue(item, PAST)).toBe(true)
  })

  it('planned item with scheduled_for in the future → false', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'planned' })
    expect(isScheduleItemDue(item, FUTURE)).toBe(false)
  })

  it('sent item with past scheduled_for → false', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'sent' })
    expect(isScheduleItemDue(item, PAST)).toBe(false)
  })

  it('draft_ready item with past scheduled_for → false', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'draft_ready' })
    expect(isScheduleItemDue(item, PAST)).toBe(false)
  })

  it('blocked item with past scheduled_for → false', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'blocked' })
    expect(isScheduleItemDue(item, PAST)).toBe(false)
  })

  it('failed item with past scheduled_for → false', () => {
    const item = makeItem({ scheduled_for: '2026-01-15T00:00:00.000Z', status: 'failed' })
    expect(isScheduleItemDue(item, PAST)).toBe(false)
  })

  it('null scheduled_for → false', () => {
    const item = makeItem({ scheduled_for: null, status: 'planned' })
    expect(isScheduleItemDue(item, PAST)).toBe(false)
  })

  it('scheduled_for exactly equal to now boundary → true', () => {
    const now = new Date('2026-03-01T12:00:00.000Z')
    const item = makeItem({ scheduled_for: '2026-03-01T12:00:00.000Z', status: 'planned' })
    expect(isScheduleItemDue(item, now)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-02: isItemEligibleForPromotion
// ---------------------------------------------------------------------------

describe('TC-MM3-02: isItemEligibleForPromotion gates on status, email_draft_id, and assignmentStatus', () => {
  it('planned + no email_draft_id + ASSIGNED → true', () => {
    const item = makeItem({ status: 'planned', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(true)
  })

  it('draft_needed + no email_draft_id + ASSIGNED → true', () => {
    const item = makeItem({ status: 'draft_needed', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(true)
  })

  it('planned + email_draft_id set + ASSIGNED → false (idempotency)', () => {
    const item = makeItem({ status: 'planned', email_draft_id: 'draft-existing-001' })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })

  it('draft_needed + email_draft_id set + ASSIGNED → false (idempotency)', () => {
    const item = makeItem({ status: 'draft_needed', email_draft_id: 'draft-existing-001' })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })

  it('planned + no email_draft_id + PAUSED → false', () => {
    const item = makeItem({ status: 'planned', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'paused')).toBe(false)
  })

  it('planned + no email_draft_id + RETIRED → false', () => {
    const item = makeItem({ status: 'planned', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'retired')).toBe(false)
  })

  it('planned + no email_draft_id + COMPLETED → false', () => {
    const item = makeItem({ status: 'planned', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'completed')).toBe(false)
  })

  it('draft_ready + no email_draft_id + ASSIGNED → false (wrong status)', () => {
    const item = makeItem({ status: 'draft_ready', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })

  it('sent + no email_draft_id + ASSIGNED → false (terminal status)', () => {
    const item = makeItem({ status: 'sent', email_draft_id: null })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-03: processCampaignSchedule is registered in inngestFunctions with a cron trigger
// ---------------------------------------------------------------------------

describe('TC-MM3-03: processCampaignSchedule registration and cron trigger (source-read)', () => {
  const indexSrc = read('inngest/index.ts')
  const fnSrc    = read('inngest/functions/process-campaign-schedule.ts')

  it('processCampaignSchedule is imported in inngest/index.ts', () => {
    expect(indexSrc).toContain('processCampaignSchedule')
  })

  it('processCampaignSchedule is in the inngestFunctions array', () => {
    const arrayBody = indexSrc.slice(indexSrc.indexOf('export const inngestFunctions'))
    expect(arrayBody).toContain('processCampaignSchedule')
  })

  it('process-campaign-schedule.ts imports from process-campaign-schedule', () => {
    expect(indexSrc).toContain('process-campaign-schedule')
  })

  it('function uses a cron trigger', () => {
    expect(fnSrc).toContain('cron:')
    expect(fnSrc).toContain('*/15 * * * *')
  })

  it('function id is process-campaign-schedule', () => {
    expect(fnSrc).toContain("id: 'process-campaign-schedule'")
  })

  it('retries: 0', () => {
    expect(fnSrc).toContain('retries: 0')
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-04: scheduler reads CAMPAIGN_SCHEDULER_ENABLED and short-circuits per tenant
// ---------------------------------------------------------------------------

describe('TC-MM3-04: scheduler reads CAMPAIGN_SCHEDULER_ENABLED and skips disabled tenants (source-read)', () => {
  const fnSrc = read('inngest/functions/process-campaign-schedule.ts')

  it('imports getBooleanControl', () => {
    expect(fnSrc).toContain('getBooleanControl')
  })

  it('references CAMPAIGN_SCHEDULER_ENABLED', () => {
    expect(fnSrc).toContain('CAMPAIGN_SCHEDULER_ENABLED')
  })

  it('imports SystemControlKey', () => {
    expect(fnSrc).toContain('SystemControlKey')
  })

  it('types.agent.ts defines CAMPAIGN_SCHEDULER_ENABLED', () => {
    const typesSrc = read('modules/intelligence/types.agent.ts')
    expect(typesSrc).toContain('CAMPAIGN_SCHEDULER_ENABLED')
    expect(typesSrc).toContain("'campaign_scheduler_enabled'")
  })

  it('scheduler skips tenant when disabled (contains scheduler_disabled string)', () => {
    expect(fnSrc).toContain('scheduler_disabled')
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-05: safety — no resend/send imports; no approval_request creation; status='draft'; no forbidden transitions
// ---------------------------------------------------------------------------

describe('TC-MM3-05: safety invariants (source-read)', () => {
  const schedulerSrc = read('inngest/functions/process-campaign-schedule.ts')
  const promoterSrc  = read('modules/campaign-sequence/services/campaign-schedule-promoter.service.ts')

  it('scheduler does not import resend', () => {
    expect(schedulerSrc).not.toMatch(/resend/i)
  })

  it('scheduler does not import email-send.service', () => {
    expect(schedulerSrc).not.toContain('email-send.service')
  })

  it('scheduler does not reference sendApprovedDraft', () => {
    expect(schedulerSrc).not.toContain('sendApprovedDraft')
  })

  it('promoter does not import resend', () => {
    expect(promoterSrc).not.toMatch(/resend/i)
  })

  it('promoter does not import email-send.service', () => {
    expect(promoterSrc).not.toContain('email-send.service')
  })

  it('promoter does not reference sendApprovedDraft', () => {
    expect(promoterSrc).not.toContain('sendApprovedDraft')
  })

  it('promoter does not create approval_requests', () => {
    expect(promoterSrc).not.toContain('createApprovalRequest')
    expect(promoterSrc).not.toContain('approval.repo')
  })

  it("promoter creates draft with status: 'draft'", () => {
    expect(promoterSrc).toContain("status:               'draft'")
  })

  it("promoter never transitions item to 'sent'", () => {
    expect(promoterSrc).not.toContain("'sent'")
  })

  it("promoter never transitions item to 'approved'", () => {
    // 'approved' should not appear as a target status — only as a comparison string
    // The promoter only calls updateScheduleItemStatus with draft_needed / blocked / draft_ready / failed
    expect(promoterSrc).not.toContain("'approved'")
  })

  it("promoter never transitions item to 'awaiting_approval'", () => {
    expect(promoterSrc).not.toContain("'awaiting_approval'")
  })

  it('scheduler does not reference createApprovalRequest', () => {
    expect(schedulerSrc).not.toContain('createApprovalRequest')
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-06: promotion wiring — updateScheduleItemStatus, email_draft_id, draft_ready, blocked for missing asset
// ---------------------------------------------------------------------------

describe('TC-MM3-06: promoter wiring (source-read)', () => {
  const promoterSrc = read('modules/campaign-sequence/services/campaign-schedule-promoter.service.ts')

  it('promoter imports updateScheduleItemStatus from the schedule-item service', () => {
    expect(promoterSrc).toContain('updateScheduleItemStatus')
    expect(promoterSrc).toContain('campaign-schedule-item.service')
  })

  it('promoter calls updateScheduleItemStatus with draft_ready', () => {
    expect(promoterSrc).toContain("'draft_ready'")
  })

  it('promoter links email_draft_id when advancing to draft_ready', () => {
    const advanceIdx = promoterSrc.indexOf("'draft_ready'")
    expect(advanceIdx).toBeGreaterThan(-1)
    // The call that advances to draft_ready must carry email_draft_id
    const advanceCall = promoterSrc.slice(
      promoterSrc.lastIndexOf('updateScheduleItemStatus', advanceIdx),
      advanceIdx + 200,
    )
    expect(advanceCall).toContain('email_draft_id')
  })

  it('promoter transitions to blocked when step has no campaign_email_asset_id', () => {
    expect(promoterSrc).toContain('no_email_asset')
    expect(promoterSrc).toContain("'blocked'")
  })

  it('promoter transitions to failed on error after claim', () => {
    expect(promoterSrc).toContain("'failed'")
  })

  it('promoter uses DRAFT_SOURCE_TYPE.CAMPAIGN_SCHEDULE_ITEM', () => {
    expect(promoterSrc).toContain('DRAFT_SOURCE_TYPE.CAMPAIGN_SCHEDULE_ITEM')
    const constantsSrc = read('modules/messaging/drafts/draft-source.constants.ts')
    expect(constantsSrc).toContain('CAMPAIGN_SCHEDULE_ITEM')
    expect(constantsSrc).toContain("'campaign_schedule_item'")
  })

  it('promoter records campaign_schedule_item_id and generated_by in aiGenerationMetadata', () => {
    expect(promoterSrc).toContain('campaign_schedule_item_id')
    expect(promoterSrc).toContain("'campaign_scheduler'")
  })

  it('promoter honors the sequence sender_identity_id (V4 replaced the 20240045 TODO)', () => {
    expect(promoterSrc).not.toContain('TODO: use campaign_sequences.sender_identity_id')
    expect(promoterSrc).toContain('sender_identity_id')
    expect(promoterSrc).toContain('getSenderIdentityById')
    // default identity remains the fallback
    expect(promoterSrc).toContain('getDefaultSenderIdentity')
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-07: idempotency (behavioral) and listDueScheduleItems email_draft_id IS NULL guard (source-read)
// ---------------------------------------------------------------------------

describe('TC-MM3-07: idempotency and listDueScheduleItems email_draft_id filter', () => {
  it('isItemEligibleForPromotion returns false when email_draft_id is set (idempotency guard)', () => {
    const item = makeItem({ status: 'planned', email_draft_id: 'some-existing-draft-id' })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })

  it('isItemEligibleForPromotion returns false when email_draft_id is a non-null string', () => {
    const item = makeItem({ status: 'draft_needed', email_draft_id: 'draft-xyz-789' })
    expect(isItemEligibleForPromotion(item, 'assigned')).toBe(false)
  })

  it('listDueScheduleItems uses .is(email_draft_id, null) to exclude items with drafts (source-read)', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
    expect(repoSrc).toContain('listDueScheduleItems')
    expect(repoSrc).toContain(".is('email_draft_id', null)")
  })

  it('listDueScheduleItems filters status IN planned/draft_needed (source-read)', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
    const fnBody = repoSrc.slice(repoSrc.indexOf('listDueScheduleItems'))
    expect(fnBody).toContain("'planned'")
    expect(fnBody).toContain("'draft_needed'")
    expect(fnBody).toContain('.in(')
  })

  it('listDueScheduleItems filters scheduled_for <= now (source-read)', () => {
    const repoSrc = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')
    const fnBody = repoSrc.slice(repoSrc.indexOf('listDueScheduleItems'))
    expect(fnBody).toContain('.lte(')
    expect(fnBody).toContain('scheduled_for')
  })

  it('promoter idempotency check is the first guard (source-read)', () => {
    const promoterSrc = read('modules/campaign-sequence/services/campaign-schedule-promoter.service.ts')
    const fnBody = promoterSrc.slice(promoterSrc.indexOf('export async function promoteScheduleItemToDraft'))
    const idempotencyIdx = fnBody.indexOf('email_draft_id')
    const assetCheckIdx  = fnBody.indexOf('no_email_asset')
    expect(idempotencyIdx).toBeGreaterThan(-1)
    expect(assetCheckIdx).toBeGreaterThan(-1)
    expect(idempotencyIdx).toBeLessThan(assetCheckIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-MM3-08: enumerate-active-tenants must NOT filter on workspaces.deleted_at
// ---------------------------------------------------------------------------
// Regression guard: workspaces has no deleted_at column. Adding it back would crash
// all cron runs (untyped client hides the error at compile/test time; only surfaces at runtime).
// Note: the full correctness of enumerate-active-tenants requires runtime/integration testing —
// source-read only guards against re-introducing this specific structural bug.

describe('TC-MM3-08: enumerate-active-tenants does not reference workspaces.deleted_at (source-read)', () => {
  const scheduleSrc  = read('inngest/functions/process-campaign-schedule.ts')
  const approvalsSrc = read('inngest/functions/process-campaign-approvals.ts')
  const sendsSrc     = read('inngest/functions/process-campaign-sends.ts')
  const learningSrc  = read('inngest/functions/scheduled-learning-agent-run.ts')

  it('process-campaign-schedule enumerate step has no deleted_at filter', () => {
    expect(scheduleSrc).not.toContain('deleted_at')
  })

  it('process-campaign-approvals enumerate step has no deleted_at filter', () => {
    expect(approvalsSrc).not.toContain('deleted_at')
  })

  it('process-campaign-sends enumerate step has no deleted_at filter', () => {
    expect(sendsSrc).not.toContain('deleted_at')
  })

  it('scheduled-learning-agent-run enumerate step has no deleted_at filter', () => {
    expect(learningSrc).not.toContain('deleted_at')
  })

  it('all four enumerate steps still select tenant_id and id from workspaces', () => {
    for (const [name, src] of [
      ['process-campaign-schedule',   scheduleSrc],
      ['process-campaign-approvals',  approvalsSrc],
      ['process-campaign-sends',      sendsSrc],
      ['scheduled-learning-agent-run', learningSrc],
    ] as [string, string][]) {
      const stepIdx = src.indexOf("'enumerate-active-tenants'")
      const stepBody = src.slice(stepIdx, stepIdx + 400)
      expect(stepBody, `${name}: select clause`).toContain("'tenant_id, id'")
      expect(stepBody, `${name}: order by tenant_id`).toContain("'tenant_id'")
    }
  })
})
