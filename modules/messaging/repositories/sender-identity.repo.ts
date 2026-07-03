import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Sender-identity management (settings surface). The send-path readers
// (getDefaultSenderIdentity / getSenderIdentityById / listSenderIdentities)
// live in email-draft.repo and are deliberately untouched — this repo is the
// write/admin surface. Identities are tenant-level (workspace_id null).

export interface SenderIdentityRow {
  id: string
  name: string
  email: string
  reply_to: string | null
  signature: string | null
  is_verified: boolean
  is_default: boolean
  status: string
  created_at: string
}

const LIST_COLUMNS = 'id, name, email, reply_to, signature, is_verified, is_default, status, created_at'

export async function listAllSenderIdentities(tenantId: string): Promise<SenderIdentityRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('sender_identities')
    .select(LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw new Error(`listAllSenderIdentities: ${error.message}`)
  return (data ?? []) as SenderIdentityRow[]
}

export async function findSenderIdentityByEmail(
  tenantId: string,
  email: string,
): Promise<SenderIdentityRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('sender_identities')
    .select(LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .ilike('email', email)
    .maybeSingle()
  if (error) throw new Error(`findSenderIdentityByEmail: ${error.message}`)
  return (data as SenderIdentityRow | null) ?? null
}

export async function getSenderIdentityRow(
  tenantId: string,
  identityId: string,
): Promise<SenderIdentityRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('sender_identities')
    .select(LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`getSenderIdentityRow: ${error.message}`)
  return (data as SenderIdentityRow | null) ?? null
}

export async function insertSenderIdentity(input: {
  tenant_id: string
  name: string
  email: string
  reply_to: string | null
  signature: string | null
  created_by: string | null
}): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('sender_identities')
    .insert({
      tenant_id: input.tenant_id,
      name: input.name,
      email: input.email,
      reply_to: input.reply_to,
      signature: input.signature,
      // status 'active' so the send path can resolve it the moment it is
      // verified; is_verified=false keeps it out of use until the operator
      // confirms the sending domain is authenticated.
      status: 'active',
      is_verified: false,
      is_default: false,
      created_by: input.created_by,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertSenderIdentity: ${error?.message ?? 'no row returned'}`)
  return { id: data.id as string }
}

export async function updateSenderIdentity(
  tenantId: string,
  identityId: string,
  patch: { name?: string; reply_to?: string | null; signature?: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('sender_identities')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
  if (error) throw new Error(`updateSenderIdentity: ${error.message}`)
}

export async function setSenderIdentityVerified(
  tenantId: string,
  identityId: string,
  verified: boolean,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('sender_identities')
    .update({ is_verified: verified, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
  if (error) throw new Error(`setSenderIdentityVerified: ${error.message}`)
}

// Exactly one default per tenant: clear all, then set the target.
export async function setDefaultSenderIdentity(
  tenantId: string,
  identityId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error: clearError } = await supabase
    .from('sender_identities')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
  if (clearError) throw new Error(`setDefaultSenderIdentity(clear): ${clearError.message}`)

  const { error: setError } = await supabase
    .from('sender_identities')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
  if (setError) throw new Error(`setDefaultSenderIdentity(set): ${setError.message}`)
}
