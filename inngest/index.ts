import { dispatchOutbox } from './functions/dispatch-outbox'
import { onLeadCreated } from './functions/on-lead-created'
import { onApprovalApproved, onApprovalRejected } from './functions/on-approval-decided'
import { reconcileEmailDraftStatus } from './functions/reconcile-email-draft-status'
import { onStatementReceived } from './functions/on-statement-received'
import { reconcileSendBridgeStuckDrafts } from './functions/reconcile-send-bridge-stuck-drafts'
import { scheduledLearningAgentRun } from './functions/scheduled-learning-agent-run'
import { processImportBatch } from './functions/process-import-batch'
import { processCampaignSchedule } from './functions/process-campaign-schedule'
import { processCampaignApprovals } from './functions/process-campaign-approvals'
import { processCampaignSends } from './functions/process-campaign-sends'
import { onCampaignAssignmentActivated } from './functions/on-campaign-assignment-activated'

export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
  onStatementReceived,
  reconcileSendBridgeStuckDrafts,  // Phase 3B.1: SEB stuck-draft detection/reconciliation
  scheduledLearningAgentRun,       // Phase 3B.1: daily advisory Learning Agent run
  processImportBatch,              // Phase 3B.2: background large-file import processing
  processCampaignSchedule,         // Manual Campaign Mode Slice 3: promote due schedule items to drafts
  processCampaignApprovals,        // Manual Campaign Mode Slice 4: hybrid approval routing (first-touch queue, gated auto-approve)
  processCampaignSends,            // Manual Campaign Mode Slice 5: send dispatcher (approved -> sent via sendApprovedDraft)
  onCampaignAssignmentActivated,   // Manual Campaign Mode Slice 7: materialize schedule items on assignment activation
]
