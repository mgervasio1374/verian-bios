// Verian Policy Layer — deterministic prompt policy checker.
// No model calls. No shell commands. No file I/O. No runtime system access.
// This checker is a safety assistant, not a replacement for human approval,
// Codex review, tests, or runtime feature gates.

import type {
  VerianPolicyProfileId,
  VerianPolicyValidationIssue,
  VerianPolicyValidationResult,
} from '@/modules/verian-policy/types'
import { VERIAN_POLICY_REGISTRY } from '@/modules/verian-policy/registry'

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type VerianPromptPolicyCheckInput = {
  policyId: VerianPolicyProfileId
  promptText: string
  intendedActionSummary?: string
  changedFiles?: string[]
  evidenceProvided?: string[]
}

// Extends VerianPolicyValidationResult with a human-readable summary.
export type VerianPromptPolicyCheckResult = VerianPolicyValidationResult & {
  readonly summary: string
}

// ---------------------------------------------------------------------------
// Phrase-to-action maps (phrase matching is case-insensitive via .toLowerCase())
// ---------------------------------------------------------------------------

type PhraseEntry = { phrase: string; action: string }

const SENDING_PHRASES: PhraseEntry[] = [
  { phrase: 'send email', action: 'email-sending' },
  { phrase: 'send emails', action: 'email-sending' },
  { phrase: 'send campaign', action: 'campaign-sending' },
  { phrase: 'send campaigns', action: 'campaign-sending' },
  { phrase: 'enable email_sending_enabled', action: 'enable-EMAIL_SENDING_ENABLED' },
  { phrase: 'enable campaign_sending_enabled', action: 'enable-CAMPAIGN_SENDING_ENABLED' },
  { phrase: 'approveandsendaction', action: 'call-approveAndSendAction' },
  { phrase: 'sendfollowupdraftaction', action: 'call-sendFollowUpDraftAction' },
]

const PRODUCTION_PHRASES: PhraseEntry[] = [
  { phrase: 'touch production', action: 'touch-production' },
  { phrase: 'update production', action: 'touch-production' },
  { phrase: 'deploy to production', action: 'touch-production' },
  { phrase: 'production database', action: 'touch-production' },
  { phrase: 'prod db', action: 'touch-production' },
]

// Listed most-specific first so the subsumption logic can suppress generic matches.
const MIGRATION_PHRASES: PhraseEntry[] = [
  { phrase: 'apply migration to production', action: 'apply-migration-to-production' },
  { phrase: 'apply migration to staging', action: 'run-staging-migration-apply' },
  { phrase: 'run staging migration apply', action: 'run-staging-migration-apply' },
  { phrase: 'create migration file', action: 'create-migration-file' },
  { phrase: 'apply migration', action: 'apply-migration' },
  { phrase: 'run migration', action: 'apply-migration' },
  { phrase: 'create migration', action: 'create-migration' },
]

const AUTOMATION_PHRASES: PhraseEntry[] = [
  { phrase: 'create background job', action: 'automation-background-jobs' },
  { phrase: 'background job', action: 'automation-background-jobs' },
  { phrase: 'start automation', action: 'automation-background-jobs' },
  { phrase: 'add automation', action: 'automation-background-jobs' },
  { phrase: 'automation worker', action: 'automation-background-jobs' },
]

// Listed most-specific first.
const BRIDGE_PHRASES: PhraseEntry[] = [
  { phrase: 'implement bridge code', action: 'implement-bridge-code' },
  { phrase: 'implement bridge', action: 'implement-bridge-code' },
  { phrase: 'route prompts between models', action: 'route-prompts-between-models' },
  { phrase: 'automate model handoffs', action: 'automate-model-handoffs' },
  { phrase: 'execute bridge action', action: 'execute-bridge-action' },
  { phrase: 'create bridge infrastructure', action: 'create-bridge-infrastructure' },
]

// ---------------------------------------------------------------------------
// Restricted tokens — actions not in ALWAYS_BLOCKED that still require
// explicit allowedActions presence to avoid a blocking violation.
// This resolves the migration-action-token ambiguity noted in the Codex review:
// e.g. STAGING_VERIFICATION_ONLY allows 'run-staging-migration-apply' but not
// generic 'apply-migration'; MIGRATION_DESIGN_ONLY allows 'create-migration-file'
// but no other profile does.
// ---------------------------------------------------------------------------

const RESTRICTED_TOKENS = new Set([
  'create-migration-file',
  'create-migration',
  'run-staging-migration-apply',
  'apply-migration',
  'apply-migration-to-production',
  'implement-bridge-code',
  'route-prompts-between-models',
  'automate-model-handoffs',
  'execute-bridge-action',
  'create-bridge-infrastructure',
])

// ---------------------------------------------------------------------------
// Subsumption: when a more-specific token is matched, suppress the generic one
// so the checker does not double-report. E.g. matching 'create migration file'
// suppresses a separate match on the 'create migration' substring.
// ---------------------------------------------------------------------------

const SUBSUMED_TOKENS: Array<[specific: string, generic: string]> = [
  ['create-migration-file', 'create-migration'],
  ['apply-migration-to-production', 'apply-migration'],
  ['run-staging-migration-apply', 'apply-migration'],
]

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function checkVerianPromptPolicy(
  input: VerianPromptPolicyCheckInput,
): VerianPromptPolicyCheckResult {
  const { policyId, promptText, intendedActionSummary, evidenceProvided } = input
  const issues: VerianPolicyValidationIssue[] = []

  // 1. Resolve policy profile — block immediately on unknown policyId
  const profile = VERIAN_POLICY_REGISTRY[policyId]
  if (!profile) {
    const msg = `Unknown policy ID: '${policyId}'. Verify against VERIAN_POLICY_REGISTRY before proceeding.`
    return {
      policyId,
      status: 'blocked',
      issues: [{ severity: 'blocking', message: msg, policyId }],
      summary: `BLOCKED — ${msg}`,
    }
  }

  // 2. Normalize combined prompt text for case-insensitive phrase scanning
  const combined = `${promptText} ${intendedActionSummary ?? ''}`.toLowerCase().trim()

  // 3. Warn on ambiguous or empty prompt
  if (combined.length < 10) {
    issues.push({
      severity: 'warning',
      message:
        'Prompt and action summary are too short or empty to verify policy compliance. Provide more context.',
      policyId,
    })
  }

  // 4. Collect first-match-per-action-token across all phrase maps
  const allPhrases: PhraseEntry[] = [
    ...SENDING_PHRASES,
    ...PRODUCTION_PHRASES,
    ...MIGRATION_PHRASES,
    ...AUTOMATION_PHRASES,
    ...BRIDGE_PHRASES,
  ]
  const matchedActions = new Map<string, string>() // action → matched phrase
  for (const { phrase, action } of allPhrases) {
    if (combined.includes(phrase) && !matchedActions.has(action)) {
      matchedActions.set(action, phrase)
    }
  }

  // 5. Suppress generic tokens when a more-specific token was already matched
  const subsumedActions = new Set<string>()
  for (const [specific, generic] of SUBSUMED_TOKENS) {
    if (matchedActions.has(specific)) subsumedActions.add(generic)
  }
  const effectiveActions = new Map(
    [...matchedActions.entries()].filter(([action]) => !subsumedActions.has(action)),
  )

  // 6. Evaluate each effective action against the resolved profile
  for (const [action, phrase] of effectiveActions) {
    if (profile.blockedActions.includes(action)) {
      issues.push({
        severity: 'blocking',
        message: `Phrase '${phrase}' maps to blocked action '${action}' under policy '${policyId}'.`,
        policyId,
        action,
      })
    } else if (RESTRICTED_TOKENS.has(action) && !profile.allowedActions.includes(action)) {
      issues.push({
        severity: 'blocking',
        message: `Action '${action}' (phrase: '${phrase}') is not permitted under policy '${policyId}'. This action is not in allowedActions for the selected profile.`,
        policyId,
        action,
      })
    }
  }

  // 7. Warn when required reviewer language is absent from the prompt
  if (profile.requiresCodexReview && !combined.includes('codex')) {
    issues.push({
      severity: 'warning',
      message: `Policy '${policyId}' requires Codex review but no mention of Codex was found in the prompt.`,
      policyId,
    })
  }
  const hasApprovalLanguage =
    combined.includes('michael') ||
    combined.includes('human approval') ||
    combined.includes('approval') ||
    combined.includes('sign-off')
  if (profile.requiresHumanApproval && !hasApprovalLanguage) {
    issues.push({
      severity: 'warning',
      message: `Policy '${policyId}' requires human approval but no mention of approval, Michael, or sign-off was found in the prompt.`,
      policyId,
    })
  }

  // 8. Warn when caller-provided evidence is missing required items
  if (evidenceProvided !== undefined) {
    for (const required of profile.requiredEvidence) {
      if (!evidenceProvided.includes(required)) {
        issues.push({
          severity: 'warning',
          message: `Required evidence '${required}' is missing from evidenceProvided under policy '${policyId}'.`,
          policyId,
        })
      }
    }
  }

  // 9. Compute status and human-readable summary
  const hasBlocking = issues.some(i => i.severity === 'blocking')
  const hasWarning = issues.some(i => i.severity === 'warning')
  const status: 'blocked' | 'warning' | 'pass' = hasBlocking
    ? 'blocked'
    : hasWarning
      ? 'warning'
      : 'pass'

  const blockingCount = issues.filter(i => i.severity === 'blocking').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const summary =
    status === 'blocked'
      ? `BLOCKED — ${blockingCount} blocking violation(s) detected under policy '${policyId}'. Do not proceed until violations are resolved.`
      : status === 'warning'
        ? `WARNING — ${warningCount} warning(s) detected under policy '${policyId}'. Review issues before proceeding.`
        : `PASS — No violations detected under policy '${policyId}'. Human approval and Codex review may still be required by this policy.`

  return { policyId, status, issues, summary }
}
