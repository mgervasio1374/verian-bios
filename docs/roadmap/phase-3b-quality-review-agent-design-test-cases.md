# Phase 3B Quality Review Agent — Design & Test Cases v1.0

**Document version:** 1.0
**Status:** Locked
**Created:** 2026-05-19
**Prerequisite:** Phase 3B Copywriting Agent Foundation — Code Implementation v1.0 (locked)
**Next document:** Phase 3B Quality Review Agent — Implementation Plan (after approval)

---

## 1. Executive Overview

The Copywriting Agent produces structurally valid, compliance-checked message version candidates. It ensures that each version has the correct form: a subject line, body text, a preview, passing compliance checks, and meaningful differentiation from its siblings. What it does not know is which version is *better* — which one is most strategically aligned, most clearly worded, most appropriate for this specific lead at this moment in their journey.

That evaluation is the responsibility of the Quality Review Agent.

The Quality Review Agent is the third agent in the Phase 3B Revenue Learning Engine pipeline. It reads the `message_strategy` and the `message_version[]` candidates produced by the Copywriting Agent, evaluates each version independently across eight quality dimensions, assigns a composite score, identifies risk flags, produces a ranked recommendation, and surfaces explanatory notes for human review. It produces one `quality_review` record per message version.

The purpose of this agent within the broader pipeline:

- **Message Strategy Agent** decides what should be communicated and why — message type, skill, offer angle, CTA, tone, proof point, required inclusions.
- **Copywriting Agent** creates compliant candidate versions that execute the strategy — subject line, body text, preview, differentiated angles.
- **Quality Review Agent** evaluates the candidates and produces independent review signal — scores, risk flags, ranking, reasoning.
- **Human reviewer** reads the quality review output, sees the ranked versions with explanations, and decides which version to select, edit, approve, or reject.

The Quality Review Agent creates a permanent, auditable review record for every version it evaluates. This record later serves as training signal for the Learning Agent — pairing agent-produced scores with human decisions and eventual outcome data. The quality_review records do not drive automation. They inform a human.

The Quality Review Agent does not write copy, approve copy, or send copy. It evaluates copy. That separation is fundamental and must not be eroded.

---

## 2. Agent Role and Boundaries

### What the Quality Review Agent Does

- Loads a `message_strategy` record
- Loads all `message_version` records associated with that strategy
- Reads compliance metadata from the Copywriting Agent (compliance_passed, compliance_errors, compliance_notes_applied)
- Reads structural metadata (structural_passed, generation_notes, copy_constraints)
- Reads differentiation profiles (differentiation_profile, strategy_angle)
- Reads personalization metadata (personalization_used, personalization_gaps, personalization_level)
- Reads skill definitions for the selected skill(s) to validate adherence
- Reads optional prior message history context (prior subject lines, prior CTA, prior angles) when available
- Scores each version independently across eight defined dimensions (0–100 per dimension)
- Calculates a composite score for each version using weighted dimension scores and risk penalty rules
- Identifies risk flags for each version and assigns severity levels
- Ranks all versions in the strategy run by composite score
- Selects a recommended version (the highest-scoring version without blocking risk) and marks it `is_recommended = true`
- Generates human-readable reasoning for the recommendation
- Generates per-version strengths, weaknesses, and recommended edits for human reviewers
- Generates a cross-version comparison summary
- Writes one `quality_review` record per evaluated version

### What the Quality Review Agent Does NOT Do

- Does not write or rewrite any copy
- Does not change subject lines
- Does not change body copy
- Does not change preview text
- Does not generate new message versions
- Does not approve any version for sending
- Does not send messages
- Does not create `email_drafts`
- Does not create `approval_requests`
- Does not update skill definitions
- Does not modify `message_strategy` records
- Does not modify `message_version` records in any way — including their `approval_status`
- Does not learn from historical outcomes
- Does not call external LLMs in v1. The Quality Review Agent is deterministic and pure-function-first. Scoring, ranking, risk flag detection, and reasoning generation are all rule-based in v1. LLM-assisted scoring may be introduced in a future version under a separate approved design.

---

## 3. Inputs Required by the Agent

### 3.1 Strategy Inputs

All fields from the `message_strategy` record associated with the versions being reviewed:

| Field | Purpose in Review |
|-------|------------------|
| `strategy_id` | Identity key for all related records |
| `tenant_id` | Isolation check — must match all version records |
| `lead_id` | Source lead reference |
| `company_id` | Company context for personalization evaluation |
| `campaign_id` | Campaign context |
| `message_type` | Defines which message type review rules apply |
| `primary_goal` | Evaluates strategic fit — did the version serve this goal? |
| `secondary_goal` | Secondary alignment check |
| `sequence_position` | Informs CTA friction, tone, and length expectations |
| `days_since_last_contact` | Context for re-engagement and fatigue evaluation |
| `lead_source` | Informs inbound vs. cold framing checks |
| `lead_stage` | Affects appropriate CTA friction level |
| `lead_score` | Affects personalization and urgency expectations |
| `lead_urgency_score` | Affects tone and CTA expectations |
| `industry_segment` | Used to evaluate whether industry context was used |
| `processing_volume_tier` | Affects specificity and proof point expectations |
| `has_statement_artifact` | Context for review-complete language evaluation |
| `prior_touch_count` | Context for fatigue, differentiation-from-sequence evaluation |
| `last_engagement_signal` | Context for re-engagement framing |
| `partner_membership` | Validates partner language in versions |
| `audience_context` | Source of event name, partner context, relationship notes |
| `pain_point_hypothesis` | Expected to be reflected in versions |
| `offer_angle` | Defines the specific value proposition being communicated |
| `trust_angle` | Informs tone and opening approach |
| `proof_point` | Expected to be used in versions when present |
| `cta` | The CTA that versions should use |
| `tone` | Required tone (`executive_brevity`, `warm_conversational`, etc.) |
| `length_target` | Informs readability and length appropriateness |
| `personalization_level` | Defines how much personalization is expected |
| `compliance_notes` | Strategy-level compliance context |
| `required_inclusions` | Elements that must appear in versions |
| `avoid` | Elements that must not appear |
| `selected_skills` | Skill slugs that versions should follow |
| `skill_reasoning` | Why these skills were selected |
| `confidence_score` | Strategy confidence — informs expected quality bar |
| `reasoning` | Strategy decision rationale — context for strategic fit evaluation |
| `requires_human_review` | Existing flag; QRA does not change this |
| `status` | Strategy status — must be active or review-ready |
| `invalid_reasons` | Blocking strategy errors — if present, review cannot proceed |

### 3.2 Message Version Inputs

For each `message_version` record in the strategy run:

| Field | Purpose in Review |
|-------|------------------|
| `version_id` | Identity key for the quality_review record |
| `strategy_id` | Must match strategy_id — isolation check |
| `subject_line` | Evaluated for clarity, consistency, length |
| `preview_text` | Evaluated for subject support and accuracy |
| `body_text` | Primary evaluation surface for all dimensions |
| `body_html` | Must be null in v1 — non-null is a blocking error |
| `message_type` | Must match strategy.message_type |
| `version_label` | A, B, C, D — used in ranking display |
| `version_number` | Numeric tie-breaker for ranking |
| `strategy_angle` | Identifies the differentiation angle used |
| `selected_skills` | Skill slugs applied to this version |
| `skill_versions` | Skill versions applied |
| `source_strategy_snapshot` | Snapshot of strategy at generation time |
| `compliance_notes_applied` | Notes from compliance validator |
| `required_inclusions_satisfied` | Which required inclusions were satisfied |
| `avoided_elements_checked` | Which avoid-list items were checked |
| `generation_notes` | Notes from the body generator |
| `copy_constraints` | Constraints applied during generation |
| `personalization_used` | Personalization elements that were applied |
| `personalization_gaps` | Context that was available but not used |
| `approval_status` | Must be `pending` to be reviewable |
| `created_by_agent` | Should be `copywriting_agent` |

### 3.3 Optional Prior Message Context

When available from message history for the lead:

| Field | Purpose in Review |
|-------|------------------|
| Prior sent subject lines | Evaluate differentiation-from-sequence |
| Prior body summaries | Evaluate whether angle is repeated |
| Prior CTA | Compare CTA evolution across sequence |
| Prior strategy angles | Detect repeated angles that reduce freshness |
| Prior engagement signal | Context for re-engagement framing evaluation |

### 3.4 System Controls

| Control | Effect on Review |
|---------|-----------------|
| `email_generation_engine` | Must equal `phase3b` to proceed |
| `global_agent_pause` | If true, review is blocked |
| `require_message_approval` | Informational — does not affect review logic |
| `require_strategy_review` | Informational — does not affect review logic |

### 3.5 Skill Definition Inputs

For each skill in `strategy.selected_skills`, the agent reads the skill definition to evaluate version adherence:

| Field | Purpose in Review |
|-------|------------------|
| Tone rules | Validates tone fit against skill expectations |
| Messaging rules | Validates that the version follows the skill's approach |
| Required elements | Cross-checks version content |
| Forbidden elements | Checks for skill-specific prohibitions |
| CTA guidance | Validates CTA appropriateness for this skill |
| Anti-patterns | Checks for patterns the skill explicitly discourages |
| Compliance notes | Skill-specific compliance context |

---

## 4. Quality Review Output Design

The Quality Review Agent produces one `quality_review` record per evaluated `message_version`.

### quality_review Object

| Field | Type | Required | Source | Immutable? |
|-------|------|----------|--------|-----------|
| `id` | uuid | Yes | Auto-generated | Yes |
| `tenant_id` | uuid | Yes | From strategy | Yes |
| `strategy_id` | uuid | Yes | From strategy | Yes |
| `version_id` | uuid | Yes | From message_version | Yes |
| `lead_id` | uuid | Yes | From strategy | Yes |
| `company_id` | uuid | Yes | From strategy | Yes |
| `campaign_id` | uuid | Yes | From strategy | Yes |
| `agent_run_id` | uuid | Yes | From agent run logger | Yes |
| `message_type` | text | Yes | From strategy.message_type | Yes |
| `version_label` | text | Yes | From message_version.version_label | Yes |
| `strategy_angle` | text | Yes | From message_version.strategy_angle | Yes |
| `composite_score` | integer | Yes | Calculated by agent (0–100) | No — human can flag for override |
| `score_band` | text | Yes | Derived from composite_score | No |
| `rank_position` | integer | Yes | Assigned during cross-version ranking (1 = best) | No |
| `is_recommended` | boolean | Yes | True for top-ranked version without blocking risk | No |
| `strategic_fit_score` | integer | Yes | Calculated (0–100) | Yes |
| `compliance_confidence_score` | integer | Yes | Calculated (0–100) | Yes |
| `cta_clarity_score` | integer | Yes | Calculated (0–100) | Yes |
| `specificity_score` | integer | Yes | Calculated (0–100) | Yes |
| `tone_fit_score` | integer | Yes | Calculated (0–100) | Yes |
| `differentiation_score` | integer | Yes | Calculated (0–100) | Yes |
| `subject_body_consistency_score` | integer | Yes | Calculated (0–100) | Yes |
| `readability_score` | integer | Yes | Calculated (0–100) | Yes |
| `risk_score` | integer | Yes | Calculated (0–100; lower is better) | Yes |
| `score_breakdown` | jsonb | Yes | JSON object of all dimension scores | Yes |
| `scoring_reasoning` | jsonb | Yes | JSON object of per-dimension human-readable explanations | Yes |
| `strengths` | text[] | Yes | Array of strength observations | Yes |
| `weaknesses` | text[] | Yes | Array of weakness observations | Yes |
| `risk_flags` | jsonb | Yes | Array of risk flag objects (code, severity, message) | Yes |
| `compliance_flags` | jsonb | Yes | Compliance-specific flags from CA metadata + residual check | Yes |
| `human_review_notes` | text | No | Generated notes surfacing key decisions for reviewer | Yes |
| `recommended_edits` | text[] | No | Specific actionable suggestions for human editors | Yes |
| `compared_against_version_ids` | uuid[] | Yes | Other version IDs in this strategy run | Yes |
| `comparison_summary` | text | Yes | Cross-version comparison narrative | No |
| `created_by_agent` | text | Yes | `quality_review_agent` | Yes |
| `created_at` | timestamptz | Yes | Auto | Yes |
| `updated_at` | timestamptz | Yes | Auto-updated | No |

### Field Notes

**`composite_score`** — Weighted average of the 8 dimension scores, with risk penalties applied. See Section 6. Marked non-immutable because human reviewers may flag an override for audit purposes; the agent's score itself is preserved in `score_breakdown`.

**`score_band`** — Derived from `composite_score`. Values: `excellent`, `strong`, `usable`, `needs_review`, `do_not_use`. See Section 6.

**`rank_position`** — Assigned after all versions in the same strategy run are scored. `1` is the best. Ties resolved per Section 7 rules.

**`is_recommended`** — At most one version per strategy run has this set to `true`. See Section 7 for blocking conditions.

**`risk_score`** — Accumulated risk severity. 0 = no risk flags; approaching 100 = maximum accumulated risk. Lower is better. Calculated as the sum of flag severity points, capped at 100. Does not average into composite — used separately for penalty caps.

**`risk_flags`** — Each flag is an object: `{ code: string, severity: 'critical' | 'high' | 'medium' | 'low', message: string }`. Full flag model in Section 8.

**`compliance_flags`** — Subset of risk_flags that are compliance-related. Mirrors CA compliance metadata and adds residual risk observations.

**`human_review_notes`** — A paragraph of plain-text notes generated for the human reviewer. Summarizes the key decision points, unusual conditions, and important caveats for this version. Not scored.

**`recommended_edits`** — Specific actionable suggestions, e.g., "Consider making the CTA more specific — 'share your statement' rather than 'let me know'." These are advisory only.

**`comparison_summary`** — A short narrative comparing this version to its siblings. Generated in the ranking pass after all versions are individually scored. Example: "Version A scored highest in this run (88) primarily due to strong specificity and strategic alignment. This version (B, 82) scores well on CTA clarity but weaker on personalization depth."

---

## 5. Scoring Dimensions

All dimensions score 0–100. Higher is better for all dimensions except `risk_score` (lower is better).

---

### A. Strategic Fit Score

**What is scored:** Whether the version faithfully executes the `message_strategy` — the message type intent, primary goal, offer angle, CTA, skill messaging rules, required inclusions, and avoid list.

**High score (80–100):** Version directly executes the strategy's message type intent. CTA matches or closely follows `strategy.cta`. The offer angle is clearly communicated in the body. Required inclusions are satisfied (per `required_inclusions_satisfied` metadata). Avoid list is respected (per `avoided_elements_checked` metadata). The selected skill's messaging rules and tone are followed. Pain point hypothesis or proof point is naturally integrated where present.

**Medium score (50–79):** Version generally follows the strategy. CTA is present and directionally correct but not precisely matching `strategy.cta`. Most required inclusions are present. Minor avoid-list items may be borderline. Offer angle is implied rather than clearly stated.

**Low score (below 50):** Version partially or significantly departs from strategy intent. CTA diverges materially from `strategy.cta`. Multiple required inclusions are missing. Avoid-list violations are present. Strategy angle is unclear or absent. Or the version frames the message in a way that contradicts the message type (e.g., cold discovery language in an inbound response).

**Common failure patterns:**
- Generic copy that does not reflect the specific `offer_angle`
- CTA that asks for something different from `strategy.cta`
- Omitting the `pain_point_hypothesis` reference when the strategy expects it reflected in the opening
- Using language from the avoid list
- Claiming review findings when the strategy is not `statement_review_follow_up`
- Ignoring `trust_angle` entirely when it was specified

**Data used:** `strategy.message_type`, `strategy.primary_goal`, `strategy.offer_angle`, `strategy.cta`, `strategy.tone`, `strategy.required_inclusions`, `strategy.avoid`, `strategy.proof_point`, `strategy.pain_point_hypothesis`, `strategy.trust_angle`, `version.required_inclusions_satisfied`, `version.avoided_elements_checked`, `version.compliance_notes_applied`, skill definition messaging rules.

---

### B. Compliance Confidence Score

**What is scored:** How confident the Quality Review Agent is that the version contains no compliance risk — drawing on Copywriting Agent metadata and a residual pattern check.

**High score (80–100):** Copywriting Agent compliance passed with no errors. No residual risk patterns detected on re-check. No sensitive claim types present. No compliance-adjacent language that narrowly avoided a flag.

**Medium score (50–79):** Copywriting Agent compliance passed, but the version contains patterns that are near compliance thresholds — e.g., strong implication of savings without a specific dollar figure, or language that is adjacent to urgency without technically triggering the urgency check.

**Low score (below 50):** Copywriting Agent compliance failed for this version, or the residual check identifies patterns that the initial check missed. Any compliance error from the Copywriting Agent that was not resolved by retry results in a low compliance confidence score.

**Common failure patterns:**
- Language implying guaranteed results without using a literal "guaranteed" phrase
- Subject line that implies savings even when the body does not claim them
- Borderline urgency framing
- Partner reference that is technically compliant but reads as an endorsement

**Data used:** `version.compliance_passed`, `version.compliance_errors`, `version.compliance_notes_applied`, residual pattern check against the body and subject text.

**Note:** The Copywriting Agent's compliance result is authoritative. The Quality Review Agent does not override it. A version that failed CA compliance and was not retried successfully cannot score above 40 on compliance confidence regardless of other factors.

---

### C. CTA Clarity Score

**What is scored:** Whether the version has exactly one clear, specific, appropriately-framed call to action that matches the strategy and is appropriate for the lead's stage and sequence position.

**High score (80–100):** Exactly one CTA. CTA is specific (not vague). CTA friction is appropriate for the message type and lead stage. CTA matches or closely follows `strategy.cta`. CTA is naturally integrated, not bolted on. For cold outreach or early-sequence messages, CTA is low-friction (offer, not demand). For late-stage follow-ups, CTA may be more direct.

**Medium score (50–79):** One CTA but it is somewhat vague ("let me know" without specificity), or it is present but slightly diverges from `strategy.cta`, or friction level is slightly mismatched to the stage.

**Low score (below 50):** Multiple CTAs (creating confusion), or no CTA present, or CTA is so vague as to be meaningless ("reach out anytime"), or CTA is overly aggressive for the stage.

**Common failure patterns:**
- Closing with "let me know" as the only CTA with no specific ask
- Including both "share your statement" and "schedule a call" — two competing asks
- Using an aggressive CTA for a cold outreach
- CTA buried in a paragraph rather than clearly placed
- CTA asks for something different from what the strategy specified

**Data used:** `strategy.cta`, `strategy.lead_stage`, `strategy.sequence_position`, `strategy.message_type`, body and subject text analysis.

---

### D. Specificity / Personalization Score

**What is scored:** Whether the version uses available context accurately and naturally to feel specific to this lead, without inventing details or being over-generic.

**High score (80–100):** Available personalization context (company name, industry segment, processing volume tier, proof point, event notes, partner context) is used accurately and naturally. References to industry or context feel earned, not forced. No invented details. No excessive name-dropping. Body feels specific to this business, not a mass template.

**Medium score (50–79):** Some available context is used but inconsistently. Company name may be used but industry reference is absent when it was available. Or personalization is present but feels mechanical.

**Low score (below 50):** Version is generic despite significant available context. Uses "your business" when company name was available. Ignores `industry_segment` when it was a strong signal. Or the version invents a specific detail not present in the strategy.

**Common failure patterns:**
- Opening with a generic processing statement when industry-specific framing was available
- Using a company name so frequently it reads as a mail merge artifact
- Claiming a specific dollar or percentage without it being present in the strategy
- Ignoring `proof_point` when the strategy provided one

**Data used:** `strategy.company_id`, `strategy.industry_segment`, `strategy.processing_volume_tier`, `strategy.proof_point`, `strategy.pain_point_hypothesis`, `strategy.audience_context`, `strategy.partner_membership`, `version.personalization_used`, `version.personalization_gaps`, `strategy.personalization_level`.

---

### E. Tone Fit Score

**What is scored:** Whether the version's communication tone matches the strategy-specified tone, avoids AI/corporate language, and maintains appropriate warmth for the message type.

**High score (80–100):** Version matches `strategy.tone` precisely. For `executive_brevity`: short, direct, minimal filler, no unnecessary warmth, professional. For `warm_conversational`: natural, professionally warm, responsive, not sycophantic or rambling. No AI-sounding phrases detected. Paragraph length and density appropriate.

**Medium score (50–79):** Tone is generally appropriate but contains a few elements that dilute it.

**Low score (below 50):** Tone significantly contradicts strategy specification.

**Common failure patterns (all tones):**
- "I hope this email finds you well" — banned phrase and tone violation
- "I wanted to circle back"
- "Per my previous email"
- "As mentioned previously"
- "Checking in to see if you had a chance to review"
- "I'm reaching out because" — unnecessary filler preamble
- Opening with "My name is [name]" in most contexts

**Data used:** `strategy.tone`, `strategy.message_type`, skill definition tone rules, anti-pattern lists from skill definitions.

---

### F. Differentiation Score

**What is scored:** Whether this version offers a meaningfully distinct angle compared to the other versions in the same strategy run, beyond synonym rewrites or surface structural changes.

**High score (80–100):** Version uses a distinctly different opening approach, framing, or emphasis from all other versions. Differentiation profile shows at least 3 of the 8 dimensions differing. Version's angle is coherent — it's different in a purposeful way that serves the strategy.

**Medium score (50–79):** Version is differentiated in 2 dimensions from at least one sibling version (meets the Copywriting Agent's minimum), but the differentiation is less pronounced.

**Low score (below 50):** Version is too similar to at least one sibling version — same opening structure, same framing, only surface-level word changes. Or the version's differentiation is in an irrelevant dimension while the core angle is identical.

**Common failure patterns:**
- Two versions with different `strategy_angle` labels but near-identical body structure
- A "warm" version and a "direct" version that are identical in content with only different closings

**Note:** A version that is highly differentiated but fails strategic fit does not receive a high composite score. Differentiation is necessary but not sufficient for quality.

**Data used:** `version.differentiation_profile`, `version.strategy_angle`, `version.generation_notes`, comparison against sibling version differentiation profiles.

---

### G. Subject / Body Consistency Score

**What is scored:** Whether the subject line accurately and faithfully represents the body's content and CTA, whether preview text supports the subject, and whether there are any contradictions.

**High score (80–100):** Subject line accurately reflects the body's primary message and CTA. Preview text supports the subject. Body fulfills the promise implied by the subject. No contradictions. Subject is not misleading, too generic, or too urgent relative to body content.

**Medium score (50–79):** Subject is generally aligned with body but may be slightly more vague or slightly stronger than the body justifies.

**Low score (below 50):** Subject line implies something different from what the body contains. Or there is a direct contradiction.

**Common failure patterns:**
- Subject says "What we found in your statement" but body is a general review offer without findings
- Subject implies urgency that is not present in the body
- Subject uses partner reference that the body doesn't support
- Subject says "review complete" when body does not contain findings

**Data used:** `version.subject_line`, `version.preview_text`, `version.body_text`, content analysis.

---

### H. Readability Score

**What is scored:** Whether the version is clear, concise, easy to read, appropriately structured, and within an appropriate length range for its message type.

**High score (80–100):** Short paragraphs (2–3 sentences maximum). Clear, direct sentences. No dense walls of text. No unnecessary jargon. Length is appropriate for the message type. Natural progression from opening to CTA. Easy to scan on mobile.

**Medium score (50–79):** Generally readable but has one paragraph that is too long, or overall length is 20–30% above the appropriate range, or contains a few jargon terms.

**Low score (below 50):** Multiple long dense paragraphs. Significantly over or under the appropriate length range. Confusing structure.

**Length guidance by message type (approximate targets):**

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

**Data used:** `version.body_text`, word count, paragraph count, sentence length analysis, `strategy.length_target`, `strategy.message_type`.

---

## 6. Composite Score Model

### Default Dimension Weights

| Dimension | Weight |
|-----------|--------|
| Strategic Fit | 20% |
| Compliance Confidence | 20% |
| CTA Clarity | 15% |
| Specificity / Personalization | 15% |
| Tone Fit | 10% |
| Differentiation | 10% |
| Subject / Body Consistency | 5% |
| Readability | 5% |
| **Total** | **100%** |

### Weighted Composite Formula

```
composite_score = (
  strategic_fit_score            * 0.20 +
  compliance_confidence_score    * 0.20 +
  cta_clarity_score              * 0.15 +
  specificity_score              * 0.15 +
  tone_fit_score                 * 0.10 +
  differentiation_score          * 0.10 +
  subject_body_consistency_score * 0.05 +
  readability_score              * 0.05
)
```

This produces a float which is rounded to the nearest integer before penalty application.

### Risk Score Note

`risk_score` is lower-is-better. A score of 0 means no risk flags are present. A score approaching 100 means maximum accumulated risk. `risk_score` is not averaged into `composite_score` — it is used exclusively for penalty caps and subtractions (per the table below) and for human reviewer visibility in the `quality_review` record.

`risk_score` is calculated as the sum of flag severity points, capped at 100:
- Critical flag: +40 points
- High flag: +20 points
- Medium flag: +10 points
- Low flag: +3 points

### Risk Penalty Model

Risk penalties are applied to the pre-penalty composite score after all dimension scores are weighted. Penalties apply based on the **highest-severity risk flag** present on the version.

| Highest Risk Flag Severity | Effect |
|---------------------------|--------|
| Critical | Cap composite_score at 49 (regardless of weighted score) |
| High | Cap composite_score at 69 (regardless of weighted score) |
| Medium | Subtract 10 points (minimum floor: 0) |
| Low | Subtract 3 points (minimum floor: 0) |

If a version has multiple risk flags of different severities, only the highest severity cap applies (cap takes precedence over subtraction). Multiple flags of the same severity are additive on the subtraction model only:
- Two medium flags: subtract 20 points
- Three low flags: subtract 9 points
- One high + two medium: apply 69 cap only (cap takes precedence)

### Score Bands

| Composite Score | Band | Label |
|----------------|------|-------|
| 90–100 | excellent | Excellent |
| 80–89 | strong | Strong |
| 70–79 | usable | Usable |
| 50–69 | needs_review | Needs Review |
| 0–49 | do_not_use | Do Not Use |

### Advisory Note

The composite score and score band are advisory signals. They inform human review. They do not trigger sending, approval, or any automated action. Human approval is required for all messages regardless of composite score.

---

## 7. Version Ranking Rules

### Primary Ranking Rule

Versions in a strategy run are ranked by `composite_score` descending. Rank 1 = highest score.

### Tie-Breaker Rules (applied in order)

1. **Lower risk wins:** If two versions are within 3 composite score points of each other, the version with the lower `risk_score` wins.
2. **Stronger strategic fit wins:** If risk is equal, the version with the higher `strategic_fit_score` wins.
3. **Stronger CTA wins:** If strategic fit is equal, the version with the higher `cta_clarity_score` wins.
4. **Stronger specificity wins:** If CTA is equal, the version with the higher `specificity_score` wins.
5. **Lower version number wins:** If all scores are equal, prefer the version with the lower `version_number`.

### is_recommended Assignment

Exactly one version per strategy run may have `is_recommended = true`. The following blocking conditions prevent a version from being recommended regardless of rank:

| Blocking Condition | Effect |
|-------------------|--------|
| Any critical risk flag | Cannot be recommended |
| `composite_score` < 70 (when at least one version scores ≥ 70) | Cannot be recommended |
| `compliance_passed = false` on the Copywriting Agent record | Cannot be recommended |
| `approval_status = superseded` | Cannot be reviewed or recommended |

### When No Version Can Be Recommended

If all versions in the strategy run score below 70, or all have blocking risk flags, no version receives `is_recommended = true`. In this case:

- All versions receive `is_recommended = false`
- `human_review_notes` on all versions states: "No version meets the minimum quality threshold for recommendation. Human review is required to select, edit, or regenerate versions."

If no version is recommended because all are below 70 or all have blocking risk, the agent run still succeeds. All `quality_review` records are written. All versions receive `is_recommended = false`. The absence of a recommendation is a valid, meaningful output — it signals that human intervention (edit, regeneration, or rejection) is needed before a version should be considered. The agent does not fail, retry, or escalate automatically.

### Recommendation Reasoning

The recommended version's `human_review_notes` should include a ranking rationale explaining:
- Why this version was recommended over its siblings
- What its primary strengths are
- What, if anything, a human reviewer should watch for

---

## 8. Risk Flag Model

Risk flags are identified by the Quality Review Agent during its evaluation pass. Each flag has a code, severity, trigger condition, score effect, and a human-readable message.

### Severity Levels

| Severity | Description |
|----------|-------------|
| `critical` | Blocks recommendation; caps composite at 49 |
| `high` | Blocks recommendation; caps composite at 69 |
| `medium` | Does not block; subtracts 10 from composite |
| `low` | Does not block; subtracts 3 from composite |

### Compliance Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-001` | critical | Banned phrase detected in subject or body | A globally banned phrase was detected. This version must not be sent. |
| `RFL-002` | high | Deceptive urgency language detected | Urgency language ("limited time", "act now") detected. Remove before consideration. |
| `RFL-003` | high | Guaranteed outcome language detected | Language implying guaranteed results detected. This is a compliance violation. |
| `RFL-004` | critical | Specific dollar amount without `offer_angle = confirmed_savings_review` | Dollar savings claim without calculated data. This is an unsupported claim. |
| `RFL-005` | high | Specific percentage claim without `offer_angle = confirmed_savings_review` | Percentage savings claim without supporting data. |
| `RFL-006` | high | Inbound acknowledgment language on a cold lead, or cold discovery language on an inbound lead | Lead source and copy framing are mismatched. Risk of appearing out of touch with the lead's origin. |
| `RFL-007` | critical | Partner name (CertainPath, BCSG, etc.) without `partner_membership.confirmed = true` | Partner reference without confirmed membership. Potential false affiliation claim. |
| `RFL-008` | high | Exclusivity or preferred-partner claim | "Exclusive partner", "preferred partner", or similar claim is never authorized in v1. |
| `RFL-009` | critical | "Review complete" or "completed the review" language without `message_type = statement_review_follow_up` AND findings context | Review-complete language without proper findings context. Potentially false claim. |

### Content Accuracy Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-010` | critical | Version claims a specific finding not present in `strategy.proof_point` or `strategy.pain_point_hypothesis` | Invented finding detected. The version references a specific result not supported by the strategy's proof point. |
| `RFL-011` | critical | Version references specific conversation details when `conversationNotes` is null in lead context | Fabricated conversation reference. No conversation notes exist to support this claim. |
| `RFL-012` | critical | Specific metric (rate, amount, percentage) in body with no basis in strategy context | Unsupported specific metric detected. |

### Tone and Fit Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-013` | medium | Detected tone significantly contradicts `strategy.tone` | Tone mismatch. The version's tone does not match the strategy's specified tone requirement. |
| `RFL-014` | medium | AI/corporate language pattern detected | Corporate or AI-sounding language detected. |
| `RFL-015` | medium | Guilt-tripping or passive-aggressive language in follow-up | Relationship risk. Language that may come across as pressuring or guilt-tripping. |
| `RFL-016` | medium | CTA friction level too high for message type and stage | CTA is too aggressive for the lead's stage and message type. Consider a lower-friction ask. |

### Consistency Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-017` | high | Subject line implies content different from body | Subject/body mismatch. The subject line sets an expectation the body does not fulfill. |
| `RFL-018` | low | Subject line is overly generic | Subject line is generic and does not reflect the version's specific angle. |
| `RFL-019` | medium | Preview text does not support subject line | Preview text and subject line are inconsistent. |

### Differentiation Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-020` | medium | Version is insufficiently differentiated from a sibling version (fewer than 2 dimensions differ) | Weak differentiation. This version is too similar to another version in this run. |
| `RFL-021` | high | Version appears to be a synonym rewrite — same angle, same structure, only surface word changes | Suspected synonym rewrite. This version does not offer a meaningfully different approach from its sibling. |

### Personalization Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-022` | low | Company name or merchant name used more than 3 times in body | Over-personalization. Frequent name usage reads as a mail merge artifact. |
| `RFL-023` | medium | Significant context was available (industry, proof point, partner) but was not used | Generic despite available context. The version did not use context that was available and could improve specificity. |

### Relationship and Sequence Risk Flags

| Code | Severity | Trigger Condition | Message |
|------|----------|------------------|---------|
| `RFL-024` | medium | Version angle is the same as a prior sent message in the sequence | Sequence fatigue risk. This version takes the same angle as a prior message. |
| `RFL-025` | medium | Language patterns that risk damaging the lead relationship | Relationship risk. This version contains language that may come across poorly given the lead's history or current stage. |

---

## 9. Compliance Review Relationship

The Copywriting Agent performs hard compliance validation before storing any `message_version`. If a version fails compliance, the retry coordinator attempts regeneration. A version that fails compliance after all retry attempts is stored with `compliance_passed = false`.

### What the Quality Review Agent Does with Compliance Data

The Quality Review Agent does not replace or re-run the Copywriting Agent's compliance validator. It:

1. Reads `version.compliance_passed` and `version.compliance_errors` — these are authoritative
2. Sets `compliance_confidence_score` based on these results and a residual pattern check
3. Adds compliance-related risk flags if the residual check identifies patterns that narrowly escaped the Copywriting Agent's hard checks
4. Reports compliance metadata verbatim in `compliance_flags`

### Key Rules

- The Quality Review Agent **never clears** a Copywriting Agent compliance error
- A version with `compliance_passed = false` cannot receive a `compliance_confidence_score` above 40
- A version with `compliance_passed = false` cannot be marked `is_recommended = true`
- The Quality Review Agent's compliance confidence score is an advisory signal — it is not a legal determination and does not replace human review of compliance-sensitive content

### Residual Pattern Check

The residual check looks for patterns that are near compliance boundaries:
- Language that implies urgency without using a literal urgency phrase
- Subject lines that imply savings without the body making a claim
- Partner-adjacent language that does not name a partner but implies affiliation
- Language implying a review has been completed in a non-review message

These patterns do not retroactively fail a version's compliance. They reduce the `compliance_confidence_score` and may trigger medium-severity risk flags.

---

## 10. Strategic Fit Review

The strategic fit evaluation verifies that the version faithfully executes the strategy's intent. It is the highest-weighted dimension (20%) because a version that fails strategic alignment is not useful regardless of how well it is written.

### Evaluation Checklist

| Check | Pass Condition |
|-------|---------------|
| Message type framing | Version opens and frames the message consistently with the strategy's message type |
| Primary goal alignment | Version's body serves the primary goal |
| Offer angle reflection | The specific offer angle is clearly present in the copy |
| CTA match | The CTA in the body matches or closely follows `strategy.cta` |
| Tone direction | The body's tone is directionally aligned with `strategy.tone` |
| Required inclusions | All required inclusions are present (per `version.required_inclusions_satisfied`) |
| Avoid list compliance | No avoid-list items appear (per `version.avoided_elements_checked`) |
| Proof point integration | If `strategy.proof_point` is present, it is referenced or reflected in the version |
| Pain point integration | If `strategy.pain_point_hypothesis` is present, the opening or body addresses that pain |
| Skill adherence | The version follows the selected skill's messaging rules |
| Audience context use | If `strategy.audience_context` contains meaningful signals, the version reflects them |

### Scoring Rule

A version that passes all 11 checks scores in the 85–100 range. Each failed check reduces the score. Critical checks (CTA match, avoid list compliance, required inclusions) carry more weight than supporting checks (proof point integration, audience context use).

---

## 11. CTA Review

### CTA Evaluation Rules

**Single CTA requirement:** The body text must contain exactly one primary call to action. Multiple CTAs create decision friction and score low on `cta_clarity_score`. The presence of two or more competing asks triggers `RFL-016`.

**CTA specificity:** The CTA must be specific enough for the recipient to know exactly what action to take:
- Acceptable: "Share your most recent processing statement and we'll put together a free review."
- Borderline: "Let me know if you'd like to move forward."
- Unacceptable: "Let me know." / "Reach out anytime." / "Happy to chat."

**CTA friction model:**

| Lead Stage / Sequence | Appropriate Friction |
|----------------------|---------------------|
| Cold, first contact | Low — offer, not demand |
| Cold, second contact | Low to medium — clear ask |
| Inbound inquiry response | Medium — advancing to next step |
| Statement follow-up | Medium — specific next action |
| Proposal follow-up | Medium to high — decision ask |
| Late-sequence / no-response | Low — graceful exit or minimal ask |
| Re-engagement | Low — fresh reason, low pressure |
| Customer nurture | Medium — account review offer |

**CTA-message type mapping:**

| Message Type | Expected CTA Type |
|-------------|------------------|
| cold_outreach | Share statement / Accept review offer |
| new_inquiry_response | Confirm next step / Schedule call |
| statement_submitted_confirmation | Await review / No CTA or acknowledgment |
| statement_review_follow_up | Review findings / Schedule proposal call |
| statement_not_submitted_follow_up | Share statement / Graceful close |
| proposal_follow_up | Decision ask / Address objection |
| no_response_follow_up | Minimal ask / Changed angle ask |
| re_engagement | Fresh ask / Reconnect offer |
| partner_member_specific_campaign | Accept review / Leverage membership |
| event_expo_follow_up | Schedule call / Continue conversation |
| referral_request | Referral ask |
| customer_nurture | Account review / Check-in |

---

## 12. Personalization Review

### Personalization Context Availability Tiers

| Tier | Available Context | Expectation |
|------|-----------------|-------------|
| High | Company name, industry, proof point, processing tier | All available context should be reflected naturally |
| Medium | Company name, industry | Industry-specific framing and name use expected |
| Low | Company name only | Name use and general industry inference acceptable |
| Minimal | No context | Generic framing is acceptable; score cannot exceed 70 |

### Scoring Criteria

**Uses context accurately and naturally:** Company name used once or twice naturally. Industry segment reflected in the opening or problem framing. Proof point or review findings woven into the body (not just appended). Partner context used naturally if confirmed.

**Avoids invented details:** No specific metric or finding that is not present in `strategy.proof_point` or `strategy.pain_point_hypothesis`. No reference to a conversation that did not occur.

**Avoids over-personalization:** Company name is not used more than 3 times in the body. The version does not read as a mail merge output.

**Personalization gaps flagged:** If the strategy provided a `proof_point` and the version's `personalization_gaps` includes `proof_point`, the specificity score is penalized because the generator had the data and did not use it.

---

## 13. Tone Review

### Tone Definitions

**executive_brevity:**
- Short, declarative sentences
- Minimal filler or preamble
- No unnecessary warmth or pleasantries
- One clear CTA
- Reads as if written by a busy professional to a busy professional

**warm_conversational:**
- Professionally warm, not sycophantic
- Natural sentence flow, not stiff or corporate
- Empathetic framing appropriate for the lead's situation
- Slightly longer than executive_brevity is acceptable
- Not rambling — still purposeful

### AI/Corporate Language Flags (always RFL-014)

The following patterns indicate AI-generated or corporate-template language and always trigger `RFL-014`:

- "I hope this email finds you well" / "I hope you're doing well"
- "I wanted to circle back"
- "Per my previous email" / "As per my last"
- "As mentioned previously" / "As I mentioned"
- "I'm reaching out because" (weak preamble)
- "I'm following up on my previous message"
- "Please don't hesitate to reach out" (generic closer)
- "I look forward to hearing from you" (generic closer)
- "Feel free to reach out at any time"
- "Thank you for your time and consideration"

### Guilt Language Flags (always RFL-015 for follow-ups)

In follow-up message types, these patterns trigger `RFL-015`:
- "I haven't heard from you"
- "I was hoping to hear back"
- "You must be busy"
- "I don't want to bother you but"
- "Just wanted to make sure this didn't fall through the cracks"

---

## 14. Differentiation Review

The Copywriting Agent has already validated that each version's differentiation profile differs from its siblings by at least 2 dimensions. The Quality Review Agent builds on this with a deeper evaluation.

### How the Quality Review Agent Evaluates Differentiation

1. **Read the differentiation profile:** Each version has a `differentiation_profile` JSON object. The QRA reads these profiles for all versions in the run.

2. **Compare profiles:** The QRA performs the same pairwise comparison as the Copywriting Agent to confirm the 2-dimension minimum was met. If not met, `RFL-020` is flagged.

3. **Score the quality of differentiation:** Meets the minimum ≠ high differentiation score. The QRA evaluates:
   - Is the differentiation in meaningful dimensions (opening approach, problem framing, CTA framing) or trivial dimensions?
   - Does the version's angle represent a coherent and strategically useful alternative to its siblings?

4. **Flag synonym rewrites:** If two versions have different `strategy_angle` labels but their body text is structurally near-identical, `RFL-021` is flagged on the weaker version.

5. **Penalize purposeless differentiation:** A version that is highly differentiated from its siblings but fails strategic fit is not rewarded for differentiation.

### Differentiation Score Relationship to Composite

- **High differentiation + high strategic fit:** Strong composite contribution
- **High differentiation + low strategic fit:** Differentiation score high, but composite still low due to strategic fit weight
- **Low differentiation:** Reduces differentiation_score, triggers `RFL-020` or `RFL-021` if severe

---

## 15. Subject / Preview / Body Consistency Review

### Consistency Evaluation Rules

**Subject line accuracy:** The subject line must accurately represent the body's primary message. It must not:
- Claim findings that the body does not contain
- Imply savings that the body does not discuss
- Reference a conversation that the body does not address
- Suggest urgency that the body does not support
- Be so generic that it bears no relationship to the version's specific angle

**Preview text alignment:** The preview text must:
- Not contradict the subject line
- Not reveal information that undercuts the subject's approach
- Support the overall message arc (subject → preview → body)

**Body fulfills subject promise:** If the subject says "What we found in your statement," the body must contain review findings. Subject promises are binding.

**Review-complete contradiction:** A subject line containing "review complete" when the body does not contain findings triggers `RFL-009` (critical) in addition to the subject/body mismatch flag.

**Partner contradiction:** A subject line referencing a partner when the body contains no partner context is a consistency failure.

---

## 16. Message Type Review Rules

For each message type, the Quality Review Agent applies weighted emphasis to specific dimensions.

---

### MT-1: cold_outreach

**Primary focus:** Specificity, strategic fit, CTA appropriateness

- Specificity/personalization weight is elevated: a generic cold outreach fails regardless of other scores
- CTA must be low-friction: offer a review, do not demand a decision
- Any specific dollar or savings claim without `offer_angle = confirmed_savings_review` → `RFL-004` (critical)
- Industry context should be reflected when `strategy.industry_segment` is available
- Penalty: version opens with weak preamble ("I wanted to reach out")

---

### MT-2: new_inquiry_response

**Primary focus:** Strategic fit (acknowledging inquiry), tone, CTA

- Version must acknowledge the inquiry context without using banned inbound phrases
- Cold discovery language → `RFL-006` (high)
- CTA should advance to the specific next step
- Tone is typically `warm_conversational` for inbound leads
- Penalty: version treats this like a cold outreach (no acknowledgment of inquiry context)

---

### MT-3: statement_submitted_confirmation

**Primary focus:** Accuracy of claims, tone, absence of findings language

- Version must NOT contain review findings — statement received but not reviewed
- Any findings or "review complete" language → `RFL-009` (critical)
- Should express receipt of statement and set expectations for next steps
- Reward: version provides a clear expectation-setting timeline

---

### MT-4: statement_review_follow_up

**Primary focus:** Accuracy of findings references, strategic fit, CTA

- Version should reference findings from `strategy.proof_point` or `strategy.pain_point_hypothesis`
- Any finding claim not supported by strategy context → `RFL-010` (critical)
- Dollar savings claims without `offer_angle = confirmed_savings_review` → `RFL-004` (critical)
- CTA should advance toward next step (schedule call, review proposal)
- "Review complete" language is permitted when findings context is present in strategy

---

### MT-5: statement_not_submitted_follow_up

**Primary focus:** Tone (low pressure), CTA friction (appropriate for sequence position), differentiation

- Must not pressure, guilt, or express frustration
- Early sequence: low-friction restate of the offer
- Late sequence: graceful exit option acceptable and rewarded
- Guilt language → `RFL-015`; urgent CTA → `RFL-016`
- Reward: version reduces friction or offers to answer questions

---

### MT-6: proposal_follow_up

**Primary focus:** Brevity, CTA directness, absence of false urgency

- Version should be short (60–100 words target)
- CTA should focus on decision status or objection clarification
- False urgency → `RFL-002` (high)
- Readability weight is elevated; penalty for introducing new content not in proposal context

---

### MT-7: no_response_follow_up

**Primary focus:** Differentiation from prior messages, brevity, tone

- Must take a meaningfully different angle from any prior sent messages
- If prior angles are available, `RFL-024` flags any repeat
- Shorter is rewarded (60–100 words)
- No guilt language; changed angle versions score higher on differentiation

---

### MT-8: re_engagement

**Primary focus:** Time gap acknowledgment, fresh reason, tone

- Should acknowledge time since last contact lightly — context, not guilt
- Must provide a fresh reason to reconnect
- Guilt language → `RFL-015`
- Penalty: version treats lead as if no prior relationship exists

---

### MT-9: partner_member_specific_campaign

**Primary focus:** Partner context accuracy, compliance, specificity

- Partner name requires `partner_membership.confirmed = true` — without it, `RFL-007` (critical)
- Partner should be referenced as context/credential, not exclusive endorsement
- Exclusivity claims → `RFL-008` (high)
- Reward: partner context used naturally as shared context

---

### MT-10: event_expo_follow_up

**Primary focus:** Event context accuracy, conversation accuracy, specificity

- Event name should be used naturally
- Any reference to specific conversation content requires `conversationNotes` — without it, `RFL-011` (critical)
- Version should feel like a personal follow-up, not a templated outreach

---

### MT-11: referral_request

**Primary focus:** Relationship basis, specificity of ask, tone

- The version must establish a relationship basis for the referral request
- Ask must be specific — who to refer, what they'd be referred for
- Penalty: version reads as if asking a stranger for a referral
- Reward: builds from natural relationship, specific ask, grateful tone

---

### MT-12: customer_nurture

**Primary focus:** Relationship tone, absence of prospecting language, appropriate CTA

- Version must feel written to an existing customer, not a prospect
- Cold outreach framing for an existing customer → `RFL-006`
- CTA should be account review offer or relationship check-in
- Penalty: version reads as a cold outreach to an existing account

---

## 17. Invalid Quality Review Conditions

The following conditions block the Quality Review Agent from proceeding. Each produces a QRA error code returned to the agent orchestrator.

| Code | Condition | Explanation | Can Review Proceed? |
|------|-----------|-------------|-------------------|
| `QRA_001` | `message_strategy` record not found | Strategy ID is invalid or does not exist for this tenant | No |
| `QRA_002` | No `message_version` records found for this strategy | Strategy not run through Copywriting Agent, or all versions superseded | No |
| `QRA_003` | A version's `strategy_id` does not match the target strategy | Data integrity error — version belongs to a different strategy | Version excluded; review may proceed if other valid versions exist |
| `QRA_004` | A version's `tenant_id` does not match the strategy's `tenant_id` | Tenant isolation violation | No — full review blocked |
| `QRA_005` | A version has `approval_status = superseded` | Superseded versions are not available for review | Version excluded; review proceeds if other valid versions exist |
| `QRA_006` | A version has an empty or null `body_text` | Body text is required for evaluation | Version excluded; review proceeds if other valid versions exist |
| `QRA_007` | A version has an empty or null `subject_line` | Subject line is required for evaluation | Version excluded; review proceeds if other valid versions exist |
| `QRA_008` | A version has a non-null `body_html` | In v1, `body_html` must be null; populated value indicates a generation error | Version excluded; `QRA_008` logged; review proceeds if other valid versions exist |
| `QRA_009` | `strategy.invalid_reasons` is non-empty | Strategy was flagged as invalid by the Message Strategy Agent | No |
| `QRA_010` | `global_agent_pause = true` | System control is pausing all agent activity | No |
| `QRA_011` | `email_generation_engine != 'phase3b'` | Workspace not configured for Phase 3B agents | No |
| `QRA_012` | A version has `compliance_passed = false` and `structural_passed = false` | Version failed both checks and was not corrected by retry | Version excluded; review proceeds if other valid versions exist |
| `QRA_013` | A quality_review record already exists for this version from a non-superseded run | Prevents duplicate scoring of the same version | Review for that version skipped; existing record preserved |

### Suggested Fix Notes

- `QRA_001`: Trigger the Message Strategy Agent first.
- `QRA_002`: Trigger the Copywriting Agent first, or check if all versions were superseded.
- `QRA_004`: Critical data integrity error — escalate for investigation.
- `QRA_009`, `QRA_010`, `QRA_011`: Fix system configuration or strategy validity before proceeding.

---

## 18. Agent Output Format

The following examples illustrate quality_review output across eight scenarios. Body content is summarized only — no full email bodies are included.

---

### Example 1: cold_outreach — Four Versions Ranked

**Strategy context:** HVAC company, cold lead, manual source, pain_point_hypothesis = "paying interchange+ on all transactions", proof_point = "HVAC industry avg effective rate 2.8%", cta = "share your most recent processing statement for a free review", tone = executive_brevity.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | industry_specific_question | 91 | Excellent | None | Yes |
| D | ultra_direct | 90 | Excellent | None | No |
| B | statement_review_offer | 84 | Strong | RFL-023 low | No |
| C | skepticism_aware_advisor | 77 | Usable | RFL-014 low | No |

**Key scores for Version A:**

| Dimension | Score |
|-----------|-------|
| Strategic Fit | 90 |
| Compliance Confidence | 97 |
| CTA Clarity | 88 |
| Specificity | 92 |
| Tone Fit | 91 |
| Differentiation | 88 |
| Subject/Body Consistency | 92 |
| Readability | 92 |

**Ranking:** A (91) → D (90) → B (84) → C (77)
**Recommended:** Version A
**Reasoning:** "Version A scores highest on specificity and strategic fit, using industry context and proof point most naturally. Version D is a close alternative — stronger on readability and CTA clarity, weaker on personalization depth. Version B is solid but generic. Version C is usable but the preamble reduces tone fit."

---

### Example 2: new_inquiry_response — Three Versions Ranked

**Strategy context:** Inbound lead (website source), HVAC, tone = warm_conversational, cta = "confirm a time for a 15-minute statement review".

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | warm_inquiry_response | 86 | Strong | None | Yes |
| B | advance_next_step | 82 | Strong | RFL-013 medium (-10) | No |
| C | advisor_education | 74 | Usable | RFL-014 low (-3) | No |

**Note:** Version B pre-penalty composite = 92, reduced to 82 by RFL-013 medium penalty.

---

### Example 3: statement_submitted_confirmation — Two Versions Ranked

**Strategy context:** Statement received, awaiting review, tone = warm_conversational.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | professional_confirmation | 88 | Excellent | None | Yes |
| B | warm_reassurance | 76 | Usable | RFL-014 low (-3) | No |

**Note:** If either version contained findings language, `RFL-009` (critical) would cap composite at 49.

---

### Example 4: statement_review_follow_up — Three Versions Ranked

**Strategy context:** Statement reviewed, proof_point = "effective rate 3.1%, HVAC industry avg 2.6%", cta = "schedule a 20-minute call to walk through findings", tone = executive_brevity.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | findings_first | 90 | Excellent | None | Yes |
| B | advisor_explanation | 83 | Strong | None | No |
| C | proposal_next_step | 64 | Needs Review | RFL-023 medium (-10) | No |

**Note:** Version C pre-penalty composite = 74, reduced to 64 by RFL-023 for not using proof_point.

---

### Example 5: no_response_follow_up — Four Versions Ranked

**Strategy context:** Two prior messages with no response, cold lead, cta = "just a simple yes or no — worth a quick look?", prior angles: industry_specific_question, statement_review_offer.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | changed_angle | 84 | Strong | None | Yes |
| B | minimal_question | 81 | Strong | None | No |
| C | brief_reframe | 67 | Needs Review | RFL-024 medium (-10) | No |
| D | graceful_sequence_exit | 72 | Usable | None | No |

---

### Example 6: partner_member_specific_campaign — Three Versions Ranked

**Strategy context:** Confirmed BCSG member, partner_membership.confirmed = true, tone = warm_conversational.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | partner_shared_context | 85 | Strong | None | Yes |
| B | home_services_operational | 76 | Usable | RFL-023 low (-3) | No |
| C | statement_clarity_partner | 49 | Do Not Use | RFL-008 high (cap 69) + RFL-022 low | No |

---

### Example 7: event_expo_follow_up with conversation notes — Three Versions Ranked

**Strategy context:** Met at TradeX 2026, conversationNotes present, proof_point = "industry average 2.7%", tone = warm_conversational.

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | event_conversation_reference | 87 | Strong | None | Yes |
| B | event_topic_followup | 82 | Strong | None | No |
| C | event_direct_ask | 77 | Usable | None | No |

**Note:** If conversationNotes were null and any version referenced specific conversation content, `RFL-011` (critical) would cap composite at 49.

---

### Example 8: customer_nurture — Two Versions Ranked

**Strategy context:** Active customer, tone = warm_conversational, cta = "schedule a brief account review".

| Version | Angle | Composite | Band | Risk Flags | Recommended |
|---------|-------|-----------|------|------------|-------------|
| A | account_review_offer | 83 | Strong | None | Yes |
| B | seasonal_operational | 74 | Usable | RFL-013 low (-3) | No |

---

## 19. Test Case Suite

Each test case uses the following structure: Test ID, Scenario, Input strategy summary, Input versions summary, Expected scores/bands, Expected ranking, Expected risk flags, Expected recommendation, Pass/fail criteria.

---

**TC-QRA-001**
**Scenario:** Cold outreach — industry-specific version ranks highest
**Strategy:** cold_outreach, HVAC, proof_point available, executive_brevity
**Versions:** A = industry-specific angle with proof point; B = generic statement review offer
**Expected scores:** A composite ≥ 85; B composite ≤ 78
**Expected ranking:** A > B
**Expected risk flags:** None on A; RFL-023 on B
**Expected recommendation:** Version A
**Pass criteria:** A is recommended; B specificity_score at least 7 points lower than A

---

**TC-QRA-002**
**Scenario:** Cold outreach — generic version penalized
**Strategy:** cold_outreach, HVAC, industry_segment available, executive_brevity
**Versions:** A = industry-specific; B = fully generic ("helps businesses of all sizes")
**Expected scores:** B specificity_score ≤ 55; B composite ≤ 70
**Expected ranking:** A > B
**Expected risk flags:** RFL-023 (medium) on B
**Expected recommendation:** A
**Pass criteria:** B composite penalized at least 10 points; band ≤ usable

---

**TC-QRA-003**
**Scenario:** Cold outreach — unsupported savings claim gets critical risk and score cap
**Strategy:** cold_outreach, offer_angle ≠ confirmed_savings_review
**Versions:** A = standard review offer; B = body contains "$400/month in savings"
**Expected scores:** B composite capped at 49; A composite ≥ 75
**Expected ranking:** A > B
**Expected risk flags:** RFL-004 (critical) on B
**Expected recommendation:** A
**Pass criteria:** B is_recommended = false; B composite ≤ 49; B band = do_not_use

---

**TC-QRA-004**
**Scenario:** Inbound inquiry — cold discovery language penalized
**Strategy:** new_inquiry_response, lead_source = website, warm_conversational
**Versions:** A = proper inbound response; B = contains "I came across your business online"
**Expected scores:** B compliance_confidence_score ≤ 40; B composite capped at 69
**Expected ranking:** A > B
**Expected risk flags:** RFL-006 (high) on B
**Expected recommendation:** A
**Pass criteria:** RFL-006 on B; B composite ≤ 69; B is_recommended = false

---

**TC-QRA-005**
**Scenario:** Statement submitted confirmation — findings language → critical risk
**Strategy:** statement_submitted_confirmation
**Versions:** A = clean confirmation; B = contains "Based on what we found in your statement"
**Expected scores:** B composite capped at 49; A composite ≥ 80
**Expected ranking:** A > B
**Expected risk flags:** RFL-009 (critical) on B
**Expected recommendation:** A
**Pass criteria:** B is_recommended = false; B band = do_not_use

---

**TC-QRA-006**
**Scenario:** Statement submitted confirmation — clear timeline rewarded
**Strategy:** statement_submitted_confirmation, warm_conversational
**Versions:** A = confirms receipt, sets 2-business-day expectation; B = confirms receipt, no timeline
**Expected scores:** A specificity_score ≥ 82; B specificity_score ≤ 72
**Expected ranking:** A > B
**Expected risk flags:** None
**Expected recommendation:** A
**Pass criteria:** A ranks first; A specificity at least 10 points above B

---

**TC-QRA-007**
**Scenario:** Statement review follow-up — findings-first version ranks highest
**Strategy:** statement_review_follow_up, proof_point = specific finding
**Versions:** A = leads with finding; B = advisory explanation before finding; C = next step focus, no finding reference
**Expected scores:** A composite ≥ 85; C composite ≤ 70 (RFL-023 medium)
**Expected ranking:** A > B > C
**Expected risk flags:** RFL-023 (medium) on C
**Expected recommendation:** A
**Pass criteria:** A is recommended; C penalized for not using proof_point

---

**TC-QRA-008**
**Scenario:** Statement review follow-up — invented finding flagged
**Strategy:** statement_review_follow_up, proof_point = "effective rate 3.1%"
**Versions:** A = correctly uses 3.1%; B = claims "effective rate 3.8%" (not in strategy)
**Expected scores:** B composite capped at 49 (RFL-010 critical)
**Expected ranking:** A > B
**Expected risk flags:** RFL-010 (critical) on B
**Expected recommendation:** A
**Pass criteria:** RFL-010 on B; B band = do_not_use

---

**TC-QRA-009**
**Scenario:** Statement review follow-up — calculated savings handles amount reference carefully
**Strategy:** statement_review_follow_up, offer_angle = confirmed_savings_review, proof_point includes savings amount
**Versions:** A = uses savings amount from proof_point naturally; B = exaggerates amount beyond what proof_point states
**Expected scores:** A composite ≥ 82; B compliance_confidence_score ≤ 55
**Expected ranking:** A > B
**Expected risk flags:** None on A; RFL-012 on B
**Expected recommendation:** A
**Pass criteria:** A is recommended; B flagged for metric discrepancy

---

**TC-QRA-010**
**Scenario:** Statement review follow-up — dollar claim without confirmed savings
**Strategy:** statement_review_follow_up, offer_angle ≠ confirmed_savings_review
**Versions:** A = findings-first, no dollar figure; B = "you could be saving $300/month"
**Expected scores:** B composite capped at 49 (RFL-004 critical)
**Expected ranking:** A > B
**Expected risk flags:** RFL-004 (critical) on B
**Expected recommendation:** A
**Pass criteria:** B band = do_not_use

---

**TC-QRA-011**
**Scenario:** Proposal follow-up — short decision-focused version wins
**Strategy:** proposal_follow_up, sequence_position = 2, executive_brevity
**Versions:** A = 75 words, decision-status CTA; B = 180 words, introduces new context
**Expected scores:** A composite ≥ 82; A readability ≥ 90; B readability ≤ 65
**Expected ranking:** A > B
**Expected risk flags:** None on A
**Expected recommendation:** A
**Pass criteria:** A ranks first based on readability and brevity advantage

---

**TC-QRA-012**
**Scenario:** Proposal follow-up — false urgency flagged
**Strategy:** proposal_follow_up, executive_brevity
**Versions:** A = clean decision-status ask; B = contains "this offer expires at the end of the month"
**Expected scores:** B composite capped at 69 (RFL-002 high)
**Expected ranking:** A > B
**Expected risk flags:** RFL-002 (high) on B
**Expected recommendation:** A
**Pass criteria:** B cap at 69; B is_recommended = false

---

**TC-QRA-013**
**Scenario:** No-response follow-up — shorter changed-angle version wins
**Strategy:** no_response_follow_up, prior_touch_count = 2, executive_brevity
**Versions:** A = 68 words, entirely new angle; B = 145 words, slight variation of prior angle
**Expected scores:** A composite ≥ 80; B composite ≤ 70 (RFL-024 medium)
**Expected ranking:** A > B
**Expected risk flags:** RFL-024 (medium) on B
**Expected recommendation:** A
**Pass criteria:** A is recommended; B penalized by RFL-024

---

**TC-QRA-014**
**Scenario:** No-response follow-up — repeated angle penalized
**Strategy:** no_response_follow_up, prior sent angle = industry_specific_question
**Versions:** A = industry_specific_question (same as prior); B = minimal_question (new)
**Expected scores:** A differentiation_score ≤ 50; RFL-024 on A; B composite > A composite
**Expected ranking:** B > A
**Expected risk flags:** RFL-024 (medium) on A
**Expected recommendation:** B
**Pass criteria:** B is recommended; A penalized for sequence repetition

---

**TC-QRA-015**
**Scenario:** Re-engagement — guilt language penalized
**Strategy:** re_engagement, days_since_last_contact = 45, warm_conversational
**Versions:** A = acknowledges gap lightly, fresh reason; B = "I haven't heard back from you in a while"
**Expected scores:** B composite penalized 10 (RFL-015 medium)
**Expected ranking:** A > B
**Expected risk flags:** RFL-015 (medium) on B
**Expected recommendation:** A
**Pass criteria:** RFL-015 on B; A composite at least 10 points above B

---

**TC-QRA-016**
**Scenario:** Partner campaign — unconfirmed partner language → critical risk
**Strategy:** partner_member_specific_campaign, partner_membership.confirmed = false
**Versions:** A = no partner reference; B = "as a fellow BCSG member"
**Expected scores:** B composite capped at 49 (RFL-007 critical)
**Expected ranking:** A > B
**Expected risk flags:** RFL-007 (critical) on B
**Expected recommendation:** A
**Pass criteria:** B band = do_not_use; B is_recommended = false

---

**TC-QRA-017**
**Scenario:** Partner campaign — overuse of partner reference
**Strategy:** partner_member_specific_campaign, partner_membership.confirmed = true
**Versions:** A = partner mentioned once naturally; B = partner mentioned 4 times
**Expected scores:** A composite ≥ 82; RFL-022 on B (low, -3)
**Expected ranking:** A > B
**Expected risk flags:** RFL-022 (low) on B
**Expected recommendation:** A
**Pass criteria:** A recommended; B slightly penalized

---

**TC-QRA-018**
**Scenario:** Event follow-up — fabricated conversation details
**Strategy:** event_expo_follow_up, conversationNotes = null
**Versions:** A = references event only; B = "as we discussed, your rate was near 3.2%"
**Expected scores:** B composite capped at 49 (RFL-011 critical)
**Expected ranking:** A > B
**Expected risk flags:** RFL-011 (critical) on B
**Expected recommendation:** A
**Pass criteria:** RFL-011 on B; B band = do_not_use

---

**TC-QRA-019**
**Scenario:** Customer nurture — prospecting tone penalized
**Strategy:** customer_nurture, existing customer
**Versions:** A = existing customer account review framing; B = "I'd love to introduce you to what we do"
**Expected scores:** B strategic_fit_score ≤ 55; RFL-013 on B
**Expected ranking:** A > B
**Expected risk flags:** RFL-013 (medium) on B
**Expected recommendation:** A
**Pass criteria:** B penalized for wrong tone framing; A recommended

---

**TC-QRA-020**
**Scenario:** Referral request — transactional ask penalized
**Strategy:** referral_request, warm_conversational
**Versions:** A = grateful, specific, relationship-based ask; B = "I'll offer you a discount if you refer someone"
**Expected scores:** B tone_fit_score ≤ 60; RFL-013 on B
**Expected ranking:** A > B
**Expected risk flags:** RFL-013 (medium) on B
**Expected recommendation:** A
**Pass criteria:** A recommended; B flagged for human review

---

**TC-QRA-021**
**Scenario:** Differentiation score penalizes duplicate versions
**Strategy:** cold_outreach, four versions
**Versions:** A, B, C = meaningfully differentiated; D = near-identical to C (synonym rewrite)
**Expected scores:** D differentiation_score ≤ 40; RFL-021 (high) on D → composite capped at 69
**Expected ranking:** D last
**Expected risk flags:** RFL-021 (high) on D
**Expected recommendation:** From A, B, or C
**Pass criteria:** D is_recommended = false; D composite ≤ 69

---

**TC-QRA-022**
**Scenario:** CTA — multiple CTAs penalized
**Strategy:** cold_outreach, cta = "share your statement"
**Versions:** A = single clear CTA; B = "share your statement, or schedule a call, or just reply"
**Expected scores:** B cta_clarity_score ≤ 45; RFL-016 on B (-10)
**Expected ranking:** A > B
**Expected risk flags:** RFL-016 (medium) on B
**Expected recommendation:** A
**Pass criteria:** B cta_clarity_score ≤ 50; composite penalized at least 10 points

---

**TC-QRA-023**
**Scenario:** CTA — vague CTA penalized
**Strategy:** cold_outreach, cta = "share your most recent statement"
**Versions:** A = specific CTA matching strategy; B = closes only with "let me know if you're interested"
**Expected scores:** B cta_clarity_score ≤ 55; RFL-016 (medium) on B
**Expected ranking:** A > B
**Expected risk flags:** RFL-016 on B
**Expected recommendation:** A
**Pass criteria:** B cta_clarity_score reflects vagueness penalty

---

**TC-QRA-024**
**Scenario:** Tone fit rewards executive_brevity where strategy requires it
**Strategy:** cold_outreach, tone = executive_brevity
**Versions:** A = short, direct, no preamble; B = three-sentence warm preamble before value statement
**Expected scores:** A tone_fit_score ≥ 88; B tone_fit_score ≤ 65; RFL-013 on B
**Expected ranking:** A > B
**Expected risk flags:** RFL-013 (medium) on B
**Expected recommendation:** A
**Pass criteria:** A tone_fit_score at least 20 points above B; B composite penalized

---

**TC-QRA-025**
**Scenario:** Tone fit rewards warm_conversational for inbound response
**Strategy:** new_inquiry_response, lead_source = website, tone = warm_conversational
**Versions:** A = professionally warm, natural flow; B = terse, executive, no warmth
**Expected scores:** A tone_fit_score ≥ 85; B tone_fit_score ≤ 62; RFL-013 on B
**Expected ranking:** A > B
**Expected risk flags:** RFL-013 (medium) on B
**Expected recommendation:** A
**Pass criteria:** B penalized for wrong tone; A recommended

---

**TC-QRA-026**
**Scenario:** Subject/body mismatch gets high risk flag
**Strategy:** statement_review_follow_up, proof_point available
**Versions:** A = subject and body aligned; B = subject says "What we found" but body is a generic review offer
**Expected scores:** B subject_body_consistency_score ≤ 35; RFL-017 (high) on B → composite capped at 69
**Expected ranking:** A > B
**Expected risk flags:** RFL-017 (high) on B
**Expected recommendation:** A
**Pass criteria:** B composite ≤ 69; B consistency score ≤ 35; RFL-017 present on B

---

**TC-QRA-027**
**Scenario:** Critical risk caps composite below 50
**Strategy:** cold_outreach, offer_angle ≠ confirmed_savings_review
**Versions:** A = clean; B = contains specific dollar savings claim
**Expected scores:** B pre-penalty composite = 78; B post-penalty composite = 49
**Expected ranking:** A > B
**Expected risk flags:** RFL-004 (critical) on B
**Expected recommendation:** A
**Pass criteria:** B composite exactly = 49; B band = do_not_use regardless of pre-penalty score

---

**TC-QRA-028**
**Scenario:** High risk caps composite below 70
**Strategy:** proposal_follow_up
**Versions:** A = clean; B = contains urgency language; B pre-penalty composite = 77
**Expected scores:** B composite = 69 (high risk cap)
**Expected ranking:** A > B
**Expected risk flags:** RFL-002 (high) on B
**Expected recommendation:** A
**Pass criteria:** B composite exactly = 69; B band = needs_review; B is_recommended = false

---

**TC-QRA-029**
**Scenario:** No version is recommended when all versions score below 70
**Strategy:** cold_outreach, four versions all with significant quality issues
**Expected scores:** All versions composite ≤ 68
**Expected ranking:** Ordered 1–4 but all below threshold
**Expected recommendation:** None — all is_recommended = false
**Pass criteria:** is_recommended = false on all versions; human_review_notes present on all versions stating no version meets minimum threshold; agent run still succeeds and writes all quality_review records

---

**TC-QRA-030**
**Scenario:** Highest score recommended when no blocking risk exists
**Strategy:** cold_outreach, all clean versions
**Versions:** A = composite 88; B = composite 82; C = composite 79; D = composite 74
**Expected ranking:** A (1) → B (2) → C (3) → D (4)
**Expected recommendation:** A
**Pass criteria:** A is_recommended = true; exactly one version is_recommended = true

---

**TC-QRA-031**
**Scenario:** Tie-breaker prefers lower-risk version
**Strategy:** cold_outreach, two versions within 3 composite points
**Versions:** A = composite 83, risk_score = 10 (RFL-023 low); B = composite 82, risk_score = 0
**Expected ranking:** B > A (lower risk wins)
**Expected recommendation:** B
**Pass criteria:** B ranked first; B is_recommended = true; tie-breaker rule applied

---

**TC-QRA-032**
**Scenario:** Tie-breaker prefers stronger strategic fit when risk is equal
**Strategy:** cold_outreach, two versions with equal composite and equal risk
**Versions:** A = composite 84, risk_score = 0, strategic_fit_score = 88; B = composite 84, risk_score = 0, strategic_fit_score = 80
**Expected ranking:** A > B
**Expected recommendation:** A
**Pass criteria:** A ranked first; tie-breaker documented in comparison_summary

---

**TC-QRA-033**
**Scenario:** Superseded version blocks review for that version
**Strategy:** cold_outreach, 4 versions; version C has approval_status = superseded
**Expected behavior:** QRA_005 returned for version C; C excluded; A, B, D evaluated and ranked
**Expected recommendation:** From A, B, or D
**Pass criteria:** C excluded without blocking overall review; QRA_005 logged for C; three quality_review records produced

---

**TC-QRA-034**
**Scenario:** Missing message_versions blocks review entirely
**Strategy:** cold_outreach; no message_version records exist for this strategy_id
**Expected behavior:** QRA_002 error returned; no quality_review records created; agent run logged as blocked
**Pass criteria:** QRA_002 error code returned; review does not proceed; no quality_review records created

---

**TC-QRA-035**
**Scenario:** body_html populated blocks that version from review
**Strategy:** cold_outreach; version B has body_html = non-null value (should always be null in v1)
**Expected behavior:** QRA_008 error for version B; B excluded; A, C, D evaluated normally
**Expected recommendation:** From A, C, or D
**Pass criteria:** B excluded; QRA_008 logged; three quality_review records produced; version B not in comparison set

---

## 20. Acceptance Criteria

The following must all be true before implementation of the Quality Review Agent may begin.

| # | Criteria |
|---|----------|
| 1 | Agent role and boundaries are unambiguous — what it does and what it does not do is explicitly defined |
| 2 | Full input model is defined — all fields read from strategy, version, skill definitions, and system controls |
| 3 | `quality_review` output object is fully defined — all fields have stated purpose, source, and mutability |
| 4 | All 8 scoring dimensions are defined with high/low/common-failure criteria and data sources |
| 5 | Composite score formula with default weights is specified and weights sum to 100% |
| 6 | Risk score is defined as lower-is-better and its role (penalty caps only, not averaged) is explicit |
| 7 | Risk penalty model (critical/high/medium/low) is defined with clear cap and subtraction rules |
| 8 | Score bands are defined with threshold values |
| 9 | Version ranking algorithm is defined with all tie-breaker rules in priority order |
| 10 | `is_recommended` assignment rules including all blocking conditions are defined |
| 11 | No-recommendation behavior is defined — agent run succeeds, all records written, all is_recommended = false |
| 12 | Risk flag model contains at least 25 flags, each with code, severity, trigger, score effect, and blocking behavior |
| 13 | Compliance review relationship is clarified — QRA does not override CA compliance |
| 14 | All 12 message type review rules are defined |
| 15 | At least 13 QRA error codes are defined with explanation and suggested fix |
| 16 | Agent output format with 8 scored examples is included |
| 17 | All 35 test cases are included, covering all required scenarios |
| 18 | No TypeScript code was written in this document |
| 19 | No SQL migration was written in this document |
| 20 | No full email body copy was written in this document |
| 21 | All active Phase 3B guardrails are preserved |
| 22 | `body_html` null-in-v1 constraint is enforced — QRA_008 blocks review of html-populated versions |
| 23 | v1 determinism is explicit — no external LLM calls in v1 |

---

## 21. Recommended Next Step

Once this design document is reviewed, discussed, and approved by the project owner, the next document to be created is:

**Phase 3B Quality Review Agent — Implementation Plan**

That plan should define, in step-by-step order:

1. **Database migration** — `quality_reviews` table schema — all fields from the output object defined in Section 4, appropriate indexes (strategy_id, version_id, tenant_id, is_recommended), RLS policy, shared `update_updated_at()` trigger

2. **Type definitions** — `quality-review-agent.types.ts` — QRA error codes, risk flag codes and severities, score band constants, `QualityReview` output type, `QualityReviewResult` discriminated union (success / blocked / partial)

3. **Scoring modules** — one pure function per dimension: `scoreStrategicFit`, `scoreComplianceConfidence`, `scoreCTAClarity`, `scoreSpecificity`, `scoreToneFit`, `scoreDifferentiation`, `scoreSubjectBodyConsistency`, `scoreReadability` — all pure, no I/O, testable in isolation

4. **Composite score module** — pure function: accepts 8 dimension scores + risk flags, applies weights, applies penalty caps, returns composite and band

5. **Risk flag module** — pure function: accepts version + strategy + sibling versions + prior context, returns array of risk flag objects

6. **Ranking module** — pure function: accepts array of scored versions, applies ranking rules and tie-breakers, assigns rank_position, assigns is_recommended

7. **Reasoning generator** — pure function: produces human_review_notes, strengths, weaknesses, recommended_edits, comparison_summary from scores and flags

8. **Invalid conditions checker** — pure function: validates all QRA_001–QRA_013 gate conditions before review begins

9. **Service orchestrator** — `quality-review-agent.service.ts` — 11-step pipeline: load strategy → load versions → check gates → load skills → load prior context → score each version → generate risk flags → calculate composite per version → rank versions → assign is_recommended → write quality_review records

10. **Repository** — `quality-review.repo.ts` — insert, fetch by strategy, fetch by version, fetch recommended for strategy

11. **Server actions** — `quality-review-agent.actions.ts` — `runQualityReviewAction`, `getQualityReviewsAction`, `getRecommendedVersionAction`

12. **UI integration** — extend `GeneratedVersionsPanel` to display quality scores, score bands, recommended badge, risk flags, and reasoning when `quality_review` records exist

13. **Fixture structure** — `tests/fixtures/quality-review-agent/TC-QRA-001.json` through `TC-QRA-035.json` — each fixture mirrors the test case structure from Section 19

14. **Test file** — `tests/quality-review-agent.test.ts` — fixture-based Vitest tests covering all 35 test cases, targeting the pure scoring and ranking modules

15. **QA checklist** — `npx vitest run` passes (all tests including 141 prior + new QRA tests), `npx next build` passes, TypeScript passes, UI renders quality scores in GeneratedVersionsPanel

---

*End of document.*

**Document status:** v1.0 — Locked pending implementation plan.

**Active guardrails confirmed:** No code was written. No SQL was written. No full email bodies were included. No scoring was placed inside the Copywriting Agent. No sending or approval logic was defined. Human approval remains separate and downstream of all agent output. Quality Review Agent v1 is deterministic — no external LLM calls.
