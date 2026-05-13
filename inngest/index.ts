import { dispatchOutbox } from './functions/dispatch-outbox'
import { onLeadCreated } from './functions/on-lead-created'
import { onApprovalApproved, onApprovalRejected } from './functions/on-approval-decided'
import { reconcileEmailDraftStatus } from './functions/reconcile-email-draft-status'

export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
]
