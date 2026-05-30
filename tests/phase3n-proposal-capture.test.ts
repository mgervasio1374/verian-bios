/**
 * Phase 3N — Proposal Capture & Follow-Up Commitment
 * Test suite: source-reading and pure-function tiers
 *
 * Slice 1: TC-3N-001–015, TC-3N-141–142 (migration + types)
 * Later slices add TC-3N-016–140, TC-3N-143–148 incrementally.
 *
 * Pattern: fs.readFileSync + toContain / not.toContain
 * No Supabase mocking. No LLM mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = path.resolve(__dirname, '..')

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf-8')
}

// ---------------------------------------------------------------------------
// Slice 1 — Data Model, Migration, Test Harness
// TC-3N-001–015, TC-3N-141–142
// ---------------------------------------------------------------------------

const MIGRATION = 'supabase/migrations/20240038_phase3n_proposal_capture.sql'
const TYPES = 'types/database.ts'

describe('Slice 1: Migration 20240038', () => {
  it('TC-3N-001: migration file exists', () => {
    expect(() => readSrc(MIGRATION)).not.toThrow()
  })

  it('TC-3N-002: contains CREATE TABLE proposal_events', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_events')
  })

  it('TC-3N-003: contains CREATE TABLE proposal_captures', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_captures')
  })

  it('TC-3N-004: contains CREATE TABLE proposal_follow_up_commitments', () => {
    expect(readSrc(MIGRATION)).toContain('CREATE TABLE proposal_follow_up_commitments')
  })

  it('TC-3N-005: contains company_id column', () => {
    expect(readSrc(MIGRATION)).toContain('company_id')
  })

  it('TC-3N-006: does NOT reference accounts.domain', () => {
    expect(readSrc(MIGRATION)).not.toContain('accounts.domain')
  })

  it('TC-3N-007: contains attachments_count', () => {
    expect(readSrc(MIGRATION)).toContain('attachments_count')
  })

  it('TC-3N-008: contains attachment_names', () => {
    expect(readSrc(MIGRATION)).toContain('attachment_names')
  })

  it('TC-3N-009: proposal_captures has deleted_at', () => {
    const src = readSrc(MIGRATION)
    // deleted_at must appear within the proposal_captures table definition
    expect(/proposal_captures[\s\S]{0,2000}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-010: tenant-scoped raw_message_id unique index exists', () => {
    const src = readSrc(MIGRATION)
    // The unique index must include both tenant_id and raw_message_id
    expect(/UNIQUE INDEX[\s\S]{0,300}tenant_id,\s*raw_message_id/.test(src)).toBe(true)
  })

  it('TC-3N-011: does NOT contain a global UNIQUE(raw_message_id) without tenant_id', () => {
    const src = readSrc(MIGRATION)
    // A bare unique constraint on raw_message_id alone is forbidden
    expect(/UNIQUE\s*\(\s*raw_message_id\s*\)/.test(src)).toBe(false)
  })

  it('TC-3N-012: RLS policy uses correct tenant_id cast pattern', () => {
    const src = readSrc(MIGRATION)
    // Exact pattern from migration 20240034 convention
    expect(src).toContain("tenant_id::text = auth.jwt()->>'tenant_id'")
  })

  it('TC-3N-013: service_role RLS policy uses auth.role() = service_role', () => {
    const src = readSrc(MIGRATION)
    expect(src).toContain("auth.role() = 'service_role'")
  })

  it('TC-3N-014: does NOT contain calendar_event_id', () => {
    expect(readSrc(MIGRATION)).not.toContain('calendar_event_id')
  })

  it('TC-3N-015: contains estimated_savings', () => {
    expect(readSrc(MIGRATION)).toContain('estimated_savings')
  })

  it('TC-3N-016: contains opportunity_id', () => {
    expect(readSrc(MIGRATION)).toContain('opportunity_id')
  })

  it('TC-3N-141: contains idx_proposal_events_one_open_per_lead', () => {
    expect(readSrc(MIGRATION)).toContain('idx_proposal_events_one_open_per_lead')
  })

  it("TC-3N-142: partial index WHERE clause contains proposal_status IN ('sent', 'viewed')", () => {
    const src = readSrc(MIGRATION)
    expect(/proposal_status\s+IN\s*\(\s*'sent'\s*,\s*'viewed'\s*\)/.test(src)).toBe(true)
  })

  it('TC-3N-143: user FK columns reference auth.users(id)', () => {
    const src = readSrc(MIGRATION)
    expect(src).toContain('REFERENCES auth.users(id)')
  })

  it('TC-3N-144: migration does NOT reference bare users(id) without auth schema', () => {
    const src = readSrc(MIGRATION)
    // Must not contain the bare unqualified form
    expect(/REFERENCES\s+users\s*\(id\)/.test(src)).toBe(false)
  })
})

describe('Slice 1: types/database.ts extensions', () => {
  it('TC-3N-017: contains proposal_events table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_events')
  })

  it('TC-3N-018: contains proposal_captures table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_captures')
  })

  it('TC-3N-019: contains proposal_follow_up_commitments table entry', () => {
    expect(readSrc(TYPES)).toContain('proposal_follow_up_commitments')
  })

  it('TC-3N-020: proposal_events type includes estimated_savings', () => {
    const src = readSrc(TYPES)
    expect(/proposal_events[\s\S]{0,3000}estimated_savings/.test(src)).toBe(true)
  })

  it('TC-3N-021: proposal_events type includes opportunity_id', () => {
    const src = readSrc(TYPES)
    expect(/proposal_events[\s\S]{0,3000}opportunity_id/.test(src)).toBe(true)
  })

  it('TC-3N-022: proposal_captures type includes attachment_names', () => {
    const src = readSrc(TYPES)
    expect(/proposal_captures[\s\S]{0,3000}attachment_names/.test(src)).toBe(true)
  })

  it('TC-3N-023: proposal_captures type includes deleted_at', () => {
    const src = readSrc(TYPES)
    expect(/proposal_captures[\s\S]{0,3000}deleted_at/.test(src)).toBe(true)
  })

  it('TC-3N-024: proposal_follow_up_commitments type includes follow_up_due_at', () => {
    const src = readSrc(TYPES)
    expect(/proposal_follow_up_commitments[\s\S]{0,3000}follow_up_due_at/.test(src)).toBe(true)
  })

  it('TC-3N-025: types/database.ts does NOT contain calendar_event_id in proposal tables', () => {
    const src = readSrc(TYPES)
    // Extract just the proposal_events block to keep the check targeted
    const proposalBlockMatch = src.match(/proposal_events:\s*\{[\s\S]+?(?=\n      [a-z_]+:|\n    \})/i)
    if (proposalBlockMatch) {
      expect(proposalBlockMatch[0]).not.toContain('calendar_event_id')
    } else {
      // Fallback: full-file check (less precise but still enforces the guardrail)
      expect(src).not.toContain('calendar_event_id')
    }
  })
})
