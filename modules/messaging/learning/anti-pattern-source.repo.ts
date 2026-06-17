import { createSupabaseServiceClient } from '@/lib/supabase/service'

// anti_pattern_sources is not in the generated Database types yet (migration
// 20240066); domain types are declared here, matching the untyped-service-client
// convention used by learned-skill.repo.ts.

export interface AntiPatternSourceRow {
  id:                 string
  tenant_id:          string
  workspace_id:       string | null
  skill_family:       string
  skill_slug:         string
  skill_version:      number
  anti_pattern_rule:  string
  pattern_name:       string | null
  source_excerpt:     string | null
  rationale:          string | null
  confidence:         string | null
  applied_by_user_id: string | null
  created_at:         string
}

export interface AntiPatternSourceInsert {
  tenantId:        string
  workspaceId?:    string | null
  family:          string
  slug:            string
  version?:        number
  antiPatternRule: string
  patternName?:    string | null
  sourceExcerpt?:  string | null
  rationale?:      string | null
  confidence?:     string | null
  appliedByUserId?: string | null
}

// Bulk insert of applied-anti-pattern provenance rows. No-op on empty input.
export async function insertAntiPatternSources(rows: AntiPatternSourceInsert[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('anti_pattern_sources')
    .insert(rows.map(r => ({
      tenant_id:          r.tenantId,
      workspace_id:       r.workspaceId ?? null,
      skill_family:       r.family,
      skill_slug:         r.slug,
      skill_version:      r.version ?? 1,
      anti_pattern_rule:  r.antiPatternRule,
      pattern_name:       r.patternName ?? null,
      source_excerpt:     r.sourceExcerpt ?? null,
      rationale:          r.rationale ?? null,
      confidence:         r.confidence ?? null,
      applied_by_user_id: r.appliedByUserId ?? null,
    })))

  if (error) throw new Error(`insertAntiPatternSources: ${error.message}`)
}

// Lists applied anti-pattern provenance for a tenant, newest-first.
export async function listAntiPatternSources(
  tenantId: string,
  opts: { family?: string; slug?: string } = {},
): Promise<AntiPatternSourceRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('anti_pattern_sources')
    .select('*')
    .eq('tenant_id', tenantId)

  if (opts.family) query = query.eq('skill_family', opts.family)
  if (opts.slug)   query = query.eq('skill_slug', opts.slug)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(`listAntiPatternSources: ${error.message}`)
  return (data ?? []) as AntiPatternSourceRow[]
}
