// Goal 5 Slice 10 — Bridge Audit Ledger + Codex Review Repository/Service
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-G5-S10-001 through TC-G5-S10-018

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

function stripComments(sql: string): string {
  return sql.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')
}

const auditRepoPath = 'modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts'
const codexRepoPath = 'modules/verian-agent-bridge/codex-reviews/codex-review.repo.ts'
const auditServicePath = 'modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts'

describe('Goal 5 Slice 10 — Audit Ledger + Codex Review Repo/Service (TC-G5-S10-001–018)', () => {

  // -------------------------------------------------------------------------
  // TC-G5-S10-001: audit-ledger.repo.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-001: audit-ledger.repo.ts exists and is non-empty', () => {
    expect(exists(auditRepoPath)).toBe(true)
    expect(read(auditRepoPath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-002: codex-review.repo.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-002: codex-review.repo.ts exists and is non-empty', () => {
    expect(exists(codexRepoPath)).toBe(true)
    expect(read(codexRepoPath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-003: audit-ledger.service.ts exists and is non-empty
  // -------------------------------------------------------------------------
  it('TC-G5-S10-003: audit-ledger.service.ts exists and is non-empty', () => {
    expect(exists(auditServicePath)).toBe(true)
    expect(read(auditServicePath).trim().length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-004: audit-ledger.repo.ts exports appendAuditEvent
  // -------------------------------------------------------------------------
  it('TC-G5-S10-004: audit-ledger.repo.ts exports appendAuditEvent', () => {
    const src = read(auditRepoPath)
    expect(src).toContain('export async function appendAuditEvent')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-005: audit-ledger.repo.ts exports getAuditEventsForPacket
  // -------------------------------------------------------------------------
  it('TC-G5-S10-005: audit-ledger.repo.ts exports getAuditEventsForPacket', () => {
    const src = read(auditRepoPath)
    expect(src).toContain('export async function getAuditEventsForPacket')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-006: audit-ledger.repo.ts does NOT contain .update( (append-only)
  // -------------------------------------------------------------------------
  it('TC-G5-S10-006: audit-ledger.repo.ts does not contain .update( (append-only invariant)', () => {
    const src = stripComments(read(auditRepoPath))
    expect(src).not.toContain('.update(')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-007: audit-ledger.repo.ts does not export update* or delete* functions
  // -------------------------------------------------------------------------
  it('TC-G5-S10-007: audit-ledger.repo.ts does not export update* or delete* functions', () => {
    const src = read(auditRepoPath)
    expect(src).not.toMatch(/export (async )?function (update|delete)/i)
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-008: audit-ledger.repo.ts uses createSupabaseServiceClient
  // -------------------------------------------------------------------------
  it('TC-G5-S10-008: audit-ledger.repo.ts uses createSupabaseServiceClient', () => {
    const src = read(auditRepoPath)
    expect(src).toContain('createSupabaseServiceClient')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-009: audit-ledger.repo.ts does NOT use createSupabaseServerClient
  // -------------------------------------------------------------------------
  it('TC-G5-S10-009: audit-ledger.repo.ts does not use createSupabaseServerClient', () => {
    const src = read(auditRepoPath)
    expect(src).not.toContain('createSupabaseServerClient')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-010: audit-ledger.repo.ts scopes queries by tenant_id
  // -------------------------------------------------------------------------
  it("TC-G5-S10-010: audit-ledger.repo.ts scopes queries by tenant_id", () => {
    const src = read(auditRepoPath)
    expect(src).toContain(".eq('tenant_id',")
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-011: audit-ledger.repo.ts scopes queries by workspace_id
  // -------------------------------------------------------------------------
  it("TC-G5-S10-011: audit-ledger.repo.ts scopes queries by workspace_id", () => {
    const src = read(auditRepoPath)
    expect(src).toContain(".eq('workspace_id',")
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-012: audit-ledger.service.ts enforces dryRunOnly guard
  // -------------------------------------------------------------------------
  it('TC-G5-S10-012: audit-ledger.service.ts enforces dryRunOnly guard', () => {
    const src = read(auditServicePath)
    expect(src).toContain('dryRunOnly')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-013: audit-ledger.service.ts does not contain execution_authorized
  // -------------------------------------------------------------------------
  it('TC-G5-S10-013: audit-ledger.service.ts does not contain execution_authorized', () => {
    const src = read(auditServicePath)
    expect(src).not.toContain('execution_authorized')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-014: codex-review.repo.ts exports appendCodexReview
  // -------------------------------------------------------------------------
  it('TC-G5-S10-014: codex-review.repo.ts exports appendCodexReview', () => {
    const src = read(codexRepoPath)
    expect(src).toContain('export async function appendCodexReview')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-015: codex-review.repo.ts does NOT contain .update( (immutable)
  // -------------------------------------------------------------------------
  it('TC-G5-S10-015: codex-review.repo.ts does not contain .update( (immutable after insert)', () => {
    const src = stripComments(read(codexRepoPath))
    expect(src).not.toContain('.update(')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-016: codex-review.repo.ts uses createSupabaseServiceClient
  // -------------------------------------------------------------------------
  it('TC-G5-S10-016: codex-review.repo.ts uses createSupabaseServiceClient', () => {
    const src = read(codexRepoPath)
    expect(src).toContain('createSupabaseServiceClient')
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-017: no file contains EMAIL_SENDING_ENABLED
  // -------------------------------------------------------------------------
  it('TC-G5-S10-017: audit ledger and codex review files do not contain EMAIL_SENDING_ENABLED', () => {
    for (const p of [auditRepoPath, codexRepoPath, auditServicePath]) {
      expect(read(p)).not.toContain('EMAIL_SENDING_ENABLED')
    }
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-018: no file contains send-related imports or CAMPAIGN_SENDING_ENABLED
  // -------------------------------------------------------------------------
  it('TC-G5-S10-018: audit ledger and codex review files have no send path imports', () => {
    for (const p of [auditRepoPath, codexRepoPath, auditServicePath]) {
      const src = read(p)
      expect(src).not.toContain('send-bridge')
      expect(src).not.toContain('email-send.actions')
      expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
    }
  })

  // -------------------------------------------------------------------------
  // TC-G5-S10-042: audit-ledger.service.ts does not contain the no-op self-comparison
  // -------------------------------------------------------------------------
  it('TC-G5-S10-042: audit-ledger.service.ts does not contain no-op taskId self-comparison', () => {
    const src = read(auditServicePath)
    expect(src).not.toContain('request.taskId !== request.taskId')
  })
})
