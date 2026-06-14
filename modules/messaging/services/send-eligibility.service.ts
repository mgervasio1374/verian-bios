import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'

// Centralized recipient-eligibility check for every external send path.
// Pure delegation to the existing do_not_contact flag + suppression repo —
// no schema, no new tables. do_not_contact takes precedence over suppression,
// matching the order enforced in sendApprovedDraft (DNC before suppression).

export type SendBlockReason =
  | 'do_not_contact'
  | 'suppressed_unsubscribed'
  | 'suppressed_email'
  | 'suppressed_domain'

export type SendEligibility =
  | { allowed: true }
  | { allowed: false; reason: SendBlockReason }

// Maps the suppression repo's reason vocabulary onto the eligibility vocabulary.
const SUPPRESSION_REASON_MAP: Record<NonNullable<suppressionRepo.SuppressionResult['reason']>, SendBlockReason> = {
  email_unsubscribed: 'suppressed_unsubscribed',
  email_suppressed:   'suppressed_email',
  domain_suppressed:  'suppressed_domain',
}

export async function checkSendEligibility(
  tenantId: string,
  email: string,
  opts?: { doNotContact?: boolean | null }
): Promise<SendEligibility> {
  // DNC precedence — short-circuit before any suppression read.
  if (opts?.doNotContact === true) {
    return { allowed: false, reason: 'do_not_contact' }
  }

  const suppression = await suppressionRepo.checkEmailSuppression(tenantId, email)
  if (suppression.blocked && suppression.reason) {
    return { allowed: false, reason: SUPPRESSION_REASON_MAP[suppression.reason] }
  }

  return { allowed: true }
}
