import { createSupabaseServiceClient } from '@/lib/supabase/service'

// segments / company_segments are not in the generated Database types yet
// (migration 20240048); domain types are declared here, matching the
// untyped-service-client convention.

export interface SegmentRow {
  id:                 string
  tenant_id:          string
  workspace_id:       string
  name:               string
  description:        string | null
  created_by_user_id: string | null
  created_at:         string
  updated_at:         string
}

export interface SegmentWithCount extends SegmentRow {
  member_count: number
}

export interface SegmentMember {
  company_id: string
  name:       string
}

export interface SegmentInsert {
  tenant_id:           string
  workspace_id:        string
  name:                string
  description?:        string | null
  created_by_user_id?: string | null
}

export interface SegmentUpdate {
  name?:        string
  description?: string | null
}

export async function insertSegment(data: SegmentInsert): Promise<SegmentRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('segments')
    .insert(data)
    .select('*')
    .single()

  if (error) throw new Error(`insertSegment: ${error.message}`)
  return row
}

export async function listSegmentsForWorkspace(
  tenantId: string,
  workspaceId: string,
): Promise<SegmentWithCount[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listSegmentsForWorkspace: ${error.message}`)
  const segments: SegmentRow[] = data ?? []
  if (segments.length === 0) return []

  // One grouped count query over the join table for all listed segments.
  const { data: joinRows, error: countError } = await supabase
    .from('company_segments')
    .select('segment_id')
    .eq('tenant_id', tenantId)
    .in('segment_id', segments.map(s => s.id))

  if (countError) throw new Error(`listSegmentsForWorkspace counts: ${countError.message}`)

  const counts = new Map<string, number>()
  for (const row of joinRows ?? []) {
    counts.set(row.segment_id, (counts.get(row.segment_id) ?? 0) + 1)
  }

  return segments.map(s => ({ ...s, member_count: counts.get(s.id) ?? 0 }))
}

export async function getSegmentById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<SegmentRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) return null
  return data
}

export async function updateSegment(
  id: string,
  tenantId: string,
  workspaceId: string,
  data: SegmentUpdate,
): Promise<SegmentRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('segments')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw new Error(`updateSegment: ${error.message}`)
  return row
}

// Hard delete — company_segments join rows cascade via FK.
export async function deleteSegment(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('segments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`deleteSegment: ${error.message}`)
}

// Idempotent — upsert on the (company_id, segment_id) composite PK so
// re-adding an existing member is a no-op rather than an error.
export async function addCompanyToSegment(
  companyId: string,
  segmentId: string,
  tenantId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('company_segments')
    .upsert(
      { company_id: companyId, segment_id: segmentId, tenant_id: tenantId },
      { onConflict: 'company_id,segment_id', ignoreDuplicates: true },
    )

  if (error) throw new Error(`addCompanyToSegment: ${error.message}`)
}

export async function removeCompanyFromSegment(
  companyId: string,
  segmentId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('company_segments')
    .delete()
    .eq('company_id', companyId)
    .eq('segment_id', segmentId)

  if (error) throw new Error(`removeCompanyFromSegment: ${error.message}`)
}

export async function listSegmentMembers(
  segmentId: string,
  tenantId: string,
): Promise<SegmentMember[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('company_segments')
    .select('company_id, companies(name)')
    .eq('segment_id', segmentId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`listSegmentMembers: ${error.message}`)

  // Embedded one-to-one joins can be inferred as object or array depending on
  // detected relationship cardinality — normalize both shapes.
  type JoinedRow = { company_id: string; companies: { name: string } | { name: string }[] | null }
  return ((data ?? []) as JoinedRow[])
    .map(row => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
      return {
        company_id: row.company_id,
        name:       company?.name ?? '(unknown company)',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Search companies in the workspace that are not yet members of the segment
// (for the add-member picker).
export async function searchCompaniesNotInSegment(
  segmentId: string,
  tenantId: string,
  workspaceId: string,
  search: string,
): Promise<SegmentMember[]> {
  const supabase = createSupabaseServiceClient()

  const { data: memberRows, error: memberError } = await supabase
    .from('company_segments')
    .select('company_id')
    .eq('segment_id', segmentId)
    .eq('tenant_id', tenantId)

  if (memberError) throw new Error(`searchCompaniesNotInSegment members: ${memberError.message}`)
  const memberIds: string[] = (memberRows ?? []).map(
    (r: { company_id: string }) => r.company_id,
  )

  let query = supabase
    .from('companies')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(20)

  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
  if (memberIds.length > 0) query = query.not('id', 'in', `(${memberIds.join(',')})`)

  const { data, error } = await query
  if (error) throw new Error(`searchCompaniesNotInSegment: ${error.message}`)

  return (data ?? []).map((row: { id: string; name: string }) => ({
    company_id: row.id,
    name:       row.name,
  }))
}
