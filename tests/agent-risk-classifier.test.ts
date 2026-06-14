// Agent sweep — risk-classifier agent (was skeletal). Tests the deterministic
// classification: risk level, recommended policy profile, and approval flags.
// TC-RC-01..08

import { describe, it, expect } from 'vitest'
import { classifyTaskRisk } from '@/modules/intelligence/agent-risk-classifier'

describe('TC-RC-01: high-risk classification', () => {
  it('a send/production task → high + no-prod-no-send policy + human + codex', () => {
    const r = classifyTaskRisk({ promptText: 'Send email blast to production list and enable campaign sending' })
    expect(r.riskLevel).toBe('high')
    expect(r.recommendedPolicyId).toBe('HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION')
    expect(r.requiresHumanApproval).toBe(true)
    expect(r.requiresCodexReview).toBe(true)
    expect(r.signals.length).toBeGreaterThan(0)
  })

  it('a migration task → high + staging-verification policy', () => {
    const r = classifyTaskRisk({ promptText: 'apply migration to production database' })
    expect(r.riskLevel).toBe('high')
    expect(r.recommendedPolicyId).toBe('STAGING_VERIFICATION_ONLY')
  })
})

describe('TC-RC-02: medium-risk classification', () => {
  it('a backend service/repo change → medium + backend-no-migration policy', () => {
    const r = classifyTaskRisk({ promptText: 'add a new service and repository for lead enrichment, refactor the schema reader' })
    expect(r.riskLevel).toBe('medium')
    expect(r.recommendedPolicyId).toBe('MEDIUM_RISK_BACKEND_NO_MIGRATION')
    expect(r.requiresHumanApproval).toBe(true)
    expect(r.requiresCodexReview).toBe(false)
  })
})

describe('TC-RC-03: low-risk classification', () => {
  it('a docs task → low + docs-only policy, no approval needed', () => {
    const r = classifyTaskRisk({ promptText: 'update the README and add a changelog entry' })
    expect(r.riskLevel).toBe('low')
    expect(r.recommendedPolicyId).toBe('LOW_RISK_DOCS_ONLY')
    expect(r.requiresHumanApproval).toBe(false)
  })

  it('a UI-polish task → low + ui-polish policy', () => {
    const r = classifyTaskRisk({ promptText: 'polish the sidebar component css and layout, tweak tailwind styles' })
    expect(r.riskLevel).toBe('low')
    expect(r.recommendedPolicyId).toBe('LOW_RISK_UI_POLISH_NO_DATA')
  })
})

describe('TC-RC-04: scoring + signals', () => {
  it('score is bounded 0-100 and rises with more high signals', () => {
    const one = classifyTaskRisk({ promptText: 'send email' })
    const many = classifyTaskRisk({ promptText: 'send email to production, apply migration, force push, bypass approval' })
    expect(one.score).toBeGreaterThanOrEqual(60)
    expect(many.score).toBeGreaterThan(one.score)
    expect(many.score).toBeLessThanOrEqual(100)
  })

  it('changedFiles + intendedActionSummary contribute to the signal scan', () => {
    const r = classifyTaskRisk({
      promptText: 'routine change',
      intendedActionSummary: 'touch-production',
      changedFiles: ['supabase/migrations/20240060_x.sql'],
    })
    expect(r.riskLevel).toBe('high')
  })
})
