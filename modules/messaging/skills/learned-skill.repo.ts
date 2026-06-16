import { createSupabaseServiceClient } from '@/lib/supabase/service'

// learned_skills is the family-generic, per-tenant, versioned skill store
// (migration 20240063). Not in the generated Database types yet; domain types are
// declared here, matching the untyped-service-client convention used by
// copy-exemplar.repo.ts / segment.repo.ts. tenant_id = NULL is the global tier.

export type LearnedSkillStatus = 'active' | 'draft' | 'retired'
export type LearnedSkillSource = 'seed' | 'learned' | 'human'

export interface LearnedSkillRow {
  id:                 string
  tenant_id:          string | null   // NULL = global/default tier
  workspace_id:       string | null
  skill_family:       string
  skill_slug:         string
  skill_version:      number
  category:           string | null
  definition:         Record<string, unknown>
  status:             LearnedSkillStatus
  source:             LearnedSkillSource
  created_by_user_id: string | null
  created_at:         string
  updated_at:         string
}

export interface UpsertLearnedSkillInput {
  tenantId?:        string | null   // omit / null = global tier
  workspaceId?:     string | null
  family:           string
  slug:             string
  version?:         number
  category?:        string | null
  definition:       Record<string, unknown>
  status?:          LearnedSkillStatus
  source?:          LearnedSkillSource
  createdByUserId?: string | null
}

// Resolves a single row by its unique key (tenant, family, slug, version),
// regardless of status. Pass tenantId = null to read the global tier row.
export async function getLearnedSkill(
  tenantId: string | null,
  family:   string,
  slug:     string,
  version:  number,
): Promise<LearnedSkillRow | null> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('learned_skills')
    .select('*')
    .eq('skill_family', family)
    .eq('skill_slug', slug)
    .eq('skill_version', version)

  query = tenantId === null
    ? query.is('tenant_id', null)
    : query.eq('tenant_id', tenantId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`getLearnedSkill: ${error.message}`)
  return (data as LearnedSkillRow | null) ?? null
}

// Lists rows for a tenant, optionally filtered by family / status, newest first.
export async function listLearnedSkills(
  tenantId: string,
  opts: { family?: string; status?: LearnedSkillStatus } = {},
): Promise<LearnedSkillRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('learned_skills')
    .select('*')
    .eq('tenant_id', tenantId)

  if (opts.family) query = query.eq('skill_family', opts.family)
  if (opts.status) query = query.eq('status', opts.status)

  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) throw new Error(`listLearnedSkills: ${error.message}`)
  return (data ?? []) as LearnedSkillRow[]
}

// Insert-or-update on the unique key (tenant, family, slug, version). The unique
// index is a COALESCE expression index (not a constraint), so Postgres ON CONFLICT
// inference is not available — select-then-write instead.
export async function upsertLearnedSkill(input: UpsertLearnedSkillInput): Promise<LearnedSkillRow> {
  const supabase = createSupabaseServiceClient()
  const tenantId = input.tenantId ?? null
  const version  = input.version ?? 1

  const existing = await getLearnedSkill(tenantId, input.family, input.slug, version)

  if (existing) {
    const { data, error } = await supabase
      .from('learned_skills')
      .update({
        workspace_id:       input.workspaceId ?? existing.workspace_id,
        category:           input.category ?? null,
        definition:         input.definition,
        status:             input.status ?? existing.status,
        source:             input.source ?? existing.source,
        created_by_user_id: input.createdByUserId ?? existing.created_by_user_id,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error(`upsertLearnedSkill (update): ${error.message}`)
    return data as LearnedSkillRow
  }

  const { data, error } = await supabase
    .from('learned_skills')
    .insert({
      tenant_id:          tenantId,
      workspace_id:       input.workspaceId ?? null,
      skill_family:       input.family,
      skill_slug:         input.slug,
      skill_version:      version,
      category:           input.category ?? null,
      definition:         input.definition,
      status:             input.status ?? 'active',
      source:             input.source ?? 'human',
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`upsertLearnedSkill (insert): ${error.message}`)
  return data as LearnedSkillRow
}

// Retires a skill row (status → retired). Does not delete the row.
export async function retireLearnedSkill(id: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('learned_skills')
    .update({ status: 'retired' })
    .eq('id', id)
  if (error) throw new Error(`retireLearnedSkill: ${error.message}`)
}
