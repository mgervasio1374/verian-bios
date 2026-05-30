import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignAssignment,
  InsertCampaignAssignment,
  UpdateAssignmentStatusPatch,
} from '@/modules/messaging/types/campaign-assignment.types'

function toAssignment(row: Record<string, unknown>): CampaignAssignment {
  return row as unknown as CampaignAssignment
}

export async function getCampaignAssignmentsForLead(
  workspaceId: string,
  leadId:      string
): Promise<CampaignAssignment[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('getCampaignAssignmentsForLead: ' + error.message)
  return (data ?? []).map(toAssignment)
}

export async function getCampaignAssignmentsForAsset(
  workspaceId: string,
  assetId:     string
): Promise<CampaignAssignment[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('campaign_asset_id', assetId)
    .in('assignment_status', ['proposed', 'assigned'])
    .order('created_at', { ascending: false })

  if (error) throw new Error('getCampaignAssignmentsForAsset: ' + error.message)
  return (data ?? []).map(toAssignment)
}

export async function getProposedAssignments(
  workspaceId: string
): Promise<CampaignAssignment[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('assignment_status', 'proposed')
    .order('created_at', { ascending: false })

  if (error) throw new Error('getProposedAssignments: ' + error.message)
  return (data ?? []).map(toAssignment)
}

export async function getActiveDuplicateAssignment(
  leadId:       string,
  campaignType: string
): Promise<CampaignAssignment | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('lead_id', leadId)
    .eq('campaign_type', campaignType)
    .in('assignment_status', ['proposed', 'assigned'])
    .maybeSingle()

  if (error) throw new Error('getActiveDuplicateAssignment: ' + error.message)
  return data ? toAssignment(data as unknown as Record<string, unknown>) : null
}

export async function getAssignmentById(
  assignmentId: string
): Promise<CampaignAssignment | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle()

  if (error) throw new Error('getAssignmentById: ' + error.message)
  return data ? toAssignment(data as unknown as Record<string, unknown>) : null
}

export async function insertCampaignAssignment(
  payload: InsertCampaignAssignment
): Promise<CampaignAssignment> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error('insertCampaignAssignment: ' + error.message)
  return toAssignment(data as unknown as Record<string, unknown>)
}

export async function updateAssignmentStatus(
  assignmentId: string,
  patch:        UpdateAssignmentStatusPatch
): Promise<CampaignAssignment> {
  const supabase = createSupabaseServiceClient()
  const updatePayload: Record<string, unknown> = {
    assignment_status: patch.assignment_status,
  }
  if (patch.assigned_by_user_id !== undefined) {
    updatePayload.assigned_by_user_id = patch.assigned_by_user_id
  }
  if (patch.retired_at !== undefined) {
    updatePayload.retired_at = patch.retired_at
  }

  const { data, error } = await supabase
    .from('campaign_assignments')
    .update(updatePayload)
    .eq('id', assignmentId)
    .select()
    .single()

  if (error) throw new Error('updateAssignmentStatus: ' + error.message)
  return toAssignment(data as unknown as Record<string, unknown>)
}
