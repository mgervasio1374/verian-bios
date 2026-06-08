// Goal 5 Slice 10 — Bridge Review Queue Repository/Service/Authorization
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-G5-S10-019 through TC-G5-S10-036

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

function stripComments(src: string): string {
  return src.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')
}

const queueRepoPath = 'modules/verian-agent-bridge/review-queue/review-queue.repo.ts'
const queueServicePath = 'modules/verian-agent-bridge/review-queue/review-queue.service.ts'
const reviewerAuthPath = 'modules/verian-agent-bridge/review-queue/reviewer-authorization.ts'
const taskPacketRepoPath = 'modules/verian-agent-bridge/task-packets/task-packet.repo.ts'

describe('Goal 5 Slice 10 — Review Queue Repo/Service/Authorization (TC-G5-S10-019–036)', () => {

  // -------------------------------------------------------------------------
  // TC-G5-S10-019: review-queue.repo.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-019: review-queue.repo.ts exists and is non-empty', () => {
    expect(exists(queueRepoPath)).toBe(true)
    expect(read(queueRepoPath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-020: review-queue.service.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-020: review-queue.service.ts exists and is non-empty', () => {
    expect(exists(queueServicePath)).toBe(true)
    expect(read(queueServicePath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-021: reviewer-authorization.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-021: reviewer-authorization.ts exists and is non-empty', () => {
    expect(exists(reviewerAuthPath)).toBe(true)
    expect(read(reviewerAuthPath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-022: review-queue.repo.ts uses createSupabaseServiceClient
  // -------------------------------------------------------------------------
  it('TC-G5-S10-022: review-queue.repo.ts uses createSupabaseServiceClient', () => {
    const src = read(queueRepoPath)
    expect(src).toContain('createSupabaseServiceClient')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-023: review-queue.repo.ts does NOT use createSupabaseServerClient
  // -------------------------------------------------------------------------
  it('TC-G5-S10-023: review-queue.repo.ts does not use createSupabaseServerClient', () => {
    const src = read(queueRepoPath)
    expect(src).not.toContain('createSupabaseServerClient')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-024: review-queue.repo.ts does not export delete* functions
  // -------------------------------------------------------------------------
  it('TC-G5-S10-024: review-queue.repo.ts does not export delete* functions', () => {
    const src = read(queueRepoPath)
    expect(src).not.toMatch(/export (async )?function delete/i)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-025: 'archived' is used as terminal state (not a .delete( call)
  // -------------------------------------------------------------------------
  it("TC-G5-S10-025: 'archived' is the terminal state; no .delete( in queue files", () => {
    const repoSrc = stripComments(read(queueRepoPath))
    const svcSrc = stripComments(read(queueServicePath))
    expect(repoSrc + svcSrc).toContain("'archived'")
    expect(repoSrc).not.toContain('.delete(')
    expect(svcSrc).not.toContain('.delete(')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-026: review-queue.service.ts imports and calls audit ledger service
  // -------------------------------------------------------------------------
  it('TC-G5-S10-026: review-queue.service.ts imports audit ledger service for audit co-write', () => {
    const src = read(queueServicePath)
    expect(src).toContain('audit-ledger')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-027: review-queue.service.ts contains executionAuthorized: false literal
  // -------------------------------------------------------------------------
  it('TC-G5-S10-027: review-queue.service.ts returns executionAuthorized: false', () => {
    const src = read(queueServicePath)
    expect(src).toContain('executionAuthorized: false')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-028: review-queue.service.ts does NOT contain executionAuthorized: true
  // -------------------------------------------------------------------------
  it('TC-G5-S10-028: review-queue.service.ts does not contain executionAuthorized: true', () => {
    const src = read(queueServicePath)
    expect(src).not.toContain('executionAuthorized: true')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-029: review-queue.service.ts contains dryRunOnly: true in approval
  // -------------------------------------------------------------------------
  it('TC-G5-S10-029: review-queue.service.ts contains dryRunOnly: true in approval return', () => {
    const src = read(queueServicePath)
    expect(src).toContain('dryRunOnly: true')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-030: reviewer-authorization.ts exports assertReviewerIsWorkspaceMember
  // -------------------------------------------------------------------------
  it('TC-G5-S10-030: reviewer-authorization.ts exports assertReviewerIsWorkspaceMember', () => {
    const src = read(reviewerAuthPath)
    expect(src).toContain('export async function assertReviewerIsWorkspaceMember')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-031: review-queue.service.ts calls assertReviewerIsWorkspaceMember
  // -------------------------------------------------------------------------
  it('TC-G5-S10-031: review-queue.service.ts calls assertReviewerIsWorkspaceMember before transitions', () => {
    const src = read(queueServicePath)
    expect(src).toContain('assertReviewerIsWorkspaceMember')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-032: review-queue.repo.ts scopes queries by tenant_id
  // -------------------------------------------------------------------------
  it("TC-G5-S10-032: review-queue.repo.ts scopes queries by tenant_id", () => {
    const src = read(queueRepoPath)
    expect(src).toContain(".eq('tenant_id',")
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-033: review-queue.repo.ts scopes queries by workspace_id
  // -------------------------------------------------------------------------
  it("TC-G5-S10-033: review-queue.repo.ts scopes queries by workspace_id", () => {
    const src = read(queueRepoPath)
    expect(src).toContain(".eq('workspace_id',")
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-034: review-queue service/repo do not contain sending controls
  // -------------------------------------------------------------------------
  it('TC-G5-S10-034: review-queue service/repo have no EMAIL_ or CAMPAIGN_SENDING_ENABLED', () => {
    for (const p of [queueRepoPath, queueServicePath, reviewerAuthPath]) {
      const src = read(p)
      expect(src).not.toContain('EMAIL_SENDING_ENABLED')
      expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    }
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-035: review-queue service/repo do not contain model provider imports
  // -------------------------------------------------------------------------
  it('TC-G5-S10-035: review-queue service/repo have no model provider imports', () => {
    for (const p of [queueRepoPath, queueServicePath, reviewerAuthPath]) {
      const src = read(p)
      expect(src).not.toContain('openai')
      expect(src).not.toContain('anthropic')
      expect(src).not.toContain('qwen')
    }
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-036: no file contains executionAuthorized: true
  // -------------------------------------------------------------------------
  it('TC-G5-S10-036: no bridge service/repo file contains executionAuthorized: true', () => {
    for (const p of [queueRepoPath, queueServicePath, reviewerAuthPath, taskPacketRepoPath]) {
      if (exists(p)) {
        expect(read(p)).not.toContain('executionAuthorized: true')
      }
    }
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-037: human transitions throw (not silently skip) when actorUserId absent
  // -------------------------------------------------------------------------
  it('TC-G5-S10-037: review-queue.service.ts throws ReviewerAuthorizationError when actorUserId is absent for human transitions', () => {
    const src = read(queueServicePath)
    // requireActorUserId helper must exist and throw ReviewerAuthorizationError
    expect(src).toContain('actorUserId is required')
    expect(src).toContain('throw new ReviewerAuthorizationError')
    // The old silent-skip pattern (optional membership check) must not appear for michael-only functions
    expect(src).not.toContain('if (ctx.actorUserId)')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-038: review-queue.repo.ts enforces expected-current-status conflict guard
  // -------------------------------------------------------------------------
  it('TC-G5-S10-038: review-queue.repo.ts enforces expected-current-status conflict guard', () => {
    const src = read(queueRepoPath)
    expect(src).toContain('expectedCurrentStatus')
    expect(src).toContain(".eq('status', expectedCurrentStatus)")
    expect(src).toContain('StaleStateError')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-039: review-queue.service.ts does not use current_policy_check_status as audit policyId
  // -------------------------------------------------------------------------
  it('TC-G5-S10-039: review-queue.service.ts does not pass current_policy_check_status as audit policyId', () => {
    const src = read(queueServicePath)
    expect(src).not.toContain('policyId: current.current_policy_check_status')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-040: review-queue.service.ts fetches task packet for audit policy_id
  // -------------------------------------------------------------------------
  it('TC-G5-S10-040: review-queue.service.ts fetches task packet and uses packet.policy_id for audit events', () => {
    const src = read(queueServicePath)
    expect(src).toContain('getTaskPacketById')
    expect(src).toContain('packet.policy_id')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-041: review-queue.service.ts has no placeholder metadata
  // -------------------------------------------------------------------------
  it("TC-G5-S10-041: review-queue.service.ts does not contain policyId empty string placeholder", () => {
    const src = read(queueServicePath)
    expect(src).not.toContain("policyId: ''")
    expect(src).not.toContain("agentId: ''")
  })
})
