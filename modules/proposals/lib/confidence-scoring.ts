export type MatchCandidateType =
  | 'contact_email'
  | 'company_domain_with_user'
  | 'company_domain'
  | 'subject_token'
  | 'none'

export interface MatchCandidate {
  type: MatchCandidateType
  // true when multiple companies share the same domain — lowers confidence
  isAmbiguous?: boolean
}

// Scores >= AUTO_MATCH_THRESHOLD auto-create a proposal_event.
// Plain company-domain score (80) is BELOW this threshold and routes to human review.
// Only contact_email (95) and company_domain_with_user (90) auto-match.
export const AUTO_MATCH_THRESHOLD = 85

// Scores in [REVIEW_THRESHOLD, AUTO_MATCH_THRESHOLD) route to the human review inbox.
// Scores < REVIEW_THRESHOLD are treated as probable spam.
export const REVIEW_THRESHOLD = 40

const SCORE_MAP: Record<MatchCandidateType, number> = {
  contact_email:            95,
  company_domain_with_user: 90,
  company_domain:           80,
  subject_token:            60,
  none:                      0,
}

const AMBIGUOUS_DOMAIN_SCORE = 65

export function calculateCaptureConfidence(candidate: MatchCandidate): number {
  if (candidate.type === 'company_domain' && candidate.isAmbiguous) {
    return AMBIGUOUS_DOMAIN_SCORE
  }
  return SCORE_MAP[candidate.type]
}

export function shouldAutoMatch(confidence: number): boolean {
  return confidence >= AUTO_MATCH_THRESHOLD
}

// Scores in [REVIEW_THRESHOLD, AUTO_MATCH_THRESHOLD) route to inbox for human review.
export function shouldRouteToInbox(confidence: number): boolean {
  return confidence >= REVIEW_THRESHOLD && confidence < AUTO_MATCH_THRESHOLD
}

export function isProbablySpam(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD
}
