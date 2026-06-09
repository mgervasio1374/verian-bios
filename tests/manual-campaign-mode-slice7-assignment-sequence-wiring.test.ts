// Manual Campaign Mode — Slice 7: connect assignment -> sequence -> schedule materialization
// Source-read tests only. No Supabase connection. No model calls. No DB writes.
// TC-MM7-01 through TC-MM7-15

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel))
}

// ---------------------------------------------------------------------------
// TC-MM7-01: CreateAssignmentInput includes campaignSequenceId
// ---------------------------------------------------------------------------

describe('TC-MM7-01: CreateAssignmentInput accepts campaignSequenceId (source-read)', () => {
  const types = read('modules/messaging/types/campaign-assignment.types.ts')

  it('CreateAssignmentInput interface contains campaignSequenceId', () => {
    // Scoped check: locate the interface definition
    const ifaceIdx = types.indexOf('interface CreateAssignmentInput')
    expect(ifaceIdx).toBeGreaterThan(-1)
    const ifaceBody = types.slice(ifaceIdx, types.indexOf('}', ifaceIdx) + 1)
    expect(ifaceBody).toContain('campaignSequenceId')
  })

  it('campaignSequenceId is optional (has ? modifier)', () => {
    const ifaceIdx = types.indexOf('interface CreateAssignmentInput')
    const ifaceBody = types.slice(ifaceIdx, types.indexOf('}', ifaceIdx) + 1)
    expect(ifaceBody).toMatch(/campaignSequenceId\?/)
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-02: CampaignAssignment and InsertCampaignAssignment include campaign_sequence_id
// ---------------------------------------------------------------------------

describe('TC-MM7-02: domain and insert types carry campaign_sequence_id (source-read)', () => {
  const types = read('modules/messaging/types/campaign-assignment.types.ts')

  it('CampaignAssignment interface contains campaign_sequence_id', () => {
    const ifaceIdx = types.indexOf('interface CampaignAssignment')
    expect(ifaceIdx).toBeGreaterThan(-1)
    const ifaceBody = types.slice(ifaceIdx, types.indexOf('}', ifaceIdx) + 1)
    expect(ifaceBody).toContain('campaign_sequence_id')
  })

  it('campaign_sequence_id is string | null in CampaignAssignment', () => {
    const ifaceIdx = types.indexOf('interface CampaignAssignment')
    const ifaceBody = types.slice(ifaceIdx, types.indexOf('}', ifaceIdx) + 1)
    expect(ifaceBody).toContain('campaign_sequence_id:  string | null')
  })

  it('InsertCampaignAssignment interface contains campaign_sequence_id', () => {
    const insertIdx = types.indexOf('interface InsertCampaignAssignment')
    expect(insertIdx).toBeGreaterThan(-1)
    const insertBody = types.slice(insertIdx, types.indexOf('}', insertIdx) + 1)
    expect(insertBody).toContain('campaign_sequence_id')
  })

  it('campaign_sequence_id is optional in InsertCampaignAssignment', () => {
    const insertIdx = types.indexOf('interface InsertCampaignAssignment')
    const insertBody = types.slice(insertIdx, types.indexOf('}', insertIdx) + 1)
    expect(insertBody).toMatch(/campaign_sequence_id\?/)
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-03: insertCampaignAssignment in repo passes campaign_sequence_id through the payload
// ---------------------------------------------------------------------------

describe('TC-MM7-03: repo insertCampaignAssignment writes campaign_sequence_id via typed payload (source-read)', () => {
  const repo = read('modules/messaging/repositories/campaign-assignment.repo.ts')

  it('repo imports InsertCampaignAssignment type', () => {
    expect(repo).toContain('InsertCampaignAssignment')
  })

  it('insertCampaignAssignment accepts InsertCampaignAssignment payload', () => {
    const fnIdx = repo.indexOf('async function insertCampaignAssignment')
    expect(fnIdx).toBeGreaterThan(-1)
    const fnSig = repo.slice(fnIdx, fnIdx + 100)
    expect(fnSig).toContain('InsertCampaignAssignment')
  })

  it('repo uses insert(payload) — campaign_sequence_id flows through the payload object', () => {
    const fnIdx = repo.indexOf('async function insertCampaignAssignment')
    const fnBody = repo.slice(fnIdx, fnIdx + 300)
    expect(fnBody).toContain('.insert(payload)')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-04: createCampaignAssignment validates the sequence via getCampaignSequenceById
// ---------------------------------------------------------------------------

describe('TC-MM7-04: service validates campaignSequenceId before storing (source-read)', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('service imports getCampaignSequenceById', () => {
    expect(service).toContain('getCampaignSequenceById')
    expect(service).toContain('campaign-sequence.repo')
  })

  it('createCampaignAssignment calls getCampaignSequenceById for validation', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    expect(fnBody).toContain('getCampaignSequenceById')
  })

  it('service rejects assignment when sequence is not found', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    expect(fnBody).toContain('Campaign sequence not found')
  })

  it('getCampaignSequenceById is called with tenantId and workspaceId for scope enforcement', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    expect(fnBody).toContain('input.tenantId')
    expect(fnBody).toContain('input.workspaceId')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-05: createCampaignAssignment stores campaign_sequence_id on the insert row
// ---------------------------------------------------------------------------

describe('TC-MM7-05: service stores campaign_sequence_id in the insert row (source-read)', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('insertCampaignAssignment call includes campaign_sequence_id field', () => {
    const insertIdx = service.indexOf('assignmentRepo.insertCampaignAssignment(')
    expect(insertIdx).toBeGreaterThan(-1)
    const insertBlock = service.slice(insertIdx, insertIdx + 600)
    expect(insertBlock).toContain('campaign_sequence_id')
  })

  it('campaign_sequence_id is sourced from input.campaignSequenceId', () => {
    const insertIdx = service.indexOf('assignmentRepo.insertCampaignAssignment(')
    const insertBlock = service.slice(insertIdx, insertIdx + 600)
    expect(insertBlock).toContain('input.campaignSequenceId')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-06: createCampaignAssignment emits activation event only when status==='assigned' AND sequence set
// ---------------------------------------------------------------------------

describe('TC-MM7-06: createCampaignAssignment emits activation event conditionally (source-read)', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('service imports inngest client', () => {
    expect(service).toContain("from '@/lib/inngest/client'")
    expect(service).toContain('inngest')
  })

  it('emitAssignmentActivated helper is defined in the service', () => {
    expect(service).toContain('emitAssignmentActivated')
    expect(service).toContain("name: 'campaign.assignment_activated'")
  })

  it('activation emit is guarded by ASSIGNED status check', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    expect(fnBody).toContain('ASSIGNMENT_STATUS.ASSIGNED')
    expect(fnBody).toContain('emitAssignmentActivated')
  })

  it('activation emit is guarded by campaign_sequence_id being set', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    expect(fnBody).toContain('row.campaign_sequence_id')
  })

  it('activation emit is non-fatal (.catch(() => null))', () => {
    const fnIdx = service.indexOf('async function createCampaignAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ----', fnIdx))
    const emitIdx = fnBody.indexOf('emitAssignmentActivated')
    expect(emitIdx).toBeGreaterThan(-1)
    const afterEmit = fnBody.slice(emitIdx)
    expect(afterEmit).toContain('.catch(() => null)')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-07: approveProposedAssignment emits activation event; resumeCampaignAssignment does NOT
// ---------------------------------------------------------------------------

describe('TC-MM7-07: approve emits activation; resume does NOT (source-read)', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('approveProposedAssignment calls emitAssignmentActivated', () => {
    const fnIdx = service.indexOf('async function approveProposedAssignment')
    expect(fnIdx).toBeGreaterThan(-1)
    // Scoped to the approve function — ends at the next '// ----' section header
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ---- rejectProposedAssignment', fnIdx))
    expect(fnBody).toContain('emitAssignmentActivated')
  })

  it('approveProposedAssignment emit is guarded by campaign_sequence_id', () => {
    const fnIdx = service.indexOf('async function approveProposedAssignment')
    const fnBody = service.slice(fnIdx, service.indexOf('\n// ---- rejectProposedAssignment', fnIdx))
    expect(fnBody).toContain('campaign_sequence_id')
  })

  it('resumeCampaignAssignment does NOT contain emitAssignmentActivated', () => {
    const fnIdx = service.indexOf('async function resumeCampaignAssignment')
    expect(fnIdx).toBeGreaterThan(-1)
    // Scoped: ends at the next '// ----' section
    const fnEnd = service.indexOf('\n// ----', fnIdx + 10)
    const fnBody = fnEnd > fnIdx ? service.slice(fnIdx, fnEnd) : service.slice(fnIdx, fnIdx + 600)
    expect(fnBody).not.toContain('emitAssignmentActivated')
    expect(fnBody).not.toContain('campaign.assignment_activated')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-08: on-campaign-assignment-activated handler — structure and materialization
// ---------------------------------------------------------------------------

describe('TC-MM7-08: on-campaign-assignment-activated handler calls materializeScheduleItemsForAssignment (source-read)', () => {
  const handlerPath = 'inngest/functions/on-campaign-assignment-activated.ts'

  it('handler file exists', () => {
    expect(exists(handlerPath)).toBe(true)
  })

  const handler = read(handlerPath)

  it('handler triggers on campaign.assignment_activated event', () => {
    expect(handler).toContain("event: 'campaign.assignment_activated'")
  })

  it('handler id is on-campaign-assignment-activated', () => {
    expect(handler).toContain("id: 'on-campaign-assignment-activated'")
  })

  it('handler has retries: 2', () => {
    expect(handler).toContain('retries: 2')
  })

  it('handler imports materializeScheduleItemsForAssignment', () => {
    expect(handler).toContain('materializeScheduleItemsForAssignment')
    expect(handler).toContain('campaign-schedule-item.service')
  })

  it('handler calls materializeScheduleItemsForAssignment with assignmentId, campaignSequenceId, tenantId, workspaceId, new Date()', () => {
    expect(handler).toContain('materializeScheduleItemsForAssignment(')
    expect(handler).toContain('data.assignmentId')
    expect(handler).toContain('data.campaignSequenceId')
    expect(handler).toContain('data.tenantId')
    expect(handler).toContain('data.workspaceId')
    expect(handler).toContain('new Date()')
  })

  it('handler catches schedule_items_already_materialized as a benign no-op', () => {
    expect(handler).toContain('schedule_items_already_materialized')
    expect(handler).toContain('alreadyMaterialized: true')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-09: handler is registered in inngest/index.ts; event name is consistent
// ---------------------------------------------------------------------------

describe('TC-MM7-09: handler registered in inngest/index.ts and event name is consistent (source-read)', () => {
  const index = read('inngest/index.ts')
  const handler = read('inngest/functions/on-campaign-assignment-activated.ts')
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('onCampaignAssignmentActivated is imported in inngest/index.ts', () => {
    expect(index).toContain('onCampaignAssignmentActivated')
    expect(index).toContain('on-campaign-assignment-activated')
  })

  it('onCampaignAssignmentActivated is in the inngestFunctions array', () => {
    const arrayBody = index.slice(index.indexOf('export const inngestFunctions'))
    expect(arrayBody).toContain('onCampaignAssignmentActivated')
  })

  it('event name campaign.assignment_activated is consistent between emit and handler trigger', () => {
    expect(service).toContain("'campaign.assignment_activated'")
    expect(handler).toContain("'campaign.assignment_activated'")
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-10: materialization path safety — no resend, no sendApprovedDraft, no drafts/approval_requests
// ---------------------------------------------------------------------------

describe('TC-MM7-10: materialization handler does not touch sending or approval flow (source-read)', () => {
  const handler = read('inngest/functions/on-campaign-assignment-activated.ts')

  it('handler does not import from resend package', () => {
    expect(handler).not.toMatch(/from ['"]resend['"]/i)
  })

  it('handler does not import lib/resend', () => {
    expect(handler).not.toContain('lib/resend')
  })

  it('handler does not import email-send.service', () => {
    expect(handler).not.toContain('email-send.service')
  })

  it('handler does not call sendApprovedDraft', () => {
    expect(handler).not.toContain('sendApprovedDraft')
  })

  it('handler does not create email_drafts', () => {
    expect(handler).not.toContain('email_drafts')
    expect(handler).not.toContain('createEmailDraft')
  })

  it('handler does not create approval_requests', () => {
    expect(handler).not.toContain('approval_requests')
    expect(handler).not.toContain('createApprovalRequest')
  })
})

// ---------------------------------------------------------------------------
// TC-MM7-11: createManualAssignmentAction forwards campaignSequenceId
// ---------------------------------------------------------------------------

describe('TC-MM7-11: createManualAssignmentAction forwards campaignSequenceId (source-read)', () => {
  const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')

  it('createManualAssignmentAction accepts campaignSequenceId parameter', () => {
    const fnIdx = actions.indexOf('async function createManualAssignmentAction')
    expect(fnIdx).toBeGreaterThan(-1)
    const sigBlock = actions.slice(fnIdx, fnIdx + 300)
    expect(sigBlock).toContain('campaignSequenceId')
  })

  it('createManualAssignmentAction passes campaignSequenceId to createCampaignAssignment', () => {
    const fnIdx = actions.indexOf('async function createManualAssignmentAction')
    const fnEnd = actions.indexOf('\n}', fnIdx) + 2
    const fnBody = actions.slice(fnIdx, fnEnd)
    expect(fnBody).toContain('campaignSequenceId')
    expect(fnBody).toContain('createCampaignAssignment')
  })
})
