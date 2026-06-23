// MCM v2 — Inbound reply classification (P3.5). Pure, dependency-free helpers
// for the inbound-reply webhook. No DB, no I/O — fully unit-testable.

export interface InboundReplyHeaders {
  message_id?: string | null
  in_reply_to?: string | null
  references?: string | null
  auto_submitted?: string | null
  x_autoreply?: string | null
  precedence?: string | null
}

// Auto-reply detection — true if any standard auto-response signal is present.
// Headers (RFC 3834 Auto-Submitted, X-Autoreply, Precedence) take priority; the
// subject heuristic is the last-resort catch for senders that omit the headers.
export function isAutoReply(
  headers: InboundReplyHeaders | null | undefined,
  subject: string | null | undefined,
): boolean {
  const h = headers ?? {}

  const autoSubmitted = (h.auto_submitted ?? '').toLowerCase()
  if (autoSubmitted.includes('auto-replied') || autoSubmitted.includes('auto-generated')) {
    return true
  }

  // X-Autoreply: any non-empty, non-"no"/"false" value counts as truthy.
  const xAutoreply = (h.x_autoreply ?? '').trim().toLowerCase()
  if (xAutoreply && xAutoreply !== 'no' && xAutoreply !== 'false' && xAutoreply !== '0') {
    return true
  }

  const precedence = (h.precedence ?? '').trim().toLowerCase()
  if (precedence === 'auto_reply' || precedence === 'bulk' || precedence === 'junk') {
    return true
  }

  const subj = subject ?? ''
  if (/out of office|automatic reply|auto[- ]?reply|vacation|away from (the )?office/i.test(subj)) {
    return true
  }

  return false
}

export interface OptOutResult {
  detected: boolean
  strict: boolean
}

// Strict opt-out phrases — whole-phrase, case-insensitive. A match here is a
// hard opt-out: suppress the address. A bare "stop"/"no" is intentionally NOT
// strict (interested replies often contain "stop sending so many").
const STRICT_OPTOUT_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\bopt[- ]?out\b/i,
  /\bstop emailing\b/i,
  /\bdo not contact\b/i,
]

// Softer signals — surfaced for human review (detected) but never auto-suppress.
const SOFT_OPTOUT_PATTERNS: RegExp[] = [
  /\bnot interested\b/i,
  /\bplease stop\b/i,
  /\bno thanks\b/i,
]

export function detectOptOut(body: string | null | undefined): OptOutResult {
  const text = body ?? ''
  const strict = STRICT_OPTOUT_PATTERNS.some(re => re.test(text))
  if (strict) return { detected: true, strict: true }
  const soft = SOFT_OPTOUT_PATTERNS.some(re => re.test(text))
  return { detected: soft, strict: false }
}
