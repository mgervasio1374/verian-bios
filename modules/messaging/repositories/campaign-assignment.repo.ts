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

export async function getActiveDuplicateAssignmentContact(
  contactId:    string,
  campaignType: string
): Promise<CampaignAssignment | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('*')
    .eq('contact_id', contactId)
    .is('lead_id', null)
    .eq('campaign_type', campaignType)
    .in('assignment_status', ['proposed', 'assigned'])
    .maybeSingle()

  if (error) throw new Error('getActiveDuplicateAssignmentContact: ' + error.message)
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

// MCM v2 Slice U3 — marketing-status rollup for the Companies list.
// A company is "in a campaign" when at least one proposed/assigned assignment
// resolves to it, via contacts (contact-scoped campaigns) OR leads
// (legacy lead-scoped campaigns). Called per page of <= 50 companies.
export async function getCompaniesInActiveCampaigns(
  tenantId:    string,
  workspaceId: string,
  companyIds:  string[],
): Promise<Set<string>> {
  if (companyIds.length === 0) return new Set()
  const supabase = createSupabaseServiceClient()

  const { data: assignments, error } = await supabase
    .from('campaign_assignments')
    .select('contact_id, lead_id')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('assignment_status', ['proposed', 'assigned'])

  if (error) throw new Error('getCompaniesInActiveCampaigns: ' + error.message)

  const rows       = (assignments ?? []) as { contact_id: string | null; lead_id: string | null }[]
  const contactIds = [...new Set(rows.map(r => r.contact_id).filter((id): id is string => Boolean(id)))]
  const leadIds    = [...new Set(rows.map(r => r.lead_id).filter((id): id is string => Boolean(id)))]

  const companiesInCampaigns = new Set<string>()

  if (contactIds.length > 0) {
    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('company_id')
      .in('id', contactIds)
      .not('company_id', 'is', null)

    if (contactError) throw new Error('getCompaniesInActiveCampaigns contacts: ' + contactError.message)
    for (const row of (contacts ?? []) as { company_id: string | null }[]) {
      if (row.company_id) companiesInCampaigns.add(row.company_id)
    }
  }

  if (leadIds.length > 0) {
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('company_id')
      .in('id', leadIds)
      .not('company_id', 'is', null)

    if (leadError) throw new Error('getCompaniesInActiveCampaigns leads: ' + leadError.message)
    for (const row of (leads ?? []) as { company_id: string | null }[]) {
      if (row.company_id) companiesInCampaigns.add(row.company_id)
    }
  }

  return new Set(companyIds.filter(id => companiesInCampaigns.has(id)))
}
