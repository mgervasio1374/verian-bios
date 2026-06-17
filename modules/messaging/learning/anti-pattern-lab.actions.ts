'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { getLearnedSkill, upsertLearnedSkill } from '@/modules/messaging/skills/learned-skill.repo'
import { getSkillDefinition } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'
import {
  buildCopywritingSkillDefinition,
  type CopywritingSkillDefinitionInput,
} from '@/modules/messaging/copywriting/copywriting-skill.resolver'
import { extractAntiPatterns, type ExtractedPattern } from '@/modules/messaging/learning/anti-pattern-extraction.service'
import { insertAntiPatternSources } from '@/modules/messaging/learning/anti-pattern-source.repo'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const COPYWRITING_FAMILY = 'copywriting'
const PROFILE_PATH = '/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]'

async function labEnabled(tenantId: string): Promise<boolean> {
  return getBooleanControl(SystemControlKey.ANTI_PATTERN_LAB_ENABLED, tenantId, false).catch(() => false)
}

export async function runAntiPatternExtractionAction(
  targetSlug: string,
  samples: string[],
): Promise<ActionResult<{ patterns: ExtractedPattern[] }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.manage_templates')

    if (!(await labEnabled(ctx.tenantId))) {
      return { success: false, error: 'Anti-Pattern Lab is disabled.' }
    }

    const result = await extractAntiPatterns({ tenantId: ctx.tenantId, targetSlug, samples })
    if ('error' in result) return { success: false, error: result.error }
    return { success: true, data: { patterns: result.patterns } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Reads either the tenant's v1 learned definition or the static seed, normalized
// to the builder's input field set (defensive — unknown fields default empty).
function toDefinitionInput(def: Record<string, unknown>, categoryFallback: string): CopywritingSkillDefinitionInput {
  const str = (k: string) => (typeof def[k] === 'string' ? (def[k] as string) : '')
  const arr = (k: string) => (Array.isArray(def[k]) ? (def[k] as unknown[]).filter(x => typeof x === 'string') as string[] : [])
  return {
    category:          typeof def.category === 'string' ? (def.category as string) : categoryFallback,
    toneRules:         str('toneRules'),
    messagingRules:    str('messagingRules'),
    requiredElements:  arr('requiredElements'),
    forbiddenElements: arr('forbiddenElements'),
    ctaGuidance:       str('ctaGuidance'),
    complianceNotes:   str('complianceNotes'),
    examples:          arr('examples'),
    antiPatterns:      arr('antiPatterns'),
  }
}

export interface ApprovedAntiPattern {
  antiPatternRule: string
  patternName?:    string
  sourceExcerpt?:  string
  rationale?:      string
  confidence?:     string
}

export async function applyAntiPatternsAction(
  targetSlug: string,
  approved: ApprovedAntiPattern[],
): Promise<ActionResult<{ appliedCount: number; totalAntiPatterns: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'messaging.manage_templates')

    if (!(await labEnabled(ctx.tenantId))) {
      return { success: false, error: 'Anti-Pattern Lab is disabled.' }
    }

    // Keep the first occurrence of each non-empty rule, preserving its provenance.
    const byRule = new Map<string, ApprovedAntiPattern>()
    for (const p of approved) {
      const rule = p.antiPatternRule?.trim()
      if (rule && !byRule.has(rule)) byRule.set(rule, { ...p, antiPatternRule: rule })
    }
    const rules = [...byRule.keys()]
    if (rules.length === 0) return { success: false, error: 'Approve at least one pattern to apply.' }

    // Resolve the CURRENT v1 definition: tenant learned row if present, else seed.
    // (The rewrite loop resolves learned skills at v1, so we must write v1.)
    const learned = await getLearnedSkill(ctx.tenantId, COPYWRITING_FAMILY, targetSlug, 1)
    let input: CopywritingSkillDefinitionInput
    if (learned) {
      input = toDefinitionInput(learned.definition, learned.category ?? 'context')
    } else {
      const seed = getSkillDefinition(targetSlug, 1)
      if (!seed) return { success: false, error: `Unknown copywriting skill: ${targetSlug}` }
      input = toDefinitionInput(seed as unknown as Record<string, unknown>, seed.category)
    }

    // APPEND (dedup) — never overwrite the other fields. Track the NEWLY-applied
    // rules (not duplicates) so we record lineage only for genuinely new patterns.
    const existing = new Set(input.antiPatterns)
    const newlyApplied: string[] = []
    for (const rule of rules) {
      if (!existing.has(rule)) { existing.add(rule); newlyApplied.push(rule) }
    }
    const merged: CopywritingSkillDefinitionInput = { ...input, antiPatterns: [...existing] }

    await upsertLearnedSkill({
      tenantId:        ctx.tenantId,
      family:          COPYWRITING_FAMILY,
      slug:            targetSlug,
      version:         1,
      category:        merged.category,
      definition:      buildCopywritingSkillDefinition(merged),
      status:          'active',
      source:          'learned',
      createdByUserId: ctx.userId === 'system' ? null : ctx.userId,
    })

    // Durable provenance: one lineage row per newly-applied rule. Best-effort —
    // a lineage failure must never fail the apply.
    if (newlyApplied.length > 0) {
      try {
        await insertAntiPatternSources(newlyApplied.map(rule => {
          const p = byRule.get(rule)!
          return {
            tenantId:        ctx.tenantId,
            workspaceId:     ctx.workspaceId,
            family:          COPYWRITING_FAMILY,
            slug:            targetSlug,
            version:         1,
            antiPatternRule: rule,
            patternName:     p.patternName ?? null,
            sourceExcerpt:   p.sourceExcerpt ?? null,
            rationale:       p.rationale ?? null,
            confidence:      p.confidence ?? null,
            appliedByUserId: ctx.userId === 'system' ? null : ctx.userId,
          }
        }))
      } catch { /* swallow — lineage is advisory; the skill update already succeeded */ }
    }

    revalidatePath(PROFILE_PATH, 'page')
    return { success: true, data: { appliedCount: newlyApplied.length, totalAntiPatterns: merged.antiPatterns.length } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
