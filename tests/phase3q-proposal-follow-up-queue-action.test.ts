/**
 * Phase 3Q — Proposal Follow-Up Work Queue
 * Test suite: source-reading tier — Slice 4 (read-only server action)
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
// Action path
// ---------------------------------------------------------------------------

const QUEUE_ACTION = 'modules/proposals/actions/proposal-follow-up-queue.actions.ts'

// ---------------------------------------------------------------------------
// Slice 4 — getProposalFollowUpQueueAction
// TC-3Q-061 through TC-3Q-085
// ---------------------------------------------------------------------------

describe('Slice 4: follow-up queue action — getProposalFollowUpQueueAction', () => {

  it('TC-3Q-061: action file exists and is readable', () => {
    expect(() => readSrc(QUEUE_ACTION)).not.toThrow()
  })

  it('TC-3Q-062: action file uses use server directive', () => {
    expect(readSrc(QUEUE_ACTION)).toContain("'use server'")
  })

  it('TC-3Q-063: getProposalFollowUpQueueAction function is exported', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('export async function getProposalFollowUpQueueAction')
  })

  it('TC-3Q-064: GetProposalFollowUpQueueActionInput interface is exported', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('export interface GetProposalFollowUpQueueActionInput')
  })

  it('TC-3Q-065: action imports getProposalFollowUpQueueForWorkspace from service', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).toContain('getProposalFollowUpQueueForWorkspace')
    expect(src).toContain('proposal-follow-up-queue.service')
  })

  it('TC-3Q-066: action uses buildRequestContext to derive server-side context', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('buildRequestContext')
  })

  it('TC-3Q-067: action uses ctx.tenantId and ctx.workspaceId — not client-provided values', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).toContain('ctx.tenantId')
    expect(src).toContain('ctx.workspaceId')
  })

  it('TC-3Q-068: action uses createSupabaseServerClient', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('createSupabaseServerClient')
  })

  it('TC-3Q-069: action uses requirePermission', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('requirePermission')
  })

  it('TC-3Q-070: GetProposalFollowUpQueueActionInput includes due field', () => {
    const src = readSrc(QUEUE_ACTION)
    const ifaceStart = src.indexOf('export interface GetProposalFollowUpQueueActionInput')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('due?')
  })

  it('TC-3Q-071: GetProposalFollowUpQueueActionInput includes followUpSequence field', () => {
    const src = readSrc(QUEUE_ACTION)
    const ifaceStart = src.indexOf('export interface GetProposalFollowUpQueueActionInput')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('followUpSequence?')
  })

  it('TC-3Q-072: GetProposalFollowUpQueueActionInput includes proposalStatus field', () => {
    const src = readSrc(QUEUE_ACTION)
    const ifaceStart = src.indexOf('export interface GetProposalFollowUpQueueActionInput')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('proposalStatus?')
  })

  it('TC-3Q-073: GetProposalFollowUpQueueActionInput includes limit field', () => {
    const src = readSrc(QUEUE_ACTION)
    const ifaceStart = src.indexOf('export interface GetProposalFollowUpQueueActionInput')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('limit?')
  })

  it('TC-3Q-074: GetProposalFollowUpQueueActionInput includes offset field', () => {
    const src = readSrc(QUEUE_ACTION)
    const ifaceStart = src.indexOf('export interface GetProposalFollowUpQueueActionInput')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('offset?')
  })

  it('TC-3Q-075: action function is read-only — no insert, update, delete, or upsert', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueAction')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toMatch(/\.insert\(/)
    expect(fnBody).not.toMatch(/\.update\(/)
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toMatch(/\.upsert\(/)
  })

  it('TC-3Q-076: action does not reference sendEmail, Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3Q-077: action does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3Q-078: action does not reference scheduled_activities, calendar_event_id, or closed_reason', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('closed_reason')
  })

  it('TC-3Q-079: action does not export mutation functions (complete, skip, send, schedule)', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).not.toContain('completeFollowUpAction')
    expect(src).not.toContain('skipFollowUpAction')
    expect(src).not.toContain('sendFollowUpAction')
    expect(src).not.toContain('scheduleFollowUpAction')
  })

  it('TC-3Q-080: action calls sanitizeFollowUpQueueInput and passes sanitized result to service', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueAction')
    const fnBody = src.slice(fnStart)
    // Sanitized options (not raw input fields) are passed to the service
    expect(fnBody).toContain('sanitizeFollowUpQueueInput')
    expect(fnBody).toContain('getProposalFollowUpQueueForWorkspace')
  })

  it('TC-3Q-081: action returns success:true with items, summary, appliedFilters, generatedAt on success', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueAction')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('success: true')
    expect(fnBody).toContain('items')
    expect(fnBody).toContain('summary')
    expect(fnBody).toContain('appliedFilters')
    expect(fnBody).toContain('generatedAt')
  })

  it('TC-3Q-082: action returns success:false with error string on failure', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueAction')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('success: false')
    expect(fnBody).toContain('error')
  })

  it('TC-3Q-083: UI page for follow-up queue exists (created in Slice 6)', () => {
    expect(() => readSrc('app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx')).not.toThrow()
  })

  it('TC-3Q-084: action does not import from route handlers or next/server response utilities', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).not.toContain('NextResponse')
    expect(src).not.toContain('NextRequest')
    expect(src).not.toContain('route.ts')
  })

  it('TC-3Q-085: action imports ActionResult type from company.actions', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('company.actions')
  })

})

// ---------------------------------------------------------------------------
// Slice 5 — input validation / sanitization
// TC-3Q-086 through TC-3Q-100
// ---------------------------------------------------------------------------

describe('Slice 5: follow-up queue action — input sanitization', () => {

  it('TC-3Q-086: sanitizeDueFilter function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeDueFilter')
  })

  it('TC-3Q-087: sanitizeLimit function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeLimit')
  })

  it('TC-3Q-088: sanitizeOffset function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeOffset')
  })

  it('TC-3Q-089: sanitizeFollowUpSequence function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeFollowUpSequence')
  })

  it('TC-3Q-090: sanitizeProposalStatusFilter function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeProposalStatusFilter')
  })

  it('TC-3Q-091: sanitizeFollowUpQueueInput function is defined in action file', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('function sanitizeFollowUpQueueInput')
  })

  it('TC-3Q-092: LIMIT_MAX is defined as 100', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).toContain('LIMIT_MAX')
    expect(src).toContain('= 100')
  })

  it('TC-3Q-093: FOLLOW_UP_SEQUENCE_MAX is defined', () => {
    expect(readSrc(QUEUE_ACTION)).toContain('FOLLOW_UP_SEQUENCE_MAX')
  })

  it('TC-3Q-094: sanitizeLimit uses Math.min to clamp values at or below LIMIT_MAX', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('function sanitizeLimit')
    const fnBody = src.slice(fnStart, fnStart + 400)
    expect(fnBody).toContain('Math.min')
    expect(fnBody).toContain('LIMIT_MAX')
  })

  it('TC-3Q-095: sanitizeOffset rejects negative values', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('function sanitizeOffset')
    const fnBody = src.slice(fnStart, fnStart + 300)
    expect(fnBody).toContain('n < 0')
  })

  it('TC-3Q-096: sanitizeFollowUpSequence checks both min and max bounds', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('function sanitizeFollowUpSequence')
    const fnBody = src.slice(fnStart, fnStart + 400)
    expect(fnBody).toContain('FOLLOW_UP_SEQUENCE_MIN')
    expect(fnBody).toContain('FOLLOW_UP_SEQUENCE_MAX')
  })

  it('TC-3Q-097: sanitizeProposalStatusFilter trims strings', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('function sanitizeProposalStatusFilter')
    const fnBody = src.slice(fnStart, fnStart + 400)
    expect(fnBody).toContain('.trim()')
  })

  it('TC-3Q-098: sanitizeProposalStatusFilter filters out empty strings', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('function sanitizeProposalStatusFilter')
    const fnBody = src.slice(fnStart, fnStart + 400)
    expect(fnBody).toContain('.filter(')
    expect(fnBody).toContain('length > 0')
  })

  it('TC-3Q-099: action function body does not directly pass raw input fields to service — all go through sanitizer', () => {
    const src = readSrc(QUEUE_ACTION)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueAction')
    const fnBody = src.slice(fnStart)
    // Raw input field access must not appear inside the action function body
    expect(fnBody).not.toContain('input?.due')
    expect(fnBody).not.toContain('input?.followUpSequence')
    expect(fnBody).not.toContain('input?.proposalStatus')
    expect(fnBody).not.toContain('input?.limit')
    expect(fnBody).not.toContain('input?.offset')
  })

  it('TC-3Q-100: sanitizers use Number.isFinite and Number.isInteger for numeric validation', () => {
    const src = readSrc(QUEUE_ACTION)
    expect(src).toContain('Number.isFinite')
    expect(src).toContain('Number.isInteger')
  })

})
