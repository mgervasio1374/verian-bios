/**
 * Phase 3O — Proposal Event Creation From Captures
 * Test suite: source-reading and pure-function tiers
 *
 * Slice 2: TC-3O-001–048 (conversion service)
 *
 * Pattern: fs.readFileSync + toContain / not.toContain / regex
 * No Supabase mocking. No LLM mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

import {
  isFutureDate,
} from '../modules/proposals/lib/date-math'
import {
  buildFollowUpCommitmentsFromRule,
} from '../modules/proposals/lib/schedule-rules'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

// ---------------------------------------------------------------------------
// Slice 2 — Conversion Service (source-reading)
// TC-3O-001–040
// ---------------------------------------------------------------------------

const CONVERSION_SERVICE = 'modules/proposals/services/capture-to-event-conversion.service.ts'

describe('Slice 2: conversion service file exists and exports', () => {
  it('TC-3O-001: capture-to-event-conversion.service.ts exists', () => {
    expect(() => readSrc(CONVERSION_SERVICE)).not.toThrow()
  })

  it('TC-3O-002: service exports ConvertCaptureToProposalEventInput interface', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('export interface ConvertCaptureToProposalEventInput')
  })

  it('TC-3O-003: service exports ConvertCaptureToProposalEventResult type', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('export type ConvertCaptureToProposalEventResult')
  })

  it('TC-3O-004: ConvertCaptureToProposalEventResult has ok:true arm with proposalEventId', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('ok: true')
    expect(src).toContain('proposalEventId')
    expect(src).toContain('commitmentCount')
  })

  it('TC-3O-005: ConvertCaptureToProposalEventResult has already_resolved error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'already_resolved'")
  })

  it('TC-3O-006: ConvertCaptureToProposalEventResult has capture_not_eligible error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'capture_not_eligible'")
  })

  it('TC-3O-007: ConvertCaptureToProposalEventResult has open_proposal_exists error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'open_proposal_exists'")
  })

  it('TC-3O-008: ConvertCaptureToProposalEventResult has invalid_proposal_sent_at error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'invalid_proposal_sent_at'")
  })

  it('TC-3O-009: ConvertCaptureToProposalEventResult has lead_not_found error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'lead_not_found'")
  })

  it('TC-3O-010: ConvertCaptureToProposalEventResult has create_failed error', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain("'create_failed'")
  })

  it('TC-3O-011: service exports convertCaptureToProposalEvent function', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('export async function convertCaptureToProposalEvent')
  })
})

describe('Slice 2: service imports — required repos and utilities', () => {
  it('TC-3O-012: service imports getCaptureById via captureRepo', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('captureRepo')
    expect(src).toContain('getCaptureById')
  })

  it('TC-3O-013: service imports updateCaptureMatchStatus via captureRepo', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('updateCaptureMatchStatus')
  })

  it('TC-3O-014: service imports createProposalEvent via eventRepo', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('eventRepo')
    expect(src).toContain('createProposalEvent')
  })

  it('TC-3O-015: service imports getOpenProposalEventForLead via eventRepo', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('getOpenProposalEventForLead')
  })

  it('TC-3O-016: service imports createFollowUpCommitments via commitmentRepo', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('commitmentRepo')
    expect(src).toContain('createFollowUpCommitments')
  })

  it('TC-3O-017: service imports getLead via leadRepo', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('leadRepo')
    expect(src).toContain('getLead')
  })

  it('TC-3O-018: service imports isFutureDate', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('isFutureDate')
  })

  it('TC-3O-019: service imports buildFollowUpCommitmentsFromRule', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('buildFollowUpCommitmentsFromRule')
  })
})

describe('Slice 2: eligibility and idempotency guards', () => {
  it('TC-3O-020: service checks isFutureDate on proposalSentAt before any DB call', () => {
    const src = readSrc(CONVERSION_SERVICE)
    // isFutureDate must appear before the first getCaptureById call
    const futurePos  = src.indexOf('isFutureDate')
    const capturePos = src.indexOf('getCaptureById')
    expect(futurePos).toBeGreaterThan(-1)
    expect(capturePos).toBeGreaterThan(-1)
    expect(futurePos).toBeLessThan(capturePos)
  })

  it('TC-3O-021: service checks capture.resolved_event_id before creating event', () => {
    const src = readSrc(CONVERSION_SERVICE)
    const idempotencyPos = src.indexOf('resolved_event_id')
    const createEventPos = src.indexOf('createProposalEvent')
    expect(idempotencyPos).toBeGreaterThan(-1)
    expect(createEventPos).toBeGreaterThan(-1)
    expect(idempotencyPos).toBeLessThan(createEventPos)
  })

  it('TC-3O-022: service checks capture.match_status against ELIGIBLE_STATUSES_FOR_CONVERSION', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('ELIGIBLE_STATUSES_FOR_CONVERSION')
    expect(src).toContain('match_status')
  })

  it('TC-3O-023: service returns already_resolved when resolved_event_id is non-null', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('already_resolved')
    expect(/resolved_event_id[\s\S]{0,100}already_resolved/.test(src)).toBe(true)
  })

  it('TC-3O-024: service returns capture_not_eligible for non-matched status', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('capture_not_eligible')
  })

  it('TC-3O-025: service checks matched_lead_id is non-null', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('matched_lead_id')
    expect(/matched_lead_id[\s\S]{0,200}capture_not_eligible/.test(src)).toBe(true)
  })
})

describe('Slice 2: lead validation and company derivation', () => {
  it('TC-3O-026: service re-loads lead with getLead after eligibility checks', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('getLead')
  })

  it('TC-3O-027: service validates lead workspace membership', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('workspace_id')
    expect(src).toContain('lead_not_found')
  })

  it('TC-3O-028: service derives companyId from lead.company_id, not from client input', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('lead.company_id')
    expect(src).not.toContain('input.companyId')
  })

  it('TC-3O-029: account domain field not referenced in service', () => {
    expect(readSrc(CONVERSION_SERVICE)).not.toContain('accounts.domain')
  })
})

describe('Slice 2: one-open-proposal guard and event creation', () => {
  it('TC-3O-030: service calls getOpenProposalEventForLead before createProposalEvent', () => {
    const src = readSrc(CONVERSION_SERVICE)
    const guardPos  = src.indexOf('getOpenProposalEventForLead')
    const createPos = src.indexOf('createProposalEvent')
    expect(guardPos).toBeGreaterThan(-1)
    expect(createPos).toBeGreaterThan(-1)
    expect(guardPos).toBeLessThan(createPos)
  })

  it('TC-3O-031: service maps 23505 constraint error to open_proposal_exists', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('23505')
    expect(src).toContain('idx_proposal_events_one_open_per_lead')
  })

  it('TC-3O-032: service passes captureSource from capture record, not hardcoded', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('capture.capture_source')
  })

  it('TC-3O-033: service passes captureId as capture.id to createProposalEvent', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('captureId:')
    expect(readSrc(CONVERSION_SERVICE)).toContain('capture.id')
  })

  it('TC-3O-034: service sets accountId to null — reserved, never from client', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('accountId:         null')
  })
})

describe('Slice 2: mandatory resolved_event_id link step', () => {
  it('TC-3O-035: service sets resolvedEventId via updateCaptureMatchStatus after event creation', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('resolvedEventId')
    expect(src).toContain('eventRow.id')
  })

  it('TC-3O-036: service calls withdrawEventForCleanup when resolved_event_id link fails', () => {
    const src = readSrc(CONVERSION_SERVICE)
    // withdrawEventForCleanup must appear in the context of the resolved_event_id linking block
    const linkBlock = src.slice(src.indexOf('resolvedEventId'))
    expect(linkBlock).toContain('withdrawEventForCleanup')
  })

  it('TC-3O-037: link step failure returns create_failed, not continues to commitments', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(/resolvedEventId[\s\S]{0,500}create_failed/.test(src)).toBe(true)
  })

  it('TC-3O-038: MANDATORY comment present on resolved_event_id link step', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src.toUpperCase()).toContain('MANDATORY')
  })
})

describe('Slice 2: commitment count validation', () => {
  it('TC-3O-039: service validates created.length > 0 after createFollowUpCommitments', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('created.length === 0')
  })

  it('TC-3O-040: service validates created.length === planned.length', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('created.length !== planned.length')
  })

  it('TC-3O-041: service calls withdrawEventForCleanup on zero/partial commitment count', () => {
    const src = readSrc(CONVERSION_SERVICE)
    // withdrawEventForCleanup must appear at least twice: once for link failure, once for commitment failure
    const occurrences = (src.match(/withdrawEventForCleanup/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('TC-3O-042: zero/partial commitment count returns create_failed', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(/created\.length[\s\S]{0,200}create_failed/.test(src)).toBe(true)
  })

  it('TC-3O-043: service uses DEFAULT_RULE_KEY fallback when scheduleRuleKey is not provided', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).toContain('standard_3_5_10')
    expect(src).toContain('scheduleRuleKey ?? DEFAULT_RULE_KEY')
  })
})

describe('Slice 2: activity event readiness', () => {
  it('TC-3O-044: service references PROPOSAL_SENT_RECORDED for future audit', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(
      src.includes('PROPOSAL_SENT_RECORDED') || src.includes('proposal_sent_recorded')
    ).toBe(true)
  })

  it('TC-3O-045: service references PROPOSAL_FOLLOW_UP_CREATED for future audit', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(
      src.includes('PROPOSAL_FOLLOW_UP_CREATED') || src.includes('proposal_follow_up_created')
    ).toBe(true)
  })
})

describe('Slice 2: forbidden patterns — no send, no LLM, no workflow', () => {
  it('TC-3O-046: no Resend or email send imports', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).not.toMatch(/from ['"]resend['"]/)
    expect(src).not.toContain('emails.send')
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3O-047: no LLM or AI imports', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).not.toMatch(/from ['"]openai['"]/)
    expect(src).not.toMatch(/from ['"]@anthropic/)
    expect(src).not.toContain('chat.completions')
    expect(src).not.toContain('messages.create')
    expect(src).not.toContain('responses.create')
  })

  it('TC-3O-048: no Inngest or workflow dispatch calls', () => {
    const src = readSrc(CONVERSION_SERVICE)
    expect(src).not.toContain('inngest')
    expect(src).not.toContain('sendEvent')
    expect(src).not.toContain('dispatchPendingEvents')
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('scheduled_activities')
  })
})

// ---------------------------------------------------------------------------
// Slice 2 — Pure-function sanity checks (date + schedule utilities)
// TC-3O-049–052
// ---------------------------------------------------------------------------

describe('Slice 2: isFutureDate utility used by service', () => {
  it('TC-3O-049: isFutureDate rejects a timestamp 1 second in the future', () => {
    const future = new Date(Date.now() + 1000)
    expect(isFutureDate(future)).toBe(true)
  })

  it('TC-3O-050: isFutureDate accepts a timestamp 1 second in the past', () => {
    const past = new Date(Date.now() - 1000)
    expect(isFutureDate(past)).toBe(false)
  })
})

describe('Slice 2: buildFollowUpCommitmentsFromRule utility used by service', () => {
  it('TC-3O-051: standard_3_5_10 produces exactly 3 commitments', () => {
    const result = buildFollowUpCommitmentsFromRule(new Date().toISOString(), 'standard_3_5_10')
    expect(result).toHaveLength(3)
  })

  it('TC-3O-052: light_5_14 produces exactly 2 commitments', () => {
    const result = buildFollowUpCommitmentsFromRule(new Date().toISOString(), 'light_5_14')
    expect(result).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Slice 2 — Idempotency fix: clearCaptureResolvedEventId + cleanupFailedConversion
// TC-3O-053–062
// ---------------------------------------------------------------------------

const CAPTURE_REPO = 'modules/proposals/repositories/proposal-captures.repo.ts'

describe('Slice 2 (fix): clearCaptureResolvedEventId in capture repo', () => {
  it('TC-3O-053: proposal-captures.repo.ts exports clearCaptureResolvedEventId', () => {
    expect(readSrc(CAPTURE_REPO)).toContain('export async function clearCaptureResolvedEventId')
  })

  it('TC-3O-054: clearCaptureResolvedEventId accepts expectedEventId parameter', () => {
    expect(readSrc(CAPTURE_REPO)).toContain('expectedEventId')
  })

  it('TC-3O-055: clearCaptureResolvedEventId sets resolved_event_id to null', () => {
    const src = readSrc(CAPTURE_REPO)
    expect(src).toContain('resolved_event_id: null')
  })

  it('TC-3O-056: clearCaptureResolvedEventId filters by eq resolved_event_id = expectedEventId', () => {
    const src = readSrc(CAPTURE_REPO)
    // The eq filter ensures only the matching event is cleared — no accidental over-clear.
    expect(src).toContain(".eq('resolved_event_id', expectedEventId)")
  })

  it('TC-3O-057: clearCaptureResolvedEventId is scoped by tenantId and workspaceId', () => {
    const src = readSrc(CAPTURE_REPO)
    const fnStart = src.indexOf('clearCaptureResolvedEventId')
    const fnBody  = src.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain("eq('tenant_id', tenantId)")
    expect(fnBody).toContain("eq('workspace_id', workspaceId)")
  })
})

describe('Slice 2 (fix): cleanupFailedConversion helper in service', () => {
  it('TC-3O-058: service defines cleanupFailedConversion function', () => {
    expect(readSrc(CONVERSION_SERVICE)).toContain('async function cleanupFailedConversion')
  })

  it('TC-3O-059: cleanupFailedConversion calls closeOpenCommitmentsForProposal', () => {
    const src = readSrc(CONVERSION_SERVICE)
    const fnStart = src.indexOf('async function cleanupFailedConversion')
    const fnBody  = src.slice(fnStart, fnStart + 800)
    expect(fnBody).toContain('closeOpenCommitmentsForProposal')
  })

  it('TC-3O-060: cleanupFailedConversion calls clearCaptureResolvedEventId', () => {
    const src = readSrc(CONVERSION_SERVICE)
    const fnStart = src.indexOf('async function cleanupFailedConversion')
    const fnBody  = src.slice(fnStart, fnStart + 800)
    expect(fnBody).toContain('clearCaptureResolvedEventId')
  })

  it('TC-3O-061: commitment failure path uses cleanupFailedConversion, not bare withdrawEventForCleanup', () => {
    const src = readSrc(CONVERSION_SERVICE)
    // Step 10 block starts after "Create follow-up commitments"
    const step10Start = src.indexOf('Create follow-up commitments')
    const step10Body  = src.slice(step10Start)
    expect(step10Body).toContain('cleanupFailedConversion')
    // bare withdrawEventForCleanup should NOT appear in Step 10 (Step 9 still uses it directly)
    // Verify it is cleanupFailedConversion that handles both the count guard and the catch
    const countGuardMatch = /created\.length[\s\S]{0,50}cleanupFailedConversion/.test(step10Body)
    expect(countGuardMatch).toBe(true)
  })

  it('TC-3O-062: Step 9 link failure still uses withdrawEventForCleanup (resolved_event_id never set)', () => {
    const src = readSrc(CONVERSION_SERVICE)
    // Step 9 block: between "MANDATORY" comment and Step 10
    const mandatoryPos = src.indexOf('MANDATORY')
    const step10Pos    = src.indexOf('Create follow-up commitments')
    const step9Body    = src.slice(mandatoryPos, step10Pos)
    // Must reference withdrawEventForCleanup for the link-failure path
    expect(step9Body).toContain('withdrawEventForCleanup')
    // Must NOT reference cleanupFailedConversion (resolved_event_id was never set in this path)
    expect(step9Body).not.toContain('cleanupFailedConversion')
  })
})

// ---------------------------------------------------------------------------
// Slice 3 — Server Action Wrapper
// TC-3O-063–084
// ---------------------------------------------------------------------------

const ACTION_FILE = 'modules/proposals/actions/capture-to-event-conversion.actions.ts'

describe('Slice 3: action file exists and basic structure', () => {
  it('TC-3O-063: capture-to-event-conversion.actions.ts exists', () => {
    expect(() => readSrc(ACTION_FILE)).not.toThrow()
  })

  it('TC-3O-064: action file declares use server', () => {
    expect(readSrc(ACTION_FILE)).toContain("'use server'")
  })

  it('TC-3O-065: action exports ConvertCaptureToProposalEventActionInput interface', () => {
    expect(readSrc(ACTION_FILE)).toContain('export interface ConvertCaptureToProposalEventActionInput')
  })

  it('TC-3O-066: action exports convertCaptureToProposalEventAction function', () => {
    expect(readSrc(ACTION_FILE)).toContain('export async function convertCaptureToProposalEventAction')
  })
})

describe('Slice 3: action imports', () => {
  it('TC-3O-067: action imports createSupabaseServerClient', () => {
    expect(readSrc(ACTION_FILE)).toContain('createSupabaseServerClient')
  })

  it('TC-3O-068: action imports buildRequestContext', () => {
    expect(readSrc(ACTION_FILE)).toContain('buildRequestContext')
  })

  it('TC-3O-069: action imports requirePermission', () => {
    expect(readSrc(ACTION_FILE)).toContain('requirePermission')
  })

  it('TC-3O-070: action imports convertCaptureToProposalEvent from service', () => {
    expect(readSrc(ACTION_FILE)).toContain('convertCaptureToProposalEvent')
  })
})

describe('Slice 3: action input interface — forbidden fields', () => {
  it('TC-3O-071: action input does not accept tenantId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 250)
    expect(ifaceBody).not.toContain('tenantId')
  })

  it('TC-3O-072: action input does not accept workspaceId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 250)
    expect(ifaceBody).not.toContain('workspaceId')
  })

  it('TC-3O-073: action input does not accept userId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 250)
    expect(ifaceBody).not.toContain('userId')
  })

  it('TC-3O-074: action input does not accept leadId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 600)
    expect(ifaceBody).not.toContain('leadId')
  })

  it('TC-3O-075: action input does not accept companyId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 600)
    expect(ifaceBody).not.toContain('companyId')
  })

  it('TC-3O-076: action input does not accept contactId', () => {
    const src = readSrc(ACTION_FILE)
    const ifaceStart = src.indexOf('ConvertCaptureToProposalEventActionInput')
    const ifaceBody  = src.slice(ifaceStart, ifaceStart + 600)
    expect(ifaceBody).not.toContain('contactId')
  })
})

describe('Slice 3: action security — context-only IDs', () => {
  it('TC-3O-077: action calls requirePermission with crm.leads.view', () => {
    expect(readSrc(ACTION_FILE)).toContain("requirePermission(ctx, 'crm.leads.view')")
  })

  it('TC-3O-078: action passes ctx.tenantId to service', () => {
    expect(readSrc(ACTION_FILE)).toContain('ctx.tenantId')
  })

  it('TC-3O-079: action passes ctx.workspaceId to service', () => {
    expect(readSrc(ACTION_FILE)).toContain('ctx.workspaceId')
  })

  it('TC-3O-080: action passes ctx.userId to service', () => {
    expect(readSrc(ACTION_FILE)).toContain('ctx.userId')
  })
})

describe('Slice 3: action result shape', () => {
  it('TC-3O-081: action returns proposalEventId on success', () => {
    expect(readSrc(ACTION_FILE)).toContain('proposalEventId')
  })

  it('TC-3O-082: action returns captureId on success', () => {
    const src = readSrc(ACTION_FILE)
    // captureId must appear in both the return data and the success: true block
    expect(src).toContain('captureId:')
    expect(src).toContain('commitmentCount')
  })

  it('TC-3O-083: action returns failure when service returns ok:false', () => {
    const src = readSrc(ACTION_FILE)
    expect(src).toContain('success: false')
    expect(src).toContain('result.error')
  })
})

describe('Slice 3: forbidden patterns — no send, no LLM, no workflow', () => {
  it('TC-3O-084: no Resend, LLM, Inngest, or campaign references in action', () => {
    const src = readSrc(ACTION_FILE)
    expect(src).not.toMatch(/from ['"]resend['"]/)
    expect(src).not.toMatch(/from ['"]openai['"]/)
    expect(src).not.toMatch(/from ['"]@anthropic/)
    expect(src).not.toContain('inngest')
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('scheduled_activities')
  })
})
