// Manual Campaign Mode — Slice 8: stop detection
// TC-MM8-01 through TC-MM8-11
//
// Behavioral tests: classifyStopTarget and stopReasonFor (pure helpers, no DB).
// Source-read tests: wiring, safety, and transition-guard correctness.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { classifyStopTarget, stopReasonFor } from '@/modules/campaign-sequence/services/campaign-stop.service'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// TC-MM8-01: classifyStopTarget maps each mode to the correct stop target
// ---------------------------------------------------------------------------

describe('TC-MM8-01: classifyStopTarget maps mode to transition target (behavioral)', () => {
  it('manual -> stopped_manual', () => {
    expect(classifyStopTarget('manual')).toBe('stopped_manual')
  })

  it('bounced -> blocked', () => {
    expect(classifyStopTarget('bounced')).toBe('blocked')
  })

  it('complained -> blocked', () => {
    expect(classifyStopTarget('complained')).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-02: stopReasonFor maps each mode to its reason string
// ---------------------------------------------------------------------------

describe('TC-MM8-02: stopReasonFor maps mode to reason string (behavioral)', () => {
  it('manual -> manual_stop', () => {
    expect(stopReasonFor('manual')).toBe('manual_stop')
  })

  it('bounced -> recipient_bounced', () => {
    expect(stopReasonFor('bounced')).toBe('recipient_bounced')
  })

  it('complained -> recipient_complained', () => {
    expect(stopReasonFor('complained')).toBe('recipient_complained')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-03: listPendingScheduleItemsForAssignment uses the same PENDING status set
// ---------------------------------------------------------------------------

describe('TC-MM8-03: listPendingScheduleItemsForAssignment mirrors countPendingScheduleItemsForAssignment (source-read)', () => {
  const repo = read('modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts')

  it('listPendingScheduleItemsForAssignment function exists', () => {
    expect(repo).toContain('async function listPendingScheduleItemsForAssignment')
  })

  it('function filters all 6 non-terminal (PENDING) statuses', () => {
    const fnIdx = repo.indexOf('async function listPendingScheduleItemsForAssignment')
    const fnBody = repo.slice(fnIdx, fnIdx + 500)
    expect(fnBody).toContain("'planned'")
    expect(fnBody).toContain("'draft_needed'")
    expect(fnBody).toContain("'draft_ready'")
    expect(fnBody).toContain("'awaiting_approval'")
    expect(fnBody).toContain("'approved'")
    expect(fnBody).toContain("'scheduled'")
  })

  it('function is scoped to tenant and workspace', () => {
    const fnIdx = repo.indexOf('async function listPendingScheduleItemsForAssignment')
    const fnBody = repo.slice(fnIdx, fnIdx + 700)
    expect(fnBody).toContain('.eq(\'tenant_id\'')
    expect(fnBody).toContain('.eq(\'workspace_id\'')
  })

  it('countPendingScheduleItemsForAssignment uses the same 6 statuses', () => {
    // Both must contain all 6 statuses — they define the same PENDING boundary
    const countIdx = repo.indexOf('async function countPendingScheduleItemsForAssignment')
    const countBody = repo.slice(countIdx, countIdx + 500)
    expect(countBody).toContain("'planned'")
    expect(countBody).toContain("'draft_needed'")
    expect(countBody).toContain("'draft_ready'")
    expect(countBody).toContain("'awaiting_approval'")
    expect(countBody).toContain("'approved'")
    expect(countBody).toContain("'scheduled'")
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-04: stopAssignmentSchedule uses stopped_manual + stopped_at/stopped_reason for manual mode
// ---------------------------------------------------------------------------

describe('TC-MM8-04: stopAssignmentSchedule uses stopped_manual with stopped_at and stopped_reason for manual (source-read)', () => {
  const svc = read('modules/campaign-sequence/services/campaign-stop.service.ts')

  it('stopAssignmentSchedule calls updateScheduleItemStatus', () => {
    expect(svc).toContain('updateScheduleItemStatus')
  })

  it('uses stopped_manual as transition target for manual mode', () => {
    expect(svc).toContain("'stopped_manual'")
  })

  it('sets stopped_at for manual stop', () => {
    expect(svc).toContain('stopped_at')
  })

  it('sets stopped_reason for manual stop', () => {
    expect(svc).toContain('stopped_reason')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-05: stopAssignmentSchedule uses blocked + status_reason for bounce/complaint mode
// ---------------------------------------------------------------------------

describe('TC-MM8-05: stopAssignmentSchedule uses blocked with status_reason for bounce/complaint (source-read)', () => {
  const svc = read('modules/campaign-sequence/services/campaign-stop.service.ts')

  it('uses blocked as transition target for bounce/complaint', () => {
    expect(svc).toContain("'blocked'")
  })

  it('sets status_reason for blocked items', () => {
    expect(svc).toContain('status_reason')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-06: stopAssignmentSchedule never uses skipped or stopped_responded
// ---------------------------------------------------------------------------

describe('TC-MM8-06: stopAssignmentSchedule never transitions to skipped or stopped_responded (source-read)', () => {
  const svc = read('modules/campaign-sequence/services/campaign-stop.service.ts')

  it('does not transition to skipped in the stop service', () => {
    // Check that skipped is never passed as a transition target (not in function code lines)
    const codeLines = svc.split('\n').filter(l => !l.trimStart().startsWith('//'))
    expect(codeLines.join('\n')).not.toContain("'skipped'")
  })

  it('does not set stopped_responded in the stop service', () => {
    // Check that stopped_responded is never passed as a transition target
    const codeLines = svc.split('\n').filter(l => !l.trimStart().startsWith('//'))
    expect(codeLines.join('\n')).not.toContain("'stopped_responded'")
  })

  it('per-item catch block is present for isolation', () => {
    expect(svc).toContain('} catch {')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-07: stop path has no send/resend dependencies
// ---------------------------------------------------------------------------

describe('TC-MM8-07: campaign-stop.service imports no send or resend dependencies (source-read)', () => {
  const svc = read('modules/campaign-sequence/services/campaign-stop.service.ts')

  it('does not import from resend package', () => {
    expect(svc).not.toMatch(/from ['"]resend['"]/i)
  })

  it('does not import lib/resend', () => {
    // Check import lines only — not comments
    const importLines = svc.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toContain('lib/resend')
  })

  it('does not import email-send.service', () => {
    // Check import lines only — not comments
    const importLines = svc.split('\n').filter(l => l.trimStart().startsWith('import '))
    expect(importLines.join('\n')).not.toContain('email-send.service')
  })

  it('does not call sendApprovedDraft', () => {
    expect(svc).not.toContain('sendApprovedDraft')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-08: stopCampaignSequenceAction — permission slug, stop + retire wiring
// ---------------------------------------------------------------------------

describe('TC-MM8-08: stopCampaignSequenceAction uses same permission as retire and wires stop + retire (source-read)', () => {
  const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')

  it('stopCampaignSequenceAction is exported from the actions file', () => {
    expect(actions).toContain('async function stopCampaignSequenceAction')
  })

  it('uses crm.leads.view permission (same slug as retireCampaignAssignmentAction)', () => {
    const fnIdx = actions.indexOf('async function stopCampaignSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1200)
    expect(fnBody).toContain("'crm.leads.view'")
  })

  it('calls stopAssignmentSchedule with manual mode', () => {
    const fnIdx = actions.indexOf('async function stopCampaignSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1200)
    expect(fnBody).toContain('stopAssignmentSchedule')
    expect(fnBody).toContain("'manual'")
  })

  it('calls retireCampaignAssignment after stopping', () => {
    const fnIdx = actions.indexOf('async function stopCampaignSequenceAction')
    const fnBody = actions.slice(fnIdx, fnIdx + 1200)
    const stopIdx = fnBody.indexOf('stopAssignmentSchedule')
    const retireIdx = fnBody.indexOf('retireCampaignAssignment')
    expect(stopIdx).toBeGreaterThan(-1)
    expect(retireIdx).toBeGreaterThan(-1)
    // retireCampaignAssignment must appear AFTER stopAssignmentSchedule
    expect(retireIdx).toBeGreaterThan(stopIdx)
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-09: Resend webhook triggers schedule stop on hard bounce
// ---------------------------------------------------------------------------

describe('TC-MM8-09: Resend webhook triggers schedule stop on hard bounce (source-read)', () => {
  const webhook = read('app/api/webhooks/resend/route.ts')

  it('webhook imports stopAssignmentSchedule (directly or via helper)', () => {
    expect(webhook).toContain('stopAssignmentSchedule')
  })

  it('hard-bounce branch calls stopCampaignScheduleForSend with bounced mode', () => {
    const bounceIdx = webhook.indexOf("bounce_type === 'hard'")
    expect(bounceIdx).toBeGreaterThan(-1)
    const bounceBlock = webhook.slice(bounceIdx, bounceIdx + 1200)
    expect(bounceBlock).toContain('stopCampaignScheduleForSend')
    expect(bounceBlock).toContain("'bounced'")
  })

  it('stop call in bounce branch is non-fatal (wrapped with .catch)', () => {
    const bounceIdx = webhook.indexOf("bounce_type === 'hard'")
    const bounceBlock = webhook.slice(bounceIdx, bounceIdx + 1200)
    expect(bounceBlock).toContain('.catch(')
  })

  it('existing EMAIL_PERMANENT_BOUNCE structured error is still present', () => {
    expect(webhook).toContain('EMAIL_PERMANENT_BOUNCE')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-10: Resend webhook triggers schedule stop on complaint
// ---------------------------------------------------------------------------

describe('TC-MM8-10: Resend webhook triggers schedule stop on complaint (source-read)', () => {
  const webhook = read('app/api/webhooks/resend/route.ts')

  it('complaint branch calls stopCampaignScheduleForSend with complained mode', () => {
    // Anchor on the failure type constant (inside second email.complained block)
    const complaintErrorIdx = webhook.indexOf('EMAIL_COMPLAINT_RECEIVED')
    expect(complaintErrorIdx).toBeGreaterThan(-1)
    const complaintBlock = webhook.slice(complaintErrorIdx, complaintErrorIdx + 900)
    expect(complaintBlock).toContain('stopCampaignScheduleForSend')
    expect(complaintBlock).toContain("'complained'")
  })

  it('stop call in complaint branch is non-fatal (wrapped with .catch)', () => {
    const complaintErrorIdx = webhook.indexOf('EMAIL_COMPLAINT_RECEIVED')
    const complaintBlock = webhook.slice(complaintErrorIdx, complaintErrorIdx + 900)
    expect(complaintBlock).toContain('.catch(')
  })

  it('existing auto-unsubscribe (unsubscribes upsert) is still present', () => {
    expect(webhook).toContain("'unsubscribes'")
    expect(webhook).toContain('.upsert(')
  })

  it('existing EMAIL_COMPLAINT_RECEIVED structured error is still present', () => {
    expect(webhook).toContain('EMAIL_COMPLAINT_RECEIVED')
  })
})

// ---------------------------------------------------------------------------
// TC-MM8-11: SCHEDULE_ITEM_TRANSITIONS is unchanged — correct stop edges, no skipped from approved/scheduled
// ---------------------------------------------------------------------------

describe('TC-MM8-11: SCHEDULE_ITEM_TRANSITIONS unchanged — blocked/stopped_manual reachable from approved/scheduled; skipped is NOT (source-read)', () => {
  const svc = read('modules/campaign-sequence/services/campaign-schedule-item.service.ts')

  it('SCHEDULE_ITEM_TRANSITIONS is exported from the service', () => {
    expect(svc).toContain('export const SCHEDULE_ITEM_TRANSITIONS')
  })

  it('approved transitions include blocked', () => {
    const approvedIdx = svc.indexOf("approved:")
    const approvedLine = svc.slice(approvedIdx, approvedIdx + 120)
    expect(approvedLine).toContain("'blocked'")
  })

  it('approved transitions include stopped_manual', () => {
    const approvedIdx = svc.indexOf("approved:")
    const approvedLine = svc.slice(approvedIdx, approvedIdx + 120)
    expect(approvedLine).toContain("'stopped_manual'")
  })

  it('approved transitions do NOT include skipped', () => {
    // Scoped: find the approved line (not scheduled) and check it doesn't have skipped
    const transIdx  = svc.indexOf('export const SCHEDULE_ITEM_TRANSITIONS')
    const transBlock = svc.slice(transIdx, transIdx + 600)
    const approvedLineIdx = transBlock.indexOf("approved:")
    // 'approved:' line is followed by 'scheduled:' line; scope to just the approved values
    const approvedLine = transBlock.slice(approvedLineIdx, transBlock.indexOf("scheduled:", approvedLineIdx))
    expect(approvedLine).not.toContain("'skipped'")
  })

  it('scheduled transitions include blocked', () => {
    const scheduledIdx = svc.indexOf("scheduled:")
    const scheduledLine = svc.slice(scheduledIdx, scheduledIdx + 100)
    expect(scheduledLine).toContain("'blocked'")
  })

  it('scheduled transitions include stopped_manual', () => {
    const scheduledIdx = svc.indexOf("scheduled:")
    const scheduledLine = svc.slice(scheduledIdx, scheduledIdx + 100)
    expect(scheduledLine).toContain("'stopped_manual'")
  })

  it('scheduled transitions do NOT include skipped', () => {
    const scheduledIdx = svc.indexOf("scheduled:")
    const scheduledLine = svc.slice(scheduledIdx, scheduledIdx + 100)
    expect(scheduledLine).not.toContain("'skipped'")
  })
})
