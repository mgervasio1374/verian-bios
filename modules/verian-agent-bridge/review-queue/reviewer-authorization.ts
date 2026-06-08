import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  VerianBridgeAuditActor,
  VerianBridgeAuditLedgerRule,
} from '@/modules/verian-agent-bridge/audit-ledger/types'
import type {
  VerianBridgeReviewQueueAction,
  VerianBridgeReviewQueueState,
} from '@/modules/verian-agent-bridge/review-queue/types'

export class ReviewerAuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewerAuthorizationError'
  }
}

// Verifies the actor is an active workspace member before any status transition.
// Throws ReviewerAuthorizationError if not found or not active.
export async function assertReviewerIsWorkspaceMember(
  reviewerId: string,
  workspaceId: string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, status')
    .eq('user_id', reviewerId)
    .eq('workspace_id', workspaceId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) {
    throw new ReviewerAuthorizationError(
      `assertReviewerIsWorkspaceMember: reviewer ${reviewerId} is not a member of workspace ${workspaceId}`
    )
  }

  if (data.status !== 'active') {
    throw new ReviewerAuthorizationError(
      `assertReviewerIsWorkspaceMember: reviewer ${reviewerId} membership is not active (status: ${data.status})`
    )
  }
}

// Synchronous check — no DB call.
// Enforces which actor types may perform which actions.
export function assertActorCanTransitionState(
  actorType: VerianBridgeAuditActor,
  fromState: VerianBridgeReviewQueueState,
  action: VerianBridgeReviewQueueAction
): void {
  const approvalActions: VerianBridgeReviewQueueAction[] = [
    'approve_for_manual_handoff',
    'deny',
    'request_revision',
    'reopen_for_review',
  ]
  const archiveActions: VerianBridgeReviewQueueAction[] = ['archive']
  const codexActions: VerianBridgeReviewQueueAction[] = ['mark_codex_review_received']
  const policyActions: VerianBridgeReviewQueueAction[] = [
    'submit_for_policy_review',
    'policy_check_passed',
    'policy_check_warning',
    'policy_check_blocked',
    'policy_check_requires_codex',
    'policy_check_requires_human',
  ]

  if (approvalActions.includes(action) && actorType !== 'michael') {
    throw new ReviewerAuthorizationError(
      `assertActorCanTransitionState: only actorType 'michael' may perform action '${action}'; got '${actorType}'`
    )
  }

  if (archiveActions.includes(action) && actorType !== 'michael' && actorType !== 'system') {
    throw new ReviewerAuthorizationError(
      `assertActorCanTransitionState: only 'michael' or 'system' may archive; got '${actorType}'`
    )
  }

  if (codexActions.includes(action) && actorType !== 'codex' && actorType !== 'michael') {
    throw new ReviewerAuthorizationError(
      `assertActorCanTransitionState: only 'codex' or 'michael' may mark Codex review received; got '${actorType}'`
    )
  }

  if (policyActions.includes(action) && actorType !== 'system' && actorType !== 'michael') {
    throw new ReviewerAuthorizationError(
      `assertActorCanTransitionState: only 'system' or 'michael' may perform policy-check action '${action}'; got '${actorType}'`
    )
  }
}

// Validates that the requested state transition is permitted by the state machine.
// Slice 10 implements the core human-approval transitions only.
// Policy-check-driven transitions (submit_for_policy_review, policy_check_*) are
// reserved for a future slice when the policy check service is implemented.
// Throws if the current state does not allow the target transition.
export function assertValidStateTransition(
  fromState: VerianBridgeReviewQueueState,
  action: VerianBridgeReviewQueueAction
): void {
  const permitted: Partial<Record<VerianBridgeReviewQueueState, VerianBridgeReviewQueueAction[]>> = {
    draft_packet: ['submit_for_policy_review', 'archive'],
    pending_policy_review: [
      'policy_check_passed',
      'policy_check_warning',
      'policy_check_blocked',
      'policy_check_requires_codex',
      'policy_check_requires_human',
      'archive',
    ],
    blocked_by_policy: ['archive'],
    waiting_codex_review: ['mark_codex_review_received', 'archive'],
    waiting_human_approval: [
      'approve_for_manual_handoff',
      'deny',
      'request_revision',
      'archive',
    ],
    revision_requested: ['reopen_for_review', 'archive'],
    approved_for_manual_handoff: ['archive'],
    denied: ['reopen_for_review', 'archive'],
    archived: [],
  }

  const allowed = permitted[fromState] ?? []
  if (!allowed.includes(action)) {
    throw new ReviewerAuthorizationError(
      `assertValidStateTransition: action '${action}' is not permitted from state '${fromState}'`
    )
  }
}
