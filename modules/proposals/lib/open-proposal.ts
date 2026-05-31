export const OPEN_PROPOSAL_STATUSES = ['sent', 'viewed'] as const
export const CLOSED_PROPOSAL_STATUSES = ['accepted', 'rejected', 'expired', 'withdrawn'] as const

export type OpenProposalStatus   = typeof OPEN_PROPOSAL_STATUSES[number]
export type ClosedProposalStatus = typeof CLOSED_PROPOSAL_STATUSES[number]

export function isOpenProposalStatus(status: string): boolean {
  return (OPEN_PROPOSAL_STATUSES as readonly string[]).includes(status)
}

export function isClosedProposalStatus(status: string): boolean {
  return (CLOSED_PROPOSAL_STATUSES as readonly string[]).includes(status)
}

// MVP rule: one open proposal per lead.
// Returns true only when no existing open proposal is present.
export function canCreateNewProposal(existingOpenProposal: { id: string } | null): boolean {
  return existingOpenProposal === null
}
