// Manual Campaign Mode — Slice 2: schedule-item write services + resume
// Behavioral tests for pure helpers (DB-free). Static source-read for import safety.
// TC-MM2-01 through TC-MM2-07

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  computeScheduledFor,
  SCHEDULE_ITEM_TRANSITIONS,
  assertValidScheduleItemTransition,
  materializePlan,
} from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import type { CampaignSequenceStepRow } from '@/modules/campaign-sequence/types'

const root = path.resolve(__dirname, '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const baseAssignment = {
  id: 'asgn-001',
  tenant_id: 'tenant-001',
  workspace_id: 'ws-001',
  lead_id: 'lead-001',
  contact_id: null,
  company_id: null,
}

function makeStep(overrides: Partial<CampaignSequenceStepRow> = {}): CampaignSequenceStepRow {
  return {
    id: 'step-001',
    tenant_id: 'tenant-001',
    workspace_id: 'ws-001',
    campaign_sequence_id: 'seq-001',
    step_number: 1,
    touch_label: 'Touch 1',
    day_offset: 3,
    recurring_interval_days: null,
    is_recurring: false,
    campaign_email_asset_id: null,
    channel: 'email',
    requires_approval: true,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TC-MM2-01: computeScheduledFor
// ---------------------------------------------------------------------------

describe('TC-MM2-01: computeScheduledFor adds whole days to startAt', () => {
  const base = new Date('2026-01-10T09:00:00.000Z')

  it('day_offset=0 returns the same instant', () => {
    expect(computeScheduledFor(base, 0).getTime()).toBe(base.getTime())
  })

  it('day_offset=1 advances by exactly one day', () => {
    expect(computeScheduledFor(base, 1).toISOString()).toBe('2026-01-11T09:00:00.000Z')
  })

  it('day_offset=5 advances by five days', () => {
    expect(computeScheduledFor(base, 5).toISOString()).toBe('2026-01-15T09:00:00.000Z')
  })

  it('handles month boundary correctly', () => {
    const jan30 = new Date('2026-01-30T00:00:00.000Z')
    expect(computeScheduledFor(jan30, 3).toISOString()).toBe('2026-02-02T00:00:00.000Z')
  })

  it('does not mutate the input Date', () => {
    const start = new Date('2026-01-10T09:00:00.000Z')
    const original = start.getTime()
    computeScheduledFor(start, 7)
    expect(start.getTime()).toBe(original)
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-02: SCHEDULE_ITEM_TRANSITIONS structure
// ---------------------------------------------------------------------------

describe('TC-MM2-02: SCHEDULE_ITEM_TRANSITIONS covers all statuses; terminals have no outgoing edges', () => {
  const TERMINAL = ['sent', 'failed', 'skipped', 'blocked', 'stopped_responded', 'stopped_manual'] as const
  const NON_TERMINAL = ['planned', 'draft_needed', 'draft_ready', 'awaiting_approval', 'approved', 'scheduled'] as const

  it('every status key is present', () => {
    for (const s of [...TERMINAL, ...NON_TERMINAL]) {
      expect(SCHEDULE_ITEM_TRANSITIONS).toHaveProperty(s)
    }
  })

  it('terminal states have no outgoing edges', () => {
    for (const s of TERMINAL) {
      expect(SCHEDULE_ITEM_TRANSITIONS[s]).toEqual([])
    }
  })

  it('non-terminal states have at least one outgoing edge', () => {
    for (const s of NON_TERMINAL) {
      expect(SCHEDULE_ITEM_TRANSITIONS[s].length).toBeGreaterThan(0)
    }
  })

  it('planned includes draft_needed and all stop states', () => {
    const allowed = SCHEDULE_ITEM_TRANSITIONS['planned']
    expect(allowed).toContain('draft_needed')
    expect(allowed).toContain('skipped')
    expect(allowed).toContain('blocked')
    expect(allowed).toContain('stopped_manual')
    expect(allowed).toContain('stopped_responded')
  })

  it('approved allows both scheduled and sent', () => {
    expect(SCHEDULE_ITEM_TRANSITIONS['approved']).toContain('scheduled')
    expect(SCHEDULE_ITEM_TRANSITIONS['approved']).toContain('sent')
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-03: assertValidScheduleItemTransition
// ---------------------------------------------------------------------------

describe('TC-MM2-03: assertValidScheduleItemTransition validates edges', () => {
  it('valid: planned -> draft_needed', () => {
    expect(() => assertValidScheduleItemTransition('planned', 'draft_needed')).not.toThrow()
  })

  it('valid: approved -> scheduled', () => {
    expect(() => assertValidScheduleItemTransition('approved', 'scheduled')).not.toThrow()
  })

  it('valid: scheduled -> sent', () => {
    expect(() => assertValidScheduleItemTransition('scheduled', 'sent')).not.toThrow()
  })

  it('valid: planned -> blocked (stop path)', () => {
    expect(() => assertValidScheduleItemTransition('planned', 'blocked')).not.toThrow()
  })

  it('invalid: planned -> sent (skips intermediate states)', () => {
    expect(() => assertValidScheduleItemTransition('planned', 'sent')).toThrow()
  })

  it('invalid: sent -> draft_needed (terminal cannot transition)', () => {
    expect(() => assertValidScheduleItemTransition('sent', 'draft_needed')).toThrow()
  })

  it('invalid: failed -> scheduled (terminal cannot transition)', () => {
    expect(() => assertValidScheduleItemTransition('failed', 'scheduled')).toThrow()
  })

  it('invalid: blocked -> planned (terminal cannot transition)', () => {
    expect(() => assertValidScheduleItemTransition('blocked', 'planned')).toThrow()
  })

  it('invalid: stopped_manual -> approved (terminal cannot transition)', () => {
    expect(() => assertValidScheduleItemTransition('stopped_manual', 'approved')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-04: materializePlan — happy path
// ---------------------------------------------------------------------------

describe('TC-MM2-04: materializePlan produces correct insert-ready rows', () => {
  const startAt = new Date('2026-02-01T08:00:00.000Z')

  it('returns empty array when steps is empty', () => {
    expect(materializePlan([], baseAssignment, 'seq-001', startAt)).toEqual([])
  })

  it('returns exactly one row for a single one-time step', () => {
    const rows = materializePlan([makeStep()], baseAssignment, 'seq-001', startAt)
    expect(rows).toHaveLength(1)
  })

  it('row has status planned', () => {
    const [row] = materializePlan([makeStep()], baseAssignment, 'seq-001', startAt)
    expect(row.status).toBe('planned')
  })

  it('scheduled_for = startAt + day_offset days (ISO string)', () => {
    const [row] = materializePlan([makeStep({ day_offset: 3 })], baseAssignment, 'seq-001', startAt)
    expect(row.scheduled_for).toBe('2026-02-04T08:00:00.000Z')
  })

  it('row copies tenant_id, workspace_id, lead_id from assignment', () => {
    const [row] = materializePlan([makeStep()], baseAssignment, 'seq-001', startAt)
    expect(row.tenant_id).toBe(baseAssignment.tenant_id)
    expect(row.workspace_id).toBe(baseAssignment.workspace_id)
    expect(row.lead_id).toBe(baseAssignment.lead_id)
  })

  it('row sets campaign_assignment_id, campaign_sequence_id, campaign_sequence_step_id', () => {
    const step = makeStep({ id: 'step-abc' })
    const [row] = materializePlan([step], baseAssignment, 'seq-xyz', startAt)
    expect(row.campaign_assignment_id).toBe(baseAssignment.id)
    expect(row.campaign_sequence_id).toBe('seq-xyz')
    expect(row.campaign_sequence_step_id).toBe('step-abc')
  })

  it('returns one row per step for multiple steps', () => {
    const steps = [
      makeStep({ id: 'step-001', step_number: 1, day_offset: 2 }),
      makeStep({ id: 'step-002', step_number: 2, day_offset: 7 }),
      makeStep({ id: 'step-003', step_number: 3, day_offset: 14 }),
    ]
    const rows = materializePlan(steps, baseAssignment, 'seq-001', startAt)
    expect(rows).toHaveLength(3)
    expect(rows[0].campaign_sequence_step_id).toBe('step-001')
    expect(rows[1].campaign_sequence_step_id).toBe('step-002')
    expect(rows[2].campaign_sequence_step_id).toBe('step-003')
  })

  it('each row has correct scheduled_for for its day_offset', () => {
    const steps = [
      makeStep({ id: 'step-001', day_offset: 0 }),
      makeStep({ id: 'step-002', day_offset: 5 }),
    ]
    const rows = materializePlan(steps, baseAssignment, 'seq-001', startAt)
    expect(rows[0].scheduled_for).toBe('2026-02-01T08:00:00.000Z')
    expect(rows[1].scheduled_for).toBe('2026-02-06T08:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-05: materializePlan — recurring step guard
// ---------------------------------------------------------------------------

describe('TC-MM2-05: materializePlan throws on recurring steps', () => {
  const startAt = new Date('2026-02-01T08:00:00.000Z')

  it("throws 'manual_campaign_recurring_steps_unsupported' for a recurring step", () => {
    const recurringStep = makeStep({
      id: 'step-rec',
      day_offset: null,
      recurring_interval_days: 7,
      is_recurring: true,
    })
    expect(() =>
      materializePlan([recurringStep], baseAssignment, 'seq-001', startAt)
    ).toThrow('manual_campaign_recurring_steps_unsupported')
  })

  it('throws even when recurring step is mixed with one-time steps', () => {
    const steps = [
      makeStep({ id: 'step-001', day_offset: 3, is_recurring: false }),
      makeStep({ id: 'step-002', day_offset: null, recurring_interval_days: 14, is_recurring: true }),
    ]
    expect(() =>
      materializePlan(steps, baseAssignment, 'seq-001', startAt)
    ).toThrow('manual_campaign_recurring_steps_unsupported')
  })

  it('throws for a step that has recurring_interval_days set even if is_recurring is false', () => {
    const ambiguousStep = makeStep({
      id: 'step-ambig',
      day_offset: 3,
      recurring_interval_days: 7,
      is_recurring: false,
    })
    expect(() =>
      materializePlan([ambiguousStep], baseAssignment, 'seq-001', startAt)
    ).toThrow('manual_campaign_recurring_steps_unsupported')
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-06: SCHEDULE_ITEM_TRANSITIONS exact edges per spec
// ---------------------------------------------------------------------------

describe('TC-MM2-06: transition map has exactly the specified edges for each non-terminal status', () => {
  it('planned exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['planned']].sort()).toEqual(
      ['blocked', 'draft_needed', 'skipped', 'stopped_manual', 'stopped_responded'].sort()
    )
  })

  it('draft_needed exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['draft_needed']].sort()).toEqual(
      ['blocked', 'draft_ready', 'failed', 'skipped', 'stopped_manual', 'stopped_responded'].sort()
    )
  })

  it('draft_ready exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['draft_ready']].sort()).toEqual(
      ['approved', 'awaiting_approval', 'blocked', 'failed', 'scheduled', 'skipped', 'stopped_manual', 'stopped_responded'].sort()
    )
  })

  it('awaiting_approval exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['awaiting_approval']].sort()).toEqual(
      ['approved', 'blocked', 'skipped', 'stopped_manual', 'stopped_responded'].sort()
    )
  })

  it('approved exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['approved']].sort()).toEqual(
      ['blocked', 'failed', 'scheduled', 'sent', 'stopped_manual', 'stopped_responded'].sort()
    )
  })

  it('scheduled exact edges', () => {
    expect([...SCHEDULE_ITEM_TRANSITIONS['scheduled']].sort()).toEqual(
      ['blocked', 'failed', 'sent', 'stopped_manual', 'stopped_responded'].sort()
    )
  })
})

// ---------------------------------------------------------------------------
// TC-MM2-07: Static source-read — no Inngest/Resend/send imports
// ---------------------------------------------------------------------------

describe('TC-MM2-07: new service and repo files have no Inngest/Resend/send imports', () => {
  const filesToCheck = [
    'modules/campaign-sequence/services/campaign-schedule-item.service.ts',
    'modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts',
  ]

  const forbidden = [
    'inngest',
    'resend',
    'send-email',
    'email-send.service',
    'sendEmail(',
    'CAMPAIGN_SENDING_ENABLED',
    'EMAIL_SENDING_ENABLED',
  ]

  for (const file of filesToCheck) {
    it(`${path.basename(file)} has no forbidden imports or send references`, () => {
      const src = read(file)
      for (const term of forbidden) {
        expect(src.toLowerCase()).not.toContain(term.toLowerCase())
      }
    })
  }
})
