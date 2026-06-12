// MCM v2 Slice V5 — pure schedule-timing helpers. No DB, no Date.now()
// dependence beyond what callers pass in; DST-correct via Intl (no deps).
// Importable client-side (the bulk-assign panel renders live previews).

export const DEFAULT_SEND_TIME = '09:00'
export const DEFAULT_TIMEZONE = 'America/New_York'

// Minutes the zone is ahead of UTC at a given instant (negative for US zones).
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
  let hour = get('hour')
  if (hour === 24) hour = 0 // some ICU versions render midnight as 24

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return (asUtc - instant.getTime()) / 60_000
}

// Convert a wall-clock date+time in an IANA zone to the UTC instant.
// Offset technique: guess the instant as if the wall clock were UTC, measure
// the zone's offset at that guess, adjust, and re-check once (the re-check
// resolves DST transitions; a spring-forward gap accepts the post-adjust
// result, which lands just past the gap).
export function localDateTimeToUtc(dateISO: string, timeHHMM: string, timeZone: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hours, minutes]   = timeHHMM.split(':').map(Number)

  const guess   = new Date(Date.UTC(year, month - 1, day, hours, minutes))
  const offset1 = zoneOffsetMinutes(guess, timeZone)
  let result    = new Date(guess.getTime() - offset1 * 60_000)

  const offset2 = zoneOffsetMinutes(result, timeZone)
  if (offset2 !== offset1) {
    result = new Date(guess.getTime() - offset2 * 60_000)
  }
  return result
}

// Calendar date (YYYY-MM-DD) of an instant as seen in a zone.
export function dateInZoneISO(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
}

// Pure calendar-day arithmetic on YYYY-MM-DD strings (zone-independent).
export function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day + days, 12))
  return d.toISOString().slice(0, 10)
}

// 0=Sun … 6=Sat for a pure calendar date (zone-independent).
function weekdayOfISODate(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay()
}

function shiftISODateOffWeekend(dateISO: string): string {
  const dow = weekdayOfISODate(dateISO)
  if (dow === 6) return addDaysISO(dateISO, 2) // Sat -> Mon
  if (dow === 0) return addDaysISO(dateISO, 1) // Sun -> Mon
  return dateISO
}

// Walk BACKWARD off a weekend (used for "latest recommended start" math).
export function shiftISODateBackOffWeekend(dateISO: string): string {
  const dow = weekdayOfISODate(dateISO)
  if (dow === 6) return addDaysISO(dateISO, -1) // Sat -> Fri
  if (dow === 0) return addDaysISO(dateISO, -2) // Sun -> Fri
  return dateISO
}

// If the instant's date in the zone is Sat -> +2 days, Sun -> +1 day.
export function shiftOffWeekend(d: Date, timeZone: string): Date {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  if (weekday === 'Sat') return new Date(d.getTime() + 2 * 86_400_000)
  if (weekday === 'Sun') return new Date(d.getTime() + 86_400_000)
  return d
}

export interface ComputeTouchScheduleInput {
  startDateISO:  string          // anchor calendar date (in the sequence zone)
  dayOffsets:    number[]        // per step, in step order
  sendTime?:     string | null   // 'HH:MM' 24h; null -> 09:00
  timeZone?:     string | null   // IANA id; null -> America/New_York
  skipWeekends?: boolean
}

// One UTC instant per offset: anchor + offset days at sendTime in timeZone,
// weekend-shifted when enabled, with a collision cascade — a touch landing on
// (or before) the previous touch's calendar day is pushed to the next
// (non-weekend, when enabled) day. Output is ascending and same length.
export function computeTouchSchedule(input: ComputeTouchScheduleInput): Date[] {
  const sendTime     = input.sendTime || DEFAULT_SEND_TIME
  const timeZone     = input.timeZone || DEFAULT_TIMEZONE
  const skipWeekends = input.skipWeekends ?? false

  const result: Date[] = []
  let previousDayISO: string | null = null

  for (const offset of input.dayOffsets) {
    let dayISO = addDaysISO(input.startDateISO, offset)
    if (skipWeekends) dayISO = shiftISODateOffWeekend(dayISO)

    // Collision cascade: strictly after the previous touch's calendar day
    while (previousDayISO !== null && dayISO <= previousDayISO) {
      dayISO = addDaysISO(dayISO, 1)
      if (skipWeekends) dayISO = shiftISODateOffWeekend(dayISO)
    }

    previousDayISO = dayISO
    result.push(localDateTimeToUtc(dayISO, sendTime, timeZone))
  }

  return result
}
