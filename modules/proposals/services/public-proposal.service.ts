import { getProposalEventByShareToken, markProposalViewedIfUnseen } from '@/modules/proposals/repositories/proposal-events.repo'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// Public-safe view of a hosted proposal. Only fields suitable for an
// unauthenticated viewer are exposed — no tenant/workspace/user ids, no
// internal artifact paths.
export interface PublicProposalView {
  companyName:          string | null
  proposalStatus:      string
  estimatedSavings:    number | null   // monthly
  annualSavings:       number | null
  analysis:            StatementAnalysis | null
  generatedAt:         string | null
}

function asAnalysis(value: unknown): StatementAnalysis | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Partial<StatementAnalysis>
  // A minimally-valid snapshot has the discriminant + proposed pricing fields.
  if (typeof a.confidence !== 'string') return null
  return a as StatementAnalysis
}

// Loads a hosted proposal by its public share token. Returns null for an
// unknown / empty / deleted token — the caller renders a clean not-available
// page. Never throws on a missing row.
//
// opts.preview: when true, this is an internal operator preview — the
// view-flip (open-tracking) is skipped entirely, so opening the page never
// records a merchant view on any status. Default (no opts) is byte-for-byte the
// original public behavior.
export async function getPublicProposalByToken(
  token: string,
  opts?: { preview?: boolean }
): Promise<PublicProposalView | null> {
  if (!token || typeof token !== 'string') return null

  const event = await getProposalEventByShareToken(token).catch(() => null)
  if (!event) return null

  // Open-tracking: the first time a 'sent' proposal is opened, flip it to
  // 'viewed' and stamp first_viewed_at. Idempotent (the repo's conditional
  // UPDATE only matches sent + unseen), non-fatal, and never touches draft or
  // terminal proposals. Reflect the flip in the returned status.
  // Skipped entirely for an operator preview so a review never records a view.
  let proposalStatus = event.proposal_status
  if (!opts?.preview && event.proposal_status === 'sent' && event.first_viewed_at == null) {
    const flipped = await markProposalViewedIfUnseen(event.id).catch(() => false)
    if (flipped) proposalStatus = 'viewed'
  }

  const metadata = (event.metadata ?? {}) as Record<string, unknown>
  const analysis = asAnalysis(metadata.analysis)

  return {
    companyName:      typeof metadata.company_name === 'string' ? metadata.company_name : null,
    proposalStatus,
    estimatedSavings: event.estimated_savings,
    annualSavings:    event.proposal_amount,
    analysis,
    generatedAt:      typeof metadata.generated_at === 'string' ? metadata.generated_at : event.created_at,
  }
}
