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

// MCM v2 Slice U4 — per-company campaign rollup for the company detail page.
// Assignments resolve to the company via its contacts (contact-scoped) or its
// leads (legacy lead-scoped). emails_sent counts only dispatched sends.
export interface CompanyAssignmentRollup {
  id:                string
  campaign_type:     string
  sequence_name:     string
  assignment_status: string
  created_at:        string
  emails_sent:       number
}

const DISPATCHED_SEND_STATUSES = ['sent', 'delivered', 'bounced', 'complained']

export async function listAssignmentsForCompany(
  tenantId:    string,
  workspaceId: string,
  companyId:   string,
): Promise<CompanyAssignmentRollup[]> {
  const supabase = createSupabaseServiceClient()

  const [{ data: contacts }, { data: leads }] = await Promise.all([
    supabase.from('contacts').select('id')
      .eq('tenant_id', tenantId).eq('company_id', companyId),
    supabase.from('leads').select('id')
      .eq('tenant_id', tenantId).eq('company_id', companyId),
  ])

  const contactIds = ((contacts ?? []) as { id: string }[]).map(r => r.id)
  const leadIds    = ((leads ?? [])    as { id: string }[]).map(r => r.id)
  if (contactIds.length === 0 && leadIds.length === 0) return []

  const baseQuery = () => supabase
    .from('campaign_assignments')
    .select('id, campaign_type, campaign_sequence_id, assignment_status, created_at')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  const [contactScoped, leadScoped] = await Promise.all([
    contactIds.length > 0 ? baseQuery().in('contact_id', contactIds) : Promise.resolve({ data: [], error: null }),
    leadIds.length > 0    ? baseQuery().in('lead_id', leadIds)       : Promise.resolve({ data: [], error: null }),
  ])

  if (contactScoped.error) throw new Error('listAssignmentsForCompany contacts: ' + contactScoped.error.message)
  if (leadScoped.error) throw new Error('listAssignmentsForCompany leads: ' + leadScoped.error.message)

  type AssignmentRow = {
    id: string
    campaign_type: string
    campaign_sequence_id: string | null
    assignment_status: string
    created_at: string
  }

  // Union + de-dupe (an assignment could match both paths)
  const byId = new Map<string, AssignmentRow>()
  for (const row of [...(contactScoped.data ?? []), ...(leadScoped.data ?? [])] as AssignmentRow[]) {
    byId.set(row.id, row)
  }
  const assignments = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (assignments.length === 0) return []

  // Resolve sequence names
  const sequenceIds = [...new Set(assignments.map(a => a.campaign_sequence_id).filter((id): id is string => Boolean(id)))]
  const sequenceNameById = new Map<string, string>()
  if (sequenceIds.length > 0) {
    const { data: sequences } = await supabase
      .from('campaign_sequences')
      .select('id, name')
      .in('id', sequenceIds)
    for (const row of (sequences ?? []) as { id: string; name: string }[]) {
      sequenceNameById.set(row.id, row.name)
    }
  }

  // Emails sent per assignment: drafts linked to the assignment, then
  // dispatched email_sends rows for those drafts, grouped back in memory.
  const assignmentIds = assignments.map(a => a.id)
  const { data: drafts } = await supabase
    .from('email_drafts')
    .select('id, campaign_assignment_id')
    .in('campaign_assignment_id', assignmentIds)

  const draftRows = (drafts ?? []) as { id: string; campaign_assignment_id: string }[]
  const assignmentIdByDraftId = new Map(draftRows.map(d => [d.id, d.campaign_assignment_id]))

  const sentCountByAssignmentId = new Map<string, number>()
  if (draftRows.length > 0) {
    const { data: sends } = await supabase
      .from('email_sends')
      .select('draft_id')
      .in('draft_id', draftRows.map(d => d.id))
      .in('status', DISPATCHED_SEND_STATUSES)

    for (const row of (sends ?? []) as { draft_id: string | null }[]) {
      const assignmentId = row.draft_id ? assignmentIdByDraftId.get(row.draft_id) : undefined
      if (assignmentId) {
        sentCountByAssignmentId.set(assignmentId, (sentCountByAssignmentId.get(assignmentId) ?? 0) + 1)
      }
    }
  }

  return assignments.map(a => ({
    id:                a.id,
    campaign_type:     a.campaign_type,
    sequence_name:     a.campaign_sequence_id ? (sequenceNameById.get(a.campaign_sequence_id) ?? '—') : '—',
    assignment_status: a.assignment_status,
    created_at:        a.created_at,
    emails_sent:       sentCountByAssignmentId.get(a.id) ?? 0,
  }))
}

// MCM v2 Slice V1 — sequence usage probes (drive edit/delete locking)

export async function countActiveAssignmentsForSequence(
  sequenceId:  string,
  tenantId:    string,
  workspaceId: string,
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('campaign_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('campaign_sequence_id', sequenceId)
    .in('assignment_status', ['proposed', 'assigned'])

  if (error) throw new Error('countActiveAssignmentsForSequence: ' + error.message)
  return count ?? 0
}

export async function countActiveAssignmentsForSequences(
  sequenceIds: string[],
  tenantId:    string,
  workspaceId: string,
): Promise<number> {
  if (sequenceIds.length === 0) return 0
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('campaign_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('campaign_sequence_id', sequenceIds)
    .in('assignment_status', ['proposed', 'assigned'])

  if (error) throw new Error('countActiveAssignmentsForSequences: ' + error.message)
  return count ?? 0
}

// One workspace-wide fetch grouped per sequence — used by the sequence list page.
export async function getAssignmentCountsBySequence(
  tenantId:    string,
  workspaceId: string,
): Promise<Map<string, { active: number; total: number }>> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('campaign_sequence_id, assignment_status')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .not('campaign_sequence_id', 'is', null)

  if (error) throw new Error('getAssignmentCountsBySequence: ' + error.message)

  const counts = new Map<string, { active: number; total: number }>()
  for (const row of (data ?? []) as { campaign_sequence_id: string; assignment_status: string }[]) {
    const entry = counts.get(row.campaign_sequence_id) ?? { active: 0, total: 0 }
    entry.total += 1
    if (row.assignment_status === 'proposed' || row.assignment_status === 'assigned') {
      entry.active += 1
    }
    counts.set(row.campaign_sequence_id, entry)
  }
  return counts
}
