// Campaign recipient guard — the send-time backstop for "one inbox, one
// enrollment per sequence".
//
// bulkAssignCampaignToCompanies already refuses to enroll an address that is
// live on the sequence, which is where the duplicate is cheapest to stop. This
// guard covers every other route to a send: single-lead assignment, an
// assignment created before that check existed, a re-assign after a stop, or any
// future caller of sendApprovedDraft. It runs inside the universal send
// chokepoint so nothing reaches Resend without passing it.
//
// The distinction that matters: a sequence is SUPPOSED to send the same person
// several touches, so identity of (sequence, address) alone is not a duplicate.
// A duplicate is the same (sequence, address) reached through a DIFFERENT
// assignment — that is one owner enrolled once per company they own. Keying on
// the assignment preserves normal multi-touch behavior exactly.

import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Statuses that mean the provider has, or may have, taken the message. 'failed'
// without a provider id is excluded: a send that never left must not burn the
// recipient's slot. This mirrors getBlockingSendForDraft's reasoning.
const CONSUMING_STATUSES = ['queued', 'sent', 'provider_accepted'] as const

export type RecipientGuardResult =
  | { blocked: false }
  | { blocked: true; reason: string; conflictingAssignmentId: string }

/**
 * Has this address already been reached by this sequence through a different
 * assignment?
 *
 * Never throws — it is called from the send path, and an infrastructure blip
 * must not turn into a failed send. On a query error it returns not-blocked and
 * leaves the decision to the guards around it; the assignment-time check is the
 * primary defense and has already run fail-closed.
 */
export async function checkCampaignRecipientDuplicate(params: {
  tenantId:             string
  toEmail:              string
  campaignSequenceId:   string | null
  campaignAssignmentId: string | null
}): Promise<RecipientGuardResult> {
  const { tenantId, toEmail, campaignSequenceId, campaignAssignmentId } = params

  // Not a campaign send, or not attributable — nothing to compare against.
  if (!campaignSequenceId || !campaignAssignmentId || !toEmail) return { blocked: false }

  // Match the address as stored and lowercased. An explicit value list is used
  // rather than ilike because '_' is legal in a local part and would act as a
  // single-character wildcard, matching unrelated addresses.
  const candidates = [...new Set([toEmail, toEmail.trim().toLowerCase()])]

  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('email_sends')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .in('to_email', candidates)
      .in('status', CONSUMING_STATUSES)
      .contains('metadata', { campaign_sequence_id: campaignSequenceId })
      .limit(50)

    if (error || !data) return { blocked: false }

    for (const row of data) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const otherAssignmentId = meta['campaign_assignment_id']
      if (typeof otherAssignmentId !== 'string') continue
      if (otherAssignmentId === campaignAssignmentId) continue   // same enrollment: a normal later touch
      return {
        blocked: true,
        reason: 'recipient_already_in_campaign',
        conflictingAssignmentId: otherAssignmentId,
      }
    }
    return { blocked: false }
  } catch {
    return { blocked: false }
  }
}
