import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { AGENT_ROSTER } from '@/modules/intelligence/agent-roster'
import {
  workflowsForAgent, WORKFLOWS, AGENT_RESPONSIBILITY, AGENT_SKILL_FAMILY,
} from '@/modules/intelligence/agent-workflows'
import { VERIAN_BRIDGE_AGENT_REGISTRY } from '@/modules/verian-agent-bridge/agent-registry'
import { getAllSkillDefinitions } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'
import { AGENT_SEED_SKILLS } from '@/modules/intelligence/skills/agent-seed-skills'
import { listLearnedSkills } from '@/modules/messaging/skills/learned-skill.repo'
import { AgentCatalog } from './AgentCatalog'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

const REGISTRY = VERIAN_BRIDGE_AGENT_REGISTRY as Record<string, { description?: string } | undefined>

export default async function AgentMapPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  // Skill counts: the copywriting seed + every generic seed family + this tenant's
  // learned rows by family. Best-effort — never break the map.
  const seedCountByFamily: Record<string, number> = { copywriting: getAllSkillDefinitions().length }
  for (const [fam, provider] of Object.entries(AGENT_SEED_SKILLS)) {
    seedCountByFamily[fam] = provider().length
  }
  const learnedByFamily: Record<string, number> = {}
  try {
    const learned = await listLearnedSkills(ctx.tenantId)
    for (const row of learned) {
      learnedByFamily[row.skill_family] = (learnedByFamily[row.skill_family] ?? 0) + 1
    }
  } catch { /* fail-open: no learned rows */ }

  const agents = AGENT_ROSTER.map(row => {
    const family = AGENT_SKILL_FAMILY[row.key]
    const skillCount = family
      ? (seedCountByFamily[family] ?? 0) + (learnedByFamily[family] ?? 0)
      : 0
    return {
      key:            row.key,
      label:          row.label,
      category:       row.category,
      implState:      row.implState,
      responsibility: REGISTRY[row.key]?.description ?? AGENT_RESPONSIBILITY[row.key] ?? row.label,
      workflows:      workflowsForAgent(row.key),
      skillCount,
      skillFamily:    family ?? null,
    }
  })

  return (
    <AgentCatalog
      agents={agents}
      workspaceSlug={workspaceSlug}
      workflows={WORKFLOWS.map(w => ({ key: w.key, label: w.label, color: w.color, crossCutting: Boolean(w.crossCutting) }))}
    />
  )
}
