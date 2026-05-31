// Proposal-specific subset of ActivityEventType (modules/intelligence/types.agent.ts).
// Canonical string values are defined here and mirrored in ActivityEventType — if you
// rename a value here, update types.agent.ts to match.
//
// Distinct from the Phase 3A PROPOSAL_SENT / PROPOSAL_APPROVED / PROPOSAL_REJECTED
// constants, which refer to AI-generated content proposals, not operator-recorded
// proposal captures.

export const PROPOSAL_ACTIVITY_EVENTS = {
  PROPOSAL_SENT_RECORDED:       'proposal_sent_recorded',
  PROPOSAL_CAPTURE_INGESTED:    'proposal_capture_ingested',
  PROPOSAL_CAPTURE_MATCHED:     'proposal_capture_matched',
  PROPOSAL_CAPTURE_REVIEWED:    'proposal_capture_reviewed',
  PROPOSAL_STATUS_UPDATED:      'proposal_status_updated',
  PROPOSAL_FOLLOW_UP_CREATED:   'proposal_follow_up_created',
  PROPOSAL_FOLLOW_UP_COMPLETED: 'proposal_follow_up_completed',
  PROPOSAL_FOLLOW_UP_SKIPPED:   'proposal_follow_up_skipped',
} as const

export type ProposalActivityEventType =
  typeof PROPOSAL_ACTIVITY_EVENTS[keyof typeof PROPOSAL_ACTIVITY_EVENTS]

const PROPOSAL_ACTIVITY_EVENT_VALUES = new Set<string>(
  Object.values(PROPOSAL_ACTIVITY_EVENTS)
)

export function isProposalActivityEventType(value: string): value is ProposalActivityEventType {
  return PROPOSAL_ACTIVITY_EVENT_VALUES.has(value)
}
