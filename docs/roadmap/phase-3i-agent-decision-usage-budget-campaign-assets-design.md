# Phase 3I — Agent Decision Log, AI Usage Tracking, Budget Enforcement & Campaign Asset Strategy
## Design Document v1.0

**Status:** Design — awaiting user approval before implementation planning begins
**Phase theme:** Agent Decision Log · AI Usage Tracking · Budget Enforcement · Campaign Asset Strategy
**Depends on:** Phase 3H complete and locked (`b10d0db`, tag `phase-3h-send-safety-hardening-v1`)
**Tests baseline:** 1083/1083
**Next migration available:** `20240034`
**Date:** 2026-05-28

---

## Section 1 — Problem Statement

### 1.1 Why Verian Needs an Agent Decision Log Before Agents Expand

Every agent in the current system makes decisions — selecting a recommendation rule, choosing a draft template, scoring a lead, generating a message strategy — but none of these decisions are persisted in a form that is queryable, visible to operators, or linked to outcomes.

Today, if an operator asks "Why did the system draft that email to Harbor Diner?", the answer requires:

1. Reading the `agent_recommendations` table to find which rule fired
2. Reading the `email_drafts` table to find which template was selected
3. Reading the `fit_scores` and `urgency_scores` tables to see the dimensions that drove scoring
4. Cross-referencing the activity timeline for events

None of this is surfaced on the lead detail page. None of it is linked. A recommendation row has a `reasoning` field, but the rule evaluation context (the exact score values, dimensions, and lead fields that caused the rule to fire) is not captured in a structured, queryable form alongside the decision output.

This gap becomes critical before agents expand because:

- **Debugging agent errors is hard.** When a lead gets the wrong draft or an unexpected recommendation, there is no single place to inspect why.
- **Human overrides are untracked.** When an operator rejects a recommendation and takes a different action, there is no record linking the override to the original decision, making pattern learning impossible.
- **Campaign readiness requires auditability.** Before Verian can enroll leads in multi-step campaigns, every decision point in the campaign lifecycle must be logged. An unexplained action in a campaign creates compliance and operational risk.
- **Learning loops need structured decision outcomes.** The Learning Agent currently reads activity events and send outcomes. It cannot read "which version did the QRA recommend, and was it the one sent?" in a structured way — only via JSONB join-through patterns that are fragile and hard to query.

The `agent_decisions` table closes this gap. Every decision an agent makes — scoring, rule matching, template selection, version selection, draft creation — becomes a persisted, queryable record with inputs captured at decision time, output recorded, and outcome linkable.

### 1.2 Why Verian Needs AI Usage Tracking Before More LLM-Based Workflows

The current system has three LLM-powered agents — the Message Strategy Agent, the Copywriting Agent, and the Quality Review Agent (rubric scoring path). A fourth, the Email Rewrite Loop (`email-rewrite-loop.service.ts`), also makes LLM calls. None of these record:

- Which model was called
- How many tokens were consumed (prompt + completion)
- What the estimated cost was per call
- Whether the call succeeded or failed
- Which lead, draft, version, or campaign the call was for

This is a blind spot at two levels:

**Operational:** There is no way to know how much the AI layer is costing per month, per tenant, per agent, or per lead worked. When token costs spike — due to a rewrite loop running many iterations, a strategy agent generating an unusually verbose output, or a QRA scoring many versions — there is no alert and no attribution.

**Safety:** When the system expands to campaigns and follow-ups, LLM calls will multiply. Without usage tracking, the system cannot detect runaway token consumption, cannot enforce per-lead or per-campaign budgets, and cannot stop an agent that is about to exceed a cost threshold.

The `ai_usage_events` table logs every LLM call. Each row captures the model, token counts, estimated cost, whether the call succeeded, and which entity (lead, draft, campaign, decision) the call served. This is the data layer that makes budget enforcement possible.

### 1.3 Why Budget Enforcement Must Stop Agents Automatically When Exhausted

Passive monitoring ("we can see usage") is insufficient before campaign automation expands. A campaign agent that calls Claude to generate drafts for 50 leads in a morning can consume a month's budget before an operator sees a dashboard.

Budget enforcement requires a **preflight check** — a mandatory gate before every LLM call that:

1. Estimates the projected token cost of the planned call
2. Checks remaining budget at the relevant level (agent, lead, campaign, workspace, tenant, daily, monthly)
3. If budget is sufficient: allows the call and records usage afterward
4. If budget is exhausted: blocks the call before sending to the model, records the block event, notifies the operator, and stops the agent/workflow safely

This is not optional for controlled live sending. A live campaign that exhausts its AI budget mid-sequence and silently stops sending is a compliance and reputational risk. The system must stop **predictably and visibly** — with operator notification, a structured error in System Intelligence, and a clear audit trail of what was stopped and why.

### 1.4 Why Campaign Email Assets Are Needed to Avoid Writing Every Email With LLMs

The current email generation model requires the full Phase 3B pipeline for every outbound email: Message Strategy Agent → Copywriting Agent → QRA → HRB → SEB. This is appropriate for high-value, individualized outreach where the content must be tailored to a specific lead's context.

It is not appropriate for routine campaign emails — a "thanks for signing up" follow-up, a standard rate comparison offer, a check-in email after statement review. These emails have the same structure for every lead, with only a few personalization fields that vary (first name, company name, city, estimated savings).

Calling Claude to write each of these emails per recipient would:
- Waste tokens on content that is structurally identical across hundreds of sends
- Introduce content variability that makes compliance review impractical
- Create LLM cost that scales linearly with leads rather than with the number of distinct message designs

The campaign email asset model solves this: **LLMs design and revise campaign assets once. Humans approve reusable assets. Routine sends use deterministic template personalization. Claude is called only when an asset needs creation or revision, not for every recipient.**

This model reduces LLM calls by orders of magnitude once campaigns scale, while preserving the quality and compliance benefits of AI-assisted writing.

---

## Section 2 — Agent Decision Log Model

### 2.1 What Is an Agent Decision?

An **agent decision** is any point at which an automated system selects an action, produces a recommendation, or generates output that influences the lead workflow — and where the inputs and reasoning that drove that selection have value for auditing, debugging, learning, and operator review.

A decision is NOT:
- A read-only data fetch (querying a lead's score)
- A user-initiated action (operator approves a draft)
- A non-deterministic infrastructure event (webhook received)

A decision IS:
- The scoring pipeline selecting `fit_score = 74` and `urgency_score = 61` with specific dimension breakdowns
- The recommendation engine matching rule `close_deal_now` for a specific lead at a specific score
- `email-draft.service.ts` selecting template `email_close_deal` for a lead based on rule `close_deal_now`
- The Copywriting Agent generating three versions using a specific strategy and confidence breakdown
- The QRA ranking version `Trust-Builder` as the top recommendation with a composite score of 87

### 2.2 Proposed `agent_decisions` Table Schema

**Table name:** `agent_decisions`  
**Migration:** `20240034` (first migration in Phase 3I)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `tenant_id` | `uuid NOT NULL` | FK to `tenants`; RLS anchor |
| `workspace_id` | `uuid` | Nullable — system decisions may span workspace |
| `agent_name` | `text NOT NULL` | e.g., `'auto_draft_creator'`, `'recommendation_generator'`, `'message_strategy_agent'`, `'copywriting_agent'`, `'qra'` |
| `agent_version` | `text` | e.g., `'rules-v1'`, `'claude-3-5-sonnet'` — identifies the model or rule set version at decision time |
| `decision_type` | `text NOT NULL` | e.g., `'template_selected'`, `'rule_matched'`, `'version_ranked'`, `'strategy_generated'`, `'draft_created'`, `'score_computed'`, `'budget_blocked'` |
| `decision_status` | `text NOT NULL DEFAULT 'completed'` | `'completed'`, `'blocked'`, `'failed'`, `'overridden'` — reflects the outcome of the decision |
| `entity_type` | `text` | e.g., `'lead'`, `'email_draft'`, `'message_version'`, `'campaign_email_asset'` |
| `entity_id` | `uuid` | FK to the entity the decision was made about |
| `lead_id` | `uuid` | Denormalized for fast lead-scoped queries |
| `contact_id` | `uuid` | Nullable |
| `company_id` | `uuid` | Nullable |
| `draft_id` | `uuid` | Nullable — the draft produced or consumed by this decision |
| `recommendation_id` | `uuid` | Nullable — links to `agent_recommendations` if decision generated a rec |
| `campaign_id` | `uuid` | Nullable — future: links to `campaigns` table |
| `workflow_run_id` | `uuid` | Nullable — links to `workflow_runs` for decision traceability |
| `ai_usage_event_id` | `uuid` | Nullable — links to `ai_usage_events` if this decision involved an LLM call |
| `confidence` | `numeric(5,2)` | Nullable — 0–100 confidence score where applicable |
| `recommended_action` | `text` | Nullable — short label of what the agent recommended (e.g., `'send_proposal'`, `'version:Trust-Builder'`) |
| `approval_required` | `boolean NOT NULL DEFAULT false` | True if this decision requires human approval before being acted on |
| `human_approved` | `boolean` | Nullable — set when human approves/rejects |
| `human_approved_at` | `timestamptz` | Nullable |
| `human_approved_by` | `uuid` | Nullable — FK to `platform_users` |
| `human_override` | `boolean NOT NULL DEFAULT false` | True if an operator took a different action than the agent recommended |
| `override_reason` | `text` | Nullable — operator's stated reason for override |
| `short_reason` | `text` | A one-sentence human-readable explanation of why this decision was made (e.g., `"Rule close_deal_now fired: fit=74, urgency=61, stage=negotiation"`) |
| `input_snapshot` | `jsonb` | Key inputs captured at decision time — scores, dimensions, lead fields, strategy fields |
| `output_summary` | `jsonb` | What the agent produced — rule id, template slug, version count, top recommendation, etc. |
| `learning_tags` | `text[]` | Tags for learning loop queries (e.g., `['high_urgency', 'negotiation_stage', 'close_deal_template']`) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

### 2.3 RLS Policy

Row-level security follows the same pattern as all Phase 3C+ tables:
- `SELECT`: `tenant_id = auth.jwt()->>'tenant_id'` (workspace members can read)
- `INSERT`, `UPDATE`, `DELETE`: service role only (agents write via service client)

### 2.4 Indexes

```sql
CREATE INDEX idx_agent_decisions_lead     ON agent_decisions (tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_agent_decisions_agent    ON agent_decisions (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_agent_decisions_draft    ON agent_decisions (tenant_id, draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX idx_agent_decisions_campaign ON agent_decisions (tenant_id, campaign_id) WHERE campaign_id IS NOT NULL;
```

---

## Section 3 — Agent Coverage

The following agents must create decision records. Write sites are the exact functions that make the relevant decision.

### 3.1 Existing Agents — Decision Points to Log

| Agent | Write site | `agent_name` | `decision_type` | Key `input_snapshot` fields | Key `output_summary` fields |
|-------|-----------|--------------|----------------|----------------------------|----------------------------|
| Lead Scoring Pipeline | `scoring-pipeline.service.ts` | `'lead_scoring_pipeline'` | `'score_computed'` | `{ fit_dimensions, urgency_dimensions, lead_stage, estimated_value }` | `{ fit_score, urgency_score, model_used: 'rules-v1' }` |
| Recommendation Generator | `recommendation.service.ts: generateRecommendation` | `'recommendation_generator'` | `'rule_matched'` | `{ fit_score, urgency_score, lead_stage, rule_id }` | `{ recommendation_type, priority, rule_id, recommendation_id }` |
| Auto-Draft Creator | `email-draft.service.ts: createLeadEmailDraft` | `'auto_draft_creator'` | `'template_selected'` | `{ rule_id, template_slug, lead_stage, has_contact, has_email }` | `{ draft_id, template_slug, superseded_count }` |
| Message Strategy Agent | `email-message-strategy.service.ts` | `'message_strategy_agent'` | `'strategy_generated'` | `{ lead_stage, industry, message_type, strategy_angle }` | `{ strategy_id, confidence, model_used, version }` |
| Copywriting Agent | `copywriting-agent.service.ts` | `'copywriting_agent'` | `'versions_generated'` | `{ strategy_id, message_type, skills_selected, version_count_requested }` | `{ version_count_produced, top_label, ai_usage_event_id }` |
| Quality Review Agent | `quality-review/` service | `'quality_review_agent'` | `'version_ranked'` | `{ strategy_id, version_count, scoring_rubric }` | `{ top_version_id, top_label, top_composite_score, recommended_version_id }` |
| Human Review Bridge | `human-review.service.ts` | `'human_review_bridge'` | `'version_approved'` / `'version_rejected'` / `'override_applied'` | `{ version_id, hrl_action_type }` | `{ human_approved: true/false, human_override: true/false }` |
| Send Bridge | `send-bridge.service.ts` | `'send_bridge'` | `'draft_created'` | `{ version_id, approval_gates_passed }` | `{ draft_id, approval_request_id }` |
| Learning Agent | `learning-agent.service.ts` | `'learning_agent'` | `'signals_computed'` | `{ lookback_days, signal_names, dimension_count }` | `{ snapshot_count, run_id, top_signals }` |
| Email Rewrite Loop | `email-rewrite-loop.service.ts` | `'email_rewrite_agent'` | `'rewrite_applied'` | `{ version_count_requested, best_version_score }` | `{ iterations, final_version_id, ai_usage_event_id }` |

### 3.2 Future Agents — Decision Points to Log

| Agent | `agent_name` | `decision_type` |
|-------|--------------|-----------------|
| Campaign Assignment Agent (Phase 3L) | `'campaign_assignment_agent'` | `'lead_enrolled'`, `'lead_paused'`, `'lead_stopped'` |
| Follow-up Agent (Phase 3L) | `'follow_up_agent'` | `'follow_up_scheduled'`, `'follow_up_triggered'` |
| Budget Enforcement | `'budget_enforcer'` | `'budget_blocked'`, `'budget_warned'` |
| Campaign Asset Generator | `'campaign_asset_agent'` | `'asset_draft_created'`, `'asset_revision_generated'` |

### 3.3 Non-LLM vs. LLM Decision Distinction

| Agent | LLM? | `agent_version` pattern | `ai_usage_event_id` |
|-------|------|------------------------|---------------------|
| Lead Scoring | No — rule-based | `'rules-v1'` | Null |
| Recommendation Generator | No — rule-based | `'rules-v1'` | Null |
| Auto-Draft Creator | No — template | `'template-v1'` | Null |
| Message Strategy Agent | Yes — Claude | `'claude-sonnet-4-6'` | Set |
| Copywriting Agent | Yes — Claude | `'claude-sonnet-4-6'` | Set |
| QRA | Yes (rubric path) | `'claude-sonnet-4-6'` or `'rubric-v1'` | Set if LLM |
| Email Rewrite Loop | Yes — Claude | `'claude-sonnet-4-6'` | Set |
| Learning Agent | No — statistical | `'statistical-v1'` | Null |

---

## Section 4 — AI Usage Events Model

### 4.1 Purpose

Every call to an external LLM provider (Claude / Anthropic, or any future provider) generates one row in `ai_usage_events`. This is the durable log that feeds cost dashboards, budget enforcement, and learning-loop cost attribution.

### 4.2 Proposed `ai_usage_events` Table Schema

**Table name:** `ai_usage_events`  
**Migration:** `20240034`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `tenant_id` | `uuid NOT NULL` | FK to `tenants`; RLS anchor |
| `workspace_id` | `uuid` | Nullable |
| `agent_name` | `text NOT NULL` | Matches `agent_decisions.agent_name` |
| `feature_name` | `text` | e.g., `'strategy_generation'`, `'version_copywriting'`, `'qra_scoring'`, `'rewrite_loop'`, `'asset_creation'` |
| `provider` | `text NOT NULL DEFAULT 'anthropic'` | `'anthropic'`, `'openai'` — extensible |
| `model_name` | `text NOT NULL` | e.g., `'claude-sonnet-4-6'`, `'claude-haiku-4-5-20251001'` |
| `prompt_tokens` | `integer` | Nullable — from provider response |
| `completion_tokens` | `integer` | Nullable — from provider response |
| `total_tokens` | `integer` | Nullable — `prompt_tokens + completion_tokens` |
| `estimated_cost_usd` | `numeric(10,6)` | Nullable — computed from model pricing at call time |
| `provider_request_id` | `text` | Nullable — the provider's request ID for support escalation |
| `decision_id` | `uuid` | Nullable — FK to `agent_decisions` (which decision triggered this call) |
| `related_entity_type` | `text` | Nullable — e.g., `'lead'`, `'email_draft'`, `'campaign_email_asset'` |
| `related_entity_id` | `uuid` | Nullable |
| `lead_id` | `uuid` | Denormalized for fast lead-scoped cost queries |
| `draft_id` | `uuid` | Nullable |
| `campaign_id` | `uuid` | Nullable — future |
| `campaign_asset_id` | `uuid` | Nullable — future |
| `success` | `boolean NOT NULL DEFAULT true` |
| `error_reason` | `text` | Nullable — provider error message if `success = false` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

### 4.3 Cost Estimation

Token cost is computed at write time using the model's published pricing. A helper function `estimateCostUsd(modelName, promptTokens, completionTokens)` returns the USD cost given the provider's per-million-token rates. This is stored as a snapshot at call time — not recomputed — so historical cost reports remain stable even if pricing changes.

**Approximate rates (at time of design, stored in constants):**

| Model | Input per 1M tokens | Output per 1M tokens |
|-------|--------------------|--------------------|
| `claude-sonnet-4-6` | $3.00 | $15.00 |
| `claude-haiku-4-5-20251001` | $0.25 | $1.25 |
| `claude-opus-4-7` | $15.00 | $75.00 |

### 4.4 Indexes

```sql
CREATE INDEX idx_ai_usage_tenant_date ON ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_agent       ON ai_usage_events (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_ai_usage_lead        ON ai_usage_events (tenant_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_ai_usage_campaign    ON ai_usage_events (tenant_id, campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;
```

### 4.5 Write Pattern

The write call is always non-fatal. An `ai_usage_events` insert failure must not block or fail the LLM call it is recording. Pattern:

```typescript
// After every LLM call — wrap in non-fatal catch
aiUsageRepo.recordUsage({
  tenantId, agentName, featureName, provider, modelName,
  promptTokens, completionTokens, totalTokens,
  estimatedCostUsd: estimateCostUsd(modelName, promptTokens, completionTokens),
  providerRequestId, decisionId, leadId, draftId, success, errorReason,
}).catch((err) => console.error('[ai-usage] Failed to record usage event:', err))
```

---

## Section 5 — Token and Cost Observability: AI Usage Board

### 5.1 Location

A new settings page at `/[workspaceSlug]/settings/ai-usage` (or under the Analytics section, adjacent to Revenue Analytics). Server component. Read-only. Permission gate: `requirePermission(ctx, 'settings.view')` or a new `'ai.usage.view'` permission.

### 5.2 Dashboard Panels

**Summary row (top of page):**
- Total tokens today
- Estimated cost today (USD)
- Total tokens this month
- Estimated cost this month (USD)
- Total AI calls today / this month
- Failed AI calls today

**Panel A — Usage by agent (table):**
| Agent | Calls today | Tokens today | Cost today | Calls this month | Cost this month |
|-------|------------|-------------|-----------|----------------|----------------|

**Panel B — Usage by model (table):**
| Model | Calls | Prompt tokens | Completion tokens | Estimated cost |
|-------|-------|--------------|-----------------|---------------|

**Panel C — Usage by feature (table):**
| Feature | Calls | Tokens | Cost |
|---------|-------|--------|------|

**Panel D — Usage by lead (top 10 most expensive this month):**
| Lead | Company | Calls | Tokens | Cost |
|------|---------|-------|--------|------|

**Panel E — Usage by campaign (future — empty state with "No campaigns active"):**
| Campaign | Calls | Cost | Active |
|----------|-------|------|--------|

**Panel F — Cost per unit (KPIs):**
- Average cost per approved draft
- Average cost per active campaign asset
- Average cost per lead worked (at least one AI call)
- Total rewrite-loop token usage this month
- Most expensive individual decision (link to lead)

**Panel G — Usage trend (tabular, 30-day rolling):**
| Date | Total tokens | Estimated cost | Failed calls |
|------|-------------|---------------|-------------|

**Panel H — Failed AI calls:**
| Date | Agent | Feature | Model | Error reason |
|------|-------|---------|-------|-------------|

### 5.3 Data Source

All panels read from `ai_usage_events` with appropriate `GROUP BY` aggregation, `SUM`, and `AVG`. No LLM calls are made to generate these panels. Read-only, server-rendered.

---

## Section 6 — AI Budget Enforcement Model

### 6.1 Core Principle

Budget enforcement is a **preflight gate**, not a passive report. Before every LLM call, the budget enforcer must:

1. Estimate the projected token cost of the call
2. Query remaining budget at all applicable budget levels
3. If any applicable budget is exhausted: **block the call**, record the block, notify the operator, stop the workflow safely
4. If all budgets have remaining capacity: allow the call, decrement consumed totals after the call completes

This gate runs inside the agent — not as a separate middleware layer — so budget-blocked agents can return a structured result to callers (e.g., `{ ok: false, reason: 'budget_exhausted', budgetLevel: 'daily_workspace' }`).

### 6.2 Budget Levels

Budgets are enforced hierarchically. A call is blocked if ANY applicable level is exhausted. Multiple levels may be configured simultaneously.

| Budget level | Scope | Example |
|-------------|-------|---------|
| `per_agent_daily` | One agent, one tenant, per calendar day | Copywriting Agent ≤ $5/day |
| `per_agent_monthly` | One agent, one tenant, per calendar month | Strategy Agent ≤ $50/month |
| `per_workflow_run` | One workflow run instance | Single `lead.created` pipeline ≤ $0.50 |
| `per_lead` | All AI calls for one lead across all agents | Lead total ≤ $2.00 |
| `per_draft` | All AI calls that produce or revise one draft | Single draft ≤ $0.30 |
| `per_campaign` | All AI calls for one campaign (asset creation + revisions) | Campaign AI ≤ $20 |
| `per_workspace_daily` | All AI calls in one workspace, per day | Workspace ≤ $20/day |
| `per_workspace_monthly` | All AI calls in one workspace, per month | Workspace ≤ $200/month |
| `per_tenant_daily` | All AI calls across workspace, per day | Tenant ≤ $30/day |
| `per_tenant_monthly` | All AI calls across tenant, per month | Tenant ≤ $300/month |

### 6.3 Budget Policy Table Schema

**Table name:** `ai_budget_policies`  
**Migration:** `20240034`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `tenant_id` | `uuid NOT NULL` |
| `workspace_id` | `uuid` | Nullable — applies to workspace if set; tenant-wide if null |
| `budget_level` | `text NOT NULL` | One of the levels above (e.g., `'per_agent_daily'`) |
| `scope_key` | `text` | The agent name or campaign id this policy applies to, if applicable |
| `limit_usd` | `numeric(10,4) NOT NULL` | Hard stop at this USD amount |
| `warn_threshold_pct` | `numeric(5,2) NOT NULL DEFAULT 75` | Percentage of limit at which to emit a warning (0–100) |
| `alert_threshold_pct` | `numeric(5,2) NOT NULL DEFAULT 90` | Percentage at which to emit an operator alert |
| `is_active` | `boolean NOT NULL DEFAULT true` |
| `override_requires_approval` | `boolean NOT NULL DEFAULT true` | True if exceeding the limit requires human approval |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_by` | `uuid` | Nullable |

### 6.4 Threshold Behavior

| Threshold | What happens |
|-----------|-------------|
| 75% of limit consumed | Emit `AI_BUDGET_THRESHOLD_WARNING` structured error (severity `warning`). Operator visible in System Intelligence. Agent continues. |
| 90% of limit consumed | Emit `AI_BUDGET_THRESHOLD_ALERT` structured error (severity `error`). Operator notification. Agent continues. |
| 100% of limit consumed | Block the call. Return `{ ok: false, reason: 'budget_exhausted', budgetLevel }`. Record `AI_CALL_BLOCKED_BY_BUDGET` structured error (severity `critical`). Emit `AI_BUDGET_EXHAUSTED` activity event. Stop the agent/workflow. |
| Override requested | Human must approve in the System Intelligence UI before any further LLM calls are permitted for that scope. |

### 6.5 Preflight Check Pattern

```
// Before every LLM call in every LLM-powered agent:
budgetEnforcer.preflightCheck({
  tenantId,
  workspaceId,
  agentName,
  leadId,          // optional
  draftId,         // optional
  campaignId,      // optional
  workflowRunId,   // optional
  estimatedTokens, // prompt token estimate from the caller
})

// Returns:
// { allowed: true }
// { allowed: false, reason: 'budget_exhausted', budgetLevel: 'per_agent_daily', remainingUsd: 0.00 }
// { allowed: true, warning: 'approaching_limit', budgetLevel: 'per_tenant_monthly', usedPct: 76 }
```

The preflight is a Supabase query that:
1. Fetches all active `ai_budget_policies` for the tenant + applicable scope keys
2. For each policy, computes `SUM(estimated_cost_usd)` from `ai_usage_events` for the relevant scope and period (today / this month / this workflow run / this lead)
3. Compares consumed vs. limit

The preflight must be lightweight — no LLM calls, no complex joins. It reads two tables (policies + aggregated usage) and returns fast.

### 6.6 Budget Events Table Schema

Budget enforcement events are recorded both in `automation_failures` (for System Intelligence visibility) and in a lightweight `ai_budget_events` audit table for querying.

**Table name:** `ai_budget_events`  
**Migration:** `20240034`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `tenant_id` | `uuid NOT NULL` |
| `event_type` | `text NOT NULL` | `'CALL_BLOCKED'`, `'BUDGET_EXHAUSTED'`, `'THRESHOLD_WARNING'`, `'THRESHOLD_ALERT'`, `'OVERRIDE_REQUESTED'`, `'OVERRIDE_APPROVED'` |
| `agent_name` | `text NOT NULL` |
| `budget_level` | `text NOT NULL` |
| `policy_id` | `uuid` | FK to `ai_budget_policies` |
| `limit_usd` | `numeric(10,4)` |
| `consumed_usd` | `numeric(10,4)` |
| `blocked_call_context` | `jsonb` | What call was blocked and for which entity |
| `lead_id` | `uuid` | Nullable |
| `campaign_id` | `uuid` | Nullable |
| `override_approved_by` | `uuid` | Nullable — FK to user who approved override |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

---

## Section 7 — Budget Stop Behavior

### 7.1 What Happens When an Agent Exhausts Budget

The following defines the exact behavior sequence when a budget limit is hit.

**Scenario:** The Copywriting Agent is generating versions for a lead. Its `per_agent_daily` budget is $5.00. At the start of the call, the preflight check returns `{ allowed: false, reason: 'budget_exhausted', budgetLevel: 'per_agent_daily' }`.

**Behavior sequence:**

| Step | Action | Actor |
|------|--------|-------|
| 1 | Preflight returns `allowed: false` | Budget Enforcer |
| 2 | Agent returns `{ ok: false, reason: 'budget_exhausted', budgetLevel: 'per_agent_daily', agentName: 'copywriting_agent' }` to its caller | Copywriting Agent |
| 3 | Agent writes `agent_decisions` row with `decision_status: 'blocked'`, `short_reason: "Copywriting Agent stopped because daily agent budget was exhausted"` | Agent |
| 4 | Budget Enforcer writes `ai_budget_events` row (`event_type: 'CALL_BLOCKED'`) | Budget Enforcer |
| 5 | Budget Enforcer calls `createStructuredError` with `failureType: 'AI_CALL_BLOCKED_BY_BUDGET'`, `severity: SE_SEVERITY.CRITICAL`, `context: { agentName, budgetLevel, limitUsd, consumedUsd, leadId }` | Budget Enforcer |
| 6 | `AI_CALL_BLOCKED_BY_BUDGET` structured error appears in System Intelligence → Critical & Open Errors | System Intelligence UI |
| 7 | Operator sees: "Copywriting Agent blocked — daily AI budget exhausted ($5.00 of $5.00 used). Override requires approval." | System Intelligence |
| 8 | If the agent was called from a workflow run: `workflow_runs` status updated to `failed` with reason `budget_exhausted` | Workflow service |
| 9 | `AI_BUDGET_EXHAUSTED` activity event emitted (non-fatal) | Budget Enforcer |
| 10 | No retry is attempted automatically | — |
| 11 | Human operator can: (a) resolve/dismiss the structured error and increase the budget, OR (b) approve a one-time override via System Intelligence | Operator |
| 12 | After operator action: agent can be manually re-triggered | Operator |

### 7.2 Status Shown to User

On the lead detail page, the Agent Decisions panel (Phase 3I UI) shows:

> **Copywriting Agent** — BLOCKED  
> _Stopped: daily agent budget exhausted ($5.00 of $5.00 used)._  
> Review → System Intelligence for override options.

### 7.3 Retry and Override Policy

| Condition | Allowed? |
|-----------|---------|
| Automatic retry after budget block | No — never |
| Human override without approval | No — `override_requires_approval = true` by default |
| Human override with approval | Yes — `ai_budget_events` records `OVERRIDE_APPROVED` + approving user |
| Budget increase by operator | Yes — update `ai_budget_policies.limit_usd`; subsequent calls will pass preflight |
| Budget reset on period rollover | Automatic — daily resets at midnight UTC; monthly resets on calendar month rollover |

---

## Section 8 — Campaign Email Asset Strategy

### 8.1 Core Principle

> LLMs create and revise campaign email assets. Humans approve reusable assets. Approved assets are sent using deterministic personalization. Routine sends do not call Claude.

This principle eliminates the LLM cost scaling problem and makes campaign compliance review tractable: operators review and approve one asset design, not hundreds of individual emails.

### 8.2 Asset Lifecycle

```
Claude creates asset → Operator reviews → Operator approves → Asset activated
→ Campaign sends use deterministic personalization (no LLM)
→ Learning Agent signals underperformance → Claude revises asset
→ Operator reviews revision → Operator approves new version → Asset updated
```

The critical boundary: **Claude is called at asset creation and revision time, not at send time.** A campaign sending to 200 leads produces zero LLM calls if the asset is already approved and active.

### 8.3 Proposed `campaign_email_assets` Table Schema

**Table name:** `campaign_email_assets`  
**Migration:** `20240034`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `tenant_id` | `uuid NOT NULL` |
| `workspace_id` | `uuid` | Nullable |
| `campaign_type` | `text NOT NULL` | e.g., `'initial_contact'`, `'statement_follow_up'`, `'proposal_follow_up'`, `'check_in'`, `'close_push'` |
| `asset_name` | `text NOT NULL` | Human-readable name: `'Initial Contact — Rate Comparison v3'` |
| `subject_template` | `text NOT NULL` | Template with `{{variable}}` placeholders |
| `body_template_html` | `text NOT NULL` | HTML body with `{{variable}}` placeholders |
| `body_template_text` | `text NOT NULL` | Plain text body with `{{variable}}` placeholders |
| `personalization_fields` | `text[] NOT NULL` | List of field names used in templates (e.g., `['first_name', 'company_name', 'estimated_savings']`) |
| `required_fields` | `text[] NOT NULL` | Subset of `personalization_fields` that must be non-null or send is blocked |
| `fallback_values` | `jsonb` | Default values for optional fields when data is missing (e.g., `{ "city": "your area" }`) |
| `version_number` | `integer NOT NULL DEFAULT 1` | Increments on each approved revision |
| `status` | `text NOT NULL DEFAULT 'draft'` | `'draft'`, `'under_review'`, `'approved'`, `'active'`, `'retired'` |
| `approved_by` | `uuid` | Nullable — FK to user |
| `approved_at` | `timestamptz` | Nullable |
| `llm_generated` | `boolean NOT NULL DEFAULT true` | False if a human wrote the template directly |
| `ai_usage_event_id` | `uuid` | Nullable — FK to the `ai_usage_events` row that generated this asset |
| `decision_id` | `uuid` | Nullable — FK to the `agent_decisions` row for asset creation |
| `performance_summary` | `jsonb` | Rolling summary from Learning Agent: `{ sent_count, delivered_count, reply_count, bounce_rate, open_rate }` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` |

### 8.4 Proposed `campaign_email_sends` Table Schema

**Table name:** `campaign_email_sends`  
**Migration:** `20240034`

This table links a campaign asset send to a specific lead, records the personalized content snapshot, and links to the `email_sends` row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `tenant_id` | `uuid NOT NULL` |
| `asset_id` | `uuid NOT NULL` | FK to `campaign_email_assets` |
| `lead_id` | `uuid NOT NULL` | FK to `leads` |
| `contact_id` | `uuid` | Nullable — FK to `contacts` |
| `rendered_subject` | `text NOT NULL` | Subject after personalization fields applied |
| `rendered_body_html` | `text` | Body after personalization — snapshot at send time |
| `rendered_body_text` | `text` | Plain text body after personalization |
| `personalization_snapshot` | `jsonb NOT NULL` | Exact field values used for this send (e.g., `{ "first_name": "Sam", "company_name": "Harbor Diner" }`) |
| `missing_required_fields` | `text[]` | Fields that were required but missing — if non-empty, send must be blocked |
| `send_status` | `text NOT NULL DEFAULT 'pending'` | `'pending'`, `'approved'`, `'sent'`, `'failed'`, `'blocked_missing_fields'` |
| `email_send_id` | `uuid` | Nullable — FK to `email_sends` once sent |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

---

## Section 9 — Deterministic Personalization Model

### 9.1 Available Merge Fields (No LLM Required)

The following fields can be substituted into a campaign asset template without calling any LLM:

| Field name | Source | Fallback |
|------------|--------|---------|
| `{{first_name}}` | `contacts.first_name` | `'there'` (e.g., "Hi there,") |
| `{{company_name}}` | `companies.name` | Required — send blocked if null |
| `{{industry}}` | `companies.industry` | `'your industry'` |
| `{{city}}` | `companies.city` | `'your area'` |
| `{{state}}` | `companies.state` | `''` |
| `{{estimated_savings}}` | `leads.estimated_value` (formatted) | Omit savings line |
| `{{service_category}}` | From campaign type | Configurable per campaign type |
| `{{sender_name}}` | `sender_identities.display_name` | Required |
| `{{cta_text}}` | Configurable per campaign step | e.g., `'schedule a 15-minute call'` |
| `{{cta_url}}` | Configurable per campaign step | Booking link or response link |
| `{{pain_point_tag}}` | From `learning_tags` on `agent_decisions` for the lead | Omit if no tag |
| `{{campaign_type_label}}` | Human-readable campaign type | e.g., `'payment processing review'` |

### 9.2 Validation Before Send

Before rendering and sending a campaign email:

1. **Required fields check:** Any field in `required_fields` that is null or empty → record in `campaign_email_sends.missing_required_fields` → block send with `send_status: 'blocked_missing_fields'`
2. **Fallback substitution:** Optional fields missing → apply `fallback_values` from the asset definition
3. **Rendered content snapshot:** After substitution, store the full rendered subject and body in `campaign_email_sends` before sending — never reconstruct the sent content after the fact
4. **Preview step (UI):** Before marking as approved for send, operator can view the rendered content for a sample lead — confirms that personalization looks correct

### 9.3 Missing Merge Field Handling

```
Template: "Hi {{first_name}}, I noticed {{company_name}} processes..."

lead.contact.first_name = null   → first_name fallback: 'there'
lead.company.name = null         → company_name is required → BLOCKED

Result: send_status = 'blocked_missing_fields'
         missing_required_fields = ['company_name']
         Decision logged: agent_decisions.decision_status = 'blocked'
                          short_reason = 'Send blocked: required field company_name is missing'
```

No silent failures. Every missing required field is an explicit block with a logged reason.

### 9.4 When LLM Is and Is Not Called

| Action | LLM called? | Reason |
|--------|------------|--------|
| Create new campaign asset | Yes — once | Design requires LLM creativity |
| Revise existing asset | Yes — once per revision | Revision requires LLM |
| Preview rendered asset for a specific lead | No | Deterministic substitution only |
| Send asset to lead | No | Deterministic substitution only |
| Generate personalization content for a specific lead | No | All fields come from CRM data |
| Learning Agent computes signals on asset performance | No | Statistical analysis |
| Learning Agent recommends asset revision | No | Threshold-based recommendation |

---

## Section 10 — Learning Readiness Model

### 10.1 What to Persist for Learning (Without Full Reasoning Chains)

Each `agent_decisions` row contains `input_snapshot` and `output_summary` — compact structured summaries. The `short_reason` field captures a one-sentence explanation. These are the learning layer's data sources.

**Key design constraint:** Do not store full LLM chain-of-thought reasoning in the database. Chain-of-thought output is verbose, expensive to store, and not useful for pattern detection. Store structured summaries only.

### 10.2 Decision Outcome Linkage

The learning loop needs to connect decisions to outcomes. This requires:

| Decision field | Outcome source |
|---------------|---------------|
| `recommendation_id` | → `agent_recommendations.status` (accepted, rejected, acted on) |
| `draft_id` | → `email_sends.status` (sent, failed, bounced, delivered) |
| `ai_usage_event_id` | → LLM call success/failure and token cost |
| `human_override = true` | → override reason from `override_reason` |
| `human_approved = false` | → rejection reason (from HRB action type) |
| `campaign_asset_id` | → `campaign_email_assets.performance_summary` |

### 10.3 Learning-Ready Fields on `agent_decisions`

| Field | Learning use |
|-------|-------------|
| `learning_tags` | Group decisions by lead attributes, message type, campaign type for signal computation |
| `confidence` | Filter high-confidence vs. low-confidence decisions in signal analysis |
| `human_override` | Count override frequency by agent and decision type |
| `output_summary` | Extract produced version label, template slug, rule id for pattern grouping |
| `decision_status` | Count blocked, failed, overridden decisions vs. completed |

### 10.4 What the Learning Agent Can Read After Phase 3I

With `agent_decisions` populated:
- Which recommendation rules fire most often, and what's their approval rate?
- Which message strategies are generated for which lead types, and what's their outcome?
- Which copywriting versions are selected by HRB, and how do they perform?
- Which leads have the highest AI cost and lowest send success rate?
- Which decisions are most frequently overridden by operators?

### 10.5 Summarized Pattern Memory (Not Full Context)

Campaign assets contain a `performance_summary` JSONB field that is updated by the Learning Agent after each signal computation. This field is a compact rolling summary:

```json
{
  "sent_count": 42,
  "delivered_count": 39,
  "reply_count": 3,
  "bounce_rate": 0.048,
  "open_rate": 0.31,
  "complaint_count": 0,
  "last_updated": "2026-05-28T10:00:00Z"
}
```

This is the "compressed memory" that informs a future LLM revision of the asset. Rather than sending the full history of 42 sends and outcomes to Claude, the asset revision prompt includes this summary plus the `short_reason` tags from recent overrides — a compact, structured context.

---

## Section 11 — Human Approval Gates

The following actions require human approval before being executed or continuing:

| Action | Why human approval? | Mechanism |
|--------|-------------------|-----------|
| New campaign asset creation (LLM-generated) | AI wrote the content — human must verify before it is sent to any lead | `campaign_email_assets.status = 'under_review'` → Approval UI |
| Campaign asset activation (`active` status) | Activating means it will be sent to real leads in campaigns | Operator clicks "Activate" in campaign asset management UI |
| Campaign asset revision approval | LLM revised an existing approved asset — human reviews diff before new version is active | `status = 'under_review'`, new `version_number` |
| Budget override after exhaustion | Exhausted budget must not resume automatically | System Intelligence → Override action requiring user confirmation |
| Expensive agent run (over a configurable single-call threshold) | e.g., rewrite loop with many iterations that exceeds a per-call cost threshold | Preflight returns `{ allowed: true, warning: 'expensive_call_above_threshold' }` → UI confirms before proceeding |
| Any live email send (existing gate preserved) | Phase 3H Gate 0 + existing 8 gates | `sendApprovedDraft()` — unchanged |
| Any campaign step email send | Campaign sends also go through send service gates | No auto-send in Phase 3I — campaign send path is Phase 3L scope |
| Campaign assignment enrollment | Operator decides which leads enter a campaign | Operator action — no auto-enrollment |
| Learning Agent recommendation to revise a campaign asset | Asset revision is a content change that operators must approve | `CAMPAIGN_ASSET_REVISION_RECOMMENDED` system recommendation → operator initiates revision |

---

## Section 12 — System Intelligence Visibility

The following events must appear as structured errors or system recommendations in System Intelligence after Phase 3I:

### 12.1 New Structured Error Types

| Failure type | Severity | When created |
|-------------|---------|-------------|
| `AI_CALL_BLOCKED_BY_BUDGET` | `critical` | Budget preflight blocks a call |
| `AI_BUDGET_THRESHOLD_ALERT` | `error` | 90% of any budget level consumed |
| `AI_BUDGET_THRESHOLD_WARNING` | `warning` | 75% of any budget level consumed |
| `AI_CALL_FAILED` | `error` | LLM provider returns an error (non-5xx retry-eligible failures are warning) |
| `CAMPAIGN_ASSET_MISSING_FIELDS` | `warning` | A campaign send was blocked because required personalization fields were missing |
| `CAMPAIGN_ASSET_UNDERPERFORMING` | `warning` | Learning Agent detects asset performance below threshold |
| `AGENT_DECISION_REPEATED_OVERRIDE` | `warning` | The same agent decision type has been overridden N times in a period — indicates a pattern the agent is consistently getting wrong |

### 12.2 New System Recommendation Types

| Recommendation type | When generated |
|--------------------|---------------|
| `AI_BUDGET_EXHAUSTED` | Budget enforcer blocks a call → recommend budget review |
| `AI_COST_SPIKE_DETECTED` | Daily cost exceeds N× the 7-day average → recommend investigation |
| `CAMPAIGN_ASSET_REVISION_RECOMMENDED` | Asset `bounce_rate > threshold` or `open_rate < threshold` → recommend revision |
| `AGENT_OVERRIDE_PATTERN` | Same decision type overridden ≥ 3 times in 7 days → recommend rule adjustment |

### 12.3 Existing System Intelligence Integration

New structured errors and recommendations appear in the existing `/[workspaceSlug]/settings/system-intelligence` page without any new UI work. The Critical & Open Errors table and Pending System Recommendations card already handle all severity levels and all recommendation types.

---

## Section 13 — Lead Detail Visibility

### 13.1 New Panel: Agent Decisions

A new read-only server component `AgentDecisionPanel` appears on the lead detail page at `/[workspaceSlug]/leads/[id]`, below the existing `LeadActivityTimeline`.

**Panel content:**
- Title: "Agent Decisions"
- Shows the 10 most recent `agent_decisions` rows for this lead (ordered by `created_at DESC`)
- Each row displays:
  - `agent_name` (formatted: `'auto_draft_creator'` → `'Auto-Draft Creator'`)
  - `decision_type` (formatted: `'template_selected'` → `'Template Selected'`)
  - `decision_status` badge (Completed / Blocked / Failed / Overridden)
  - `short_reason` (one-sentence explanation)
  - `confidence` if present (e.g., `87%`)
  - `recommended_action` if present
  - `approval_required` badge if true
  - `created_at` relative time

**Panel behavior:**
- Read-only — no server actions on this panel
- Empty state: "No agent decisions recorded for this lead." (common before Phase 3I write sites are wired up)
- Non-fatal data load with `.catch(() => [])` — panel failure must not break the lead page

### 13.2 AI Usage Summary on Lead Detail

A compact "AI Cost" line in the lead detail header or in a new sub-section:

> **AI Cost for this lead:** $0.18 total (3 LLM calls)

This is a simple `SUM(estimated_cost_usd)` query on `ai_usage_events WHERE lead_id = ?`. If zero usage (no LLM calls for the lead), the line is hidden.

### 13.3 Budget Block Visibility

If a budget block affected this lead, the `AgentDecisionPanel` shows:

> **Copywriting Agent** — BLOCKED  
> _Stopped: daily agent budget exhausted ($5.00 of $5.00 used). See System Intelligence for override._

This surfaces directly on the lead page so operators see why a lead's workflow stopped, without navigating to System Intelligence.

---

## Section 14 — Analytics and Querying

After Phase 3I, the following analytical queries are supported by the new tables:

| Query | Source tables |
|-------|--------------|
| Decisions by agent (count, last 30 days) | `agent_decisions GROUP BY agent_name` |
| Approval rate by decision type | `agent_decisions WHERE approval_required = true GROUP BY decision_type` with `human_approved = true / false` |
| Override frequency by agent | `agent_decisions WHERE human_override = true GROUP BY agent_name` |
| Tokens by agent / model / feature | `ai_usage_events GROUP BY agent_name / model_name / feature_name` |
| Cost by agent (daily / monthly) | `ai_usage_events GROUP BY agent_name, date_trunc('day', created_at)` |
| Cost per lead | `ai_usage_events GROUP BY lead_id` with lead name join |
| Cost per approved draft | `ai_usage_events JOIN email_drafts WHERE email_drafts.status = 'sent'` |
| Cost per active campaign asset | `ai_usage_events WHERE campaign_asset_id IS NOT NULL GROUP BY campaign_asset_id` |
| Campaign asset performance | `campaign_email_assets.performance_summary` JSONB |
| Budget exhaustion frequency | `ai_budget_events WHERE event_type = 'BUDGET_EXHAUSTED' GROUP BY agent_name, budget_level` |
| Agent stopped events | `ai_budget_events WHERE event_type = 'CALL_BLOCKED' GROUP BY agent_name, date_trunc('day', created_at)` |
| Failed AI calls | `ai_usage_events WHERE success = false GROUP BY agent_name, model_name` |

Most of these queries are exposed via the AI Usage Board (Section 5) without requiring raw DB access.

---

## Section 15 — Migration Assessment

### 15.1 Migration Required: `20240034`

Phase 3I requires exactly one migration: `20240034`. It adds all new tables in a single migration for atomicity.

**New tables in migration `20240034`:**

| Table | Purpose |
|-------|---------|
| `agent_decisions` | Decision log — every agent decision persisted |
| `ai_usage_events` | LLM call log — every AI call with tokens and cost |
| `ai_budget_policies` | Budget policy definitions per level and scope |
| `ai_budget_events` | Budget enforcement event audit log |
| `campaign_email_assets` | Reusable campaign email asset library |
| `campaign_email_sends` | Per-lead campaign send records (asset + personalization) |

**No existing tables modified in `20240034`.**  
The migration is purely additive. No RLS changes to existing tables. No column additions.

### 15.2 Do Not Create the Migration Now

The migration SQL is not written in this design document. It will be written in the Phase 3I implementation plan after this design is approved.

### 15.3 Next Migration After `20240034`

`20240035` — available for Phase 3J (Campaign Email Asset Library).

---

## Section 16 — Test Case Outline

All Phase 3I tests follow the source-reading pattern established in Phase 3C through 3H: `fs.readFileSync` + `path.join(process.cwd(), relPath)`. No Supabase mocking. No LLM API calls. Tests assert structural and behavioral contracts.

**Test file:** `tests/phase3i-decision-usage-budget-campaign-assets.test.ts`

### Block 0 — Agent Decision schema and constants (~6 tests)

- TC-3I-001: Migration `20240034` SQL contains `CREATE TABLE agent_decisions`
- TC-3I-002: `agent_decisions` schema has `tenant_id`, `agent_name`, `decision_type`, `decision_status`
- TC-3I-003: `agent_decisions` schema has `input_snapshot jsonb`, `output_summary jsonb`, `short_reason text`
- TC-3I-004: `agent_decisions` schema has `human_override`, `approval_required` columns
- TC-3I-005: `agent_decisions` schema has `learning_tags text[]`
- TC-3I-006: `database.ts` types `agent_decisions` Row correctly

### Block 1 — AI Usage Event schema (~5 tests)

- TC-3I-007: Migration `20240034` SQL contains `CREATE TABLE ai_usage_events`
- TC-3I-008: `ai_usage_events` schema has `provider`, `model_name`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`
- TC-3I-009: `ai_usage_events` schema has `decision_id`, `lead_id`, `campaign_id`
- TC-3I-010: `ai_usage_events` schema has `success boolean`, `error_reason text`
- TC-3I-011: `database.ts` types `ai_usage_events` Row correctly

### Block 2 — Budget policy schema (~5 tests)

- TC-3I-012: Migration `20240034` SQL contains `CREATE TABLE ai_budget_policies`
- TC-3I-013: `ai_budget_policies` schema has `limit_usd`, `warn_threshold_pct`, `alert_threshold_pct`
- TC-3I-014: `ai_budget_policies` schema has `budget_level text`, `scope_key text`
- TC-3I-015: `ai_budget_policies` schema has `override_requires_approval boolean`
- TC-3I-016: Migration `20240034` SQL contains `CREATE TABLE ai_budget_events`

### Block 3 — Budget preflight and enforcement (~6 tests)

- TC-3I-017: `budget-enforcer` module exports `preflightCheck` function
- TC-3I-018: `preflightCheck` source references `ai_budget_policies` table
- TC-3I-019: `preflightCheck` source references `ai_usage_events` for consumed amount aggregation
- TC-3I-020: `preflightCheck` returns `{ allowed: false }` shape when limit exceeded (source contract)
- TC-3I-021: Budget block creates structured error with `AI_CALL_BLOCKED_BY_BUDGET` type
- TC-3I-022: Budget enforcer does NOT call any LLM provider directly (no Resend, no Anthropic SDK imports in enforcer module)

### Block 4 — Budget warning thresholds (~4 tests)

- TC-3I-023: `AI_BUDGET_FAILURE_TYPE` constants include `AI_CALL_BLOCKED_BY_BUDGET`, `AI_BUDGET_THRESHOLD_WARNING`, `AI_BUDGET_THRESHOLD_ALERT`
- TC-3I-024: 75% threshold emits severity `warning` structured error
- TC-3I-025: 90% threshold emits severity `error` structured error
- TC-3I-026: 100% (block) emits severity `critical` structured error

### Block 5 — Campaign asset schema (~5 tests)

- TC-3I-027: Migration `20240034` SQL contains `CREATE TABLE campaign_email_assets`
- TC-3I-028: `campaign_email_assets` schema has `subject_template`, `body_template_html`, `body_template_text`
- TC-3I-029: `campaign_email_assets` schema has `personalization_fields text[]`, `required_fields text[]`, `fallback_values jsonb`
- TC-3I-030: `campaign_email_assets` status field has valid values: `draft`, `under_review`, `approved`, `active`, `retired`
- TC-3I-031: Migration `20240034` SQL contains `CREATE TABLE campaign_email_sends`

### Block 6 — Deterministic personalization (~4 tests)

- TC-3I-032: Campaign personalization module does NOT import Anthropic SDK or any LLM client
- TC-3I-033: `renderCampaignAsset` (or equivalent) function accepts template + field values and returns rendered string without external calls
- TC-3I-034: Missing required fields are recorded in `missing_required_fields` array, not silently substituted
- TC-3I-035: `campaign_email_sends.personalization_snapshot` is populated before send (source contract: snapshot written in send path)

### Block 7 — Human approval gates (~4 tests)

- TC-3I-036: `campaign_email_assets.status` transitions from `under_review` → `approved` require a non-null `approved_by` field
- TC-3I-037: Campaign asset activation (status `→ active`) requires explicit operator action (no auto-activation in service source)
- TC-3I-038: Budget override path records `override_approved_by` in `ai_budget_events` (source contract)
- TC-3I-039: Campaign send path does NOT call `sendApprovedDraft` without human trigger (no auto-send in campaign asset module)

### Block 8 — Learning-ready fields (~3 tests)

- TC-3I-040: `agent_decisions` repo input accepts `learningTags: string[]` field
- TC-3I-041: `campaign_email_assets.performance_summary` is `jsonb` type (DB type check)
- TC-3I-042: `ai_usage_events` repo write function is called non-fatally (`.catch()` present at all call sites)

### Block 9 — Safety guardrails (~5 tests)

- TC-3I-043: No `resend.emails.send` call in `budget-enforcer` module
- TC-3I-044: No auto-send triggered by campaign asset activation (source: activation action does not call `sendApprovedDraftAction`)
- TC-3I-045: `EMAIL_SENDING_ENABLED` system control is not modified by any Phase 3I module
- TC-3I-046: `ai_usage_events` write does not block the LLM call (non-fatal write pattern)
- TC-3I-047: Agent decision write does not block the agent's primary output (non-fatal write pattern)

**Estimated test count: ~47 new tests → baseline reaches ~1130/1130**

---

## Section 17 — Out-of-Scope Items

The following are explicitly out of scope for Phase 3I:

| Item | Scope |
|------|-------|
| Any implementation code | Design only — no code until implementation plan is approved |
| Migration `20240034` SQL | Will be written in implementation plan |
| Campaign execution (enrolling leads in campaigns) | Phase 3L scope |
| Follow-up scheduling | Phase 3L scope |
| Reply detection | Phase 3L scope |
| Live production sending expansion | Phase 3M gate — requires 3I + 3J + 3K + 3L all satisfied |
| Bulk sends | Not in scope for any current phase |
| Auto-send behavior | Core safety model — never without explicit human approval |
| Unified draft path implementation | Phase 3K scope |
| Campaign assignment model tables (`campaigns`, `campaign_assignments`, `campaign_steps`) | Phase 3L scope |
| Unsubscribe link footer injection | Phase 3M prerequisite — deferred from Phase 3H |
| Email rewrite loop token accounting (retroactive) | Phase 3I adds accounting going forward; no back-fill |
| Any rollout to real leads | `EMAIL_SENDING_ENABLED` remains disabled |
| Auto-resetting budgets via automation | Budget resets are period-based (daily UTC midnight, monthly calendar); no custom cron required |
| Phase 3J implementation | Explicitly excluded — Phase 3J follows Phase 3I |

---

## Section 18 — Proposed Roadmap After Phase 3I

The following sequence builds on Phase 3I's decision log and budget enforcement foundation to enable controlled campaign automation.

| Phase | Theme | Depends on | Key deliverable |
|-------|-------|-----------|----------------|
| **3I** ← current | Agent Decision Log + AI Usage + Budget Enforcement + Campaign Asset Foundation | Phase 3H | `agent_decisions`, `ai_usage_events`, `ai_budget_policies`, `campaign_email_assets`, `campaign_email_sends` tables; budget preflight; AI Usage Board; lead detail Agent Decisions panel |
| **3J** | Campaign Email Asset Library | Phase 3I | Campaign asset library UI; asset creation/revision workflow; personalization preview; asset activation; asset management routes |
| **3K** | Unified Draft / Send Path | Phase 3J | Merge auto-path (`on-lead-created.ts` template path) and Phase 3B pipeline into a single draft creation lifecycle |
| **3L** | Campaign Assignment Model | Phase 3K | `campaigns`, `campaign_assignments`, `campaign_steps` tables; campaign enrollment UI; cadence engine; stop conditions; follow-up scheduling; `FOLLOW_UP_SCHEDULED` activity events |
| **3M** | Learning Loop / Campaign Optimization | Phase 3L | Learning Agent extended to compute signals on campaign assets; `CAMPAIGN_ASSET_REVISION_RECOMMENDED` recommendations; asset revision flow |
| **3N** | Controlled Live Send Pilot | All 3H–3M gates satisfied | `EMAIL_SENDING_ENABLED` enabled for pilot tenant; monitoring dashboard; go/no-go criteria; rollback procedure |

### Updated Pause Milestone — System Verified for Controlled Live Sending

All gates from Phase 3G remain, plus the Phase 3I gates:

| Gate | Phase |
|------|-------|
| `EMAIL_SENDING_ENABLED` kill switch enforced | 3H ✓ |
| Bounce/complaint structured errors live | 3H ✓ |
| Failure attribution typed columns on `email_sends` | 3H ✓ |
| Agent Decision Log live and visible on lead detail | **3I** |
| All LLM calls record usage events | **3I** |
| Budget enforcement preflight before every LLM call | **3I** |
| Campaign email assets approved before any campaign send | **3I** |
| Deterministic personalization — no LLM at send time | **3I** |
| Unified draft creation path | 3K |
| Campaign assignment model live | 3L |
| Campaign stop conditions enforced | 3L |
| Follow-up scheduling operational | 3L |
| Unsubscribe link in all outgoing emails | 3M prereq |

---

## Section 19 — Final Recommendation

### 19.1 Is Phase 3I Ready for Implementation Planning?

**Yes.** The design above is specific enough to proceed to implementation planning without further codebase investigation. All proposed tables, schemas, and behavioral contracts are fully defined. The write sites for `agent_decisions` are identified. The budget enforcement preflight pattern is specified. The campaign asset lifecycle is complete.

The four pillars — Decision Log, AI Usage Tracking, Budget Enforcement, Campaign Asset Strategy — are coherent and mutually reinforcing:
- Usage events feed the budget enforcer
- Decisions link to usage events
- Campaign assets link to decisions (creation decisions) and sends (personalization decisions)
- Budget events surface in System Intelligence alongside workflow and webhook failures

No new LLM providers are required. No new infrastructure beyond Supabase tables. No new external API integrations. All four pillars build on established patterns (structured errors, activity events, non-fatal writes, source-reading tests).

### 19.2 Phase Split Consideration

Phase 3I as designed is larger than any previous phase. It adds six new tables and three distinct behavioral systems (decision log, budget enforcement, campaign assets). If the user prefers a smaller scope for the first implementation iteration, consider splitting:

| Split option | Phase 3I.A | Phase 3I.B |
|-------------|-----------|-----------|
| Option A | Decision Log + AI Usage Tracking | Budget Enforcement + Campaign Assets |
| Option B | Decision Log + AI Usage + Budget Enforcement | Campaign Assets only |

Option B is recommended if splitting: budget enforcement is tightly coupled to AI usage events and should ship together. Campaign assets are more independent and can follow.

If proceeding as a single Phase 3I, estimated test count is ~47 new tests and estimated migration is a single `20240034` file with six `CREATE TABLE` statements.

### 19.3 Exact Next Prompt — Phase 3I Implementation Plan

After user approves this design document:

```
Begin Phase 3I implementation plan only.

Current confirmed state:
- Phase 3I design document approved:
  docs/roadmap/phase-3i-agent-decision-usage-budget-campaign-assets-design.md
- Tests baseline: 1083/1083
- Next migration available: 20240034
- Phase 3I has not started — no code written
- Working tree is clean

Implementation plan should include:

1. Scope confirmation (exactly what Phase 3I delivers — no campaign execution, no auto-send, no Phase 3J)
2. Ordered implementation sequence (migration first, then types, then repos, then services, then UI, then tests)
3. Migration 20240034 exact SQL for all 6 new tables with RLS and indexes
4. agent_decisions repo: createDecision input interface and INSERT call
5. ai_usage_events repo: recordUsage input interface and INSERT call
6. ai_usage_events cost estimation helper: estimateCostUsd(model, promptTokens, completionTokens)
7. ai_budget_policies repo: createPolicy, listPoliciesForTenant, getConsumedAmount
8. budget-enforcer module: preflightCheck function — full signature, query pattern, return type
9. AI_BUDGET_FAILURE_TYPE constants to add to structured-error.types.ts
10. campaign_email_assets repo: createAsset, getAsset, updateAssetStatus, listAssetsForWorkspace
11. campaign_email_sends repo: createSend, updateSendStatus
12. Campaign personalization module: renderCampaignAsset — pure function, no external calls
13. AI Usage Board page: /[workspaceSlug]/settings/ai-usage — server component, all panels
14. AgentDecisionPanel component for lead detail page
15. Write sites: which existing services get agent_decisions writes (auto_draft_creator, recommendation_generator)
16. Write sites: which existing LLM agents get ai_usage_events writes (message_strategy, copywriting, qra, rewrite_loop)
17. Budget preflight call sites: where preflightCheck is inserted in each LLM-calling agent
18. Test suite structure: 9 describe blocks, ~47 tests
19. Completion criteria

Hard constraints:
- Do not write implementation code.
- Do not create migrations.
- Do not apply migrations.
- Do not touch production Supabase.
- Do not deploy production.
- Do not create commits.
- Do not create or push tags.
- Do not enable live sending.
- Do not start Phase 3J.
- Implementation plan only.
```

---

*Phase 3I Design Document v1.0 — 2026-05-28*
