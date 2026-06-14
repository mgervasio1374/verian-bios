// Goal 5 — Slice 12: Bridge Intake Orchestration Service
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// 49 automated checks: TC-G5-S12-001 through TC-G5-S12-047 (including 026a and 026b)
// TC-G5-S12-048 is a process gate only — not a Vitest test

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '..')
const svcPath = 'modules/verian-agent-bridge/intake/bridge-intake.service.ts'

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel))
}

const src = read(svcPath)

// Locate the submitBridgeRequest function body for source-order checks.
// This scopes ordering assertions to call positions, never to import lines.
const fnBodyStart = src.indexOf('export async function submitBridgeRequest')
const fnBody = fnBodyStart >= 0 ? src.slice(fnBodyStart) : src

describe('Goal 5 Slice 12 — Bridge Intake Orchestration Service (TC-G5-S12-001–048)', () => {

  // ---------------------------------------------------------------------------
  // Section A — File Existence (TC-G5-S12-001–004)
  // ---------------------------------------------------------------------------

  it('TC-G5-S12-001: bridge-intake.service.ts exists and is non-empty', () => {
    expect(exists(svcPath)).toBe(true)
    expect(src.trim().length).toBeGreaterThan(0)
  })

  it('TC-G5-S12-002: goal5-slice-12-bridge-intake-service.test.ts exists', () => {
    expect(exists('tests/goal5-slice-12-bridge-intake-service.test.ts')).toBe(true)
  })

  it('TC-G5-S12-003: intake/ directory contains exactly one file', () => {
    const intakeDir = path.join(root, 'modules/verian-agent-bridge/intake')
    const files = fs.readdirSync(intakeDir).sort()
    expect(files).toEqual(['bridge-intake.service.ts'])
  })

  it('TC-G5-S12-004: review-queue/, audit-ledger/, policy-check/, task-packets/ directories unchanged from Slice 11', () => {
    const rq = fs.readdirSync(path.join(root, 'modules/verian-agent-bridge/review-queue')).sort()
    expect(rq).toEqual([
      'review-queue.mapper.ts',
      'review-queue.repo.ts',
      'review-queue.service.ts',
      'reviewer-authorization.ts',
      'types.ts',
    ])

    const al = fs.readdirSync(path.join(root, 'modules/verian-agent-bridge/audit-ledger')).sort()
    expect(al).toEqual(['audit-ledger.repo.ts', 'audit-ledger.service.ts', 'types.ts'])

    const pc = fs.readdirSync(path.join(root, 'modules/verian-agent-bridge/policy-check')).sort()
    expect(pc).toEqual(['policy-check.service.ts'])

    const tp = fs.readdirSync(path.join(root, 'modules/verian-agent-bridge/task-packets')).sort()
    expect(tp).toEqual(['task-packet.repo.ts'])
  })

  // ---------------------------------------------------------------------------
  // Section B — Exports and Type Shape (TC-G5-S12-005–012)
  // ---------------------------------------------------------------------------

  it('TC-G5-S12-005: source contains export async function submitBridgeRequest', () => {
    expect(src).toContain('export async function submitBridgeRequest')
  })

  it('TC-G5-S12-006: source contains export type BridgeIntakeContext', () => {
    expect(src).toContain('export type BridgeIntakeContext')
  })

  it('TC-G5-S12-007: source contains export type BridgeIntakeResult', () => {
    expect(src).toContain('export type BridgeIntakeResult')
  })

  it("TC-G5-S12-008: BridgeIntakeResult discriminated union contains both 'blocked' and 'submitted'", () => {
    const resultIdx = src.indexOf('export type BridgeIntakeResult')
    expect(resultIdx).toBeGreaterThan(-1)
    expect(src).toContain("status: 'blocked'")
    expect(src).toContain("status: 'submitted'")
  })

  it('TC-G5-S12-009: dryRunResult field appears in both result variants (at least 2 occurrences)', () => {
    const matches = src.match(/dryRunResult/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('TC-G5-S12-010: source contains queueItem field (in submitted result)', () => {
    expect(src).toContain('queueItem')
  })

  it("TC-G5-S12-011: BridgeIntakeContext.actorType is 'michael' | 'system' — does not include 'agent' or 'codex'", () => {
    const ctxIdx = src.indexOf('export type BridgeIntakeContext')
    expect(ctxIdx).toBeGreaterThan(-1)
    // Find the closing brace of BridgeIntakeContext
    const closingBrace = src.indexOf('}', ctxIdx)
    const ctxBlock = src.slice(ctxIdx, closingBrace + 1)
    expect(ctxBlock).toContain("'michael' | 'system'")
    expect(ctxBlock).not.toContain("'agent'")
    expect(ctxBlock).not.toContain("'codex'")
  })

  it('TC-G5-S12-012: source contains readonly dryRunOnly: true in submitted result type', () => {
    expect(src).toContain('readonly dryRunOnly: true')
  })

  // ---------------------------------------------------------------------------
  // Section C — Dependency References (TC-G5-S12-013–018)
  // ---------------------------------------------------------------------------

  it("TC-G5-S12-013: service imports from 'dry-run.service'", () => {
    expect(src).toContain('dry-run.service')
  })

  it("TC-G5-S12-014: service imports from 'review-queue.service'", () => {
    expect(src).toContain('review-queue.service')
  })

  it("TC-G5-S12-015: service imports from 'policy-check.service'", () => {
    expect(src).toContain('policy-check.service')
  })

  it('TC-G5-S12-016: source references buildVerianBridgeDryRunPacket', () => {
    expect(src).toContain('buildVerianBridgeDryRunPacket')
  })

  it('TC-G5-S12-017: source references submitPacketToQueue', () => {
    expect(src).toContain('submitPacketToQueue')
  })

  it('TC-G5-S12-018: source references submitForPolicyReview', () => {
    expect(src).toContain('submitForPolicyReview')
  })

  // ---------------------------------------------------------------------------
  // Section D — Blocked Path Contract (TC-G5-S12-019–026b)
  // ---------------------------------------------------------------------------

  it("TC-G5-S12-019: source contains guard on dryRunResult.status === 'blocked'", () => {
    expect(src).toContain("dryRunResult.status === 'blocked'")
  })

  it("TC-G5-S12-020: source contains status: 'blocked' return literal", () => {
    expect(src).toContain("status: 'blocked'")
  })

  it("TC-G5-S12-021: status: 'blocked' return appears before await submitPacketToQueue( call (guard-before-write)", () => {
    const blockedIdx = fnBody.indexOf("status: 'blocked'")
    const callIdx = fnBody.indexOf('await submitPacketToQueue(')
    expect(blockedIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(blockedIdx).toBeLessThan(callIdx)
  })

  it('TC-G5-S12-022: source contains dryRunResult.summary (blocked reason sourced from dry-run)', () => {
    expect(src).toContain('dryRunResult.summary')
  })

  it('TC-G5-S12-023: service does not call insertTaskPacket or insertReviewQueueItem directly', () => {
    expect(src).not.toContain('insertTaskPacket')
    expect(src).not.toContain('insertReviewQueueItem')
  })

  it('TC-G5-S12-024: blocked return objects contain dryRunResult', () => {
    // Every status: 'blocked' return block should carry dryRunResult
    const blockedReturns = [...src.matchAll(/status:\s*'blocked'/g)]
    expect(blockedReturns.length).toBeGreaterThan(0)
    // The function body contains dryRunResult near each blocked return
    expect(fnBody).toContain('dryRunResult,')
  })

  it('TC-G5-S12-025: service does not call appendAuditEvent directly', () => {
    expect(src).not.toContain('appendAuditEvent')
  })

  it('TC-G5-S12-026: blocked result does not include queueItem assignment', () => {
    // Scope to the function body to avoid matching the type definition region
    const blockedIdx = fnBody.indexOf("status: 'blocked'")
    const nextSubmittedIdx = fnBody.indexOf("status: 'submitted'")
    const blockedRegion = fnBody.slice(blockedIdx, nextSubmittedIdx > 0 ? nextSubmittedIdx : undefined)
    expect(blockedRegion).not.toContain('queueItem:')
  })

  it("TC-G5-S12-026a: source contains actorUserId preflight guard with actorType === 'michael' and 'actorUserId is required'", () => {
    expect(src).toContain("ctx.actorType === 'michael'")
    expect(src).toContain('actorUserId is required')
    // Confirm there is a status: 'blocked' return that includes this reason
    expect(src).toContain("reason: 'actorUserId is required for michael intake submissions'")
  })

  it("TC-G5-S12-026b: actorUserId preflight guard appears before await submitPacketToQueue( call (in function body)", () => {
    const guardIdx = fnBody.indexOf("actorType === 'michael'")
    const callIdx = fnBody.indexOf('await submitPacketToQueue(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(callIdx)
  })

  // ---------------------------------------------------------------------------
  // Section E — Submitted Path Contract (TC-G5-S12-027–034)
  // ---------------------------------------------------------------------------

  it("TC-G5-S12-027: service uses initialState: 'draft_packet' and not 'pending_policy_review' as initial state", () => {
    expect(src).toContain("initialState: 'draft_packet'")
    expect(src).not.toContain("initialState: 'pending_policy_review'")
  })

  it('TC-G5-S12-028: await submitForPolicyReview( call appears after await submitPacketToQueue( call (in function body)', () => {
    const queueCallIdx = fnBody.indexOf('await submitPacketToQueue(')
    const policyCallIdx = fnBody.indexOf('await submitForPolicyReview(')
    expect(queueCallIdx).toBeGreaterThan(-1)
    expect(policyCallIdx).toBeGreaterThan(-1)
    expect(policyCallIdx).toBeGreaterThan(queueCallIdx)
  })

  it("TC-G5-S12-029: source contains status: 'submitted' return literal", () => {
    expect(src).toContain("status: 'submitted'")
  })

  it('TC-G5-S12-030: submitted return statement contains queueItem and dryRunResult', () => {
    const submittedIdx = fnBody.indexOf("status: 'submitted'")
    expect(submittedIdx).toBeGreaterThan(-1)
    const submittedBlock = fnBody.slice(submittedIdx, submittedIdx + 200)
    expect(submittedBlock).toContain('queueItem')
    expect(submittedBlock).toContain('dryRunResult')
  })

  it('TC-G5-S12-031: source contains dryRunOnly: true in submitted result return', () => {
    expect(src).toContain('dryRunOnly: true')
  })

  it("TC-G5-S12-032: service does not pass initialState: 'pending_policy_review' to submitPacketToQueue", () => {
    expect(src).not.toContain("initialState: 'pending_policy_review'")
  })

  it('TC-G5-S12-033: service does not set executionAuthorized: true anywhere', () => {
    expect(src).not.toContain('executionAuthorized: true')
  })

  it("TC-G5-S12-034: service does not transition any item to 'approved_for_manual_handoff'", () => {
    expect(src).not.toContain("'approved_for_manual_handoff'")
  })

  // ---------------------------------------------------------------------------
  // Section F — Safety Invariants (TC-G5-S12-035–042)
  // ---------------------------------------------------------------------------

  it('TC-G5-S12-035: service does not contain executionAuthorized: true', () => {
    expect(src).not.toContain('executionAuthorized: true')
  })

  it('TC-G5-S12-036: source contains at least one dryRunOnly: true literal', () => {
    const matches = src.match(/dryRunOnly:\s*true/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('TC-G5-S12-037: service does not import model provider SDKs', () => {
    expect(src).not.toMatch(/openai/i)
    expect(src).not.toMatch(/anthropic/i)
    expect(src).not.toMatch(/qwen/i)
    expect(src).not.toContain('codex-cli')
  })

  it('TC-G5-S12-038: service does not contain sending control flags', () => {
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-G5-S12-039: service does not contain fetch(, process.env, Inngest, cron, or webhook', () => {
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('process.env')
    expect(src).not.toMatch(/Inngest/i)
    expect(src).not.toMatch(/\bcron\b/i)
    expect(src).not.toMatch(/webhook/i)
  })

  it('TC-G5-S12-040: service does not define a local permitted state-transition map', () => {
    expect(src).not.toMatch(/const permitted\s*[:=]/)
    expect(src).not.toMatch(/permitted\s*:\s*\{/)
  })

  it('TC-G5-S12-041: only actorUserId preflight uses actorType === michael; no ReviewerAuthorizationError', () => {
    // The only 'michael' actorType check is the intake-level actorUserId preflight
    const michaelMatches = [...src.matchAll(/actorType\s*===\s*'michael'/g)]
    expect(michaelMatches.length).toBeGreaterThanOrEqual(1)
    // Downstream authorization errors must not be thrown from the intake service
    expect(src).not.toContain('ReviewerAuthorizationError')
  })

  it('TC-G5-S12-042: service does not call appendAuditEvent or auditRepo directly', () => {
    expect(src).not.toContain('appendAuditEvent')
    expect(src).not.toContain('auditRepo')
  })

  // ---------------------------------------------------------------------------
  // Section G — No-Go Area Enforcement (TC-G5-S12-043–048)
  // ---------------------------------------------------------------------------

  it('TC-G5-S12-043: service does not import from audit-ledger.repo', () => {
    expect(src).not.toContain('audit-ledger.repo')
  })

  it('TC-G5-S12-044: service does not import from review-queue.repo', () => {
    expect(src).not.toContain('review-queue.repo')
  })

  it('TC-G5-S12-045: service does not import from task-packet.repo', () => {
    expect(src).not.toContain('task-packet.repo')
  })

  it('TC-G5-S12-046: service does not import from codex-review.repo', () => {
    expect(src).not.toContain('codex-review.repo')
  })

  it('TC-G5-S12-047: no new migration file with prefix 20240055 or higher exists (20240054 added by MCM v2 AI usage cost backfill)', () => {
    const migrationsDir = path.join(root, 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const newMigrations = files.filter(f => {
      const match = f.match(/^(\d+)/)
      if (!match) return false
      return parseInt(match[1], 10) >= 20240055
    })
    expect(newMigrations).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // TC-G5-S12-048 — PROCESS GATE (not an automated test)
  // ---------------------------------------------------------------------------
  //
  // Before locking Slice 12, run manually:
  //   git status --short
  // Confirm that docs/roadmap/operational-twin-north-star.md appears only as ?? (untracked)
  // or is absent. It must never be staged, modified, or committed.
  // This is a developer pre-lock verification step, not a Vitest assertion.
  //
})
