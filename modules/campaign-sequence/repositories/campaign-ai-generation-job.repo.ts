import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type JobRow    = Database['public']['Tables']['campaign_ai_generation_jobs']['Row']
type JobInsert = Database['public']['Tables']['campaign_ai_generation_jobs']['Insert']
type JobUpdate = Database['public']['Tables']['campaign_ai_generation_jobs']['Update']

export interface AiSequenceJobInput {
  name:             string
  campaignTypeId:   string
  touches:          number
  brief:            string
  senderIdentityId: string | null
}

export interface AiSequenceJobResult {
  sequenceId: string
  assetIds:   string[]
}

export async function insertJob(data: {
  tenantId:     string
  workspaceId:  string
  input:        AiSequenceJobInput
  touchesTotal: number
}): Promise<JobRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_ai_generation_jobs')
    .insert({
      tenant_id:     data.tenantId,
      workspace_id:  data.workspaceId,
      status:        'pending',
      input:         data.input as unknown as JobInsert['input'],
      touches_total: data.touchesTotal,
    } as JobInsert)
    .select('*')
    .single()

  if (error) throw new Error(`insertJob: ${error.message}`)
  return row
}

export async function getJobById(id: string, tenantId: string): Promise<JobRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_ai_generation_jobs')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) return null
  return data
}

export async function updateJobStatus(
  id: string,
  patch: {
    status?:      'pending' | 'running' | 'succeeded' | 'failed'
    result?:      AiSequenceJobResult | null
    error?:       string | null
    touchesDone?: number
  },
): Promise<JobRow> {
  const supabase = createSupabaseServiceClient()
  const update: JobUpdate = {}
  if (patch.status !== undefined)      update.status       = patch.status
  if (patch.result !== undefined)      update.result       = patch.result as unknown as JobUpdate['result']
  if (patch.error !== undefined)       update.error        = patch.error
  if (patch.touchesDone !== undefined) update.touches_done = patch.touchesDone

  const { data, error } = await supabase
    .from('campaign_ai_generation_jobs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(`updateJobStatus: ${error.message}`)
  return data
}
