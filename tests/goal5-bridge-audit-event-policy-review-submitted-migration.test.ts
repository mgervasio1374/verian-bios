// Goal 5 — Migration 20240044: Add policy_review_submitted to bridge_audit_events.event_type CHECK
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-G5-M44-001 through TC-G5-M44-035

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

// Strip SQL line comments (-- ...) before scanning for forbidden executable terms.
// Safety/stop-condition language in comments intentionally mentions prohibited terms;
// comment-only matches must not create false positives.
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map(line => {
      const commentIdx = line.indexOf('--')
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line
    })
    .join('\n')
}

const migrationPath = 'supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql'

describe('Goal 5 Migration 20240044 — Add policy_review_submitted to bridge_audit_events (TC-G5-M44-001–035)', () => {

  // ---------------------------------------------------------------------------
  // Section A — File existence and scope
  // ---------------------------------------------------------------------------

  it('TC-G5-M44-001: migration file exists and is non-empty', () => {
    expect(exists(migrationPath)).toBe(true)
    expect(read(migrationPath).trim().length).toBeGreaterThan(0)
  })

  it('TC-G5-M44-002: migration references bridge_audit_events', () => {
    expect(read(migrationPath)).toContain('bridge_audit_events')
  })

  it('TC-G5-M44-003: migration does NOT reference bridge_task_packets', () => {
    expect(stripSqlComments(read(migrationPath))).not.toContain('bridge_task_packets')
  })

  it('TC-G5-M44-004: migration does NOT reference bridge_review_queue_items', () => {
    expect(stripSqlComments(read(migrationPath))).not.toContain('bridge_review_queue_items')
  })

  // ---------------------------------------------------------------------------
  // Section B — Event type completeness
  // ---------------------------------------------------------------------------

  it('TC-G5-M44-005: migration references event_type', () => {
    expect(read(migrationPath)).toContain('event_type')
  })

  it("TC-G5-M44-006: migration includes 'policy_review_submitted'", () => {
    expect(read(migrationPath)).toContain("'policy_review_submitted'")
  })

  it("TC-G5-M44-007: migration includes 'packet_created'", () => {
    expect(read(migrationPath)).toContain("'packet_created'")
  })

  it("TC-G5-M44-008: migration includes 'policy_check_passed'", () => {
    expect(read(migrationPath)).toContain("'policy_check_passed'")
  })

  it("TC-G5-M44-009: migration includes 'policy_check_warning'", () => {
    expect(read(migrationPath)).toContain("'policy_check_warning'")
  })

  it("TC-G5-M44-010: migration includes 'policy_check_blocked'", () => {
    expect(read(migrationPath)).toContain("'policy_check_blocked'")
  })

  it("TC-G5-M44-011: migration includes 'human_approval_requested'", () => {
    expect(read(migrationPath)).toContain("'human_approval_requested'")
  })

  it("TC-G5-M44-012: migration includes 'human_approved'", () => {
    expect(read(migrationPath)).toContain("'human_approved'")
  })

  it("TC-G5-M44-013: migration includes 'human_denied'", () => {
    expect(read(migrationPath)).toContain("'human_denied'")
  })

  it("TC-G5-M44-014: migration includes 'revision_requested'", () => {
    expect(read(migrationPath)).toContain("'revision_requested'")
  })

  it("TC-G5-M44-015: migration includes 'codex_review_required'", () => {
    expect(read(migrationPath)).toContain("'codex_review_required'")
  })

  it("TC-G5-M44-016: migration includes 'codex_review_received'", () => {
    expect(read(migrationPath)).toContain("'codex_review_received'")
  })

  it("TC-G5-M44-017: migration includes 'manual_handoff_prepared'", () => {
    expect(read(migrationPath)).toContain("'manual_handoff_prepared'")
  })

  it("TC-G5-M44-018: migration includes 'packet_archived'", () => {
    expect(read(migrationPath)).toContain("'packet_archived'")
  })

  // ---------------------------------------------------------------------------
  // Section C — Excluded action names (not DB event_type values)
  // ---------------------------------------------------------------------------

  it("TC-G5-M44-019: executable SQL does not include 'policy_check_requires_codex' as a DB event_type value", () => {
    // policy_check_requires_codex is a queue action name; its audit event type
    // maps to the existing codex_review_required. It must not appear as a DB value.
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toContain("'policy_check_requires_codex'")
  })

  it("TC-G5-M44-020: executable SQL does not include 'policy_check_requires_human' as a DB event_type value", () => {
    // policy_check_requires_human is a queue action name; its audit event type
    // maps to the existing human_approval_requested. It must not appear as a DB value.
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toContain("'policy_check_requires_human'")
  })

  // ---------------------------------------------------------------------------
  // Section D — Schema safety
  // ---------------------------------------------------------------------------

  it('TC-G5-M44-021: executable SQL does not contain CREATE TABLE', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/CREATE\s+TABLE/i)
  })

  it('TC-G5-M44-022: executable SQL does not contain DROP TABLE', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/DROP\s+TABLE/i)
  })

  it('TC-G5-M44-023: executable SQL does not add columns (no ADD COLUMN)', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/ADD\s+COLUMN/i)
  })

  it('TC-G5-M44-024: executable SQL does not create indexes (no CREATE INDEX)', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/CREATE\s+INDEX/i)
  })

  it('TC-G5-M44-025: executable SQL does not drop indexes (no DROP INDEX)', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/DROP\s+INDEX/i)
  })

  it('TC-G5-M44-026: executable SQL does not alter RLS (no ENABLE/DISABLE ROW LEVEL SECURITY)', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(executableSql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  })

  it('TC-G5-M44-027: executable SQL does not alter policies (no CREATE/DROP POLICY)', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/CREATE\s+POLICY/i)
    expect(executableSql).not.toMatch(/DROP\s+POLICY/i)
  })

  it('TC-G5-M44-028: executable SQL does not alter grants (no GRANT or REVOKE)', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/\bGRANT\b/i)
    expect(executableSql).not.toMatch(/\bREVOKE\b/i)
  })

  it('TC-G5-M44-029: executable SQL does not contain ON DELETE CASCADE', () => {
    expect(stripSqlComments(read(migrationPath))).not.toMatch(/ON\s+DELETE\s+CASCADE/i)
  })

  it('TC-G5-M44-030: executable SQL does not contain execution_authorized', () => {
    expect(stripSqlComments(read(migrationPath))).not.toContain('execution_authorized')
  })

  // ---------------------------------------------------------------------------
  // Section E — DML and automation safety (scanned on executable SQL only)
  // ---------------------------------------------------------------------------

  it('TC-G5-M44-031: executable SQL does not contain DML statements', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/\bINSERT\b/i)
    expect(executableSql).not.toMatch(/\bUPDATE\b/i)
    expect(executableSql).not.toMatch(/\bDELETE\b/i)
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i)
  })

  it('TC-G5-M44-032: executable SQL does not contain automation or HTTP behavior', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/\bhttp\b/i)
    expect(executableSql).not.toMatch(/\bwebhook\b/i)
    expect(executableSql).not.toMatch(/\bcron\b/i)
    expect(executableSql).not.toMatch(/\binngest\b/i)
    expect(executableSql).not.toContain('job_queue')
  })

  it('TC-G5-M44-033: executable SQL does not reference model providers', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/\bopenai\b/i)
    expect(executableSql).not.toMatch(/\banthropicai\b|\banthropic\b/i)
    expect(executableSql).not.toMatch(/\bqwen\b/i)
  })

  it('TC-G5-M44-034: executable SQL does not contain sending controls', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toContain('EMAIL_SENDING_ENABLED')
    expect(executableSql).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-G5-M44-035: executable SQL does not create functions or triggers', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/CREATE\s+FUNCTION/i)
    expect(executableSql).not.toMatch(/CREATE\s+TRIGGER/i)
  })
})
