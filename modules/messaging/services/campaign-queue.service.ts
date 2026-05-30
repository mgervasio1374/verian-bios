import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { CampaignAssignment } from '@/modules/messaging/types/campaign-assignment.types'

export type DraftReadiness =
  | 'no_draft'
  | 'has_pending_draft'
  | 'has_approved_draft'
  | 'has_draft_from_assignment'

export interface CampaignQueueEntry {
  assignment:     CampaignAssignment
  leadName:       string | null
  leadStatus:     string | null
  leadStage:      string | null
  assetName:      string | null
  draftReadiness: DraftReadiness
}

export async function getCampaignWorkQueue(
  tenantId:    string,
  workspaceId: string
): Promise<CampaignQueueEntry[]> {
  const supabase = createSupabaseServiceClient()

  // 1. Fetch all active assigned assignments for the workspace
  const { data: assignments, error: assignmentError } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('assignment_status', 'assigned')
    .order('created_at', { ascending: false })

  if (assignmentError) throw new Error(`getCampaignWorkQueue assignments: ${assignmentError.message}`)
  if (!assignments || assignments.length === 0) return []

  // 2. Fetch lead names/status/stage in one query
  const leadIds = [...new Set(assignments.map(a => a.lead_id).filter(Boolean) as string[])]
  const leadMap = new Map<string, { name: string | null; status: string | null; stage: string | null }>()

  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, status, stage')
      .in('id', leadIds)
      .eq('tenant_id', tenantId)

    for (const lead of leads ?? []) {
      leadMap.set(lead.id, { name: lead.name ?? null, status: lead.status ?? null, stage: lead.stage ?? null })
    }
  }

  // 3. Fetch asset names for assignments that have a campaign_asset_id
  const assetIds = [...new Set(assignments.map(a => a.campaign_asset_id).filter(Boolean) as string[])]
  const assetMap = new Map<string, string | null>()

  if (assetIds.length > 0) {
    const { data: assets } = await supabase
      .from('campaign_email_assets')
      .select('id, asset_name')
      .eq('tenant_id', tenantId)
      .in('id', assetIds)

    for (const asset of assets ?? []) {
      assetMap.set(asset.id, asset.asset_name ?? null)
    }
  }

  // 4. Fetch active (non-terminal) drafts for the relevant leads
  const draftLeadIds = leadIds
  const draftsByLeadId = new Map<string, { status: string; campaign_assignment_id: string | null }[]>()

  if (draftLeadIds.length > 0) {
    const { data: drafts } = await supabase
      .from('email_drafts')
      .select('lead_id, status, campaign_assignment_id')
      .eq('tenant_id', tenantId)
      .in('lead_id', draftLeadIds)
      .not('status', 'in', '("sent","superseded")')
      .is('deleted_at', null)

    for (const draft of drafts ?? []) {
      if (!draft.lead_id) continue
      const existing = draftsByLeadId.get(draft.lead_id) ?? []
      existing.push({ status: draft.status, campaign_assignment_id: draft.campaign_assignment_id as string | null })
      draftsByLeadId.set(draft.lead_id, existing)
    }
  }

  // 5. Build queue entries
  const entries: CampaignQueueEntry[] = assignments.map(a => {
    const leadInfo = a.lead_id ? leadMap.get(a.lead_id) : undefined
    const assetName = a.campaign_asset_id ? assetMap.get(a.campaign_asset_id) ?? null : null
    const draftsForLead = a.lead_id ? draftsByLeadId.get(a.lead_id) ?? [] : []

    let draftReadiness: DraftReadiness = 'no_draft'

    // Check if any draft is linked to this specific assignment
    const linkedDraft = draftsForLead.find(d => d.campaign_assignment_id === a.id)
    if (linkedDraft) {
      draftReadiness = 'has_draft_from_assignment'
    } else if (draftsForLead.some(d => d.status === 'approved')) {
      draftReadiness = 'has_approved_draft'
    } else if (draftsForLead.some(d => d.status === 'pending_approval' || d.status === 'draft')) {
      draftReadiness = 'has_pending_draft'
    }

    return {
      assignment:     a as unknown as CampaignAssignment,
      leadName:       leadInfo?.name ?? null,
      leadStatus:     leadInfo?.status ?? null,
      leadStage:      leadInfo?.stage ?? null,
      assetName,
      draftReadiness,
    }
  })

  // 6. Sort: no_draft first (need attention), then has_pending_draft, then the rest
  const order: Record<DraftReadiness, number> = {
    no_draft:                 0,
    has_pending_draft:        1,
    has_approved_draft:       2,
    has_draft_from_assignment: 3,
  }

  return entries.sort((a, b) => order[a.draftReadiness] - order[b.draftReadiness])
}
