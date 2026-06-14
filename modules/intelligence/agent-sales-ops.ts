import { BOUNCE_WARN, COMPLAINT_CRIT, MIN_SAMPLE } from '@/modules/analytics/deliverability'

// Sales-ops intelligence agent (logic core). Previously skeletal — registered with
// no implementation. This is its read-only analysis: fold campaign/pipeline/agent
// signals into an insight report with severity-tagged findings. Advisory only —
// reads existing data, writes nothing, recommends nothing executable. The pure
// builder below is the testable core; the effectful wrapper just gathers inputs.

export interface SalesOpsInput {
  totalSends:            number
  deliveryRate:          number   // 0-1
  bounceRate:            number
  complaintRate:         number
  openRate:              number
  agentAnomalies:        string[] // agent labels that should have run but logged 0
  trustedLearningSignal: boolean
}

export type InsightSeverity = 'info' | 'warning' | 'critical'

export interface InsightFinding {
  severity: InsightSeverity
  area:     string
  message:  string
}

export interface SalesOpsInsights {
  headline: string
  findings: InsightFinding[]
}

export function buildSalesOpsInsights(input: SalesOpsInput): SalesOpsInsights {
  const findings: InsightFinding[] = []

  if (input.totalSends === 0) {
    findings.push({ severity: 'info', area: 'delivery', message: 'No sends in the window — pipeline is idle.' })
  } else {
    if (input.complaintRate > COMPLAINT_CRIT) {
      findings.push({ severity: 'critical', area: 'reputation', message: `Complaint rate ${(input.complaintRate * 100).toFixed(2)}% is above the safe threshold — pause and investigate.` })
    }
    if (input.bounceRate > BOUNCE_WARN) {
      findings.push({ severity: 'warning', area: 'deliverability', message: `Bounce rate ${(input.bounceRate * 100).toFixed(1)}% is elevated — check list hygiene and domain reputation.` })
    }
    if (input.totalSends >= MIN_SAMPLE && input.openRate < 0.1) {
      findings.push({ severity: 'warning', area: 'engagement', message: `Open rate ${(input.openRate * 100).toFixed(1)}% is low over ${input.totalSends} sends — subject lines or targeting may need work.` })
    }
  }

  if (input.agentAnomalies.length > 0) {
    findings.push({ severity: 'warning', area: 'agents', message: `Idle despite ingested leads: ${input.agentAnomalies.join(', ')}. Check the trigger wiring.` })
  }

  if (!input.trustedLearningSignal) {
    findings.push({ severity: 'info', area: 'learning', message: 'Learning signal is not yet trusted — the score≥85 auto-approval bridge stays dormant until enough outcome data accrues.' })
  }

  const crit = findings.filter(f => f.severity === 'critical').length
  const warn = findings.filter(f => f.severity === 'warning').length
  const headline = crit > 0
    ? `${crit} critical issue${crit === 1 ? '' : 's'} need attention`
    : warn > 0
      ? `${warn} item${warn === 1 ? '' : 's'} to review`
      : 'Healthy — no issues detected'

  return { headline, findings }
}
