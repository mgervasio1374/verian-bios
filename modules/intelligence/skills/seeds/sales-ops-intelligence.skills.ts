// MCM v2 — Sales-Ops Intelligence agent starter skills. Documentary / skeletal:
// the agent has no consumer yet, so these seeds describe intended behavior to
// keep the glass box honest. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'pipeline_health_signals',
    skillVersion: 1,
    category:     'intelligence',
    name:         'Pipeline health signals',
    guidance:     'Describe the signals that indicate pipeline health: stage aging, conversion between stages, and stall rates. Skeletal: documents intended inputs, no live consumer yet.',
    requiredElements: [
      'A set of named pipeline-health signals',
    ],
    forbiddenElements: [
      'Reporting a health verdict with no underlying signal',
    ],
    examples: [
      'Rising stage-aging across open opportunities indicates a stall risk.',
    ],
    antiPatterns: [
      'Declaring the pipeline healthy with no metric behind it',
    ],
  },
  {
    skillSlug:    'anomaly_definitions',
    skillVersion: 1,
    category:     'intelligence',
    name:         'Anomaly definitions',
    guidance:     'Define what counts as an anomaly worth surfacing: a sudden drop in sends, a spike in failures, or a stage with zero movement. Skeletal until a consumer exists.',
    requiredElements: [
      'Clear thresholds for what is anomalous',
    ],
    forbiddenElements: [
      'Flagging normal variation as an anomaly',
    ],
    examples: [
      'A week with zero sends where prior weeks averaged many is an anomaly.',
    ],
    antiPatterns: [
      'Calling every fluctuation an anomaly',
      'Surfacing noise with no threshold',
    ],
  },
]

export function getAllSalesOpsIntelligenceSkills(): AgentSkillDefinition[] {
  return SKILLS
}
