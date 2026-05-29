# Phase 3J — Campaign Email Asset Library
## Design & Test Cases v1.0

**Status:** Design — Awaiting Approval
**Date:** 2026-05-28
**Prerequisites:** Phase 3I complete and locked (`phase-3i-agent-decision-usage-budget-campaign-assets-v1`)
**Next migration available:** `20240035`
**Baseline:** 1130/1130 tests, build passing, `EMAIL_SENDING_ENABLED` disabled

---

## 1. Problem Statement

### 1.1 Why a Campaign Email Asset Library Is Needed After Phase 3I

Phase 3I created the infrastructure: six tables (`campaign_email_assets`, `campaign_email_sends`, `agent_decisions`, `ai_usage_events`, `ai_budget_policies`, `ai_budget_events`), the `renderCampaignAsset` personalization engine, and the `preflightCheck` / `recordUsage` budget hooks. That infrastructure is dormant — it can store campaign assets but provides no UI, no lifecycle management, no approval workflow, and no way for humans to create, review, or activate assets.

Phase 3J builds the human-facing half of that foundation: the Campaign Email Asset Library. This gives operators and sales managers the ability to author, approve, and manage a library of reusable email templates that can eventually be assigned to leads when campaign execution is introduced.

### 1.2 Why Reusable Approved Assets Reduce LLM Cost

Every lead in the current Phase 3B pipeline triggers a fresh LLM call from the Message Strategy Agent and the Copywriting Agent. As the lead volume grows, so does cost. A campaign email asset represents a pre-approved, reusable email that can be personalized deterministically for hundreds of leads without calling Claude at all. Phase 3I's `renderCampaignAsset` performs `{{variable_name}}` substitution in pure TypeScript — no tokens, no latency, no cost.

The LLM is used only once, optionally, at asset creation or revision time. Every subsequent send from that asset against any lead in the target campaign type is free of LLM cost.

### 1.3 Why Campaign Assets Must Be Human-Approved Before Activation

The Phase 3G audit documented that the current decision lifecycle has no human-in-the-loop gate between LLM output and campaign-level reach. A single bad email sent to one lead is a minor incident. A bad email sent to 200 leads via a campaign assignment is a reputation event. The `approved_by` + `approved_at` gate on `campaign_email_assets` (enforced by Phase 3I's `updateAssetStatus` guard) ensures that:

- No asset can reach `approved` or `active` status without a named human approver.
- AI-generated content is visually reviewed and explicitly signed off.
- Activation is always a deliberate human action, never automatic.

### 1.4 Why Routine Campaign Sends Must Use Deterministic Personalization

LLM calls are non-deterministic, slow, and costly. Using Claude to personalize each per-lead email at send time would:
- Cost ~10–50× more than a deterministic render.
- Introduce latency unpredictable enough to break rate-limit budgets.
- Produce content that cannot be reviewed in advance.

Phase 3I's `renderCampaignAsset` already implements field resolution (`field value → fallback → sentinel`), missing-field detection, and a `personalizationSnapshot` for audit. Phase 3J makes this the canonical personalization path for campaign sends. Claude is used once to draft or revise an asset; deterministic rendering handles every subsequent send.

### 1.5 Why Phase 3J Stops at Asset Management

Phase 3J's boundary is the **library management layer**: create, review, approve, activate, retire. It does not implement:
- Which leads receive which assets (campaign assignment — Phase 3L).
- When sends are triggered (follow-up scheduling — Phase 3L).
- The actual send execution (live Resend call — Phase 3N, controlled live pilot only).

Stopping here allows the team to build and validate the asset library with real content before any assignment or scheduling logic is wired. Defects in an asset's template are far cheaper to catch before assignment than after execution.

---

## 2. Phase 3J Scope

**In scope:**

- Campaign Email Asset Library UI at `/[workspaceSlug]/settings/campaign-assets`
- Create / Edit / Submit for Review / Approve / Activate / Retire asset lifecycle
- Deterministic personalization preview using `renderCampaignAsset` (no LLM)
- Human-only asset creation (no AI, no budget calls)
- AI-assisted asset draft creation (optional path; calls `preflightCheck` → LLM → `recordUsage`)
- AI-assisted revision of an existing asset (same path as above)
- Clone-from-existing-asset path (human-only, no AI, new `draft`)
- Template field validation (merge field syntax, required fields, unknown fields)
- Asset list with status badges, type filter, and key metadata columns
- Asset detail view (all fields, approval history, performance placeholder)
- Preview panel using sample lead data or manual test data
- Approved merge field library definition and validation
- Campaign type taxonomy definition
- Agent decision linkage for AI-assisted creation and revision
- AI usage event linkage for AI-assisted creation and revision
- System Intelligence alerts for asset lifecycle anomalies
- Sidebar navigation entry for Campaign Assets
- Read-only analytics / performance placeholders (data populates after Phase 3N)
- Source-reading test suite (~40–50 tests)

---

## 3. Explicit Out-of-Scope Items

| Item | Reason |
|------|--------|
| Campaign execution (sending assets to leads) | Phase 3N — controlled live pilot only |
| Campaign assignment (which leads receive which asset) | Phase 3L |
| Automatic lead enrollment | Phase 3L |
| Follow-up scheduling | Phase 3L |
| Live Resend API calls | Phase 3N |
| Auto-send of any kind | Never automatic — always human-approved |
| Resend sending expansion | `EMAIL_SENDING_ENABLED` remains disabled |
| Unsubscribe implementation | Documented as future prerequisite for Phase 3N only |
| Phase 3K implementation | Unified Draft Path is a separate phase |
| Migration `20240035` creation | No migration required — see Section 18 |
| Phase 3J implementation | This document is design only — no code |

---

## 4. Existing Phase 3I Foundation

Phase 3J does not recreate infrastructure — it consumes what Phase 3I built.

### 4.1 `campaign_email_assets` Table

All fields needed for Phase 3J v1 already exist. See Section 5 for the complete field model. The repo already has `createAsset`, `getAssetById`, `listAssetsForWorkspace`, `updateAssetStatus` (with `approvedBy` guard), and `updatePerformanceSummary`. Phase 3J implementation will add `updateAssetContent` (for editing template body/subject/fields) and a few query helpers.

### 4.2 `campaign_email_sends` — Reserved for Future Campaign Execution Only

The `campaign_email_sends` table exists (Phase 3I) with repo functions `createCampaignSend`, `updateSendStatus`, and `getLeadCampaignSends` already implemented. **Phase 3J must not write any rows to `campaign_email_sends`** — not for real sends, not for test sends, and not for preview snapshots.

Preview in Phase 3J is UI-only and in-memory: `renderCampaignAsset` is called and the result is returned to the browser. Nothing is persisted. No `campaign_email_sends` row is created. No email send record is created.

`campaign_email_sends` is reserved for future campaign execution phases (Phase 3N and beyond), when real sends occur under human authorization with `EMAIL_SENDING_ENABLED = true`. Until then, the table must remain empty of any Phase 3J-originated rows.

### 4.3 `renderCampaignAsset`

Located at `modules/messaging/services/campaign-personalization.service.ts`. Already implements:
- `{{variable_name}}` regex substitution across subject + HTML body + text body
- Field resolution: `fields[name]` → `fallbackValues[name]` → `[name]` sentinel
- `missingRequiredFields: string[]` tracking
- `personalizationSnapshot: Record<string, string>` for audit

Phase 3J uses this as-is for preview. No modifications needed.

### 4.4 `agent_decisions`

Phase 3J writes one `agent_decisions` row per:
- AI-assisted asset creation (decision_type: `'campaign_asset_created'`, entity_type: `'campaign_asset'`)
- AI-assisted asset revision (decision_type: `'campaign_asset_revised'`, entity_type: `'campaign_asset'`)
- Human-triggered activation if a learning-agent recommendation was the prompt (decision_type: `'campaign_asset_activated'`) — future

Human-only creation and status transitions do not create decision rows.

### 4.5 `ai_usage_events`

Phase 3J writes one `ai_usage_events` row per LLM call during AI-assisted creation or revision. The row links `campaign_asset_id` to the generated asset. Deterministic preview writes no usage event.

### 4.6 `ai_budget_policies` / `ai_budget_events`

`preflightCheck` from `ai-budget-enforcer.service.ts` is called before every LLM call during AI-assisted creation or revision. It reads active policies and blocks the call if budget is exhausted, creating a `CALL_BLOCKED` budget event and a `CRITICAL` structured error visible in System Intelligence.

### 4.7 System Intelligence Alerts

Phase 3J adds new `CAMPAIGN_ASSET_FAILURE_TYPE` constants to `structured-error.types.ts` (additive). These power alerts for missing required fields on activation, assets stuck in `under_review` too long, and AI budget blocks during generation.

---

## 5. Campaign Email Asset Library Model

All fields are from the existing `campaign_email_assets` table (migration `20240034`).

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | Auto-generated |
| `tenant_id` | uuid NOT NULL | RLS isolation |
| `workspace_id` | uuid NULL | Scoped to workspace; NULL = tenant-wide |
| `campaign_type` | text NOT NULL | Taxonomy value (Section 11) |
| `asset_name` | text NOT NULL | Human-readable name |
| `subject_template` | text NOT NULL | `{{field}}` placeholders allowed |
| `body_template_html` | text NOT NULL | `{{field}}` placeholders; HTML |
| `body_template_text` | text NOT NULL | `{{field}}` placeholders; plain text |
| `personalization_fields` | text[] NOT NULL | All `{{field}}` names declared in template |
| `required_fields` | text[] NOT NULL | Subset of personalization_fields that must resolve |
| `fallback_values` | jsonb NOT NULL DEFAULT '{}' | Per-field fallback strings |
| `status` | text NOT NULL DEFAULT 'draft' | Lifecycle (Section 6) |
| `llm_generated` | boolean NOT NULL DEFAULT true | `false` for human-only creation |
| `ai_usage_event_id` | uuid NULL | FK to `ai_usage_events` if LLM-generated |
| `decision_id` | uuid NULL | FK to `agent_decisions` if LLM-generated |
| `approved_by` | text NULL | User ID of approver — required for approved/active |
| `approved_at` | timestamptz NULL | Timestamp of approval |
| `performance_summary` | jsonb NULL | Populated by Phase 3N onwards |
| `created_at` | timestamptz NOT NULL | Immutable |
| `updated_at` | timestamptz NOT NULL | Updated on every write |

---

## 6. Asset Lifecycle

### 6.1 Status Definitions

| Status | Meaning |
|--------|---------|
| `draft` | In progress — not yet submitted for review |
| `under_review` | Submitted — awaiting human approval |
| `approved` | Approved by a named human — eligible for activation |
| `active` | Live in the library — eligible for campaign assignment in Phase 3L |
| `retired` | Decommissioned — no new assignments; historical data preserved |

### 6.2 Allowed Transitions

```
draft ──────────────────► under_review ──► approved ──► active
  ▲                                              │          │
  │ (clone creates new draft)                    │          │
  └──────────────────────────────────────────────┘          │
                                                            ▼
                                                         retired
```

| Transition | Trigger | Requirements |
|------------|---------|-------------|
| `draft → under_review` | Human submits for review | `subject_template`, `body_template_html`, `body_template_text` all non-empty |
| `under_review → approved` | Human approves | `approvedBy` (user ID) required; writes `approved_by` + `approved_at` |
| `approved → active` | Human activates | `approvedBy` required; must have no missing required fields |
| `active → retired` | Human retires | No data loss; `send_status` on existing sends unchanged |
| `retired → (any)` | **Blocked** | Retired assets cannot be reactivated; clone to create a new draft |
| `draft → (skip)` | **Blocked** | Must pass `under_review` before `approved` |
| `under_review → active` | **Blocked** | Must pass `approved` before `active` |

### 6.3 Enforcement Points

- `updateAssetStatus` in `campaign-email-asset.repo.ts` already enforces: `approved` and `active` require `approvedBy`.
- Transition guards (e.g., blocking `retired → active`) are enforced in the service layer, not the repo.
- Activation guard: if any `required_fields` member lacks a value in `fallback_values` AND has no fallback, the asset cannot be activated (missing-field pre-check). A warning is shown in the preview panel; activation is blocked with a clear error.
- No agent or automated process may advance the lifecycle beyond `draft`. Only human server actions may call `submitForReviewAction`, `approveAssetAction`, `activateAssetAction`, `retireAssetAction`.

---

## 7. Asset Creation Paths

### 7.1 Human-Created Asset (No AI)

Operator fills out the asset editor form manually. All template content typed or pasted by hand. No LLM call, no `preflightCheck`, no `ai_usage_events` row. `llm_generated = false`. `ai_usage_event_id = null`. `decision_id = null`. Asset created as `draft`.

### 7.2 AI-Assisted Asset Draft (New Asset)

Operator provides a brief prompt (campaign type, tone, pain point, key message). Phase 3J implementation:

1. Calls `preflightCheck` (agent_name: `'campaign_asset_creator'`, estimatedTokens: estimated based on prompt + system context).
2. If blocked: surface structured error in UI; do not call LLM; do not create asset.
3. If allowed: call Claude with the prompt and a strict system prompt enforcing `{{field}}` syntax, required personalization fields, and campaign type context.
4. Parse response: extract `subject_template`, `body_template_html`, `body_template_text`, `personalization_fields`, `required_fields`.
5. Call `recordUsage` with actual token counts; write `ai_usage_events` row.
6. Call `createDecision` with `decision_type: 'campaign_asset_created'`, `entity_type: 'campaign_asset'`.
7. Call `createAsset` with `llm_generated: true`, `ai_usage_event_id`, `decision_id`, status `'draft'`.
8. Open the asset editor pre-populated with the LLM output for human review and editing before submission.

### 7.3 AI-Assisted Revision of an Existing Asset

Operator opens an existing `draft` or `approved` asset and requests an AI revision with a change brief. Flow is identical to 7.2 except:
- `updateAssetContent` is called instead of `createAsset`.
- The existing asset is updated (status resets to `draft` if it was `approved`).
- A new `agent_decisions` row is written with `decision_type: 'campaign_asset_revised'`.
- A new `ai_usage_events` row is written.
- The old `ai_usage_event_id` on the asset is replaced with the new one.

### 7.4 Clone from Existing Asset

Operator clicks "Clone" on any asset. A new `draft` is created by copying all template fields from the source. `llm_generated = false` (clone is human-initiated). `ai_usage_event_id = null`. `decision_id = null`. Source asset is unchanged. Clone starts at `draft` regardless of source status.

### 7.5 Future: Learning-Agent-Recommended Revision

Not implemented in Phase 3J. The Learning Agent may eventually recommend a revision when engagement signals (bounce rate, open rate, reply rate) indicate an asset is underperforming. When implemented: the recommendation surfaces in System Intelligence, a human reviews it, and chooses to accept (triggers AI-assisted revision via path 7.3) or dismiss. Learning agent does not auto-revise assets.

---

## 8. Deterministic Personalization Preview

The preview panel renders a live preview of the asset using `renderCampaignAsset` with sample data. **No LLM call. No Resend call. No `ai_usage_events` row. No `campaign_email_sends` row.**

### 8.1 Sample Data Sources

| Source | Description |
|--------|-------------|
| Sample lead (from database) | Operator selects an existing lead; field values populated from CRM |
| Manual test data | Operator types values directly into a per-field form |
| Fallback-only mode | No overrides; all fields resolved from `fallback_values` only |

### 8.2 Preview Behavior

1. Load asset templates and `fallback_values`.
2. Merge field values from selected source.
3. Call `renderCampaignAsset(asset, fields)`.
4. Display rendered subject, HTML body (iframe or sanitized), text body.
5. Display `missingRequiredFields` list with warning banner if non-empty. Missing required fields block activation but do not block preview.
6. Display `personalizationSnapshot` as a "resolved fields" table for transparency.
7. An "unknown field" warning is shown for any `{{field}}` in the template that is not in the approved merge field library (Section 10).

### 8.3 Preview Is Not a Send

There is no "Send Test" button in Phase 3J. Preview is read-only rendering. A "Send Test Email to myself" feature is a Phase 3N prerequisite and will require `EMAIL_SENDING_ENABLED = true`. Phase 3J must not wire any Resend call from the preview panel.

---

## 9. Template Validation Rules

Validation runs client-side during editing and server-side before status transitions.

| Rule | Behavior |
|------|---------|
| Merge field syntax | `{{field_name}}` — lowercase, underscores only. Unknown casing or spaces: warn + block activation |
| `personalization_fields` completeness | Must list every `{{field}}` present in any template string. Mismatch: block save |
| `required_fields` must be subset | Every entry in `required_fields` must also be in `personalization_fields` |
| Unknown merge fields | Any `{{field}}` not in the approved library (Section 10): warn on save, block activation |
| `subject_template` required | Non-empty; minimum 3 characters |
| `body_template_html` required | Non-empty |
| `body_template_text` required | Non-empty (may be auto-generated from HTML by stripping tags deterministically — no LLM) |
| Missing required fields at activation | If `fallback_values` does not cover all `required_fields`, activation is blocked with explicit field list |
| No embedded send controls | Templates must not contain Resend API calls, webhook triggers, or unsubscribe claim links. Blocked at save. |
| No silent missing fields | Any `{{field}}` that resolves to the `[field_name]` sentinel at send time must be listed in `missingRequiredFields`. This is guaranteed by `renderCampaignAsset`. |

---

## 10. Approved Merge Field Library

The approved merge field library is a compile-time constant (a TypeScript object). Any `{{field}}` in a template that is not in this library triggers a validation warning and blocks activation.

| Field | Source | Fallback | Required? |
|-------|--------|----------|-----------|
| `first_name` | `contacts.first_name` | `"there"` | Optional |
| `company_name` | `companies.name` | `"your company"` | Usually required |
| `industry` | `companies.industry` | `"your industry"` | Optional |
| `city` | `companies.city` | `""` | Optional |
| `state` | `companies.state` | `""` | Optional |
| `estimated_savings` | `companies.estimated_savings` or derived | `""` | Optional |
| `service_category` | `companies.service_category` | `""` | Optional |
| `sender_name` | Workspace sender config | `"The Verian Team"` | Usually required |
| `cta_text` | Asset-level fallback | `"Learn More"` | Optional |
| `cta_url` | Asset-level fallback | `""` | Optional |
| `pain_point_tag` | Lead tag or company tag | `""` | Optional |
| `campaign_type_label` | Derived from `campaign_type` | `""` | Optional |

The `PersonalizationFields` interface in `campaign-personalization.service.ts` already defines this set. The approved library constant is the canonical runtime check. Future fields can be added via a code change (additive) — no migration required since `personalization_fields` is a `text[]` free-form array.

---

## 11. Campaign Type Taxonomy

`campaign_type` is a free-form `text` column (no DB CHECK constraint in Phase 3I). Phase 3J defines a TypeScript constant `CAMPAIGN_TYPE` that serves as the canonical taxonomy for UI dropdowns and validation. This is taxonomy only — it does not implement campaign execution.

| Value | Description |
|-------|-------------|
| `initial_contact` | First outreach to a new lead |
| `statement_follow_up` | Follow-up after a 321 Swipe statement analysis has been delivered |
| `proposal_follow_up` | Follow-up after a formal proposal has been sent |
| `savings_opportunity` | Opportunity-driven outreach based on estimated savings signal |
| `check_in` | Periodic relationship maintenance touch |
| `reactivation` | Re-engage a lead that has gone cold |
| `close_push` | Final conversion push for a late-stage lead |
| `post_analysis_follow_up` | Follow-up after an analysis PDF / proposal package has been sent |

Unknown `campaign_type` values (free-text entry) are allowed but trigger a warning badge in the UI. This preserves forward compatibility without requiring a migration to add an enum constraint.

---

## 12. UI Design

### 12.1 New Route

`/[workspaceSlug]/settings/campaign-assets` — server component page

Also: `/[workspaceSlug]/settings/campaign-assets/[assetId]` — asset detail / editor

### 12.2 Components

| Component | Type | Description |
|-----------|------|-------------|
| `CampaignAssetList` | Server component | Table of all assets for the workspace |
| `CampaignAssetStatusBadge` | Client component | Color-coded badge: draft (gray), under_review (yellow), approved (blue), active (green), retired (muted) |
| `CampaignAssetDetail` | Server component | Full asset view: templates, metadata, approval info, preview, performance placeholder |
| `CampaignAssetEditor` | Client component | Form for creating / editing asset content; live field validation |
| `CampaignAssetPreviewPanel` | Client component | Renders live preview via `renderCampaignAsset` (client-side); sample lead selector or manual field inputs |
| `CampaignAssetReviewPanel` | Server component | Read-only review view for approvers: templates, missing fields, approval form |
| `CampaignAssetPerformancePlaceholder` | Server component | Empty-state card: "Performance data will appear after campaign sends (Phase 3N)" |
| `AiAssetDraftButton` | Client component | "Generate AI Draft" button; loading state; error display; calls server action |
| `CloneAssetButton` | Client component | "Clone" button; calls server action; navigates to new draft |

### 12.3 Asset List Columns

| Column | Notes |
|--------|-------|
| Asset Name | Clickable → detail page |
| Campaign Type | Badge from `CAMPAIGN_TYPE` taxonomy; "Custom" if unknown |
| Status | `CampaignAssetStatusBadge` |
| Personalization Fields | Count of `personalization_fields.length` |
| Required Fields | Count of `required_fields.length` |
| LLM Generated | Icon or "AI" badge if `llm_generated = true` |
| Approved By | User display name or `—` |
| Approved At | Relative time |
| Last Updated | Relative time from `updated_at` |
| Actions | Submit / Approve / Activate / Retire / Clone (contextual by status) |

### 12.4 Sidebar Navigation

Add "Campaign Assets" entry between "AI Usage" and "Settings" in `components/layout/Sidebar.tsx`. Icon: `BookOpen` (Lucide). `href`: `/[workspaceSlug]/settings/campaign-assets`.

---

## 13. Human Approval Gates

Every status transition that advances an asset toward active use requires a human action via a named server action. No automated path exists.

| Gate | Who | Requirement |
|------|-----|-------------|
| Submit for review | Any workspace member | Templates non-empty; field validation passes |
| Approve | Platform admin or workspace manager | `ctx.userId` recorded as `approved_by` |
| Activate | Platform admin or workspace manager | Must be `approved`; no missing required fields without fallbacks |
| Retire active asset | Platform admin or workspace manager | Explicit confirm; data preserved |
| Accept AI-generated draft | Human (any member) | After reviewing LLM output in editor; then submit for review |
| Accept AI-assisted revision | Human | Same as above; existing asset status resets to `draft` |
| Budget override for AI generation | Platform admin | If policy requires override approval (`override_requires_approval = true`); surfaced in System Intelligence — no automatic path |
| Future: accept learning-agent recommendation | Human | Recommendation surfaced in System Intelligence; operator accepts → triggers AI-assisted revision (path 7.3) |

---

## 14. Agent Decision and AI Usage Linkage

### 14.1 When to Write `agent_decisions`

| Event | Write? | `decision_type` |
|-------|--------|----------------|
| Human-only asset creation | No | — |
| AI-assisted asset creation | Yes | `'campaign_asset_created'` |
| AI-assisted asset revision | Yes | `'campaign_asset_revised'` |
| Clone | No | — |
| Status transition (approve, activate, retire) | No (unless learning-agent recommended) | — |
| Future: learning-agent-recommended revision accepted | Yes | `'campaign_asset_activated'` |

Decision row fields: `agent_name: 'campaign_asset_creator'`, `entity_type: 'campaign_asset'`, `entity_id: assetId`, `decision_status: 'completed'` or `'blocked'` (if budget blocked), `ai_usage_event_id`, `input_snapshot: { campaign_type, prompt_brief }`, `output_summary: { asset_name, subject_preview }`.

### 14.2 When to Write `ai_usage_events`

| Event | Write? |
|-------|--------|
| AI-assisted creation | Yes — after successful LLM call |
| AI-assisted revision | Yes — after successful LLM call |
| Deterministic preview | No |
| Human-only creation | No |
| Clone | No |
| Budget-blocked generation | No (no LLM call was made) |

Usage row fields: `agent_name: 'campaign_asset_creator'`, `feature_name: 'asset_generation'`, `campaign_asset_id: assetId`, `model_name`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `estimated_cost_usd`, `success: true`.

---

## 15. Budget Enforcement

| Scenario | Budget Call? | Behavior |
|----------|-------------|---------|
| AI-assisted asset creation | `preflightCheck` before LLM call | If blocked: surface error, do not create asset, write `CALL_BLOCKED` budget event + CRITICAL structured error |
| AI-assisted revision | `preflightCheck` before LLM call | Same as above |
| Deterministic preview | None | No LLM call — no budget impact |
| Human-only creation | None | No LLM call |
| Clone | None | No LLM call |
| Budget threshold warning (75%) | Logged automatically by `preflightCheck` | Structured error `WARNING` appears in System Intelligence |
| Budget threshold alert (90%) | Logged automatically by `preflightCheck` | Structured error `ERROR` appears in System Intelligence |
| Budget exhausted (100%) | `preflightCheck` blocks | Structured error `CRITICAL` in System Intelligence; UI surfaces "AI generation unavailable — budget exhausted" |
| No retry after block | Automatic retry is forbidden | User must wait for budget period to reset or request a policy override |

The `estimatedTokens` value for `preflightCheck` during asset creation: use a conservative estimate of 2000 prompt tokens + 1000 completion tokens based on typical system prompt + campaign brief size. Phase 3J implementation must define this as a named constant (`ASSET_CREATION_ESTIMATED_TOKENS = 3000`).

---

## 16. System Intelligence Visibility

Phase 3J adds `CAMPAIGN_ASSET_FAILURE_TYPE` constants to `structured-error.types.ts` (additive, same pattern as `WEBHOOK_FAILURE_TYPE`):

| Constant | Severity | Trigger |
|----------|---------|---------|
| `CAMPAIGN_ASSET_MISSING_REQUIRED_FIELDS` | WARNING | Activation attempted with missing required fields |
| `CAMPAIGN_ASSET_UNDER_REVIEW_TOO_LONG` | WARNING | Asset in `under_review` for more than N days (configurable threshold) |
| `CAMPAIGN_ASSET_ACTIVATION_BLOCKED` | ERROR | Activation blocked due to validation failure |
| `CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED` | CRITICAL | `preflightCheck` blocked AI generation (mirrors `AI_CALL_BLOCKED_BY_BUDGET` context) |
| `CAMPAIGN_ASSET_REPEATED_REJECTION` | WARNING | Same asset submitted and rejected N times |

These appear in the existing System Intelligence page Critical & Open Errors table. Resolve / Investigate / Ignore lifecycle actions apply without new UI.

The System Intelligence recommendation generator (`runSystemRecommendationGenerator`) may be extended in a future sub-phase (or at implementation time) to generate a `CAMPAIGN_ASSET_REVIEW_NEEDED` recommendation when assets have been in `under_review` for too long.

---

## 17. Analytics and Readiness Placeholders

Phase 3J implements read-only placeholders. Real values populate after Phase 3N (live send pilot).

| Metric | Source | Phase 3J Status |
|--------|--------|----------------|
| Total sends | `campaign_email_sends` WHERE `send_status = 'sent'` | Placeholder — 0 until Phase 3N |
| Delivered count | `email_sends` via `email_send_id` FK | Placeholder |
| Reply count | Activity events (ET_ types) | Placeholder |
| Bounce rate | `email_sends.failure_reason` | Placeholder |
| Open rate | Webhook event tracking (Phase 3N) | Placeholder |
| Last used | `campaign_email_sends.created_at` MAX | 0 until sends exist |
| Cost per asset generation | `ai_usage_events.estimated_cost_usd` WHERE `campaign_asset_id` | Available now (Phase 3I data) |
| Cost per revision | Same, filtered by `feature_name = 'asset_revision'` | Available now |
| Version performance comparison | Requires versioning table | Future / optional |

Phase 3J surfaces "cost per generation" and "cost per revision" from `ai_usage_events` immediately — this is the only real-time performance metric available pre-Phase 3N. All send-outcome metrics show empty state with an explanatory note.

---

## 18. Migration Assessment

**Phase 3J v1 does not require migration `20240035`.**

The `campaign_email_assets` table created in Phase 3I (migration `20240034`) already contains all fields needed for Phase 3J v1:
- Full template storage (`subject_template`, `body_template_html`, `body_template_text`)
- Field lists (`personalization_fields`, `required_fields`, `fallback_values`)
- Status lifecycle (`status`)
- Approval tracking (`approved_by`, `approved_at`)
- AI linkage (`llm_generated`, `ai_usage_event_id`, `decision_id`)
- Performance container (`performance_summary` jsonb)

**What Phase 3J implementation adds without a migration:**
- New repo functions (`updateAssetContent`, `listAssetsByType`, aggregation helpers)
- New TypeScript constants (`CAMPAIGN_TYPE`, `APPROVED_MERGE_FIELDS`, `CAMPAIGN_ASSET_FAILURE_TYPE`)
- New service layer (`campaign-asset.service.ts`)
- New server actions
- New UI pages and components

**Potential future migration (optional, not in Phase 3J):**
If formal versioning is needed (track template content changes history), a `campaign_email_asset_versions` table would be appropriate. This is documented here as a known future consideration but is explicitly out of scope for Phase 3J. A clone workflow (Section 7.4) satisfies the v1 versioning need without a new table.

**Decision: `20240035` will not be created during Phase 3J design or implementation unless a concrete blocking requirement emerges during implementation. Next migration number remains reserved at `20240035`.**

---

## 19. Test Case Outline

All tests follow the source-reading pattern established in Phases 3E–3I: `fs.readFileSync` + string presence assertions. No Supabase mocking, no LLM calls.

| TC | Description |
|----|-------------|
| TC-3J-001 | Campaign assets page file exists at correct path |
| TC-3J-002 | Campaign assets page is a server component (no 'use client') |
| TC-3J-003 | Sidebar contains 'Campaign Assets' nav entry |
| TC-3J-004 | Sidebar uses BookOpen icon for Campaign Assets |
| TC-3J-005 | `campaign-asset.repo.ts` exports `updateAssetContent` function |
| TC-3J-006 | `campaign-asset.repo.ts` exports `listAssetsByType` function |
| TC-3J-007 | `campaign-asset.service.ts` exports `submitAssetForReview` function |
| TC-3J-008 | `campaign-asset.service.ts` exports `approveAsset` function |
| TC-3J-009 | `campaign-asset.service.ts` exports `activateAsset` function |
| TC-3J-010 | `campaign-asset.service.ts` exports `retireAsset` function |
| TC-3J-011 | `campaign-asset.service.ts` exports `cloneAsset` function |
| TC-3J-012 | `campaign-asset.service.ts` does not call `sendApprovedDraft` (safety guardrail) |
| TC-3J-013 | `campaign-asset.service.ts` does not import `@anthropic-ai/sdk` (no direct LLM) |
| TC-3J-014 | `campaign-asset.actions.ts` exports `submitForReviewAction` |
| TC-3J-015 | `campaign-asset.actions.ts` exports `approveAssetAction` |
| TC-3J-016 | `campaign-asset.actions.ts` exports `activateAssetAction` |
| TC-3J-017 | `campaign-asset.actions.ts` exports `retireAssetAction` |
| TC-3J-018 | `campaign-asset.actions.ts` exports `cloneAssetAction` |
| TC-3J-019 | AI-assisted creation service calls `preflightCheck` before LLM |
| TC-3J-020 | AI-assisted creation service calls `recordUsage` after LLM |
| TC-3J-021 | AI-assisted creation service calls `createDecision` |
| TC-3J-022 | AI-assisted creation does NOT create asset if `preflightCheck` returns `allowed: false` |
| TC-3J-023 | `CampaignAssetPreviewPanel` does not call LLM (no `@anthropic-ai/sdk` import) |
| TC-3J-024 | `CampaignAssetPreviewPanel` does not call `sendApprovedDraft` |
| TC-3J-025 | `CampaignAssetPreviewPanel` does not call `resend.emails.send` |
| TC-3J-026 | Template validation: missing required fields at activation returns error |
| TC-3J-027 | Template validation: `approved_by` required when approving asset |
| TC-3J-028 | Template validation: `approved_by` required when activating asset |
| TC-3J-029 | Retired asset cannot be directly activated (transition blocked) |
| TC-3J-030 | `draft → active` direct transition blocked (must pass under_review and approved) |
| TC-3J-031 | Clone creates new asset with `status: 'draft'` regardless of source status |
| TC-3J-032 | Clone creates asset with `llm_generated: false` |
| TC-3J-033 | AI-assisted revision records `ai_usage_events` row |
| TC-3J-034 | AI-assisted revision records `agent_decisions` row |
| TC-3J-035 | AI-assisted revision resets asset status to `draft` |
| TC-3J-036 | `CAMPAIGN_TYPE` constant is defined |
| TC-3J-037 | `APPROVED_MERGE_FIELDS` constant is defined and contains `first_name` |
| TC-3J-038 | `CAMPAIGN_ASSET_FAILURE_TYPE` constants defined in `structured-error.types.ts` |
| TC-3J-039 | `CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED` constant exists |
| TC-3J-040 | No campaign execution code introduced (no `dispatchCampaign` or similar) |
| TC-3J-041 | No auto-send code introduced |
| TC-3J-042 | No Resend API expansion (`resend.emails.send` not called from campaign asset module) |
| TC-3J-043 | `EMAIL_SENDING_ENABLED` system control referenced before any send (future guard) |
| TC-3J-044 | No migration `20240035` created (migration file does not exist) |
| TC-3J-045 | `renderCampaignAsset` not modified by Phase 3J (source-reading assertion) |
| TC-3J-046 | `CampaignAssetPreviewPanel` does not call `createCampaignSend` (no preview DB write) |

Estimated total: ~46 source-reading tests.

---

## 20. Safety Guardrails

The following guardrails are **explicitly hardcoded** into the Phase 3J implementation plan and must be verified in every test run:

| Guardrail | Status |
|-----------|--------|
| `EMAIL_SENDING_ENABLED` remains disabled | Required — no sends of any kind |
| No live sending | Campaign assets are library management only |
| No auto-send | All status transitions are human-triggered |
| No campaign execution | Phase 3N boundary — not crossed |
| No campaign assignment | Phase 3L boundary — not crossed |
| No Resend API expansion | `resend.emails.send` not called from any Phase 3J module |
| No production deployment | Phase 3J is infrastructure-only (UI + service + repos); no migration |
| No migration `20240035` | Not needed; see Section 18 |
| No Phase 3K | Unified Draft Path is a separate phase |
| Preview is not a send | `renderCampaignAsset` only; no Resend call from preview |
| Preview does not write to `campaign_email_sends` | Preview is in-memory only; no DB row created on preview |

---

## 21. Proposed Roadmap After Phase 3J

| Phase | Theme | Key Boundary |
|-------|-------|-------------|
| Phase 3J | Campaign Email Asset Library | Library management only; no execution |
| Phase 3K | Unified Draft Path | Merges Phase 3A template path + Phase 3B pipeline into single decision tree |
| Phase 3L | Campaign Assignment Model | Assigns active assets to lead segments; no live sends yet |
| Phase 3M | Learning Loop / Campaign Optimization | Learning agent integrates campaign performance signals; asset revision recommendations |
| Phase 3N | Controlled Live Send Pilot | `EMAIL_SENDING_ENABLED` enabled for selected workspace only; rate-limited; full monitoring |

Each phase requires approved Design + approved Implementation Plan before code is written. Do not begin Phase 3K until Phase 3J implementation is complete and locked.

---

## 22. Final Recommendation

### Is Phase 3J Ready for Implementation Planning?

**Yes — after this design document is approved.**

The Phase 3I foundation is complete, locked, and production-deployed. All required DB tables, repo primitives, the personalization engine, and the budget enforcement infrastructure are in place. No migration is required for Phase 3J v1. The scope is tightly bounded: asset library management with human approval gates, deterministic preview, and optional AI-assisted authoring.

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| AI-generated template content quality is variable | Human review gate (`under_review → approved`) ensures no LLM output goes live unseen |
| Unknown merge fields introduced by AI generation | Validation blocks activation on unknown `{{fields}}`; warning shown immediately after generation |
| Operator activates an asset with missing required fields for many leads | Activation pre-check: block if `required_fields` has no fallback and no field value. |
| Budget exhausted during asset creation session | `preflightCheck` blocks; System Intelligence CRITICAL alert visible immediately |
| Retirement of a widely-used active asset | Confirmation dialog required; existing `campaign_email_sends` rows are preserved |

### Exact Next Prompt for Phase 3J Implementation Planning

After this design is approved, the following prompt starts implementation planning:

> Produce the Phase 3J implementation plan only.
>
> Input: `docs/roadmap/phase-3j-campaign-email-asset-library-design.md`
>
> The implementation plan must list all files to create or modify, the exact function signatures for every new export, the order of implementation steps, the test case assignments per describe block, and any guardrail assertions. Do not implement code. Do not create migration `20240035`. Do not start Phase 3K.
