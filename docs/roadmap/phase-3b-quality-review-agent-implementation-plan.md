# Phase 3B Quality Review Agent — Implementation Plan v1.0

**Document version:** 1.0
**Status:** Locked
**Created:** 2026-05-19
**Source design:** `docs/roadmap/phase-3b-quality-review-agent-design-test-cases.md` (locked v1.0)
**Next document:** Phase 3B Quality Review Agent — Code Implementation (after approval)

---

## Recovery Anchor

**Current phase:** Phase 3B — Revenue Learning Engine. Foundation agents complete and QA-verified.

**Implemented agents:**
- Message Strategy Agent — complete, tagged, 41 tests passing
- Copywriting Agent — complete, tagged, 100 tests passing
- Quality Review Agent — design document locked, this plan is the implementation specification

**Git state:** Latest HEAD should be confirmed with `git log` before implementation begins. The implementation plan does not depend on a specific HEAD SHA. Working tree should be confirmed clean before starting implementation.

**Active guardrails:** No external LLMs in v1. No sending. No approval. No copy rewriting. No email_drafts. No approval_requests. Phase 3A locked. Quality Review Agent is evaluation-only.

---

## 1. Executive Summary

This document is the engineering-ready implementation plan for the Phase 3B Quality Review Agent — the third agent in the Verian Revenue Learning Engine pipeline.

The Quality Review Agent consumes `message_strategy` and `message_version` records that have already been produced by the Message Strategy Agent and Copywriting Agent respectively. It evaluates each version independently across eight deterministic scoring dimensions, detects risk flags, calculates a composite score with penalty caps, ranks versions, assigns a recommendation, generates human-readable reasoning, and persists one `quality_review` record per evaluated version.

This implementation phase delivers:
- The `quality_reviews` database table
- The Quality Review Agent service, scoring, and evaluation modules
- The quality review repository and server actions
- 35 Vitest test fixtures and a test suite
- UI integration to display quality scores in the Message Workspace

This implementation phase does **not** deliver:
- Human approval workflow integration (future scope)
- Sending capability (future scope)
- Learning Agent (future scope)
- Event outcome tracking (future scope)
- LLM-assisted scoring (future scope)
- Skill auto-updates (future scope)

The Quality Review Agent is evaluation-only. It produces advisory signals. It does not approve, send, rewrite, or learn.

---

## 2. Implementation Scope

The following components are in scope for this implementation:

| Component | Description |
|-----------|-------------|
| `quality_reviews` migration | Database table, indexes, RLS, trigger |
| `quality-review-agent.types.ts` | All types, error codes, constants, interfaces |
| `quality-review.repo.ts` | Repository: insert, fetch, list, supersede |
| `quality-review-agent.scoring.ts` | 8 pure dimension scoring functions |
| `quality-review-agent.risk-flags.ts` | Pure risk flag detector, RFL-001 through RFL-025 |
| `quality-review-agent.composite.ts` | Composite score calculator, penalty caps, band assignment |
| `quality-review-agent.ranking.ts` | Version ranking with all tie-breaker rules |
| `quality-review-agent.reasoning.ts` | Reasoning generator, notes, comparison summary |
| `quality-review-agent.validation.ts` | Invalid condition checker, QRA_001–QRA_013 |
| `quality-review-agent.message-type-rules.ts` | Per-message-type rule application |
| `quality-review-agent.service.ts` | 12-step orchestration service |
| `quality-review-agent.actions.ts` | Server actions for UI |
| `modules/intelligence/types.agent.ts` | Add `quality_review_agent` agent type and activity events (additive only) |
| `GeneratedVersionsPanel.tsx` | Extended to display QRA output |
| `tests/fixtures/quality-review-agent/` | TC-QRA-001.json through TC-QRA-035.json |
| `tests/quality-review-agent.test.ts` | Vitest test suite |

---

## 3. Non-Goals

The following must not be built in this implementation phase. Any pull toward these behaviors should be treated as a guardrail violation.

| Non-Goal | Reason |
|----------|--------|
| Sending messages | Human approval and sending are downstream of all agents |
| Creating `email_drafts` | Not in v1 scope |
| Creating `approval_requests` | Not in v1 scope |
| Human approval workflow bridge | Future scope |
| Learning Agent | Not designed yet |
| Event outcome tracking | Future scope |
| External LLM calls | Scoring must be deterministic in v1 |
| Modifying `message_strategy` records | QRA reads strategy, never writes it |
| Modifying `message_version` content | QRA reads versions, never modifies them |
| Setting `approval_status` on versions | That belongs to human selection actions |
| Writing `body_html` | Still null in v1 |
| Rewriting or improving copy | Advisory reasoning only |
| Autonomous skill updates | Future scope |
| Campaign performance analytics | Future scope |

---

## 4. Proposed Module/File Structure

All new files follow the existing project's module structure under `modules/messaging/`.

```
modules/
  messaging/
    quality-review/
      quality-review-agent.types.ts
        All types, interfaces, error codes, warning codes,
        score band constants, risk flag severity constants,
        QRA-owned pattern constant arrays (banned phrases,
        urgency phrases, guarantee phrases, inbound/cold
        language patterns, partner claim patterns), and the
        QualityReviewResult discriminated union.

      quality-review-agent.scoring.ts
        8 pure dimension scoring functions.
        No I/O. No side effects. Testable in isolation.
        Imports: quality-review-agent.types.ts only.

      quality-review-agent.risk-flags.ts
        Pure risk flag detector function.
        detectRiskFlags(strategy, version, siblings, prior): RiskFlagResult
        All 25 risk flag checks (RFL-001 through RFL-025).
        No I/O. No side effects.

      quality-review-agent.composite.ts
        Pure composite score calculator.
        calculateCompositeScore(scoreBreakdown, riskFlags): CompositeScoreResult
        Score band assignment.
        Risk penalty application.

      quality-review-agent.ranking.ts
        Pure version ranking function.
        rankQualityReviews(scoredDrafts): RankingResult
        All tie-breaker rules.
        assignRecommendation(ranked): RecommendationResult

      quality-review-agent.reasoning.ts
        Pure reasoning generator functions.
        generateScoringReasoning(version, scores, flags): ScoringReasoning
        generateHumanReviewNotes(review): string
        generateComparisonSummary(review, siblings): string
        generateRecommendedEdits(review): string[]
        generateStrengths(scores, flags): string[]
        generateWeaknesses(scores, flags): string[]

      quality-review-agent.validation.ts
        Pure invalid condition checker.
        validateQualityReviewInputs(strategy, versions, controls): QualityReviewError[]
        checkVersionEligibility(version, strategy): QualityReviewError | null
        All QRA_001 through QRA_013 checks.

      quality-review-agent.message-type-rules.ts
        Pure message type rule applier.
        applyMessageTypeReviewRules(strategy, version, scores): MessageTypeRuleResult
        Rules for all 12 message types.

      quality-review-agent.service.ts
        12-step orchestration service.
        Owns all I/O: DB reads, agent run logging, DB writes.
        Calls all pure functions above.
        Returns QualityReviewResult.

  messaging/
    repositories/
      quality-review.repo.ts
        DB read/write operations for quality_reviews table.
        insertQualityReview(input): Promise<QualityReview>
        insertManyQualityReviews(inputs[]): Promise<QualityReview[]>
        getQualityReviewById(id, tenantId): Promise<QualityReview | null>
        listByStrategy(strategyId, tenantId): Promise<QualityReview[]>
        listByVersion(versionId, tenantId): Promise<QualityReview[]>
        getRecommendedForStrategy(strategyId, tenantId): Promise<QualityReview | null>
        supersedeForStrategy(strategyId, tenantId): Promise<void>
        qualityReviewExistsForVersion(versionId, tenantId): Promise<boolean>

  messaging/
    actions/
      quality-review-agent.actions.ts
        'use server' server actions.
        runQualityReviewAction(strategyId)
        getQualityReviewsAction(strategyId)
        getRecommendedVersionReviewAction(strategyId)
        canRunQualityReviewAction(strategyId)

app/
  (workspace)/
    [workspaceSlug]/
      message-workspace/
        [leadId]/
          GeneratedVersionsPanel.tsx
            Extended (existing file). Adds quality score display
            when quality_review records exist. Run Quality Review
            button. Score cards, recommended badge, risk flags,
            strengths/weaknesses, reasoning panel.

supabase/
  migrations/
    20240024_phase3b_quality_reviews.sql
      Creates quality_reviews table, indexes, RLS, trigger.

tests/
  quality-review-agent.test.ts
    Vitest test suite. 35 QRA tests + 141 existing tests.

  fixtures/
    quality-review-agent/
      TC-QRA-001.json through TC-QRA-035.json
```

### File Responsibility Rules

- All pure function files (`scoring`, `risk-flags`, `composite`, `ranking`, `reasoning`, `validation`, `message-type-rules`) have zero I/O and zero side effects.
- Only `service.ts` performs I/O: database reads, agent run logging, database writes.
- Only `repo.ts` touches the database.
- Only `actions.ts` uses `'use server'` and calls service functions.
- `types.ts` has no runtime dependencies outside built-in types and owns its own pattern constant arrays.
- Do not modify Message Strategy Agent files.
- Do not modify Copywriting Agent files.

---

## 5. Database Schema Requirements

### Table: `quality_reviews`

| Field | Conceptual Type | Nullable | Indexed | Immutable | Purpose |
|-------|----------------|----------|---------|-----------|---------|
| `id` | uuid | No | PK | Yes | Primary identifier |
| `tenant_id` | uuid | No | Yes (composite) | Yes | Tenant isolation |
| `strategy_id` | uuid | No | Yes (composite) | Yes | FK → message_strategies.id |
| `version_id` | uuid | No | Yes (composite) | Yes | FK → message_versions.id |
| `lead_id` | uuid | No | No | Yes | FK → leads.id |
| `company_id` | uuid | Yes | No | Yes | FK → companies.id |
| `campaign_id` | uuid | Yes | No | Yes | No FK if campaigns table absent |
| `agent_run_id` | uuid | Yes | Yes | Yes | FK → agent_runs.id |
| `message_type` | text | No | No | Yes | Copied from strategy at review time |
| `version_label` | text | No | No | Yes | A, B, C, D |
| `strategy_angle` | text | No | No | Yes | From message_version |
| `composite_score` | integer | No | No | No | 0–100; may be annotated by human |
| `score_band` | text | No | Yes | No | excellent/strong/usable/needs_review/do_not_use |
| `rank_position` | integer | No | Yes (composite) | No | 1-based within strategy run |
| `is_recommended` | boolean | No | Yes (composite) | No | At most one per strategy run |
| `strategic_fit_score` | integer | No | No | Yes | 0–100 |
| `compliance_confidence_score` | integer | No | No | Yes | 0–100 |
| `cta_clarity_score` | integer | No | No | Yes | 0–100 |
| `specificity_score` | integer | No | No | Yes | 0–100 |
| `tone_fit_score` | integer | No | No | Yes | 0–100 |
| `differentiation_score` | integer | No | No | Yes | 0–100 |
| `subject_body_consistency_score` | integer | No | No | Yes | 0–100 |
| `readability_score` | integer | No | No | Yes | 0–100 |
| `risk_score` | integer | No | No | Yes | 0–100; lower is better |
| `score_breakdown` | jsonb | No | No | Yes | Full dimension score object |
| `scoring_reasoning` | jsonb | No | No | Yes | Per-dimension human-readable explanations |
| `strengths` | text array | No | No | Yes | Observed strengths |
| `weaknesses` | text array | No | No | Yes | Observed weaknesses |
| `risk_flags` | jsonb | No | No | Yes | Array of RiskFlag objects |
| `compliance_flags` | jsonb | No | No | Yes | Compliance-specific RiskFlag subset |
| `human_review_notes` | text | Yes | No | Yes | Human-facing summary paragraph |
| `recommended_edits` | text array | No | No | Yes | Advisory edit suggestions |
| `compared_against_version_ids` | uuid array | No | No | Yes | Sibling version IDs in this run |
| `comparison_summary` | text | No | No | No | Cross-version comparison narrative |
| `superseded_at` | timestamptz | Yes | No | No | Set when a newer review run supersedes this one |
| `created_by_agent` | text | No | No | Yes | Always `quality_review_agent` |
| `created_at` | timestamptz | No | No | Yes | Auto-set on insert |
| `updated_at` | timestamptz | No | No | No | Auto-updated via trigger |

### Recommended Indexes

```
PRIMARY KEY: id
INDEX: (tenant_id, strategy_id)
INDEX: (tenant_id, version_id)
INDEX: (tenant_id, is_recommended)
INDEX: (tenant_id, score_band)
INDEX: (strategy_id, rank_position)
INDEX: (agent_run_id)
```

### Foreign Keys

- `tenant_id` → `tenants.id`
- `strategy_id` → `message_strategies.id`
- `version_id` → `message_versions.id`
- `lead_id` → `leads.id`
- `company_id` → `companies.id` (nullable, ON DELETE SET NULL)
- `agent_run_id` → `agent_runs.id` (nullable)
- `campaign_id` → no FK unless campaigns table confirmed

### RLS Policy

Enable row-level security on `quality_reviews`. Read policy: `tenant_id = public.current_tenant_id()`. All writes via service role through the repository. No unauthenticated access.

### Trigger

Use the shared `update_updated_at()` trigger function. Do not create a new custom trigger function.

---

## 6. Type Contracts and Interfaces

All interfaces are defined in `quality-review-agent.types.ts`. Descriptions below use TypeScript-style notation for clarity. The coding agent should translate these into valid TypeScript.

---

### QualityReviewInput

**Purpose:** Top-level input to `runQualityReview`. Bundles all data the service needs to begin.

```
{
  strategyId: string           // required
  tenantId: string             // required
  options?: {
    force?: boolean            // re-run even if reviews already exist
    excludeVersionIds?: string[] // skip specific versions
  }
}
```

---

### QualityReviewStrategyInput

**Purpose:** The resolved strategy record, normalized for use by scoring modules.

```
{
  id: string
  tenantId: string
  leadId: string
  companyId: string | null
  campaignId: string | null
  messageType: MessageType
  primaryGoal: string | null
  secondaryGoal: string | null
  sequencePosition: number | null
  daysSinceLastContact: number | null
  leadSource: string | null
  leadStage: string | null
  leadScore: number | null
  leadUrgencyScore: number | null
  industrySegment: string | null
  processingVolumeTier: string | null
  hasStatementArtifact: boolean
  priorTouchCount: number
  lastEngagementSignal: string | null
  partnerMembership: PartnerMembership | null
  audienceContext: string | null
  painPointHypothesis: string | null
  offerAngle: string | null
  trustAngle: string | null
  proofPoint: string | null
  cta: string | null
  tone: ToneType | null
  lengthTarget: string | null
  personalizationLevel: string | null
  complianceNotes: string | null
  requiredInclusions: string[]
  avoid: string[]
  selectedSkills: string[]
  skillReasoning: string | null
  confidenceScore: number | null
  reasoning: string | null
  requiresHumanReview: boolean
  status: string
  invalidReasons: string[]
}
```

---

### QualityReviewVersionInput

**Purpose:** A single version record, normalized for scoring evaluation.

```
{
  id: string
  strategyId: string
  tenantId: string
  subjectLine: string
  previewText: string | null
  bodyText: string
  bodyHtml: string | null                        // must be null; non-null triggers QRA_008
  messageType: MessageType
  versionLabel: string
  versionNumber: number
  strategyAngle: string
  selectedSkills: string[]
  skillVersions: Record<string, number>
  compliancePassed: boolean                      // see note below
  complianceErrors: string[]
  complianceNotesApplied: string | null
  structuralPassed: boolean                      // see note below
  requiredInclusionsSatisfied: string[]
  avoidedElementsChecked: string[]
  generationNotes: string | null
  copyConstraints: string | null
  personalizationUsed: string[]
  personalizationGaps: string[]
  differentiationProfile: DifferentiationProfile  // existing type from CA
  approvalStatus: string
  createdByAgent: string
}

// Note on compliancePassed and structuralPassed:
// The Copywriting Agent may not persist explicit compliance_passed or
// structural_passed columns on message_versions. If these explicit columns do
// not exist, the coding agent must derive these values from available
// validation metadata: compliance_notes_applied, required_inclusions_satisfied,
// avoided_elements_checked, generation_notes, copy_constraints, and any
// persisted validation result fields. Confirm the actual message_versions
// schema before assuming column names.
```

---

### QualityReviewSkillDefinition

**Purpose:** Skill definition subset needed for scoring evaluation.

```
{
  slug: string
  version: number
  toneRules: string[]
  messagingRules: string[]
  requiredElements: string[]
  forbiddenElements: string[]
  ctaGuidance: string[]
  antiPatterns: string[]
  complianceNotes: string[]
}
```

---

### PriorMessageReviewContext

**Purpose:** Optional prior message history for sequence fatigue and differentiation checks.

```
{
  priorSubjectLines: string[]
  priorBodySummaries: string[]
  priorCtaStrings: string[]
  priorStrategyAngles: string[]
  priorEngagementSignal: string | null
}
```

---

### QualityReviewSystemControls

**Purpose:** Gate conditions from system_controls table.

```
{
  emailGenerationEngine: string | null
  globalAgentPause: boolean
  requireMessageApproval: boolean
  requireStrategyReview: boolean
}
```

---

### ScoreBreakdown

**Purpose:** Raw dimension score object stored in `quality_reviews.score_breakdown`.

```
{
  strategicFit: number
  complianceConfidence: number
  ctaClarity: number
  specificity: number
  toneFit: number
  differentiation: number
  subjectBodyConsistency: number
  readability: number
}
```

---

### ScoringReasoning

**Purpose:** Per-dimension explanation object stored in `quality_reviews.scoring_reasoning`.

```
{
  strategicFit: string
  complianceConfidence: string
  ctaClarity: string
  specificity: string
  toneFit: string
  differentiation: string
  subjectBodyConsistency: string
  readability: string
}
```

---

### DimensionScoreResult

**Purpose:** Return type for each individual scoring function.

```
{
  score: number                       // 0–100
  reasoning: string                   // human-readable explanation of this score
  suggestedFlags: RiskFlagCode[]      // risk flags this scorer detected or suggests
}
```

---

### RiskFlag

**Purpose:** A single risk flag object, stored in `quality_reviews.risk_flags` array.

```
{
  code: RiskFlagCode                  // RFL-001 through RFL-025
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string                     // human-readable explanation
  triggeredBy: string                 // what pattern or condition triggered it
}
```

---

### RiskFlagResult

**Purpose:** Return type of `detectRiskFlags`.

```
{
  flags: RiskFlag[]
  complianceFlags: RiskFlag[]         // subset of flags that are compliance-related
  riskScore: number                   // 0–100, lower is better
}
```

---

### CompositeScoreResult

**Purpose:** Return type of `calculateCompositeScore`.

```
{
  compositeScore: number              // post-penalty integer 0–100
  prePenaltyScore: number             // weighted float before penalty
  scoreBand: ScoreBand
  penaltyApplied: 'none' | 'critical_cap' | 'high_cap' | 'medium_subtract' | 'low_subtract'
  penaltyAmount: number
}
```

---

### QualityReviewDraft

**Purpose:** An in-memory draft of a quality_review before persistence. Contains all computed fields, ready for insertion.

```
{
  versionId: string
  strategyId: string
  tenantId: string
  leadId: string
  companyId: string | null
  campaignId: string | null
  agentRunId: string
  messageType: MessageType
  versionLabel: string
  strategyAngle: string
  compositeScore: number
  scoreBand: ScoreBand
  rankPosition: number                // set during ranking pass
  isRecommended: boolean              // set during recommendation pass
  strategicFitScore: number
  complianceConfidenceScore: number
  ctaClarityScore: number
  specificityScore: number
  toneFitScore: number
  differentiationScore: number
  subjectBodyConsistencyScore: number
  readabilityScore: number
  riskScore: number
  scoreBreakdown: ScoreBreakdown
  scoringReasoning: ScoringReasoning
  strengths: string[]
  weaknesses: string[]
  riskFlags: RiskFlag[]
  complianceFlags: RiskFlag[]
  humanReviewNotes: string | null
  recommendedEdits: string[]
  comparedAgainstVersionIds: string[]
  comparisonSummary: string
  createdByAgent: 'quality_review_agent'
}
```

---

### QualityReviewResult

**Purpose:** Discriminated union returned by `runQualityReview`.

```
| { success: true; reviews: QualityReview[]; recommended: QualityReview | null; agentRunId: string }
| { success: false; error: QualityReviewError; agentRunId: string | null }
| { success: 'partial'; reviews: QualityReview[]; excluded: ExcludedVersion[]; recommended: QualityReview | null; agentRunId: string }
```

Where `ExcludedVersion = { versionId: string; reason: QualityReviewErrorCode }`.

---

### QualityReviewError

**Purpose:** Structured error object for gate failures.

```
{
  code: QualityReviewErrorCode        // QRA_001 through QRA_013
  message: string
  blocking: boolean
  suggestedFix: string
}
```

---

### MessageTypeRuleResult

**Purpose:** Return type of `applyMessageTypeReviewRules`.

```
{
  adjustedScores: Partial<ScoreBreakdown>    // deltas to apply, not replacements
  suggestedFlags: RiskFlagCode[]
  reviewNotes: string[]
}
```

---

### RankingResult

**Purpose:** Return type of `rankQualityReviews`.

```
{
  ranked: Array<{ draft: QualityReviewDraft; rankPosition: number }>
  tieBreakersApplied: string[]
}
```

---

### RecommendationResult

**Purpose:** Return type of `assignRecommendation`.

```
{
  recommendedVersionId: string | null
  noRecommendationReason: string | null
}
```

---

## 7. Service Boundary Design

All public service functions live in `quality-review-agent.service.ts`. They are the only entry points to Quality Review Agent logic.

---

### `runQualityReview(strategyId, tenantId, options?)`

**Purpose:** Main orchestrator. Creates quality_review records for all reviewable versions under a strategy.

**Inputs:** `strategyId: string`, `tenantId: string`, `options?: { force?: boolean, excludeVersionIds?: string[] }`

**Outputs:** `Promise<QualityReviewResult>`

**Side effects:** Reads from DB (strategy, versions, system_controls, skill_definitions), writes quality_review records, writes agent_run trace steps.

**Behavior:**
1. Create agent_run record
2. Load strategy — fail with QRA_001 if not found
3. Load versions — fail with QRA_002 if none found
4. Run gate checks — fail with appropriate QRA error code
5. Exclude ineligible versions (QRA_003, QRA_005, QRA_006, QRA_007, QRA_008, QRA_012, QRA_013)
6. If all versions excluded: return `success: false` (QRA_002)
7. If some versions excluded: return `success: 'partial'`
8. Load skill definitions for selected skills
9. Load prior context if available
10. Score, flag, composite-score, rank, assign recommendation
11. Generate reasoning for each draft
12. Persist all quality_review rows
13. Complete agent_run
14. Return `success: true` or `success: 'partial'`

**Error behavior:** If gate check returns a blocking error (QRA_001, QRA_002, QRA_004, QRA_009, QRA_010, QRA_011), complete agent_run as failed and return `success: false`. If only non-blocking errors (QRA_003, QRA_005–QRA_008, QRA_012, QRA_013), exclude those versions and return `success: 'partial'`.

---

### `getQualityReview(reviewId, tenantId)`

**Purpose:** Fetch a single quality_review record.

**Inputs:** `reviewId: string`, `tenantId: string`

**Outputs:** `Promise<QualityReview | null>`

---

### `listQualityReviewsForStrategy(strategyId, tenantId)`

**Purpose:** Fetch all quality_review records for a strategy, ordered by rank_position ascending.

**Inputs:** `strategyId: string`, `tenantId: string`

**Outputs:** `Promise<QualityReview[]>`

---

### `listQualityReviewsForVersion(versionId, tenantId)`

**Purpose:** Fetch quality_review records for a specific message_version.

**Inputs:** `versionId: string`, `tenantId: string`

**Outputs:** `Promise<QualityReview[]>`

---

### `getRecommendedVersionForStrategy(strategyId, tenantId)`

**Purpose:** Fetch the single quality_review record where `is_recommended = true` for a strategy.

**Inputs:** `strategyId: string`, `tenantId: string`

**Outputs:** `Promise<QualityReview | null>`

---

### `supersedeQualityReviewsForStrategy(strategyId, tenantId)`

**Purpose:** Mark existing quality_review records as superseded when a new review run is triggered with `force = true`. Sets `superseded_at` timestamp. Does not delete records — retained for audit trail.

**Inputs:** `strategyId: string`, `tenantId: string`

**Outputs:** `Promise<void>`

---

### `canRunQualityReview(strategyId, tenantId)`

**Purpose:** Gate check only — does not run the review. Used by the UI to determine whether the Run Quality Review button should be enabled.

**Inputs:** `strategyId: string`, `tenantId: string`

**Outputs:** `Promise<{ canRun: boolean; reason: string | null }>`

**Side effects:** Read from DB only. No writes.

---

## 8. Agent Run and Trace Structure

### Agent Type

Register `quality_review_agent` in `modules/intelligence/types.agent.ts`:
- Add to the agent type constant
- Add `QUALITY_REVIEW_COMPLETED` to `ActivityEventType`
- Add `QUALITY_REVIEW_NO_RECOMMENDATION` to `ActivityEventType`

These additions are additive only. Do not rename, remove, or change any existing agent type constants or `ActivityEventType` entries when making these additions.

### Agent Run Steps (12 Steps)

| Step | Name | Input Snapshot | Output Snapshot | Success | Failure |
|------|------|---------------|-----------------|---------|---------|
| 1 | `load_strategy` | `{ strategyId, tenantId }` | Strategy ID + status | Strategy found | QRA_001 |
| 2 | `load_versions` | `{ strategyId }` | Version count | ≥ 1 found | QRA_002 |
| 3 | `gate_check` | `{ systemControls, strategy.invalid_reasons }` | Gate status + QRA codes | All blocking gates pass | Blocking QRA error |
| 4 | `load_skill_definitions` | `{ selectedSkills }` | Skill slugs loaded | All skills resolved | Warning if skill missing |
| 5 | `load_prior_context` | `{ leadId }` | Prior touch count, angle count | Loaded or null | Non-blocking — continue |
| 6 | `score_versions` | `{ versionCount }` | Dimension score summary per version | All eligible versions scored | Individual version excluded |
| 7 | `generate_risk_flags` | `{ versionCount }` | Risk flag count + severity summary | Flags generated | Non-blocking |
| 8 | `calculate_composite_scores` | `{ versionCount }` | Score band distribution | Composites calculated | Non-blocking |
| 9 | `rank_versions` | `{ versionCount }` | Rank assignments | All ranked | Non-blocking |
| 10 | `generate_reasoning` | `{ versionCount }` | Reasoning generated | All reasoning complete | Non-blocking |
| 11 | `persistence` | `{ qualityReviewCount }` | Insert count | All rows inserted | DB error |
| 12 | `result_returned` | `{ success, recommended }` | Result type | Complete | N/A |

### What NOT to Log in Snapshots

- Do not log `body_text` or `subject_line` content in agent run step snapshots.
- Do not log `scoring_reasoning` text in step snapshots.
- Do not log `human_review_notes` in step snapshots.
- Log only counts, IDs, status codes, and score summaries.

---

## 9. Quality Review Flow

The following is the exact execution sequence inside `runQualityReview`.

**Step 1 — Receive input:** Accept `strategyId`, `tenantId`, and optional `options`.

**Step 2 — Create agent_run:** Insert an agent_run record for `quality_review_agent`. Capture `agent_run_id` for use throughout.

**Step 3 — Load message_strategy:** Fetch strategy by `strategyId` + `tenantId`. If not found: log step failure, return `{ success: false, error: QRA_001 }`.

**Step 4 — Load message_versions:** Fetch all versions where `strategy_id = strategyId` and `tenant_id = tenantId`. If empty: log step failure, return `{ success: false, error: QRA_002 }`.

**Step 5 — Exclude superseded versions:** Remove any version where `approval_status = 'superseded'`. Log as QRA_005 for each excluded version.

**Step 6 — Validate tenant and strategy consistency:** For each remaining version, verify `version.strategy_id = strategyId` (QRA_003) and `version.tenant_id = tenantId` (QRA_004). QRA_004 is blocking (full abort). QRA_003 excludes the version.

**Step 7 — Check system controls:** Load system_controls for tenant. If `global_agent_pause = true`: abort with QRA_010. If `email_generation_engine ≠ 'phase3b'`: abort with QRA_011.

**Step 8 — Check strategy validity:** If `strategy.invalid_reasons` is non-empty: abort with QRA_009.

**Step 9 — Check version validity per version:** For each remaining version, check:
- `body_text` is non-empty (QRA_006, version excluded)
- `subject_line` is non-empty (QRA_007, version excluded)
- `body_html` is null (QRA_008, version excluded)
- Compliance and structural validation passed (QRA_012, version excluded) — see Section 14 for derivation note
- No existing quality_review for this version from a non-superseded run (QRA_013, version excluded) unless `options.force = true`

After all exclusions: if no eligible versions remain, return `{ success: false, error: QRA_002 }`.

**Step 10 — Load skill definitions:** For each skill slug in `strategy.selected_skills`, load the skill definition. If a skill is missing, log a warning and continue with available definitions.

**Step 11 — Load prior context:** Attempt to load prior sent messages for this lead. Build `PriorMessageReviewContext`. If not available, set to null — non-blocking.

**Step 12 — Score each version across dimensions:** For each eligible version, call all 8 scoring functions:
```
scoreStrategicFit        → DimensionScoreResult
scoreComplianceConfidence → DimensionScoreResult
scoreCTAClarity          → DimensionScoreResult
scoreSpecificity         → DimensionScoreResult
scoreToneFit             → DimensionScoreResult
scoreDifferentiation     → DimensionScoreResult (requires sibling versions)
scoreSubjectBodyConsistency → DimensionScoreResult
scoreReadability         → DimensionScoreResult
```

Assemble `ScoreBreakdown` and `ScoringReasoning` from results.

**Step 13 — Generate risk flags:** Call `detectRiskFlags(strategy, version, siblingVersions, priorContext)` for each version. Collect `RiskFlagResult`.

**Step 14 — Apply message type rules:** Call `applyMessageTypeReviewRules(strategy, version, scoreBreakdown)` for each version. Apply any score adjustments returned.

**Step 15 — Calculate risk_score per version:** Sum flag severity points (critical +40, high +20, medium +10, low +3), cap at 100.

**Step 16 — Calculate composite_score per version:** Call `calculateCompositeScore(scoreBreakdown, riskFlags)`. Apply penalty caps. Assign score_band.

**Step 17 — Rank all versions:** Call `rankQualityReviews(scoredDrafts)`. Assign `rank_position` to each draft.

**Step 18 — Assign recommendation:** Call `assignRecommendation(ranked)`. Set `is_recommended = true` on at most one version. If no version eligible, set all to false.

**Step 19 — Generate reasoning:** For each draft, call:
- `generateScoringReasoning(version, scoreBreakdown, riskFlags)` → fill `scoring_reasoning`
- `generateStrengths(scores, flags)` → fill `strengths`
- `generateWeaknesses(scores, flags)` → fill `weaknesses`
- `generateHumanReviewNotes(draft)` → fill `human_review_notes`
- `generateRecommendedEdits(draft)` → fill `recommended_edits`
- `generateComparisonSummary(draft, siblingDrafts)` → fill `comparison_summary`

Also set `compared_against_version_ids` from sibling version IDs.

**Step 20 — Persist quality_review rows:** Call `repo.insertManyQualityReviews(drafts)`. Log success count.

**Step 21 — Complete agent_run:** Mark agent_run as completed. Log `QUALITY_REVIEW_COMPLETED` or `QUALITY_REVIEW_NO_RECOMMENDATION` activity event.

**Step 22 — Return result:** If all versions reviewed: `{ success: true, reviews, recommended, agentRunId }`. If some excluded: `{ success: 'partial', reviews, excluded, recommended, agentRunId }`.

### Edge Case Handling

| Condition | Behavior |
|-----------|----------|
| No versions found | `success: false`, QRA_002, agent_run logged as blocked |
| Some versions invalid, others valid | `success: 'partial'`, excluded list populated |
| All versions invalid | `success: false`, QRA_002 after all exclusions |
| No version can be recommended | `success: true` or `success: 'partial'`, all `is_recommended = false`, notes explain |
| Strategy has blocking invalid_reasons | `success: false`, QRA_009, full abort |
| global_agent_pause = true | `success: false`, QRA_010, full abort |

---

## 10. Scoring Module Design

All functions in `quality-review-agent.scoring.ts`. All pure. All return `DimensionScoreResult`. No I/O.

---

### `scoreStrategicFit(version, strategy, skillDefinition)`

**What is scored:** Whether the version faithfully executes the strategy's intent.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`, `QualityReviewSkillDefinition | null`

**Scoring approach:**
- Start at 100
- Check `version.requiredInclusionsSatisfied` against `strategy.requiredInclusions` — deduct per missing inclusion
- Check `version.avoidedElementsChecked` against `strategy.avoid` — deduct per violation
- Check body_text for presence of `strategy.offerAngle`-related language (heuristic keyword match)
- Check body_text + subject for presence of `strategy.cta` (fuzzy match)
- Check body_text for `strategy.proofPoint` reference when proof point is present
- Check body_text for `strategy.painPointHypothesis` reference when present
- Check body_text against skill `antiPatterns` list
- Check body_text against skill `forbiddenElements` list

**High score (85+):** All inclusions satisfied, no avoid violations, CTA clearly present, proof point reflected.

**Low score (<50):** Multiple required inclusions missing, CTA absent or contradicts strategy, strategy angle not reflected.

**Test cases supported:** TC-QRA-001, TC-QRA-002, TC-QRA-007, TC-QRA-019.

---

### `scoreComplianceConfidence(version)`

**What is scored:** Confidence that the version has no compliance risk.

**Inputs:** `QualityReviewVersionInput`

**Scoring approach:**
- If compliance failed: base score = 35 (max 40)
- If compliance passed: base score = 95
- Run residual pattern check on body + subject using QRA-owned pattern constants:
  - Near-threshold urgency patterns → subtract 10
  - Near-threshold savings implications → subtract 10
  - Partner-adjacent language without naming → subtract 5
  - Review-complete implication without findings → subtract 15
- Floor at 0

**High score (85+):** Compliance passed, no residual patterns.

**Low score (<40):** Compliance failed.

**Test cases supported:** TC-QRA-003, TC-QRA-004, TC-QRA-005, TC-QRA-027, TC-QRA-028.

---

### `scoreCTAClarity(version, strategy)`

**What is scored:** Single CTA, specificity, friction appropriateness.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`

**Scoring approach:**
- Parse body_text for CTA patterns (imperative sentences, action phrases)
- Count distinct CTAs detected
- If count > 1: score starts at 40
- If count = 0: score starts at 20
- If count = 1: base score = 85
- Check CTA specificity: vague phrases ("let me know", "reach out") → subtract 20
- Check CTA match against `strategy.cta` (fuzzy match) → add 10 if strong match
- Check friction vs `strategy.sequencePosition` and `strategy.leadStage` — too aggressive → subtract 15

**Test cases supported:** TC-QRA-011, TC-QRA-022, TC-QRA-023.

---

### `scoreSpecificity(version, strategy)`

**What is scored:** Use of available personalization context.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`

**Scoring approach:**
- Build available context set from strategy (company name, industry, proof point, partner)
- Check `version.personalizationUsed` against available context
- Check `version.personalizationGaps` — penalize per gap involving significant context (proof_point, industry_segment when present)
- Check company name occurrence count → penalize if > 3
- Start at 70 (minimum baseline), adjust up for used context, down for gaps

**Test cases supported:** TC-QRA-001, TC-QRA-002, TC-QRA-006, TC-QRA-007.

---

### `scoreToneFit(version, strategy, skillDefinition)`

**What is scored:** Tone alignment with strategy specification.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`, `QualityReviewSkillDefinition | null`

**Scoring approach:**
- Parse body_text for AI/corporate patterns using QRA-owned constant list
- If strategy.tone = `executive_brevity`:
  - Penalize warm preamble (opening pleasantries)
  - Penalize paragraph count > 4
  - Reward body word count within target range
- If strategy.tone = `warm_conversational`:
  - Penalize stiff/corporate framing
  - Penalize missing warmth signals
- Check skill's `toneRules` for skill-specific tone violations
- AI/corporate pattern detected: subtract 15 each
- Guilt language (for follow-ups): subtract 15

**Test cases supported:** TC-QRA-024, TC-QRA-025, TC-QRA-015.

---

### `scoreDifferentiation(version, siblingVersions)`

**What is scored:** Meaningful differentiation from sibling versions.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewVersionInput[]`

**Scoring approach:**
- Read `version.differentiationProfile`
- For each sibling: compare differentiation profiles, count differing dimensions
- If minimum 2 dimensions differ from all siblings: base score = 70
- If 3+ dimensions differ from all siblings: base score = 85
- If < 2 from any sibling: score = 45
- Detect structural similarity despite different angle label (synonym rewrite check): high structural similarity → score = 35

**Test cases supported:** TC-QRA-021, TC-QRA-014, TC-QRA-031, TC-QRA-032.

---

### `scoreSubjectBodyConsistency(version, strategy)`

**What is scored:** Subject/preview/body alignment and consistency.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`

**Scoring approach:**
- Check if subject implies findings not present in body → subtract 30
- Check if subject implies savings not present in body → subtract 25
- Check if subject references partner not present in body → subtract 20
- Check if subject is generic (no specific angle reference) → subtract 15
- Check preview aligns with subject → subtract 10 if mismatched
- Check if body fulfills implicit subject promise (heuristic: key subject noun phrases present in body)

**Test cases supported:** TC-QRA-005, TC-QRA-026.

---

### `scoreReadability(version, strategy)`

**What is scored:** Clarity, length appropriateness, structure.

**Inputs:** `QualityReviewVersionInput`, `QualityReviewStrategyInput`

**Scoring approach:**
- Count body_text word count; compare against target range for `strategy.messageType`
- Over range by > 30%: subtract 20
- Under range by > 30%: subtract 10
- Count paragraphs: > 5 paragraphs → subtract 10
- Any paragraph > 4 sentences → subtract 5 each
- Long sentences (> 35 words) → subtract 3 each
- Jargon terms (predefined list) → subtract 3 each

**Length guidance by message type:**

| Message Type | Target Range |
|-------------|-------------|
| cold_outreach | 130–220 words |
| new_inquiry_response | 100–170 words |
| statement_submitted_confirmation | 70–120 words |
| statement_review_follow_up | 140–240 words |
| statement_not_submitted_follow_up | 70–140 words |
| proposal_follow_up | 60–100 words |
| no_response_follow_up | 60–100 words |
| re_engagement | 80–130 words |
| partner_member_specific_campaign | 100–170 words |
| event_expo_follow_up | 100–170 words |
| referral_request | 80–130 words |
| customer_nurture | 100–170 words |

**Test cases supported:** TC-QRA-011, TC-QRA-013.

---

## 11. Risk Flag Module Design

All logic in `quality-review-agent.risk-flags.ts`. Pure function. No I/O.

### Main Function

`detectRiskFlags(strategy, version, siblingVersions, priorContext)`

**Returns:** `RiskFlagResult = { flags: RiskFlag[], complianceFlags: RiskFlag[], riskScore: number }`

### Risk Score Calculation

Sum severity weights for all flags:
- Critical: +40 per flag
- High: +20 per flag
- Medium: +10 per flag
- Low: +3 per flag
- Cap total at 100

### Pattern Constants

All pattern arrays (banned phrases, urgency phrases, guarantee phrases, inbound/cold language patterns, partner claim patterns, AI/corporate language patterns, guilt language patterns) are defined as constants in `quality-review-agent.types.ts`. The risk flag module imports only from that file.

### Detection Logic by Flag

**RFL-001 (critical) — Banned Phrase:** Scan body + subject using QRA-owned BANNED_PHRASES constant. Case-insensitive.

**RFL-002 (high) — Urgency Language:** Scan using QRA-owned URGENCY_PATTERNS constant.

**RFL-003 (high) — Guaranteed Outcome:** Scan using QRA-owned GUARANTEED_OUTCOME_PATTERNS constant.

**RFL-004 (critical) — Unsupported Dollar Claim:** Check `strategy.offerAngle ≠ 'confirmed_savings_review'`. If true, scan body + subject with regex `\$\s*\d+`.

**RFL-005 (high) — Unsupported Percentage Claim:** Check `strategy.offerAngle ≠ 'confirmed_savings_review'`. Scan with regex `\d+\s*%\s*(savings|reduction|less)`. Case-insensitive.

**RFL-006 (high) — Lead Source Framing Mismatch:** Use QRA-owned INBOUND_SOURCES and COLD_SOURCES constants. If cold source: scan for inbound acknowledgment patterns. If inbound source: scan for cold discovery patterns.

**RFL-007 (critical) — Unconfirmed Partner Reference:** Check `strategy.partnerMembership?.confirmed !== true`. Scan body + subject (case-insensitive) for partner name patterns using QRA-owned PARTNER_NAME_PATTERNS constant.

**RFL-008 (high) — Exclusivity Claim:** Scan using QRA-owned EXCLUSIVITY_CLAIM_PATTERNS constant. Always flagged regardless of partner confirmation.

**RFL-009 (critical) — Review-Complete Unqualified:** Check: `strategy.messageType ≠ 'statement_review_follow_up'` OR `(strategy.proofPoint is null AND strategy.painPointHypothesis is null)`. If condition is true: scan for review-complete language patterns.

**RFL-010 (critical) — Invented Finding:** Active when `strategy.messageType = 'statement_review_follow_up'`. Scan body for specific finding claims. Cross-check each against `strategy.proofPoint` (fuzzy contains check). If claim not present in proofPoint: flag.

**RFL-011 (critical) — Fabricated Conversation:** Active when `strategy.messageType = 'event_expo_follow_up'`. Check if conversationNotes null. If null: scan for conversation-reference phrases.

**RFL-012 (critical) — Unsupported Metric:** Scan body for specific numeric claims. Cross-check against strategy context fields. If claim has no basis in any strategy field: flag.

**RFL-013 (medium) — Tone Mismatch:** If `toneFitScore < 55`, flag RFL-013.

**RFL-014 (medium) — AI/Corporate Language:** Scan using QRA-owned AI_CORPORATE_PATTERNS constant.

**RFL-015 (medium) — Guilt Language:** Active only for follow-up message types. Scan using QRA-owned GUILT_LANGUAGE_PATTERNS constant.

**RFL-016 (medium) — Aggressive CTA:** If `ctaClarityScore < 50` due to friction mismatch: flag RFL-016.

**RFL-017 (high) — Subject/Body Mismatch:** Detect subject claiming findings, savings, partner, or review-complete that body does not support.

**RFL-018 (low) — Generic Subject:** Heuristic: subject matches generic review phrase pattern with no specific angle qualifier.

**RFL-019 (medium) — Preview/Subject Mismatch:** Compare first sentence of body_text against subject line for topical overlap.

**RFL-020 (medium) — Weak Differentiation:** If `differentiationScore < 55`: flag RFL-020.

**RFL-021 (high) — Synonym Rewrite:** If `differentiationScore < 40` AND structural similarity to a sibling is high: flag.

**RFL-022 (low) — Over-Personalization:** Count occurrences of company name in body_text. If count > 3: flag.

**RFL-023 (medium) — Generic Despite Context:** Check `version.personalizationGaps`. If gaps include significant context fields when available in strategy: flag.

**RFL-024 (medium) — Sequence Fatigue:** Requires prior context. If `priorContext.priorStrategyAngles` includes `version.strategyAngle`: flag.

**RFL-025 (medium) — Relationship Risk:** Scan for passive-aggressive patterns using QRA-owned RELATIONSHIP_RISK_PATTERNS constant. For follow-up message types only.

---

## 12. Composite Score and Ranking Module Design

All logic in `quality-review-agent.composite.ts` and `quality-review-agent.ranking.ts`. All pure functions.

---

### `calculateCompositeScore(scoreBreakdown, riskFlags)`

**Step 1 — Apply weights:**
```
weighted = (
  strategicFit            * 0.20 +
  complianceConfidence    * 0.20 +
  ctaClarity              * 0.15 +
  specificity             * 0.15 +
  toneFit                 * 0.10 +
  differentiation         * 0.10 +
  subjectBodyConsistency  * 0.05 +
  readability             * 0.05
)
```

**Step 2 — Round to integer:** `prePenaltyScore = Math.round(weighted)`

**Step 3 — Determine highest severity flag.**

**Step 4 — Apply penalty:**
```
if critical flag present:   compositeScore = Math.min(prePenaltyScore, 49)
else if high flag present:  compositeScore = Math.min(prePenaltyScore, 69)
else:
  mediumCount = count of medium flags
  lowCount    = count of low flags
  penalty     = (mediumCount * 10) + (lowCount * 3)
  compositeScore = Math.max(0, prePenaltyScore - penalty)
```

**Step 5 — Assign score band:**
```
90–100 → 'excellent'
80–89  → 'strong'
70–79  → 'usable'
50–69  → 'needs_review'
0–49   → 'do_not_use'
```

---

### `rankQualityReviews(scoredDrafts)`

**Sort primary:** `compositeScore` descending.

**Tie-breaking (applied in sequence when two versions are within 3 composite score points):**
1. Lower `riskScore` wins
2. Higher `strategicFitScore` wins
3. Higher `ctaClarityScore` wins
4. Higher `specificityScore` wins
5. Lower `versionNumber` wins

Assign `rankPosition` as 1-indexed integers from highest to lowest.

---

### `assignRecommendation(rankedDrafts)`

**Find candidate:** Start with `rankPosition = 1`. Walk down ranks if blocked.

**Blocking conditions (per version):**
- Any risk flag with `severity = 'critical'` → blocked
- `compositeScore < 70` AND at least one other version has `compositeScore >= 70` → blocked
- Source version's compliance failed → blocked

**No recommendation case:** If all versions are blocked OR all versions score below 70: set `isRecommended = false` on all. Set `noRecommendationReason` in the result. The agent run still succeeds — no recommendation is a valid output, not a failure.

---

## 13. Reasoning Generator Design

All logic in `quality-review-agent.reasoning.ts`. Pure functions. No I/O.

---

### `generateScoringReasoning(version, scoreBreakdown, riskFlags)`

Produces a `ScoringReasoning` object — one human-readable sentence per dimension.

**Approach per dimension:** Explain the score in terms of what was found, not instructions for the reader. Maximum two sentences per dimension.

- Strategic fit: "Version closely follows the [messageType] strategy with [offer_angle] clearly present. CTA matches strategy specification." OR describe what's missing.
- Compliance confidence: "Compliance passed with no residual risk patterns detected." OR describe residual concerns.
- CTA clarity: "Single clear CTA matching '[strategy.cta]'." OR describe the issue.
- Specificity: "Industry segment and proof point reflected naturally." OR describe unused context.
- Tone fit: "Matches [strategy.tone] specification." OR describe tone issues.
- Differentiation: "Clearly differentiated from sibling versions on [dimension list]." OR describe similarity.
- Subject/body consistency: "Subject accurately represents body content and CTA." OR describe mismatch.
- Readability: "[word count] words — within target range. Clean structure." OR describe issue.

---

### `generateStrengths(scoreBreakdown, riskFlags)`

Returns `string[]`. One strength per dimension scoring ≥ 80. Add "No compliance or content risk detected" if `riskFlags` is empty.

---

### `generateWeaknesses(scoreBreakdown, riskFlags)`

Returns `string[]`. One weakness per dimension scoring below 70. One weakness per risk flag above low severity.

---

### `generateHumanReviewNotes(draft)`

Returns `string`. Summarizes: rank position and composite score, primary strength, primary weakness or risk, what the reviewer should inspect, and specific edits to consider.

If `isRecommended = true`: "This version is the recommended choice for this strategy run. [Primary strength]. [Risk note if any]. [Edit suggestion if any]."

If no version is recommended: "No version meets the minimum quality threshold for recommendation. [Highest-scoring version] scores [X] — consider editing or regenerating."

---

### `generateComparisonSummary(draft, siblingDrafts)`

Returns `string`. Generated after all drafts are scored. Explains this version's relative position against siblings in one or two sentences.

---

### `generateRecommendedEdits(draft)`

Returns `string[]`. Maximum 3 edit suggestions. Advisory only — do not rewrite copy. Triggered by weaknesses in high-weight dimensions, risk flags, and personalization gaps.

---

## 14. Invalid Condition Checker

All logic in `quality-review-agent.validation.ts`. Pure function. No I/O.

### `validateQualityReviewInputs(strategy, versions, systemControls)`

Returns `QualityReviewError[]`.

| Code | Condition | Blocking | Suggested Fix |
|------|-----------|----------|--------------|
| `QRA_001` | Strategy record not found or null | Yes | Trigger Message Strategy Agent first |
| `QRA_002` | Zero message_version records found after exclusions | Yes | Trigger Copywriting Agent or check superseded state |
| `QRA_003` | `version.strategyId ≠ strategyId` | No — exclude version | Data integrity issue; investigate if widespread |
| `QRA_004` | `version.tenantId ≠ strategy.tenantId` | Yes — abort all | Critical isolation violation; escalate |
| `QRA_005` | `version.approvalStatus = 'superseded'` | No — exclude version | Normal lifecycle |
| `QRA_006` | `version.bodyText` is empty or null | No — exclude version | Re-run Copywriting Agent for this version |
| `QRA_007` | `version.subjectLine` is empty or null | No — exclude version | Re-run Copywriting Agent for this version |
| `QRA_008` | `version.bodyHtml` is non-null | No — exclude version | Generation error; body_html must be null in v1 |
| `QRA_009` | `strategy.invalidReasons` is non-empty | Yes | Fix strategy validation errors first |
| `QRA_010` | `systemControls.globalAgentPause = true` | Yes | Resume after system pause is lifted |
| `QRA_011` | `systemControls.emailGenerationEngine ≠ 'phase3b'` | Yes | Set email_generation_engine to 'phase3b' |
| `QRA_012` | Version compliance and structural validation both failed | No — exclude version | Re-generate this version |
| `QRA_013` | Quality review already exists for this version (non-superseded) | No — exclude version (unless force=true) | Use force option to re-run |

**Note on QRA_012 derivation:** The Copywriting Agent may not persist explicit `compliance_passed` or `structural_passed` columns on `message_versions`. If these explicit columns do not exist, the coding agent must derive the exclusion condition from available validation metadata: check whether `compliance_notes_applied` records unresolved errors, whether `required_inclusions_satisfied` is empty when inclusions were expected, and whether `generation_notes` or `copy_constraints` record a failed generation. Confirm the actual persisted column names before implementing this check.

### `checkVersionEligibility(version, strategy)`

Helper called per-version. Returns `QualityReviewError | null`. Checks QRA_003, QRA_005–QRA_008, QRA_012, QRA_013 for a single version.

---

## 15. Message Type Rule Application

All logic in `quality-review-agent.message-type-rules.ts`. Pure function. No I/O.

### `applyMessageTypeReviewRules(strategy, version, scoreBreakdown)`

Returns `MessageTypeRuleResult`. Adjustments are deltas, not replacements.

### Rules by Message Type

**MT-1: cold_outreach**
- Elevate effective specificity: add 5 to specificity score if > 80
- Suggest RFL-023 check: if industry_segment available and not used
- Suggest RFL-004 check: any dollar claim
- Review note: "Cold outreach — evaluate specificity and CTA friction carefully."

**MT-2: new_inquiry_response**
- If version does not acknowledge inquiry context: suggest RFL-006
- Suggest RFL-013 check: must be warm_conversational
- Review note: "Inbound inquiry — verify inquiry is acknowledged without banned phrases."

**MT-3: statement_submitted_confirmation**
- If any findings language detected: trigger RFL-009 check
- Review note: "Statement submitted — verify no findings claimed; statement not yet reviewed."

**MT-4: statement_review_follow_up**
- Require proof_point or pain_point_hypothesis in body: if absent, deduct 15 from specificity
- Permit review-complete language when findings context present
- Review note: "Statement review — verify all findings references are supported by strategy context."

**MT-5: statement_not_submitted_follow_up**
- Guilt language → RFL-015; urgent CTA → RFL-016
- Review note: "Statement not submitted — evaluate pressure level relative to sequence position."

**MT-6: proposal_follow_up**
- Elevate readability: add 5 to readability score if word count is within 60–100
- Urgency language → RFL-002
- Review note: "Proposal follow-up — brevity and decision focus are primary evaluation criteria."

**MT-7: no_response_follow_up**
- Elevate differentiation: add 5 to differentiation score
- Repeated prior angle → RFL-024
- Review note: "No-response follow-up — angle differentiation from prior messages is critical."

**MT-8: re_engagement**
- Guilt language → RFL-015
- If no time-gap acknowledgment: subtract 5 from strategic_fit
- Review note: "Re-engagement — verify light time-gap acknowledgment and fresh reason are present."

**MT-9: partner_member_specific_campaign**
- Unconfirmed partner → RFL-007; partner name count > 2 → RFL-022; exclusivity → RFL-008
- Review note: "Partner campaign — partner context must be accurate and not overstated."

**MT-10: event_expo_follow_up**
- Conversation language without notes → RFL-011
- Event name absent → subtract 10 from specificity
- Review note: "Event follow-up — verify event reference present and no fabricated conversation details."

**MT-11: referral_request**
- No relationship basis detected: subtract 10 from strategic_fit
- Review note: "Referral request — verify relationship basis and specificity of the ask."

**MT-12: customer_nurture**
- Cold outreach framing → RFL-006; prospecting language → subtract 15 from strategic_fit
- Review note: "Customer nurture — verify version reads as communication to an existing customer."

---

## 16. Integration With Existing Message Strategy Agent

The Quality Review Agent uses `message_strategy` records as read-only inputs. No files in `modules/messaging/strategy/` are modified.

The quality review service loads message_strategy via `message-strategy.repo.ts` using an existing `getById` function. If `getById` does not exist, add it to `message-strategy.repo.ts` and report the change.

### Constraints

- Do not re-run the decision tree.
- Do not recalculate strategy confidence.
- Do not override any strategy field.
- Do not write to `message_strategies` in any circumstance.
- Do not modify `strategy.status`, `strategy.requires_human_review`, or `strategy.invalid_reasons`.

---

## 17. Integration With Existing Copywriting Agent

The Quality Review Agent uses `message_version` records as read-only inputs. No files in `modules/messaging/copywriting/` are modified.

### Pattern Constants

The Quality Review Agent should define its own QRA-owned pattern constants in `quality-review-agent.types.ts` for banned phrases, urgency phrases, guaranteed outcome phrases, inbound/cold language patterns, and partner claim patterns. The coding agent may import equivalent constants from `copywriting-agent.types.ts` only if those constants are already exported — do not modify Copywriting Agent files solely to create exports for QRA use. If required constants are not already exported, duplicate them in `quality-review-agent.types.ts` and note the duplication in the implementation summary. No Copywriting Agent file may be modified for this purpose.

### Data Access Pattern

Versions are loaded via `message-version.repo.ts` using an existing `listByStrategy` function. If this function does not exist, add it and report.

### Constraints

- Do not modify any `message_version` field.
- Do not set `approval_status`.
- Do not create `email_drafts`.
- Do not create `approval_requests`.
- Do not regenerate versions.
- Do not set `message_version.selected` or `message_version.rejected`.

---

## 18. Integration With Existing Phase 3A Services

### Services Used

| Service | Usage |
|---------|-------|
| `agent-run-logging.service.ts` | Create agent_run, log steps, complete/fail run |
| `activity-event.service.ts` | Emit `QUALITY_REVIEW_COMPLETED` or `QUALITY_REVIEW_NO_RECOMMENDATION` |
| `system-control.service.ts` | Load system controls for gate checks |

### Constraints

- Do not modify any Phase 3A service files.
- Call these services exactly as existing agents call them.
- Do not add sending, email_drafts, or approval_requests to any Phase 3A flow.
- Do not modify the email rewrite loop or Resend webhook handlers.

---

## 19. Message Workspace UI Integration

### Existing Component

`app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`

This component currently shows version cards with subject line, preview text, body text, Generate/Regenerate buttons, Select/Reject buttons, and a permanently disabled Approve & Send button.

### Additions Required

**New server data fetch:** Load quality_review records for the strategy when the page loads. Pass alongside versions as props.

**Per-version card additions:**
- Composite score (number + band label + color coding)
- "Recommended" badge if `is_recommended = true`
- Risk flag summary (icon + count, expandable)
- Collapsible score breakdown panel (all 8 dimension scores)
- Strengths list (collapsed, expandable)
- Weaknesses list (collapsed, expandable)
- Human review notes (displayed prominently)
- Comparison summary (collapsed, expandable)
- Recommended edits (collapsed, expandable)

**New top-level controls:**
- "Run Quality Review" button — calls `runQualityReviewAction`. Disabled if no versions exist, already ran without force mode, or `canRunQualityReview` returns false.
- "Re-run Quality Review" button — shown if quality_reviews already exist.

**Score band color coding:**
- excellent: green
- strong: blue
- usable: amber
- needs_review: orange
- do_not_use: red

### Rules for UI

- Quality Review scores are advisory. The UI must not imply they enable sending.
- "Approve & Send" remains permanently disabled in v1.
- Selecting or rejecting a version remains independent of the QRA recommendation.
- The recommended badge is informational only.

---

## 20. Test Fixture Plan

### Fixture Location

`tests/fixtures/quality-review-agent/TC-QRA-001.json` through `TC-QRA-035.json`

### Fixture Structure

```json
{
  "meta": {
    "test_case_id": "TC-QRA-001",
    "scenario_name": "Cold outreach — industry-specific version ranks highest",
    "description": "...",
    "message_type": "cold_outreach"
  },
  "input": {
    "strategy": { },
    "versions": [ ],
    "skill_definitions": [ ],
    "prior_context": null,
    "system_controls": {
      "emailGenerationEngine": "phase3b",
      "globalAgentPause": false,
      "requireMessageApproval": true,
      "requireStrategyReview": false
    }
  },
  "expected": {
    "success": true,
    "expected_review_count": 2,
    "expected_ranking": ["A", "B"],
    "expected_recommended_version_label": "A",
    "expected_scores": {
      "A": {
        "composite_score_min": 85,
        "score_band": "strong",
        "specificity_score_min": 82,
        "risk_flags": []
      },
      "B": {
        "composite_score_max": 78,
        "score_band": "usable",
        "risk_flags": ["RFL-023"]
      }
    },
    "expected_errors": [],
    "pass_fail_notes": "Version A must rank first. Version B must have RFL-023."
  }
}
```

### Fixture Inventory

| Group | Fixtures | Key Assertions |
|-------|----------|---------------|
| Cold outreach | TC-QRA-001, 002, 003 | Specificity scoring, dollar claim critical cap |
| Inbound inquiry | TC-QRA-004 | Cold language high-risk cap |
| Statement submitted | TC-QRA-005, 006 | RFL-009 critical, timeline reward |
| Statement review follow-up | TC-QRA-007, 008, 009, 010 | Findings accuracy, dollar claims |
| Proposal follow-up | TC-QRA-011, 012 | Brevity reward, urgency cap |
| No-response follow-up | TC-QRA-013, 014 | Angle differentiation, sequence fatigue |
| Re-engagement | TC-QRA-015 | Guilt language penalty |
| Partner campaign | TC-QRA-016, 017 | Unconfirmed partner critical, overuse low |
| Event follow-up | TC-QRA-018 | Fabricated conversation critical |
| Customer nurture | TC-QRA-019 | Prospecting tone penalty |
| Referral request | TC-QRA-020 | Transactional ask penalty |
| Scoring mechanics | TC-QRA-021–026 | Differentiation, CTA, tone, consistency |
| Risk caps | TC-QRA-027, 028 | Critical cap 49, high cap 69 |
| No recommendation | TC-QRA-029 | All below 70, agent run succeeds, all is_recommended = false |
| Ranking / tie-breaking | TC-QRA-030, 031, 032 | Score ordering, risk tie-break, strategic fit tie-break |
| Gate conditions | TC-QRA-033, 034, 035 | Superseded excluded, no versions blocked, body_html blocked |

---

## 21. QA Checklist

**Schema:**
- [ ] `quality_reviews` migration created and applied
- [ ] All fields present with correct types and nullability
- [ ] All recommended indexes created
- [ ] RLS enabled with correct read policy
- [ ] `update_updated_at()` trigger attached (shared, not custom)
- [ ] Foreign keys defined per Section 5
- [ ] `superseded_at` field present

**Repository:**
- [ ] `insertQualityReview` implemented
- [ ] `insertManyQualityReviews` implemented
- [ ] `listByStrategy` implemented (ordered by rank_position)
- [ ] `listByVersion` implemented
- [ ] `getRecommendedForStrategy` implemented
- [ ] `supersedeForStrategy` implemented (sets superseded_at)
- [ ] `qualityReviewExistsForVersion` implemented

**Scoring modules:**
- [ ] All 8 scoring functions implemented and pure
- [ ] All 8 return `DimensionScoreResult`
- [ ] No I/O in any scoring function
- [ ] All pattern constants owned by `quality-review-agent.types.ts`

**Risk flag module:**
- [ ] All 25 RFL flags implemented
- [ ] `riskScore` calculated correctly (sum capped at 100)
- [ ] Compliance flag subset correctly separated

**Composite and ranking:**
- [ ] Weighted formula correctly implemented (weights sum to 100%)
- [ ] All 5 score bands assigned correctly
- [ ] Critical cap at 49, high cap at 69
- [ ] Medium and low subtractions additive
- [ ] All 5 tie-breaker rules implemented in order
- [ ] `is_recommended` assigned to at most one version per run
- [ ] No-recommendation case: all `is_recommended = false`, agent run succeeds

**Reasoning:**
- [ ] All 6 reasoning/notes functions implemented
- [ ] No copy rewriting in reasoning output
- [ ] Recommended edits are advisory only (max 3 per version)

**Service:**
- [ ] All 22 flow steps implemented
- [ ] Gate checks use correct QRA error codes
- [ ] Blocking vs. non-blocking errors handled correctly
- [ ] Agent run logging at each of 12 steps
- [ ] `QUALITY_REVIEW_COMPLETED` event emitted
- [ ] `QUALITY_REVIEW_NO_RECOMMENDATION` event emitted when appropriate

**Server actions:**
- [ ] `runQualityReviewAction` implemented
- [ ] `getQualityReviewsAction` implemented
- [ ] `getRecommendedVersionReviewAction` implemented
- [ ] `canRunQualityReviewAction` implemented

**Agent types:**
- [ ] `quality_review_agent` added to agent type constants (additive only)
- [ ] `QUALITY_REVIEW_COMPLETED` added to `ActivityEventType` (additive only)
- [ ] `QUALITY_REVIEW_NO_RECOMMENDATION` added to `ActivityEventType` (additive only)
- [ ] No existing agent type constants renamed or removed
- [ ] No existing `ActivityEventType` entries changed

**Tests:**
- [ ] All 35 QRA fixtures created with correct structure
- [ ] `quality-review-agent.test.ts` created
- [ ] All 35 QRA tests pass
- [ ] All 141 existing tests still pass (no regressions)

**Build:**
- [ ] `npx next build` passes
- [ ] TypeScript passes with no errors
- [ ] ESLint / lint passes

**UI:**
- [ ] `GeneratedVersionsPanel.tsx` extended with quality score display
- [ ] Run Quality Review button functional
- [ ] Score bands color-coded correctly
- [ ] Recommended badge visible on recommended version
- [ ] Risk flags displayed and expandable
- [ ] Strengths/weaknesses accessible
- [ ] Human review notes visible

**Guardrail compliance:**
- [ ] No Phase 3A service files modified
- [ ] No Message Strategy Agent files modified
- [ ] No Copywriting Agent files modified (constant duplication in types noted in summary if applicable)
- [ ] No sending behavior added anywhere
- [ ] No `email_drafts` created
- [ ] No `approval_requests` created
- [ ] No external LLM calls added
- [ ] No `message_version` content modified
- [ ] No `message_strategy` records written
- [ ] `body_html` remains null in all new records

---

## 22. Implementation Sequence

The coding agent must follow this exact sequence. Do not reorder steps.

1. **Inspect existing implementations:** Read `message-strategy.service.ts` and `copywriting-agent.service.ts` to confirm service patterns, agent run logging conventions, and repository call conventions before writing anything new.

2. **Inspect existing repository implementations:** Read `message-strategy.repo.ts` and `message-version.repo.ts` to confirm query patterns, Supabase client usage, and error handling conventions.

3. **Inspect `agent-run-logging.service.ts`:** Confirm the exact function signatures for creating agent runs, logging steps, and completing runs.

4. **Inspect `message_versions` table schema:** Confirm whether `compliance_passed` and `structural_passed` are explicit columns or must be derived from metadata. Document the finding in the implementation summary before proceeding to QRA_012 implementation.

5. **Create migration plan:** Draft `supabase/migrations/20240024_phase3b_quality_reviews.sql` with the full schema from Section 5.

6. **Create `quality-review-agent.types.ts`:** All types, interfaces, error code constants, score band constants, risk flag code constants, and all QRA-owned pattern constant arrays. This file has no dependencies except types from existing files.

7. **Create `quality-review.repo.ts`:** All repository functions from Section 7.

8. **Create `quality-review-agent.scoring.ts`:** All 8 pure scoring functions. Imports only from `quality-review-agent.types.ts`.

9. **Create `quality-review-agent.risk-flags.ts`:** `detectRiskFlags` and all 25 flag checks. Imports only from `quality-review-agent.types.ts` and scoring results.

10. **Create `quality-review-agent.composite.ts`:** `calculateCompositeScore`. Weighted formula, penalty caps, band assignment.

11. **Create `quality-review-agent.ranking.ts`:** `rankQualityReviews` and `assignRecommendation`. All tie-breakers implemented.

12. **Create `quality-review-agent.reasoning.ts`:** All 6 reasoning generator functions. Pure. Advisory text only.

13. **Create `quality-review-agent.validation.ts`:** `validateQualityReviewInputs` and `checkVersionEligibility`. All 13 QRA error codes. Applies derivation logic from Step 4 finding for QRA_012.

14. **Create `quality-review-agent.message-type-rules.ts`:** `applyMessageTypeReviewRules`. All 12 message type rule blocks.

15. **Create `quality-review-agent.service.ts`:** Main 12-step orchestrator. Imports all pure function modules, repo, and Phase 3A services.

16. **Update `modules/intelligence/types.agent.ts`:** Add `quality_review_agent` to agent type constants. Add `QUALITY_REVIEW_COMPLETED` and `QUALITY_REVIEW_NO_RECOMMENDATION` to `ActivityEventType`. These additions are additive only — do not rename, remove, or change any existing agent type constants or `ActivityEventType` entries. Report this change in the implementation summary.

17. **Create `quality-review-agent.actions.ts`:** 4 `'use server'` actions calling service functions.

18. **Apply migration:** Run the `20240024` migration.

19. **Create 35 test fixtures:** `tests/fixtures/quality-review-agent/TC-QRA-001.json` through `TC-QRA-035.json`. Follow the fixture structure from Section 20. Create all 35 before writing the test file.

20. **Create `tests/quality-review-agent.test.ts`:** Import and test all pure functions against fixtures. Follow the Vitest patterns from `tests/copywriting-agent.test.ts`. 35 QRA tests + confirm all 141 existing tests still pass.

21. **Extend `GeneratedVersionsPanel.tsx`:** Add quality review display elements from Section 19.

22. **Run full QA:** `npx vitest run` (176+ tests expected: 141 existing + 35 QRA), `npx next build`, TypeScript, lint. Fix any failures before declaring complete.

23. **Produce implementation summary:** Report all files created, all changes made, test results, build results, whether constants were duplicated or imported, and any deviations from this plan. Stop before approval/send bridge work.

---

## 23. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| QRA scoring starts rewriting copy | All output is stored in quality_review records only; version records are never written |
| QRA becomes an approval gate | `is_recommended` is advisory; no send path exists; UI label must be "Recommended" not "Approved" |
| QRA ranking is mistaken for automation | No action reads `is_recommended` to trigger sending; human must explicitly select |
| Scoring becomes subjective and untestable | All scoring is deterministic pattern matching and metadata analysis; 35 fixture tests validate output |
| Risk flags over-penalize good copy | Explicit severity/cap model defined; test cases verify caps and penalties |
| QRA duplicates Copywriting Agent compliance work | QRA reads CA compliance metadata; only runs residual check; does not re-run the hard validator |
| Pattern constants create hidden CA dependency | QRA owns its own constants in `quality-review-agent.types.ts`; CA import only if already exported |
| Previous 141 tests regress | Step 22 requires all existing tests to pass before implementation is marked complete |
| Agent types.agent.ts changes are incompatible | Step 1 instructs inspecting existing patterns first; all additions are additive only |
| compliance_passed / structural_passed columns absent | Step 4 explicitly requires confirming schema before implementing QRA_012 |
| UI changes break existing version selection flow | GeneratedVersionsPanel changes are additive only; existing Select/Reject buttons are not modified |

---

## 24. Final Acceptance Criteria

| # | Criteria |
|---|----------|
| 1 | Implementation scope is fully defined — all files named and described |
| 2 | Non-goals are explicitly listed with no ambiguity |
| 3 | Database schema is fully defined — all quality_reviews fields listed in Section 5 include type, nullability, indexing, and immutability guidance |
| 4 | All recommended indexes are defined |
| 5 | RLS policy is defined |
| 6 | Trigger approach is defined (shared `update_updated_at()`) |
| 7 | All type interfaces are defined with required and optional fields |
| 8 | All service functions are defined with inputs, outputs, and errors |
| 9 | Agent run structure is defined — 12 steps with snapshot and logging rules |
| 10 | Full 22-step quality review flow is defined with error handling |
| 11 | All 8 scoring modules are designed with inputs, approach, and test case mapping |
| 12 | All 25 risk flags are defined with detection logic, severity, and score effect |
| 13 | Composite score formula is defined with weights, penalty caps, and band thresholds |
| 14 | Ranking algorithm is defined with all 5 tie-breaker rules |
| 15 | Recommendation assignment is defined with blocking conditions and no-recommendation behavior |
| 16 | All 4 reasoning generator functions are designed |
| 17 | All 13 QRA error codes are defined as blocking or non-blocking |
| 18 | All 12 message type rule blocks are designed |
| 19 | Integration constraints with MSA, CA, and Phase 3A are defined |
| 20 | UI integration additions are specified |
| 21 | Test fixture structure is defined |
| 22 | QA checklist covers all implementation items |
| 23 | Implementation sequence is defined in exact order (23 steps) |
| 24 | Risks and mitigations are documented |
| 25 | compliance_passed / structural_passed derivation is addressed |
| 26 | Pattern constant ownership is unambiguous — QRA owns its constants |
| 27 | Activity event additions are explicitly additive only |
| 28 | No TypeScript code was written in this document |
| 29 | No SQL was written in this document |
| 30 | No implementation was started |

---

## 25. Recommended Next Step

Once this Implementation Plan is reviewed and approved by the project owner, the next task is:

**Phase 3B Quality Review Agent — Code Implementation**

That implementation will build, in the exact sequence defined in Section 22:

- `quality_reviews` migration
- `quality-review-agent.types.ts` (with QRA-owned pattern constants)
- `quality-review.repo.ts`
- All 8 scoring modules
- Risk flag module
- Composite and ranking modules
- Reasoning generator
- Validation module
- Message type rules module
- Service orchestrator
- Agent type additions (additive only)
- Server actions
- 35 test fixtures
- QRA test suite
- `GeneratedVersionsPanel.tsx` extended with quality review display

Followed by full QA (`npx vitest run` + `npx next build`) and an implementation summary.

**Do not begin implementation until this plan is approved.**

---

*End of document.*

**Document status:** v1.0 — Locked pending implementation.

**Active guardrails confirmed:** No code written. No SQL written. No TypeScript files created. No application files modified. Quality Review Agent remains evaluation-only throughout this plan. No sending, approval, LLM calls, or copy modification are defined anywhere in this plan.
