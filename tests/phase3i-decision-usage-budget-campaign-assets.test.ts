/**
 * Phase 3I — Agent Decision Log, AI Usage Tracking, Budget Enforcement
 *             & Campaign Email Asset Strategy
 * Source-reading tests: assert structural contracts without runtime execution.
 * No Supabase mocking, no LLM calls, no test doubles.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()

function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

// ============================================================
// Block 0 — Migration 20240034: table creation
// ============================================================

describe('Phase 3I — Migration 20240034: tables created', () => {
  const sql = read('supabase/migrations/20240034_phase3i_decision_usage_budget_campaign.sql')

  it('TC-3I-001: creates ai_usage_events table', () => {
    expect(sql).toContain('CREATE TABLE ai_usage_events')
  })

  it('TC-3I-002: creates agent_decisions table', () => {
    expect(sql).toContain('CREATE TABLE agent_decisions')
  })

  it('TC-3I-003: creates ai_budget_policies table', () => {
    expect(sql).toContain('CREATE TABLE ai_budget_policies')
  })

  it('TC-3I-004: creates ai_budget_events table', () => {
    expect(sql).toContain('CREATE TABLE ai_budget_events')
  })

  it('TC-3I-005: creates campaign_email_assets table', () => {
    expect(sql).toContain('CREATE TABLE campaign_email_assets')
  })

  it('TC-3I-006: creates campaign_email_sends table', () => {
    expect(sql).toContain('CREATE TABLE campaign_email_sends')
  })

  it('TC-3I-007: ai_usage_events.decision_id has no FK constraint to agent_decisions', () => {
    // decision_id is a plain uuid NULL — no REFERENCES agent_decisions anywhere in ai_usage_events block
    const tableStart = sql.indexOf('CREATE TABLE ai_usage_events')
    const tableEnd   = sql.indexOf('CREATE TABLE agent_decisions')
    const block      = sql.slice(tableStart, tableEnd)
    expect(block).not.toContain('REFERENCES agent_decisions')
  })

  it('TC-3I-008: agent_decisions.ai_usage_event_id references ai_usage_events', () => {
    expect(sql).toContain('ai_usage_event_id   uuid        NULL REFERENCES ai_usage_events (id)')
  })
})

// ============================================================
// Block 1 — types/database.ts: 6 new table types
// ============================================================

describe('Phase 3I — types/database.ts: new table Row types', () => {
  const db = read('types/database.ts')

  it('TC-3I-009: agent_decisions Row type defined', () => {
    expect(db).toContain("agent_decisions: {")
  })

  it('TC-3I-010: ai_usage_events Row type defined', () => {
    expect(db).toContain("ai_usage_events: {")
  })

  it('TC-3I-011: campaign_email_assets Row type defined', () => {
    expect(db).toContain("campaign_email_assets: {")
  })

  it('TC-3I-012: campaign_email_sends Row type defined', () => {
    expect(db).toContain("campaign_email_sends: {")
  })
})

// ============================================================
// Block 2 — agent-decision.repo.ts: exports
// ============================================================

describe('Phase 3I — agent-decision.repo.ts: exports', () => {
  const src = read('modules/intelligence/repositories/agent-decision.repo.ts')

  it('TC-3I-013: exports createDecision function', () => {
    expect(src).toContain('export async function createDecision(')
  })

  it('TC-3I-014: exports getLeadDecisions function', () => {
    expect(src).toContain('export async function getLeadDecisions(')
  })

  it('TC-3I-015: exports getDecisionById function', () => {
    expect(src).toContain('export async function getDecisionById(')
  })
})

// ============================================================
// Block 3 — ai-usage-event.repo.ts: exports
// ============================================================

describe('Phase 3I — ai-usage-event.repo.ts: exports', () => {
  const src = read('modules/intelligence/repositories/ai-usage-event.repo.ts')

  it('TC-3I-016: exports recordUsage function', () => {
    expect(src).toContain('export async function recordUsage(')
  })

  it('TC-3I-017: exports getUsageSummary function', () => {
    expect(src).toContain('export async function getUsageSummary(')
  })

  it('TC-3I-018: exports getLeadUsageSummary function', () => {
    expect(src).toContain('export async function getLeadUsageSummary(')
  })
})

// ============================================================
// Block 4 — Budget repos: exports
// ============================================================

describe('Phase 3I — ai-budget-policy.repo.ts: exports', () => {
  const src = read('modules/intelligence/repositories/ai-budget-policy.repo.ts')

  it('TC-3I-019: exports createPolicy function', () => {
    expect(src).toContain('export async function createPolicy(')
  })

  it('TC-3I-020: exports listActivePoliciesForTenant function', () => {
    expect(src).toContain('export async function listActivePoliciesForTenant(')
  })
})

describe('Phase 3I — ai-budget-event.repo.ts: exports', () => {
  const src = read('modules/intelligence/repositories/ai-budget-event.repo.ts')

  it('TC-3I-021: exports recordBudgetEvent function', () => {
    expect(src).toContain('export async function recordBudgetEvent(')
  })
})

// ============================================================
// Block 5 — Campaign repos: safety contracts
// ============================================================

describe('Phase 3I — campaign-email-asset.repo.ts: safety', () => {
  const src = read('modules/messaging/repositories/campaign-email-asset.repo.ts')

  it('TC-3I-022: exports createAsset function', () => {
    expect(src).toContain('export async function createAsset(')
  })

  it('TC-3I-023: updateAssetStatus guards against approving without approvedBy', () => {
    expect(src).toContain('approvedBy is required when approving or activating an asset')
  })
})

describe('Phase 3I — campaign-email-send.repo.ts: no direct send', () => {
  const src = read('modules/messaging/repositories/campaign-email-send.repo.ts')

  it('TC-3I-024: does not call sendApprovedDraft (safety guardrail)', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })
})

// ============================================================
// Block 6 — ai-cost-estimator.service.ts
// ============================================================

describe('Phase 3I — ai-cost-estimator.service.ts', () => {
  const src = read('modules/intelligence/services/ai-cost-estimator.service.ts')

  it('TC-3I-025: exports estimateCostUsd function', () => {
    expect(src).toContain('export function estimateCostUsd(')
  })

  it('TC-3I-026: contains claude-sonnet-4-6 pricing', () => {
    expect(src).toContain("'claude-sonnet-4-6'")
  })

  it('TC-3I-027: contains claude-haiku pricing', () => {
    expect(src).toContain("'claude-haiku-4-5-20251001'")
  })
})

// ============================================================
// Block 7 — ai-budget-enforcer.service.ts
// ============================================================

describe('Phase 3I — ai-budget-enforcer.service.ts', () => {
  const src = read('modules/intelligence/services/ai-budget-enforcer.service.ts')

  it('TC-3I-028: exports preflightCheck function', () => {
    expect(src).toContain('export async function preflightCheck(')
  })

  it('TC-3I-029: references AI_CALL_BLOCKED_BY_BUDGET failure type', () => {
    expect(src).toContain('AI_CALL_BLOCKED_BY_BUDGET')
  })

  it('TC-3I-030: references AI_BUDGET_THRESHOLD_ALERT failure type', () => {
    expect(src).toContain('AI_BUDGET_THRESHOLD_ALERT')
  })

  it('TC-3I-031: references AI_BUDGET_THRESHOLD_WARNING failure type', () => {
    expect(src).toContain('AI_BUDGET_THRESHOLD_WARNING')
  })

  it('TC-3I-032: does not import Anthropic SDK', () => {
    expect(src).not.toContain('@anthropic-ai/sdk')
    expect(src).not.toContain('from \'anthropic\'')
  })
})

// ============================================================
// Block 8 — campaign-personalization.service.ts
// ============================================================

describe('Phase 3I — campaign-personalization.service.ts', () => {
  const src = read('modules/messaging/services/campaign-personalization.service.ts')

  it('TC-3I-033: exports renderCampaignAsset function', () => {
    expect(src).toContain('export function renderCampaignAsset(')
  })

  it('TC-3I-034: uses double-brace variable substitution pattern', () => {
    // {{variable_name}} regex substitution
    expect(src).toContain('{{')
  })

  it('TC-3I-035: does not call Resend or LLM APIs', () => {
    expect(src).not.toContain('resend.emails.send')
    expect(src).not.toContain('@anthropic-ai/sdk')
    expect(src).not.toContain("from 'anthropic'")
  })
})

// ============================================================
// Block 9 — Structured error and recommendation type constants
// ============================================================

describe('Phase 3I — structured-error.types.ts: AI_BUDGET_FAILURE_TYPE', () => {
  const src = read('modules/intelligence/structured-errors/structured-error.types.ts')

  it('TC-3I-036: exports AI_BUDGET_FAILURE_TYPE constant block', () => {
    expect(src).toContain('AI_BUDGET_FAILURE_TYPE')
  })

  it('TC-3I-037: AI_CALL_BLOCKED_BY_BUDGET constant defined', () => {
    expect(src).toContain("AI_CALL_BLOCKED_BY_BUDGET")
  })
})

describe('Phase 3I — system-recommendation.types.ts: REC_TYPE_3I', () => {
  const src = read('modules/intelligence/system-recommendation/system-recommendation.types.ts')

  it('TC-3I-038: exports REC_TYPE_3I constant block', () => {
    expect(src).toContain('REC_TYPE_3I')
  })
})

// ============================================================
// Block 10 — createDecision writes in existing services
// ============================================================

describe('Phase 3I — createDecision writes in core services', () => {
  it('TC-3I-039: scoring-pipeline.service.ts calls createDecision', () => {
    const src = read('modules/intelligence/services/scoring-pipeline.service.ts')
    expect(src).toContain('createDecision(')
  })

  it('TC-3I-040: recommendation.service.ts calls createDecision', () => {
    const src = read('modules/intelligence/services/recommendation.service.ts')
    expect(src).toContain('createDecision(')
  })

  it('TC-3I-041: email-draft.service.ts calls createDecision', () => {
    const src = read('modules/messaging/services/email-draft.service.ts')
    expect(src).toContain('createDecision(')
  })

  it('TC-3I-042: quality-review-agent.service.ts calls createDecision', () => {
    const src = read('modules/messaging/quality-review/quality-review-agent.service.ts')
    expect(src).toContain('createDecision(')
  })

  it('TC-3I-043: learning-agent.service.ts calls createDecision', () => {
    const src = read('modules/messaging/learning-agent/learning-agent.service.ts')
    expect(src).toContain('createDecision(')
  })
})

// ============================================================
// Block 11 — preflightCheck + recordUsage in LLM agent services
// ============================================================

describe('Phase 3I — preflightCheck in 4 agent services', () => {
  it('TC-3I-044: message-strategy.service.ts calls preflightCheck and recordUsage', () => {
    const src = read('modules/messaging/strategy/message-strategy.service.ts')
    expect(src).toContain('preflightCheck(')
    expect(src).toContain('recordUsage(')
  })

  it('TC-3I-045: copywriting-agent.service.ts calls preflightCheck and recordUsage', () => {
    const src = read('modules/messaging/copywriting/copywriting-agent.service.ts')
    expect(src).toContain('preflightCheck(')
    expect(src).toContain('recordUsage(')
  })

  it('TC-3I-046: quality-review-agent.service.ts calls preflightCheck and recordUsage', () => {
    const src = read('modules/messaging/quality-review/quality-review-agent.service.ts')
    expect(src).toContain('preflightCheck(')
    expect(src).toContain('recordUsage(')
  })

  it('TC-3I-047: email-rewrite-loop.service.ts calls preflightCheck and recordUsage', () => {
    const src = read('modules/messaging/services/email-rewrite-loop.service.ts')
    expect(src).toContain('preflightCheck(')
    expect(src).toContain('recordUsage(')
  })
})
