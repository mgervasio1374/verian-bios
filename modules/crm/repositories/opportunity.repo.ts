import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type OpportunityRow    = Database['public']['Tables']['opportunities']['Row']
type OpportunityInsert = Database['public']['Tables']['opportunities']['Insert']

export async function getOpportunity(id: string, tenantId: string): Promise<OpportunityRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
}

// The opportunity linked to a lead, if any — drives the convert/already-converted
// guard and the lead-detail bidirectional link.
export async function getOpportunityForLead(
  leadId: string,
  tenantId: string,
): Promise<OpportunityRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data
}

export async function createOpportunity(data: OpportunityInsert): Promise<OpportunityRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('opportunities')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(`createOpportunity: ${error.message}`)
  return row
}
