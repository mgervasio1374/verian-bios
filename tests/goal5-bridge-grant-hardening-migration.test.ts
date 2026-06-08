import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '..')

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n')
}

// Strip single-line SQL comment lines (-- ...) so forbidden-token checks test
// actual SQL and are not confused by comment documentation of what is NOT present.
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
}

const migPath = 'supabase/migrations/20240042_bridge_review_queue_audit_grant_hardening.sql'
const src = read(migPath)
const sql = stripComments(src)

const bridgeTables = [
  'bridge_task_packets',
  'bridge_review_queue_items',
  'bridge_audit_events',
  'bridge_codex_reviews',
] as const

// ---------------------------------------------------------------------------
// TC-G5-S8-001  Migration file exists
// ---------------------------------------------------------------------------

describe('TC-G5-S8-001 migration file exists', () => {
  it('20240042 grant-hardening migration file is present', () => {
    expect(exists(migPath)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-002  Migration touches only the four approved bridge tables
// ---------------------------------------------------------------------------

describe('TC-G5-S8-002 migration scope is limited to four bridge tables', () => {
  it('all four approved bridge tables appear in the migration SQL', () => {
    for (const table of bridgeTables) {
      expect(sql).toContain(table)
    }
  })

  it('migration SQL does not reference any table outside the four bridge tables', () => {
    const forbidden = [
      'campaign_types',
      'campaign_sequences',
      'campaign_sequence_steps',
      'campaign_schedule_items',
      'tenants',
      'workspaces',
      'users',
      'email_drafts',
      'approval_requests',
    ]
    for (const table of forbidden) {
      expect(sql).not.toContain(table)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-003  Required REVOKE statements are present
// ---------------------------------------------------------------------------

describe('TC-G5-S8-003 required REVOKE statements', () => {
  it('migration REVOKEs INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER from authenticated and anon', () => {
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    expect(sql).toContain('FROM authenticated, anon')
  })

  it('migration REVOKEs SELECT from anon', () => {
    // Look for REVOKE SELECT block followed by FROM anon
    const revokeSelectIdx = sql.indexOf('REVOKE SELECT')
    expect(revokeSelectIdx).toBeGreaterThan(-1)
    const afterRevoke = sql.slice(revokeSelectIdx, revokeSelectIdx + 400)
    expect(afterRevoke).toContain('FROM anon')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-004  Required GRANT statements are present
// ---------------------------------------------------------------------------

describe('TC-G5-S8-004 required GRANT statements', () => {
  it('migration GRANTs SELECT to authenticated', () => {
    const grantSelectIdx = sql.indexOf('GRANT SELECT')
    expect(grantSelectIdx).toBeGreaterThan(-1)
    const afterGrant = sql.slice(grantSelectIdx, grantSelectIdx + 300)
    expect(afterGrant).toContain('TO authenticated')
  })

  it('migration GRANTs ALL to service_role', () => {
    const grantAllIdx = sql.indexOf('GRANT ALL')
    expect(grantAllIdx).toBeGreaterThan(-1)
    const afterGrant = sql.slice(grantAllIdx, grantAllIdx + 300)
    expect(afterGrant).toContain('TO service_role')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-005  Migration does not alter schema shape
// ---------------------------------------------------------------------------

describe('TC-G5-S8-005 no schema shape changes', () => {
  it('migration SQL contains no DDL that creates or modifies tables', () => {
    expect(sql).not.toContain('CREATE TABLE')
    expect(sql).not.toContain('DROP TABLE')
    expect(sql).not.toContain('ALTER TABLE')
  })

  it('migration SQL contains no RLS policy changes', () => {
    expect(sql).not.toContain('CREATE POLICY')
    expect(sql).not.toContain('DROP POLICY')
    expect(sql).not.toContain('ALTER POLICY')
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY')
  })

  it('migration SQL contains no ON DELETE CASCADE', () => {
    expect(sql).not.toContain('ON DELETE CASCADE')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-006  Migration contains no forbidden runtime/behavioral SQL
// ---------------------------------------------------------------------------

describe('TC-G5-S8-006 no runtime or behavioral SQL', () => {
  it('migration SQL contains no DML or schema-mutating statements', () => {
    const forbidden = [
      'INSERT INTO',
      'UPDATE ',
      'DELETE FROM',
      'CREATE FUNCTION',
      'CREATE TRIGGER',
      'DROP TRIGGER',
      'CREATE TYPE',
      'CREATE INDEX',
    ]
    for (const token of forbidden) {
      expect(sql).not.toContain(token)
    }
  })

  it('migration SQL contains no automation, background, or execution constructs', () => {
    const forbidden = [
      'execution_authorized',
      'EMAIL_SENDING_ENABLED',
      'CAMPAIGN_SENDING_ENABLED',
      'webhook',
      'pg_cron',
      'job_queue',
      'Inngest',
    ]
    for (const token of forbidden) {
      expect(sql.toLowerCase()).not.toContain(token.toLowerCase())
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-007  20240041 was not modified
// ---------------------------------------------------------------------------

describe('TC-G5-S8-007 20240041 is unmodified', () => {
  it('20240041 migration file still exists and was not deleted', () => {
    expect(exists('supabase/migrations/20240041_bridge_review_queue_audit_ledger.sql')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-008  Grant posture expressed per-table
// ---------------------------------------------------------------------------

describe('TC-G5-S8-008 grant posture expressed for each bridge table', () => {
  it('REVOKE write-privileges block covers all four bridge tables', () => {
    const start = sql.indexOf('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    expect(start).toBeGreaterThan(-1)
    const revokeBlock = sql.slice(start, start + 500)
    for (const table of bridgeTables) {
      expect(revokeBlock).toContain(table)
    }
  })

  it('REVOKE SELECT block covers all four bridge tables', () => {
    const start = sql.indexOf('REVOKE SELECT')
    expect(start).toBeGreaterThan(-1)
    const revokeSelectBlock = sql.slice(start, start + 400)
    for (const table of bridgeTables) {
      expect(revokeSelectBlock).toContain(table)
    }
  })

  it('GRANT SELECT block covers all four bridge tables', () => {
    const start = sql.indexOf('GRANT SELECT')
    expect(start).toBeGreaterThan(-1)
    const grantSelectBlock = sql.slice(start, start + 300)
    for (const table of bridgeTables) {
      expect(grantSelectBlock).toContain(table)
    }
  })

  it('GRANT ALL block covers all four bridge tables', () => {
    const start = sql.indexOf('GRANT ALL')
    expect(start).toBeGreaterThan(-1)
    const grantAllBlock = sql.slice(start, start + 300)
    for (const table of bridgeTables) {
      expect(grantAllBlock).toContain(table)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S8-009  Migration does not contain self-apply instructions in SQL
// ---------------------------------------------------------------------------

describe('TC-G5-S8-009 no self-apply instructions in SQL', () => {
  it('migration SQL does not contain apply or push commands', () => {
    expect(sql).not.toContain('supabase migration up')
    expect(sql).not.toContain('supabase db push')
    expect(sql).not.toContain('db reset')
  })
})
