# Phase 3K — Unified Draft / Send Path
## Implementation Plan v1.0

**Status:** Implementation Plan — Awaiting Approval
**Date:** 2026-05-29
**Design document:** `docs/roadmap/phase-3k-unified-draft-send-path-design.md`
**Prerequisites:** Phase 3J complete and locked (`phase-3j-campaign-email-asset-library-v1 → 30068a6`)
**Next migration:** `20240035`
**Test baseline:** 1176/1176
**`EMAIL_SENDING_ENABLED`:** Disabled — remains disabled throughout Phase 3K

---

## 1. Scope Confirmation

Phase 3K implements the following and nothing more:

| Deliverable | Description |
|-------------|-------------|
| Migration `20240035` | Adds `source_type` and `source_asset_id` to `email_drafts` |
| `DRAFT_SOURCE_TYPE` constant | Typed source provenance taxonomy |
| `email-draft.repo.ts` update | `CreateEmailDraftInput` + `createEmailDraft` write provenance; new `getDraftsBySourceAsset` |
| `campaign-asset-draft.service.ts` | New service: asset → render → draft, no LLM |
| `draft-send-readiness.service.ts` | New pure advisory check function |
| Existing path source types | `email-draft.service.ts`, `send-bridge.service.ts`, `manual-campaign-draft.service.ts` each write typed `source_type` |
| Campaign type harmonization | `manual-campaign-draft.service.ts` keys updated to Phase 3J `CAMPAIGN_TYPE` values |
| `DRAFT_SOURCE_FAILURE_TYPE` constants | Additive constants in `structured-error.types.ts` |
| `ActivityEventType` addition | `CAMPAIGN_ASSET_DRAFT_CREATED` in `types.agent.ts` |
| Server action | `createDraftFromAssetAction` added to campaign-assets `actions.ts` |
| UI: Lead detail card | `CreateDraftFromAssetCard` component |
| UI: Source badge | `DraftSourceBadge` component; applied in lead detail and draft history |
| UI: Asset detail draft count | Read-only draft list on campaign asset detail page |
| UI: Send readiness indicator | Advisory readiness display in draft review UI |
| Test file | `tests/phase3k-unified-draft-send-path.test.ts` (TC-3K-001 through TC-3K-058) |
| AI context docs | `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` |

**Explicitly not implemented:**

- Live sending, auto-send, campaign execution, campaign assignment, follow-up scheduling
- Resend API expansion
- Phase 3L, Phase 3N
- Any change to `EMAIL_SENDING_ENABLED`
- Any new call to `resend.emails.send`
- Any new call to `sendApprovedDraft()` from an automated path

---

## 2. Migration Plan

### 2.1 File

`supabase/migrations/20240035_phase3k_draft_source_provenance.sql`

### 2.2 Exact SQL

```sql
-- Phase 3K: Add typed source provenance columns to email_drafts
-- Additive only — no existing columns modified, no tables dropped.
-- Existing rows get source_type = NULL and source_asset_id = NULL.
-- No backfill required. No existing query is broken.

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS source_type      text NULL,
  ADD COLUMN IF NOT EXISTS source_asset_id  uuid NULL
    REFERENCES campaign_email_assets(id) ON DELETE SET NULL;

-- Partial index: efficient WHERE source_type = 'campaign_asset_render' scans
CREATE INDEX IF NOT EXISTS idx_email_drafts_source_type
  ON email_drafts (tenant_id, source_type)
  WHERE source_type IS NOT NULL;

-- Partial index: efficient FK join for per-asset draft attribution
CREATE INDEX IF NOT EXISTS idx_email_drafts_source_asset_id
  ON email_drafts (source_asset_id)
  WHERE source_asset_id IS NOT NULL;
```

### 2.3 Safety

| Property | Value |
|----------|-------|
| Additive only | ✅ Two `ADD COLUMN IF NOT EXISTS` statements |
| Existing rows | `NULL` for both new columns — all existing constraints remain valid |
| Existing queries | Unaffected — new columns not referenced by old code until Phase 3K code is deployed |
| Destructive SQL | None — no `DROP`, no `DELETE`, no `TRUNCATE`, no `ALTER COLUMN TYPE` |
| Backfill | None required in Phase 3K v1 |
| FK semantics | `ON DELETE SET NULL` — if a campaign asset is deleted, linked drafts retain their content; only the FK is nulled |

### 2.4 Application Order

1. Apply to local dev: `npx supabase db push` (or `supabase migration up` local)
2. Apply to staging: via Supabase dashboard or `supabase db push --linked`
3. Apply to production: explicit manual apply **only after** Phase 3K implementation is complete, QA passes, and production deployment is explicitly authorized

Do not apply to production during implementation.

---

## 3. Types / Database Plan

### 3.1 File to modify

`types/database.ts`

### 3.2 Changes

In the `email_drafts` table type definition, add to `Row`, `Insert`, and `Update`:

```typescript
// Row (all columns as they appear in the DB)
source_type:      string | null
source_asset_id:  string | null

// Insert (nullable fields default to undefined / null)
source_type?:     string | null
source_asset_id?: string | null

// Update (all fields optional)
source_type?:     string | null
source_asset_id?: string | null
```

These are the only changes to `types/database.ts`. No other tables change.

---

## 4. Constants and Types Plan

### 4.1 New directory

`modules/messaging/drafts/`

### 4.2 File: `modules/messaging/drafts/draft-source.constants.ts`

```typescript
export const DRAFT_SOURCE_TYPE = {
  MANUAL:                    'manual',
  RULE_TEMPLATE:             'rule_template',
  MANUAL_CAMPAIGN_TEMPLATE:  'manual_campaign_template',
  AI_STRATEGY_COPYWRITING:   'ai_strategy_copywriting',
  CAMPAIGN_ASSET_RENDER:     'campaign_asset_render',
  AI_CAMPAIGN_ASSET_REVISION:'ai_campaign_asset_revision',
  FUTURE_CAMPAIGN_STEP:      'future_campaign_step',
  FUTURE_FOLLOW_UP:          'future_follow_up',
} as const

export type DraftSourceType = typeof DRAFT_SOURCE_TYPE[keyof typeof DRAFT_SOURCE_TYPE]

export const DRAFT_SOURCE_BADGE: Record<string, { label: string; colorClass: string }> = {
  [DRAFT_SOURCE_TYPE.MANUAL]:                   { label: 'Manual',           colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.RULE_TEMPLATE]:            { label: 'Rule Template',    colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE]: { label: 'Manual Campaign',  colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING]:  { label: 'AI Pipeline',      colorClass: 'bg-blue-100 text-blue-700' },
  [DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER]:    { label: 'Campaign Asset',   colorClass: 'bg-green-100 text-green-700' },
  [DRAFT_SOURCE_TYPE.AI_CAMPAIGN_ASSET_REVISION]:{ label: 'AI Asset Revision',colorClass: 'bg-blue-100 text-blue-700' },
} as const

export const DRAFT_READINESS_REASON = {
  MISSING_RECIPIENT:              'missing_recipient',
  MISSING_SUBJECT:               'missing_subject',
  MISSING_BODY:                  'missing_body',
  DRAFT_NOT_APPROVED:            'draft_not_approved',
  MISSING_APPROVAL_REQUEST:      'missing_approval_request',
  SOURCE_ASSET_NOT_ACTIVE:       'source_asset_not_active',
  SOURCE_ASSET_RETIRED:          'source_asset_retired',
  MISSING_PERSONALIZATION_FIELDS:'missing_personalization_fields',
  EMAIL_SENDING_DISABLED:        'email_sending_disabled',
} as const
```

### 4.3 File: `modules/messaging/drafts/draft-source.types.ts`

```typescript
import type { DRAFT_SOURCE_TYPE, DRAFT_READINESS_REASON } from './draft-source.constants'

export type DraftSourceType = typeof DRAFT_SOURCE_TYPE[keyof typeof DRAFT_SOURCE_TYPE]
export type DraftReadinessReason = typeof DRAFT_READINESS_REASON[keyof typeof DRAFT_READINESS_REASON]

export interface DraftSendReadinessResult {
  ready:          boolean
  blockedReasons: string[]
  warnings:       string[]
}

export interface DraftReadinessContext {
  approvalRequestStatus:         string | null
  sourceAssetStatus?:            string | null
  emailSendingEnabled:           boolean
  missingPersonalizationFields:  string[]
}
```

---

## 5. Repository Plan

### 5.1 File to modify

`modules/messaging/repositories/email-draft.repo.ts`

### 5.2 Changes to `CreateEmailDraftInput`

Add two optional fields:

```typescript
interface CreateEmailDraftInput {
  // ... existing fields unchanged ...
  sourceType?:     string | null   // NEW
  sourceAssetId?:  string | null   // NEW
}
```

### 5.3 Changes to `createEmailDraft`

In the `.insert({...})` call, add after `generated_by_ai`:

```typescript
source_type:      input.sourceType      ?? null,
source_asset_id:  input.sourceAssetId   ?? null,
```

### 5.4 New function: `getDraftsBySourceAsset`

```typescript
export async function getDraftsBySourceAsset(
  tenantId: string,
  assetId:  string,
  limit:    number = 10
): Promise<Pick<EmailDraftRow, 'id' | 'status' | 'lead_id' | 'created_at' | 'source_type'>[]>
```

Implementation: query `email_drafts` where `tenant_id = tenantId` AND `source_asset_id = assetId` AND `deleted_at IS NULL`, ordered by `created_at DESC`, limited to `limit`. Select `id, status, lead_id, created_at, source_type`.

### 5.5 No changes to

- `updateDraftStatus` — unchanged
- `supersedePendingDraftsForLead` — unchanged
- `getPendingDraftForLead` — unchanged (reused as-is for duplicate guard)
- `linkApprovalToEmailDraft` — unchanged
- `getDefaultSenderIdentity` — unchanged
- `getLeadEmailDrafts` — unchanged (now returns rows with `source_type` and `source_asset_id` automatically via `select('*')`)

---

## 6. Campaign Asset Draft Service Plan

### 6.1 File to create

`modules/messaging/services/campaign-asset-draft.service.ts`

### 6.2 Imports

```typescript
import * as assetRepo            from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as emailDraftRepo       from '@/modules/messaging/repositories/email-draft.repo'
import * as approvalRepo         from '@/modules/workflow/repositories/approval.repo'
import * as contactRepo          from '@/modules/crm/repositories/contact.repo'
import * as companyRepo          from '@/modules/crm/repositories/company.repo'
import * as leadRepo             from '@/modules/crm/repositories/lead.repo'
import * as agentDecisionRepo    from '@/modules/intelligence/repositories/agent-decision.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { renderCampaignAsset }   from '@/modules/messaging/services/campaign-personalization.service'
import { DRAFT_SOURCE_TYPE }     from '@/modules/messaging/drafts/draft-source.constants'
import { ActivityEventType }     from '@/modules/intelligence/types.agent'
```

### 6.3 Input / Output types

```typescript
export interface CreateDraftFromAssetInput {
  tenantId:    string
  workspaceId: string
  assetId:     string
  leadId:      string
  requestedBy: string
}

export type CreateDraftFromAssetResult =
  | { ok: true;  draftId: string; approvalRequestId: string; missingFields: string[] }
  | { ok: false; reason: string }
```

### 6.4 Export

```typescript
export async function createDraftFromAsset(
  input: CreateDraftFromAssetInput
): Promise<CreateDraftFromAssetResult>
```

### 6.5 Implementation steps (in order)

1. **Load asset** — `assetRepo.getAssetById(input.tenantId, input.assetId)`
   - If not found: return `{ ok: false, reason: 'asset_not_found' }`

2. **Validate asset status** — `asset.status` must be `'approved'` or `'active'`
   - If `'draft'`, `'under_review'`, or `'retired'`: return `{ ok: false, reason: 'asset_not_eligible' }`

3. **Load lead** — `leadRepo.getLead(input.leadId, input.tenantId)`
   - If not found: return `{ ok: false, reason: 'lead_not_found' }`

4. **Load contact** — if `lead.contact_id` is present: `contactRepo.getContact(lead.contact_id, input.tenantId)`
   - If no contact: return `{ ok: false, reason: 'no_contact_linked' }`
   - If no `contact.email`: return `{ ok: false, reason: 'no_contact_email' }`

5. **Load company** — if `lead.company_id`: `companyRepo.getCompany(lead.company_id, input.tenantId)`
   - Non-fatal — proceed with `null` if not found

6. **Load sender identity** — `emailDraftRepo.getDefaultSenderIdentity(input.tenantId)`
   - Non-fatal — proceed with `null` if not found

7. **Duplicate guard** — `emailDraftRepo.getPendingDraftForLead(input.tenantId, input.leadId)`
   - If a pending draft exists: return `{ ok: false, reason: 'pending_draft_exists' }`

8. **Build personalization fields**:
   ```typescript
   const fields: PersonalizationFields = {
     first_name:       contact.first_name ?? null,
     company_name:     company?.name ?? lead.name ?? null,
     industry:         company?.industry ?? null,
     city:             contact.city   ?? company?.city   ?? null,
     state:            contact.state  ?? company?.state  ?? null,
     estimated_savings: null,
     service_category:  null,
     sender_name:       senderIdentity?.name ?? null,
   }
   ```

9. **Run `renderCampaignAsset`** (pure, no LLM, no DB write, no Resend):
   ```typescript
   const renderResult = renderCampaignAsset(
     {
       subjectTemplate:  asset.subject_template,
       bodyTemplateHtml: asset.body_template_html,
       bodyTemplateText: asset.body_template_text,
       requiredFields:   (asset.required_fields as string[]) ?? [],
       fallbackValues:   (asset.fallback_values  as Record<string, string>) ?? {},
     },
     fields
   )
   ```

10. **Create email_draft** — `emailDraftRepo.createEmailDraft({...})` with:
    - `subject`: `renderResult.renderedSubject`
    - `bodyHtml`: `renderResult.renderedBodyHtml`
    - `bodyText`: `renderResult.renderedBodyText`
    - `status`: `'pending_approval'`
    - `sourceType`: `DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER`
    - `sourceAssetId`: `input.assetId`
    - `generatedByAi`: `false`
    - `leadId`, `contactId`, `companyId`, `workspaceId`, `tenantId`, `senderIdentityId`
    - `aiGenerationMetadata`: `{ source_type: 'campaign_asset_render', source_asset_id: input.assetId, campaign_type: asset.campaign_type, personalization_snapshot: renderResult.personalizationSnapshot, missing_required_fields: renderResult.missingRequiredFields }`

11. **Create approval_request** — `approvalRepo.createApprovalRequest({...})` with:
    - `requestType`: `'email_draft_review'`
    - `subjectType`: `'lead'`
    - `subjectId`: `input.leadId`
    - `payload`: `{ draft_id: draft.id, subject: renderResult.renderedSubject, to_email: contact.email, to_name: ..., body_preview: renderResult.renderedBodyText.slice(0, 300), lead_id: input.leadId, asset_id: input.assetId, campaign_type: asset.campaign_type, personalization_snapshot: renderResult.personalizationSnapshot, missing_required_fields: renderResult.missingRequiredFields }`

12. **Link approval to draft** — `emailDraftRepo.linkApprovalToEmailDraft(draft.id, approval.id)`

13. **Write agent decision** (non-fatal `.catch()`):
    ```typescript
    agentDecisionRepo.createDecision({
      tenantId:       input.tenantId,
      workspaceId:    input.workspaceId,
      agentName:      'campaign_asset_renderer',
      agentVersion:   'render-v1',
      decisionType:   'campaign_asset_draft_created',
      decisionStatus: 'completed',
      entityType:     'email_draft',
      entityId:       draft.id,
      leadId:         input.leadId,
      draftId:        draft.id,
      aiUsageEventId: null,  // no LLM call
      shortReason:    `Campaign asset rendered for lead ${input.leadId}`,
      inputSnapshot:  { asset_id: input.assetId, lead_id: input.leadId, campaign_type: asset.campaign_type },
      outputSummary:  { draft_id: draft.id, missing_required_fields: renderResult.missingRequiredFields },
    }).catch((err) => console.error('[campaign-asset-renderer] Failed to write agent decision:', err))
    ```

14. **Emit activity event** (non-fatal `.catch()`):
    ```typescript
    activityEventService.recordActivity({
      tenantId:     input.tenantId,
      workspaceId:  input.workspaceId,
      eventType:    ActivityEventType.CAMPAIGN_ASSET_DRAFT_CREATED,
      eventSource:  'campaign_asset_render',
      entityType:   'email_draft',
      entityId:     draft.id,
      leadId:       input.leadId,
      companyId:    lead.company_id ?? undefined,
      eventSummary: `Campaign asset draft created: ${asset.asset_name}`,
      metadata:     { asset_id: input.assetId, campaign_type: asset.campaign_type, draft_id: draft.id, approval_request_id: approval.id, missing_fields: renderResult.missingRequiredFields },
    }).catch(() => null)
    ```

15. **Return** `{ ok: true, draftId: draft.id, approvalRequestId: approval.id, missingFields: renderResult.missingRequiredFields }`

### 6.6 What this service must NOT do

- Must NOT call Claude or any LLM
- Must NOT call `preflightCheck`
- Must NOT call `recordUsage`
- Must NOT call `sendApprovedDraft`
- Must NOT call `resend.emails.send`
- Must NOT write any row to `campaign_email_sends`
- Must NOT auto-advance the draft beyond `pending_approval`

---

## 7. Send Readiness Service Plan

### 7.1 File to create

`modules/messaging/services/draft-send-readiness.service.ts`

### 7.2 Export

```typescript
import type { DraftSendReadinessResult, DraftReadinessContext } from '@/modules/messaging/drafts/draft-source.types'
import { DRAFT_READINESS_REASON, DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

interface DraftReadinessInput {
  status:                    string
  toEmail:                   string | null
  subject:                   string | null
  bodyHtml:                  string | null
  bodyText:                  string | null
  approvalRequestId:         string | null
  sourceType:                string | null
  sourceAssetId:             string | null
  aiGenerationMetadata:      Record<string, unknown>
}

export function checkDraftSendReadiness(
  draft:   DraftReadinessInput,
  context: DraftReadinessContext
): DraftSendReadinessResult
```

### 7.3 Check logic (in order)

| Check | Failure mode | Reason code |
|-------|-------------|-------------|
| `draft.toEmail` is present and non-empty | Blocked | `missing_recipient` |
| `draft.subject` is present and non-empty | Blocked | `missing_subject` |
| `draft.bodyHtml` or `draft.bodyText` is present and non-empty | Blocked | `missing_body` |
| `draft.status === 'approved'` | Blocked | `draft_not_approved` |
| `draft.approvalRequestId` is present | Blocked | `missing_approval_request` |
| If `draft.sourceType === 'campaign_asset_render'` AND `context.approvalRequestStatus` exists: `context.approvalRequestStatus === 'approved'` | Blocked | `draft_not_approved` |
| If `draft.sourceType === 'campaign_asset_render'` AND `context.sourceAssetStatus` set: must not be `'retired'` | Blocked | `source_asset_retired` |
| If `draft.sourceType === 'campaign_asset_render'` AND `context.sourceAssetStatus` set: must be `'approved'` or `'active'` | Blocked | `source_asset_not_active` |
| `context.missingPersonalizationFields.length > 0` | Warning only | `missing_personalization_fields` |
| `context.emailSendingEnabled === false` | Warning only (informational) | `email_sending_disabled` |

### 7.4 Invariants

- Pure function — no DB calls, no side effects
- `context.emailSendingEnabled` is read-only informational; it does NOT change any state
- `blockedReasons` are all reasons that prevent send; `warnings` are advisory
- Returns `{ ready: blockedReasons.length === 0, blockedReasons, warnings }`

---

## 8. Existing Path Updates

### 8.1 `modules/messaging/services/email-draft.service.ts`

**Change:** Add `sourceType: DRAFT_SOURCE_TYPE.RULE_TEMPLATE` to the `createEmailDraft` call at step 11.

```typescript
// Import at top of file:
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

// In createLeadEmailDraft, step 11 — add to createEmailDraft input:
sourceType: DRAFT_SOURCE_TYPE.RULE_TEMPLATE,
sourceAssetId: null,
```

The existing `agentDecisionRepo.createDecision` call (already present, non-fatal) is retained as-is.

### 8.2 `modules/messaging/send-bridge/send-bridge.service.ts`

**Change:** Add `sourceType: DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING` to the `createEmailDraft` call at step 11 (line ~201 of the file).

```typescript
// Import at top of file:
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

// In createEmailDraftFromApprovedVersion, step 11 — add to createEmailDraft input:
sourceType:    DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING,
sourceAssetId: null,
```

No other changes to the send-bridge. The write ordering (steps 10–17) remains unchanged.

### 8.3 `modules/messaging/services/manual-campaign-draft.service.ts`

**Two changes:**

**Change A — Campaign type harmonization:**

The `CAMPAIGNS` registry keys change from legacy values to Phase 3J `CAMPAIGN_TYPE` values. Because `new_lead_outreach` and `home_services_outreach` both map to `initial_contact`, the two are merged: keep `new_lead_outreach`'s generic copy under the `initial_contact` key. The `home_services_outreach` entry is removed as a standalone key. Updated registry:

```typescript
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

const CAMPAIGNS: Record<string, CampaignDefinition> = {
  [CAMPAIGN_TYPE.INITIAL_CONTACT]:     { /* was new_lead_outreach copy */ ... },
  [CAMPAIGN_TYPE.STATEMENT_FOLLOW_UP]: { /* was statement_review_followup copy */ ... },
  [CAMPAIGN_TYPE.CHECK_IN]:            { /* was processing_cost_review copy */ ... },
  [CAMPAIGN_TYPE.REACTIVATION]:        { /* was reengagement copy */ ... },
}
```

`home_services_outreach` content is dropped (folded into `INITIAL_CONTACT`). If business requirement demands a sector-specific entry, add a `CAMPAIGN_TYPE.INITIAL_CONTACT` variant with a `_home_services` suffix in a future phase — out of scope for Phase 3K.

**Change B — Add `sourceType` to `createEmailDraft` call:**

```typescript
// In generateManualCampaignDraft, at the createEmailDraft call:
sourceType:    DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE,
sourceAssetId: null,
```

`CAMPAIGN_OPTIONS` is regenerated from the updated `CAMPAIGNS` keys automatically.

### 8.4 `modules/messaging/actions/manual-campaign-draft.actions.ts`

**Change:** Update `VALID_CAMPAIGN_TYPES` to match the new Phase 3J registry keys:

```typescript
const VALID_CAMPAIGN_TYPES = new Set([
  CAMPAIGN_TYPE.INITIAL_CONTACT,
  CAMPAIGN_TYPE.STATEMENT_FOLLOW_UP,
  CAMPAIGN_TYPE.CHECK_IN,
  CAMPAIGN_TYPE.REACTIVATION,
])
```

Import `CAMPAIGN_TYPE` from `@/modules/messaging/campaign-assets/campaign-asset.constants`.

---

## 9. Server Action Plan

### 9.1 File to modify

`app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts`

### 9.2 New action: `createDraftFromAssetAction`

```typescript
export async function createDraftFromAssetAction(
  assetId: string,
  leadId:  string
): Promise<{ ok: boolean; draftId?: string; approvalRequestId?: string; missingFields?: string[]; error?: string }>
```

**Implementation:**
1. Authenticate: `createSupabaseServerClient()` → `buildRequestContext(supabase)`
2. Permission check: `requirePermission(ctx, 'crm.leads.view')`
3. Validate: `assetId` and `leadId` both non-empty strings
4. Call `createDraftFromAsset({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, assetId, leadId, requestedBy: ctx.userId })`
5. If `result.ok`:
   - `revalidatePath('/[workspaceSlug]/leads/[id]', 'page')`
   - `revalidatePath('/[workspaceSlug]/settings/campaign-assets/[assetId]', 'page')`
   - Return `{ ok: true, draftId: result.draftId, approvalRequestId: result.approvalRequestId, missingFields: result.missingFields }`
6. If `!result.ok`: return `{ ok: false, error: result.reason }`

### 9.3 Constraints

- No send action
- No campaign execution action
- No campaign assignment action
- No auto-advance of draft status

---

## 10. UI Implementation Plan

### 10.1 New component: `CreateDraftFromAssetCard`

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssetCard.tsx`

**Type:** `'use client'` component

**Props:**
```typescript
interface Props {
  workspaceSlug: string
  leadId:        string
  activeAssets:  Array<{ id: string; asset_name: string; campaign_type: string; status: string }>
}
```

**Behavior:**
- Dropdown: select from `activeAssets` (status `approved` or `active`)
- "Create Draft" button → calls `createDraftFromAssetAction(assetId, leadId)` via `useTransition`
- On success: if `missingFields.length > 0`, yellow warning banner: "Draft created with [N] unresolved personalization fields: [list]. Review and edit before approving."
- On success (no missing fields): green success message; link to lead detail drafts section
- On `reason === 'pending_draft_exists'`: "This lead already has a pending draft. Resolve it before creating another."
- On `reason === 'asset_not_eligible'`: "Selected asset is not approved or active."
- Disabled state while `pending`

### 10.2 New component: `DraftSourceBadge`

**File:** `components/messaging/DraftSourceBadge.tsx`

**Type:** Server-compatible (no `'use client'`)

**Props:**
```typescript
interface Props {
  sourceType:     string | null
  sourceAssetId?: string | null
  workspaceSlug?: string
}
```

**Behavior:**
- Renders a small colored badge using `DRAFT_SOURCE_BADGE` map
- If `sourceType === 'campaign_asset_render'` and `sourceAssetId` and `workspaceSlug` present: badge is a `<Link>` to `/[workspaceSlug]/settings/campaign-assets/[sourceAssetId]`
- If `sourceType === null`: renders nothing (empty `<span>`)

### 10.3 Lead detail page update

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

**Changes:**
1. Fetch active campaign assets for the workspace: `assetRepo.listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId)` filtered to `status in ['approved', 'active']`
2. Import `CreateDraftFromAssetCard` component
3. Add `<CreateDraftFromAssetCard>` below `<AgentDecisionPanel>` and above the activity timeline — only rendered when `!hasActiveDraft` (do not show if a draft already exists and is active)
4. Add `<DraftSourceBadge>` to the email draft history rows (using `draft.source_type` and `draft.source_asset_id`)

### 10.4 Campaign asset detail page update

**File:** `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx`

**Changes:**
1. Fetch `emailDraftRepo.getDraftsBySourceAsset(ctx.tenantId, assetId, 10)`
2. Add a read-only "Drafts Created from This Asset" section to the page (count + list of recent drafts)
3. Each row shows: draft status badge, created_at date, link to the lead detail page (`/[workspaceSlug]/leads/[lead_id]`)
4. If count = 0: show "No drafts created from this asset yet."

### 10.5 Message workspace update

**File:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`

**Change:** Pass `source_type` and `source_asset_id` from email drafts data to the `GeneratedVersionsPanel` or a draft history display. The `DraftSourceBadge` component is rendered alongside each draft entry.

Scope: minimal — add `DraftSourceBadge` to the existing draft list display. Do not redesign the panel.

### 10.6 Send readiness indicator

**File:** Add a `DraftSendReadinessCard` server component where draft review happens (lead detail page, message workspace draft panel).

**Scope for Phase 3K v1:** Read-only indicator using `checkDraftSendReadiness`. Shows:
- Green checkmarks for passing checks
- Red X for blocking reasons
- Yellow warning for `email_sending_disabled` and missing personalization fields

The existing "Send" button is unchanged. Phase 3K does not add a new send button.

### 10.7 No new live send button

Phase 3K adds no new "Send" button or send entrypoint. All sending continues through the existing `sendApprovedDraftAction` → `sendApprovedDraft()` path with all 8 gates enforced.

---

## 11. System Intelligence Plan

### 11.1 File to modify

`modules/intelligence/structured-errors/structured-error.types.ts`

### 11.2 New constants (additive — append after `CAMPAIGN_ASSET_FAILURE_TYPE`)

```typescript
// Phase 3K: Draft source / send readiness failure types
export const DRAFT_SOURCE_FAILURE_TYPE = {
  DRAFT_SOURCE_ASSET_RETIRED:             'DRAFT_SOURCE_ASSET_RETIRED',
  DRAFT_MISSING_PERSONALIZATION_FIELDS:   'DRAFT_MISSING_PERSONALIZATION_FIELDS',
  DRAFT_CREATION_BLOCKED_PENDING_EXISTS:  'DRAFT_CREATION_BLOCKED_PENDING_EXISTS',
  DRAFT_REJECTED_REPEATEDLY:              'DRAFT_REJECTED_REPEATEDLY',
  DRAFT_AI_BUDGET_BLOCKED:                'DRAFT_AI_BUDGET_BLOCKED',
  EMAIL_SENDING_ATTEMPTED_DISABLED:       'EMAIL_SENDING_ATTEMPTED_DISABLED',
} as const
export type DraftSourceFailureType = typeof DRAFT_SOURCE_FAILURE_TYPE[keyof typeof DRAFT_SOURCE_FAILURE_TYPE]
```

No new UI required for Phase 3K — these appear in the existing System Intelligence Critical & Open Errors table via the existing `automation_failures` insert path.

### 11.3 File to modify

`modules/intelligence/types.agent.ts`

### 11.4 Change

Add `CAMPAIGN_ASSET_DRAFT_CREATED` to the `ActivityEventType` constant (additive, under the Phase 3J section):

```typescript
// Phase 3K — Campaign asset draft creation
CAMPAIGN_ASSET_DRAFT_CREATED: 'campaign_asset_draft_created',
```

---

## 12. Budget and Usage Controls

| Path | `preflightCheck` | `recordUsage` | Confirmation |
|------|-----------------|---------------|--------------|
| `campaign_asset_render` | **No** | **No** | No LLM call — `renderCampaignAsset` is pure TypeScript |
| `manual` | No | No | No LLM |
| `rule_template` | No | No | No LLM |
| `manual_campaign_template` | No | No | No LLM |
| `ai_strategy_copywriting` | Yes (Phase 3I) | Yes (Phase 3I) | Unchanged — Claude call via Copywriting Agent |
| `ai_campaign_asset_revision` | Yes (Phase 3J) | Yes (Phase 3J) | Unchanged — Claude call via `campaign-asset-ai.service.ts` |

Phase 3K introduces **zero new AI calls**. No new budget enforcement needed. The existing Phase 3I `preflightCheck` and `recordUsage` infrastructure for AI paths is untouched. No automatic retry on budget block.

---

## 13. Test Plan

### 13.1 File to create

`tests/phase3k-unified-draft-send-path.test.ts`

### 13.2 Structure and test cases

All tests use `fs.readFileSync` + `toContain` / `not.toContain`. No Supabase mocking, no LLM calls.

```typescript
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()
function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}
function exists(relPath: string): boolean {
  return fs.existsSync(path.join(root, relPath))
}
```

#### Describe block 1: Constants and types (TC-3K-001–005)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-001 | `modules/messaging/drafts/draft-source.constants.ts` | file exists |
| TC-3K-002 | same | contains `campaign_asset_render` |
| TC-3K-003 | same | contains `ai_strategy_copywriting` |
| TC-3K-004 | same | contains `rule_template` |
| TC-3K-005 | `modules/intelligence/structured-errors/structured-error.types.ts` | contains `DRAFT_SOURCE_FAILURE_TYPE` |

#### Describe block 2: Migration and data model (TC-3K-006–015)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-006 | `supabase/migrations/20240035_phase3k_draft_source_provenance.sql` | file exists |
| TC-3K-007 | same | contains `source_type` |
| TC-3K-008 | same | contains `source_asset_id` |
| TC-3K-009 | same | contains `campaign_email_assets(id)` |
| TC-3K-010 | same | does NOT contain `CREATE TABLE` |
| TC-3K-011 | `types/database.ts` (email_drafts section) | contains `source_type` |
| TC-3K-012 | same | contains `source_asset_id` |
| TC-3K-013 | `modules/messaging/repositories/email-draft.repo.ts` | contains `sourceType` |
| TC-3K-014 | same | contains `sourceAssetId` |
| TC-3K-015 | same | contains `source_type:` and `source_asset_id:` in INSERT |

#### Describe block 3: Campaign asset render draft service (TC-3K-016–025)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-016 | `modules/messaging/services/campaign-asset-draft.service.ts` | file exists |
| TC-3K-017 | same | contains `createDraftFromAsset` |
| TC-3K-018 | same | contains `renderCampaignAsset` |
| TC-3K-019 | same | does NOT contain `@anthropic-ai/sdk` |
| TC-3K-020 | same | does NOT contain `sendApprovedDraft` |
| TC-3K-021 | same | does NOT contain `resend.emails.send` |
| TC-3K-022 | same | does NOT contain `campaign_email_sends` |
| TC-3K-023 | same | contains `createDecision` |
| TC-3K-024 | same | does NOT contain `recordUsage` |
| TC-3K-025 | same | does NOT contain `preflightCheck` |

#### Describe block 4: Service safety guardrails (TC-3K-026–032)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-026 | `modules/messaging/services/campaign-asset-draft.service.ts` | contains `asset_not_eligible` |
| TC-3K-027 | same | contains `'retired'` check (asset status guard) |
| TC-3K-028 | same | contains `pending_draft_exists` |
| TC-3K-029 | same | contains `DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER` |
| TC-3K-030 | same | contains `sourceAssetId: input.assetId` |
| TC-3K-031 | same | contains `generatedByAi: false` |
| TC-3K-032 | same | contains `status: 'pending_approval'` |

#### Describe block 5: Lifecycle and readiness (TC-3K-033–038)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-033 | `modules/messaging/services/draft-send-readiness.service.ts` | file exists AND contains `checkDraftSendReadiness` |
| TC-3K-034 | same | contains `draft_not_approved` |
| TC-3K-035 | same | contains `source_asset_retired` |
| TC-3K-036 | same | contains `missing_personalization_fields` |
| TC-3K-037 | same | does NOT contain `supabase` (pure function — no DB calls) |
| TC-3K-038 | same | contains `blockedReasons` |

#### Describe block 6: Source type on existing paths (TC-3K-039–049)

| TC | File | Assertion |
|----|------|-----------|
| TC-3K-039 | `modules/messaging/services/email-draft.service.ts` | contains `DRAFT_SOURCE_TYPE.RULE_TEMPLATE` |
| TC-3K-040 | `modules/messaging/send-bridge/send-bridge.service.ts` | contains `DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING` |
| TC-3K-041 | `modules/messaging/services/manual-campaign-draft.service.ts` | contains `DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE` |
| TC-3K-042 | same | contains `CAMPAIGN_TYPE.INITIAL_CONTACT` |
| TC-3K-043 | same | does NOT contain `new_lead_outreach` (legacy key removed) |
| TC-3K-044 | `modules/messaging/services/campaign-asset-draft.service.ts` | does NOT contain `preflightCheck` |
| TC-3K-045 | `modules/messaging/copywriting/copywriting-agent.service.ts` | still contains `preflightCheck` (unchanged) |
| TC-3K-046 | `modules/messaging/services/campaign-asset-draft.service.ts` | does NOT contain `recordUsage` |
| TC-3K-047 | same | contains `createDecision` |
| TC-3K-048 | `modules/messaging/services/campaign-asset-draft.service.ts` | does NOT contain `budget` or `preflightCheck` |
| TC-3K-049 | `modules/intelligence/structured-errors/structured-error.types.ts` | contains `DRAFT_AI_BUDGET_BLOCKED` |

#### Describe block 7: Safety guardrails (TC-3K-050–058)

| TC | Files | Assertion |
|----|-------|-----------|
| TC-3K-050 | `modules/messaging/services/campaign-asset-draft.service.ts`, `modules/messaging/services/draft-send-readiness.service.ts` | do NOT contain `resend.emails.send` |
| TC-3K-051 | same two files | do NOT contain `sendApprovedDraft` |
| TC-3K-052 | `modules/messaging/services/campaign-asset-draft.service.ts` | does NOT contain `campaign_email_sends` |
| TC-3K-053 | (no Inngest file in Phase 3K) | any new Inngest file does NOT exist |
| TC-3K-054 | `modules/messaging/services/campaign-asset-draft.service.ts`, `modules/messaging/services/draft-send-readiness.service.ts` | do NOT contain `EMAIL_SENDING_ENABLED` being SET (only read in readiness service) |
| TC-3K-055 | (no Phase 3L file) | `modules/messaging/services/campaign-assignment.service.ts` does NOT exist |
| TC-3K-056 | Phase 3K new files | do NOT contain `autoSend` or `auto_send` |
| TC-3K-057 | Phase 3K new files | do NOT contain `dispatchCampaign` or `executeCampaign` |
| TC-3K-058 | Phase 3K new files | do NOT contain `assignCampaign` or `enrollLead` |

**Estimated total: 58 source-reading tests.**

---

## 14. Ordered Implementation Sequence

Implement in this exact order. Each step must be complete and TypeScript-clean before moving to the next.

| Step | Action | File(s) |
|------|--------|---------|
| 1 | Create migration file | `supabase/migrations/20240035_phase3k_draft_source_provenance.sql` |
| 2 | Apply migration locally | `npx supabase db push` (local only) |
| 3 | Update database types | `types/database.ts` — add `source_type`, `source_asset_id` to email_drafts |
| 4 | Create constants file | `modules/messaging/drafts/draft-source.constants.ts` |
| 5 | Create types file | `modules/messaging/drafts/draft-source.types.ts` |
| 6 | Update email-draft.repo.ts | Add `sourceType`, `sourceAssetId` to `CreateEmailDraftInput`; update `createEmailDraft` INSERT; add `getDraftsBySourceAsset` |
| 7 | Update types.agent.ts | Add `CAMPAIGN_ASSET_DRAFT_CREATED` to `ActivityEventType` — **must precede Step 8** |
| 8 | Create readiness service | `modules/messaging/services/draft-send-readiness.service.ts` |
| 9 | Create asset draft service | `modules/messaging/services/campaign-asset-draft.service.ts` — imports `ActivityEventType.CAMPAIGN_ASSET_DRAFT_CREATED` added in Step 7 |
| 10 | Update email-draft.service.ts | Add `sourceType: DRAFT_SOURCE_TYPE.RULE_TEMPLATE` |
| 11 | Update send-bridge.service.ts | Add `sourceType: DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING` |
| 12 | Update manual-campaign-draft.service.ts | Harmonize campaign types; add `sourceType: DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE` |
| 13 | Update manual-campaign-draft.actions.ts | Update `VALID_CAMPAIGN_TYPES` to Phase 3J values |
| 14 | Update structured-error.types.ts | Add `DRAFT_SOURCE_FAILURE_TYPE` |
| 15 | Update campaign-assets actions.ts | Add `createDraftFromAssetAction` |
| 16 | Create `DraftSourceBadge` component | `components/messaging/DraftSourceBadge.tsx` |
| 17 | Create `CreateDraftFromAssetCard` component | `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssetCard.tsx` |
| 18 | Create `DraftSendReadinessCard` component | `components/messaging/DraftSendReadinessCard.tsx` |
| 19 | Update lead detail page.tsx | Add asset fetch; add `CreateDraftFromAssetCard`; add `DraftSourceBadge` to draft history; add `DraftSendReadinessCard` to draft review |
| 20 | Update campaign asset detail page.tsx | Add `getDraftsBySourceAsset` fetch; add draft count/list section |
| 21 | Update message workspace page.tsx | Add `DraftSourceBadge` to draft display |
| 22 | Write test file | `tests/phase3k-unified-draft-send-path.test.ts` |
| 23 | Run tests | `npx vitest run` — all 1176 + 58 new = ~1234 must pass |
| 24 | Run build | `npx next build` — must pass |
| 25 | Apply migration to staging | Via staging Supabase dashboard |
| 26 | Staging smoke test | Authenticated test of campaign asset → draft flow |
| 27 | Update AI context docs | `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` |
| 28 | Commit and push | `git commit -m "Phase 3K: implement unified draft send path"` |
| 29 | Tag | `phase-3k-unified-draft-send-path-v1` on implementation commit |

---

## 15. Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20240035_phase3k_draft_source_provenance.sql` | Migration |
| `modules/messaging/drafts/draft-source.constants.ts` | `DRAFT_SOURCE_TYPE`, `DRAFT_SOURCE_BADGE`, `DRAFT_READINESS_REASON` |
| `modules/messaging/drafts/draft-source.types.ts` | `DraftSourceType`, `DraftSendReadinessResult`, `DraftReadinessContext` |
| `modules/messaging/services/campaign-asset-draft.service.ts` | `createDraftFromAsset` |
| `modules/messaging/services/draft-send-readiness.service.ts` | `checkDraftSendReadiness` |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssetCard.tsx` | UI: create draft from asset |
| `components/messaging/DraftSourceBadge.tsx` | UI: source badge |
| `components/messaging/DraftSendReadinessCard.tsx` | UI: advisory send readiness indicator (read-only, no send) |
| `tests/phase3k-unified-draft-send-path.test.ts` | TC-3K-001 through TC-3K-058 |

---

## 16. Files to Modify

| File | Change |
|------|--------|
| `types/database.ts` | Add `source_type`, `source_asset_id` to email_drafts Row/Insert/Update |
| `modules/messaging/repositories/email-draft.repo.ts` | Extend `CreateEmailDraftInput`; update `createEmailDraft`; add `getDraftsBySourceAsset` |
| `modules/messaging/services/email-draft.service.ts` | Add `sourceType: DRAFT_SOURCE_TYPE.RULE_TEMPLATE` |
| `modules/messaging/send-bridge/send-bridge.service.ts` | Add `sourceType: DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING` |
| `modules/messaging/services/manual-campaign-draft.service.ts` | Harmonize campaign types; add `sourceType` |
| `modules/messaging/actions/manual-campaign-draft.actions.ts` | Update `VALID_CAMPAIGN_TYPES` |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Add `DRAFT_SOURCE_FAILURE_TYPE` |
| `modules/intelligence/types.agent.ts` | Add `CAMPAIGN_ASSET_DRAFT_CREATED` |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts` | Add `createDraftFromAssetAction` |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Add asset fetch + `CreateDraftFromAssetCard` + `DraftSourceBadge` |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx` | Add draft count section |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` | Add `DraftSourceBadge` to draft display |
| `docs/ai-context/00_CURRENT_STATUS.md` | Phase 3K completion entry |
| `docs/ai-context/06_GIT_MILESTONES.md` | Phase 3K commit + tag |
| `docs/ai-context/07_NEXT_STEPS.md` | Phase 3K completion + Phase 3L next |

---

## 17. Acceptance Criteria

| Criterion | Required |
|-----------|----------|
| `npx vitest run` passes — all ~1234 tests (1176 baseline + 58 new) | ✅ |
| `npx next build` passes | ✅ |
| TypeScript clean (no type errors) | ✅ |
| Migration `20240035` file exists and is syntactically correct | ✅ |
| Migration applied to local and staging | ✅ |
| Migration NOT applied to production during implementation | ✅ |
| Production not touched during implementation | ✅ |
| `EMAIL_SENDING_ENABLED` remains disabled on all environments | ✅ |
| No live sending | ✅ |
| No auto-send introduced | ✅ |
| No campaign execution introduced | ✅ |
| No campaign assignment introduced | ✅ |
| Phase 3L not started | ✅ |
| Staging smoke test: campaign asset → draft flow end-to-end | ✅ |
| `phase-3k-unified-draft-send-path-v1` lock tag pushed after all criteria met | ✅ |

---

## 18. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| **Migration typo** — incorrect SQL for `REFERENCES campaign_email_assets(id) ON DELETE SET NULL` | Copy exact SQL from Section 2.2; test locally with `npx supabase db push` before staging |
| **Campaign type harmonization breaks existing operator UX** — `CAMPAIGN_OPTIONS` dropdown changes labels | The `label` field in each registry entry stays human-readable; only the internal key changes. Verify `CAMPAIGN_OPTIONS` export produces correct `[{ value, label }]` array after rename |
| **`home_services_outreach` removal** — existing leads may have `campaign_type: 'home_services_outreach'` in `ai_generation_metadata` JSONB | This is historical data in JSONB only; no active code path reads this value to control behavior. Analytics queries should use `source_type = 'manual_campaign_template'` (which will be set going forward) |
| **Duplicate draft guard blocks legitimate re-render** — if operator tries to create a campaign asset draft while a Phase 3B draft is pending for the same lead | Expected behavior — `getPendingDraftForLead` returns the existing draft. UI shows "resolve existing draft first." Document this in the UI |
| **Missing personalization fields on render** — `renderCampaignAsset` returns sentinel `[field_name]` values | Draft is still created; `missingRequiredFields` surfaced in UI warning. Reviewer must edit before approving. `ai_generation_metadata.missing_required_fields` is the audit trail |
| **`source_type = NULL` on legacy rows** — analytics queries must handle this | All analytics queries in Phase 3K treat `NULL` as `'unknown'` and group separately. Document in analytics section. No backfill in v1 |
| **Accidental send path expansion** — implementor adds a new `sendApprovedDraft` call | TC-3K-051 guards this. Source-reading test will fail if any Phase 3K file imports or calls `sendApprovedDraft` |
| **UI readiness indicator mistaken for send permission** — operator sees "ready" and thinks email will send | UI must include copy: "Email sending is currently disabled. Drafts can be prepared and approved but not sent." `EMAIL_SENDING_ENABLED` informational warning visible at all times |
| **Phase 3L boundary crossing** — implementor adds campaign assignment logic | TC-3K-055, TC-3K-058 guard this |
| **`renderCampaignAsset` field mapping error** — DB row uses snake_case; function expects camelCase | Step 9 in Section 6.5 maps explicitly: `subject_template → subjectTemplate`, `body_template_html → bodyTemplateHtml`, etc. |

---

## 19. Final Recommendation

Phase 3K is ready for implementation after this plan is approved. The Phase 3J foundation is in place. Every required service (`renderCampaignAsset`, `createDecision`, `createEmailDraft`, `createApprovalRequest`, `sendApprovedDraft`, `preflightCheck`, `recordUsage`) exists and is production-deployed.

The scope is tightly bounded. All new code is additive. The migration adds two nullable columns — safe to roll back with `DROP COLUMN` if needed. The campaign type harmonization is the highest-risk change (operator-facing labels) and should be validated in staging before production deployment.

### Exact Next Prompt for Phase 3K Implementation

After this plan is approved, use the following prompt to begin implementation:

> Implement Phase 3K: Unified Draft / Send Path.
>
> Input: `docs/roadmap/phase-3k-implementation-plan.md`
>
> Follow the ordered implementation sequence in Section 14 exactly. Begin with Step 1 (migration file) and proceed in order. Do not skip steps. Do not implement Phase 3L. Do not enable live sending. Do not apply migration 20240035 to production. After all steps complete and tests pass, report the final state for lock tag approval.
