// MCM v2 — Approval Gate agent starter skills (Class B governance). Grounded in
// the agent's responsibility: hold high-risk actions for human approval.
// Governed, not auto-learned. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'approval_required_conditions',
    skillVersion: 1,
    category:     'policy',
    name:         'Approval required conditions',
    guidance:     'Define the conditions that force human approval before an action proceeds: high risk tier, production side effect, or an irreversible operation. When any holds, the action waits.',
    requiredElements: [
      'A list of conditions that require approval',
      'A hold outcome when any condition holds',
    ],
    forbiddenElements: [
      'Letting a high-risk action proceed without approval',
    ],
    examples: [
      'An irreversible production action is held for human approval.',
    ],
    antiPatterns: [
      'Auto-approving a high-risk action to save a step',
      'Holding low-risk read-only work needlessly',
    ],
  },
  {
    skillSlug:    'auto_pass_conditions',
    skillVersion: 1,
    category:     'policy',
    name:         'Auto-pass conditions',
    guidance:     'Define the narrow conditions under which an action may proceed without human approval: low risk, reversible, and no production side effect. Auto-pass is the exception, not the default.',
    requiredElements: [
      'Explicit, narrow auto-pass conditions',
    ],
    forbiddenElements: [
      'A broad auto-pass that swallows risky actions',
    ],
    examples: [
      'A reversible, low-risk, read-only task may auto-pass.',
    ],
    antiPatterns: [
      'Defaulting to auto-pass when uncertain',
      'Widening auto-pass to avoid review queues',
    ],
  },
  {
    skillSlug:    'escalation_rules',
    skillVersion: 1,
    category:     'policy',
    name:         'Escalation rules',
    guidance:     'Define how a held action escalates: who reviews, what timeout applies, and what happens on no response. A held action must not stall forever with no path.',
    requiredElements: [
      'A reviewer target and a timeout',
      'A defined no-response outcome',
    ],
    forbiddenElements: [
      'A hold with no reviewer or timeout',
    ],
    examples: [
      'A held action routes to a named reviewer and expires safely on timeout.',
    ],
    antiPatterns: [
      'Holding indefinitely with no escalation path',
      'Auto-approving on timeout',
    ],
  },
]

export function getAllApprovalGateSkills(): AgentSkillDefinition[] {
  return SKILLS
}
