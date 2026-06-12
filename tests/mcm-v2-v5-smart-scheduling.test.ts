// MCM v2 — Slice V5: schedule intelligence — send time + timezone, weekend
// skip, event-date guard
// TC-V5-01 through TC-V5-07
//
// Timing-helper tests are behavioral (imported + called). Everything else is
// source-read. No Supabase connection. No model calls.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  localDateTimeToUtc,
  shiftOffWeekend,
  shiftISODateBackOffWeekend,
  addDaysISO,
  dateInZoneISO,
  computeTouchSchedule,
} from '@/modules/campaign-sequence/schedule-timing'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const MIGRATION   = 'supabase/migrations/20240051_sequence_schedule_settings.sql'
const ITEM_SVC    = 'modules/campaign-sequence/services/campaign-schedule-item.service.ts'
const ACTIONS     = 'modules/campaign-sequence/actions/sequence-authoring.actions.ts'
const BUILDER     = 'app/(workspace)/[workspaceSlug]/settings/campaign-sequences/SequenceBuilder.tsx'
const TABLE       = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'
const PAGE        = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'

// ---------------------------------------------------------------------------
// TC-V5-01: localDateTimeToUtc — DST-correct (behavioral)
// ---------------------------------------------------------------------------

describe('TC-V5-01: localDateTimeToUtc DST correctness', () => {
  it('EST: Jan 15 11:00 America/New_York -> 16:00Z', () => {
    expect(localDateTimeToUtc('2026-01-15', '11:00', 'America/New_York').toISOString())
      .toBe('2026-01-15T16:00:00.000Z')
  })

  it('EDT: Jul 15 11:00 America/New_York -> 15:00Z', () => {
    expect(localDateTimeToUtc('2026-07-15', '11:00', 'America/New_York').toISOString())
      .toBe('2026-07-15T15:00:00.000Z')
  })

  it('UTC zone is the identity transform', () => {
    expect(localDateTimeToUtc('2026-03-10', '09:30', 'UTC').toISOString())
      .toBe('2026-03-10T09:30:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// TC-V5-02: weekend shifting (behavioral)
// ---------------------------------------------------------------------------

describe('TC-V5-02: shiftOffWeekend', () => {
  // 2026-06-13 is a Saturday, 2026-06-14 a Sunday
  it('Saturday -> Monday (+2 days)', () => {
    const sat = new Date('2026-06-13T15:00:00Z')
    expect(shiftOffWeekend(sat, 'America/New_York').toISOString())
      .toBe('2026-06-15T15:00:00.000Z')
  })

  it('Sunday -> Monday (+1 day)', () => {
    const sun = new Date('2026-06-14T15:00:00Z')
    expect(shiftOffWeekend(sun, 'America/New_York').toISOString())
      .toBe('2026-06-15T15:00:00.000Z')
  })

  it('weekday unchanged', () => {
    const wed = new Date('2026-06-10T15:00:00Z')
    expect(shiftOffWeekend(wed, 'America/New_York')).toEqual(wed)
  })

  it('backward variant walks Sat/Sun back to Friday', () => {
    expect(shiftISODateBackOffWeekend('2026-06-13')).toBe('2026-06-12')
    expect(shiftISODateBackOffWeekend('2026-06-14')).toBe('2026-06-12')
    expect(shiftISODateBackOffWeekend('2026-06-10')).toBe('2026-06-10')
  })
})

// ---------------------------------------------------------------------------
// TC-V5-03: computeTouchSchedule (behavioral)
// ---------------------------------------------------------------------------

describe('TC-V5-03: computeTouchSchedule', () => {
  // Anchor 2026-06-08 is a Monday
  it('defaults: 09:00 America/New_York (EDT in June -> 13:00Z)', () => {
    const [only] = computeTouchSchedule({ startDateISO: '2026-06-08', dayOffsets: [0] })
    expect(only.toISOString()).toBe('2026-06-08T13:00:00.000Z')
  })

  it('honors explicit send time and timezone', () => {
    const [only] = computeTouchSchedule({
      startDateISO: '2026-06-08', dayOffsets: [0], sendTime: '14:30', timeZone: 'America/Chicago',
    })
    // 14:30 CDT = 19:30Z
    expect(only.toISOString()).toBe('2026-06-08T19:30:00.000Z')
  })

  it('skipWeekends shifts Sat/Sun touches to Monday', () => {
    // Mon + 5 = Sat 06-13 -> Mon 06-15; Mon + 13 = Sun 06-21 -> Mon 06-22
    const dates = computeTouchSchedule({
      startDateISO: '2026-06-08', dayOffsets: [5, 13], skipWeekends: true, timeZone: 'UTC', sendTime: '09:00',
    })
    expect(dates.map(d => d.toISOString().slice(0, 10))).toEqual(['2026-06-15', '2026-06-22'])
  })

  it('cascade: offsets [5, 6] both shifting to the same Monday push the second to Tuesday', () => {
    // Mon + 5 = Sat -> Mon 06-15; Mon + 6 = Sun -> Mon 06-15 (collision) -> Tue 06-16
    const dates = computeTouchSchedule({
      startDateISO: '2026-06-08', dayOffsets: [5, 6], skipWeekends: true, timeZone: 'UTC', sendTime: '09:00',
    })
    expect(dates.map(d => d.toISOString().slice(0, 10))).toEqual(['2026-06-15', '2026-06-16'])
  })

  it('output is ascending and same length as input', () => {
    const dates = computeTouchSchedule({
      startDateISO: '2026-06-08', dayOffsets: [0, 3, 7, 14], timeZone: 'UTC',
    })
    expect(dates).toHaveLength(4)
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime())
    }
  })

  it('helpers: addDaysISO and dateInZoneISO behave as pure calendar math', () => {
    expect(addDaysISO('2026-01-30', 3)).toBe('2026-02-02')
    expect(dateInZoneISO(new Date('2026-06-12T02:00:00Z'), 'America/New_York')).toBe('2026-06-11')
  })
})

// ---------------------------------------------------------------------------
// TC-V5-04: migration
// ---------------------------------------------------------------------------

describe('TC-V5-04: migration 20240051 (source-read)', () => {
  it('adds send_time, timezone, and skip_weekends to campaign_sequences', () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true)
    const sql = read(MIGRATION)
    expect(sql).toContain('ALTER TABLE campaign_sequences')
    expect(sql).toContain('ADD COLUMN send_time     text    NULL')
    expect(sql).toContain('ADD COLUMN timezone      text    NULL')
    expect(sql).toContain('ADD COLUMN skip_weekends boolean NOT NULL DEFAULT false')
  })
})

// ---------------------------------------------------------------------------
// TC-V5-05: materialization wiring
// ---------------------------------------------------------------------------

describe('TC-V5-05: materialization uses the sequence settings (source-read)', () => {
  const service = read(ITEM_SVC)

  it('loads the sequence row and its schedule settings', () => {
    expect(service).toContain('getCampaignSequenceById(sequenceId, tenantId, workspaceId)')
    expect(service).toContain("'send_time'")
    expect(service).toContain("'timezone'")
    expect(service).toContain("'skip_weekends'")
  })

  it('anchors on the calendar date of startAt in the sequence timezone', () => {
    expect(service).toContain('dateInZoneISO(startAt, timeZone ?? DEFAULT_TIMEZONE)')
  })

  it('computes per-touch instants via computeTouchSchedule and feeds materializePlan', () => {
    expect(service).toContain('computeTouchSchedule({')
    expect(service).toContain('materializePlan(steps, assignment, sequenceId, startAt, schedule)')
  })

  it('computeScheduledFor stays exported (pinned) but is marked superseded', () => {
    expect(service).toContain('export function computeScheduledFor')
    expect(service).toContain('Superseded by computeTouchSchedule')
  })
})

// ---------------------------------------------------------------------------
// TC-V5-06: builder fields persisted
// ---------------------------------------------------------------------------

describe('TC-V5-06: delivery schedule in the builder + actions (source-read)', () => {
  const builder = read(BUILDER)
  const actions = read(ACTIONS)

  it('builder renders the Delivery schedule section in create and edit modes', () => {
    expect(builder).toContain('Delivery schedule')
    expect(builder).toContain('type="time"')
    expect(builder).toContain('Skip weekends')
    expect(builder).toContain("useState(edit?.sendTime ?? '')")
    expect(builder).toContain('useState(edit?.skipWeekends ?? false)')
  })

  it('curated timezone select is present', () => {
    for (const tz of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', "'UTC'"]) {
      expect(builder).toContain(tz)
    }
  })

  it('create action persists send_time / timezone / skip_weekends', () => {
    expect(actions).toContain('send_time:          input.sendTime || null')
    expect(actions).toContain('timezone:           input.timeZone || null')
    expect(actions).toContain('skip_weekends:      input.skipWeekends ?? false')
  })

  it('update action patches the same fields', () => {
    expect(actions).toContain("send_time:          input.sendTime !== undefined ? (input.sendTime || null) : undefined")
    expect(actions).toContain("skip_weekends:      input.skipWeekends !== undefined ? input.skipWeekends : undefined")
  })
})

// ---------------------------------------------------------------------------
// TC-V5-07: bulk-assign panel preview + event-date guard
// ---------------------------------------------------------------------------

describe('TC-V5-07: panel preview + event guard (source-read)', () => {
  const table = read(TABLE)
  const page  = read(PAGE)

  it('page threads dayOffsets + schedule settings per sequence', () => {
    expect(page).toContain('dayOffsets:       steps.map(step => (step.day_offset as number) ?? 0)')
    expect(page).toContain('sendTime:         (record.send_time as string | null) ?? null')
    expect(page).toContain('skipWeekends:     Boolean(record.skip_weekends)')
  })

  it('panel has the optional event-date input (never stored)', () => {
    expect(table).toContain('Event date (optional — e.g. the show)')
    expect(table).toContain('panel-side math only — never stored')
  })

  it('renders a live touch-schedule preview via the pure helper', () => {
    expect(table).toContain('computeTouchSchedule({')
    expect(table).toContain('Touch schedule preview')
  })

  it('warns when the final touch lands inside the week before the event — warning only', () => {
    expect(table).toContain("finalTouchISO <= addDaysISO(eventDate, -7)) return null")
    expect(table).toContain('inside the week before your')
    expect(table).toContain('Latest recommended start:')
    // never blocks: the warning is rendered, not gating the confirm/action
    expect(table).toContain('{eventWarning && (')
  })

  it('suggested latest start walks back by 7 days + last offset, weekend-adjusted', () => {
    expect(table).toContain('shiftISODateBackOffWeekend(addDaysISO(eventDate, -7 - lastOffset))')
  })
})
