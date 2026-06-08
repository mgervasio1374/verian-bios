// Goal 5 — Slice 11: Policy-Check Service Implementation
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-G5-S11-001 through TC-G5-S11-048

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel))
}

const typesPath = 'modules/verian-agent-bridge/review-queue/types.ts'
const auditTypesPath = 'modules/verian-agent-bridge/audit-ledger/types.ts'
const reviewerAuthPath = 'modules/verian-agent-bridge/review-queue/reviewer-authorization.ts'
const repoPath = 'modules/verian-agent-bridge/review-queue/review-queue.repo.ts'
const mapperPath = 'modules/verian-agent-bridge/review-queue/review-queue.mapper.ts'
const servicePath = 'modules/verian-agent-bridge/policy-check/policy-check.service.ts'

describe('Goal 5 Slice 11 — Policy-Check Service (TC-G5-S11-001–048)', () => {

  // ---------------------------------------------------------------------------
  // Section A — Type/Action Coverage (TC-G5-S11-001–012)
  // ---------------------------------------------------------------------------

  it("TC-G5-S11-001: VerianBridgeReviewQueueAction contains 'submit_for_policy_review'", () => {
    expect(read(typesPath)).toContain("'submit_for_policy_review'")
  })

  it("TC-G5-S11-002: VerianBridgeReviewQueueAction contains 'policy_check_passed'", () => {
    expect(read(typesPath)).toContain("'policy_check_passed'")
  })

  it("TC-G5-S11-003: VerianBridgeReviewQueueAction contains 'policy_check_warning'", () => {
    expect(read(typesPath)).toContain("'policy_check_warning'")
  })

  it("TC-G5-S11-004: VerianBridgeReviewQueueAction contains 'policy_check_blocked'", () => {
    expect(read(typesPath)).toContain("'policy_check_blocked'")
  })

  it("TC-G5-S11-005: VerianBridgeReviewQueueAction contains 'policy_check_requires_codex'", () => {
    expect(read(typesPath)).toContain("'policy_check_requires_codex'")
  })

  it("TC-G5-S11-006: VerianBridgeReviewQueueAction contains 'policy_check_requires_human'", () => {
    expect(read(typesPath)).toContain("'policy_check_requires_human'")
  })

  it("TC-G5-S11-007: VerianBridgeAuditEventType contains 'policy_review_submitted'", () => {
    expect(read(auditTypesPath)).toContain("'policy_review_submitted'")
  })

  it("TC-G5-S11-008: VerianBridgeAuditEventType still contains 'policy_check_passed'", () => {
    expect(read(auditTypesPath)).toContain("'policy_check_passed'")
  })

  it("TC-G5-S11-009: VerianBridgeAuditEventType still contains 'policy_check_warning'", () => {
    expect(read(auditTypesPath)).toContain("'policy_check_warning'")
  })

  it("TC-G5-S11-010: VerianBridgeAuditEventType still contains 'policy_check_blocked'", () => {
    expect(read(auditTypesPath)).toContain("'policy_check_blocked'")
  })

  it("TC-G5-S11-011: VerianBridgeAuditEventType still contains 'codex_review_required'", () => {
    expect(read(auditTypesPath)).toContain("'codex_review_required'")
  })

  it("TC-G5-S11-012: VerianBridgeAuditEventType still contains 'human_approval_requested'", () => {
    expect(read(auditTypesPath)).toContain("'human_approval_requested'")
  })

  // ---------------------------------------------------------------------------
  // Section B — Shared State Machine (TC-G5-S11-013–020)
  // ---------------------------------------------------------------------------

  it("TC-G5-S11-013: submit_for_policy_review is in the permitted map for draft_packet", () => {
    const src = read(reviewerAuthPath)
    expect(src).toMatch(/draft_packet:\s*\['submit_for_policy_review',\s*'archive'\]/)
  })

  it("TC-G5-S11-014: policy_check_passed is in the permitted map for pending_policy_review", () => {
    const src = read(reviewerAuthPath)
    const idx = src.indexOf('pending_policy_review:')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 400)
    expect(block).toContain("'policy_check_passed'")
  })

  it("TC-G5-S11-015: policy_check_blocked is in the permitted map for pending_policy_review", () => {
    const src = read(reviewerAuthPath)
    const idx = src.indexOf('pending_policy_review:')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 400)
    expect(block).toContain("'policy_check_blocked'")
  })

  it("TC-G5-S11-016: policy_check_requires_codex is in the permitted map for pending_policy_review", () => {
    const src = read(reviewerAuthPath)
    const idx = src.indexOf('pending_policy_review:')
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 400)
    expect(block).toContain("'policy_check_requires_codex'")
  })

  it('TC-G5-S11-017: policy-check service does NOT define a local permitted state-transition map', () => {
    const src = read(servicePath)
    expect(src).not.toMatch(/const permitted\s*[:=]/)
    expect(src).not.toMatch(/permitted\s*:\s*\{/)
  })

  it("TC-G5-S11-018: policy-check service does NOT transition to approved_for_manual_handoff", () => {
    expect(read(servicePath)).not.toContain("'approved_for_manual_handoff'")
  })

  it("TC-G5-S11-019: blocked_by_policy only permits archive in reviewer-authorization", () => {
    expect(read(reviewerAuthPath)).toContain("blocked_by_policy: ['archive']")
  })

  it("TC-G5-S11-020: archived permits no actions in reviewer-authorization", () => {
    expect(read(reviewerAuthPath)).toContain("archived: []")
  })

  // ---------------------------------------------------------------------------
  // Section C — Shared Actor Authorization (TC-G5-S11-021–026)
  // ---------------------------------------------------------------------------

  it('TC-G5-S11-021: reviewer-authorization contains policyActions group with all 6 policy actions', () => {
    const src = read(reviewerAuthPath)
    expect(src).toContain('policyActions')
    expect(src).toContain("'submit_for_policy_review'")
    expect(src).toContain("'policy_check_passed'")
    expect(src).toContain("'policy_check_warning'")
    expect(src).toContain("'policy_check_blocked'")
    expect(src).toContain("'policy_check_requires_codex'")
    expect(src).toContain("'policy_check_requires_human'")
  })

  it("TC-G5-S11-022: policy actions allow only 'system' and 'michael'", () => {
    const src = read(reviewerAuthPath)
    expect(src).toContain("actorType !== 'system' && actorType !== 'michael'")
  })

  it("TC-G5-S11-023: policy actions block 'agent' — agent not in allow-set", () => {
    const src = read(reviewerAuthPath)
    const idx = src.indexOf('policyActions')
    expect(idx).toBeGreaterThan(-1)
    const policyBlock = src.slice(idx, idx + 400)
    expect(policyBlock).not.toMatch(/actorType\s*===\s*'agent'/)
  })

  it("TC-G5-S11-024: policy actions block 'codex' — codex not in allow-set", () => {
    const src = read(reviewerAuthPath)
    const idx = src.indexOf('policyActions')
    expect(idx).toBeGreaterThan(-1)
    const policyBlock = src.slice(idx, idx + 400)
    expect(policyBlock).not.toMatch(/actorType\s*===\s*'codex'/)
  })

  it("TC-G5-S11-025: policy-check service throws when actorType michael and actorUserId absent", () => {
    const src = read(servicePath)
    expect(src).toContain('actorUserId is required')
  })

  it('TC-G5-S11-026: policy-check service calls assertReviewerIsWorkspaceMember before queue write', () => {
    expect(read(servicePath)).toContain('assertReviewerIsWorkspaceMember')
  })

  // ---------------------------------------------------------------------------
  // Section D — Repository Extension (TC-G5-S11-027–031)
  // ---------------------------------------------------------------------------

  it('TC-G5-S11-027: ReviewQueueStatusUpdate contains policyCheckStatus field', () => {
    expect(read(repoPath)).toContain('policyCheckStatus')
  })

  it('TC-G5-S11-028: updateReviewQueueItemStatus writes current_policy_check_status when provided', () => {
    const src = read(repoPath)
    expect(src).toContain('current_policy_check_status')
    expect(src).toContain('policyCheckStatus')
  })

  it('TC-G5-S11-029: review-queue.repo.ts still contains expectedCurrentStatus and .eq(status guard)', () => {
    const src = read(repoPath)
    expect(src).toContain('expectedCurrentStatus')
    expect(src).toContain(".eq('status', expectedCurrentStatus)")
  })

  it('TC-G5-S11-030: review-queue.repo.ts still throws StaleStateError', () => {
    expect(read(repoPath)).toContain('StaleStateError')
  })

  it('TC-G5-S11-031: review-queue.repo.ts does not contain .delete(', () => {
    expect(read(repoPath)).not.toContain('.delete(')
  })

  // ---------------------------------------------------------------------------
  // Section E — Service Safety (TC-G5-S11-032–042)
  // ---------------------------------------------------------------------------

  it('TC-G5-S11-032: policy-check service file exists and is non-empty', () => {
    expect(exists(servicePath)).toBe(true)
    expect(read(servicePath).trim().length).toBeGreaterThan(0)
  })

  it('TC-G5-S11-033: policy-check service exports submitForPolicyReview', () => {
    expect(read(servicePath)).toContain('submitForPolicyReview')
  })

  it('TC-G5-S11-034: policy-check service exports markPolicyCheckPassed, markPolicyCheckWarning, markPolicyCheckBlocked', () => {
    const src = read(servicePath)
    expect(src).toContain('markPolicyCheckPassed')
    expect(src).toContain('markPolicyCheckWarning')
    expect(src).toContain('markPolicyCheckBlocked')
  })

  it('TC-G5-S11-035: policy-check service exports markPolicyCheckRequiresCodex, markPolicyCheckRequiresHuman', () => {
    const src = read(servicePath)
    expect(src).toContain('markPolicyCheckRequiresCodex')
    expect(src).toContain('markPolicyCheckRequiresHuman')
  })

  it('TC-G5-S11-036: policy-check service imports audit-ledger service', () => {
    expect(read(servicePath)).toContain('audit-ledger')
  })

  it('TC-G5-S11-037: policy-check service calls getTaskPacketById and uses packet.policy_id', () => {
    const src = read(servicePath)
    expect(src).toContain('getTaskPacketById')
    expect(src).toContain('packet.policy_id')
  })

  it('TC-G5-S11-038: policy-check service does NOT use current.current_policy_check_status', () => {
    expect(read(servicePath)).not.toContain('current.current_policy_check_status')
  })

  it('TC-G5-S11-039: policy-check service contains dryRunOnly: true', () => {
    expect(read(servicePath)).toContain('dryRunOnly: true')
  })

  it('TC-G5-S11-040: policy-check service does NOT contain executionAuthorized: true or execution_authorized', () => {
    const src = read(servicePath)
    expect(src).not.toContain('executionAuthorized: true')
    expect(src).not.toContain('execution_authorized')
  })

  it('TC-G5-S11-041: policy-check service does NOT contain model provider imports', () => {
    const src = read(servicePath)
    expect(src).not.toMatch(/\bopenai\b/i)
    expect(src).not.toMatch(/\banthropic\b/i)
    expect(src).not.toMatch(/\bqwen\b/i)
    expect(src).not.toMatch(/codex-cli/i)
  })

  it('TC-G5-S11-042: policy-check service does NOT contain sending controls, fetch, Inngest, cron, or webhook', () => {
    const src = read(servicePath)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    expect(src).not.toContain('fetch(')
    expect(src).not.toMatch(/\bInngest\b/)
    expect(src).not.toMatch(/\bcron\b/i)
    expect(src).not.toMatch(/\bwebhook\b/i)
  })

  // ---------------------------------------------------------------------------
  // Section F — Directory Inventory (TC-G5-S11-043–044)
  // ---------------------------------------------------------------------------

  it('TC-G5-S11-043: policy-check directory exists and contains policy-check.service.ts', () => {
    expect(exists('modules/verian-agent-bridge/policy-check/policy-check.service.ts')).toBe(true)
  })

  it('TC-G5-S11-044: test file itself exists', () => {
    expect(exists('tests/goal5-slice-11-policy-check-service.test.ts')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Section G — Mapper (TC-G5-S11-045–048)
  // ---------------------------------------------------------------------------

  it('TC-G5-S11-045: review-queue.mapper.ts exists', () => {
    expect(exists(mapperPath)).toBe(true)
  })

  it('TC-G5-S11-046: review-queue.mapper.ts exports mapRowAndPacketToQueueItem', () => {
    expect(read(mapperPath)).toContain('mapRowAndPacketToQueueItem')
  })

  it('TC-G5-S11-047: review-queue.mapper.ts uses packet.policy_id and packet.agent_id — no placeholders', () => {
    const src = read(mapperPath)
    expect(src).toContain('packet.policy_id')
    expect(src).toContain('packet.agent_id')
    expect(src).not.toContain("policyId: ''")
    expect(src).not.toContain("agentId: ''")
  })

  it('TC-G5-S11-048: review-queue.mapper.ts does NOT import from review-queue.service', () => {
    expect(read(mapperPath)).not.toContain('review-queue.service')
  })
})
