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

// Strip single-line SQL comment lines so forbidden-token checks test actual
// SQL and are not confused by comment documentation of what is NOT present.
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
}

const migPath = 'supabase/migrations/20240043_bridge_review_queue_audit_revoke_maintain.sql'
const src = read(migPath)
const sql = stripComments(src)

const bridgeTables = [
  'bridge_task_packets',
  'bridge_review_queue_items',
  'bridge_audit_events',
  'bridge_codex_reviews',
] as const

// ---------------------------------------------------------------------------
// TC-G5-S9-001  Migration file exists
// ---------------------------------------------------------------------------

describe('TC-G5-S9-001 migration file exists', () => {
  it('20240043 MAINTAIN-revoke migration file is present', () => {
    expect(exists(migPath)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S9-002  Migration touches only the four approved bridge tables
// ---------------------------------------------------------------------------

describe('TC-G5-S9-002 migration scope is limited to four bridge tables', () => {
  it('all four approved bridge tables appear in the migration SQL', () => {
    for (const table of bridgeTables) {
      expect(sql).toContain(table)
    }
  })

  it('migration SQL does not reference tables outside the four bridge tables', () => {
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
// TC-G5-S9-003  Required REVOKE MAINTAIN statement is present
// ---------------------------------------------------------------------------

describe('TC-G5-S9-003 REVOKE MAINTAIN is present', () => {
  it('migration REVOKEs MAINTAIN from authenticated and anon', () => {
    const idx = sql.indexOf('REVOKE MAINTAIN')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 500)
    expect(block).toContain('FROM authenticated, anon')
  })

  it('REVOKE MAINTAIN block covers all four bridge tables', () => {
    const idx = sql.indexOf('REVOKE MAINTAIN')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 500)
    for (const table of bridgeTables) {
      expect(block).toContain(table)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S9-004  Migration does not grant any privilege to anon
// ---------------------------------------------------------------------------

describe('TC-G5-S9-004 no grant to anon', () => {
  it('migration SQL contains no GRANT ... TO anon statement', () => {
    expect(sql).not.toContain('TO anon')
    expect(sql).not.toContain('TO PUBLIC')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S9-005  Posture confirmation grants are present if included
// ---------------------------------------------------------------------------

describe('TC-G5-S9-005 posture confirmation grants', () => {
  it('migration GRANTs SELECT to authenticated', () => {
    const idx = sql.indexOf('GRANT SELECT')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 300)
    expect(block).toContain('TO authenticated')
  })

  it('GRANT SELECT block covers all four bridge tables', () => {
    const idx = sql.indexOf('GRANT SELECT')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 300)
    for (const table of bridgeTables) {
      expect(block).toContain(table)
    }
  })

  it('migration GRANTs ALL to service_role', () => {
    const idx = sql.indexOf('GRANT ALL')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 300)
    expect(block).toContain('TO service_role')
  })

  it('GRANT ALL block covers all four bridge tables', () => {
    const idx = sql.indexOf('GRANT ALL')
    expect(idx).toBeGreaterThan(-1)
    const block = sql.slice(idx, idx + 300)
    for (const table of bridgeTables) {
      expect(block).toContain(table)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S9-006  Migration does not alter schema shape
// ---------------------------------------------------------------------------

describe('TC-G5-S9-006 no schema shape changes', () => {
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

  it('migration SQL contains no index or trigger creation', () => {
    expect(sql).not.toContain('CREATE INDEX')
    expect(sql).not.toContain('CREATE TRIGGER')
    expect(sql).not.toContain('DROP TRIGGER')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S9-007  Migration contains no forbidden runtime/behavioral SQL
// ---------------------------------------------------------------------------

describe('TC-G5-S9-007 no runtime or behavioral SQL', () => {
  it('migration SQL contains no DML', () => {
    expect(sql).not.toContain('INSERT INTO')
    expect(sql).not.toContain('DELETE FROM')
    expect(sql).not.toContain('CREATE FUNCTION')
    expect(sql).not.toContain('CREATE TYPE')
  })

  it('migration SQL contains no automation or execution constructs', () => {
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
// TC-G5-S9-008  20240041 and 20240042 were not modified
// ---------------------------------------------------------------------------

describe('TC-G5-S9-008 prior migrations are unmodified', () => {
  it('20240041 migration file still exists', () => {
    expect(exists('supabase/migrations/20240041_bridge_review_queue_audit_ledger.sql')).toBe(true)
  })

  it('20240042 migration file still exists', () => {
    expect(exists('supabase/migrations/20240042_bridge_review_queue_audit_grant_hardening.sql')).toBe(true)
  })
})
