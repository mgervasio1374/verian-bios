// ============================================================
// Phase 3B — Override Service
// Validates and applies human overrides to strategy objects.
// Enforces protected fields and hard guardrails.
// Does not persist — the calling service persists via repo.
// ============================================================

import {
  STRATEGY_ERROR_CODES,
  SKILL_SLUGS,
  MESSAGE_TYPES,
} from './message-strategy.types'
import { validateSkillCombination } from './message-strategy.skill-selector'
import type {
  MessageStrategy,
  StrategyOverrideRequest,
  StrategyOverrideLogEntry,
  StrategyError,
  NormalizedStrategyInput,
} from './message-strategy.types'

// ---- Protected fields that cannot be overridden ----

const PROTECTED_FIELDS = new Set<string>([
  'id',
  'lead_id',
  'tenant_id',
  'company_id',
  'agent_run_id',
  'created_by',
  'created_at',
  'updated_at',
  'has_statement_artifact',
  'statement_review_completed',
  'statement_findings_available',
  'partner_membership_confirmed',
  'opted_out',
  'confidence_score',
  'override_log',
  'invalid_reasons',
])

// ---- Fields that trigger copy regeneration when changed ----

const REGENERATION_FIELDS = new Set<string>([
  'message_type',
  'primary_goal',
  'offer_angle',
  'tone',
  'selected_skills',
  'cta',
  'required_inclusions',
  'avoid',
  'audience_context',
])

// ---- Apply override ----

export interface ApplyOverrideResult {
  patch:          Partial<MessageStrategy>
  logEntry:       StrategyOverrideLogEntry
  errors:         StrategyError[]
  regenerationRequired: boolean
}

export function applyOverride(
  strategy:  MessageStrategy,
  request:   StrategyOverrideRequest,
  n:         NormalizedStrategyInput
): ApplyOverrideResult {
  const errors: StrategyError[] = []
  const blockedFields: string[] = []
  const changedFields: string[] = []
  const patch: Partial<MessageStrategy> = {}

  if (!request.override_reason || request.override_reason.trim().length === 0) {
    errors.push({
      code:          STRATEGY_ERROR_CODES.STRAT_009,
      severity:      'high',
      message:       'Override reason is required but was not provided.',
      suggested_fix: 'Provide a non-empty override_reason before submitting an override.',
      can_override:  false,
      blocking:      true,
    })
    return {
      patch: {},
      logEntry: buildLogEntry(request, {}, [], blockedFields, false, false),
      errors,
      regenerationRequired: false,
    }
  }

  // ---- Check each editable field in the request ----

  const overrideMap: Array<{
    key:   keyof StrategyOverrideRequest
    field: keyof MessageStrategy
  }> = [
    { key: 'message_type',          field: 'message_type' },
    { key: 'primary_goal',          field: 'primary_goal' },
    { key: 'secondary_goal',        field: 'secondary_goal' },
    { key: 'audience_context',      field: 'audience_context' },
    { key: 'pain_point_hypothesis', field: 'pain_point_hypothesis' },
    { key: 'offer_angle',           field: 'offer_angle' },
    { key: 'trust_angle',           field: 'trust_angle' },
    { key: 'proof_point',           field: 'proof_point' },
    { key: 'cta',                   field: 'cta' },
    { key: 'tone',                  field: 'tone' },
    { key: 'length_target',         field: 'length_target' },
    { key: 'personalization_level', field: 'personalization_level' },
    { key: 'selected_skills',       field: 'selected_skills' },
    { key: 'required_inclusions',   field: 'required_inclusions' },
    { key: 'avoid',                 field: 'avoid' },
  ]

  for (const { key, field } of overrideMap) {
    if (!(key in request) || request[key] === undefined) continue

    const newVal = request[key as keyof StrategyOverrideRequest]

    // Check protected
    if (PROTECTED_FIELDS.has(field)) {
      blockedFields.push(field)
      continue
    }

    // ---- Guardrail checks for specific fields ----

    if (field === 'message_type' && newVal !== strategy.message_type) {
      const guardErr = checkMessageTypeGuardrail(newVal as string, n)
      if (guardErr) {
        errors.push(guardErr)
        continue
      }
    }

    if (field === 'offer_angle' && newVal === 'confirmed_savings_review') {
      if (n.statement.calculated_savings_amount == null) {
        errors.push({
          code:          STRATEGY_ERROR_CODES.STRAT_011,
          severity:      'critical',
          message:       "Cannot set offer_angle to 'confirmed_savings_review' without calculated savings data.",
          suggested_fix: "Change to 'savings_review' or complete a review with calculated findings.",
          can_override:  false,
          blocking:      true,
          affected_field:'offer_angle',
        })
        continue
      }
    }

    if (field === 'selected_skills' && Array.isArray(newVal)) {
      // Validate new skill combination
      const messageType = (patch.message_type ?? strategy.message_type) as MessageStrategy['message_type']
      const comboErrors = validateSkillCombination(messageType, newVal as MessageStrategy['selected_skills'], n)
      if (comboErrors.length > 0) {
        errors.push(...comboErrors)
        continue  // reject entire override if skills conflict
      }
      // Compliance skill must always be present
      const hasCFClaims = (newVal as MessageStrategy['selected_skills']).some(
        s => s.skill_slug === SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS
      )
      if (!hasCFClaims) {
        errors.push({
          code:          STRATEGY_ERROR_CODES.STRAT_008,
          severity:      'critical',
          message:       'compliance_forbidden_claims must remain in selected_skills.',
          suggested_fix: 'Add compliance_forbidden_claims back to the skill list.',
          can_override:  false,
          blocking:      true,
        })
        continue
      }
    }

    if (field === 'tone') {
      // Check for co-primary tone conflict with existing selection
      const existingSkills = patch.selected_skills ?? strategy.selected_skills ?? []
      const hasWarm  = existingSkills.some(s => s.skill_slug === SKILL_SLUGS.WARM_CONVERSATIONAL)
      const hasBrief = existingSkills.some(s => s.skill_slug === SKILL_SLUGS.EXECUTIVE_BREVITY)
      if ((newVal === 'warm_conversational' && hasBrief) || (newVal === 'executive_brevity' && hasWarm)) {
        // This is a warning, not a hard block — allow but note
      }
    }

    patch[field as keyof MessageStrategy] = newVal as never
    changedFields.push(field)
  }

  // If any errors exist, reject the entire override (no partial updates)
  if (errors.length > 0) {
    return {
      patch: {},
      logEntry: buildLogEntry(request, {}, changedFields, blockedFields, false, false),
      errors,
      regenerationRequired: false,
    }
  }

  const regenerationRequired = changedFields.some(f => REGENERATION_FIELDS.has(f))

  // Always force review after override
  patch.requires_human_review = true
  patch.status = 'draft'

  const logEntry = buildLogEntry(request, patch, changedFields, blockedFields, regenerationRequired, blockedFields.length > 0)

  return { patch, logEntry, errors: [], regenerationRequired }
}

// ---- Guardrail checks for message_type override ----

function checkMessageTypeGuardrail(
  newType: string,
  n:       NormalizedStrategyInput
): StrategyError | null {
  if (newType === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP && !n.statement.statement_review_completed) {
    return {
      code:          STRATEGY_ERROR_CODES.STRAT_004,
      severity:      'critical',
      message:       'Cannot override message_type to statement_review_follow_up — statement review is not complete.',
      suggested_fix: 'Complete the statement review first.',
      can_override:  false,
      blocking:      true,
      affected_field:'message_type',
    }
  }
  if (newType === MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION && !n.statement.has_statement_artifact) {
    return {
      code:          STRATEGY_ERROR_CODES.STRAT_004C,
      severity:      'critical',
      message:       'Cannot override message_type to statement_submitted_confirmation — no statement artifact.',
      suggested_fix: 'Wait for statement receipt first.',
      can_override:  false,
      blocking:      true,
      affected_field:'message_type',
    }
  }
  if (newType === MESSAGE_TYPES.PROPOSAL_FOLLOW_UP && !n.proposal.proposal_sent) {
    return {
      code:          STRATEGY_ERROR_CODES.STRAT_006,
      severity:      'critical',
      message:       'Cannot override message_type to proposal_follow_up — no proposal has been sent.',
      suggested_fix: 'Send a proposal first.',
      can_override:  false,
      blocking:      true,
      affected_field:'message_type',
    }
  }
  if (newType === MESSAGE_TYPES.CUSTOMER_NURTURE && !n.customer.is_existing_customer) {
    return {
      code:          STRATEGY_ERROR_CODES.STRAT_007,
      severity:      'critical',
      message:       'Cannot override message_type to customer_nurture — lead is not an existing customer.',
      suggested_fix: 'Use a prospect-appropriate message type.',
      can_override:  false,
      blocking:      true,
      affected_field:'message_type',
    }
  }
  if (newType === MESSAGE_TYPES.REFERRAL_REQUEST &&
      !n.customer.is_existing_customer &&
      !(n.statement.has_statement_artifact && n.statement.statement_review_completed)) {
    return {
      code:          STRATEGY_ERROR_CODES.STRAT_010,
      severity:      'critical',
      message:       'Cannot override message_type to referral_request — no existing relationship or delivered value.',
      suggested_fix: 'Build a relationship first.',
      can_override:  false,
      blocking:      true,
      affected_field:'message_type',
    }
  }
  return null
}

// ---- Build log entry ----

function buildLogEntry(
  request:              StrategyOverrideRequest,
  patch:                Partial<MessageStrategy>,
  changedFields:        string[],
  blockedFields:        string[],
  regenerationRequired: boolean,
  guardrailBlocked:     boolean
): StrategyOverrideLogEntry {
  return {
    overridden_by:           request.overriding_user_id,
    overridden_at:           new Date().toISOString(),
    original_value:          null,  // not tracked field-by-field in this log entry
    new_value:               patch,
    override_reason:         request.override_reason,
    affected_fields:         changedFields,
    confidence_impact:       changedFields.some(f =>
      ['message_type', 'selected_skills', 'offer_angle', 'tone'].includes(f)
    ),
    regeneration_required:   regenerationRequired,
    guardrail_blocked:       guardrailBlocked || blockedFields.length > 0,
    guardrail_blocked_fields:blockedFields.length > 0 ? blockedFields : undefined,
  }
}
