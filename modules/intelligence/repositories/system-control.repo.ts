import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/types/database'
import type { SystemControlKey } from '@/modules/intelligence/types.agent'

type SystemControlRow = Database['public']['Tables']['system_controls']['Row']

// ---- Read ----

export async function getSystemControl(
  key: SystemControlKey | string,
  tenantId?: string | null
): Promise<SystemControlRow | null> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('system_controls')
    .select('*')
    .eq('key', key)

  // Prefer tenant-level override; fall back to platform default (tenant_id IS NULL)
  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  } else {
    query = query.is('tenant_id', null)
  }

  const { data } = await query.maybeSingle()
  return data ?? null
}

// Resolves tenant override first, then platform default.
export async function resolveSystemControl(
  key: SystemControlKey | string,
  tenantId: string
): Promise<SystemControlRow | null> {
  const supabase = createSupabaseServiceClient()

  // Try tenant-level first
  const { data: tenantRow } = await supabase
    .from('system_controls')
    .select('*')
    .eq('key', key)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (tenantRow) return tenantRow

  // Fall back to platform default
  const { data: platformRow } = await supabase
    .from('system_controls')
    .select('*')
    .eq('key', key)
    .is('tenant_id', null)
    .maybeSingle()

  return platformRow ?? null
}

// Returns the parsed boolean value of a boolean control.
// Missing or non-boolean controls default to defaultValue (default: false).
export async function getBooleanControl(
  key: SystemControlKey | string,
  tenantId: string,
  defaultValue = false
): Promise<boolean> {
  const row = await resolveSystemControl(key, tenantId)
  if (!row || !row.is_enabled) return defaultValue
  if (typeof row.value === 'boolean') return row.value
  return defaultValue
}

export async function getControlValue(
  key: SystemControlKey | string,
  tenantId: string
): Promise<Json | null> {
  const row = await resolveSystemControl(key, tenantId)
  return row?.value ?? null
}

export async function listControls(
  tenantId?: string | null
): Promise<SystemControlRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('system_controls')
    .select('*')
    .order('key', { ascending: true })

  if (tenantId !== undefined) {
    query = tenantId === null
      ? query.is('tenant_id', null)
      : query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query
  if (error) throw new Error(`listControls: ${error.message}`)
  return data ?? []
}

// ---- Write ----

export async function setControlValue(
  key: SystemControlKey | string,
  value: Json,
  tenantId: string | null,
  updatedBy?: string | null
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { error } = await supabase
    .from('system_controls')
    .update({
      value,
      updated_by: updatedBy ?? null,
    })
    .eq('key', key)
    .is('tenant_id', tenantId)

  if (error) throw new Error(`setControlValue: ${error.message}`)
}

export async function setIsEnabled(
  key: SystemControlKey | string,
  isEnabled: boolean,
  tenantId: string | null,
  updatedBy?: string | null
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('system_controls')
    .update({ is_enabled: isEnabled, updated_by: updatedBy ?? null })
    .eq('key', key)
    .is('tenant_id', tenantId)

  if (error) throw new Error(`setIsEnabled: ${error.message}`)
}
