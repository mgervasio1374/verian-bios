import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Read-only proposal pipeline aggregation for the Proposals dashboard.
// Tenant/workspace-scoped, non-deleted. Pure reads — no lifecycle/send changes.

export interface ProposalPipelineStats {
  statusCounts:    Record<string, number>
  totalProposals:  number
  openCount:       number   // sent + viewed
  savingsPipeline: number   // SUM(proposal_amount) for open proposals (sent + viewed)
  wonSavings:      number   // SUM(proposal_amount) for accepted
  viewRate:        number   // (viewed + accepted + rejected) / (sent + viewed + accepted + rejected)
  winRate:         number   // accepted / (accepted + rejected)
}

interface PipelineRow {
  proposal_status: string
  proposal_amount: number | null
}

// Pure aggregation — every denominator guarded so rates are never NaN.
export function aggregateProposalPipeline(rows: PipelineRow[]): ProposalPipelineStats {
  const statusCounts: Record<string, number> = {}
  let savingsPipeline = 0
  let wonSavings = 0

  for (const row of rows) {
    statusCounts[row.proposal_status] = (statusCounts[row.proposal_status] ?? 0) + 1
    const amount = typeof row.proposal_amount === 'number' ? row.proposal_amount : 0
    if (row.proposal_status === 'sent' || row.proposal_status === 'viewed') savingsPipeline += amount
    if (row.proposal_status === 'accepted') wonSavings += amount
  }

  const sent     = statusCounts['sent']     ?? 0
  const viewed   = statusCounts['viewed']   ?? 0
  const accepted = statusCounts['accepted'] ?? 0
  const rejected = statusCounts['rejected'] ?? 0

  // View rate: of everything that was actually sent, how much has been opened
  // (viewed) or progressed past viewing (accepted/rejected). Drafts and
  // expired/withdrawn are excluded from the denominator.
  const viewDenominator = sent + viewed + accepted + rejected
  const viewRate = viewDenominator > 0 ? (viewed + accepted + rejected) / viewDenominator : 0

  // Win rate: of decided proposals, how many were accepted.
  const decided = accepted + rejected
  const winRate = decided > 0 ? accepted / decided : 0

  return {
    statusCounts,
    totalProposals:  rows.length,
    openCount:       sent + viewed,
    savingsPipeline,
    wonSavings,
    viewRate,
    winRate,
  }
}

export async function getProposalPipelineStats(
  tenantId:    string,
  workspaceId: string
): Promise<ProposalPipelineStats> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('proposal_events')
    .select('proposal_status, proposal_amount')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  return aggregateProposalPipeline((data ?? []) as PipelineRow[])
}

export interface RecentProposalRow {
  id:              string
  companyId:       string | null
  companyName:     string | null
  proposalStatus:  string
  proposalAmount:  number | null
  proposalCurrency: string
  firstViewedAt:   string | null
  createdAt:       string
}

// Latest proposals for the dashboard table. Company names batch-loaded (no N+1).
export async function getRecentProposals(
  tenantId:    string,
  workspaceId: string,
  limit:       number = 10
): Promise<RecentProposalRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data: events } = await supabase
    .from('proposal_events')
    .select('id, company_id, proposal_status, proposal_amount, proposal_currency, first_viewed_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  const rows = events ?? []
  if (rows.length === 0) return []

  const companyIds = [...new Set(rows.map(r => r.company_id).filter((id): id is string => !!id))]
  const nameMap = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', companyIds)
    for (const c of companies ?? []) nameMap.set(c.id, c.name)
  }

  return rows.map(r => ({
    id:               r.id,
    companyId:        r.company_id,
    companyName:      r.company_id ? (nameMap.get(r.company_id) ?? null) : null,
    proposalStatus:   r.proposal_status,
    proposalAmount:   r.proposal_amount,
    proposalCurrency: r.proposal_currency,
    firstViewedAt:    r.first_viewed_at,
    createdAt:        r.created_at,
  }))
}
