import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type PromptConfig = Database['public']['Tables']['prompt_configs']['Row'] & {
  prompt_versions: Database['public']['Tables']['prompt_versions']['Row'] | null
}

type ScoringConfig = Database['public']['Tables']['scoring_configs']['Row']
type WorkflowConfig = Database['public']['Tables']['workflow_configs']['Row']

/**
 * Resolve a prompt config using inheritance chain:
 * workspace override → tenant override → platform default (tenant_id IS NULL)
 */
export async function resolvePromptConfig(
  slug: string,
  tenantId: string,
  workspaceId: string
): Promise<PromptConfig | null> {
  const supabase = createSupabaseServiceClient()

  // Try workspace-level
  const { data: wsConfig } = await supabase
    .from('prompt_configs')
    .select('*, prompt_versions!fk_prompt_configs_active_version(*)')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()

  if (wsConfig) return wsConfig as PromptConfig

  // Try tenant-level (no workspace)
  const { data: tenantConfig } = await supabase
    .from('prompt_configs')
    .select('*, prompt_versions!fk_prompt_configs_active_version(*)')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .is('workspace_id', null)
    .eq('is_active', true)
    .single()

  if (tenantConfig) return tenantConfig as PromptConfig

  // Fall back to platform default (tenant_id IS NULL)
  const { data: platformConfig } = await supabase
    .from('prompt_configs')
    .select('*, prompt_versions!fk_prompt_configs_active_version(*)')
    .eq('slug', slug)
    .is('tenant_id', null)
    .eq('is_active', true)
    .single()

  return (platformConfig as PromptConfig) ?? null
}

/**
 * Resolve a scoring config using inheritance chain.
 */
export async function resolveScoringConfig(
  slug: string,
  tenantId: string,
  workspaceId: string
): Promise<ScoringConfig | null> {
  const supabase = createSupabaseServiceClient()

  const { data: wsConfig } = await supabase
    .from('scoring_configs')
    .select('*')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()

  if (wsConfig) return wsConfig

  const { data: tenantConfig } = await supabase
    .from('scoring_configs')
    .select('*')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .is('workspace_id', null)
    .eq('is_active', true)
    .single()

  return tenantConfig ?? null
}

/**
 * Resolve a workflow config using inheritance chain.
 */
export async function resolveWorkflowConfig(
  slug: string,
  tenantId: string,
  workspaceId: string
): Promise<WorkflowConfig | null> {
  const supabase = createSupabaseServiceClient()

  const { data: wsConfig } = await supabase
    .from('workflow_configs')
    .select('*')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()

  if (wsConfig) return wsConfig

  const { data: tenantConfig } = await supabase
    .from('workflow_configs')
    .select('*')
    .eq('slug', slug)
    .eq('tenant_id', tenantId)
    .is('workspace_id', null)
    .eq('is_active', true)
    .single()

  return tenantConfig ?? null
}

/**
 * Get active pipeline stages for a tenant, ordered by position.
 */
export async function getPipelineStages(
  tenantId: string,
  pipelineType: 'lead' | 'opportunity'
) {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('pipeline_stage_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('pipeline_type', pipelineType)
    .order('position', { ascending: true })

  if (error) throw new Error(`getPipelineStages: ${error.message}`)
  return data ?? []
}

/**
 * Interpolate a prompt template with context variables.
 * Uses {{variable_name}} syntax.
 */
export function interpolatePrompt(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined && context[key] !== null
      ? String(context[key])
      : `[${key}]`
  })
}
