// All operations use UTC calendar days.
// Phase 3N does not adjust for business-day skipping — intervals are calendar days.

export function addDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function isDateInFuture(date: Date, now: Date = new Date()): boolean {
  return date.getTime() > now.getTime()
}

// isFutureDate is an alias kept consistent with the prompt requirement.
export function isFutureDate(date: Date, now: Date = new Date()): boolean {
  return isDateInFuture(date, now)
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()  // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}

// Normalizes a UTC timestamp to 09:00 UTC on the same calendar day.
// Used when a follow-up due time falls outside business hours but the
// calendar day should remain the same.
export function normalizeToBusinessHour(date: Date): Date {
  const result = new Date(date.getTime())
  result.setUTCHours(9, 0, 0, 0)
  return result
}

// Returns true if two Dates share the same UTC calendar day.
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth()    === b.getUTCMonth()    &&
    a.getUTCDate()     === b.getUTCDate()
  )
}
