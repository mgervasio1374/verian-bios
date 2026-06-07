// Verian Policy Layer — static policy profile registry.
// No checker logic here. Checker will be created in a later slice.
// The Verian Agent Bridge must not use this registry until source-reading
// tests exist and pass (Goal 3 Slice 4).

import type { VerianPolicyProfile } from '@/modules/verian-policy/types'

// ---------------------------------------------------------------------------
// Blocked action constants (shared across profiles for consistency)
// ---------------------------------------------------------------------------

const ALWAYS_BLOCKED = [
  'touch-production',
  'email-sending',
  'campaign-sending',
  'apply-migration',
  'automation-background-jobs',
  'change-vercel-settings',
  'change-env-vars',
  'change-supabase-config',
  'change-system-controls',
  'call-sendFollowUpDraftAction',
  'call-approveRequestAction',
  'call-approveAndSendAction',
  'enable-EMAIL_SENDING_ENABLED',
  'enable-CAMPAIGN_SENDING_ENABLED',
] as const

// ---------------------------------------------------------------------------
// Required evidence constants (shared across profiles)
// ---------------------------------------------------------------------------

const BASE_EVIDENCE = [
  'git-status',
  'git-log',
  'head-hash',
  'origin-master-hash',
  'no-temp-files',
  'no-tags-at-head',
] as const

const CODE_EVIDENCE = [
  ...BASE_EVIDENCE,
  'changed-files',
  'git-diff-stat',
  'vitest-output',
  'typescript-output',
  'files-in-commit',
  'production-untouched-confirmation',
] as const

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const LOW_RISK_DOCS_ONLY: VerianPolicyProfile = {
  policyId: 'LOW_RISK_DOCS_ONLY',
  name: 'Low Risk — Docs Only',
  description:
    'Documentation and markdown report commits only. No code, no migrations, no DB writes, no sending.',
  riskLevel: 'low',
  allowedActions: ['create-markdown-file', 'commit-docs', 'push-docs'],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'create-code-file',
    'create-migration',
    'create-tag',
  ],
  requiredChecks: [
    'git-status-clean',
    'head-matches-expected-hash',
    'no-temp-files',
    'no-tags-at-head',
    'only-target-doc-changed',
  ],
  requiredEvidence: [...BASE_EVIDENCE, 'file-name-in-commit'],
  requiredReviewers: [],
  requiresCodexReview: false,
  requiresHumanApproval: false,
  requiresProductivityReport: false,
  stopConditions: [
    'any-file-other-than-target-doc-changed',
    'any-code-file-created',
    'any-migration-touched',
  ],
}

const LOW_RISK_UI_POLISH_NO_DATA: VerianPolicyProfile = {
  policyId: 'LOW_RISK_UI_POLISH_NO_DATA',
  name: 'Low Risk — UI Polish, No Data Changes',
  description:
    'UI component or style modifications only. No data model changes, migrations, DB writes, or sending.',
  riskLevel: 'low',
  allowedActions: ['modify-ui-components', 'update-styles', 'commit', 'push'],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'create-migration',
    'db-write-commands',
    'create-tag',
  ],
  requiredChecks: [
    'git-status-clean',
    'head-matches-expected-hash',
    'no-temp-files',
    'no-tags-at-head',
    'vitest-pass',
    'tsc-pass',
  ],
  requiredEvidence: [...CODE_EVIDENCE],
  requiredReviewers: [],
  requiresCodexReview: false,
  requiresHumanApproval: false,
  requiresProductivityReport: false,
  stopConditions: [
    'any-migration-file-modified',
    'any-db-write-command-run',
    'any-sending-or-automation-added',
  ],
}

const MEDIUM_RISK_BACKEND_NO_MIGRATION: VerianPolicyProfile = {
  policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
  name: 'Medium Risk — Backend, No Migration',
  description:
    'Repository, service, or type file changes. No migrations, no DB writes, no production touch, no sending.',
  riskLevel: 'medium',
  allowedActions: [
    'create-repository-file',
    'create-service-file',
    'create-type-file',
    'create-test-file',
    'commit',
    'push',
  ],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'create-migration',
    'db-write-commands',
    'create-ui',
    'create-server-action',
    'create-api-route',
    'create-tag',
  ],
  requiredChecks: [
    'git-status-clean',
    'head-matches-expected-hash',
    'origin-matches-expected-hash',
    'no-temp-files',
    'no-tags-at-head',
    'vitest-pass',
    'tsc-pass',
    'diff-stat-reviewed',
    'changed-files-within-allowed-list',
  ],
  requiredEvidence: [...CODE_EVIDENCE, 'head-equals-origin-after-push'],
  requiredReviewers: [],
  requiresCodexReview: false,
  requiresHumanApproval: false,
  requiresProductivityReport: true,
  stopConditions: [
    'any-migration-touched',
    'any-write-command-run',
    'any-production-staging-touch',
    'any-new-test-failure-introduced',
    'any-file-outside-allowed-list-changed',
  ],
}

const HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION: VerianPolicyProfile = {
  policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
  name: 'High Risk — Dev Only, No Production, No Send, No Automation',
  description:
    'Full source changes including migrations in dev only. Production, sending, and automation remain blocked.',
  riskLevel: 'high',
  allowedActions: [
    'create-any-source-file',
    'modify-any-source-file',
    'create-migration-dev-only',
    'commit',
    'push',
  ],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-production',
    'apply-migration-to-production',
    'apply-migration-to-staging',
  ],
  requiredChecks: [
    'git-status-clean',
    'head-matches-expected-hash',
    'origin-matches-expected-hash',
    'no-temp-files',
    'no-tags-at-head',
    'vitest-pass',
    'tsc-pass',
    'diff-stat-reviewed',
    'changed-files-reviewed',
    'migration-status-confirmed',
    'codex-review-complete',
    'human-approval-received',
  ],
  requiredEvidence: [
    ...CODE_EVIDENCE,
    'migration-applied-confirmation',
    'head-equals-origin-after-push',
    'codex-review-artifact',
    'human-approval-record',
  ],
  requiredReviewers: ['codex', 'michael'],
  requiresCodexReview: true,
  requiresHumanApproval: true,
  requiresProductivityReport: true,
  stopConditions: [
    'production-touched',
    'any-send-action-triggered',
    'any-automation-enabled',
    'codex-review-skipped',
    'human-approval-skipped',
  ],
}

const MIGRATION_DESIGN_ONLY: VerianPolicyProfile = {
  policyId: 'MIGRATION_DESIGN_ONLY',
  name: 'Migration Design Only',
  description:
    'Create migration SQL files and commit/push them. No migration application without separate explicit authorization.',
  riskLevel: 'medium',
  allowedActions: ['create-migration-file', 'commit-migration-file', 'push-migration-file'],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'apply-migration',
    'run-migration-command',
    'create-tag',
  ],
  requiredChecks: [
    'git-status-clean',
    'head-matches-expected-hash',
    'no-temp-files',
    'no-tags-at-head',
    'migration-file-name-matches-convention',
  ],
  requiredEvidence: [...BASE_EVIDENCE, 'migration-file-contents', 'files-in-commit'],
  requiredReviewers: ['michael'],
  requiresCodexReview: false,
  requiresHumanApproval: true,
  requiresProductivityReport: false,
  stopConditions: [
    'any-migration-applied-without-explicit-authorization',
    'migration-run-command-executed',
  ],
}

const STAGING_VERIFICATION_ONLY: VerianPolicyProfile = {
  policyId: 'STAGING_VERIFICATION_ONLY',
  name: 'Staging Verification Only',
  description:
    'Apply and verify migrations on staging. Production remains blocked. Requires human approval before apply.',
  riskLevel: 'medium',
  allowedActions: [
    'run-staging-migration-apply',
    'verify-staging-state',
    'commit-verification-notes',
  ],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-production',
    'create-new-migration',
    'create-tag',
  ],
  requiredChecks: [
    'git-status-clean',
    'no-temp-files',
    'migration-status-on-staging-confirmed',
    'rollback-plan-confirmed',
    'diff-vs-production-confirmed',
    'human-approval-received',
  ],
  requiredEvidence: [
    ...BASE_EVIDENCE,
    'staging-migration-log',
    'staging-health-check',
    'rollback-plan',
    'human-approval-record',
  ],
  requiredReviewers: ['michael'],
  requiresCodexReview: false,
  requiresHumanApproval: true,
  requiresProductivityReport: true,
  stopConditions: [
    'production-touched',
    'send-triggered',
    'staging-apply-fails-without-rollback-plan',
    'human-approval-not-received-before-apply',
  ],
}

const CODEX_REVIEW_REQUIRED: VerianPolicyProfile = {
  policyId: 'CODEX_REVIEW_REQUIRED',
  name: 'Codex Review Required',
  description:
    'Prepare review artifact, pass to Codex, receive output, and commit results. Human approval required before applying Codex suggestions.',
  riskLevel: 'high',
  allowedActions: [
    'prepare-review-artifact',
    'pass-artifact-to-codex',
    'receive-codex-output',
    'commit-review-results',
  ],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'apply-codex-suggestions-without-human-approval',
    'skip-codex-when-required',
    'auto-merge',
    'auto-push-after-codex-output',
    'create-tag',
  ],
  requiredChecks: [
    'codex-output-received',
    'human-approval-of-codex-output',
    'diff-between-pre-and-post-codex',
  ],
  requiredEvidence: [
    ...BASE_EVIDENCE,
    'codex-input-artifact',
    'codex-output-artifact',
    'human-approval-record',
  ],
  requiredReviewers: ['codex', 'michael'],
  requiresCodexReview: true,
  requiresHumanApproval: true,
  requiresProductivityReport: false,
  stopConditions: [
    'codex-output-applied-without-human-review',
    'auto-merge-attempted',
    'codex-review-skipped',
  ],
}

const BRIDGE_REVIEW_ONLY: VerianPolicyProfile = {
  policyId: 'BRIDGE_REVIEW_ONLY',
  name: 'Bridge Review Only',
  description:
    'Review bridge design and policy coverage only. No bridge code, no model routing, no automation. ' +
    'Bridge implementation is blocked until policy profiles are approved and tests exist.',
  riskLevel: 'high',
  allowedActions: [
    'review-bridge-design',
    'review-policy-coverage',
    'commit-bridge-design-documents',
  ],
  blockedActions: [
    ...ALWAYS_BLOCKED,
    'touch-staging-dev',
    'implement-bridge-code',
    'route-prompts-between-models',
    'automate-model-handoffs',
    'execute-bridge-action',
    'create-bridge-infrastructure',
    'create-tag',
  ],
  requiredChecks: [
    'policy-profiles-approved',
    'policy-tests-exist',
    'codex-review-complete',
    'human-approval-received',
  ],
  requiredEvidence: [
    ...BASE_EVIDENCE,
    'approved-policy-profiles',
    'approved-codex-review-artifact',
    'human-sign-off',
  ],
  requiredReviewers: ['codex', 'michael'],
  requiresCodexReview: true,
  requiresHumanApproval: true,
  requiresProductivityReport: true,
  stopConditions: [
    'any-bridge-code-written-before-policy-approved',
    'any-automation-attempted',
    'policy-tests-do-not-exist',
  ],
}

// ---------------------------------------------------------------------------
// Registry exports
// ---------------------------------------------------------------------------

export const VERIAN_POLICY_PROFILES: readonly VerianPolicyProfile[] = [
  LOW_RISK_DOCS_ONLY,
  LOW_RISK_UI_POLISH_NO_DATA,
  MEDIUM_RISK_BACKEND_NO_MIGRATION,
  HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION,
  MIGRATION_DESIGN_ONLY,
  STAGING_VERIFICATION_ONLY,
  CODEX_REVIEW_REQUIRED,
  BRIDGE_REVIEW_ONLY,
] as const

export const VERIAN_POLICY_REGISTRY: Readonly<Record<string, VerianPolicyProfile>> = {
  LOW_RISK_DOCS_ONLY,
  LOW_RISK_UI_POLISH_NO_DATA,
  MEDIUM_RISK_BACKEND_NO_MIGRATION,
  HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION,
  MIGRATION_DESIGN_ONLY,
  STAGING_VERIFICATION_ONLY,
  CODEX_REVIEW_REQUIRED,
  BRIDGE_REVIEW_ONLY,
} as const
