// Manual Campaign Mode — Migration 20240046: Add campaign_sequence_id to campaign_assignments
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-MM6-01 through TC-MM6-08

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

// Strip SQL line comments (-- ...) before scanning for forbidden executable terms.
// Safety/boundary language in comments intentionally mentions prohibited terms;
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

const migrationPath = 'supabase/migrations/20240046_mcm6_campaign_assignment_sequence_link.sql'

describe('Manual Campaign Mode Migration 20240046 — campaign_sequence_id on campaign_assignments (TC-MM6-01–08)', () => {

  // ---------------------------------------------------------------------------
  // Section A — File existence (TC-MM6-01)
  // ---------------------------------------------------------------------------

  it('TC-MM6-01: migration file exists and is non-empty', () => {
    expect(exists(migrationPath)).toBe(true)
    expect(read(migrationPath).trim().length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Section B — Column shape (TC-MM6-02)
  // ---------------------------------------------------------------------------

  it('TC-MM6-02: campaign_sequence_id is uuid, nullable, FK to campaign_sequences, ON DELETE SET NULL', () => {
    const sql = read(migrationPath)
    // Column name present
    expect(sql).toContain('campaign_sequence_id')
    // uuid type
    expect(sql).toContain('uuid')
    // Scoped check: locate the ADD COLUMN declaration
    const colIdx = sql.indexOf('ADD COLUMN campaign_sequence_id')
    expect(colIdx).toBeGreaterThan(-1)
    const colBlock = sql.slice(colIdx, colIdx + 160)
    // Must be nullable — not NOT NULL
    expect(colBlock).not.toMatch(/NOT\s+NULL/i)
    // Explicit NULL keyword in the declaration
    expect(colBlock).toContain('NULL')
    // FK target
    expect(sql).toContain('REFERENCES campaign_sequences(id)')
    // Delete behaviour
    expect(sql).toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
  })

  // ---------------------------------------------------------------------------
  // Section C — Partial index (TC-MM6-03)
  // ---------------------------------------------------------------------------

  it('TC-MM6-03: partial index on campaign_sequence_id WHERE IS NOT NULL', () => {
    const sql = read(migrationPath)
    expect(sql).toContain('idx_campaign_assignments_sequence')
    expect(sql).toContain('CREATE INDEX idx_campaign_assignments_sequence')
    expect(sql).toContain('ON campaign_assignments (campaign_sequence_id)')
    expect(sql).toMatch(/WHERE\s+campaign_sequence_id\s+IS\s+NOT\s+NULL/i)
  })

  // ---------------------------------------------------------------------------
  // Section D — Target table is campaign_assignments (TC-MM6-04)
  // ---------------------------------------------------------------------------

  it('TC-MM6-04: only campaign_assignments is altered; no other table is touched', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    const alterMatches = [...executableSql.matchAll(/ALTER\s+TABLE\s+(\S+)/gi)]
    expect(alterMatches.length).toBeGreaterThan(0)
    for (const match of alterMatches) {
      expect(match[1].toLowerCase()).toBe('campaign_assignments')
    }
    // CREATE INDEX must target campaign_assignments
    const indexMatches = [...executableSql.matchAll(/ON\s+(\S+)\s+\(/gi)]
    expect(indexMatches.length).toBeGreaterThan(0)
    for (const match of indexMatches) {
      expect(match[1].toLowerCase()).toBe('campaign_assignments')
    }
  })

  // ---------------------------------------------------------------------------
  // Section E — Additive-only enforcement (TC-MM6-05)
  // ---------------------------------------------------------------------------

  it('TC-MM6-05: migration is additive — no DROP/CREATE TABLE/INSERT/UPDATE/DELETE', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    // No destructive DDL
    expect(executableSql).not.toMatch(/\bDROP\b/i)
    expect(executableSql).not.toMatch(/CREATE\s+TABLE/i)
    // No DML — use DML-specific patterns to avoid false positives from FK clauses
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(executableSql).not.toMatch(/\bUPDATE\s+\w/i)
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i)
  })

  // ---------------------------------------------------------------------------
  // Section F — No policy or grant changes (TC-MM6-06)
  // ---------------------------------------------------------------------------

  it('TC-MM6-06: migration contains no CREATE POLICY, GRANT, REVOKE, or RLS statements', () => {
    const executableSql = stripSqlComments(read(migrationPath))
    expect(executableSql).not.toMatch(/CREATE\s+POLICY/i)
    expect(executableSql).not.toMatch(/DROP\s+POLICY/i)
    expect(executableSql).not.toMatch(/ALTER\s+POLICY/i)
    expect(executableSql).not.toMatch(/\bGRANT\b/i)
    expect(executableSql).not.toMatch(/\bREVOKE\b/i)
    expect(executableSql).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(executableSql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  })

  // ---------------------------------------------------------------------------
  // Section G — RLS policy inheritance note (TC-MM6-07)
  // ---------------------------------------------------------------------------

  it('TC-MM6-07: header names the inherited RLS policies and cites migration 20240036', () => {
    const sql = read(migrationPath)
    // Both policy names that campaign_assignments carries
    expect(sql).toContain('campaign_assignments_select')
    expect(sql).toContain('campaign_assignments_service_role')
    // Cites the originating migration so the inheritance claim is verifiable
    expect(sql).toContain('20240036')
  })

  // ---------------------------------------------------------------------------
  // Section H — Header and safety boundary (TC-MM6-08)
  // ---------------------------------------------------------------------------

  it('TC-MM6-08: file contains standard header block and "Safety boundary" section', () => {
    const sql = read(migrationPath)
    // Standard header markers
    expect(sql).toContain('Migration: 20240046')
    expect(sql).toContain('Applies to: campaign_assignments only')
    // Safety boundary section
    expect(sql).toContain('Safety boundary:')
    // Confirms no-touch assertions are documented
    expect(sql).toContain('No DROP')
    expect(sql).toContain('no grants')
  })

})
