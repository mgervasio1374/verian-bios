# Phase 3I — Agent Decision Log, AI Usage Tracking, Budget Enforcement & Campaign Asset Strategy
## Implementation Plan v1.0

**Status:** Proposed — awaiting user approval before any implementation begins
**Design document:** `docs/roadmap/phase-3i-agent-decision-usage-budget-campaign-assets-design.md`
**Depends on:** Phase 3H complete and locked (`b10d0db`, `phase-3h-send-safety-hardening-v1`)
**Tests baseline:** 1083/1083
**Next migration available:** `20240034`
**Date:** 2026-05-28

---

## Section 1 — Scope Confirmation

### 1.1 What Phase 3I Delivers

| # | Deliverable | Scope |
|---|-------------|-------|
| 1 | Migration `20240034` — 6 new tables | Schema |
| 2 | Database types for all 6 new tables | `types/database.ts` |
| 3 | `agent-decision.repo.ts` — create + query agent decisions | New repo |
| 4 | `ai-usage-event.repo.ts` — record and query AI usage events | New repo |
| 5 | `ai-budget-policy.repo.ts` — manage budget policies | New repo |
| 6 | `ai-budget-event.repo.ts` — record budget enforcement events | New repo |
| 7 | `campaign-email-asset.repo.ts` — manage campaign email assets | New repo |
| 8 | `campaign-email-send.repo.ts` — manage per-lead campaign sends | New repo |
| 9 | `ai-cost-estimator.service.ts` — `estimateCostUsd` helper | New service |
| 10 | `ai-budget-enforcer.service.ts` — `preflightCheck` gate | New service |
| 11 | `campaign-personalization.service.ts` — `renderCampaignAsset` helper | New service |
| 12 | `AI_BUDGET_FAILURE_TYPE` constants in structured-error types | Extend existing file |
| 13 | Non-fatal `agent_decisions` writes at 8 existing write sites | Extend existing services |
| 14 | Non-fatal `ai_usage_events` writes at 4 LLM-powered agents | Extend existing services |
| 15 | `preflightCheck` calls before all 4 LLM-powered agent calls | Extend existing services |
| 16 | AI Usage Board at `/[workspaceSlug]/settings/ai-usage` | New page |
| 17 | `AgentDecisionPanel` component on lead detail page | New component + page update |
| 18 | Navigation link to AI Usage Board in settings nav | Nav update |
| 19 | Test suite: `tests/phase3i-decision-usage-budget-campaign-assets.test.ts` | ~47 tests |

### 1.2 Explicit Out-of-Scope (Never Start in Phase 3I)

| Item | Why excluded |
|------|-------------|
| Campaign execution (enrolling leads, sending campaign emails) | Phase 3L |
| Auto-send or triggered send | Core safety model — requires human approval |
| Unified draft path | Phase 3K |
| Campaign assignment model (`campaigns`, `campaign_assignments`, `campaign_steps`) | Phase 3L |
| Follow-up scheduling | Phase 3L |
| Unsubscribe link injection | Phase 3M prerequisite |
| Reply detection | Phase 3L |
| Live production sending | `EMAIL_SENDING_ENABLED` remains disabled |
| Retroactive token accounting for historical LLM calls | Forward-only; no backfill |
| Budget reset cron | Period resets are computed dynamically from `ai_usage_events` timestamps |
| Production Supabase migration during implementation | Staging only; production is a separate explicit step |
| Production Vercel deployment during implementation | Deploy only after staging smoke test passes |

---

## Section 2 — Ordered Implementation Sequence

Steps must be followed in order. Each step depends on the previous.

| Step | Action | File(s) |
|------|--------|---------|
| 1 | Create migration `20240034` | `supabase/migrations/20240034_phase3i_decision_usage_budget_campaign.sql` |
| 2 | Update database types | `types/database.ts` |
| 3 | Create `agent-decision.repo.ts` | `modules/intelligence/repositories/agent-decision.repo.ts` |
| 4 | Create `ai-usage-event.repo.ts` | `modules/intelligence/repositories/ai-usage-event.repo.ts` |
| 5 | Create `ai-budget-policy.repo.ts` | `modules/intelligence/repositories/ai-budget-policy.repo.ts` |
| 6 | Create `ai-budget-event.repo.ts` | `modules/intelligence/repositories/ai-budget-event.repo.ts` |
| 7 | Create `campaign-email-asset.repo.ts` | `modules/messaging/repositories/campaign-email-asset.repo.ts` |
| 8 | Create `campaign-email-send.repo.ts` | `modules/messaging/repositories/campaign-email-send.repo.ts` |
| 9 | Create `ai-cost-estimator.service.ts` | `modules/intelligence/services/ai-cost-estimator.service.ts` |
| 10 | Create `ai-budget-enforcer.service.ts` | `modules/intelligence/services/ai-budget-enforcer.service.ts` |
| 11 | Create `campaign-personalization.service.ts` | `modules/messaging/services/campaign-personalization.service.ts` |
| 12 | Add `AI_BUDGET_FAILURE_TYPE` constants | `modules/intelligence/structured-errors/structured-error.types.ts` |
| 13 | Add `agent_decisions` write sites | 8 existing service files (see Section 7) |
| 14 | Add `ai_usage_events` write sites | 4 LLM agent service files (see Section 8) |
| 15 | Add `preflightCheck` call sites | Same 4 LLM agent service files (see Section 9) |
| 16 | Create `AgentDecisionPanel` component | `app/(workspace)/[workspaceSlug]/leads/[id]/AgentDecisionPanel.tsx` |
| 17 | Update lead detail page | `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` |
| 18 | Create AI Usage Board page | `app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx` |
| 19 | Add AI Usage Board to settings nav | Settings layout nav file |
| 20 | Write test suite | `tests/phase3i-decision-usage-budget-campaign-assets.test.ts` |
| 21 | Local verification | `npx vitest run` + `npx next build` |

**Why migration first:** `types/database.ts` reflects the DB schema. All repo types depend on the database types. All services depend on the repos. The migration anchors the entire type chain.

**Why cost estimator before budget enforcer:** `ai-budget-enforcer.service.ts` calls `estimateCostUsd` internally. The estimator must exist before the enforcer can be written.

**Why budget enforcer before agent write sites:** Steps 13–15 insert `preflightCheck` calls into existing agents. Those calls import the enforcer. The enforcer must be written first.

**Why AgentDecisionPanel before page update:** The panel is imported by the lead detail page. It must exist before the page is modified to import it.

---

## Section 3 — Migration 20240034 Plan

### 3.1 File

`supabase/migrations/20240034_phase3i_decision_usage_budget_campaign.sql`

### 3.2 Tables Created

| Table | Purpose |
|-------|---------|
| `agent_decisions` | Decision log — every agent decision persisted with inputs, outputs, and outcome |
| `ai_usage_events` | LLM call log — every AI call with token counts and estimated cost |
| `ai_budget_policies` | Budget policy definitions per level and scope |
| `ai_budget_events` | Budget enforcement event audit trail |
| `campaign_email_assets` | Reusable campaign email asset library |
| `campaign_email_sends` | Per-lead campaign send records (asset + personalization snapshot) |

### 3.3 Existing Tables Modified

**None.** Migration `20240034` is purely additive. No columns added to existing tables. No existing RLS changed. No existing indexes dropped or altered.

### 3.4 RLS Approach (All 6 New Tables)

All new tables follow the same pattern established in Phase 3C+:

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table_name>_select" ON <table_name>
  FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id');

CREATE POLICY "<table_name>_service_role" ON <table_name>
  FOR ALL USING (auth.role() = 'service_role');
```

- `SELECT`: workspace members can read rows scoped to their tenant
- `INSERT / UPDATE / DELETE`: service role only — agents write via `createSupabaseServiceClient()`
- Same pattern as `automation_failures`, `agent_recommendations`, `activity_events`

### 3.5 Grants

Each new table requires the same grant pattern added in migrations `20240030` and `20240031`:

```sql
GRANT SELECT ON <table_name> TO authenticated;
GRANT ALL ON <table_name> TO service_role;
```

All 6 tables must include these grants in the migration body. Without them, authenticated users get `42501 permission denied` before RLS runs (documented in Phase 3C.1, migrations `20240030`/`20240031`).

### 3.6 Indexes Per Table

**`agent_decisions`:**
```sql
CREATE INDEX idx_agent_decisions_lead     ON agent_decisions (tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_agent_decisions_agent    ON agent_decisions (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_agent_decisions_draft    ON agent_decisions (tenant_id, draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX idx_agent_decisions_campaign ON agent_decisions (tenant_id, campaign_id) WHERE campaign_id IS NOT NULL;
```

**`ai_usage_events`:**
```sql
CREATE INDEX idx_ai_usage_tenant_date ON ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_agent       ON ai_usage_events (tenant_id, agent_name, created_at DESC);
CREATE INDEX idx_ai_usage_lead        ON ai_usage_events (tenant_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_ai_usage_campaign    ON ai_usage_events (tenant_id, campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;
```

**`ai_budget_policies`:** Index on `(tenant_id, is_active)` for fast preflight policy lookup.

**`ai_budget_events`:** Index on `(tenant_id, agent_name, created_at DESC)` for enforcement history queries.

**`campaign_email_assets`:** Index on `(tenant_id, campaign_type, status)` for active asset lookup.

**`campaign_email_sends`:** Index on `(tenant_id, asset_id, lead_id)` for per-lead send history.

### 3.7 Circular FK Resolution

The design links `agent_decisions.ai_usage_event_id → ai_usage_events` and nominally links `ai_usage_events.decision_id → agent_decisions`. A true circular FK cannot be bootstrapped without deferrable constraints.

**Resolution:** `ai_usage_events.decision_id` is a plain `uuid` column with **no FK constraint** in the DB. `agent_decisions.ai_usage_event_id` is a proper FK to `ai_usage_events`. This eliminates the circular FK and preserves all queryable linkage.

Write order at call sites:
1. Write `ai_usage_events` first (awaited via try-catch, not `.catch()`) → get the returned `id`
2. Write `agent_decisions` non-fatally with `ai_usage_event_id` = the returned id (or `null` if usage write failed)

### 3.8 Migration Application Order

1. **Local Docker Supabase** during development (run `supabase db reset` or `supabase migration up`)
2. **Staging Supabase** (`smbausuyetlgxflyhmfg`) immediately before staging smoke test
3. **Production Supabase** (`kxrplupzbsmujjznzhpy`) only after staging smoke test passes — in a separate explicit step, not during implementation

---

## Section 4 — Repository Plan

All repos follow the established pattern:
- Import `createSupabaseServiceClient` from `@/lib/supabase/service`
- Named function exports only (no default exports)
- TypeScript interface for inputs defined inline or at top of file
- On fatal error: `throw new Error('functionName: ' + error.message)`
- Return typed data from `database.ts` Row types

### 4.1 `modules/intelligence/repositories/agent-decision.repo.ts`

**Functions:**

```typescript
interface CreateAgentDecisionInput {
  tenantId:          string
  workspaceId?:      string | null
  agentName:         string
  agentVersion?:     string | null
  decisionType:      string
  decisionStatus?:   string            // default 'completed'
  entityType?:       string | null
  entityId?:         string | null
  leadId?:           string | null
  contactId?:        string | null
  companyId?:        string | null
  draftId?:          string | null
  recommendationId?: string | null
  campaignId?:       string | null
  workflowRunId?:    string | null
  aiUsageEventId?:   string | null
  confidence?:       number | null
  recommendedAction?: string | null
  approvalRequired?: boolean
  shortReason?:      string | null
  inputSnapshot?:    Record<string, unknown>
  outputSummary?:    Record<string, unknown>
  learningTags?:     string[]
}

createDecision(input: CreateAgentDecisionInput): Promise<AgentDecisionRow>
getLeadDecisions(tenantId: string, leadId: string, limit?: number): Promise<AgentDecisionRow[]>
getDecisionById(tenantId: string, decisionId: string): Promise<AgentDecisionRow | null>
```

**Failure behavior:** `createDecision` throws on DB error. All call sites wrap it in `.catch()` — the throw is swallowed at the call site, not inside the repo.

**`getLeadDecisions`:** `ORDER BY created_at DESC LIMIT 10` — used by `AgentDecisionPanel`.

### 4.2 `modules/intelligence/repositories/ai-usage-event.repo.ts`

**Functions:**

```typescript
interface RecordUsageInput {
  tenantId:           string
  workspaceId?:       string | null
  agentName:          string
  featureName?:       string | null
  provider?:          string           // default 'anthropic'
  modelName:          string
  promptTokens?:      number | null
  completionTokens?:  number | null
  totalTokens?:       number | null
  estimatedCostUsd?:  number | null
  providerRequestId?: string | null
  decisionId?:        string | null
  relatedEntityType?: string | null
  relatedEntityId?:   string | null
  leadId?:            string | null
  draftId?:           string | null
  campaignId?:        string | null
  campaignAssetId?:   string | null
  success?:           boolean          // default true
  errorReason?:       string | null
}

recordUsage(input: RecordUsageInput): Promise<AiUsageEventRow>

// Aggregation queries for AI Usage Board
getUsageSummary(tenantId: string, period: 'today' | 'month'): Promise<UsageSummary>
getUsageByAgent(tenantId: string, period: 'today' | 'month'): Promise<UsageByAgent[]>
getUsageByModel(tenantId: string, period: 'today' | 'month'): Promise<UsageByModel[]>
getUsageByFeature(tenantId: string, period: 'today' | 'month'): Promise<UsageByFeature[]>
getTopLeadsByUsage(tenantId: string, limit?: number): Promise<UsageByLead[]>
getUsageTrend(tenantId: string, days?: number): Promise<UsageTrendRow[]>
getFailedCalls(tenantId: string, limit?: number): Promise<AiUsageEventRow[]>
getLeadUsageSummary(tenantId: string, leadId: string): Promise<{ totalCostUsd: number; callCount: number }>
```

**`recordUsage`:** Returns the inserted row. Call sites that need the id to link to `agent_decisions` must await this function inside a try-catch, not via `.catch()`. Subsequent `.catch()` pattern is for the `createDecision` call only.

**Aggregation queries:** Use `SUM`, `COUNT`, `GROUP BY` via Supabase RPC or PostgREST aggregation. These are server-component-only queries; no client state.

### 4.3 `modules/intelligence/repositories/ai-budget-policy.repo.ts`

**Functions:**

```typescript
interface CreateBudgetPolicyInput {
  tenantId:                string
  workspaceId?:            string | null
  budgetLevel:             string
  scopeKey?:               string | null
  limitUsd:                number
  warnThresholdPct?:       number   // default 75
  alertThresholdPct?:      number   // default 90
  isActive?:               boolean  // default true
  overrideRequiresApproval?: boolean // default true
}

createPolicy(input: CreateBudgetPolicyInput): Promise<AiBudgetPolicyRow>
listActivePoliciesForTenant(tenantId: string, workspaceId?: string): Promise<AiBudgetPolicyRow[]>
updatePolicyLimit(tenantId: string, policyId: string, limitUsd: number): Promise<void>
```

**`listActivePoliciesForTenant`:** `WHERE is_active = true AND tenant_id = ?`. This is the preflight's first query.

### 4.4 `modules/intelligence/repositories/ai-budget-event.repo.ts`

**Functions:**

```typescript
interface RecordBudgetEventInput {
  tenantId:            string
  eventType:           string   // 'CALL_BLOCKED' | 'BUDGET_EXHAUSTED' | 'THRESHOLD_WARNING' | 'THRESHOLD_ALERT' | 'OVERRIDE_REQUESTED' | 'OVERRIDE_APPROVED'
  agentName:           string
  budgetLevel:         string
  policyId?:           string | null
  limitUsd?:           number | null
  consumedUsd?:        number | null
  blockedCallContext?: Record<string, unknown>
  leadId?:             string | null
  campaignId?:         string | null
  overrideApprovedBy?: string | null
}

recordBudgetEvent(input: RecordBudgetEventInput): Promise<AiBudgetEventRow>
getBudgetEventsForTenant(tenantId: string, limit?: number): Promise<AiBudgetEventRow[]>
```

### 4.5 `modules/messaging/repositories/campaign-email-asset.repo.ts`

**Functions:**

```typescript
interface CreateCampaignAssetInput {
  tenantId:               string
  workspaceId?:           string | null
  campaignType:           string
  assetName:              string
  subjectTemplate:        string
  bodyTemplateHtml:       string
  bodyTemplateText:       string
  personalizationFields:  string[]
  requiredFields:         string[]
  fallbackValues?:        Record<string, string>
  llmGenerated?:          boolean   // default true
  aiUsageEventId?:        string | null
  decisionId?:            string | null
}

createAsset(input: CreateCampaignAssetInput): Promise<CampaignEmailAssetRow>
getAssetById(tenantId: string, assetId: string): Promise<CampaignEmailAssetRow | null>
listAssetsForWorkspace(tenantId: string, workspaceId: string, status?: string): Promise<CampaignEmailAssetRow[]>

updateAssetStatus(
  tenantId: string,
  assetId: string,
  status: 'under_review' | 'approved' | 'active' | 'retired',
  approvedBy?: string | null
): Promise<void>

updatePerformanceSummary(
  tenantId: string,
  assetId: string,
  summary: Record<string, unknown>
): Promise<void>
```

**`updateAssetStatus`:** When `status` is `'approved'` or `'active'`, `approved_by` must be non-null. The repo enforces this with a guard:

```typescript
if ((status === 'approved' || status === 'active') && !approvedBy) {
  throw new Error('updateAssetStatus: approvedBy is required when approving or activating an asset')
}
```

This enforces the human approval gate at the data layer, not just the UI layer.

### 4.6 `modules/messaging/repositories/campaign-email-send.repo.ts`

**Functions:**

```typescript
interface CreateCampaignSendInput {
  tenantId:                  string
  assetId:                   string
  leadId:                    string
  contactId?:                string | null
  renderedSubject:           string
  renderedBodyHtml?:         string | null
  renderedBodyText?:         string | null
  personalizationSnapshot:   Record<string, string>
  missingRequiredFields?:    string[]
  sendStatus?:               string   // default 'pending'
}

createCampaignSend(input: CreateCampaignSendInput): Promise<CampaignEmailSendRow>
updateSendStatus(tenantId: string, sendId: string, status: string, emailSendId?: string | null): Promise<void>
getLeadCampaignSends(tenantId: string, leadId: string): Promise<CampaignEmailSendRow[]>
```

---

## Section 5 — Service / Helper Plan

### 5.1 `modules/intelligence/services/ai-cost-estimator.service.ts`

**Purpose:** Pure synchronous helper. No external calls, no DB access, no imports beyond constants.

**Signature:**

```typescript
// Model pricing rates at time of design — stored as constants
// Update rates here if provider pricing changes
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-sonnet-4-6':        { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.25,  outputPer1M: 1.25  },
  'claude-opus-4-7':           { inputPer1M: 15.00, outputPer1M: 75.00 },
}

export function estimateCostUsd(
  modelName:        string,
  promptTokens:     number,
  completionTokens: number
): number
// Returns 0.000000 if modelName is unrecognized (fail-safe, not fail-open)
// Precision: 6 decimal places to align with `numeric(10,6)` column type
```

**No side effects.** This function is imported by `ai-budget-enforcer.service.ts` (preflight cost estimation) and by LLM call sites after provider responses (usage recording).

### 5.2 `modules/intelligence/services/ai-budget-enforcer.service.ts`

**Purpose:** Preflight gate before every LLM call. Aggregates consumed costs, compares to policy limits, returns allow/block decision. Also records warning/alert structured errors and budget events.

**Imports:**
- `ai-budget-policy.repo.ts` (list active policies)
- `ai-usage-event.repo.ts` (aggregate consumed cost)
- `ai-budget-event.repo.ts` (record enforcement events)
- `structured-error.repo.ts` (create warning/alert/critical errors)
- `ai-cost-estimator.service.ts` (estimate call cost)
- `AI_BUDGET_FAILURE_TYPE`, `SE_SEVERITY` from structured error types

**Signature:**

```typescript
interface PreflightInput {
  tenantId:         string
  workspaceId?:     string | null
  agentName:        string
  leadId?:          string | null
  draftId?:         string | null
  campaignId?:      string | null
  workflowRunId?:   string | null
  estimatedTokens:  number    // prompt token estimate from caller
  modelName:        string    // used to compute estimated cost of planned call
}

interface PreflightResult {
  allowed:      boolean
  reason?:      string        // 'budget_exhausted' when allowed=false
  budgetLevel?: string        // which level triggered the block
  remainingUsd?: number
  warning?:     string        // 'approaching_limit' when allowed=true but threshold crossed
  usedPct?:     number        // percentage consumed for warning context
}

export async function preflightCheck(input: PreflightInput): Promise<PreflightResult>
```

**Internal logic sequence:**

1. Fetch all active policies for `tenantId` via `listActivePoliciesForTenant`
2. For each policy, compute the relevant time window (today = UTC calendar day, month = UTC calendar month, etc.)
3. For each policy, query `SUM(estimated_cost_usd)` from `ai_usage_events` for the tenant + relevant scope key + time window
4. Compare consumed vs. `limit_usd`:
   - `≥ 100%`: return `{ allowed: false, reason: 'budget_exhausted', budgetLevel, remainingUsd: 0 }`. Also call (non-fatally) `recordBudgetEvent({ event_type: 'CALL_BLOCKED' })` and `createStructuredError({ failureType: AI_BUDGET_FAILURE_TYPE.AI_CALL_BLOCKED_BY_BUDGET, severity: SE_SEVERITY.CRITICAL })`
   - `≥ 90%`: add warning to result, call (non-fatally) `recordBudgetEvent({ event_type: 'THRESHOLD_ALERT' })` and `createStructuredError({ failureType: AI_BUDGET_FAILURE_TYPE.AI_BUDGET_THRESHOLD_ALERT, severity: SE_SEVERITY.ERROR })`
   - `≥ 75%`: add warning to result, call (non-fatally) `recordBudgetEvent({ event_type: 'THRESHOLD_WARNING' })` and `createStructuredError({ failureType: AI_BUDGET_FAILURE_TYPE.AI_BUDGET_THRESHOLD_WARNING, severity: SE_SEVERITY.WARNING })`
5. If all policies pass: return `{ allowed: true }`

**Performance note:** If no active policies exist for the tenant, `preflightCheck` returns `{ allowed: true }` immediately without any `ai_usage_events` query. Zero policies = no constraints.

**No LLM calls.** No Resend calls. No external API calls of any kind.

### 5.3 `modules/messaging/services/campaign-personalization.service.ts`

**Purpose:** Pure deterministic personalization. No LLM calls, no DB access, no external calls.

**Signature:**

```typescript
interface PersonalizationFields {
  first_name?:           string | null
  company_name?:         string | null
  industry?:             string | null
  city?:                 string | null
  state?:                string | null
  estimated_savings?:    string | null
  service_category?:     string | null
  sender_name?:          string | null
  cta_text?:             string | null
  cta_url?:              string | null
  pain_point_tag?:       string | null
  campaign_type_label?:  string | null
  [key: string]: string | null | undefined
}

interface RenderResult {
  renderedSubject:        string
  renderedBodyHtml:       string
  renderedBodyText:       string
  missingRequiredFields:  string[]
  personalizationSnapshot: Record<string, string>
}

export function renderCampaignAsset(
  asset: {
    subjectTemplate:       string
    bodyTemplateHtml:      string
    bodyTemplateText:      string
    requiredFields:        string[]
    fallbackValues?:       Record<string, string>
  },
  fields: PersonalizationFields
): RenderResult
```

**Template substitution:** `{{variable_name}}` placeholders replaced by `fields[variable_name]`, then `fallbackValues[variable_name]` if absent, then `[variable_name]` sentinel for operator visibility. Required fields missing → included in `missingRequiredFields` without throwing.

**No import of Anthropic SDK.** No import of Resend. No `fetch`. No async operations. Pure string manipulation.

**`personalizationSnapshot`:** Contains only fields that were actually substituted (not null/missing). Stored in `campaign_email_sends.personalization_snapshot` before any send attempt.

---

## Section 6 — Structured Error and Recommendation Constants

### 6.1 File

`modules/intelligence/structured-errors/structured-error.types.ts`

### 6.2 Add `AI_BUDGET_FAILURE_TYPE` Block

Insert after the existing `WEBHOOK_FAILURE_TYPE` block (currently lines 27–32):

```typescript
// Phase 3I: AI budget enforcement failure types
export const AI_BUDGET_FAILURE_TYPE = {
  AI_CALL_BLOCKED_BY_BUDGET:    'AI_CALL_BLOCKED_BY_BUDGET',
  AI_BUDGET_THRESHOLD_ALERT:    'AI_BUDGET_THRESHOLD_ALERT',
  AI_BUDGET_THRESHOLD_WARNING:  'AI_BUDGET_THRESHOLD_WARNING',
  AI_CALL_FAILED:               'AI_CALL_FAILED',
  CAMPAIGN_ASSET_MISSING_FIELDS:'CAMPAIGN_ASSET_MISSING_FIELDS',
  CAMPAIGN_ASSET_UNDERPERFORMING:'CAMPAIGN_ASSET_UNDERPERFORMING',
  AGENT_DECISION_REPEATED_OVERRIDE:'AGENT_DECISION_REPEATED_OVERRIDE',
} as const
export type AiBudgetFailureType = typeof AI_BUDGET_FAILURE_TYPE[keyof typeof AI_BUDGET_FAILURE_TYPE]
```

### 6.3 System Recommendation Label Constants

These are string constants used when creating system recommendations via `system-recommendation.service.ts`. Add to `modules/intelligence/system-recommendation/system-recommendation.types.ts`:

```typescript
// Phase 3I recommendation types
AI_BUDGET_EXHAUSTED = 'AI_BUDGET_EXHAUSTED',
AI_COST_SPIKE_DETECTED = 'AI_COST_SPIKE_DETECTED',
CAMPAIGN_ASSET_REVISION_RECOMMENDED = 'CAMPAIGN_ASSET_REVISION_RECOMMENDED',
AGENT_OVERRIDE_PATTERN = 'AGENT_OVERRIDE_PATTERN',
```

### 6.4 No Other Changes to Existing Constants

`SE_SEVERITY`, `SE_STATUS`, `WORKFLOW_FAILURE_TYPE`, `WEBHOOK_FAILURE_TYPE`, `CreateStructuredErrorInput`, `StructuredErrorStats` — all unchanged.

---

## Section 7 — Agent Decision Write-Site Plan

All writes are **non-fatal**: wrapped in `.catch((err) => console.error('[agent-name] Failed to write agent decision:', err))`. A write failure must never throw, never block the agent's primary return, and never alter the agent's output.

### 7.1 `modules/intelligence/services/scoring-pipeline.service.ts`

**Where:** After both score rows are persisted and the recommendation is generated (after `recommendationService.generateRecommendation`).

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId:       ctx.tenantId,
  workspaceId:    ctx.workspaceId,
  agentName:      'lead_scoring_pipeline',
  agentVersion:   'rules-v1',
  decisionType:   'score_computed',
  decisionStatus: 'completed',
  leadId,
  workflowRunId,
  shortReason: `Fit=${fitCalc.score}, Urgency=${urgencyCalc.score} computed via rules-v1`,
  inputSnapshot:  { lead_stage: lead.stage, estimated_value: lead.estimated_value },
  outputSummary:  { fit_score: fitCalc.score, urgency_score: urgencyCalc.score, model_used: 'rules-v1' },
  learningTags:   ['scored', lead.stage ?? 'unknown_stage'],
}).catch((err) => console.error('[scoring-pipeline] Failed to write agent decision:', err))
```

### 7.2 `modules/intelligence/services/recommendation.service.ts`

**Where:** Inside `generateRecommendation`, after `recommendationRepo.persistRecommendation` succeeds.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId:        ctx.tenantId,
  workspaceId:     ctx.workspaceId,
  agentName:       'recommendation_generator',
  agentVersion:    'rules-v1',
  decisionType:    'rule_matched',
  decisionStatus:  'completed',
  leadId,
  recommendationId: savedRec.id,
  workflowRunId,
  shortReason: `Rule ${matchedRule.id} fired: fit=${fitScore}, urgency=${urgencyScore}`,
  inputSnapshot:  { fit_score: fitScore, urgency_score: urgencyScore, lead_stage: lead.stage, rule_id: matchedRule.id },
  outputSummary:  { recommendation_type: savedRec.recommendation_type, priority: savedRec.priority, recommendation_id: savedRec.id },
  learningTags:   [matchedRule.id, `priority_${savedRec.priority}`, lead.stage ?? 'unknown_stage'],
}).catch((err) => console.error('[recommendation-generator] Failed to write agent decision:', err))
```

### 7.3 `modules/messaging/services/email-draft.service.ts`

**Where:** Inside `createLeadEmailDraft`, after the draft is successfully inserted.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId:       ctx.tenantId,
  workspaceId:    ctx.workspaceId,
  agentName:      'auto_draft_creator',
  agentVersion:   'template-v1',
  decisionType:   'template_selected',
  decisionStatus: 'completed',
  leadId,
  draftId:        createdDraft.id,
  shortReason: `Template ${templateSlug} selected for rule ${ruleId}`,
  inputSnapshot:  { rule_id: ruleId, template_slug: templateSlug, lead_stage: lead.stage, has_contact: !!lead.contact_id, has_email: !!contact?.email },
  outputSummary:  { draft_id: createdDraft.id, template_slug: templateSlug, superseded_count: supersededCount },
  learningTags:   [templateSlug, ruleId, lead.stage ?? 'unknown_stage'],
}).catch((err) => console.error('[auto-draft-creator] Failed to write agent decision:', err))
```

### 7.4 `modules/messaging/strategy/message-strategy.service.ts`

**Where:** After the strategy is classified and persisted (or returned), before returning from the strategy service.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId,
  agentName:      'message_strategy_agent',
  agentVersion:   'claude-sonnet-4-6',
  decisionType:   'strategy_generated',
  decisionStatus: 'completed',
  leadId,
  draftId,
  aiUsageEventId: usageEventId,  // from Section 8 write above
  confidence:     classification.confidence ?? null,
  shortReason: `Strategy: ${classification.strategyLabel} (${classification.primaryAngle})`,
  inputSnapshot:  { lead_stage: input.lead?.stage, industry: input.company?.industry, trigger: classification.trigger },
  outputSummary:  { primary_angle: classification.primaryAngle, relationship_context: classification.relationshipContext, strategy_label: classification.strategyLabel, model_used: 'claude-sonnet-4-6' },
  learningTags:   [classification.primaryAngle, classification.relationshipContext, classification.trigger],
}).catch((err) => console.error('[message-strategy-agent] Failed to write agent decision:', err))
```

### 7.5 `modules/messaging/copywriting/copywriting-agent.service.ts`

**Where:** After versions are generated and persisted, before returning `CopywritingResult`.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId,
  agentName:      'copywriting_agent',
  agentVersion:   'claude-sonnet-4-6',
  decisionType:   'versions_generated',
  decisionStatus: result.success ? 'completed' : 'failed',
  leadId,
  draftId,
  aiUsageEventId: usageEventId,  // from Section 8
  shortReason: result.success
    ? `${versions.length} versions generated via ${skillsSelected.join(', ')}`
    : `Copywriting failed: ${result.errors?.[0]?.code ?? 'unknown'}`,
  inputSnapshot:  { strategy_id: strategyId, version_count_requested: versionPlan.length, skills_selected: skillsSelected },
  outputSummary:  { version_count_produced: versions.length, top_label: versions[0]?.label ?? null, ai_usage_event_id: usageEventId },
  learningTags:   skillsSelected,
}).catch((err) => console.error('[copywriting-agent] Failed to write agent decision:', err))
```

### 7.6 `modules/messaging/quality-review/quality-review-agent.service.ts`

**Where:** After the ranking is computed and the best version identified.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId,
  agentName:      'quality_review_agent',
  agentVersion:   'claude-sonnet-4-6',
  decisionType:   'version_ranked',
  decisionStatus: 'completed',
  leadId,
  draftId,
  aiUsageEventId: usageEventId,  // from Section 8 (only set if LLM path was used)
  confidence:     topVersion.compositeScore ?? null,
  recommendedAction: `version:${topVersion.label}`,
  shortReason: `Version "${topVersion.label}" ranked top with composite score ${topVersion.compositeScore}`,
  inputSnapshot:  { version_count: versions.length, scoring_rubric: 'rubric-v1' },
  outputSummary:  { top_version_id: topVersion.id, top_label: topVersion.label, top_composite_score: topVersion.compositeScore, recommended_version_id: topVersion.id },
  learningTags:   [`version_count_${versions.length}`, topVersion.label ?? 'unknown'],
}).catch((err) => console.error('[quality-review-agent] Failed to write agent decision:', err))
```

### 7.7 `modules/messaging/learning-agent/learning-agent.service.ts`

**Where:** After signal computation completes and the snapshot is persisted.

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId,
  agentName:      'learning_agent',
  agentVersion:   'statistical-v1',
  decisionType:   'signals_computed',
  decisionStatus: 'completed',
  shortReason: `Learning signals computed for ${signalCount} signals over ${lookbackDays}-day window`,
  inputSnapshot:  { lookback_days: lookbackDays, signal_count: signalCount },
  outputSummary:  { snapshot_count: snapshotCount, run_id: runId },
  learningTags:   ['learning_run', `window_${lookbackDays}d`],
}).catch((err) => console.error('[learning-agent] Failed to write agent decision:', err))
```

### 7.8 `modules/messaging/services/email-rewrite-loop.service.ts`

**Where:** After the rewrite loop completes (success or exhaustion).

**Write:**
```typescript
agentDecisionRepo.createDecision({
  tenantId,
  agentName:      'email_rewrite_agent',
  agentVersion:   'claude-sonnet-4-6',
  decisionType:   'rewrite_applied',
  decisionStatus: finalVersionId ? 'completed' : 'failed',
  leadId,
  draftId,
  aiUsageEventId: usageEventId,  // from Section 8
  shortReason: `Rewrite loop: ${iterations} iterations, best score ${bestScore}`,
  inputSnapshot:  { version_count_requested: maxVersions, best_version_score: bestScore },
  outputSummary:  { iterations, final_version_id: finalVersionId, ai_usage_event_id: usageEventId },
  learningTags:   [`rewrite_iterations_${iterations}`, finalVersionId ? 'rewrite_success' : 'rewrite_failed'],
}).catch((err) => console.error('[email-rewrite-agent] Failed to write agent decision:', err))
```

---

## Section 8 — AI Usage Event Write-Site Plan

All LLM call sites follow this pattern:

```typescript
// 1. Make the LLM call — get provider response with usage info
const response = await anthropicClient.messages.create({ ... })
const promptTokens      = response.usage.input_tokens
const completionTokens  = response.usage.output_tokens
const totalTokens       = promptTokens + completionTokens

// 2. Compute estimated cost
const estimatedCostUsd = estimateCostUsd('claude-sonnet-4-6', promptTokens, completionTokens)

// 3. Write usage event — AWAITED (try-catch) to get the id for decision linkage
let usageEventId: string | null = null
try {
  const usageEvent = await aiUsageRepo.recordUsage({
    tenantId,
    agentName,
    featureName,
    provider:          'anthropic',
    modelName:         'claude-sonnet-4-6',
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    providerRequestId: response.id ?? null,
    leadId:            leadId ?? null,
    draftId:           draftId ?? null,
    success:           true,
  })
  usageEventId = usageEvent.id
} catch (err) {
  console.error('[agent-name] Failed to record AI usage event:', err)
}
// usageEventId is now available (or null if write failed) for createDecision in Section 7
```

**On LLM call failure:**
```typescript
} catch (llmError) {
  // Record failed usage event
  try {
    await aiUsageRepo.recordUsage({
      tenantId, agentName, featureName, provider: 'anthropic',
      modelName: 'claude-sonnet-4-6',
      success:      false,
      errorReason:  String(llmError),
    })
  } catch (logErr) {
    console.error('[agent-name] Failed to record failed AI usage event:', logErr)
  }
  throw llmError  // re-throw so the agent's error handling runs normally
}
```

### 8.1 Write Sites

| Agent | File | `featureName` | Model |
|-------|------|---------------|-------|
| Message Strategy Agent | `modules/messaging/strategy/message-strategy.service.ts` | `'strategy_generation'` | `'claude-sonnet-4-6'` |
| Copywriting Agent | `modules/messaging/copywriting/copywriting-agent.body.ts` (and `.subjects.ts` per LLM call) | `'version_copywriting'` | `'claude-sonnet-4-6'` |
| Quality Review Agent | `modules/messaging/quality-review/quality-review-agent.scoring.ts` (LLM path only) | `'qra_scoring'` | `'claude-sonnet-4-6'` |
| Email Rewrite Loop | `modules/messaging/services/email-rewrite-loop.service.ts` | `'rewrite_loop'` | `'claude-sonnet-4-6'` |

**Copywriting agent note:** The copywriting agent makes multiple LLM calls (one per version, per subject/body). Each individual call generates one `ai_usage_events` row. The `agent_decisions` row (Section 7.5) is written once at the end, with the `aiUsageEventId` of the *last* or *most significant* LLM call. Token totals for the full generation run can be derived by querying all `ai_usage_events` rows sharing the same `draft_id` and `agent_name = 'copywriting_agent'`.

**QRA note:** The rubric path does not use an LLM. The LLM-scoring path (if enabled) generates one usage event per scoring call. Only the LLM path calls `recordUsage`.

---

## Section 9 — Budget Preflight Plan

### 9.1 Call Pattern

Insert immediately before every LLM API call in every LLM-powered agent:

```typescript
// Preflight: check budget before sending to LLM provider
const preflight = await preflightCheck({
  tenantId,
  workspaceId:     workspaceId ?? null,
  agentName:       'copywriting_agent',   // agent-specific value
  leadId:          leadId ?? null,
  draftId:         draftId ?? null,
  estimatedTokens: estimatedPromptTokens, // caller estimates from prompt length
  modelName:       'claude-sonnet-4-6',
})

if (!preflight.allowed) {
  // Record blocked decision (non-fatal)
  agentDecisionRepo.createDecision({
    tenantId,
    agentName:      'copywriting_agent',
    decisionType:   'budget_blocked',
    decisionStatus: 'blocked',
    leadId,
    draftId,
    shortReason: `Budget exhausted at level: ${preflight.budgetLevel}`,
    outputSummary:  { budget_level: preflight.budgetLevel, reason: preflight.reason },
  }).catch(() => {})

  return { ok: false, reason: 'budget_exhausted', budgetLevel: preflight.budgetLevel }
}
// Warning present but allowed = log and continue
```

### 9.2 Call Sites

| Agent | File | `estimatedTokens` source |
|-------|------|--------------------------|
| Message Strategy Agent | `modules/messaging/strategy/message-strategy.service.ts` | `Math.ceil(prompt.length / 4)` (character-to-token approximation) |
| Copywriting Agent | `modules/messaging/copywriting/copywriting-agent.body.ts` | Per-version prompt character count / 4 |
| Quality Review Agent | `modules/messaging/quality-review/quality-review-agent.scoring.ts` | Rubric prompt character count / 4 |
| Email Rewrite Loop | `modules/messaging/services/email-rewrite-loop.service.ts` | Per-iteration prompt character count / 4 |

**Token estimation:** `Math.ceil(characterCount / 4)` is a standard approximation. It is intentionally conservative — slightly over-counting is safer than under-counting for budget enforcement.

### 9.3 Preflight Non-Fatal Requirement

The preflight itself (`preflightCheck`) is awaited and can throw if Supabase fails. Wrap the preflight call in a try-catch at each call site:

```typescript
let preflight: PreflightResult = { allowed: true }
try {
  preflight = await preflightCheck({ ... })
} catch (err) {
  console.error('[copywriting-agent] Budget preflight failed — allowing call:', err)
  // Fail-open: if the preflight itself errors, allow the LLM call to proceed
  // This prevents a Supabase outage from silently blocking all LLM calls
}
```

**Fail-open decision:** A Supabase outage on the preflight query must not silently block agent operations. The preflight failure is logged. If budget policy tables are inaccessible, the LLM call proceeds.

### 9.4 Automatic Stop Without Retry

When `preflight.allowed === false`:
- The agent immediately returns `{ ok: false, reason: 'budget_exhausted', budgetLevel }` to its caller
- The caller (workflow or server action) propagates this as an agent failure
- No automatic retry is attempted
- The `AI_CALL_BLOCKED_BY_BUDGET` structured error already created by `preflightCheck` appears in System Intelligence
- Operator must increase the budget limit or approve an override before any re-trigger

---

## Section 10 — Campaign Email Asset Foundation Plan

### 10.1 What Phase 3I Delivers for Campaign Assets

Phase 3I creates the data layer and personalization engine only. No campaign execution, no campaign UI workflows, no campaign assignment.

| Deliverable | In scope |
|-------------|---------|
| `campaign_email_assets` table and repo | Yes |
| `campaign_email_sends` table and repo | Yes |
| `renderCampaignAsset` pure personalization function | Yes |
| Status lifecycle management (draft → under_review → approved → active → retired) | Yes (repo layer) |
| Human approval gate enforcement in `updateAssetStatus` | Yes |
| Missing required fields detection | Yes |
| `personalization_snapshot` before any send | Yes |
| Campaign asset list/create UI | No — Phase 3J |
| Campaign asset generation via LLM | No — Phase 3J (Campaign Email Asset Library) |
| Enrolling leads in campaigns | No — Phase 3L |
| Sending campaign emails | No — Phase 3L |
| Auto-send of any kind | Never without explicit human approval |

### 10.2 Version Lifecycle

| Status | Who sets it | Conditions |
|--------|------------|-----------|
| `draft` | System (on create) | Default — LLM-generated or human-written |
| `under_review` | System (after LLM generation) or operator | Asset ready for human review |
| `approved` | Operator only | `approved_by` must be non-null; enforced in repo |
| `active` | Operator only | `approved_by` must be non-null; asset is live for campaigns |
| `retired` | Operator only | Soft-deactivate; not deleted |

**No automatic status transitions.** No cron or background job sets any asset status. All lifecycle moves require explicit operator action.

### 10.3 Personalization and Required Fields

`renderCampaignAsset` applies merge field substitution in this order:
1. Use value from `fields[name]` if non-null and non-empty
2. Else use `fallbackValues[name]` from the asset definition if defined
3. Else substitute `[variable_name]` sentinel

If a field appears in `required_fields` and step 1 yields null/empty:
- Field is added to `missingRequiredFields`
- The sentinel `[variable_name]` is used in the rendered output
- Caller must inspect `missingRequiredFields` and block the send if non-empty

### 10.4 Pre-Send Snapshot Contract

Before any campaign email is ever sent (Phase 3L scope), the `campaign_email_sends` row must be written first with `personalization_snapshot` populated. This is a design contract — enforcement happens at the send path implementation (Phase 3L), but the data model enforces it by making `personalization_snapshot jsonb NOT NULL`.

---

## Section 11 — UI Plan

### 11.1 AI Usage Board

**Route:** `app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx`

**Type:** Server component. Read-only. No server actions. No LLM calls.

**Permission gate:** `requirePermission(ctx, 'settings.view')` — same as all settings pages.

**Data loading:** Import `ai-usage-event.repo.ts` query functions. All queries run in `Promise.all` for parallel loading.

```typescript
const [summary, byAgent, byModel, byFeature, topLeads, trend, failedCalls] = await Promise.all([
  aiUsageRepo.getUsageSummary(ctx.tenantId, 'today'),
  aiUsageRepo.getUsageByAgent(ctx.tenantId, 'month'),
  aiUsageRepo.getUsageByModel(ctx.tenantId, 'month'),
  aiUsageRepo.getUsageByFeature(ctx.tenantId, 'month'),
  aiUsageRepo.getTopLeadsByUsage(ctx.tenantId, 10),
  aiUsageRepo.getUsageTrend(ctx.tenantId, 30),
  aiUsageRepo.getFailedCalls(ctx.tenantId, 20),
])
```

**Summary row (top of page):**
- Total tokens today / this month
- Estimated cost today / this month (formatted as `$0.0042`)
- Total AI calls today / this month
- Failed AI calls today (shown in red if > 0)

**Panel A — Usage by agent (table):**
Columns: Agent | Calls today | Tokens today | Est. cost today | Calls this month | Est. cost this month

**Panel B — Usage by model (table):**
Columns: Model | Calls | Prompt tokens | Completion tokens | Est. cost

**Panel C — Usage by feature (table):**
Columns: Feature | Calls | Tokens | Est. cost

**Panel D — Top 10 leads by AI cost (table):**
Columns: Lead name | Company | Calls | Est. cost — each lead name links to `/leads/[id]`

**Panel E — Campaign usage (empty state for Phase 3I):**
Single card: "No campaigns active. Campaign AI usage will appear here after Phase 3L."

**Panel F — Cost per unit KPIs:**
- Average cost per approved draft (join `ai_usage_events` → `email_sends` via `draft_id` where `email_sends.status = 'sent'`)
- Total rewrite-loop token usage this month (`WHERE agent_name = 'email_rewrite_agent'`)
- Most expensive individual workflow (single `ai_usage_events` row with max `estimated_cost_usd`, linked to lead)

**Panel G — 30-day usage trend (table):**
Columns: Date | Total tokens | Est. cost | Failed calls
Rows ordered by date descending.

**Panel H — Failed AI calls:**
Columns: Date | Agent | Feature | Model | Error reason
Empty state if no failures.

**Settings nav:** Add `AI Usage` link to settings navigation alongside Revenue Analytics and Workflow Health. Nav file is the workspace settings layout (check the layout file in `app/(workspace)/[workspaceSlug]/settings/`).

### 11.2 `AgentDecisionPanel` Component

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/AgentDecisionPanel.tsx`

**Type:** Server component (no client state needed).

**Props:**
```typescript
interface AgentDecisionPanelProps {
  decisions: AgentDecisionRow[]
  totalCostUsd: number
  callCount: number
}
```

**Rendered content per decision row:**
- Agent name (formatted: `'auto_draft_creator'` → `'Auto-Draft Creator'`)
- Decision type (formatted: `'template_selected'` → `'Template Selected'`)
- Decision status badge: Completed (green) / Blocked (red) / Failed (orange) / Overridden (yellow)
- `short_reason` text
- `confidence` if non-null (e.g., `87%`)
- `recommended_action` if non-null
- `approval_required` badge if true
- Relative time (`created_at`)

**Empty state:** "No agent decisions recorded for this lead."

**AI cost line:** Rendered above the decision list if `totalCostUsd > 0`:
> AI Cost for this lead: $0.18 total (3 LLM calls)

**Budget block visibility:** A `BLOCKED` decision status row renders:
> Copywriting Agent — BLOCKED
> _Stopped: daily agent budget exhausted. See System Intelligence for override._

**Component does not trigger any server action.** Read-only display.

### 11.3 Lead Detail Page Update

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

**Changes:**
1. Import `agentDecisionRepo` from `@/modules/intelligence/repositories/agent-decision.repo`
2. Import `aiUsageRepo` from `@/modules/intelligence/repositories/ai-usage-event.repo`
3. Add to the existing `Promise.all` as a 7th entry (with `.catch(() => [])` to maintain non-fatal pattern):

```typescript
const [fitScore, urgencyScore, recommendations, emailDrafts, activityEvents, workflowErrors, agentDecisions] =
  await Promise.all([
    scoreRepo.getCurrentFitScore(ctx.tenantId, 'lead', id),
    scoreRepo.getCurrentUrgencyScore(ctx.tenantId, 'lead', id),
    recommendationRepo.getLeadRecommendations(ctx.tenantId, id),
    emailDraftRepo.getLeadEmailDrafts(ctx.tenantId, id),
    activityEventRepo.listLeadActivityEvents(ctx.tenantId, id, { limit: 20 }).catch(() => []),
    structuredErrorRepo.getWorkflowErrorsForLead(ctx.tenantId, id).catch(() => []),
    agentDecisionRepo.getLeadDecisions(ctx.tenantId, id, 10).catch(() => []),
  ])
```

4. Add lead usage summary (separate await, non-fatal):
```typescript
const leadUsage = await aiUsageRepo.getLeadUsageSummary(ctx.tenantId, id).catch(() => ({ totalCostUsd: 0, callCount: 0 }))
```

5. Render `AgentDecisionPanel` in the `{/* ---- Workflow visibility (Phase 3F) ---- */}` section, below `LeadActivityTimeline`:
```tsx
<AgentDecisionPanel
  decisions={agentDecisions}
  totalCostUsd={leadUsage.totalCostUsd}
  callCount={leadUsage.callCount}
/>
```

**No other changes to the lead detail page.**

---

## Section 12 — Test Plan

### 12.1 Test File

`tests/phase3i-decision-usage-budget-campaign-assets.test.ts`

### 12.2 Pattern

Source-reading via `fs.readFileSync` + `path.join(process.cwd(), relPath)`. No Supabase mocking. No LLM API calls. No Resend calls. Tests assert structural contracts from source code.

### 12.3 Full Test Case List (~47 tests)

**Block 0 — Agent Decision schema and database types** (~6 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-001 | Migration `20240034` contains `CREATE TABLE agent_decisions` | SQL file contains the exact string |
| TC-3I-002 | `agent_decisions` schema has `tenant_id`, `agent_name`, `decision_type`, `decision_status` | SQL contains all four column names |
| TC-3I-003 | `agent_decisions` schema has `input_snapshot jsonb`, `output_summary jsonb`, `short_reason text` | SQL contains all three |
| TC-3I-004 | `agent_decisions` schema has `human_override boolean`, `approval_required boolean` | SQL contains both |
| TC-3I-005 | `agent_decisions` schema has `learning_tags text[]` | SQL contains `learning_tags` |
| TC-3I-006 | `database.ts` types `agent_decisions` Row | `types/database.ts` contains `agent_decisions:` |

**Block 1 — AI Usage Event schema** (~5 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-007 | Migration `20240034` contains `CREATE TABLE ai_usage_events` | SQL file contains the exact string |
| TC-3I-008 | `ai_usage_events` has `provider`, `model_name`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd` | SQL contains all five |
| TC-3I-009 | `ai_usage_events` has `decision_id`, `lead_id`, `campaign_id` | SQL contains all three |
| TC-3I-010 | `ai_usage_events` has `success boolean`, `error_reason text` | SQL contains both |
| TC-3I-011 | `database.ts` types `ai_usage_events` Row | `types/database.ts` contains `ai_usage_events:` |

**Block 2 — Budget policy and event schema** (~5 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-012 | Migration `20240034` contains `CREATE TABLE ai_budget_policies` | SQL file contains the exact string |
| TC-3I-013 | `ai_budget_policies` has `limit_usd`, `warn_threshold_pct`, `alert_threshold_pct` | SQL contains all three |
| TC-3I-014 | `ai_budget_policies` has `budget_level text`, `scope_key text` | SQL contains both |
| TC-3I-015 | `ai_budget_policies` has `override_requires_approval boolean` | SQL contains the column |
| TC-3I-016 | Migration `20240034` contains `CREATE TABLE ai_budget_events` | SQL file contains the exact string |

**Block 3 — Budget preflight and enforcement** (~6 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-017 | `ai-budget-enforcer.service.ts` exports `preflightCheck` | Source contains `export async function preflightCheck(` |
| TC-3I-018 | `preflightCheck` source references `ai_budget_policies` table | Source contains `ai_budget_policies` |
| TC-3I-019 | `preflightCheck` source references `ai_usage_events` for consumed aggregation | Source contains `ai_usage_events` |
| TC-3I-020 | `preflightCheck` returns `allowed: false` shape when blocked | Source contains `allowed: false` |
| TC-3I-021 | Budget block creates `AI_CALL_BLOCKED_BY_BUDGET` structured error | Source contains `AI_CALL_BLOCKED_BY_BUDGET` |
| TC-3I-022 | Budget enforcer does NOT import Anthropic SDK or Resend | Source does NOT contain `@anthropic-ai/sdk` or `resend` |

**Block 4 — Budget warning thresholds** (~4 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-023 | `AI_BUDGET_FAILURE_TYPE` constants include all three key types | `structured-error.types.ts` contains `AI_CALL_BLOCKED_BY_BUDGET`, `AI_BUDGET_THRESHOLD_WARNING`, `AI_BUDGET_THRESHOLD_ALERT` |
| TC-3I-024 | 75% threshold emits `SE_SEVERITY.WARNING` | Budget enforcer source contains `SE_SEVERITY.WARNING` near `AI_BUDGET_THRESHOLD_WARNING` |
| TC-3I-025 | 90% threshold emits `SE_SEVERITY.ERROR` | Budget enforcer source contains `SE_SEVERITY.ERROR` near `AI_BUDGET_THRESHOLD_ALERT` |
| TC-3I-026 | 100% block emits `SE_SEVERITY.CRITICAL` | Budget enforcer source contains `SE_SEVERITY.CRITICAL` near `AI_CALL_BLOCKED_BY_BUDGET` |

**Block 5 — Campaign asset schema** (~5 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-027 | Migration `20240034` contains `CREATE TABLE campaign_email_assets` | SQL file contains the exact string |
| TC-3I-028 | `campaign_email_assets` has `subject_template`, `body_template_html`, `body_template_text` | SQL contains all three |
| TC-3I-029 | `campaign_email_assets` has `personalization_fields text[]`, `required_fields text[]`, `fallback_values jsonb` | SQL contains all three |
| TC-3I-030 | `campaign_email_assets` status field supports `draft`, `under_review`, `approved`, `active`, `retired` | Asset repo or service source contains all five strings |
| TC-3I-031 | Migration `20240034` contains `CREATE TABLE campaign_email_sends` | SQL file contains the exact string |

**Block 6 — Deterministic personalization** (~4 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-032 | `campaign-personalization.service.ts` does NOT import Anthropic SDK or any LLM client | Source does NOT contain `@anthropic-ai/sdk` or `createAnthropic` or `Anthropic(` |
| TC-3I-033 | `renderCampaignAsset` function is exported | Source contains `export function renderCampaignAsset(` |
| TC-3I-034 | Missing required fields are recorded in `missingRequiredFields`, not silently substituted | Source contains `missingRequiredFields` array assignment |
| TC-3I-035 | `personalization_snapshot` is populated by `renderCampaignAsset` | Source contains `personalizationSnapshot` in return value |

**Block 7 — Human approval gates** (~4 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-036 | `campaign-email-asset.repo.ts` enforces non-null `approved_by` on approve/activate | Repo source contains guard: `if ((status === 'approved' \|\| status === 'active') && !approvedBy)` |
| TC-3I-037 | Campaign asset activation requires explicit operator action — no auto-activation in service source | Asset service does NOT contain auto status transition logic (no `setStatus('active')` without operator input) |
| TC-3I-038 | Budget override path records `override_approved_by` in `ai_budget_events` | `ai-budget-event.repo.ts` source contains `overrideApprovedBy` in input interface |
| TC-3I-039 | Campaign send path does NOT call `sendApprovedDraft` | `campaign-email-send.repo.ts` and personalization service do NOT contain `sendApprovedDraft` |

**Block 8 — Learning-ready fields** (~3 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-040 | `agent-decision.repo.ts` input interface accepts `learningTags: string[]` | Repo source contains `learningTags` |
| TC-3I-041 | `campaign_email_assets.performance_summary` is `jsonb` type | Migration SQL contains `performance_summary jsonb` |
| TC-3I-042 | `ai_usage_events` write is called non-fatally at LLM call sites | Strategy, copywriting, and rewrite loop source files contain `recordUsage(` |

**Block 9 — Safety guardrails** (~5 tests)

| TC | Test | Assertion |
|----|------|-----------|
| TC-3I-043 | No `resend.emails.send` call in `ai-budget-enforcer.service.ts` | Source does NOT contain `resend.emails.send` |
| TC-3I-044 | No auto-send triggered by campaign asset activation | Asset repo and service source do NOT contain `sendApprovedDraftAction` |
| TC-3I-045 | `EMAIL_SENDING_ENABLED` system control is not modified by any Phase 3I file | None of the new files contain `EMAIL_SENDING_ENABLED` in a write context |
| TC-3I-046 | `createDecision` writes are called non-fatally at all write sites | Scoring pipeline, recommendation service, and email-draft service each contain `.catch(` after `createDecision` call |
| TC-3I-047 | AI Usage Board page exists at the correct route | `app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx` exists |

**Total: 47 tests → baseline reaches 1130/1130**

---

## Section 13 — Safety Guardrails

| Guardrail | Enforcement |
|-----------|-------------|
| `EMAIL_SENDING_ENABLED` remains disabled in production | Phase 3H Gate 0 is unchanged; no Phase 3I code modifies system controls |
| `sendApprovedDraft()` Phase 3H gates preserved | Phase 3I does not modify `email-send.service.ts`; all 9 gates remain intact |
| No campaign send execution | No call site in Phase 3I calls `sendApprovedDraft` for a campaign send |
| No Resend API expansion | `preflightCheck` and all repos contain no Resend SDK imports |
| No production migration during implementation | Migration applied to local + staging only |
| No production deployment during implementation | Vercel deploy only after staging smoke test |
| No tags created during implementation | Tags are created only after explicit commit approval |
| Non-fatal agent decision writes | All `createDecision` calls wrapped in `.catch()` — agent output never blocked |
| Non-fatal usage event writes | Usage writes use try-catch (awaited for id) but agent throw-chain is never altered |
| Preflight fail-open on Supabase error | Preflight errors logged and LLM call proceeds — outage never silently blocks agents |
| No Phase 3J | Phase 3I ends at the acceptance criteria below |

---

## Section 14 — Acceptance Criteria

Phase 3I is complete when all of the following are verified:

| Criterion | How Verified |
|-----------|-------------|
| Migration `20240034` created | File exists at correct path |
| `database.ts` updated for all 6 new tables | TypeScript compiles without errors |
| All 6 repo files created | Files exist; exported functions match plan |
| `ai-cost-estimator.service.ts` created | `estimateCostUsd` exported, no external calls |
| `ai-budget-enforcer.service.ts` created | `preflightCheck` exported, tested |
| `campaign-personalization.service.ts` created | `renderCampaignAsset` exported, no LLM imports |
| `AI_BUDGET_FAILURE_TYPE` block added | `structured-error.types.ts` contains all 7 constants |
| Agent decision writes at all 8 write sites | Source inspection + TC-3I-046 |
| Usage event writes at all 4 LLM agents | Source inspection + TC-3I-042 |
| `preflightCheck` at all 4 LLM agents | Source inspection + TC-3I-017 |
| `AgentDecisionPanel` component created | File exists; empty state, blocked state handled |
| Lead detail page updated | 7th `Promise.all` entry + `AgentDecisionPanel` rendered |
| AI Usage Board page created | Route responds, all 8 panels render, TC-3I-047 passes |
| Settings nav includes AI Usage link | Link visible in settings nav |
| `npx vitest run` passes with ≥ 1130/1130 | Test run output |
| `npx next build` passes (TypeScript clean) | Build output — no errors |
| Staging migration `20240034` applied | Supabase dashboard |
| Staging smoke test passes | Manual checklist sign-off |
| No production migration applied | Production Supabase remains at migration `20240033` |
| No production deployment | Explicit separate step after smoke test |
| AI context docs updated | `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` |

---

## Section 15 — Implementation Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| **Budget aggregation performance** — preflight queries `ai_usage_events` with a time-window filter and SUM on every LLM call; may slow under volume | Index `(tenant_id, agent_name, created_at DESC)` covers the filter; `estimated_cost_usd` is a numeric column, SUM is fast. If no active policies exist, query is skipped entirely. |
| **Circular FK between `agent_decisions` and `ai_usage_events`** | Resolved: `ai_usage_events.decision_id` is a plain uuid with no FK constraint. `agent_decisions.ai_usage_event_id` is the only FK. Write `ai_usage_events` first to get the id. |
| **Cost estimation accuracy** | Pricing constants in `ai-cost-estimator.service.ts` are snapshotted at implementation time. If provider pricing changes, only the constants file needs updating — historical rows retain their original computed cost. |
| **Non-fatal logging failures obscuring agent errors** | Logging failures are printed to console with `[agent-name]` prefix. They do not affect the agent's return value. Separate from real agent errors which propagate normally. |
| **UI aggregation speed for AI Usage Board** | All queries use indexed columns. `getUsageSummary` uses `date_trunc('day', created_at)` filter which is covered by `idx_ai_usage_tenant_date`. For large datasets, consider Supabase RPC with materialized result. |
| **Accidental auto-send via campaign asset** | TC-3I-039 and TC-3I-044 verify no `sendApprovedDraft` call exists in campaign asset or campaign send code. |
| **Phase 3I / Phase 3J boundary** | Phase 3I creates data model only. Campaign asset creation UI (the LLM call to write a new asset) is Phase 3J. The `campaign_email_assets` table and repo exist in Phase 3I but the creation flow is not wired to any UI. |
| **Copywriting agent makes multiple LLM calls** — one per version | Each call gets its own `ai_usage_events` row. The `agent_decisions` row for the full generation links to the last or main call's usage event id. Token totals across all calls are queryable by joining on `draft_id + agent_name`. |
| **Preflight fail-open may allow budget overruns during Supabase outage** | Accepted trade-off. Silent blocking of all LLM calls during a DB outage is worse than temporary budget overrun. The outage itself is logged; the overrun is bounded by the duration of the outage. |

---

## Section 16 — Final Recommendation

### 16.1 Is Phase 3I Ready for Implementation?

**Yes.** This plan is specific enough to begin implementation after approval. All file paths, function signatures, and integration points are defined. The write-site plan identifies exact functions in existing services. The test plan enumerates every test case. The migration structure is clear and purely additive.

The four pillars are internally coherent:
- `ai_usage_events` feeds `preflightCheck`'s budget consumption queries
- `agent_decisions.ai_usage_event_id` links each decision to the LLM call that produced it
- `campaign_email_assets` + `renderCampaignAsset` deliver deterministic personalization without LLM calls at send time
- All four systems surface in System Intelligence via `AI_BUDGET_FAILURE_TYPE` constants using the existing structured error infrastructure

No new LLM providers. No new external APIs. No Vercel infrastructure changes. Purely additive to the existing codebase.

### 16.2 File Manifest

| File | Action |
|------|--------|
| `supabase/migrations/20240034_phase3i_decision_usage_budget_campaign.sql` | New |
| `types/database.ts` | Modified — add 6 new table Row/Insert/Update types |
| `modules/intelligence/repositories/agent-decision.repo.ts` | New |
| `modules/intelligence/repositories/ai-usage-event.repo.ts` | New |
| `modules/intelligence/repositories/ai-budget-policy.repo.ts` | New |
| `modules/intelligence/repositories/ai-budget-event.repo.ts` | New |
| `modules/messaging/repositories/campaign-email-asset.repo.ts` | New |
| `modules/messaging/repositories/campaign-email-send.repo.ts` | New |
| `modules/intelligence/services/ai-cost-estimator.service.ts` | New |
| `modules/intelligence/services/ai-budget-enforcer.service.ts` | New |
| `modules/messaging/services/campaign-personalization.service.ts` | New |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Modified — add `AI_BUDGET_FAILURE_TYPE` block |
| `modules/intelligence/system-recommendation/system-recommendation.types.ts` | Modified — add 4 new recommendation type constants |
| `modules/intelligence/services/scoring-pipeline.service.ts` | Modified — add `createDecision` write |
| `modules/intelligence/services/recommendation.service.ts` | Modified — add `createDecision` write |
| `modules/messaging/services/email-draft.service.ts` | Modified — add `createDecision` write |
| `modules/messaging/strategy/message-strategy.service.ts` | Modified — add `preflightCheck`, `recordUsage`, `createDecision` |
| `modules/messaging/copywriting/copywriting-agent.service.ts` | Modified — add `createDecision` write |
| `modules/messaging/copywriting/copywriting-agent.body.ts` | Modified — add `preflightCheck`, `recordUsage` |
| `modules/messaging/quality-review/quality-review-agent.scoring.ts` | Modified — add `preflightCheck`, `recordUsage` (LLM path only) |
| `modules/messaging/quality-review/quality-review-agent.service.ts` | Modified — add `createDecision` write |
| `modules/messaging/services/email-rewrite-loop.service.ts` | Modified — add `preflightCheck`, `recordUsage`, `createDecision` |
| `modules/messaging/learning-agent/learning-agent.service.ts` | Modified — add `createDecision` write |
| `app/(workspace)/[workspaceSlug]/leads/[id]/AgentDecisionPanel.tsx` | New |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Modified — add 7th `Promise.all` entry, render `AgentDecisionPanel` |
| `app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx` | New |
| Settings nav layout file | Modified — add AI Usage link |
| `tests/phase3i-decision-usage-budget-campaign-assets.test.ts` | New — 47 source-reading tests |

**Total new files: 17. Modified files: 11. Total: 28 files.**

### 16.3 Exact Next Prompt — Phase 3I Implementation

After user approves this implementation plan:

```
Proceed with Phase 3I implementation only.

Current confirmed state:
- Phase 3I design document approved:
  docs/roadmap/phase-3i-agent-decision-usage-budget-campaign-assets-design.md
- Phase 3I implementation plan approved:
  docs/roadmap/phase-3i-implementation-plan.md
- Tests baseline: 1083/1083
- Next migration available: 20240034
- No implementation has started — working tree is clean

Hard constraints:
- Implement exactly what is in the approved plan
- Do not add features beyond the plan
- Do not apply migrations to staging or production during implementation
- Do not deploy to production during implementation
- Do not create commits until all files are complete and all tests pass
- EMAIL_SENDING_ENABLED remains disabled — do not enable
- No campaign execution, no auto-send, no Phase 3J

Implementation sequence (follow exactly):
1.  Create supabase/migrations/20240034_phase3i_decision_usage_budget_campaign.sql
2.  Update types/database.ts (6 new table Row/Insert/Update types)
3.  Create modules/intelligence/repositories/agent-decision.repo.ts
4.  Create modules/intelligence/repositories/ai-usage-event.repo.ts
5.  Create modules/intelligence/repositories/ai-budget-policy.repo.ts
6.  Create modules/intelligence/repositories/ai-budget-event.repo.ts
7.  Create modules/messaging/repositories/campaign-email-asset.repo.ts
8.  Create modules/messaging/repositories/campaign-email-send.repo.ts
9.  Create modules/intelligence/services/ai-cost-estimator.service.ts
10. Create modules/intelligence/services/ai-budget-enforcer.service.ts
11. Create modules/messaging/services/campaign-personalization.service.ts
12. Update modules/intelligence/structured-errors/structured-error.types.ts
13. Update modules/intelligence/system-recommendation/system-recommendation.types.ts
14. Add createDecision write to scoring-pipeline.service.ts
15. Add createDecision write to recommendation.service.ts
16. Add createDecision write to email-draft.service.ts
17. Add preflightCheck + recordUsage + createDecision to message-strategy.service.ts
18. Add createDecision write to copywriting-agent.service.ts
19. Add preflightCheck + recordUsage to copywriting-agent.body.ts
20. Add preflightCheck + recordUsage to quality-review-agent.scoring.ts (LLM path only)
21. Add createDecision write to quality-review-agent.service.ts
22. Add preflightCheck + recordUsage + createDecision to email-rewrite-loop.service.ts
23. Add createDecision write to learning-agent.service.ts
24. Create app/(workspace)/[workspaceSlug]/leads/[id]/AgentDecisionPanel.tsx
25. Update app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx
26. Create app/(workspace)/[workspaceSlug]/settings/ai-usage/page.tsx
27. Update settings nav to add AI Usage link
28. Create tests/phase3i-decision-usage-budget-campaign-assets.test.ts

After all 28 files are complete:
- Run npx vitest run
- Run npx next build
- Report results
- Do not commit until I explicitly approve

Do not:
- Apply migrations to staging or production
- Deploy production
- Create or push tags
- Commit without explicit approval
- Enable EMAIL_SENDING_ENABLED
- Start Phase 3J
```

---

*Phase 3I Implementation Plan v1.0 — 2026-05-28*
