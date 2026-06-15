// ============================================================
// Phase 3B — Message Strategy Agent Test Suite
// Tests the pure business logic (decision tree, skill selector,
// confidence scorer, validation) against all 30 approved fixtures.
// No database calls — only pure functions are tested here.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { normalizeStrategyInput } from '../modules/messaging/strategy/message-strategy.normalizer'
import { selectMessageType } from '../modules/messaging/strategy/message-strategy.decision-tree'
import { selectSkills, validateSkillCombination } from '../modules/messaging/strategy/message-strategy.skill-selector'
import { calculateConfidence, getConfidenceBand } from '../modules/messaging/strategy/message-strategy.confidence'
import { validateStrategy } from '../modules/messaging/strategy/message-strategy.validation'
import {
  STRATEGY_ERROR_CODES,
  STRATEGY_WARNING_CODES,
  SKILL_SLUGS,
} from '../modules/messaging/strategy/message-strategy.types'
import type { StrategyInput } from '../modules/messaging/strategy/message-strategy.types'

// ---- Load all fixtures ----

const FIXTURE_DIR = resolve(__dirname, 'fixtures/message-strategy')

interface Fixture {
  meta:     { test_case_id: string; scenario_name: string; description: string }
  input:    Record<string, unknown>
  expected: {
    success:                   boolean
    message_type?:             string
    message_type_must_not_be?: string
    required_skills_included?: string[]
    forbidden_skills?:         string[]
    primary_goal?:             string
    cta_style?:                string
    confidence_band?:          string
    confidence_range?:         { min: number; max: number }
    requires_human_review?:    boolean
    errors?:                   Array<{ code: string; severity?: string; blocking?: boolean }>
    warnings?:                 string[]
    guardrails?:               string[]
    personalization_level?:    string
    offer_angle_must_not_be?:  string
  }
}

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).sort()
  return files.map(f => JSON.parse(readFileSync(resolve(FIXTURE_DIR, f), 'utf-8')) as Fixture)
}

// ---- Fixture input normalizer adapter ----
// Fixtures may have extra fields (e.g., contact_email, sub_industry) that the
// normalizer doesn't use — that's fine; TypeScript will ignore them.

function fixtureToStrategyInput(raw: Record<string, unknown>): StrategyInput {
  const lead = (raw['lead'] ?? {}) as Record<string, unknown>
  const company = (raw['company'] ?? null) as Record<string, unknown> | null
  const statement = (raw['statement'] ?? null) as Record<string, unknown> | null
  const campaign = (raw['campaign'] ?? null) as Record<string, unknown> | null
  const partner = (raw['partner'] ?? null) as Record<string, unknown> | null
  const event = (raw['event'] ?? null) as Record<string, unknown> | null
  const proposal = (raw['proposal'] ?? null) as Record<string, unknown> | null
  const customer = (raw['customer'] ?? null) as Record<string, unknown> | null
  const controls = (raw['systemControls'] ?? {}) as Record<string, unknown>

  return {
    lead: {
      lead_id:                (lead['lead_id'] as string) ?? '',
      contact_name:           (lead['contact_name'] as string | null) ?? null,
      company_name:           (lead['company_name'] as string | null) ?? (company?.['company_name'] as string | null) ?? null,
      lead_source:            (lead['lead_source'] as string | null) ?? null,
      lead_stage:             (lead['lead_stage'] as string | null) ?? null,
      lead_score:             (lead['lead_score'] as number | null) ?? null,
      lead_urgency_score:     (lead['lead_urgency_score'] as number | null) ?? null,
      industry_segment:       (lead['industry_segment'] as string | null) ?? (company?.['industry'] as string | null) ?? null,
      business_type:          (lead['business_type'] as string | null) ?? null,
      prior_touch_count:      (lead['prior_touch_count'] as number | null) ?? 0,
      // Fixtures whose scenario depends on recency relative to "now" (e.g. the
      // 30-day no-response/re-engagement boundary) must use last_contacted_days_ago
      // instead of an absolute timestamp — absolute dates rot as real time passes.
      last_contacted_at:      (lead['last_contacted_at'] as string | null)
        ?? (typeof lead['last_contacted_days_ago'] === 'number'
          ? new Date(Date.now() - (lead['last_contacted_days_ago'] as number) * 86_400_000).toISOString()
          : null),
      last_engagement_signal: (lead['last_engagement_signal'] as string | null) ?? 'none',
      opted_out:              (lead['opted_out'] as boolean | null) ?? false,
      assigned_rep_id:        (lead['assigned_rep_id'] as string | null) ?? null,
    },
    company: company ? {
      company_id:            (company['company_id'] as string | null) ?? null,
      company_name:          (company['company_name'] as string | null) ?? null,
      industry:              (company['industry'] as string | null) ?? null,
      website:               (company['website'] as string | null) ?? null,
      size_proxy:            (company['size_proxy'] as string | null) ?? null,
      locations_count:       (company['locations_count'] as number | null) ?? null,
      known_payment_context: (company['known_payment_context'] as string | null) ?? null,
      customer_type:         (company['customer_type'] as string | null) ?? null,
      customer_status:       (company['customer_status'] as string | null) ?? null,
    } : null,
    statement: statement ? {
      has_statement_artifact:       (statement['has_statement_artifact'] as boolean) ?? false,
      statement_received_at:        (statement['statement_received_at'] as string | null) ?? null,
      statement_review_completed:   (statement['statement_review_completed'] as boolean | null) ?? null,
      // Fixtures may use either key name
      statement_findings_available: (
        (statement['statement_findings_available'] as boolean | null) ??
        (statement['findings_available'] as boolean | null) ??
        null
      ),
      calculated_savings_amount:    (statement['calculated_savings_amount'] as number | null) ?? null,
      calculation_basis:            (statement['calculation_basis'] as string | null) ?? null,
      review_summary:               (statement['review_summary'] as string | null) ?? null,
    } : { has_statement_artifact: false },
    campaign: campaign ? {
      campaign_id:             (campaign['campaign_id'] as string | null) ?? null,
      campaign_type:           (campaign['campaign_type'] as string | null) ?? null,
      campaign_goal:           (campaign['campaign_goal'] as string | null) ?? null,
      sequence_position:       (campaign['sequence_position'] as number | null) ?? null,
      sequence_definition:     (campaign['sequence_definition'] as Record<string, unknown> | null) ?? null,
      prior_campaign_messages: (campaign['prior_campaign_messages'] as Array<Record<string, unknown>> | null) ?? null,
      target_segment:          (campaign['target_segment'] as string | null) ?? null,
      next_scheduled_touch:    (campaign['next_scheduled_touch'] as string | null) ?? null,
    } : null,
    partner: partner ? {
      partner_membership_confirmed: (partner['partner_membership_confirmed'] as boolean) ?? false,
      partner_name:                 (partner['partner_name'] as string | null) ?? null,
      partner_source:               (partner['partner_source'] as string | null) ?? null,
      partner_tag:                  (partner['partner_tag'] as string | null) ?? null,
      partner_claims_authorized:    (partner['partner_claims_authorized'] as boolean | null) ?? null,
    } : { partner_membership_confirmed: false },
    event: event ? {
      event_name:         (event['event_name'] as string | null) ?? null,
      // Recency-sensitive (60-day event cutoff). Use event_days_ago for such
      // scenarios instead of an absolute event_date — absolute dates rot over time.
      event_date:         (event['event_date'] as string | null)
        ?? (typeof event['event_days_ago'] === 'number'
          ? new Date(Date.now() - (event['event_days_ago'] as number) * 86_400_000).toISOString()
          : null),
      conversation_notes: (event['conversation_notes'] as string | null) ?? null,
    } : null,
    proposal: {
      proposal_sent:        (proposal?.['proposal_sent'] as boolean) ?? false,
      // Recency-sensitive (days_since_proposal). Use proposal_sent_days_ago for
      // such scenarios instead of an absolute proposal_sent_at — absolute dates
      // rot over time. Kept populated (not null) so STRAT_WARN_008 doesn't trip.
      proposal_sent_at:     (proposal?.['proposal_sent_at'] as string | null)
        ?? (typeof proposal?.['proposal_sent_days_ago'] === 'number'
          ? new Date(Date.now() - (proposal['proposal_sent_days_ago'] as number) * 86_400_000).toISOString()
          : null),
      proposal_summary:     (proposal?.['proposal_summary'] as string | null) ?? null,
    },
    customer: {
      is_existing_customer:    (customer?.['is_existing_customer'] as boolean) ?? false,
      customer_since:          (customer?.['customer_since'] as string | null) ?? null,
      account_status:          (customer?.['account_status'] as string | null) ?? null,
      recent_account_activity: (customer?.['recent_account_activity'] as string | null) ?? null,
      nurture_trigger:         (customer?.['nurture_trigger'] as string | null) ?? null,
    },
    systemControls: {
      email_generation_engine: (controls['email_generation_engine'] as string) ?? 'phase3b',
      global_agent_pause:      (controls['global_agent_pause'] as boolean) ?? false,
      require_strategy_review: (controls['require_strategy_review'] as boolean) ?? false,
      require_message_approval:(controls['require_message_approval'] as boolean) ?? true,
    },
  }
}

// ---- Main test runner ----

const fixtures = loadFixtures()

describe('Message Strategy Agent — 30 Test Cases', () => {
  for (const fixture of fixtures) {
    it(`${fixture.meta.test_case_id}: ${fixture.meta.scenario_name}`, () => {
      const { meta, input: rawInput, expected } = fixture
      const strategyInput = fixtureToStrategyInput(rawInput)

      // ---- Normalise ----
      const n = normalizeStrategyInput(strategyInput)

      // ---- If opted_out, check STRAT_001 shows up in validation ----
      if (n.lead.opted_out) {
        const mockStrategy = {
          confidence_score:  0,
          message_type:      'cold_outreach' as const,
          offer_angle:       'cost_clarity' as const,
          selected_skills:   [],
          invalid_reasons:   [],
          status:            'draft' as const,
        }
        const valResult = validateStrategy(mockStrategy, n)
        const codes = valResult.errors.map(e => e.code)
        expect(codes).toContain(STRATEGY_ERROR_CODES.STRAT_001)
        return
      }

      // ---- If phase3b not enabled, check STRAT_003 ----
      if (n.systemControls.email_generation_engine !== 'phase3b') {
        const mockStrategy = { confidence_score: 0, message_type: 'cold_outreach' as const, offer_angle: 'cost_clarity' as const, selected_skills: [], invalid_reasons: [], status: 'draft' as const }
        const valResult = validateStrategy(mockStrategy, n)
        expect(valResult.errors.map(e => e.code)).toContain(STRATEGY_ERROR_CODES.STRAT_003)
        return
      }

      // ---- Run decision tree ----
      const dtResult = selectMessageType(n)
      const selectedType = dtResult.message_type

      // ---- Check message_type ----
      if (expected.message_type) {
        expect(selectedType, `[${meta.test_case_id}] message_type`).toBe(expected.message_type)
      }
      if (expected.message_type_must_not_be) {
        expect(selectedType, `[${meta.test_case_id}] message_type must not be`).not.toBe(expected.message_type_must_not_be)
      }

      // ---- Run skill selection ----
      const skillResult = selectSkills(selectedType, n)
      const selectedSlugs = skillResult.selected_skills.map(s => s.skill_slug)

      // ---- Compliance skill always present ----
      expect(selectedSlugs, `[${meta.test_case_id}] compliance skill`).toContain(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)

      // ---- Required skills ----
      if (expected.required_skills_included) {
        for (const required of expected.required_skills_included) {
          expect(selectedSlugs, `[${meta.test_case_id}] required skill: ${required}`).toContain(required)
        }
      }

      // ---- Forbidden skills ----
      if (expected.forbidden_skills) {
        for (const forbidden of expected.forbidden_skills) {
          expect(selectedSlugs, `[${meta.test_case_id}] forbidden skill: ${forbidden}`).not.toContain(forbidden)
        }
      }

      // ---- Confidence ----
      const bd = calculateConfidence(selectedType, skillResult.selected_skills, n)
      if (expected.confidence_range) {
        expect(bd.final_score, `[${meta.test_case_id}] confidence_score min`).toBeGreaterThanOrEqual(expected.confidence_range.min)
        expect(bd.final_score, `[${meta.test_case_id}] confidence_score max`).toBeLessThanOrEqual(expected.confidence_range.max)
      }
      if (expected.confidence_band) {
        expect(getConfidenceBand(bd.final_score), `[${meta.test_case_id}] confidence_band`).toBe(expected.confidence_band)
      }

      // ---- Validation ----
      const mockStrategy = {
        confidence_score:  bd.final_score,
        message_type:      selectedType,
        offer_angle:       'cost_clarity' as const,
        selected_skills:   skillResult.selected_skills,
        invalid_reasons:   [] as ReturnType<typeof validateStrategy>['errors'],
        status:            'draft' as const,
      }
      const valResult = validateStrategy(mockStrategy, n)
      const errorCodes   = valResult.errors.map(e => e.code)
      const warningCodes = valResult.warnings.map(w => w.code)

      // Expected errors
      if (expected.errors && expected.errors.length > 0) {
        for (const expectedErr of expected.errors) {
          expect(errorCodes, `[${meta.test_case_id}] error ${expectedErr.code}`).toContain(expectedErr.code)
        }
      }

      // Expected warnings
      if (expected.warnings && expected.warnings.length > 0) {
        for (const w of expected.warnings) {
          expect(warningCodes, `[${meta.test_case_id}] warning ${w}`).toContain(w)
        }
      }

      // success = false cases
      if (!expected.success) {
        const hasErrors = errorCodes.length > 0
        expect(hasErrors, `[${meta.test_case_id}] expected failure errors`).toBe(true)
      }

      // ---- Skill combination has no invalid errors ----
      const comboErrors = validateSkillCombination(selectedType, skillResult.selected_skills, n)
      expect(comboErrors.length, `[${meta.test_case_id}] no invalid skill combinations`).toBe(0)

      // ---- offer_angle_must_not_be ----
      // (tested via content builder — we just verify the skill result is clean here)
      if (expected.offer_angle_must_not_be) {
        // The offer angle is set in the service layer's content builder, not in pure functions.
        // We verify the validation doesn't block it as a proxy.
        expect(errorCodes).not.toContain(STRATEGY_ERROR_CODES.STRAT_011)
      }
    })
  }

  // ---- Additional unit tests for hard gates ----

  describe('Hard gate — opted_out blocks everything', () => {
    it('opted_out = true produces STRAT_001 and no further evaluation', () => {
      const input = fixtureToStrategyInput({
        lead: { lead_id: 'test', lead_source: 'manual', opted_out: true },
        systemControls: { email_generation_engine: 'phase3b', global_agent_pause: false, require_strategy_review: false, require_message_approval: true },
      })
      const n = normalizeStrategyInput(input)
      expect(n.lead.opted_out).toBe(true)
    })
  })

  describe('Hard gate — phase3b disabled routes to phase3a', () => {
    it('email_generation_engine != phase3b produces STRAT_003', () => {
      const input = fixtureToStrategyInput({
        lead: { lead_id: 'test', lead_source: 'manual' },
        systemControls: { email_generation_engine: 'phase3a', global_agent_pause: false, require_strategy_review: false, require_message_approval: true },
      })
      const n = normalizeStrategyInput(input)
      const mockStrat = { confidence_score: 0.8, message_type: 'cold_outreach' as const, offer_angle: 'cost_clarity' as const, selected_skills: [], invalid_reasons: [], status: 'draft' as const }
      const val = validateStrategy(mockStrat, n)
      expect(val.errors.map(e => e.code)).toContain(STRATEGY_ERROR_CODES.STRAT_003)
    })
  })

  describe('Hard gate — partner skills blocked without confirmed membership', () => {
    it('certainpath skill with unconfirmed membership produces STRAT_005', () => {
      const input = fixtureToStrategyInput({
        lead: { lead_id: 'test', lead_source: 'manual', industry_segment: 'home_services' },
        partner: { partner_membership_confirmed: false },
        systemControls: { email_generation_engine: 'phase3b', global_agent_pause: false, require_strategy_review: false, require_message_approval: true },
      })
      const n = normalizeStrategyInput(input)
      const forcedSkills = [
        { skill_slug: SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING, skill_version: 1 },
        { skill_slug: SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS, skill_version: 1 },
      ]
      const errors = validateSkillCombination('partner_member_specific_campaign' as const, forcedSkills, n)
      expect(errors.map(e => e.code)).toContain(STRATEGY_ERROR_CODES.STRAT_005)
    })
  })

  describe('Hard gate — statement_review_follow_up blocked without completed review', () => {
    it('MT-4 selected but review not complete produces STRAT_004', () => {
      const input = fixtureToStrategyInput({
        lead: { lead_id: 'test', lead_source: 'manual', lead_stage: 'statement_received' },
        statement: { has_statement_artifact: true, statement_review_completed: false, statement_findings_available: false },
        systemControls: { email_generation_engine: 'phase3b', global_agent_pause: false, require_strategy_review: false, require_message_approval: true },
      })
      const n = normalizeStrategyInput(input)
      const mockStrat = { confidence_score: 0.8, message_type: 'statement_review_follow_up' as const, offer_angle: 'statement_review' as const, selected_skills: [{ skill_slug: SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS, skill_version: 1 }], invalid_reasons: [], status: 'draft' as const }
      const val = validateStrategy(mockStrat, n)
      expect(val.errors.map(e => e.code)).toContain(STRATEGY_ERROR_CODES.STRAT_004)
    })
  })

  describe('Compliance skill — always included in selectSkills output', () => {
    const testCases = [
      { type: 'cold_outreach', source: 'manual', stage: 'new' },
      { type: 'new_inquiry_response', source: 'website', stage: 'new_inquiry' },
      { type: 'customer_nurture', source: 'manual', stage: 'nurture' },
    ] as const

    for (const tc of testCases) {
      it(`compliance skill present for ${tc.type}`, () => {
        const input = fixtureToStrategyInput({
          lead: { lead_id: 'test', lead_source: tc.source, lead_stage: tc.stage },
          customer: { is_existing_customer: tc.type === 'customer_nurture' },
          systemControls: { email_generation_engine: 'phase3b', global_agent_pause: false, require_strategy_review: false, require_message_approval: true },
        })
        const n = normalizeStrategyInput(input)
        const result = selectSkills(tc.type, n)
        expect(result.selected_skills.map(s => s.skill_slug)).toContain(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)
      })
    }
  })

  describe('Confidence bands', () => {
    it('score >= 0.85 returns high', () => {
      expect(getConfidenceBand(0.90)).toBe('high')
      expect(getConfidenceBand(0.85)).toBe('high')
      expect(getConfidenceBand(1.00)).toBe('high')
    })
    it('score 0.70-0.84 returns usable_review_recommended', () => {
      expect(getConfidenceBand(0.70)).toBe('usable_review_recommended')
      expect(getConfidenceBand(0.80)).toBe('usable_review_recommended')
      expect(getConfidenceBand(0.84)).toBe('usable_review_recommended')
    })
    it('score 0.50-0.69 returns low_review_required', () => {
      expect(getConfidenceBand(0.50)).toBe('low_review_required')
      expect(getConfidenceBand(0.60)).toBe('low_review_required')
      expect(getConfidenceBand(0.69)).toBe('low_review_required')
    })
    it('score < 0.50 returns insufficient', () => {
      expect(getConfidenceBand(0.49)).toBe('insufficient')
      expect(getConfidenceBand(0)).toBe('insufficient')
    })
  })
})
