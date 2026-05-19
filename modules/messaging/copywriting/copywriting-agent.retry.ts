// ============================================================
// Phase 3B — Retry Coordinator
// Manages per-version retry/repair logic.
// Retry-eligible errors: COPY_015, COPY_016, COPY_019, COPY_020
// Retry limit: 2 attempts per version slot.
// Pre-generation errors (COPY_001–COPY_014, COPY_017) are
// not retry eligible and immediately fail the run.
// ============================================================

import { COPY_ERROR_CODES } from './copywriting-agent.types'
import type {
  CopyErrorCode,
  RepairAttempt,
} from './copywriting-agent.types'

// ---- Retry-eligible error codes ----

const RETRY_ELIGIBLE: ReadonlySet<CopyErrorCode> = new Set([
  COPY_ERROR_CODES.COPY_015,
  COPY_ERROR_CODES.COPY_016,
  COPY_ERROR_CODES.COPY_019,
  COPY_ERROR_CODES.COPY_020,
])

// ---- Retry limit per version slot ----

export const MAX_RETRY_ATTEMPTS = 2

// ---- Retry state tracker ----

export interface RetryState {
  attemptsPerSlot: Map<number, number>  // versionNumber → attempt count
  repairs:         RepairAttempt[]
}

export function createRetryState(): RetryState {
  return {
    attemptsPerSlot: new Map(),
    repairs:         [],
  }
}

// ---- Check if a version slot can be retried ----

export function canRetry(
  state:         RetryState,
  versionNumber: number,
  errorCode:     CopyErrorCode
): boolean {
  if (!RETRY_ELIGIBLE.has(errorCode)) return false
  const attempts = state.attemptsPerSlot.get(versionNumber) ?? 0
  return attempts < MAX_RETRY_ATTEMPTS
}

// ---- Record a retry attempt ----

export function recordRetryAttempt(
  state:                      RetryState,
  versionNumber:              number,
  originalFailureCode:        CopyErrorCode,
  originalFailureDescription: string,
  outcome:                    'repaired' | 'discarded'
): RepairAttempt {
  const current = state.attemptsPerSlot.get(versionNumber) ?? 0
  const attemptNumber = current + 1
  state.attemptsPerSlot.set(versionNumber, attemptNumber)

  const attempt: RepairAttempt = {
    attemptNumber,
    versionNumber,
    originalFailureCode,
    originalFailureDescription,
    outcome,
    repairedVersionSatisfied: outcome === 'repaired',
  }
  state.repairs.push(attempt)
  return attempt
}

// ---- Check if retry is eligible for a given error code ----

export function isRetryEligible(errorCode: CopyErrorCode): boolean {
  return RETRY_ELIGIBLE.has(errorCode)
}

// ---- Determine primary error from a list ----

export function getPrimaryError(errors: CopyErrorCode[]): CopyErrorCode | null {
  // Priority order: COPY_020 (invented fact) > COPY_019 (banned phrase) >
  // COPY_016 (body compliance) > COPY_015 (subject compliance)
  const priority: CopyErrorCode[] = [
    COPY_ERROR_CODES.COPY_020,
    COPY_ERROR_CODES.COPY_019,
    COPY_ERROR_CODES.COPY_016,
    COPY_ERROR_CODES.COPY_015,
  ]
  for (const code of priority) {
    if (errors.includes(code)) return code
  }
  return errors[0] ?? null
}

// ---- Build generation note for a repaired version ----

export function buildRepairNote(attempts: RepairAttempt[]): string {
  if (attempts.length === 0) return ''
  const repairDescriptions = attempts.map(a =>
    `Attempt ${a.attemptNumber} for v${a.versionNumber}: ${a.originalFailureCode} (${a.originalFailureDescription}) — ${a.outcome}`
  )
  return `Repair history: ${repairDescriptions.join('; ')}`
}
