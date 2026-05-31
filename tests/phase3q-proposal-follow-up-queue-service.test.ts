/**
 * Phase 3Q — Proposal Follow-Up Work Queue
 * Test suite: source-reading tier — Slice 3 (service / read aggregation layer)
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
// Service path
// ---------------------------------------------------------------------------

const QUEUE_SERVICE = 'modules/proposals/services/proposal-follow-up-queue.service.ts'

// ---------------------------------------------------------------------------
// Slice 3 — getProposalFollowUpQueueForWorkspace service
// TC-3Q-035 through TC-3Q-060
// ---------------------------------------------------------------------------

describe('Slice 3: follow-up queue service — getProposalFollowUpQueueForWorkspace', () => {

  it('TC-3Q-035: service file exists and is readable', () => {
    expect(() => readSrc(QUEUE_SERVICE)).not.toThrow()
  })

  it('TC-3Q-036: ProposalFollowUpQueueSummary interface is exported', () => {
    expect(readSrc(QUEUE_SERVICE)).toContain('export interface ProposalFollowUpQueueSummary')
  })

  it('TC-3Q-037: ProposalFollowUpQueueFilters interface is exported', () => {
    expect(readSrc(QUEUE_SERVICE)).toContain('export interface ProposalFollowUpQueueFilters')
  })

  it('TC-3Q-038: GetProposalFollowUpQueueResult type is exported', () => {
    expect(readSrc(QUEUE_SERVICE)).toContain('export type GetProposalFollowUpQueueResult')
  })

  it('TC-3Q-039: ProposalFollowUpQueueResponse interface is exported', () => {
    expect(readSrc(QUEUE_SERVICE)).toContain('export interface ProposalFollowUpQueueResponse')
  })

  it('TC-3Q-040: getProposalFollowUpQueueForWorkspace function is exported', () => {
    expect(readSrc(QUEUE_SERVICE)).toContain('export async function getProposalFollowUpQueueForWorkspace')
  })

  it('TC-3Q-041: service imports listProposalFollowUpQueueItemsForWorkspace from commitments repo', () => {
    const src = readSrc(QUEUE_SERVICE)
    expect(src).toContain('listProposalFollowUpQueueItemsForWorkspace')
    expect(src).toContain('proposal-follow-up-commitments.repo')
  })

  it('TC-3Q-042: service function accepts tenantId and workspaceId parameters', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnSig = src.slice(fnStart, fnStart + 200)
    expect(fnSig).toContain('tenantId')
    expect(fnSig).toContain('workspaceId')
  })

  it('TC-3Q-043: service result type includes ok:true success path', () => {
    const src = readSrc(QUEUE_SERVICE)
    const typeStart = src.indexOf('export type GetProposalFollowUpQueueResult')
    const typeBody = src.slice(typeStart, typeStart + 300)
    expect(typeBody).toContain('ok: true')
  })

  it('TC-3Q-044: service result type includes ok:false with load_failed error', () => {
    const src = readSrc(QUEUE_SERVICE)
    const typeStart = src.indexOf('export type GetProposalFollowUpQueueResult')
    const typeBody = src.slice(typeStart, typeStart + 300)
    expect(typeBody).toContain('ok: false')
    expect(typeBody).toContain("'load_failed'")
  })

  it('TC-3Q-045: ProposalFollowUpQueueResponse includes items field', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueResponse')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('items')
    expect(ifaceBody).toContain('ProposalFollowUpQueueItem')
  })

  it('TC-3Q-046: ProposalFollowUpQueueSummary includes totalReturned', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueSummary')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 400)
    expect(ifaceBody).toContain('totalReturned')
  })

  it('TC-3Q-047: overdueCount uses now (not dayStart) to match queue filter semantics', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    // overdueCount must compare against `now`, not `dayStart`
    expect(fnBody).toContain('overdueCount')
    // The filter expression for overdue must use `< now` not `< dayStart`
    expect(fnBody).toMatch(/overdueCount\s*=\s*items\.filter\(i => new Date\(i\.follow_up_due_at\) < now\)/)
  })

  it('TC-3Q-048: todayCount uses UTC calendar-day boundaries (dayStart / dayEnd)', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('todayCount')
    expect(fnBody).toContain('dayStart')
    expect(fnBody).toContain('dayEnd')
  })

  it('TC-3Q-049: upcomingCount uses now (not dayEnd) to match queue filter semantics', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    // upcomingCount must compare against `now`, not `dayEnd`
    expect(fnBody).toContain('upcomingCount')
    expect(fnBody).toMatch(/upcomingCount\s*=\s*items\.filter\(i => new Date\(i\.follow_up_due_at\) >= now\)/)
  })

  it('TC-3Q-050: ProposalFollowUpQueueResponse includes appliedFilters field', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueResponse')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('appliedFilters')
    expect(ifaceBody).toContain('ProposalFollowUpQueueFilters')
  })

  it('TC-3Q-051: ProposalFollowUpQueueFilters includes due field', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueFilters')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('due')
  })

  it('TC-3Q-052: appliedFilters defaults limit to 100 when not provided', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('?? 100')
  })

  it('TC-3Q-053: appliedFilters defaults offset to 0 when not provided', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).toContain('?? 0')
  })

  it('TC-3Q-054: ProposalFollowUpQueueResponse includes generatedAt field', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueResponse')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 300)
    expect(ifaceBody).toContain('generatedAt')
  })

  it('TC-3Q-055: service function is read-only — no insert, update, delete, or upsert', () => {
    const src = readSrc(QUEUE_SERVICE)
    const fnStart = src.indexOf('export async function getProposalFollowUpQueueForWorkspace')
    const fnBody = src.slice(fnStart)
    expect(fnBody).not.toMatch(/\.insert\(/)
    expect(fnBody).not.toMatch(/\.update\(/)
    expect(fnBody).not.toMatch(/\.delete\(/)
    expect(fnBody).not.toMatch(/\.upsert\(/)
  })

  it('TC-3Q-056: service does not reference sendEmail, Resend, Inngest, OpenAI, or Anthropic', () => {
    const src = readSrc(QUEUE_SERVICE)
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('Resend')
    expect(src).not.toContain('Inngest')
    expect(src).not.toContain('OpenAI')
    expect(src).not.toContain('Anthropic')
  })

  it('TC-3Q-057: service does not reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED', () => {
    const src = readSrc(QUEUE_SERVICE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-3Q-058: service does not reference scheduled_activities, calendar_event_id, or closed_reason', () => {
    const src = readSrc(QUEUE_SERVICE)
    expect(src).not.toContain('scheduled_activities')
    expect(src).not.toContain('calendar_event_id')
    expect(src).not.toContain('closed_reason')
  })

  it('TC-3Q-059: summary uses returned-row-only naming — counts not claimed as global DB totals', () => {
    const src = readSrc(QUEUE_SERVICE)
    const ifaceStart = src.indexOf('export interface ProposalFollowUpQueueSummary')
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 500)
    // All four count fields use names that scope them to returned rows
    expect(ifaceBody).toContain('totalReturned')
    expect(ifaceBody).toContain('overdueCount')
    expect(ifaceBody).toContain('todayCount')
    expect(ifaceBody).toContain('upcomingCount')
    // Must NOT claim to be global totals
    expect(ifaceBody).not.toContain('totalInWorkspace')
    expect(ifaceBody).not.toContain('globalOverdueCount')
  })

  it('TC-3Q-060: server action file for follow-up queue exists (created in Slice 4)', () => {
    expect(() => readSrc('modules/proposals/actions/proposal-follow-up-queue.actions.ts')).not.toThrow()
  })

})
