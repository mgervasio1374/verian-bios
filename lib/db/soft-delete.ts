import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { RequestContext } from '@/types/context'

type SoftDeletableTable =
  | 'companies'
  | 'contacts'
  | 'leads'
  | 'accounts'
  | 'opportunities'
  | 'notes'
  | 'tasks'
  | 'artifacts'
  | 'artifact_versions'
  | 'email_drafts'
  | 'email_templates'
  | 'sender_identities'

export async function softDeleteRecord(
  table: SoftDeletableTable,
  id: string,
  ctx: RequestContext
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: ctx.userId === 'system' ? null : ctx.userId,
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)

  if (error) {
    throw new Error(`Failed to soft-delete ${table}/${id}: ${error.message}`)
  }
}
