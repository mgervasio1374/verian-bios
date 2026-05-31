import { addDays } from './date-math'

export interface ScheduleRule {
  key: string
  label: string
  intervals: number[]  // calendar days after proposal_sent_at; sorted ascending
}

export interface PlainFollowUpCommitment {
  followUpDueAt: string   // ISO 8601 UTC
  followUpSequence: number
  scheduleRuleKey: string
}

export const SCHEDULE_RULES: ScheduleRule[] = [
  { key: 'standard_3_5_10',  label: 'Standard (3, 5, 10 days)',  intervals: [3, 5, 10] },
  { key: 'aggressive_2_4_7', label: 'Aggressive (2, 4, 7 days)', intervals: [2, 4, 7]  },
  { key: 'light_5_14',       label: 'Light (5, 14 days)',        intervals: [5, 14]    },
  { key: 'single_7',         label: 'Single follow-up (7 days)', intervals: [7]        },
]

export const STANDARD_3_5_10 = SCHEDULE_RULES[0]

export const DEFAULT_SCHEDULE_RULE_KEY = 'standard_3_5_10'

export function getScheduleRule(ruleKey: string): ScheduleRule {
  const rule = SCHEDULE_RULES.find(r => r.key === ruleKey)
  if (!rule) throw new Error(`getScheduleRule: unknown rule key '${ruleKey}'`)
  return rule
}

export function buildFollowUpCommitmentsFromRule(
  proposalSentAt: string,
  ruleKey: string
): PlainFollowUpCommitment[] {
  const rule = getScheduleRule(ruleKey)
  const base = new Date(proposalSentAt)

  return rule.intervals.map((days, index) => ({
    followUpDueAt: addDays(base, days).toISOString(),
    followUpSequence: index + 1,
    scheduleRuleKey: rule.key,
  }))
}
