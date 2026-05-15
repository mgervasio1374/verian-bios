import { dispatchOutbox } from './functions/dispatch-outbox'
import { onLeadCreated } from './functions/on-lead-created'
import { onApprovalApproved, onApprovalRejected } from './functions/on-approval-decided'
import { reconcileEmailDraftStatus } from './functions/reconcile-email-draft-status'
import { onStatementReceived } from './functions/on-statement-received'

export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
  onStatementReceived,
]
