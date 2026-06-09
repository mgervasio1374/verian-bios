import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

const migrationPath = 'supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql'
const migration = read(migrationPath)
const dbTypes = read('types/database.ts')

// ---------------------------------------------------------------------------
// Phase 3X Slice 4C — Migration DDL
// ---------------------------------------------------------------------------

describe('TC-3X-4C campaign sequence migration DDL', () => {
  it('TC-3X-4C-001: creates exactly the four approved campaign sequence tables', () => {
    expect(migration).toContain('CREATE TABLE campaign_types')
    expect(migration).toContain('CREATE TABLE campaign_sequences')
    expect(migration).toContain('CREATE TABLE campaign_sequence_steps')
    expect(migration).toContain('CREATE TABLE campaign_schedule_items')
    expect(migration).not.toContain('ALTER TABLE campaign_assignments')
    expect(migration).not.toContain('ALTER TABLE campaign_email_assets')
    expect(migration).not.toContain('ALTER TABLE email_drafts')
  })

  it('TC-3X-4C-002: campaign_types stores scope, lifecycle, approval default, and stop default', () => {
    const section = migration.slice(
      migration.indexOf('CREATE TABLE campaign_types'),
      migration.indexOf('CREATE TABLE campaign_sequences'),
    )
    expect(section).toContain('tenant_id')
    expect(section).toContain('workspace_id')
    expect(section).toContain('default_stop_condition')
    expect(section).toContain('default_requires_approval')
    expect(section).toContain("CHECK (status IN ('draft','active','retired'))")
    expect(section).toContain("CHECK (default_stop_condition IN ('response_detected','manual_stop_only'))")
  })

  it('TC-3X-4C-003: campaign_sequences stores versioning, default flag, approval, and response behavior', () => {
    const section = migration.slice(
      migration.indexOf('CREATE TABLE campaign_sequences'),
      migration.indexOf('CREATE TABLE campaign_sequence_steps'),
    )
    expect(section).toContain('campaign_type_id')
    expect(section).toContain('version')
    expect(section).toContain('is_default')
    expect(section).toContain('requires_approval')
    expect(section).toContain('stop_on_response')
    expect(section).toContain('response_trigger_behavior')
    expect(section).toContain("CHECK (response_trigger_behavior IN ('stop_future_touches','notify_operator','create_task'))")
  })

  it('TC-3X-4C-004: campaign_sequence_steps recurrence constraint is mutually exclusive', () => {
    const section = migration.slice(
      migration.indexOf('CREATE TABLE campaign_sequence_steps'),
      migration.indexOf('CREATE TABLE campaign_schedule_items'),
    )
    expect(section).toContain('CONSTRAINT chk_campaign_sequence_steps_recurrence')
    expect(section).toContain('is_recurring = false')
    expect(section).toContain('day_offset IS NOT NULL')
    expect(section).toContain('recurring_interval_days IS NULL')
    expect(section).toContain('is_recurring = true')
    expect(section).toContain('day_offset IS NULL')
    expect(section).toContain('recurring_interval_days IS NOT NULL')
    expect(section).toContain('recurring_interval_days > 0')
  })

  it('TC-3X-4C-005: campaign_schedule_items stores planned schedule state without send FK decision', () => {
    const section = migration.slice(
      migration.indexOf('CREATE TABLE campaign_schedule_items'),
      migration.indexOf('-- =============================================================================\n-- updated_at triggers'),
    )
    expect(section).toContain('campaign_assignment_id')
    expect(section).toContain('campaign_sequence_id')
    expect(section).toContain('campaign_sequence_step_id')
    expect(section).toContain('scheduled_for')
    expect(section).toContain('approval_request_id')
    expect(section).toContain('email_draft_id')
    expect(section).toContain('sent_event_id              uuid        NULL')
    expect(section).toContain('CONSTRAINT chk_campaign_schedule_items_target')
    expect(section).toContain('CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)')
  })

  it('TC-3X-4C-006: schedule item status check includes all approved display/future states', () => {
    for (const status of [
      'planned',
      'draft_needed',
      'draft_ready',
      'awaiting_approval',
      'approved',
      'scheduled',
      'sent',
      'blocked',
      'stopped_responded',
      'stopped_manual',
      'skipped',
      'failed',
    ]) {
      expect(migration).toContain(`'${status}'`)
    }
  })

  it('TC-3X-4C-007: active sequence structures use concrete RESTRICT delete behavior', () => {
    expect(migration).toContain('campaign_type_id           uuid        NOT NULL REFERENCES campaign_types(id) ON DELETE RESTRICT')
    expect(migration).toContain('campaign_sequence_id      uuid        NOT NULL REFERENCES campaign_sequences(id) ON DELETE RESTRICT')
    expect(migration).toContain('campaign_assignment_id     uuid        NOT NULL REFERENCES campaign_assignments(id) ON DELETE RESTRICT')
    expect(migration).toContain('campaign_sequence_step_id  uuid        NOT NULL REFERENCES campaign_sequence_steps(id) ON DELETE RESTRICT')
  })

  it('TC-3X-4C-008: optional leaf references use SET NULL delete behavior', () => {
    expect(migration).toContain('campaign_email_asset_id   uuid        NULL REFERENCES campaign_email_assets(id) ON DELETE SET NULL')
    expect(migration).toContain('approval_request_id        uuid        NULL REFERENCES approval_requests(id) ON DELETE SET NULL')
    expect(migration).toContain('email_draft_id             uuid        NULL REFERENCES email_drafts(id) ON DELETE SET NULL')
  })

  it('TC-3X-4C-009: updated_at triggers are created for all new mutable tables', () => {
    expect(migration).toContain('set_campaign_types_updated_at')
    expect(migration).toContain('set_campaign_sequences_updated_at')
    expect(migration).toContain('set_campaign_sequence_steps_updated_at')
    expect(migration).toContain('set_campaign_schedule_items_updated_at')
    expect(migration).toContain('EXECUTE FUNCTION update_updated_at()')
  })

  it('TC-3X-4C-010: indexes and duplicate guards match the approved read model needs', () => {
    expect(migration).toContain('idx_campaign_types_tenant_workspace_status')
    expect(migration).toContain('uq_campaign_types_active_slug')
    expect(migration).toContain('idx_campaign_sequences_type_status')
    expect(migration).toContain('uq_campaign_sequences_type_version')
    expect(migration).toContain('uq_campaign_sequences_default')
    expect(migration).toContain('idx_campaign_sequence_steps_sequence_order')
    expect(migration).toContain('uq_campaign_sequence_steps_order')
    expect(migration).toContain('idx_campaign_schedule_items_status_due')
    expect(migration).toContain('uq_campaign_schedule_items_assignment_step_time')
  })
})

// ---------------------------------------------------------------------------
// RLS and grants
// ---------------------------------------------------------------------------

describe('TC-3X-4C RLS and grants', () => {
  it('TC-3X-4C-011: RLS is enabled on all four tables', () => {
    expect(migration).toContain('ALTER TABLE campaign_types ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE campaign_sequence_steps ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE campaign_schedule_items ENABLE ROW LEVEL SECURITY')
  })

  it('TC-3X-4C-012: authenticated select policies require tenant and workspace membership', () => {
    expect(migration).toContain('tenant_id = public.current_tenant_id()')
    expect(migration).toContain('public.is_workspace_member(workspace_id)')
  })

  it('TC-3X-4C-013: service role policies use WITH CHECK for writes', () => {
    expect(migration).toContain('campaign_types_service_role')
    expect(migration).toContain('campaign_sequences_service_role')
    expect(migration).toContain('campaign_sequence_steps_service_role')
    expect(migration).toContain('campaign_schedule_items_service_role')
    expect(migration).toContain("WITH CHECK (auth.role() = 'service_role')")
  })

  it('TC-3X-4C-014: grants authenticated read and service_role all', () => {
    for (const table of ['campaign_types', 'campaign_sequences', 'campaign_sequence_steps', 'campaign_schedule_items']) {
      expect(migration).toContain(`GRANT SELECT ON ${table}`)
      expect(migration).toContain(`GRANT ALL    ON ${table}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Database types
// ---------------------------------------------------------------------------

describe('TC-3X-4C database types', () => {
  it('TC-3X-4C-015: types/database.ts includes all four new table definitions', () => {
    expect(dbTypes).toContain('campaign_types: {')
    expect(dbTypes).toContain('campaign_sequences: {')
    expect(dbTypes).toContain('campaign_sequence_steps: {')
    expect(dbTypes).toContain('campaign_schedule_items: {')
  })

  it('TC-3X-4C-016: campaign_sequence_steps types include recurrence fields', () => {
    const start = dbTypes.indexOf('campaign_sequence_steps: {')
    const section = dbTypes.slice(start, start + 4500)
    expect(section).toContain('day_offset: number | null')
    expect(section).toContain('recurring_interval_days: number | null')
    expect(section).toContain('is_recurring: boolean')
  })

  it('TC-3X-4C-017: campaign_schedule_items types include draft, approval, and stop fields', () => {
    const start = dbTypes.indexOf('campaign_schedule_items: {')
    const section = dbTypes.slice(start, start + 7000)
    expect(section).toContain('approval_request_id: string | null')
    expect(section).toContain('email_draft_id: string | null')
    expect(section).toContain('sent_event_id: string | null')
    expect(section).toContain('stopped_at: string | null')
    expect(section).toContain('response_detected_at: string | null')
  })
})

// ---------------------------------------------------------------------------
// Safety boundaries
// ---------------------------------------------------------------------------

describe('TC-3X-4C safety boundaries', () => {
  const forbidden = [
    'EMAIL_SENDING_ENABLED',
    'CAMPAIGN_SENDING_ENABLED',
    'sendApprovedDraft',
    'sendFollowUpDraftAction',
    'resend.emails.send',
    "from 'resend'",
    'Inngest',
    'background job',
    'scheduleCampaign(',
    'executeCampaign(',
    'dispatchPendingEvents',
    'setControlValue',
  ]

  it('TC-3X-4C-018: migration contains no send/control/automation references', () => {
    for (const token of forbidden) {
      expect(migration).not.toContain(token)
    }
  })

  it('TC-3X-4C-019: migration does not seed, backfill, or generate schedule rows', () => {
    expect(migration).not.toContain('INSERT INTO campaign_types')
    expect(migration).not.toContain('INSERT INTO campaign_sequences')
    expect(migration).not.toContain('INSERT INTO campaign_sequence_steps')
    expect(migration).not.toContain('INSERT INTO campaign_schedule_items')
    expect(migration).not.toContain('generate_series')
  })

  it('TC-3X-4C-020: Slice 4C did not add repos, services, actions, or UI files', () => {
    expect(() => read('modules/messaging/repositories/campaign-sequence.repo.ts')).toThrow()
    expect(() => read('modules/messaging/services/campaign-sequence.service.ts')).toThrow()
    expect(() => read('modules/messaging/actions/campaign-sequence.actions.ts')).toThrow()
    // page.tsx now exists — created by Slice 9 (UI authoring), not Slice 4C ✓
  })
})
