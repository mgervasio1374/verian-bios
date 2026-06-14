import type { VerianPolicyRiskLevel } from '@/modules/verian-policy/types'

// Risk-classifier agent (logic core). Previously skeletal — a registered descriptor
// with no implementation. This is the deterministic classification it performs:
// given a task's prompt + intended actions, return a risk level and the policy
// profile that should govern it. Pure, no IO, dry-run-only (it recommends; it never
// executes or modifies a policy). The approval-gate agent consumes this.

export interface RiskClassifierInput {
  promptText:             string
  intendedActionSummary?: string
  changedFiles?:          string[]
}

export interface RiskClassification {
  riskLevel:            VerianPolicyRiskLevel
  score:                number          // 0-100, higher = riskier
  signals:              string[]        // which phrases drove the level
  recommendedPolicyId:  string
  requiresHumanApproval: boolean
  requiresCodexReview:   boolean
}

// High-risk signals mirror the BASE_BLOCKED / always-blocked vocabulary: anything
// that touches production, sends, writes data, migrates, or removes human approval.
const HIGH_SIGNALS = [
  'send email', 'send-email', 'campaign send', 'campaign-sending', 'blast',
  'production', 'touch-production', 'to prod', 'prod db', 'apply migration',
  'apply-migration', 'db write', 'database write', 'drop table', 'delete from',
  'truncate', 'enable email_sending', 'enable campaign', 'autonomous', 'auto-send',
  'bypass approval', 'bypass-human-approval', 'force push', 'force-push',
]
const MEDIUM_SIGNALS = [
  'migration', 'service', 'repository', 'repo ', 'api route', 'server action',
  'schema', 'backend', 'refactor', 'database read', 'new table', 'new column',
  'rls', 'permission', 'auth',
]
const UI_SIGNALS   = ['ui', 'css', 'style', 'polish', 'component', 'layout', 'tailwind', 'design']
const DOCS_SIGNALS = ['docs', 'documentation', 'markdown', 'readme', 'comment', 'changelog']

function matched(haystack: string, needles: string[]): string[] {
  return needles.filter(n => haystack.includes(n))
}

export function classifyTaskRisk(input: RiskClassifierInput): RiskClassification {
  const hay = [
    input.promptText,
    input.intendedActionSummary ?? '',
    ...(input.changedFiles ?? []),
  ].join(' \n ').toLowerCase()

  const highHits   = matched(hay, HIGH_SIGNALS)
  const mediumHits = matched(hay, MEDIUM_SIGNALS)
  const isMigration = hay.includes('migration')
  const isUi        = matched(hay, UI_SIGNALS).length > 0 && highHits.length === 0 && mediumHits.length === 0
  const isDocs      = matched(hay, DOCS_SIGNALS).length > 0 && highHits.length === 0 && mediumHits.length === 0

  let riskLevel: VerianPolicyRiskLevel
  let signals: string[]
  if (highHits.length > 0) {
    riskLevel = 'high'; signals = highHits
  } else if (mediumHits.length > 0) {
    riskLevel = 'medium'; signals = mediumHits
  } else {
    riskLevel = 'low'; signals = isDocs ? ['docs'] : isUi ? ['ui'] : []
  }

  // Bounded score: 60 base for high, 35 for medium, 10 for low, +5 per extra hit.
  const base = riskLevel === 'high' ? 60 : riskLevel === 'medium' ? 35 : 10
  const score = Math.min(100, base + Math.max(0, signals.length - 1) * 5)

  const recommendedPolicyId =
    riskLevel === 'high'
      ? (isMigration ? 'STAGING_VERIFICATION_ONLY' : 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION')
      : riskLevel === 'medium'
        ? 'MEDIUM_RISK_BACKEND_NO_MIGRATION'
        : isUi
          ? 'LOW_RISK_UI_POLISH_NO_DATA'
          : 'LOW_RISK_DOCS_ONLY'

  return {
    riskLevel,
    score,
    signals,
    recommendedPolicyId,
    requiresHumanApproval: riskLevel !== 'low',
    requiresCodexReview:   riskLevel === 'high',
  }
}
