// Operational workflow map for the agent layer. Pure (no IO). Powers the per-agent
// workflow chips on the Agent Map catalog now and the colored route map in 1b.
// agentKeys MUST be exact AGENT_ROSTER keys — tests assert every key resolves.

export interface AgentWorkflow {
  key:          string
  label:        string
  color:        string            // hex — used for the colored dot (dark-mode safe)
  agentKeys:    readonly string[]
  crossCutting?: boolean          // serves all flows; no meaningful step order
}

export const WORKFLOWS: AgentWorkflow[] = [
  {
    key: 'intake', label: 'Lead Intake', color: '#378ADD',
    agentKeys: ['lead_scoring_agent', 'company_scoring_agent'],
  },
  {
    key: 'email', label: 'Email Generation', color: '#1D9E75',
    agentKeys: ['message_strategy_agent', 'copywriting_agent', 'subject_line_agent', 'personalization_agent', 'quality_review_agent'],
  },
  {
    // Cadence variant — same agent chain as email; the differentiating scheduler is not an agent.
    key: 'sequence', label: 'Sequence Cadence', color: '#7F77DD',
    agentKeys: ['message_strategy_agent', 'copywriting_agent', 'subject_line_agent', 'personalization_agent', 'quality_review_agent'],
  },
  {
    key: 'statement', label: 'Statement Analysis', color: '#D85A30',
    agentKeys: ['statement_extraction_agent', 'statement_review_agent'],
  },
  {
    key: 'governance', label: 'Governance / Safety', color: '#6B7280', crossCutting: true,
    agentKeys: ['prompt_policy_agent', 'risk_classifier_agent', 'approval_gate_agent', 'execution_gate_agent'],
  },
  {
    key: 'learning', label: 'Learning Loop', color: '#6B7280', crossCutting: true,
    agentKeys: ['learning_agent'],
  },
]

export interface AgentWorkflowMembership {
  workflowKey:   string
  label:         string
  color:         string
  step?:         number          // 1-based position; omitted for cross-cutting flows
  crossCutting?: boolean
}

// Every workflow that contains agentKey, with step = index+1 (omitted when cross-cutting).
export function workflowsForAgent(agentKey: string): AgentWorkflowMembership[] {
  const out: AgentWorkflowMembership[] = []
  for (const wf of WORKFLOWS) {
    const idx = wf.agentKeys.indexOf(agentKey)
    if (idx === -1) continue
    out.push({
      workflowKey:  wf.key,
      label:        wf.label,
      color:        wf.color,
      ...(wf.crossCutting ? { crossCutting: true } : { step: idx + 1 }),
    })
  }
  return out
}

// One-line responsibility per agent — the fallback when the bridge registry has no
// description (the 5 runtime/learning agents aren't registered). Keys = AGENT_ROSTER.
export const AGENT_RESPONSIBILITY: Record<string, string> = {
  // Messaging
  copywriting_agent:      'Generates compliant outreach copy variants from the selected strategy + skills.',
  message_strategy_agent: 'Chooses the relationship-aware message angle and constraints for a lead.',
  quality_review_agent:   'Scores generated drafts for compliance, truth, and quality before they advance.',
  subject_line_agent:     'Produces and ranks subject-line options for a draft (gated).',
  personalization_agent:  'Injects lead-specific personalization into copy (gated).',
  // Business intelligence
  lead_scoring_agent:            'Scores inbound leads for fit and urgency to prioritize outreach.',
  company_scoring_agent:         'Computes company-level fit/intent scores from enrichment signals.',
  campaign_recommendation_agent: 'Recommends the next campaign or action for a company.',
  learning_agent:                'Mines send/outcome history into advisory learning signals.',
  sales_ops_intelligence_agent:  'Surfaces sales-ops anomalies and pipeline intelligence (skeletal).',
  statement_review_agent:        'Grades each statement analysis for plausibility and flags outliers.',
  statement_extraction_agent:    'Extracts merchant statement figures from the uploaded PDF text layer.',
  // Policy / safety
  prompt_policy_agent:    'Validates prompts against policy before model routing (gated).',
  risk_classifier_agent:  'Classifies task/content risk to drive approval routing (skeletal).',
  approval_gate_agent:    'Holds high-risk actions for human approval (skeletal).',
  // Development
  claude_implementation_agent: 'Implements code under policy governance (dry-run; human-approved).',
  codex_review_agent:          'Performs independent code/regression review (artifacts only).',
  architecture_review_agent:   'Reviews architectural decisions and slice plans (dry-run).',
  documentation_agent:         'Drafts and maintains documentation (dry-run).',
  // Execution
  execution_gate_agent:   'Final execution gate placeholder — blocks production side effects.',
}

// Which skill family an agent draws on. Covers every Class A (learning) and
// Class B (governance) agent; each family has a seed module (copywriting keeps
// its own rich module, the rest live in AGENT_SEED_SKILLS). Drives the skills count.
export const AGENT_SKILL_FAMILY: Record<string, string> = {
  // Class A (learning) — messaging
  copywriting_agent:      'copywriting',
  message_strategy_agent: 'message_strategy',
  quality_review_agent:   'quality_review',
  subject_line_agent:     'subject_line',
  personalization_agent:  'personalization',
  // Class A (learning) — business intelligence
  lead_scoring_agent:            'lead_scoring',
  company_scoring_agent:         'company_scoring',
  campaign_recommendation_agent: 'campaign_recommendation',
  statement_extraction_agent:    'statement_extraction',
  statement_review_agent:        'statement_review',
  sales_ops_intelligence_agent:  'sales_ops_intelligence',
  // Class B (governance)
  prompt_policy_agent:    'prompt_policy',
  risk_classifier_agent:  'risk_classifier',
  approval_gate_agent:    'approval_gate',
}
