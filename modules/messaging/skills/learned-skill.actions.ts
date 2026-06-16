'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { upsertLearnedSkill, retireLearnedSkill, type LearnedSkillStatus } from '@/modules/messaging/skills/learned-skill.repo'
import { buildCopywritingSkillDefinition } from '@/modules/messaging/copywriting/copywriting-skill.resolver'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const PROFILE_PATH = '/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]'

export interface UpsertLearnedCopywritingSkillInput {
  slug:              string
  version?:          number
  category:          string
  toneRules:         string
  messagingRules:    string
  requiredElements:  string[]
  forbiddenElements: string[]
  ctaGuidance:       string
  complianceNotes:   string
  examples:          string[]
  antiPatterns:      string[]
  status?:           LearnedSkillStatus
}

// Authors / edits a per-tenant learned copywriting skill. Gated
// messaging.manage_templates. Writes the definition in the exact shape
// resolveCopywritingSkill's parseDefinition reads (via buildCopywritingSkillDefinition).
export async function upsertLearnedCopywritingSkillAction(
  input: UpsertLearnedCopywritingSkillInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.manage_templates')

    const slug = input.slug?.trim()
    if (!slug) return { success: false, error: 'invalid_input: slug is required' }

    const row = await upsertLearnedSkill({
      tenantId:        ctx.tenantId,
      family:          'copywriting',
      slug,
      version:         input.version ?? 1,
      category:        input.category,
      definition:      buildCopywritingSkillDefinition(input),
      status:          input.status ?? 'active',
      source:          'human',
      createdByUserId: ctx.userId === 'system' ? null : ctx.userId,
    })

    revalidatePath(PROFILE_PATH, 'page')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Retires a learned skill (status → retired). Gated messaging.manage_templates.
export async function retireLearnedSkillAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.manage_templates')

    if (!id) return { success: false, error: 'invalid_input: id is required' }

    await retireLearnedSkill(id)

    revalidatePath(PROFILE_PATH, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
