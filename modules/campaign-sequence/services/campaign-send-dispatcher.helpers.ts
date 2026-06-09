/**
 * Pure, DB-free helpers for the Slice 5 send dispatcher.
 * Isolated in this file so tests can import without pulling in the Resend/Supabase chain.
 */

/** Reason substrings from sendApprovedDraft that indicate a temporary block — retry next tick. */
export const DEFERRED_SEND_REASONS = [
  'sending_disabled_by_system_control',
  'rate_limit',
] as const

export type SendOutcomeClassification = 'sent' | 'failed' | 'deferred'

/**
 * Maps a SendResult to a dispatcher classification:
 *   ok=true                              → 'sent'
 *   ok=false, alreadySent=true           → 'sent'  (crash-safety idempotent path)
 *   reason matches DEFERRED_SEND_REASONS → 'deferred' (retry next tick, no transition)
 *   all other failures                   → 'failed'
 */
export function classifySendOutcome(result: {
  ok: boolean
  reason?: string
  alreadySent?: boolean
}): SendOutcomeClassification {
  if (result.ok) return 'sent'
  if (result.alreadySent) return 'sent'
  const reason = result.reason ?? ''
  if (DEFERRED_SEND_REASONS.some(s => reason.includes(s))) return 'deferred'
  return 'failed'
}

/** Returns true when no pending (non-terminal) schedule items remain — assignment may complete. */
export function shouldCompleteAssignment(pendingCount: number): boolean {
  return pendingCount === 0
}
