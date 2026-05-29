# Phase 3J — Campaign Email Asset Library
## Implementation Plan v1.0

**Status:** Awaiting Approval
**Date:** 2026-05-28
**Design input:** `docs/roadmap/phase-3j-campaign-email-asset-library-design.md`
**Phase 3I lock tag:** `phase-3i-agent-decision-usage-budget-campaign-assets-v1`
**Baseline:** 1130/1130 tests, build passing, `EMAIL_SENDING_ENABLED` disabled

---

## 1. Scope Confirmation

**In scope for Phase 3J implementation:**

- Campaign Email Asset Library UI at `/[workspaceSlug]/settings/campaign-assets`
- Full asset lifecycle: create → under_review → approved → active → retired
- Deterministic personalization preview via `renderCampaignAsset` (no LLM, no DB write)
- Human-only asset creation (form, no AI)
- AI-assisted asset draft creation (`preflightCheck` → LLM → `recordUsage` → `createDecision`)
- AI-assisted revision of existing asset (same flow, `updateAssetContent`)
- Clone-from-existing-asset (human-only, new draft)
- Template field validation (syntax, approved library, required fields, activation checks)
- Approved merge field library constant (`APPROVED_MERGE_FIELDS`)
- Campaign type taxonomy constant (`CAMPAIGN_TYPE`)
- Agent decision + AI usage linkage for AI-assisted paths only
- System Intelligence constants for campaign asset lifecycle alerts
- Sidebar navigation entry (Campaign Assets, BookOpen icon)
- Read-only analytics/performance placeholders
- Source-reading test suite (46 tests, TC-3J-001 through TC-3J-046)

**Explicitly not in scope:**

| Item | Boundary |
|------|----------|
| Campaign execution | Phase 3N |
| Campaign assignment | Phase 3L |
| Automatic lead enrollment | Phase 3L |
| Follow-up scheduling | Phase 3L |
| Live Resend API calls | Phase 3N |
| Auto-send of any kind | Never automatic |
| Resend sending expansion | `EMAIL_SENDING_ENABLED` stays disabled |
| Migration `20240035` | Not required — see Section 2 |
| Phase 3K (Unified Draft Path) | Separate phase |
| Preview persistence to `campaign_email_sends` | Forbidden — preview is in-memory only |

---

## 2. Migration Assessment

**No migration required. Do not create `20240035`.**

The `campaign_email_assets` table (migration `20240034`) already provides every field needed for Phase 3J v1:

| Field group | Fields |
|-------------|--------|
| Template storage | `subject_template`, `body_template_html`, `body_template_text` |
| Field lists | `personalization_fields`, `required_fields`, `fallback_values` |
| Lifecycle | `status` (default `'draft'`) |
| Approval | `approved_by`, `approved_at` |
| AI linkage | `llm_generated`, `ai_usage_event_id`, `decision_id` |
| Performance | `performance_summary` jsonb |

`campaign_email_sends` is not used in Phase 3J. It remains reserved for Phase 3N.

The existing repo functions `createAsset`, `getAssetById`, `listAssetsForWorkspace`, `updateAssetStatus` (with `approvedBy` guard), and `updatePerformanceSummary` are already implemented and require no changes.

Phase 3J adds new repo functions (`updateAssetContent`, `listAssetsByType`, `listAssetsByStatus`) to the existing file without schema changes.

**Decision: `20240035` will not be created during Phase 3J implementation. Next migration number stays reserved.**

---

## 3. Ordered Implementation Sequence

Steps must be followed in order. Each step depends on the prior.

| Step | Action | Files |
|------|--------|-------|
| 1 | Constants and types module | `modules/messaging/campaign-assets/campaign-asset.constants.ts`, `campaign-asset.types.ts` |
| 2 | Structured error types (additive) | `modules/intelligence/structured-errors/structured-error.types.ts` |
| 3 | Repository additions | `modules/messaging/repositories/campaign-email-asset.repo.ts` |
| 4 | Template validation service | `modules/messaging/services/campaign-asset-validation.service.ts` |
| 5 | Campaign asset service (lifecycle) | `modules/messaging/services/campaign-asset.service.ts` |
| 6 | AI-assisted authoring service | `modules/messaging/services/campaign-asset-ai.service.ts` |
| 7 | Server actions | `app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts` |
| 8 | Sidebar update | `components/layout/Sidebar.tsx` |
| 9 | UI components | 9 component files (Section 12) |
| 10 | Route pages | `page.tsx` (list), `[assetId]/page.tsx` (detail) |
| 11 | Test suite | `tests/phase3j-campaign-email-asset-library.test.ts` |
| 12 | QA | `npx vitest run` → pass, `npx next build` → pass |

---

## 4. Files to Create

| File | Purpose |
|------|---------|
| `modules/messaging/campaign-assets/campaign-asset.types.ts` | TypeScript types: `AssetStatus`, `AssetTransition`, `AssetTemplateContent`, `CampaignAssetValidationResult`, `AssetPreviewResult` |
| `modules/messaging/campaign-assets/campaign-asset.constants.ts` | `CAMPAIGN_TYPE`, `APPROVED_MERGE_FIELDS`, `ASSET_CREATION_ESTIMATED_TOKENS` |
| `modules/messaging/services/campaign-asset-validation.service.ts` | Template validation, field extraction, transition guards |
| `modules/messaging/services/campaign-asset.service.ts` | Asset lifecycle service: create, review, approve, activate, retire, clone, preview |
| `modules/messaging/services/campaign-asset-ai.service.ts` | AI-assisted draft generation and revision with budget enforcement |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts` | Server actions for all lifecycle transitions and AI-assisted paths |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx` | Campaign assets list page (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx` | Asset detail / editor page (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetList.tsx` | Asset table (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetStatusBadge.tsx` | Color-coded status badge (client component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetDetail.tsx` | Full asset view: templates, metadata, approval info (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetEditor.tsx` | Create/edit form with live field validation (client component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetPreviewPanel.tsx` | In-memory deterministic preview panel (client component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetReviewPanel.tsx` | Read-only approver review view (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetPerformancePlaceholder.tsx` | Empty-state card pending Phase 3N (server component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/AiAssetDraftButton.tsx` | "Generate AI Draft" button with loading state (client component) |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/CloneAssetButton.tsx` | "Clone" button; calls server action (client component) |
| `tests/phase3j-campaign-email-asset-library.test.ts` | 46 source-reading tests |

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `modules/messaging/repositories/campaign-email-asset.repo.ts` | Add `updateAssetContent`, `listAssetsByType`, `listAssetsByStatus` |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Add `CAMPAIGN_ASSET_FAILURE_TYPE` constant object (additive — does not modify existing constants) |
| `components/layout/Sidebar.tsx` | Add `BookOpen` to lucide-react imports; insert "Campaign Assets" nav entry between "AI Usage" and "Settings" |

`modules/intelligence/system-recommendation/system-recommendation.types.ts` — **No change required.** `REC_TYPE_3I.CAMPAIGN_ASSET_REVISION_RECOMMENDED` already exists. No new recommendation types needed for Phase 3J.

---

## 6. Repository Plan

### 6.1 `modules/messaging/repositories/campaign-email-asset.repo.ts` — additions

Existing functions (no change): `createAsset`, `getAssetById`, `listAssetsForWorkspace`, `updateAssetStatus`, `updatePerformanceSummary`.

**Add:**

```typescript
export interface UpdateAssetContentInput {
  subjectTemplate:       string
  bodyTemplateHtml:      string
  bodyTemplateText:      string
  personalizationFields: string[]
  requiredFields:        string[]
  fallbackValues:        Record<string, string>
  assetName?:            string
  campaignType?:         string
  llmGenerated?:         boolean
  aiUsageEventId?:       string | null
  decisionId?:           string | null
}

export async function updateAssetContent(
  tenantId:    string,
  assetId:     string,
  content:     UpdateAssetContentInput,
  resetStatus: boolean = false
): Promise<void>

export async function listAssetsByType(
  tenantId:     string,
  workspaceId:  string,
  campaignType: string,
  status?:      string
): Promise<CampaignEmailAssetRow[]>

export async function listAssetsByStatus(
  tenantId:    string,
  workspaceId: string,
  status:      string
): Promise<CampaignEmailAssetRow[]>
```

`updateAssetContent` writes all template fields and optionally resets `status` to `'draft'` when called from the AI-assisted revision path. Uses `updated_at: new Date().toISOString()`.

`listAssetsByType` filters by `campaign_type` and optional `status`. Ordered by `created_at DESC`.

`listAssetsByStatus` is a convenience wrapper over `listAssetsForWorkspace` with required `status`. Ordered by `created_at DESC`.

### 6.2 `campaign-email-send.repo.ts` — not used

`campaign-email-send.repo.ts` is not imported by any Phase 3J module. `createCampaignSend` is not called. Preview does not write rows.

---

## 7. Service Plan

### 7.1 `modules/messaging/campaign-assets/campaign-asset.types.ts`

```typescript
export type AssetStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'retired'

export type AssetTransition =
  | 'submit_for_review'
  | 'approve'
  | 'activate'
  | 'retire'

export interface AssetTemplateContent {
  subjectTemplate:       string
  bodyTemplateHtml:      string
  bodyTemplateText:      string
  personalizationFields: string[]
  requiredFields:        string[]
  fallbackValues:        Record<string, string>
}

export interface CampaignAssetValidationResult {
  valid:                    boolean
  errors:                   string[]
  warnings:                 string[]
  unknownFields:            string[]
  missingRequiredFallbacks: string[]
}

export interface AssetPreviewResult {
  renderedSubject:         string
  renderedBodyHtml:        string
  renderedBodyText:        string
  missingRequiredFields:   string[]
  personalizationSnapshot: Record<string, string>
  unknownFields:           string[]
}
```

### 7.2 `modules/messaging/campaign-assets/campaign-asset.constants.ts`

```typescript
export const CAMPAIGN_TYPE = {
  INITIAL_CONTACT:         'initial_contact',
  STATEMENT_FOLLOW_UP:     'statement_follow_up',
  PROPOSAL_FOLLOW_UP:      'proposal_follow_up',
  SAVINGS_OPPORTUNITY:     'savings_opportunity',
  CHECK_IN:                'check_in',
  REACTIVATION:            'reactivation',
  CLOSE_PUSH:              'close_push',
  POST_ANALYSIS_FOLLOW_UP: 'post_analysis_follow_up',
} as const

export const APPROVED_MERGE_FIELDS: Record<string, { fallback: string }> = {
  first_name:          { fallback: 'there' },
  company_name:        { fallback: 'your company' },
  industry:            { fallback: 'your industry' },
  city:                { fallback: '' },
  state:               { fallback: '' },
  estimated_savings:   { fallback: '' },
  service_category:    { fallback: '' },
  sender_name:         { fallback: 'The Verian Team' },
  cta_text:            { fallback: 'Learn More' },
  cta_url:             { fallback: '' },
  pain_point_tag:      { fallback: '' },
  campaign_type_label: { fallback: '' },
}

export const ASSET_CREATION_ESTIMATED_TOKENS = 3000
```

### 7.3 `modules/messaging/services/campaign-asset-validation.service.ts`

```typescript
export function extractMergeFields(template: string): string[]
// Returns all unique {{field_name}} names found in template string.

export function validateMergeFieldSyntax(fieldName: string): boolean
// Returns true only if fieldName matches /^[a-z][a-z0-9_]*$/.

export function validateAssetTemplate(
  content: AssetTemplateContent
): CampaignAssetValidationResult
// Runs all 10 validation rules from design Section 9.
// Checks: non-empty fields, field list completeness, required subset,
// syntax validity, unknown field detection against APPROVED_MERGE_FIELDS.

export function validateActivationReadiness(asset: {
  requiredFields:  string[]
  fallbackValues:  Record<string, string>
}): { ready: boolean; missingFields: string[] }
// Returns ready=false and lists fields in requiredFields that have no
// non-empty entry in fallbackValues.

export function validateAssetTransition(
  currentStatus: AssetStatus,
  targetStatus:  AssetStatus
): { valid: boolean; reason?: string }
// Allowed: draft→under_review, under_review→approved, approved→active,
//          active→retired.
// Blocked: retired→any, draft→approved/active, under_review→active.
```

### 7.4 `modules/messaging/services/campaign-asset.service.ts`

```typescript
export async function createHumanAsset(
  tenantId:    string,
  workspaceId: string,
  input: {
    campaignType:  string
    assetName:     string
  } & AssetTemplateContent
): Promise<CampaignEmailAssetRow>
// llm_generated: false, ai_usage_event_id: null, decision_id: null.
// Validates template before inserting. Throws on validation failure.

export async function submitAssetForReview(
  tenantId: string,
  assetId:  string
): Promise<void>
// Validates transition: currentStatus must be 'draft'.
// Validates templates are non-empty.
// Calls updateAssetStatus(tenantId, assetId, 'under_review').

export async function approveAsset(
  tenantId:    string,
  assetId:     string,
  approvedBy:  string
): Promise<void>
// Validates transition: currentStatus must be 'under_review'.
// approvedBy must be non-empty.
// Calls updateAssetStatus(tenantId, assetId, 'approved', approvedBy).

export async function activateAsset(
  tenantId:    string,
  assetId:     string,
  approvedBy:  string
): Promise<void>
// Validates transition: currentStatus must be 'approved'.
// Calls validateActivationReadiness — throws with missing field list if not ready.
// approvedBy must be non-empty.
// Calls updateAssetStatus(tenantId, assetId, 'active', approvedBy).

export async function retireAsset(
  tenantId: string,
  assetId:  string
): Promise<void>
// Validates transition: currentStatus must be 'active'.
// Calls updateAssetStatus(tenantId, assetId, 'retired').
// approvedBy not required for retirement.

export async function cloneAsset(
  tenantId:    string,
  workspaceId: string,
  sourceId:    string,
  newName:     string
): Promise<CampaignEmailAssetRow>
// Reads source asset via getAssetById.
// Calls createAsset with all template fields copied.
// llm_generated: false, ai_usage_event_id: null, decision_id: null.
// Status: 'draft'. Source asset unchanged.

export function previewCampaignAsset(
  asset: {
    subjectTemplate:   string
    bodyTemplateHtml:  string
    bodyTemplateText:  string
    requiredFields:    string[]
    fallbackValues?:   Record<string, string>
  },
  fields: PersonalizationFields
): AssetPreviewResult
// Calls renderCampaignAsset. Adds unknownFields list from APPROVED_MERGE_FIELDS check.
// Pure function — no DB writes, no LLM, no Resend.
```

### 7.5 `modules/messaging/services/campaign-asset-ai.service.ts`

```typescript
export interface GenerateAiAssetDraftInput {
  tenantId:     string
  workspaceId:  string
  campaignType: string
  promptBrief:  string
  modelName?:   string
}

export interface GenerateAiAssetDraftResult {
  asset:            CampaignEmailAssetRow | null
  blocked:          boolean
  blockReason?:     string
  preflightWarning?: string
}

export async function generateAiAssetDraft(
  input: GenerateAiAssetDraftInput
): Promise<GenerateAiAssetDraftResult>
// 1. preflightCheck({ agentName: 'campaign_asset_creator',
//                     estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS, ... })
// 2. If !allowed: return { asset: null, blocked: true, blockReason: result.reason }
// 3. Call Anthropic SDK with system prompt enforcing {{field}} syntax
// 4. Parse LLM response: extract subject_template, body_template_html,
//    body_template_text, personalization_fields, required_fields
// 5. recordUsage({ agentName: 'campaign_asset_creator',
//                  featureName: 'asset_generation', campaignAssetId: (after create),
//                  modelName, promptTokens, completionTokens, ... })
// 6. createDecision({ agentName: 'campaign_asset_creator',
//                     decisionType: 'campaign_asset_created',
//                     entityType: 'campaign_asset', entityId: assetId, ... })
// 7. createAsset({ llmGenerated: true, aiUsageEventId, decisionId, status: 'draft' })
// 8. Return { asset, blocked: false, preflightWarning: result.warning }

export interface ReviseAssetWithAiInput {
  tenantId:    string
  workspaceId: string
  assetId:     string
  changeBrief: string
  modelName?:  string
}

export interface ReviseAssetWithAiResult {
  updated:       boolean
  blocked:       boolean
  blockReason?:  string
}

export async function reviseAssetWithAi(
  input: ReviseAssetWithAiInput
): Promise<ReviseAssetWithAiResult>
// Same preflight+LLM+recordUsage+createDecision sequence.
// decisionType: 'campaign_asset_revised'
// Calls updateAssetContent({ ..., resetStatus: true }) to reset to 'draft'.
// Returns { updated: true, blocked: false } on success.
```

---

## 8. Validation Plan

All validation logic lives in `campaign-asset-validation.service.ts`. Service and server action layers call validation before any DB write or status transition.

| Rule | Where enforced |
|------|---------------|
| `{{field_name}}` syntax — lowercase, underscores only | `validateMergeFieldSyntax` called inside `validateAssetTemplate` |
| `personalization_fields` completeness — must list every `{{field}}` in any template string | `validateAssetTemplate` — compares `extractMergeFields` output vs declared array |
| `required_fields` must be a subset of `personalization_fields` | `validateAssetTemplate` |
| Unknown merge fields — any `{{field}}` not in `APPROVED_MERGE_FIELDS` | `validateAssetTemplate` — produces `warnings` not `errors`; blocks activation |
| `subject_template` non-empty, min 3 chars | `validateAssetTemplate` |
| `body_template_html` non-empty | `validateAssetTemplate` |
| `body_template_text` non-empty | `validateAssetTemplate`; if empty, implementer may provide a deterministic HTML-to-text strip (no LLM) |
| Missing required fields at activation | `validateActivationReadiness` called inside `activateAsset` service function |
| Transition guard — retired cannot reactivate | `validateAssetTransition` returns `valid: false` |
| Transition guard — draft cannot skip to approved/active | `validateAssetTransition` returns `valid: false` |
| Transition guard — under_review cannot jump to active | `validateAssetTransition` returns `valid: false` |
| Preview creates no DB rows | Enforced structurally: `previewCampaignAsset` is a pure function with no async calls |
| No unsubscribe claim links | `validateAssetTemplate` checks for known patterns (e.g. "unsubscribe" in link context) — warn on save, block activation |

Client-side validation in `CampaignAssetEditor` mirrors the same rules for immediate feedback. Server-side validation is always authoritative.

---

## 9. Asset Lifecycle Implementation Plan

All lifecycle transitions are implemented as service functions and exposed only through server actions. No agent or automated process calls these directly.

### Allowed Transitions (service layer)

| From | To | Service function | Requirements |
|------|----|-----------------|-------------|
| `draft` | `under_review` | `submitAssetForReview` | Templates non-empty; `validateAssetTransition` passes |
| `under_review` | `approved` | `approveAsset` | `approvedBy` non-empty; `validateAssetTransition` passes |
| `approved` | `active` | `activateAsset` | `approvedBy` non-empty; `validateActivationReadiness` passes |
| `active` | `retired` | `retireAsset` | `validateAssetTransition` passes |

### Blocked Transitions (enforced in `validateAssetTransition`)

| From | To | Reason |
|------|----|--------|
| `retired` | any | Cannot reactivate — clone instead |
| `draft` | `approved` | Must pass review first |
| `draft` | `active` | Must pass review and approval first |
| `under_review` | `active` | Must be approved first |

### Enforcement Points

1. **Repo layer** (`updateAssetStatus`): already enforces `approvedBy` required for `approved` and `active`. Phase 3J does not modify this guard.
2. **Service layer** (`campaign-asset.service.ts`): enforces transition validity via `validateAssetTransition` before calling any repo function. Enforces `validateActivationReadiness` before activation.
3. **Server actions** (`actions.ts`): authenticate user context (`ctx.userId`), pass `approvedBy = ctx.userId` for approve and activate paths. No action accepts external `approvedBy` parameters.
4. **Agent boundary**: no agent function calls `submitAssetForReview`, `approveAsset`, `activateAsset`, or `retireAsset`. These are human-only paths.

### Status Reset on AI Revision

When `reviseAssetWithAi` succeeds, `updateAssetContent` is called with `resetStatus: true`, which sets `status = 'draft'` regardless of current status. This forces a new review cycle on every AI-assisted revision of an already-approved asset.

---

## 10. Deterministic Preview Plan

`previewCampaignAsset` in `campaign-asset.service.ts` is a **synchronous pure function** (no async, no DB calls, no network calls).

**Call flow:**

```
CampaignAssetPreviewPanel (client component)
  ↓ (user selects data source or types fields)
  calls renderCampaignAsset(asset, fields)  ← imported from campaign-personalization.service.ts
  receives RenderResult
  also calls extractMergeFields on templates and checks against APPROVED_MERGE_FIELDS
  displays: renderedSubject, renderedBodyHtml, renderedBodyText
            missingRequiredFields (warning banner if non-empty)
            personalizationSnapshot (resolved fields table)
            unknownFields (warning for any {{field}} not in APPROVED_MERGE_FIELDS)
```

**Hard constraints on `CampaignAssetPreviewPanel`:**

| Constraint | Implementation |
|------------|---------------|
| No LLM call | No import of `@anthropic-ai/sdk` |
| No `sendApprovedDraft` call | No import from send-bridge module |
| No `resend.emails.send` | No Resend client import |
| No `createCampaignSend` call | No import from `campaign-email-send.repo.ts` |
| No `campaign_email_sends` row created | Enforced structurally — preview is pure function return value |
| No `email_sends` row created | No Resend call → no `email_sends` write path reachable from preview |
| No async DB reads during render | Sample lead data fetched server-side and passed as props; preview render is client-side pure |

**Sample data sources:**

| Source | Implementation |
|--------|---------------|
| Manual test data | Client-side state — operator fills per-field form; no DB fetch |
| Sample lead | Server component parent fetches lead record and passes `PersonalizationFields` as prop |
| Fallback-only | All fields left empty — `renderCampaignAsset` resolves from `fallback_values` |

---

## 11. AI-Assisted Authoring/Revision Plan

### `generateAiAssetDraft` — Step-by-step

```
1. preflightCheck({
     tenantId, workspaceId,
     agentName: 'campaign_asset_creator',
     estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS,  // 3000
     modelName,
   })

2. if (!result.allowed):
     return { asset: null, blocked: true, blockReason: result.reason }

3. Call Anthropic SDK (claude-sonnet-4-6 or caller-supplied model).
   System prompt instructs:
   - Output JSON only with keys: subject_template, body_template_html,
     body_template_text, personalization_fields[], required_fields[]
   - Use {{field_name}} syntax from APPROVED_MERGE_FIELDS only
   - Campaign type context provided in user prompt

4. Parse response. Extract the five fields.

5. recordUsage({
     tenantId, workspaceId,
     agentName: 'campaign_asset_creator',
     featureName: 'asset_generation',
     modelName, promptTokens, completionTokens,
     totalTokens, estimatedCostUsd,
     success: true,
     campaignAssetId: assetId,   // updated after createAsset
   })

6. createDecision({
     tenantId, workspaceId,
     agentName: 'campaign_asset_creator',
     decisionType: 'campaign_asset_created',
     entityType: 'campaign_asset',
     entityId: assetId,
     decisionStatus: 'completed',
     aiUsageEventId: usageEvent.id,
     inputSnapshot: { campaign_type: input.campaignType, prompt_brief: input.promptBrief },
     outputSummary: { asset_name: generatedName, subject_preview: subjectTemplate.slice(0, 80) },
   })

7. createAsset({
     tenantId, workspaceId,
     campaignType: input.campaignType,
     assetName: generatedName,
     ...parsed template fields,
     llmGenerated: true,
     aiUsageEventId: usageEvent.id,
     decisionId: decision.id,
   })

8. return { asset, blocked: false, preflightWarning: result.warning }
```

**Note on ordering:** `recordUsage` and `createDecision` require the asset ID. The correct order is: `createAsset` first (status `'draft'`), then `recordUsage` with `campaignAssetId`, then `createDecision` with `aiUsageEventId`. Update `updateAssetContent` to back-fill `ai_usage_event_id` and `decision_id` after both are created.

Alternatively: create the asset with null FK fields, then update them after `recordUsage` and `createDecision` complete. Implement this as a single function — do not split across async boundaries that could leave orphaned rows.

### `reviseAssetWithAi` — Differences from create path

- Reads existing asset via `getAssetById` first.
- `decisionType: 'campaign_asset_revised'`
- `featureName: 'asset_revision'` in `recordUsage`
- After successful LLM parse: calls `updateAssetContent` with `resetStatus: true` to reset status to `'draft'`.
- Returns `{ updated: true, blocked: false }` on success.

### Budget Block Behavior

When `preflightCheck` returns `allowed: false`:
- Do not call LLM.
- Do not create asset or update existing asset.
- Return `{ blocked: true, blockReason: 'budget_exhausted' }` to the server action.
- Server action returns error to the client with message: "AI generation unavailable — budget exhausted. Check System Intelligence for details."
- No automatic retry. User must wait for budget period to reset or request a policy override in System Intelligence.

### Human Review Required After AI Generation

After `generateAiAssetDraft` or `reviseAssetWithAi` succeeds:
- The UI navigates to or refreshes the `CampaignAssetEditor` pre-populated with the LLM output.
- Asset status is `'draft'` — it cannot be activated without human review and approval.
- No path exists to call `activateAsset` directly from the AI generation flow.

---

## 12. UI Implementation Plan

### 12.1 Route Pages

**`page.tsx` — Campaign Assets List (server component)**

```
- No 'use client'
- Imports: createSupabaseServerClient, buildRequestContext, listAssetsForWorkspace
- Renders: CampaignAssetList, link to create new asset
- Type signature: async function CampaignAssetsPage({ params }: { params: Promise<{ workspaceSlug: string }> })
```

**`[assetId]/page.tsx` — Asset Detail/Editor (server component)**

```
- No 'use client'
- Imports: createSupabaseServerClient, buildRequestContext, getAssetById
- Renders: CampaignAssetDetail (or CampaignAssetEditor if status === 'draft' and edit param present)
- Includes: CampaignAssetReviewPanel (for under_review), CampaignAssetPerformancePlaceholder
```

### 12.2 Components

| Component | Directive | Key behavior |
|-----------|-----------|-------------|
| `CampaignAssetList` | none (server) | Renders full asset table; calls `listAssetsForWorkspace`; renders `CampaignAssetStatusBadge` per row; renders contextual action buttons |
| `CampaignAssetStatusBadge` | `'use client'` | Maps `status → color/label`: draft (gray), under_review (yellow), approved (blue), active (green), retired (muted) |
| `CampaignAssetDetail` | none (server) | Full asset view: all template fields, approval metadata, `CampaignAssetPreviewPanel`, `CampaignAssetPerformancePlaceholder` |
| `CampaignAssetEditor` | `'use client'` | Form: assetName, campaignType dropdown, subject, body HTML, body text, personalization_fields, required_fields, fallback_values; live field validation using imported validation functions |
| `CampaignAssetPreviewPanel` | `'use client'` | Accepts `asset` and `initialFields` props from server; renders `renderCampaignAsset` result; shows missingRequiredFields banner; shows personalizationSnapshot table; shows unknownFields warning; no async, no DB, no LLM, no Resend |
| `CampaignAssetReviewPanel` | none (server) | Read-only approver view: rendered template preview (fallback-only mode), missing fields summary, approve/activate/retire action buttons |
| `CampaignAssetPerformancePlaceholder` | none (server) | Card with: "Performance data will appear after campaign sends (Phase 3N)" — no queries |
| `AiAssetDraftButton` | `'use client'` | Text area for prompt brief; "Generate AI Draft" button; calls `generateAiDraftAction`; shows loading state; shows budget-blocked error message; on success navigates to new asset editor |
| `CloneAssetButton` | `'use client'` | "Clone" button; optional name input; calls `cloneAssetAction`; on success navigates to new draft |

### 12.3 List Columns

| Column | Data source |
|--------|-------------|
| Asset Name | `asset_name` — clickable → `[assetId]` page |
| Campaign Type | `campaign_type` — badge from `CAMPAIGN_TYPE`; "Custom" if not in taxonomy |
| Status | `CampaignAssetStatusBadge` |
| Personalization Fields | `personalization_fields.length` |
| Required Fields | `required_fields.length` |
| LLM Generated | Boolean — "AI" badge or "—" |
| Approved By | `approved_by` user ID or `—` |
| Approved At | Relative time from `approved_at` |
| Last Updated | Relative time from `updated_at` |
| Actions | Contextual by status (see Section 13) |

### 12.4 Empty States

- List page, no assets: "No campaign email assets yet. Create your first asset to get started."
- Preview panel, no fields: "Enter test values or select a lead above to preview personalization."
- Performance placeholder: "Performance data will appear after campaign sends (Phase 3N)."

### 12.5 Sidebar Update

In `components/layout/Sidebar.tsx`:

1. Add `BookOpen` to the lucide-react import line.
2. Insert into `navItems` array between the "AI Usage" entry and the "Settings" entry:

```typescript
{ label: 'Campaign Assets', href: `${base}/settings/campaign-assets`, icon: <BookOpen className="h-4 w-4" /> },
```

---

## 13. Human Approval Gates

All lifecycle server actions authenticate via `buildRequestContext`. No action accepts `approvedBy` as a client parameter — the server always derives it from `ctx.userId`.

| Gate | Server action | Who | Requirement |
|------|--------------|-----|-------------|
| Submit for review | `submitForReviewAction` | Any workspace member | Asset in `draft`; templates non-empty; field validation passes |
| Approve | `approveAssetAction` | Platform admin or workspace manager | Asset in `under_review`; `ctx.userId` recorded as `approved_by` |
| Activate | `activateAssetAction` | Platform admin or workspace manager | Asset in `approved`; activation readiness check passes; `ctx.userId` recorded |
| Retire | `retireAssetAction` | Platform admin or workspace manager | Asset in `active`; confirmation required |
| Create human asset | `createHumanAssetAction` | Any workspace member | Validation passes; status starts as `draft` |
| Update asset content | `updateAssetContentAction` | Any workspace member (on `draft` assets) | Validation passes; status unchanged |
| Accept AI-generated draft | `generateAiDraftAction` result → editor pre-populated | Any member | Human must save and later submit for review; no activation from AI flow |
| Accept AI-assisted revision | `reviseWithAiAction` result → editor pre-populated | Any member | Same as above; status reset to `draft` |
| Clone | `cloneAssetAction` | Any workspace member | Creates new `draft`; source unchanged |
| Budget override | Not in asset UI | Platform admin | Via System Intelligence; no UI in campaign assets module |

---

## 14. System Intelligence Plan

Add new constant object `CAMPAIGN_ASSET_FAILURE_TYPE` to `modules/intelligence/structured-errors/structured-error.types.ts`. This is additive — no existing constants modified.

```typescript
// Phase 3J: Campaign asset lifecycle failure types
export const CAMPAIGN_ASSET_FAILURE_TYPE = {
  CAMPAIGN_ASSET_MISSING_REQUIRED_FIELDS:     'CAMPAIGN_ASSET_MISSING_REQUIRED_FIELDS',
  CAMPAIGN_ASSET_UNDER_REVIEW_TOO_LONG:       'CAMPAIGN_ASSET_UNDER_REVIEW_TOO_LONG',
  CAMPAIGN_ASSET_ACTIVATION_BLOCKED:          'CAMPAIGN_ASSET_ACTIVATION_BLOCKED',
  CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED: 'CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED',
  CAMPAIGN_ASSET_REPEATED_REJECTION:          'CAMPAIGN_ASSET_REPEATED_REJECTION',
} as const
export type CampaignAssetFailureType = typeof CAMPAIGN_ASSET_FAILURE_TYPE[keyof typeof CAMPAIGN_ASSET_FAILURE_TYPE]
```

**Note on existing constants:** `AI_BUDGET_FAILURE_TYPE` in `structured-error.types.ts` already contains `CAMPAIGN_ASSET_MISSING_FIELDS` and `CAMPAIGN_ASSET_UNDERPERFORMING` (Phase 3I). The new `CAMPAIGN_ASSET_FAILURE_TYPE` object is separate and more specific to lifecycle actions. No name conflicts exist.

**Where constants are emitted:**

| Constant | Emitting code |
|----------|--------------|
| `CAMPAIGN_ASSET_MISSING_REQUIRED_FIELDS` | `activateAsset` service when `validateActivationReadiness` fails |
| `CAMPAIGN_ASSET_ACTIVATION_BLOCKED` | `activateAsset` service on any activation guard failure |
| `CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED` | `generateAiAssetDraft` / `reviseAssetWithAi` when `preflightCheck` blocks |
| `CAMPAIGN_ASSET_UNDER_REVIEW_TOO_LONG` | Future: recommendation generator (not in Phase 3J) |
| `CAMPAIGN_ASSET_REPEATED_REJECTION` | Future: approval tracking (not in Phase 3J) |

Errors appear in the existing System Intelligence page under Critical & Open Errors. Resolve/Investigate/Ignore actions apply without new UI.

---

## 15. Test Plan

**File:** `tests/phase3j-campaign-email-asset-library.test.ts`

Pattern: `fs.readFileSync` + `toContain` / `not.toContain` assertions. No Supabase mocking, no LLM calls, no test doubles. Imports: `describe`, `it`, `expect` from vitest; `fs`, `path` from Node.

### Describe Block Assignments

**Block 0 — Route existence (TC-3J-001, TC-3J-002)**
```
describe('Phase 3J — Campaign assets route')
  TC-3J-001: campaign-assets page.tsx file exists
  TC-3J-002: campaign-assets page is a server component (no 'use client')
```

**Block 1 — Sidebar nav (TC-3J-003, TC-3J-004)**
```
describe('Phase 3J — Sidebar navigation')
  TC-3J-003: Sidebar.tsx contains 'Campaign Assets' label
  TC-3J-004: Sidebar.tsx imports BookOpen from lucide-react
```

**Block 2 — Repository additions (TC-3J-005, TC-3J-006)**
```
describe('Phase 3J — Repository additions')
  TC-3J-005: campaign-email-asset.repo.ts exports updateAssetContent
  TC-3J-006: campaign-email-asset.repo.ts exports listAssetsByType
```

**Block 3 — Service exports (TC-3J-007 through TC-3J-011)**
```
describe('Phase 3J — campaign-asset.service.ts exports')
  TC-3J-007: exports submitAssetForReview
  TC-3J-008: exports approveAsset
  TC-3J-009: exports activateAsset
  TC-3J-010: exports retireAsset
  TC-3J-011: exports cloneAsset
```

**Block 4 — Service safety guardrails (TC-3J-012, TC-3J-013)**
```
describe('Phase 3J — campaign-asset.service.ts safety guardrails')
  TC-3J-012: does not contain 'sendApprovedDraft'
  TC-3J-013: does not import '@anthropic-ai/sdk'
```

**Block 5 — Server action exports (TC-3J-014 through TC-3J-018)**
```
describe('Phase 3J — campaign-asset actions.ts exports')
  TC-3J-014: exports submitForReviewAction
  TC-3J-015: exports approveAssetAction
  TC-3J-016: exports activateAssetAction
  TC-3J-017: exports retireAssetAction
  TC-3J-018: exports cloneAssetAction
```

**Block 6 — AI-assisted authoring hooks (TC-3J-019 through TC-3J-022)**
```
describe('Phase 3J — AI-assisted asset creation hooks')
  TC-3J-019: campaign-asset-ai.service.ts contains 'preflightCheck'
  TC-3J-020: campaign-asset-ai.service.ts contains 'recordUsage'
  TC-3J-021: campaign-asset-ai.service.ts contains 'createDecision'
  TC-3J-022: campaign-asset-ai.service.ts does not create asset when blocked
             (contains text 'blocked' and 'allowed' near each other)
```

**Block 7 — Preview panel guardrails (TC-3J-023 through TC-3J-025, TC-3J-046)**
```
describe('Phase 3J — CampaignAssetPreviewPanel guardrails')
  TC-3J-023: does not import '@anthropic-ai/sdk'
  TC-3J-024: does not contain 'sendApprovedDraft'
  TC-3J-025: does not contain 'resend.emails.send'
  TC-3J-046: does not contain 'createCampaignSend'
```

**Block 8 — Lifecycle transition guards (TC-3J-026 through TC-3J-030)**
```
describe('Phase 3J — Lifecycle transition guards')
  TC-3J-026: campaign-asset-validation.service.ts contains 'missingRequiredFallbacks' or 'missingFields'
  TC-3J-027: campaign-asset.service.ts approveAsset requires approvedBy
             (source contains 'approvedBy' near 'approveAsset')
  TC-3J-028: campaign-asset.service.ts activateAsset requires approvedBy
             (source contains 'approvedBy' near 'activateAsset')
  TC-3J-029: campaign-asset-validation.service.ts blocks retired→any
             (contains 'retired' near 'valid: false' or similar)
  TC-3J-030: campaign-asset-validation.service.ts blocks draft→active
             (contains 'draft' with transition block logic)
```

**Block 9 — Clone behavior (TC-3J-031, TC-3J-032)**
```
describe('Phase 3J — Clone asset behavior')
  TC-3J-031: cloneAsset creates asset with status 'draft'
             (campaign-asset.service.ts contains "status.*draft" near cloneAsset or createAsset call)
  TC-3J-032: cloneAsset sets llmGenerated: false
             (source contains 'llmGenerated.*false' or 'llm_generated.*false' near cloneAsset)
```

**Block 10 — AI-assisted revision (TC-3J-033 through TC-3J-035)**
```
describe('Phase 3J — AI-assisted revision')
  TC-3J-033: campaign-asset-ai.service.ts records ai_usage_events on revision
             (contains 'recordUsage' near 'revise' or 'asset_revision')
  TC-3J-034: campaign-asset-ai.service.ts records agent_decisions on revision
             (contains 'createDecision' near 'revise' or 'campaign_asset_revised')
  TC-3J-035: campaign-asset-ai.service.ts resets status to draft on revision
             (contains 'resetStatus' or "status.*draft" near reviseAssetWithAi)
```

**Block 11 — Constants (TC-3J-036, TC-3J-037)**
```
describe('Phase 3J — Constants')
  TC-3J-036: campaign-asset.constants.ts exports CAMPAIGN_TYPE
  TC-3J-037: campaign-asset.constants.ts exports APPROVED_MERGE_FIELDS containing 'first_name'
```

**Block 12 — System Intelligence constants (TC-3J-038, TC-3J-039)**
```
describe('Phase 3J — System Intelligence constants')
  TC-3J-038: structured-error.types.ts contains 'CAMPAIGN_ASSET_FAILURE_TYPE'
  TC-3J-039: structured-error.types.ts contains 'CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED'
```

**Block 13 — Boundary guardrails (TC-3J-040 through TC-3J-045)**
```
describe('Phase 3J — Boundary and safety guardrails')
  TC-3J-040: no file in campaign-assets module contains 'dispatchCampaign'
  TC-3J-041: no file in campaign-assets module contains 'autoSend' or 'auto_send'
  TC-3J-042: campaign-asset-ai.service.ts does not call 'resend.emails.send'
  TC-3J-043: campaign-asset.service.ts references 'EMAIL_SENDING_ENABLED' (future guard stub)
             OR: campaign-asset-ai.service.ts contains guardrail comment about send gating
  TC-3J-044: migration file 20240035 does not exist
             (fs.existsSync check, not readFileSync)
  TC-3J-045: campaign-personalization.service.ts content unchanged
             (renderCampaignAsset still present; no Phase 3J modifications)
```

---

## 16. Safety Guardrails

The following guardrails are hardcoded constraints on the implementation. Every test run must verify the guardrails in Block 13.

| Guardrail | Enforcement |
|-----------|-------------|
| `EMAIL_SENDING_ENABLED` remains disabled | No Phase 3J code changes `EMAIL_SENDING_ENABLED`; system control value unchanged |
| No live sending | `EMAIL_SENDING_ENABLED` is false; no Resend call exists in Phase 3J modules |
| No auto-send | All lifecycle transitions are human server actions; no cron, no agent-triggered send |
| No campaign execution | No `dispatchCampaign`, no send-to-lead logic |
| No campaign assignment | No lead enrollment, no campaign → lead mapping |
| No Resend API expansion | `resend.emails.send` not called from any Phase 3J file |
| Preview does not persist send rows | `previewCampaignAsset` is a pure function; `CampaignAssetPreviewPanel` does not import `campaign-email-send.repo.ts` |
| No production deployment | No Supabase migration applied to staging or production; no `vercel --prod` deployment |
| No migration `20240035` | No migration file created |
| No Phase 3K implementation | No unified draft path code in this phase |
| `renderCampaignAsset` not modified | `campaign-personalization.service.ts` is read-only in Phase 3J |
| Human approval required before activation | `activateAsset` requires `approvedBy` from `ctx.userId`; no path bypasses this |

---

## 17. Acceptance Criteria

Phase 3J implementation is complete when all of the following are true:

| Criterion | Check |
|-----------|-------|
| All 46 tests pass | `npx vitest run` → 1176/1176 (1130 baseline + 46 new) |
| Build passes | `npx next build` → no errors, no type errors |
| No migration created | `supabase/migrations/20240035_*` does not exist |
| No production touched | No Supabase migration applied; no Vercel deployment |
| No live sending | `EMAIL_SENDING_ENABLED` remains disabled |
| No auto-send | No cron or agent triggers any send path |
| No campaign execution | Confirmed by TC-3J-040 |
| No Phase 3K | No unified draft path code |
| Working tree clean | Only Phase 3J source files changed; committed on user approval |
| Design match | All 22 sections of the approved design are implemented |

---

## 18. Implementation Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Accidentally crossing into campaign execution | TC-3J-040 checks for `dispatchCampaign`; TC-3J-041 checks for auto-send strings; module boundary: campaign execution is Phase 3N and has no hooks here |
| Preview persistence ambiguity | `previewCampaignAsset` is a synchronous pure function — no async path, so no DB write is structurally possible; TC-3J-046 verifies `CampaignAssetPreviewPanel` does not import `createCampaignSend` |
| AI-assisted authoring bypasses budget preflight | `generateAiAssetDraft` and `reviseAssetWithAi` call `preflightCheck` as their first async step; TC-3J-019 verifies string presence; no LLM call before `preflightCheck` in code |
| Incorrect lifecycle transition implemented (e.g., retired → active allowed) | `validateAssetTransition` is a dedicated pure function; TC-3J-029 and TC-3J-030 verify blocked transitions are present in the source |
| Merge field validation gaps | `extractMergeFields` covers all three template strings; `validateAssetTemplate` checks all three; `personalization_fields` must match exactly — mismatch blocks save |
| UI action buttons appearing for wrong statuses | Action buttons rendered conditionally by `status` in `CampaignAssetList` and `CampaignAssetDetail`; status is server-authoritative |
| Versioning expectations causing scope creep | Design Section 18 documents no migration and no versioning table in Phase 3J; clone workflow satisfies v1 need; reviewers reminded of this boundary |
| `approved_by` derived from client input | Server actions derive `approvedBy` from `ctx.userId` only; client cannot pass this field |

---

## 19. Final Recommendation

### Is Phase 3J Ready for Implementation?

**Yes — after this implementation plan is approved.**

The Phase 3I foundation is complete, locked, and production-deployed. All required DB tables, repo primitives, the personalization engine, and the budget enforcement infrastructure are verified and in place. The design is approved. No migration is required. The scope is precisely bounded.

The implementation sequence in Section 3 is safe: constants and types first, then repo additions, then service layer, then server actions, then UI, then tests. No step requires a migration. No step touches `EMAIL_SENDING_ENABLED`. No step introduces campaign execution or auto-send.

### Exact Next Prompt for Phase 3J Implementation

After this plan is approved, the following prompt starts implementation:

> Implement Phase 3J only.
>
> Input: `docs/roadmap/phase-3j-implementation-plan.md`
>
> Follow the ordered implementation sequence in Section 3 exactly.
> Create all files listed in Section 4.
> Modify only the files listed in Section 5.
> Use the exact function signatures in Sections 6–7.
> Do not create migration `20240035`.
> Do not implement campaign execution.
> Do not implement auto-send.
> Do not start Phase 3K.
> `EMAIL_SENDING_ENABLED` must remain disabled.
> After implementation: run `npx vitest run` and `npx next build`. Report results before committing.
