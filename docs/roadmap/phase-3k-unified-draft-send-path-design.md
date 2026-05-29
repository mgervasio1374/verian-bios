# Phase 3K — Unified Draft / Send Path
## Design & Test Cases v1.0

**Status:** Design — Awaiting Approval
**Date:** 2026-05-28
**Prerequisites:** Phase 3J complete and locked (`phase-3j-campaign-email-asset-library-v1 → 30068a6`)
**Next migration available:** `20240035`
**Baseline:** 1176/1176 tests, build passing, `EMAIL_SENDING_ENABLED` disabled

---

## 1. Problem Statement

### 1.1 Why Verian Needs a Unified Draft Path After Phase 3J

Through Phase 3J, the system has accumulated four distinct draft creation paths, none of which share a common provenance model, status taxonomy, or approval interface:

| Path | File | Provenance | Status flow |
|------|------|-----------|-------------|
| Phase 3A rule-to-template | `email-draft.service.ts` | `rule_name`, `template_slug` in JSONB `ai_generation_metadata` | draft → pending_approval → approved → sent |
| Manual campaign draft | `manual-campaign-draft.service.ts` | `campaign_type`, `reason_created: 'manual_campaign_assignment'` in JSONB | pending_approval → approved → sent |
| Phase 3B AI pipeline (SEB) | `send-bridge.service.ts` | `source: 'phase_3b_send_bridge'`, `message_version_id`, `strategy_id` in JSONB | pending_approval → approved → sent |
| Campaign asset render | **Missing** | No path exists yet | N/A |

This fragmentation creates concrete problems:

1. **No queryable provenance.** Every path buries its source in ad-hoc JSONB keys inside `ai_generation_metadata`. There is no typed column for source type. Querying "all drafts that came from a campaign asset render" requires JSONB filter expressions that are fragile, slow, and invisible to the ORM.

2. **No FK linkage to campaign assets.** Phase 3J creates `campaign_email_assets` rows but no path exists to create an `email_draft` from a rendered asset. The `email_drafts` table has no `source_asset_id` column. The Phase 3N send pilot cannot attribute outcomes back to assets without this FK.

3. **Inconsistent campaign type registries.** `manual-campaign-draft.service.ts` uses its own registry (`new_lead_outreach`, `statement_review_followup`, `processing_cost_review`, `home_services_outreach`, `reengagement`) that is entirely separate from Phase 3J's `CAMPAIGN_TYPE` constant (`initial_contact`, `statement_follow_up`, `proposal_follow_up`, etc.). Operators see two incompatible sets of campaign labels depending on which surface they use.

4. **No campaign asset → draft handoff.** Phase 3J built the asset library. Phase 3L will assign assets to leads. There is no bridge between them: no service that takes an active campaign asset, selects a lead, runs `renderCampaignAsset`, and creates an `email_draft` ready for human review. Phase 3L cannot be implemented until this bridge exists.

5. **Agent decisions not linked to drafts.** Phase 3I added `agent_decisions` linkage to AI agent calls. The Phase 3A template path and the manual campaign draft path create `email_drafts` without writing any `agent_decisions` row, so the decision log on the lead detail page shows no decisions for these drafts.

### 1.2 Why One-Off Drafts, Campaign Asset Drafts, Manual Drafts, and Future Campaign Drafts Must Share One Lifecycle

The existing `email_drafts` status flow (`draft → pending_approval → approved → sent`) already works correctly as a lifecycle contract. The problem is not the status values — it is the lack of a shared source taxonomy and the absence of typed provenance columns.

A unified draft path means:
- Every draft, regardless of how it was created, has a `source_type` value that is typed, queryable, and visible in the UI.
- Every draft that originated from a campaign asset has a `source_asset_id` FK linking it to the asset row.
- Every draft has a consistent set of approval, rejection, and send-readiness checks applied by the same service — not by three separate services with subtly different safety behaviors.
- Analytics, learning signals, and performance attribution can be computed against `source_type` without JSONB pattern-matching.

### 1.3 Why Phase 3H Send Safety Must Remain the Final Gate

`sendApprovedDraft()` in `email-send.service.ts` already enforces 8 sequential gates:

- Gate 0: `EMAIL_SENDING_ENABLED` system control
- Gate 1: draft ownership (tenant + workspace)
- Gate 2: lifecycle double-gate (draft.status + approval_request.status both `approved`)
- Gate 3: idempotency (no existing queued/sent send)
- Gate 4: recipient validation (email present, do_not_contact false)
- Gate 5: suppression checks (unsubscribes, suppression rules)
- Gate 6: rate limit policy
- Gate 7: sender identity present

Phase 3K must not bypass, duplicate, or weaken any of these gates. The campaign asset render draft path produces a draft that passes through the same `sendApprovedDraft()` call as any other draft. Phase 3K does not introduce a separate send path for campaign-asset-sourced drafts.

### 1.4 Why EMAIL_SENDING_ENABLED Must Remain Disabled

Gate 0 defaults to `false` when no system control row exists. Phase 3N (controlled live pilot) is the designated phase for enabling live sends under supervision, rate limits, and monitoring. Phase 3K implementation must not:
- Set `EMAIL_SENDING_ENABLED = true` on any environment.
- Provide a UI toggle for `EMAIL_SENDING_ENABLED` (that toggle exists in System Controls and is already gated by platform admin permission).
- Create any code path that calls `resend.emails.send` from a new location.

### 1.5 Why Phase 3K Must Not Introduce Live Sending, Auto-Send, Campaign Execution, or Campaign Assignment

Phase 3K prepares drafts for send-readiness. It does not send them. The gate between "draft is send-ready" and "draft is sent" is:
1. `EMAIL_SENDING_ENABLED = true` (Phase 3N only).
2. An explicit human click of the "Send" button in the message workspace or lead detail page.

No timer, no cron, no Inngest event, and no automated agent may call `sendApprovedDraft()` as a result of Phase 3K work. Campaign execution (sending to enrolled leads automatically) is Phase 3N. Campaign assignment (deciding which leads receive which asset) is Phase 3L.

---

## 2. Phase 3K Scope

**In scope:**

- Typed `source_type` column on `email_drafts` (migration `20240035` — see Section 17)
- `source_asset_id` FK column on `email_drafts` (same migration)
- `DRAFT_SOURCE_TYPE` constant (TypeScript)
- Unified draft source taxonomy (Section 5)
- Campaign asset render → draft creation path: select asset + lead → `renderCampaignAsset` → create `email_draft` (Section 9)
- Agent decision linkage for the campaign asset render path
- Harmonization of the manual campaign draft path's campaign types with Phase 3J `CAMPAIGN_TYPE`
- Send readiness model: non-sending check that draft meets all preconditions (Section 11)
- Source badge and provenance display on lead detail and message workspace
- Draft source visible on campaign asset detail page (renders count, approval count)
- System Intelligence visibility for draft readiness blocks (Section 14)
- Updated `00_CURRENT_STATUS.md` / `06_GIT_MILESTONES.md` / `07_NEXT_STEPS.md` after implementation
- Source-reading test suite (~55–65 tests)

**Not in scope (see Section 3):**

- Live sending, auto-send, campaign execution, campaign assignment, follow-up scheduling, Resend expansion, Phase 3L, Phase 3N

---

## 3. Explicit Out-of-Scope Items

| Item | Reason |
|------|--------|
| Campaign execution | Phase 3N — controlled live pilot only |
| Campaign assignment (which leads get which asset) | Phase 3L |
| Automatic lead enrollment | Phase 3L |
| Follow-up scheduling | Phase 3L |
| Live Resend API calls from new locations | Phase 3N |
| Auto-send of any kind | Never automatic — always human-approved |
| Resend sending expansion | `EMAIL_SENDING_ENABLED` remains disabled |
| Enabling `EMAIL_SENDING_ENABLED` | Phase 3N only |
| Unsubscribe implementation | Documented as future prerequisite for Phase 3N; not implemented in Phase 3K |
| Phase 3L implementation | Campaign assignment is a separate phase |
| Phase 3N implementation | Controlled live pilot is a separate phase |
| New approval_requests table fields | Existing approval model is sufficient for Phase 3K v1 |
| LLM calls from the campaign asset render path | Render is deterministic — `renderCampaignAsset` only |
| Modifying `sendApprovedDraft()` | Phase 3H gates are already correct; Phase 3K must not weaken them |

---

## 4. Existing Foundation Phase 3K Consumes

### 4.1 Phase 3H Send Safety Gates

`email-send.service.ts` `sendApprovedDraft()` already enforces all 8 gates listed in Section 1.3. Phase 3K does not touch this function. Every campaign-asset-sourced draft created by Phase 3K goes through the same gates when eventually sent.

### 4.2 EMAIL_SENDING_ENABLED

Implemented as Gate 0 in `sendApprovedDraft()`. `getBooleanControl(EMAIL_SENDING_ENABLED, tenantId)` defaults to `false`. Phase 3K implementation must not change any system control value and must not add any bypass for this gate.

### 4.3 email_drafts / email_sends / approval_requests

The `email_drafts` table already has the full status lifecycle, approval linkage (`approval_request_id`), and content fields. Phase 3K adds two columns via migration `20240035`: `source_type text NULL` and `source_asset_id uuid NULL REFERENCES campaign_email_assets(id) ON DELETE SET NULL`.

The `approval_requests` table (used in all three existing draft paths) is unchanged. The existing `approvalRepo.createApprovalRequest` is reused for the campaign asset render path.

The `email_sends` table is unchanged by Phase 3K. Send records are created by `sendApprovedDraft()` only.

### 4.4 Phase 3B Strategy / Copywriting / QRA / Human Review Bridge

The Phase 3B pipeline (Message Strategy Agent → Copywriting Agent → Quality Review Agent → Human Review Bridge → Send Bridge) is unchanged. Phase 3K does not modify any of these services. The SEB path continues to create `email_drafts` with `source_type = 'ai_strategy_copywriting'` going forward (backfill of existing rows is out of scope for Phase 3K v1).

### 4.5 Phase 3I Agent Decisions, AI Usage Events, AI Budget Policies

`agent_decisions.createDecision`, `ai_usage_events.recordUsage`, and `preflightCheck` are already wired into Phase 3J's AI generation path. Phase 3K extends this to the campaign asset render path: a `createDecision` row is written for every automated render (when triggered by a workflow or cron — future) or for every operator-initiated render (Phase 3K v1). Operator-initiated renders are not AI calls, so no `recordUsage` or `preflightCheck` applies. AI-generated drafts from the Phase 3B path continue to use `preflightCheck` + `recordUsage` as already implemented.

### 4.6 Phase 3J campaign_email_assets and renderCampaignAsset

`campaign_email_assets` provides the approved, active template library. `renderCampaignAsset` in `campaign-personalization.service.ts` is the deterministic personalization engine. Phase 3K's campaign asset render draft path uses both, unchanged.

The Phase 3J `CAMPAIGN_TYPE` constants in `campaign-asset.constants.ts` become the canonical campaign type taxonomy for Phase 3K. The legacy types in `manual-campaign-draft.service.ts` (`new_lead_outreach`, etc.) are mapped to their Phase 3J equivalents during Phase 3K harmonization (Section 8.2).

### 4.7 System Intelligence Visibility

The existing System Intelligence page, `automation_failures` table, lifecycle actions (Resolve / Investigate / Ignore), and `CAMPAIGN_ASSET_FAILURE_TYPE` constants from Phase 3J are the foundation for Phase 3K's draft readiness visibility. Phase 3K adds new constants to `structured-error.types.ts` for draft-level blocks (Section 14).

---

## 5. Unified Draft Source Taxonomy

Phase 3K introduces `DRAFT_SOURCE_TYPE` as a compile-time constant. Every `email_draft` created after Phase 3K implementation records one of these values in the `source_type` column.

| Value | LLM call? | AI usage event? | Agent decision? | Description |
|-------|-----------|----------------|----------------|-------------|
| `manual` | No | No | No | Operator typed subject/body directly in the draft editor |
| `rule_template` | No | No | No | Phase 3A rule fired → template slug resolved → content rendered from `email_templates` |
| `manual_campaign_template` | No | No | No | Operator chose a campaign type → `manual-campaign-draft.service.ts` rendered from inline copy |
| `ai_strategy_copywriting` | Yes (Claude) | Yes | Yes | Full Phase 3B pipeline: Strategy → Copywriting → QRA → HRB → SEB |
| `campaign_asset_render` | No | No | Yes (if automated) | Active campaign asset → `renderCampaignAsset` → personalized draft; deterministic |
| `ai_campaign_asset_revision` | Yes (Claude) | Yes | Yes | Campaign asset revised with AI → asset → render → draft (post Phase 3J revision) |
| `future_campaign_step` | TBD | TBD | TBD | Reserved for Phase 3L: automated campaign step enrollment |
| `future_follow_up` | TBD | TBD | TBD | Reserved for Phase 3L: follow-up scheduling |

**Which sources call LLMs:**
- `ai_strategy_copywriting` — calls Claude via the Copywriting Agent for version generation, and optionally QRA scoring.
- `ai_campaign_asset_revision` — calls Claude via `campaign-asset-ai.service.ts` `reviseAssetWithAi`.
- All others — no LLM call. `campaign_asset_render` calls `renderCampaignAsset` (pure TypeScript, zero tokens, zero latency).

**Source type for existing rows:** Existing `email_drafts` rows before Phase 3K will have `source_type = NULL`. Analytics queries must treat `NULL` as `unknown` and count them separately. No backfill is required in Phase 3K v1.

---

## 6. Unified Draft Lifecycle

### 6.1 Status Definitions

Phase 3K does not add new status values to the `email_drafts` table in v1. The existing status set is sufficient. The table below documents the full lifecycle contract including what each status means and when each is used:

| Status | Meaning | Who sets it |
|--------|---------|------------|
| `draft` | Draft created but not submitted for approval. Editable. | Creator or auto-set on creation |
| `pending_approval` | Submitted for human review. Approval request created. | Server action / `createEmailDraft` with status `pending_approval` |
| `approved` | Approval request approved by a human. Send-ready pending Phase 3H gates. | `updateDraftStatus` via `sendApprovedDraft` flow or HRB approval |
| `rejected` | Approval request rejected by a human. Cannot be sent. Draft can be edited and re-submitted. | HRB rejection action |
| `superseded` | A newer draft was created for the same lead; this draft is stale. Cannot be sent. | `supersedePendingDraftsForLead` |
| `sent` | `sendApprovedDraft()` succeeded. Immutable. | `updateDraftStatus` inside `sendApprovedDraft()` |
| `failed` | Recorded at the `email_sends` level only. The draft remains `approved` on failure so it can be retried. | Not a draft status — see `email_sends.status` |

**Note:** The `send_ready` concept requested in the design prompt is modeled as `approved` in the existing schema. A draft that is `approved` has passed the HRB gate and is send-ready pending Phase 3H runtime checks. Adding a separate `send_ready` status would require a migration and complicate the existing gate logic in `sendApprovedDraft()` without adding safety. The recommendation is to retain the existing `approved` status for send-readiness in Phase 3K v1 and revisit if Phase 3L introduces bulk queued sends that require a pre-send state.

### 6.2 Allowed Transitions

```
draft ──────────────────────────► pending_approval ──► approved ──► sent
  ▲                                      │                │
  │ (edit and re-submit)                 │                └── (retry possible; draft stays approved)
  └──────────────────────────────── rejected
                                         │
                                    superseded  (set by supersedePendingDraftsForLead on any status ∈ {draft, pending_approval})
```

| Transition | Requirements |
|-----------|-------------|
| → `pending_approval` | Subject non-empty, body non-empty, recipient email present, approval request created |
| → `approved` | Human approval via `approval_requests`; draft.status double-gate in `sendApprovedDraft()` |
| → `rejected` | Human rejection via HRB; rejection reason recorded |
| → `superseded` | Newer draft created for same lead via `supersedePendingDraftsForLead` |
| → `sent` | `sendApprovedDraft()` succeeded after all 8 gates pass |
| `rejected` → re-submit | Human edits draft, re-calls submit action; creates new approval request |
| Any → `sent` directly | **Blocked.** Must pass `approved` first. |
| `sent` → any | **Blocked.** Sent drafts are immutable. |
| `superseded` → any | **Blocked.** Superseded drafts cannot be resubmitted or sent. |

### 6.3 Enforcement Rules

- `approved`/`send_ready` requires human approval: enforced by `sendApprovedDraft()` Gate 2 (dual status check: `draft.status === 'approved'` AND `approval_request.status === 'approved'`).
- `sent` cannot happen unless Phase 3H gates pass: `EMAIL_SENDING_ENABLED` is Gate 0; gates 1–7 also apply.
- `EMAIL_SENDING_ENABLED = false` blocks all sends: enforced by Gate 0 in `sendApprovedDraft()`.
- Campaign asset renders create drafts but not sends: the `campaign_asset_render` source path creates an `email_draft` with status `pending_approval` and never calls `sendApprovedDraft()`.
- No auto-send path: no Inngest function, cron, or background process in Phase 3K may call `sendApprovedDraft()`.
- Rejected drafts cannot be sent: `rejected` status fails Gate 2 in `sendApprovedDraft()`.
- Superseded drafts cannot be sent: `superseded` status fails Gate 2 in `sendApprovedDraft()`.

---

## 7. Unified Draft Data Model Assessment

### 7.1 Existing email_drafts Fields (from source)

The `email_drafts` table already contains:

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | RLS isolation |
| `workspace_id` | uuid NULL | |
| `status` | text NOT NULL | See Section 6.1 |
| `subject` | text NOT NULL | Rendered subject |
| `body_html` | text NULL | Rendered HTML |
| `body_text` | text NULL | Rendered plain text |
| `to_email` | text NOT NULL | Recipient email |
| `to_name` | text NULL | Recipient display name |
| `lead_id` | uuid NULL | FK to `leads` |
| `contact_id` | uuid NULL | FK to `contacts` |
| `company_id` | uuid NULL | FK to `companies` |
| `sender_identity_id` | uuid NULL | FK to `sender_identities` |
| `template_id` | uuid NULL | FK to `email_templates` (Phase 3A path) |
| `workflow_run_id` | uuid NULL | FK to `workflow_runs` |
| `approval_request_id` | uuid NULL | FK to `approval_requests` |
| `generated_by_ai` | boolean NOT NULL | True for Phase 3B AI path |
| `ai_generation_metadata` | jsonb NOT NULL | Ad-hoc provenance; varies per path |
| `approved_at` | timestamptz NULL | |
| `approved_by` | text NULL | |
| `rejected_at` | timestamptz NULL | |
| `superseded_at` | timestamptz NULL | |
| `sent_at` | timestamptz NULL | |
| `deleted_at` | timestamptz NULL | Soft delete |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

### 7.2 Fields Phase 3K Needs

Phase 3K requires two new typed columns:

| New Field | Type | Default | Rationale |
|-----------|------|---------|-----------|
| `source_type` | `text NULL` | `NULL` | Typed provenance. Enables `WHERE source_type = 'campaign_asset_render'` without JSONB filter. Queryable by analytics, Learning Agent, System Intelligence. |
| `source_asset_id` | `uuid NULL REFERENCES campaign_email_assets(id) ON DELETE SET NULL` | `NULL` | Typed FK to the originating campaign asset. Required for: (a) campaign performance attribution (Phase 3N), (b) "renders from this asset" count on asset detail page, (c) Phase 3L assignment tracking. Cannot be reliably extracted from JSONB at query time. |

All other fields proposed in the design prompt (`source_strategy_id`, `source_version_id`, `source_decision_id`, `ai_usage_event_id`, `rendered_from_asset`, `personalization_snapshot`, `send_readiness_status`, `blocked_reason`) are either already present via `ai_generation_metadata` JSONB, derivable from existing FKs, or not needed for Phase 3K v1. The JSONB field continues to carry the full provenance detail.

**Decision: migration `20240035` IS required for Phase 3K.** See Section 17.

---

## 8. Draft Creation Paths

### 8.1 Manual Draft Path

**Trigger:** Operator opens a draft editor in the message workspace or lead detail page and types subject/body directly.

| Attribute | Value |
|-----------|-------|
| LLM call | No |
| `agent_decisions` row | No |
| `ai_usage_events` row | No |
| Human approval required | Yes — operator submits for self-review or sends directly if already approved |
| Auto-send | No |
| `source_type` | `'manual'` |
| `source_asset_id` | `NULL` |
| `generated_by_ai` | `false` |

This path is not yet fully implemented as a standalone editor. Phase 3K may add a minimal draft creation form if the message workspace does not already have one. Investigation required during implementation planning.

### 8.2 Rule / Template Draft Path (Phase 3A)

**Trigger:** Scoring pipeline fires a recommendation rule → `email-draft.service.ts` selects a template slug → renders content → creates draft.

| Attribute | Value |
|-----------|-------|
| LLM call | No — content comes from `email_templates` DB or inline copy |
| `agent_decisions` row | Currently no; Phase 3K adds one with `decision_type: 'draft_created_from_rule'` (non-fatal, additive) |
| `ai_usage_events` row | No |
| Human approval required | Yes — draft created as `pending_approval`; operator reviews |
| Auto-send | No |
| `source_type` | `'rule_template'` |
| `source_asset_id` | `NULL` |
| `generated_by_ai` | `false` |

**Campaign type harmonization:** The existing `RULE_TO_TEMPLATE_SLUG` map in `email-draft.service.ts` (`close_deal_now → email_close_deal`, etc.) uses rule names, not campaign types. These are not replaced — rule names are internal identifiers. The `source_type = 'rule_template'` label is sufficient for Phase 3K analytics.

### 8.3 Manual Campaign Template Draft Path

**Trigger:** Operator selects a campaign type from a dropdown in the lead detail page → `manual-campaign-draft.service.ts` renders inline copy → creates draft.

| Attribute | Value |
|-----------|-------|
| LLM call | No |
| `agent_decisions` row | Currently no; Phase 3K adds one with `decision_type: 'draft_created_from_manual_campaign'` (non-fatal) |
| `ai_usage_events` row | No |
| Human approval required | Yes |
| Auto-send | No |
| `source_type` | `'manual_campaign_template'` |
| `source_asset_id` | `NULL` |
| `generated_by_ai` | `false` |

**Campaign type harmonization required.** The current registry uses its own type strings (`new_lead_outreach`, `statement_review_followup`, etc.) that differ from Phase 3J's `CAMPAIGN_TYPE`. Phase 3K implementation must map these to Phase 3J equivalents:

| Legacy value (manual-campaign-draft.service.ts) | Phase 3J CAMPAIGN_TYPE equivalent |
|----------------|----------------|
| `new_lead_outreach` | `initial_contact` |
| `statement_review_followup` | `statement_follow_up` |
| `processing_cost_review` | `check_in` |
| `home_services_outreach` | `initial_contact` |
| `reengagement` | `reactivation` |

**Implementation approach:** The internal campaign type values in `manual-campaign-draft.service.ts` are updated to Phase 3J CAMPAIGN_TYPE strings. The `CAMPAIGNS` registry keys change; the action validator's `VALID_CAMPAIGN_TYPES` set is updated accordingly. The `source_type` written to `email_drafts` is `'manual_campaign_template'` regardless, so attribution is unambiguous. The `ai_generation_metadata` JSONB continues to carry the campaign type for backward compatibility.

### 8.4 AI Strategy / Copywriting Draft Path (Phase 3B)

**Trigger:** Operator initiates "Generate Strategy" in the message workspace → full Phase 3B pipeline → SEB creates draft.

| Attribute | Value |
|-----------|-------|
| LLM call | Yes — Copywriting Agent calls Claude |
| `agent_decisions` row | Yes — already implemented (Phase 3I) |
| `ai_usage_events` row | Yes — already implemented (Phase 3I) |
| Human approval required | Yes — HRB approval gate |
| Auto-send | No |
| `source_type` | `'ai_strategy_copywriting'` |
| `source_asset_id` | `NULL` |
| `generated_by_ai` | `true` |

Phase 3K adds `source_type = 'ai_strategy_copywriting'` to the `createEmailDraft` call in `send-bridge.service.ts`. No other change to the Phase 3B pipeline.

### 8.5 Campaign Asset Render Draft Path (NEW in Phase 3K)

**Trigger:** Operator on the lead detail page or campaign asset detail page clicks "Create Draft from Asset" → selects an active campaign asset and a lead → Phase 3K service runs → `email_draft` created.

See full detail in Section 9.

| Attribute | Value |
|-----------|-------|
| LLM call | No — `renderCampaignAsset` is pure TypeScript |
| `agent_decisions` row | Yes — `decision_type: 'campaign_asset_draft_created'`, `entity_type: 'email_draft'` |
| `ai_usage_events` row | No |
| Human approval required | Yes — draft created as `pending_approval`; operator reviews rendered content |
| Auto-send | No |
| `source_type` | `'campaign_asset_render'` |
| `source_asset_id` | asset.id |
| `generated_by_ai` | `false` (no LLM used in the render) |

### 8.6 Future: Campaign Step Draft Path (Phase 3L)

Reserved. `source_type = 'future_campaign_step'`. Not implemented in Phase 3K.

### 8.7 Future: Follow-Up Draft Path (Phase 3L)

Reserved. `source_type = 'future_follow_up'`. Not implemented in Phase 3K.

---

## 9. Campaign Asset Render to Draft Path

This is the primary new capability of Phase 3K. It bridges Phase 3J's asset library with the `email_drafts` → `sendApprovedDraft()` pipeline.

### 9.1 New Service: `campaign-asset-draft.service.ts`

Located at `modules/messaging/services/campaign-asset-draft.service.ts`.

**Input:**

```typescript
interface CreateDraftFromAssetInput {
  tenantId:    string
  workspaceId: string
  assetId:     string
  leadId:      string
  requestedBy: string  // ctx.userId — for agent decision
}
```

**Output:**

```typescript
type CreateDraftFromAssetResult =
  | { ok: true;  draftId: string; approvalRequestId: string; missingFields: string[] }
  | { ok: false; reason: string }
```

### 9.2 Step-by-Step Flow

1. **Load asset** — `assetRepo.getAssetById(tenantId, assetId)`.
2. **Validate asset status** — must be `'approved'` or `'active'`. If `'draft'`, `'under_review'`, or `'retired'`: return `{ ok: false, reason: 'asset_not_eligible' }`.
3. **Load lead, contact, company** — from CRM repos. Require contact email present. Run existing do_not_contact / suppression checks (reuse `email-draft.service.ts` safety check helpers).
4. **Load sender identity** — `emailDraftRepo.getDefaultSenderIdentity(tenantId)`.
5. **Build personalization fields** — from contact + company: `{ first_name, company_name, industry, city, state, estimated_savings, service_category, sender_name }`.
6. **Run `renderCampaignAsset`** — `renderCampaignAsset(asset, fields)`. This is deterministic — no LLM, no Resend, no DB write.
7. **Capture `missingRequiredFields`** — from `renderResult.missingRequiredFields`. If non-empty, surface as warning in UI (not a blocker for draft creation — reviewer will see the sentinel values).
8. **Duplicate guard** — `emailDraftRepo.getPendingDraftForLead(tenantId, leadId)`. If a pending draft exists, return `{ ok: false, reason: 'pending_draft_exists' }`.
9. **Create email_draft** — `createEmailDraft` with:
   - `subject: renderResult.renderedSubject`
   - `bodyHtml: renderResult.renderedBodyHtml`
   - `bodyText: renderResult.renderedBodyText`
   - `status: 'pending_approval'`
   - `sourceType: 'campaign_asset_render'`
   - `sourceAssetId: assetId`
   - `generatedByAi: false`
   - `aiGenerationMetadata: { source_type: 'campaign_asset_render', source_asset_id: assetId, campaign_type: asset.campaign_type, personalization_snapshot: renderResult.personalizationSnapshot, missing_required_fields: renderResult.missingRequiredFields }`
10. **Create approval request** — `approvalRepo.createApprovalRequest` with `request_type: 'email_draft_review'`, `subject_type: 'lead'`, `subject_id: leadId`. Payload includes draft ID, subject preview, asset ID, campaign type, and `personalization_snapshot`.
11. **Link approval to draft** — `emailDraftRepo.linkApprovalToEmailDraft(draftId, approvalRequestId)`.
12. **Write agent decision** — `agentDecisionRepo.createDecision` with:
    - `decision_type: 'campaign_asset_draft_created'`
    - `entity_type: 'email_draft'`
    - `entity_id: draftId`
    - `agent_name: 'campaign_asset_renderer'`
    - `decision_status: 'completed'`
    - `input_snapshot: { asset_id: assetId, lead_id: leadId, campaign_type: asset.campaign_type }`
    - `output_summary: { draft_id: draftId, missing_required_fields: renderResult.missingRequiredFields }`
    - `ai_usage_event_id: null` (no LLM call)
    - Non-fatal `.catch()` — never blocks draft creation.
13. **Emit activity event** — `activityEventService.recordActivity` with `event_type: 'CAMPAIGN_ASSET_DRAFT_CREATED'`. Non-fatal `.catch()`.
14. **Return** `{ ok: true, draftId, approvalRequestId, missingFields: renderResult.missingRequiredFields }`.

### 9.3 What This Path Does NOT Do

- Does NOT call Claude or any LLM. Zero tokens, zero cost.
- Does NOT create a `campaign_email_sends` row. The `campaign_email_sends` table is reserved for Phase 3N.
- Does NOT call `sendApprovedDraft()`.
- Does NOT call `resend.emails.send`.
- Does NOT write `ai_usage_events` (no LLM call).
- Does NOT write any row to `campaign_email_sends` (Phase 3N boundary).
- Does NOT auto-advance the draft beyond `pending_approval`. A human must approve before the draft is sendable.

### 9.4 Server Action

`createDraftFromAssetAction(assetId, leadId)` in `actions.ts` under the campaign-assets route or a new unified drafts actions file. Derives `requestedBy` from `ctx.userId`. Revalidates the lead detail page path.

---

## 10. Approval and Review Model

### 10.1 What Requires Approval

Every draft, regardless of source type, must reach `approved` status before `sendApprovedDraft()` can succeed. The existing dual-gate in `sendApprovedDraft()` (Gate 2) enforces this:
- `email_drafts.status === 'approved'`
- `approval_requests.status === 'approved'` (linked via `email_drafts.approval_request_id`)

Both must be true. Directly updating `email_drafts.status` in the DB without going through the approval flow will fail Gate 2.

### 10.2 How approval_requests Relate to Drafts

Each `email_draft` has at most one live `approval_request`. The FK `email_drafts.approval_request_id` links them. Existing paths (Phase 3A, Manual Campaign, Phase 3B SEB) all create one `approval_requests` row per draft. The campaign asset render path (Phase 3K) follows the same pattern.

### 10.3 Human Review Bridge Reuse

The Phase 3B HRB provides `selectVersion`, `rejectVersion`, `approveVersion`, `acknowledgeRiskAndApprove`, `requestRegeneration`, and `returnToStrategy` actions. These operate on `message_versions`, not directly on `email_drafts`. The campaign asset render path operates on `email_drafts` directly (same as Phase 3A and manual campaign path). Phase 3K does not reuse HRB's version-centric flow for the asset render path.

The approval model for campaign asset render drafts is simpler: operator opens the draft in the message workspace or lead detail page, reviews the rendered content, and clicks "Approve Draft" (which calls the existing approval action) or "Reject" (which calls the existing rejection action). The reviewer sees the personalization snapshot and any missing field warnings.

### 10.4 Operator Approval / Rejection

| Action | Effect |
|--------|--------|
| Approve draft | `approval_requests.status → 'approved'`; `email_drafts.status → 'approved'` (via existing HRB or send-bridge approval flow); draft becomes send-ready pending Phase 3H gates |
| Reject draft | `approval_requests.status → 'rejected'`; `email_drafts.status → 'rejected'`; `rejected_at` set; draft cannot be sent |
| Edit and re-submit | Only allowed for `draft` or `rejected` status. New approval request created; old one remains rejected. |

### 10.5 Override Handling

For campaign asset render drafts: an operator may edit the rendered subject/body before approving. Editing does not invalidate the source asset — the `source_asset_id` FK is retained even after edits. The `ai_generation_metadata.personalization_snapshot` captures the original rendered values for audit.

### 10.6 Audit Logging

- `agent_decisions` row: captures `source_asset_id`, `lead_id`, `campaign_type`, `missing_required_fields` at render time.
- `ai_generation_metadata` JSONB: captures full `personalization_snapshot` for every field resolved.
- `activity_events`: `CAMPAIGN_ASSET_DRAFT_CREATED` event captured per render.

### 10.7 Agent Decision Linkage for All Paths

| Path | `agent_decisions` row | Decision type |
|------|----------------------|---------------|
| `rule_template` | Yes (Phase 3K addition) | `'draft_created_from_rule'` |
| `manual_campaign_template` | Yes (Phase 3K addition) | `'draft_created_from_manual_campaign'` |
| `ai_strategy_copywriting` | Yes (Phase 3I) | existing |
| `campaign_asset_render` | Yes (Phase 3K new) | `'campaign_asset_draft_created'` |
| `manual` | No | — |

---

## 11. Send Readiness Model

Phase 3K introduces a `checkDraftSendReadiness` helper function (pure, synchronous). This is not a send — it is a pre-send readiness check that surfaces blocking reasons in the UI before the operator attempts to send.

### 11.1 Readiness Checks

```typescript
interface DraftSendReadinessResult {
  ready:         boolean
  blockedReasons: string[]
}

function checkDraftSendReadiness(draft: EmailDraftRow, context: {...}): DraftSendReadinessResult
```

| Check | Blocks | Reason code |
|-------|--------|-------------|
| Draft has a `to_email` | Yes | `'missing_recipient'` |
| `subject` is non-empty | Yes | `'missing_subject'` |
| `body_html` or `body_text` is non-empty | Yes | `'missing_body'` |
| `status === 'approved'` | Yes | `'draft_not_approved'` |
| `approval_request_id` is set | Yes | `'missing_approval_request'` |
| If `source_type === 'campaign_asset_render'`: source asset status is `'approved'` or `'active'` | Yes | `'source_asset_not_active'` |
| If `source_asset_id` set: asset not `'retired'` | Yes | `'source_asset_retired'` |
| Missing required fields in `ai_generation_metadata.missing_required_fields` | Warning only | `'missing_personalization_fields'` (informational) |
| `EMAIL_SENDING_ENABLED` | Visible in UI (read from System Controls) but NOT changed by this check | `'email_sending_disabled'` (informational) |

The Phase 3H runtime send gates remain the authoritative enforcement layer. `checkDraftSendReadiness` is advisory and UI-only.

### 11.2 EMAIL_SENDING_ENABLED in the UI

The readiness check displays `EMAIL_SENDING_ENABLED = false` as an informational warning: "Email sending is currently disabled by system control. Drafts can be prepared and approved but not sent." The actual gate is enforced by `sendApprovedDraft()` at send time, not by Phase 3K.

---

## 12. Send Handoff Boundaries

| Rule | Enforcement |
|------|------------|
| Phase 3K may prepare drafts (`pending_approval` status) | Draft creation services |
| Phase 3K may support human approval of drafts | Existing approval flow (unchanged) |
| Phase 3K must not call `resend.emails.send` | No new call sites in Phase 3K modules |
| Phase 3K must not call `sendApprovedDraft()` from any automated path | No Inngest function or cron in Phase 3K |
| Phase 3H `email-send.service.ts` is the only final send path | Unchanged |
| No auto-send | Campaign asset render creates draft; human approves; human clicks Send |
| `campaign_email_sends` table not written by Phase 3K | Boundary enforced by source-reading tests |

---

## 13. UI Design

### 13.1 Lead Detail Page — New "Create Draft from Asset" Section

Below the existing `AgentDecisionPanel` and `LeadActivityTimeline`, add a collapsible "Draft from Campaign Asset" card:
- Dropdown: select from active campaign assets (filtered by `campaign_type` matching the lead's likely campaign type, defaulting to all active assets).
- "Create Draft" button: calls `createDraftFromAssetAction(assetId, leadId)`.
- On success: link to the new draft in the message workspace.
- On failure: inline error message.
- Missing required fields warning: if `result.missingFields.length > 0`, yellow banner: "Draft created with [N] unresolved personalization fields: [field_list]. Review and edit before approving."

### 13.2 Message Workspace — Draft Source Badge

Every draft in the message workspace `[leadId]/page.tsx` GeneratedVersionsPanel or the lead detail draft history shows a source badge:

| Source type | Badge label | Color |
|-------------|-------------|-------|
| `rule_template` | Rule Template | gray |
| `manual_campaign_template` | Manual Campaign | gray |
| `ai_strategy_copywriting` | AI Pipeline | blue |
| `campaign_asset_render` | Campaign Asset | green |
| `manual` | Manual | gray |
| `NULL` / unknown | — | muted |

Clicking the badge for `campaign_asset_render` drafts links to the source asset detail page.

### 13.3 Campaign Asset Detail Page — Draft Count

On the campaign asset detail page (`/settings/campaign-assets/[assetId]`), add a "Drafts Created from This Asset" read-only counter and list (limit 10 most recent). Source: `WHERE source_asset_id = assetId AND source_type = 'campaign_asset_render'`. Clicking a draft row opens the lead detail page for that draft's lead.

### 13.4 Draft Review Panel — Provenance Display

When reviewing a campaign-asset-sourced draft, the review panel shows:
- **Source:** Campaign Asset — [Asset Name] → [Campaign Type badge]
- **Personalization Snapshot:** resolved field table from `ai_generation_metadata.personalization_snapshot`.
- **Missing Fields:** warning banner if `ai_generation_metadata.missing_required_fields` is non-empty.
- **Agent Decision:** link to the `agent_decisions` row (if present) showing `entity_type: 'email_draft'`, `decision_type: 'campaign_asset_draft_created'`.

### 13.5 Send Readiness Indicator

On the lead detail draft card and the draft review panel, a "Send Readiness" section shows:
- Green checkmark per passing check.
- Red X per blocking reason.
- Yellow warning for `EMAIL_SENDING_ENABLED = false`.
- The "Send" button remains visible (it already exists) but clicking it calls `sendApprovedDraft()` which enforces all gates at runtime.

### 13.6 No New Live Send Button

Phase 3K does not add a new "Send" button. The existing send button in the message workspace and lead detail page continues to call `sendApprovedDraftAction`, which calls `sendApprovedDraft()`, which enforces Gate 0 (`EMAIL_SENDING_ENABLED`). No new send entrypoint is introduced.

---

## 14. System Intelligence Visibility

Phase 3K adds new `DRAFT_SOURCE_FAILURE_TYPE` constants to `structured-error.types.ts` (additive):

| Constant | Severity | Trigger |
|----------|---------|---------|
| `DRAFT_SOURCE_ASSET_RETIRED` | WARNING | A draft exists with `source_asset_id` pointing to a now-retired asset — send is blocked |
| `DRAFT_MISSING_PERSONALIZATION_FIELDS` | WARNING | Draft created from asset render with `missing_required_fields` non-empty; reviewer should be aware |
| `DRAFT_CREATION_BLOCKED_PENDING_EXISTS` | INFO | Attempt to create a new draft failed because a pending draft already exists for the lead |
| `DRAFT_REJECTED_REPEATEDLY` | WARNING | Same lead's drafts have been rejected N times without send |
| `DRAFT_AI_BUDGET_BLOCKED` | CRITICAL | AI draft generation blocked by budget (reuses `AI_CALL_BLOCKED_BY_BUDGET` concept; new constant for draft-level context) |
| `EMAIL_SENDING_ATTEMPTED_DISABLED` | WARNING | Operator attempted to send but `EMAIL_SENDING_ENABLED = false` blocked; visible in System Intelligence for monitoring |

These appear in the existing Critical & Open Errors table. No new UI required.

---

## 15. Budget and Usage Controls

| Path | `preflightCheck` | `recordUsage` | Notes |
|------|-----------------|---------------|-------|
| `campaign_asset_render` | No | No | No LLM — deterministic render |
| `manual` | No | No | No LLM |
| `rule_template` | No | No | No LLM |
| `manual_campaign_template` | No | No | No LLM |
| `ai_strategy_copywriting` | Yes (Phase 3I) | Yes (Phase 3I) | Claude call via Copywriting Agent |
| `ai_campaign_asset_revision` | Yes (Phase 3J) | Yes (Phase 3J) | Claude call via `campaign-asset-ai.service.ts` |

Budget enforcement for Phase 3K is entirely delegated to existing Phase 3I infrastructure. Phase 3K introduces no new AI calls.

No retry without human action: if `preflightCheck` blocks an AI-assisted draft or revision, the operator must wait for the budget period to reset or request a policy override via System Intelligence. No automatic retry is implemented.

---

## 16. Analytics and Readiness

Phase 3K makes the following metrics queryable via typed columns instead of JSONB extraction:

| Metric | Query |
|--------|-------|
| Drafts by source type | `GROUP BY source_type` on `email_drafts` |
| Approvals by source type | `WHERE status = 'approved' GROUP BY source_type` |
| Rejection rate by source type | `COUNT(rejected) / COUNT(*) GROUP BY source_type` |
| Cost per approved AI draft | `JOIN ai_usage_events WHERE email_drafts.source_type = 'ai_strategy_copywriting'` |
| Campaign asset render draft count | `WHERE source_type = 'campaign_asset_render' AND source_asset_id = ?` |
| Send readiness blocked reasons | `WHERE source_type = 'campaign_asset_render' AND ai_generation_metadata->>'missing_required_fields' != '[]'` |
| Human override frequency | `agent_decisions WHERE decision_type IN ('draft_created_from_rule', ...)` rejection events |
| Draft source performance placeholders | `email_sends JOIN email_drafts ON source_type` (available once sends exist in Phase 3N) |

Phase 3K does not implement a dedicated analytics page for draft sources. Data is queryable from `ai-usage/page.tsx` (existing) and from the System Intelligence page. A Phase 3N analytics update will surface these metrics in the Revenue Analytics dashboard.

---

## 17. Migration Assessment

**Phase 3K v1 requires migration `20240035`.**

### 17.1 Why a Migration Is Required

The `source_type` and `source_asset_id` fields proposed in Section 7.2 cannot be reliably stored in `ai_generation_metadata` JSONB for Phase 3K's purposes:

1. **`source_asset_id` must be a real FK** to enable `ON DELETE SET NULL` semantics. If a campaign asset is ever deleted (not supported in v1, but possible in future), JSONB references do not cascade. Only a real FK handles this correctly.

2. **`source_type` is needed for efficient queries.** Phase 3L will need `WHERE source_type = 'campaign_asset_render' AND source_asset_id = ?` at scale. A JSONB filter (`WHERE ai_generation_metadata->>'source_type' = 'campaign_asset_render'`) is not indexed and performs a full table scan on large `email_drafts` tables.

3. **Analytics and Learning Agent** will join `email_drafts` to `campaign_email_assets` via `source_asset_id` to compute per-asset performance. This requires a real FK, not a JSONB text value.

### 17.2 Proposed Migration `20240035`

```sql
-- Phase 3K: Add typed source provenance columns to email_drafts

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS source_type text NULL,
  ADD COLUMN IF NOT EXISTS source_asset_id uuid NULL
    REFERENCES campaign_email_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_source_type
  ON email_drafts (tenant_id, source_type)
  WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_source_asset_id
  ON email_drafts (source_asset_id)
  WHERE source_asset_id IS NOT NULL;
```

**Additive only.** Existing rows get `source_type = NULL` and `source_asset_id = NULL`. No backfill required. No existing query is broken. New code uses the columns; old code ignores them.

**Migration timing:** Created during Phase 3K implementation, not during design. Do not create `20240035` until the Phase 3K implementation plan is approved.

---

## 18. Test Case Outline

All tests follow the source-reading pattern: `fs.readFileSync` + string presence assertions. No Supabase mocking, no LLM calls, no test doubles.

**Describe blocks:**

### TC-3K-001–005: Constants and types

| TC | Description |
|----|-------------|
| TC-3K-001 | `DRAFT_SOURCE_TYPE` constant is defined and exported |
| TC-3K-002 | `DRAFT_SOURCE_TYPE` contains `campaign_asset_render` |
| TC-3K-003 | `DRAFT_SOURCE_TYPE` contains `ai_strategy_copywriting` |
| TC-3K-004 | `DRAFT_SOURCE_TYPE` contains `rule_template` |
| TC-3K-005 | `DRAFT_SOURCE_FAILURE_TYPE` constants defined in `structured-error.types.ts` |

### TC-3K-006–015: Migration and data model

| TC | Description |
|----|-------------|
| TC-3K-006 | Migration `20240035` file exists |
| TC-3K-007 | Migration `20240035` adds `source_type` column to `email_drafts` |
| TC-3K-008 | Migration `20240035` adds `source_asset_id` column to `email_drafts` |
| TC-3K-009 | Migration `20240035` references `campaign_email_assets(id)` for `source_asset_id` |
| TC-3K-010 | Migration `20240035` does not create any table (additive columns only) |
| TC-3K-011 | `types/database.ts` `email_drafts` Row contains `source_type` |
| TC-3K-012 | `types/database.ts` `email_drafts` Row contains `source_asset_id` |
| TC-3K-013 | `email-draft.repo.ts` `CreateEmailDraftInput` includes `sourceType` |
| TC-3K-014 | `email-draft.repo.ts` `CreateEmailDraftInput` includes `sourceAssetId` |
| TC-3K-015 | `email-draft.repo.ts` `createEmailDraft` writes `source_type` and `source_asset_id` to INSERT |

### TC-3K-016–025: Campaign asset render draft path — service

| TC | Description |
|----|-------------|
| TC-3K-016 | `campaign-asset-draft.service.ts` file exists |
| TC-3K-017 | `campaign-asset-draft.service.ts` exports `createDraftFromAsset` function |
| TC-3K-018 | `createDraftFromAsset` calls `renderCampaignAsset` |
| TC-3K-019 | `createDraftFromAsset` does NOT call any LLM (no `@anthropic-ai/sdk` import in service file) |
| TC-3K-020 | `createDraftFromAsset` does NOT call `sendApprovedDraft` |
| TC-3K-021 | `createDraftFromAsset` does NOT call `resend.emails.send` |
| TC-3K-022 | `createDraftFromAsset` does NOT write to `campaign_email_sends` (no `createCampaignSend` reference) |
| TC-3K-023 | `createDraftFromAsset` calls `createDecision` (agent decision linkage) |
| TC-3K-024 | `createDraftFromAsset` does NOT call `recordUsage` (no LLM call) |
| TC-3K-025 | `createDraftFromAsset` does NOT call `preflightCheck` (no LLM call) |

### TC-3K-026–032: Campaign asset render draft path — safety guardrails

| TC | Description |
|----|-------------|
| TC-3K-026 | `createDraftFromAsset` returns `ok: false` if asset status is not `approved` or `active` |
| TC-3K-027 | `createDraftFromAsset` returns `ok: false` if `retired` asset selected |
| TC-3K-028 | `createDraftFromAsset` returns `ok: false` if pending draft already exists for lead |
| TC-3K-029 | `createDraftFromAsset` creates draft with `source_type = 'campaign_asset_render'` |
| TC-3K-030 | `createDraftFromAsset` creates draft with `source_asset_id` set to asset ID |
| TC-3K-031 | `createDraftFromAsset` creates draft with `generated_by_ai = false` |
| TC-3K-032 | `createDraftFromAsset` creates draft with `status = 'pending_approval'` |

### TC-3K-033–038: Lifecycle and approval

| TC | Description |
|----|-------------|
| TC-3K-033 | `checkDraftSendReadiness` function exists and is exported |
| TC-3K-034 | `checkDraftSendReadiness` returns blocked if `status !== 'approved'` |
| TC-3K-035 | `checkDraftSendReadiness` returns blocked if source asset is `'retired'` |
| TC-3K-036 | `checkDraftSendReadiness` returns warning (not block) for missing personalization fields |
| TC-3K-037 | `checkDraftSendReadiness` does not modify any DB row (pure function) |
| TC-3K-038 | `rejected` draft cannot reach send-ready (returns blocked reason `'draft_not_approved'`) |

### TC-3K-039–043: Source type on existing paths

| TC | Description |
|----|-------------|
| TC-3K-039 | Phase 3A `email-draft.service.ts` sets `source_type = 'rule_template'` |
| TC-3K-040 | Phase 3B `send-bridge.service.ts` sets `source_type = 'ai_strategy_copywriting'` |
| TC-3K-041 | `manual-campaign-draft.service.ts` sets `source_type = 'manual_campaign_template'` |
| TC-3K-042 | `manual-campaign-draft.service.ts` uses Phase 3J `CAMPAIGN_TYPE` values |
| TC-3K-043 | Phase 3A and manual campaign paths write `createDecision` row (non-fatal) |

### TC-3K-044–049: AI budget enforcement

| TC | Description |
|----|-------------|
| TC-3K-044 | `campaign_asset_render` path does not call `preflightCheck` |
| TC-3K-045 | `ai_strategy_copywriting` path still calls `preflightCheck` (existing Phase 3I behavior preserved) |
| TC-3K-046 | `campaign_asset_render` path does not write `ai_usage_events` |
| TC-3K-047 | `campaign_asset_render` path writes `agent_decisions` (decision, not usage) |
| TC-3K-048 | Budget block for AI path does not create draft |
| TC-3K-049 | Budget block emits `DRAFT_AI_BUDGET_BLOCKED` structured error |

### TC-3K-050–058: Safety guardrails

| TC | Description |
|----|-------------|
| TC-3K-050 | No Phase 3K file calls `resend.emails.send` |
| TC-3K-051 | No Phase 3K file calls `sendApprovedDraft` (other than existing call site in `email-send.actions.ts`) |
| TC-3K-052 | No Phase 3K file writes to `campaign_email_sends` |
| TC-3K-053 | No Phase 3K Inngest function calls `sendApprovedDraft` |
| TC-3K-054 | `EMAIL_SENDING_ENABLED` is not changed by any Phase 3K code |
| TC-3K-055 | No Phase 3L code introduced |
| TC-3K-056 | No auto-send introduced (no `autoSend` or `auto_send` strings in Phase 3K files) |
| TC-3K-057 | No campaign execution introduced (no `dispatchCampaign` or `executeCampaign`) |
| TC-3K-058 | No campaign assignment introduced (no `assignCampaign` or `enrollLead`) |

**Estimated total: ~58 source-reading tests.**

---

## 19. Safety Guardrails

The following guardrails are **explicitly hardcoded** into the Phase 3K design and must be verified in every test run and code review:

| Guardrail | Status |
|-----------|--------|
| `EMAIL_SENDING_ENABLED` remains disabled | Phase 3N only — Gate 0 in `sendApprovedDraft()` unchanged |
| No live sending | Phase 3K creates drafts; sends are initiated by human action only |
| No auto-send | No Inngest function or cron in Phase 3K calls `sendApprovedDraft()` |
| No campaign execution | Phase 3N boundary — not crossed |
| No campaign assignment | Phase 3L boundary — not crossed |
| No Resend API expansion | `resend.emails.send` not called from any Phase 3K module |
| No production deployment without approval | Production Vercel is Git-disconnected; manual deploy required |
| Migration `20240035` not created during design | Created only after Phase 3K implementation plan is approved |
| Campaign asset renders do not write `campaign_email_sends` | Source-reading test TC-3K-052 |
| `checkDraftSendReadiness` is advisory only | It reads data; it does not write any row or send any email |
| `sendApprovedDraft()` is the only send path | Unchanged; Gate 0 (`EMAIL_SENDING_ENABLED`) blocks all sends |
| No Phase 3L started | Phase 3L has its own design → approval → implementation sequence |

---

## 20. Proposed Roadmap After Phase 3K

| Phase | Theme | Key Boundary |
|-------|-------|-------------|
| Phase 3K | Unified Draft / Send Path | Typed source provenance; campaign asset render → draft; harmonized lifecycle; no sending |
| Phase 3L | Campaign Assignment Model | Assigns active assets to lead segments; enrollment rules; still no live sends |
| Phase 3M | Learning Loop / Campaign Optimization | Learning Agent reads draft source performance signals; asset revision recommendations |
| Phase 3N | Controlled Live Send Pilot | `EMAIL_SENDING_ENABLED` enabled for one workspace only; rate-limited; full monitoring |

Each phase requires an approved Design document and an approved Implementation Plan before any code is written. Do not begin Phase 3L until Phase 3K implementation is complete and locked.

---

## 21. Final Recommendation

### Is Phase 3K Ready for Implementation Planning?

**Yes — after this design document is approved.**

The Phase 3J foundation is complete and locked. All required services (`renderCampaignAsset`, `preflightCheck`, `recordUsage`, `createDecision`, `createEmailDraft`, `createApprovalRequest`, `sendApprovedDraft`) are implemented and production-deployed. The scope of Phase 3K is tightly bounded: typed source provenance columns, a campaign asset render draft path, harmonization of campaign types, and send readiness visibility. No new AI capabilities are introduced.

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Migration `20240035` has additive columns only — but rollback if needed | `ALTER TABLE ... DROP COLUMN` is safe; no existing columns removed |
| Campaign type harmonization in `manual-campaign-draft.service.ts` may break existing action validators | Update `VALID_CAMPAIGN_TYPES` in the action file simultaneously; source-reading tests verify |
| `source_type` not backfilled on existing rows — analytics show NULL for old drafts | Treat `NULL` as `'unknown'` in all queries; document in analytics |
| Duplicate draft guard prevents render draft when Phase 3A/3B draft exists for same lead | Operator must resolve pending draft first; UI surfaces this clearly |
| Retired asset after draft is created | `checkDraftSendReadiness` warns; System Intelligence `DRAFT_SOURCE_ASSET_RETIRED` error surfaced |

### Exact Next Prompt for Phase 3K Implementation Planning

After this design is approved, the following prompt starts implementation planning:

> Produce the Phase 3K implementation plan only.
>
> Input: `docs/roadmap/phase-3k-unified-draft-send-path-design.md`
>
> The implementation plan must list all files to create or modify, the exact function signatures for every new export, migration `20240035` full SQL, the order of implementation steps, the test case assignments per describe block, and all guardrail assertions. Do not implement code. Do not apply migration `20240035`. Do not start Phase 3L.
