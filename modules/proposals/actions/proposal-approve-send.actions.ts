'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { approveAndSendProposal, type ApproveAndSendResult } from '@/modules/proposals/services/proposal-approve-send.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

// Maps internal service error codes to operator-facing messages.
const ERROR_MESSAGES: Record<Extract<ApproveAndSendResult, { ok: false }>['error'], string> = {
  proposal_not_found: 'Proposal not found.',
  not_approvable:     'This proposal has already been sent or is not approvable.',
  sending_disabled:   'Email sending is disabled by the system control. Enable it before sending.',
  no_contact_email:   'No contact email on this proposal — add a contact before sending.',
  no_sender_identity: 'No verified sender identity is configured for this workspace.',
  invalid_rule:       'Unknown follow-up cadence.',
  recipient_not_eligible: 'The merchant contact is unsubscribed, suppressed, or marked do-not-contact — the proposal was not sent.',
  send_failed:        'The email could not be sent. Please try again.',
}

export async function approveAndSendProposalAction(
  proposalEventId: string,
  scheduleRuleKey?: string
): Promise<ActionResult<{ status: 'sent'; commitmentsScheduled: number; publicUrl: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    // Sending email is the privileged operation here.
    requirePermission(ctx, 'messaging.send_emails')

    if (!proposalEventId) {
      return { success: false, error: 'invalid_input: proposalEventId is required' }
    }

    const result = await approveAndSendProposal(ctx, { proposalEventId, scheduleRuleKey })
    if (!result.ok) {
      return { success: false, error: ERROR_MESSAGES[result.error] }
    }

    revalidatePath('/[workspaceSlug]/proposal-events/[eventId]', 'page')
    return {
      success: true,
      data: {
        status:               result.status,
        commitmentsScheduled: result.commitmentsScheduled,
        publicUrl:            result.publicUrl,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
