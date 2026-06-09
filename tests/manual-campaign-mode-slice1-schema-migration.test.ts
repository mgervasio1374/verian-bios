// Manual Campaign Mode — Migration 20240045: Add sender_identity_id and authoring_mode to campaign_sequences
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.
// TC-MM1-01 through TC-MM1-08

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

const migrationPath = 'supabase/migrations/20240045_mcm1_campaign_sequence_sender_and_mode.sql'

describe('Manual Campaign Mode Migration 20240045 — sender_identity_id and authoring_mode (TC-MM1-01–08)', () => {

  // ---------------------------------------------------------------------------
  // Section A — File existence
  // ---------------------------------------------------------------------------

  it('TC-MM1-01: migration file exists and is non-empty', () => {
    expect(exists(migrationPath)).toBe(true)
    expect(read(migrationPath).trim().length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Section B — Column shape (TC-MM1-02–03)
  // ---------------------------------------------------------------------------

  it('TC-MM1-02: sender_identity_id is uuid, nullable, FK to sender_identities, ON DELETE SET NULL', () => {
    const sql = read(migrationPath)
    // Column declaration
    expect(sql).toContain('sender_identity_id')
    expect(sql).toContain('uuid')
    // Nullable — must not declare NOT NULL for this column.
    // Locate the ADD COLUMN declaration (not the comment mention) for scoped checks.
    const senderColIdx = sql.indexOf('ADD COLUMN sender_identity_id')
    expect(senderColIdx).toBeGreaterThan(-1)
    const senderColBlock = sql.slice(senderColIdx, senderColIdx + 140)
    expect(senderColBlock).not.toMatch(/NOT\s+NULL/i)
    // FK target and delete behaviour
    expect(sql).toContain('REFERENCES sender_identities(id)')
    expect(sql).toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
    // NULL keyword present (explicit NULL declaration in the ADD COLUMN block)
    expect(senderColBlock).toContain('NULL')
  })

  it('TC-MM1-03: authoring_mode is NOT NULL, DEFAULT template, CHECK over the 3 allowed values', () => {
    const sql = read(migrationPath)
    expect(sql).toContain('authoring_mode')
    expect(sql).toMatch(/authoring_mode\s+text\s+NOT\s+NULL/i)
    expect(sql).toMatch(/DEFAULT\s+'template'/i)
    // All three CHECK values present
    expect(sql).toContain("'manual'")
    expect(sql).toContain("'ai_assisted'")
    expect(sql).toContain("'template'")
    // The CHECK constraint references all three values together
    expect(sql).toContain("authoring_mode IN ('manual', 'ai_assisted', 'template')")
  })

  // ---------------------------------------------------------------------------
  // Section C — Additive-only enforcement (TC-MM1-05)
  // ---------------------------------------------------------------------------

  it('TC-MM1-05: migration is additive — no DROP/CREATE TABLE/INSERT/UPDATE/DELETE; only ALTER targets campaign_sequences', () => {
    const executableSql = stripSqlComments(read(migrationPath))

    // No destructive DDL
    expect(executableSql).not.toMatch(/\bDROP\b/i)
    expect(executableSql).not.toMatch(/CREATE\s+TABLE/i)

    // No DML — use DML-specific patterns to avoid false positives from FK
    // reference action clauses like ON DELETE SET NULL.
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(executableSql).not.toMatch(/\bUPDATE\s+\w/i)
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(executableSql).not.toMatch(/\bTRUNCATE\b/i)

    // Any ALTER TABLE must only target campaign_sequences
    const alterMatches = [...executableSql.matchAll(/ALTER\s+TABLE\s+(\S+)/gi)]
    expect(alterMatches.length).toBeGreaterThan(0)
    for (const match of alterMatches) {
      expect(match[1].toLowerCase()).toBe('campaign_sequences')
    }
  })

  // ---------------------------------------------------------------------------
  // Section D — No policy or grant changes (TC-MM1-06)
  // ---------------------------------------------------------------------------

  it('TC-MM1-06: migration contains no CREATE POLICY, GRANT, or REVOKE statements', () => {
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
  // Section E — Header and safety boundary (TC-MM1-08)
  // ---------------------------------------------------------------------------

  it('TC-MM1-08: file contains standard header block and "Safety boundary" section', () => {
    const sql = read(migrationPath)
    // Standard header markers
    expect(sql).toContain('Migration: 20240045')
    expect(sql).toContain('Applies to: campaign_sequences only')
    // Safety boundary section
    expect(sql).toContain('Safety boundary:')
    // Confirms no-touch assertions are documented in the header
    expect(sql).toContain('No DROP')
    expect(sql).toContain('no grants')
  })

})
