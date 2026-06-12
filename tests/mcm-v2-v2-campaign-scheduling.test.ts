// MCM v2 — Slice V2: future-dated campaign start + effective pause/resume
// TC-V2-01 through TC-V2-07
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const MIGRATION       = 'supabase/migrations/20240050_assignment_starts_at.sql'
const ASSIGNMENT_SVC  = 'modules/messaging/services/campaign-assignment.service.ts'
const ASSIGNMENT_ACTS = 'modules/messaging/actions/campaign-assignment.actions.ts'
const TYPES           = 'modules/messaging/types/campaign-assignment.types.ts'
const HANDLER         = 'inngest/functions/on-campaign-assignment-activated.ts'
const ITEM_REPO       = 'modules/campaign-sequence/repositories/campaign-schedule-item.repo.ts'
const TABLE           = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const PAUSE_RESUME    = 'app/(workspace)/[workspaceSlug]/companies/[id]/PauseResumeCampaignButtons.tsx'

// ---------------------------------------------------------------------------
// TC-V2-01: migration
// ---------------------------------------------------------------------------

describe('TC-V2-01: migration 20240050 starts_at (source-read)', () => {
  it('exists and adds the nullable column', () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true)
    const sql = read(MIGRATION)
    expect(sql).toContain('ALTER TABLE campaign_assignments')
    expect(sql).toContain('ADD COLUMN starts_at timestamptz NULL')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-02: insert persists starts_at
// ---------------------------------------------------------------------------

describe('TC-V2-02: starts_at persisted on create (source-read)', () => {
  it('CreateAssignmentInput accepts startsAt and the insert persists it', () => {
    const types   = read(TYPES)
    const service = read(ASSIGNMENT_SVC)
    expect(types).toContain('startsAt?:')
    expect(types).toContain('starts_at:')
    expect(service).toContain('starts_at:                   input.startsAt ?? null')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-03: both emit sites pass starts_at, still awaited + non-fatal
// ---------------------------------------------------------------------------

describe('TC-V2-03: activation emits carry startsAt (source-read)', () => {
  const service = read(ASSIGNMENT_SVC)

  it('emit helper includes startsAt in the event data', () => {
    expect(service).toContain('data: { assignmentId, campaignSequenceId, tenantId, workspaceId, startsAt }')
  })

  it('create path passes the row value, awaited with non-fatal catch', () => {
    expect(service).toContain(
      'await emitAssignmentActivated(row.id, row.campaign_sequence_id!, input.tenantId, input.workspaceId, row.starts_at ?? null).catch(() => null)'
    )
  })

  it('approve path passes the existing row value, awaited with non-fatal catch', () => {
    const idx  = service.indexOf('export async function approveProposedAssignment')
    const body = service.slice(idx)
    expect(body).toContain('existing.starts_at ?? null')
    expect(body).toContain('await emitAssignmentActivated(')
    expect(body).toContain(').catch(() => null)')
  })

  it('handler anchors on startsAt and falls back to now for old events', () => {
    const handler = read(HANDLER)
    expect(handler).toContain('startsAt?:          string | null')
    expect(handler).toContain('const startAt = data.startsAt ? new Date(data.startsAt) : new Date()')
    expect(handler).toContain('startAt,')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-04: bulk date window validation
// ---------------------------------------------------------------------------

describe('TC-V2-04: bulk start-date validation (source-read)', () => {
  const service = read(ASSIGNMENT_SVC)
  const idx     = service.indexOf('export async function bulkAssignCampaignToCompanies')
  const body    = service.slice(idx, idx + 2500)

  it('rejects unparseable dates', () => {
    expect(body).toContain('isNaN(startDate.getTime())')
    expect(body).toContain('Invalid start date.')
  })

  it('rejects past dates by UTC date (today is accepted)', () => {
    expect(body).toContain('startUtc < todayUtc')
    expect(body).toContain("Start date can't be in the past.")
  })

  it('rejects dates more than 365 days out', () => {
    expect(body).toContain('365 * 86_400_000')
    expect(body).toContain("Start date can't be more than a year out.")
  })

  it('fan-out passes startsAt to every createCampaignAssignment', () => {
    const fanout = service.slice(idx)
    expect(fanout).toContain('startsAt:              input.startsAt')
  })

  it('action exposes the param and forwards it', () => {
    const actions = read(ASSIGNMENT_ACTS)
    const aIdx    = actions.indexOf('export async function bulkAssignCampaignAction')
    const aBody   = actions.slice(aIdx, aIdx + 1600)
    expect(aBody).toContain('startsAt?:             string')
    expect(aBody).toContain('startsAt:           startsAt || undefined')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-05: pause is effective — all three cron queries filter parent status
// ---------------------------------------------------------------------------

describe('TC-V2-05: cron item queries skip non-assigned assignments (source-read)', () => {
  const repo = read(ITEM_REPO)

  it.each(['listDueScheduleItems', 'listDraftReadyItems', 'listSendableScheduleItems'])(
    '%s inner-joins the assignment and filters to assigned',
    fn => {
      const idx  = repo.indexOf(`export async function ${fn}`)
      expect(idx).toBeGreaterThan(-1)
      const body = repo.slice(idx, idx + 1700)
      expect(body).toContain("select('*, campaign_assignments!inner(assignment_status)')")
      expect(body).toContain(".eq('campaign_assignments.assignment_status', 'assigned')")
      expect(body).toContain('V2: paused/retired assignments must not progress')
    }
  )

  it('the joined column is stripped from returned rows', () => {
    expect(repo).toContain('function stripJoinedAssignment')
    const uses = repo.match(/stripJoinedAssignment\(data \?\? \[\]\)/g) ?? []
    expect(uses.length).toBe(3)
  })

  it('documents that resume does not re-anchor dates', () => {
    expect(repo).toContain('resume does NOT re-anchor dates')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-06: bulk-assign panel start control
// ---------------------------------------------------------------------------

describe('TC-V2-06: start control in the bulk-assign panel (source-read)', () => {
  const table = read(TABLE)

  it('offers Start immediately (default) vs Start on date', () => {
    expect(table).toContain("useState<'now' | 'date'>('now')")
    expect(table).toContain('Start immediately')
    expect(table).toContain('Start on date')
    expect(table).toContain('type="date"')
  })

  it('shows the day-offset helper text', () => {
    expect(table).toContain('Touches are scheduled from this date using each step&apos;s day offset.')
  })

  it('includes the start in the confirm summary and the action call', () => {
    expect(table).toContain('Start: ${startsAt ? `on ${startsAt}` : ' + "'immediately'}`")
    expect(table).toContain('bulkAssignCampaignAction(ids, assignSequenceId, preApproved, undefined, startsAt)')
  })

  it('requires a date when Start on date is chosen', () => {
    expect(table).toContain('Pick a start date or switch to "Start immediately".')
  })
})

// ---------------------------------------------------------------------------
// TC-V2-07: Pause/Resume on the company Campaigns card
// ---------------------------------------------------------------------------

describe('TC-V2-07: Pause/Resume UI (source-read)', () => {
  const buttons = read(PAUSE_RESUME)
  const page    = read(DETAIL_PAGE)
  const actions = read(ASSIGNMENT_ACTS)

  it('actions wrap the existing services with the standard permission', () => {
    expect(actions).toContain('export async function pauseCampaignAssignmentAction')
    expect(actions).toContain('export async function resumeCampaignAssignmentAction')
    expect(actions).toContain('pauseCampaignAssignment(assignmentId)')
    expect(actions).toContain('resumeCampaignAssignment(assignmentId)')
    const idx = actions.indexOf('export async function pauseCampaignAssignmentAction')
    expect(actions.slice(idx, idx + 700)).toContain("requirePermission(ctx, 'crm.leads.view')")
  })

  it('buttons confirm; resume confirm carries the catch-up warning', () => {
    expect(buttons).toContain('Pause this campaign?')
    expect(buttons).toContain('Touches that came due while paused will go out on the next scheduled run — dates are not re-anchored.')
  })

  it('Campaigns card shows Pause for assigned, Resume (+Stop) for paused', () => {
    expect(page).toContain("a.assignment_status === 'assigned' && (")
    expect(page).toContain('<PauseCampaignButton assignmentId={a.id} />')
    expect(page).toContain("a.assignment_status === 'paused' && (")
    expect(page).toContain('<ResumeCampaignButton assignmentId={a.id} />')
    expect(page).toContain("a.assignment_status === 'paused') && (")
  })
})
