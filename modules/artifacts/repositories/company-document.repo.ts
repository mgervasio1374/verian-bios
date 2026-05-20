import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ArtifactRow = Database['public']['Tables']['artifacts']['Row']

export type { ArtifactRow }

// Looser insert type: allows Record<string, unknown> for metadata/tags rather than
// the strict Json union from the generated types. The service client is untyped (any)
// so this works safely at runtime — consistent with the rest of the repo layer.
type ArtifactInsertLoose = Omit<
  Database['public']['Tables']['artifacts']['Insert'],
  'metadata' | 'tags'
> & {
  metadata?: Record<string, unknown>
  tags?: string[]
}

// ---- Read ----

export async function listCompanyDocuments(
  companyId: string,
  tenantId: string,
  opts: { limit?: number; artifactType?: string } = {}
): Promise<ArtifactRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)

  if (opts.artifactType) query = query.eq('artifact_type', opts.artifactType)

  const { data, error } = await query
  if (error) throw new Error(`listCompanyDocuments: ${error.message}`)
  return data ?? []
}

export async function getCompanyDocumentById(
  id: string,
  tenantId: string
): Promise<ArtifactRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('artifacts')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()
  return data ?? null
}

// ---- Write ----

export async function createCompanyDocument(
  input: ArtifactInsertLoose
): Promise<ArtifactRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('artifacts')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`createCompanyDocument: ${error.message}`)
  return data
}

// Sets company_id on an artifact that was created without one (e.g., legacy or
// system-generated artifacts that didn't initially know their company).
export async function linkArtifactToCompanyDocument(
  artifactId: string,
  companyId: string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('artifacts')
    .update({ company_id: companyId })
    .eq('id', artifactId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)

  if (error) throw new Error(`linkArtifactToCompanyDocument: ${error.message}`)
}

// Soft-archives a company document by setting status='archived'.
// Does not physically delete it or remove storage files.
export async function markCompanyDocumentArchived(
  id: string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('artifacts')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)

  if (error) throw new Error(`markCompanyDocumentArchived: ${error.message}`)
}

// ---- Signed URLs ----

// Generates a short-lived (1-hour) signed URL for a single artifact.
export async function getDocumentSignedUrl(
  storagePath: string,
  storageBucket: string
): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, 3600)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
