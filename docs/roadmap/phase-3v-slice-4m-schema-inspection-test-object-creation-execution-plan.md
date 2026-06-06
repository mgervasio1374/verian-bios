# Phase 3V Slice 4M — Schema-Inspection Test Object Creation Execution Plan

**Status:** PLAN ONLY — NOT EXECUTED  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at plan creation:** ec7fd82acb8fdc836b577001350e159d804b7310

---

## A. Purpose

This is a schema-inspection-first execution plan created after both paths to create the required test object were unavailable:

- **Browser UI path:** No proposal capture creation option is visible on the staging lead page. The staging UI shows only the old approved draft.
- **CLI server-action path:** `createManualProposalCaptureAction` and `generateFollowUpDraftAction` require an authenticated Next.js session context unavailable from CLI.

This plan documents the exact schema and repository patterns, confirms the required operation order, and defines the future direct-DB transaction shape needed to create exactly one controlled staging test object set sufficient to unblock the Phase 3V Slice 4M approval verification sequence.

**No write is executed in this plan.**

---

## B. Current Confirmed State

| Item | Detail |
|------|--------|
| HEAD / origin/master | ec7fd82acb8fdc836b577001350e159d804b7310 |
| Prior retry verdict | BLOCKED — no pending_approval draft, no pending approval_request |
| One-open-proposal constraint | Cleared — proposal_event b39fefe3 is accepted; open_count = 0 |
| Old commitment | 827e62ca — open; must not be reused |
| Old draft | 97e59aa8 — approved; must not be reused |
| Old approval_request | 1afaff3b — approved; must not be reused |
| Current supabase/.temp/project-ref | kxrplupzbsmujjznzhpy (PRODUCTION) — must be relinked to staging before any future execution |
| Staging ref | smbausuyetlgxflyhmfg |
| Tenant ID | 10000000-0000-0000-0000-000000000001 |
| Workspace ID | 20000000-0000-0000-0000-000000000001 |
| Slice 5 | BLOCKED |

---

## C. Inspection Sources

All schema facts in this plan were derived from read-only inspection of the following sources. No staging SELECT queries were run. No relink was performed.

### Migration files inspected
| File | Tables / changes |
|------|-----------------|
| `supabase/migrations/20240003_workflow.sql` | `approval_requests` schema |
| `supabase/migrations/20240006_messaging.sql` | `email_drafts` base schema, `sender_identities`, `email_sends` |
| `supabase/migrations/20240011_phase36_email_draft_lifecycle.sql` | Adds `approved_at`, `approved_by`, `rejected_at`, `superseded_at` to `email_drafts` |
| `supabase/migrations/20240013_phase4_email_send.sql` | Adds `sent_at` to `email_drafts` |
| `supabase/migrations/20240035_phase3k_draft_source_provenance.sql` | Adds `source_type`, `source_asset_id` to `email_drafts` |
| `supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql` | Adds `campaign_assignment_id` to `email_drafts` |
| `supabase/migrations/20240038_phase3n_proposal_capture.sql` | `proposal_captures`, `proposal_events`, `proposal_follow_up_commitments` schemas; partial unique index for one-open-proposal constraint |
| `supabase/migrations/20240008_seed.sql` | Tenant ID and workspace ID seed values |

### Repository files inspected
| File | Patterns confirmed |
|------|--------------------|
| `modules/proposals/repositories/proposal-follow-up-draft.repo.ts` | `createFollowUpEmailDraft` insert shape; `linkDraftToCommitment` update pattern; idempotency guard (`draft_id IS NULL`) |
| `modules/proposals/services/proposal-follow-up-draft.service.ts` | Full operation order (steps 11–13b); approval_request payload structure; `linkApprovalToEmailDraft` call sequence |
| `modules/workflow/repositories/approval.repo.ts` | `createApprovalRequest` insert shape; confirmed `payload` JSONB column |
| `modules/messaging/repositories/email-draft.repo.ts` | `linkApprovalToEmailDraft` — UPDATE `email_drafts SET approval_request_id = approvalRequestId` |
| `modules/messaging/drafts/draft-source.constants.ts` | `DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP = 'future_follow_up'` |

### Grep searches run
- `proposal_follow_up_draft_review|approval_request_id|draft_id.*payload` in `modules/` — confirmed approval linkage patterns
- `createApprovalRequest|approval_requests` in `modules/` — confirmed files and insert shape
- `ALTER TABLE email_drafts` in `supabase/migrations/` — confirmed all additive columns

---

## D. Confirmed Schema Facts

### D.1 `proposal_events`

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | NOT NULL, DEFAULT gen_random_uuid() | PK |
| `tenant_id` | uuid | NOT NULL | Required; use `10000000-0000-0000-0000-000000000001` |
| `workspace_id` | uuid | NOT NULL | Required; use `20000000-0000-0000-0000-000000000001` |
| `lead_id` | uuid | NULL | FK → leads; use `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |
| `contact_id` | uuid | NULL | FK → contacts; derive from lead.contact_id |
| `company_id` | uuid | NULL | FK → companies; nullable |
| `account_id` | uuid | NULL | Reserved/nullable in Phase 3N |
| `sender_user_id` | uuid | NULL | FK → auth.users; nullable |
| `proposal_sent_at` | timestamptz | NOT NULL | **Required — no default; must be set explicitly** |
| `proposal_reference` | text | NULL | Use `[TEST ONLY] Slice 4M retry` |
| `proposal_amount` | numeric(14,2) | NULL | nullable |
| `proposal_currency` | text | NOT NULL DEFAULT 'USD' | Can omit |
| `estimated_savings` | numeric(14,2) | NULL | nullable |
| `opportunity_id` | uuid | NULL | nullable |
| `proposal_status` | text | NOT NULL DEFAULT 'sent' | CHECK IN ('sent','viewed','accepted','rejected','expired','withdrawn') |
| `capture_source` | text | NOT NULL | **Required — no default; CHECK IN ('manual','bcc_ingest','forward_ingest','outlook_sync','api'); use `'manual'`** |
| `capture_id` | uuid | NULL | nullable |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `deleted_at` | timestamptz | NULL | nullable |

**Partial unique index (one-open-proposal constraint):**
```
(tenant_id, workspace_id, lead_id)
WHERE proposal_status IN ('sent', 'viewed')
  AND deleted_at IS NULL
  AND lead_id IS NOT NULL
```
Setting `proposal_status = 'sent'` will activate this constraint. Pre-write check must confirm `open_count = 0` using `proposal_status IN ('sent', 'viewed')`.

**Minimum required fields to insert (beyond defaults):**
`tenant_id`, `workspace_id`, `proposal_sent_at`, `capture_source`

### D.2 `proposal_follow_up_commitments`

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | NOT NULL, DEFAULT gen_random_uuid() | PK |
| `tenant_id` | uuid | NOT NULL | Required; use `10000000-0000-0000-0000-000000000001` |
| `workspace_id` | uuid | NOT NULL | Required; use `20000000-0000-0000-0000-000000000001` |
| `proposal_event_id` | uuid | NOT NULL | FK → proposal_events ON DELETE CASCADE; **must link to new proposal_event** |
| `lead_id` | uuid | NULL | FK → leads ON DELETE SET NULL; use `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |
| `assigned_to_user_id` | uuid | NULL | nullable |
| `follow_up_due_at` | timestamptz | NOT NULL | **Required — no default; must be set explicitly** |
| `follow_up_sequence` | integer | NOT NULL DEFAULT 1 | Can omit; default is 1 |
| `schedule_rule_key` | text | NOT NULL | **Required — no default; use `'single_7'`** |
| `commitment_status` | text | NOT NULL DEFAULT 'open' | CHECK IN ('open','completed','skipped','proposal_closed') |
| `completed_at` | timestamptz | NULL | nullable |
| `completed_by_user_id` | uuid | NULL | nullable |
| `completion_notes` | text | NULL | nullable |
| `draft_id` | uuid | NULL | FK → email_drafts ON DELETE SET NULL; **starts NULL; set via UPDATE after draft creation** |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |

**Minimum required fields to insert (beyond defaults):**
`tenant_id`, `workspace_id`, `proposal_event_id`, `follow_up_due_at`, `schedule_rule_key`

### D.3 `email_drafts` (after all additive migrations)

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | NOT NULL, DEFAULT gen_random_uuid() | PK |
| `tenant_id` | uuid | NOT NULL | FK → tenants; Required |
| `workspace_id` | uuid | NULL | FK → workspaces; use `20000000-0000-0000-0000-000000000001` |
| `sender_identity_id` | uuid | NULL | FK → sender_identities; use staging default sender ID |
| `template_id` | uuid | NULL | FK → email_templates; nullable for test object |
| `to_email` | text | NOT NULL | **Required; use `mgervasio@321swipe.com`** |
| `to_name` | text | NULL | nullable |
| `cc_emails` | text[] | NULL | nullable |
| `bcc_emails` | text[] | NULL | nullable |
| `subject` | text | NOT NULL | **Required; use `[TEST ONLY] Slice 4M follow-up draft`** |
| `body_html` | text | NULL | nullable for test object |
| `body_text` | text | NULL | nullable for test object |
| `status` | text | NOT NULL DEFAULT 'draft' | **Set explicitly to `'pending_approval'`** |
| `subject_type` | text | NULL | **Set to `'proposal_follow_up_commitment'`** |
| `subject_id` | uuid | NULL | **Set to new commitment ID** |
| `source_type` | text | NULL | **Set to `'future_follow_up'`** (from DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP) |
| `source_asset_id` | uuid | NULL | nullable; leave null |
| `company_id` | uuid | NULL | FK → companies; nullable |
| `contact_id` | uuid | NULL | FK → contacts; use contact linked to lead |
| `lead_id` | uuid | NULL | FK → leads; use `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |
| `opportunity_id` | uuid | NULL | nullable |
| `workflow_run_id` | uuid | NULL | nullable |
| `approval_request_id` | uuid | NULL | FK → approval_requests; **starts NULL; set via UPDATE after approval_request creation** |
| `prompt_config_id` | uuid | NULL | nullable |
| `generated_by_ai` | boolean | NOT NULL DEFAULT false | Can omit |
| `ai_generation_metadata` | jsonb | NOT NULL DEFAULT '{}' | Can omit |
| `created_by` | uuid | NULL | FK → auth.users; nullable for test object |
| `deleted_by` | uuid | NULL | nullable |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `deleted_at` | timestamptz | NULL | nullable |
| `sent_at` | timestamptz | NULL | Added by migration 20240013; **must remain NULL** |
| `approved_at` | timestamptz | NULL | Added by migration 20240011; nullable |
| `approved_by` | uuid | NULL | Added by migration 20240011; nullable |
| `rejected_at` | timestamptz | NULL | nullable |
| `superseded_at` | timestamptz | NULL | nullable |
| `campaign_assignment_id` | uuid | NULL | Added by migration 20240037; leave null |

**Note: `email_drafts` has NO `from_email` column.** Sender is linked via `sender_identity_id`. Prior plan references to `from_email` on email_drafts were incorrect.

**Minimum required fields to insert (beyond defaults):**
`tenant_id`, `to_email`, `subject` (plus: `status='pending_approval'`, `subject_type`, `subject_id`, `source_type`)

### D.4 `approval_requests`

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | NOT NULL, DEFAULT gen_random_uuid() | PK |
| `tenant_id` | uuid | NOT NULL | FK → tenants; Required |
| `workspace_id` | uuid | NULL | FK → workspaces; use `20000000-0000-0000-0000-000000000001` |
| `workflow_run_id` | uuid | NULL | nullable for test object |
| `job_execution_id` | uuid | NULL | nullable for test object |
| `request_type` | text | NOT NULL | **Required; use `'proposal_follow_up_draft_review'`** |
| `status` | text | NOT NULL DEFAULT 'pending' | Will be `'pending'` by default |
| `requested_by_system` | boolean | NOT NULL DEFAULT true | Can omit |
| `assignee_id` | uuid | NULL | nullable |
| `subject_type` | text | NULL | Set to `'proposal_follow_up_commitment'` (matches service pattern) |
| `subject_id` | uuid | NULL | Set to new commitment ID |
| `payload` | jsonb | NOT NULL DEFAULT '{}' | **Set to structured payload (see D.4a below)** |
| `decision` | jsonb | NOT NULL DEFAULT '{}' | Can omit |
| `approved_by` | uuid | NULL | nullable |
| `decided_at` | timestamptz | NULL | nullable |
| `expires_at` | timestamptz | NULL | nullable |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | Can omit |

**Note: `approval_requests` has NO `email_draft_id` column.** Draft linkage is via `payload.draft_id` and the back-link `email_drafts.approval_request_id`.

#### D.4a Approval request payload structure

From `modules/proposals/services/proposal-follow-up-draft.service.ts` (lines 271–281):

```json
{
  "draft_id":           "<new_draft_id>",
  "commitment_id":      "<new_commitment_id>",
  "lead_id":            "d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1",
  "subject":            "[TEST ONLY] Slice 4M follow-up draft",
  "body_preview":       "[TEST ONLY] ...",
  "template_slug":      "email_proposal_follow_up",
  "schedule_rule_key":  "single_7",
  "follow_up_sequence": 1,
  "proposal_event_id":  "<new_proposal_event_id>"
}
```

The `workflow_repositories/reconciliation.repo.ts` reads `payload->>'draft_id'` to resolve draft linkage for reconciliation. This payload key is authoritative.

---

## E. Confirmed Relationship Pattern

### E.1 Object graph

```
proposal_event
  └─► proposal_follow_up_commitment  (via commitment.proposal_event_id)
        └─► email_draft               (via draft.subject_id = commitment.id,
        │                              draft.subject_type = 'proposal_follow_up_commitment')
        │   └─► approval_request      (via draft.approval_request_id = ar.id)
        │
        └─► draft_id                  (commitment.draft_id = draft.id — back-link, set via UPDATE)
```

### E.2 Linkage fields summary

| Link | Direction | Column |
|------|-----------|--------|
| commitment → event | FK | `commitment.proposal_event_id` |
| draft → commitment | polymorphic | `draft.subject_type = 'proposal_follow_up_commitment'`, `draft.subject_id = commitment.id` |
| commitment → draft | back-link | `commitment.draft_id` (set via UPDATE after draft creation) |
| draft → approval_request | FK | `draft.approval_request_id` (set via UPDATE after AR creation) |
| approval_request → draft | JSONB | `approval_request.payload->>'draft_id'` |
| approval_request → commitment | JSONB + polymorphic | `approval_request.subject_id = commitment.id`, `payload->>'commitment_id'` |

### E.3 Required operation order

Derived from `generateProposalFollowUpDraftForWorkspace` (service steps 11–13b):

> **Step 1.** INSERT `proposal_event` → capture `new_proposal_event_id`  
> **Step 2.** INSERT `proposal_follow_up_commitment` (linked to step 1, `draft_id = NULL`) → capture `new_commitment_id`  
> **Step 3.** INSERT `email_draft` (`subject_id = new_commitment_id`, `status = 'pending_approval'`, `source_type = 'future_follow_up'`, `approval_request_id = NULL`) → capture `new_draft_id`  
> **Step 4.** UPDATE `proposal_follow_up_commitments` SET `draft_id = new_draft_id` WHERE `id = new_commitment_id AND draft_id IS NULL` (idempotency guard from `linkDraftToCommitment`)  
> **Step 5.** INSERT `approval_requests` (payload includes `draft_id = new_draft_id`, `commitment_id = new_commitment_id`, etc.) → capture `new_approval_request_id`  
> **Step 6.** UPDATE `email_drafts` SET `approval_request_id = new_approval_request_id` WHERE `id = new_draft_id` (from `linkApprovalToEmailDraft`)  

All six steps must complete within a single transaction. Roll back on any failure.

---

## F. Future Write Boundary

Any future execution of this write is bounded by:

- **Environment:** staging only — ref `smbausuyetlgxflyhmfg`
- **Production excluded:** ref `kxrplupzbsmujjznzhpy` must not be linked or queried
- **Relink required:** current supabase/.temp/project-ref = `kxrplupzbsmujjznzhpy` (production); future execution must explicitly relink to staging and verify before running any SQL
- **Scope:** exactly one new test object set
- **No schema changes**
- **No migrations**
- **No system_controls changes**
- **No sender/provider configuration changes**
- **No sends**
- **No draft approval during object creation**
- **Slice 5 remains BLOCKED**

---

## G. Future Pre-Write SELECT-Only Verification

Run these checks against staging after relink, before any write. All are read-only.

### G.1 Staging ref — via CLI project metadata (not current_setting)
```
Verify via: npx supabase status (or supabase CLI project inspection)
Expected project ref: smbausuyetlgxflyhmfg
HARD STOP if ref is kxrplupzbsmujjznzhpy or any other value
```

### G.2 Production isolation
```sql
-- Run only against staging Supabase project dashboard (smbausuyetlgxflyhmfg)
-- Do not run any query against kxrplupzbsmujjznzhpy
-- HARD STOP if any connection to production ref is active
```

### G.3 Sender verification
```sql
SELECT id::text, email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
-- noreply@321swipe.com must appear with is_verified = true and status = active
-- Capture the sender_identity_id for use in draft insert
-- HARD STOP if sender is missing, inactive, or unverified
```

### G.4 Gates (lowercase keys)
```sql
SELECT key, value
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled');
-- Both must be false
-- HARD STOP if either is true
```

### G.5 Email send baselines
```sql
SELECT COUNT(*) AS email_sends_before FROM email_sends;
SELECT COUNT(*) AS campaign_email_sends_before FROM campaign_email_sends;
-- Record both; expected 2 / 0 unless unrelated prior activity changed them
```

### G.6 Lead and contact verification
```sql
SELECT
  l.id::text    AS lead_id,
  l.name,
  l.workspace_id::text,
  c.id::text    AS contact_id,
  c.email,
  c.do_not_contact,
  c.status
FROM leads l
JOIN contacts c ON c.id = l.contact_id
WHERE l.id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND l.tenant_id = '10000000-0000-0000-0000-000000000001';
-- Must return exactly one row
-- c.email must be mgervasio@321swipe.com
-- c.do_not_contact must be false
-- c.status must be active
-- HARD STOP on any mismatch
```

### G.7 Open proposal count (using actual partial index predicate)
```sql
SELECT COUNT(*) AS open_count
FROM proposal_events
WHERE lead_id    = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND tenant_id  = '10000000-0000-0000-0000-000000000001'
  AND workspace_id = '20000000-0000-0000-0000-000000000001'
  AND proposal_status IN ('sent', 'viewed')
  AND deleted_at IS NULL;
-- Must return 0
-- HARD STOP if open_count > 0
```

### G.8 Old object confirmation (do not reuse)
```sql
SELECT id, commitment_status FROM proposal_follow_up_commitments
WHERE id = '827e62ca-41c0-43da-9f02-6100a8eb52ce';
-- commitment_status must be 'open' (not pending_approval — no such status exists on commitments)

SELECT id, status, sent_at FROM email_drafts
WHERE id = '97e59aa8-5906-44f0-ad6a-bb3f23517500';
-- status must be 'approved' (unchanged)

SELECT id, status FROM approval_requests
WHERE id = '1afaff3b-665c-47ec-84fa-d9395520d88e';
-- status must be 'approved' (unchanged)
```

### G.9 Object type before-counts
```sql
SELECT COUNT(*) AS pe_before
FROM proposal_events
WHERE lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';

SELECT COUNT(*) AS pfuc_before
FROM proposal_follow_up_commitments pfuc
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';

SELECT COUNT(*) AS draft_before
FROM email_drafts ed
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ed.source_type = 'future_follow_up'
  AND ed.subject_type = 'proposal_follow_up_commitment';

-- Note: join via email_drafts.approval_request_id (not approval_requests.email_draft_id — that column does not exist)
SELECT COUNT(*) AS ar_before
FROM approval_requests ar
JOIN email_drafts ed ON ed.approval_request_id = ar.id
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ar.request_type = 'proposal_follow_up_draft_review';
```

---

## H. Future Transaction Shape

> **⚠ DO NOT RUN IN THIS PLAN — FUTURE EXECUTION ONLY ⚠**
>
> This SQL reflects the confirmed schema and repository patterns. Run only after:
> - Staging relink verified
> - All pre-write SELECT checks pass
> - Codex review of this plan is complete

```sql
-- =========================================================
-- DO NOT RUN IN THIS PLAN — FUTURE EXECUTION ONLY
-- Phase 3V Slice 4M — staging test object creation
-- Tenant:    10000000-0000-0000-0000-000000000001
-- Workspace: 20000000-0000-0000-0000-000000000001
-- Lead:      d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1
-- =========================================================

BEGIN;

-- Step 1: Insert proposal_event
-- Required: tenant_id, workspace_id, proposal_sent_at, capture_source
-- proposal_status defaults to 'sent' — activates one-open-proposal constraint
INSERT INTO proposal_events (
  tenant_id,
  workspace_id,
  lead_id,
  proposal_sent_at,
  proposal_reference,
  proposal_status,
  capture_source
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
  now(),                                    -- proposal_sent_at required, no default
  '[TEST ONLY] Slice 4M retry',
  'sent',
  'manual'
)
RETURNING id AS new_proposal_event_id;

-- Step 2: Insert proposal_follow_up_commitment
-- Required: tenant_id, workspace_id, proposal_event_id, follow_up_due_at, schedule_rule_key
-- draft_id starts NULL — set via UPDATE in Step 4
INSERT INTO proposal_follow_up_commitments (
  tenant_id,
  workspace_id,
  proposal_event_id,
  lead_id,
  follow_up_due_at,
  follow_up_sequence,
  schedule_rule_key,
  commitment_status
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  :new_proposal_event_id,                   -- bind from Step 1 RETURNING
  'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
  now() + interval '7 days',                -- follow_up_due_at required, no default
  1,
  'single_7',
  'open'
)
RETURNING id AS new_commitment_id;

-- Step 3: Insert email_draft
-- approval_request_id starts NULL — set via UPDATE in Step 6
-- No from_email column on email_drafts; sender linked via sender_identity_id
INSERT INTO email_drafts (
  tenant_id,
  workspace_id,
  to_email,
  subject,
  status,
  subject_type,
  subject_id,
  source_type,
  lead_id,
  sender_identity_id,
  generated_by_ai,
  ai_generation_metadata
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'mgervasio@321swipe.com',
  '[TEST ONLY] Slice 4M follow-up draft',
  'pending_approval',
  'proposal_follow_up_commitment',
  :new_commitment_id,                        -- bind from Step 2 RETURNING
  'future_follow_up',
  'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
  :staging_sender_identity_id,              -- bind from pre-write sender check (G.3)
  false,
  '{}'
)
RETURNING id AS new_draft_id;

-- Step 4: Back-link commitment → draft (idempotency guard: only if draft_id IS NULL)
UPDATE proposal_follow_up_commitments
SET
  draft_id   = :new_draft_id,               -- bind from Step 3 RETURNING
  updated_at = now()
WHERE id        = :new_commitment_id
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
  AND workspace_id = '20000000-0000-0000-0000-000000000001'
  AND draft_id IS NULL;                     -- idempotency guard per linkDraftToCommitment pattern
-- Verify: must update exactly 1 row; HARD STOP if 0 rows updated

-- Step 5: Insert approval_request
-- payload.draft_id is the authoritative linkage read by reconciliation
INSERT INTO approval_requests (
  tenant_id,
  workspace_id,
  request_type,
  status,
  requested_by_system,
  subject_type,
  subject_id,
  payload
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'proposal_follow_up_draft_review',
  'pending',
  true,
  'proposal_follow_up_commitment',
  :new_commitment_id,                        -- bind from Step 2 RETURNING
  jsonb_build_object(
    'draft_id',           :new_draft_id,     -- bind from Step 3 RETURNING
    'commitment_id',      :new_commitment_id,
    'lead_id',            'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
    'subject',            '[TEST ONLY] Slice 4M follow-up draft',
    'body_preview',       '[TEST ONLY]',
    'template_slug',      'email_proposal_follow_up',
    'schedule_rule_key',  'single_7',
    'follow_up_sequence', 1,
    'proposal_event_id',  :new_proposal_event_id
  )
)
RETURNING id AS new_approval_request_id;

-- Step 6: Link draft → approval_request (back-link via email_drafts.approval_request_id)
UPDATE email_drafts
SET
  approval_request_id = :new_approval_request_id,  -- bind from Step 5 RETURNING
  updated_at = now()
WHERE id = :new_draft_id;                            -- bind from Step 3 RETURNING
-- Verify: must update exactly 1 row; HARD STOP if 0 rows updated

-- ---- Commit only if all 6 steps succeeded and all RETURNING IDs are non-null ----
COMMIT;

-- ---- On any failure or null RETURNING ID: ROLLBACK ----
```

**Required output after transaction commits (not now):**

| Variable | Must be |
|----------|---------|
| `new_proposal_event_id` | non-null UUID ≠ b39fefe3... |
| `new_commitment_id` | non-null UUID ≠ 827e62ca... |
| `new_draft_id` | non-null UUID ≠ 97e59aa8... |
| `new_approval_request_id` | non-null UUID ≠ 1afaff3b... |

**HARD STOP and ROLLBACK if any is null.**

---

## I. Future Post-Write SELECT-Only Verification

```sql
-- I.1 Exactly one new proposal_event
SELECT COUNT(*) AS pe_after
FROM proposal_events
WHERE lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';
-- Must be pe_before + 1

-- I.2 New proposal_event fields
SELECT id, proposal_reference, proposal_status, proposal_sent_at, capture_source
FROM proposal_events
WHERE id = :new_proposal_event_id;
-- proposal_reference contains '[TEST ONLY] Slice 4M retry'
-- proposal_status = 'sent'
-- proposal_sent_at IS NOT NULL
-- capture_source = 'manual'

-- I.3 Exactly one new commitment
SELECT COUNT(*) AS pfuc_after
FROM proposal_follow_up_commitments pfuc
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';
-- Must be pfuc_before + 1

-- I.4 New commitment fields and draft back-link
SELECT id, schedule_rule_key, commitment_status, proposal_event_id, draft_id
FROM proposal_follow_up_commitments
WHERE id = :new_commitment_id;
-- schedule_rule_key = 'single_7'
-- commitment_status = 'open'
-- proposal_event_id = new_proposal_event_id
-- draft_id = new_draft_id  (back-link set by Step 4)

-- I.5 Exactly one new pending_approval draft
SELECT COUNT(*) AS draft_after
FROM email_drafts ed
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ed.source_type = 'future_follow_up'
  AND ed.subject_type = 'proposal_follow_up_commitment';
-- Must be draft_before + 1

-- I.6 New draft fields
SELECT id, status, to_email, subject, sent_at, approval_request_id, source_type, subject_type, subject_id
FROM email_drafts
WHERE id = :new_draft_id;
-- status = 'pending_approval'
-- to_email = 'mgervasio@321swipe.com'
-- subject contains '[TEST ONLY]'
-- sent_at IS NULL
-- approval_request_id = new_approval_request_id  (back-link set by Step 6)
-- source_type = 'future_follow_up'
-- subject_type = 'proposal_follow_up_commitment'
-- subject_id = new_commitment_id
-- HARD STOP if status != 'pending_approval' or sent_at IS NOT NULL

-- I.7 Exactly one new pending approval_request
-- Join via email_drafts.approval_request_id (approval_requests.email_draft_id does not exist)
SELECT COUNT(*) AS ar_after
FROM approval_requests ar
JOIN email_drafts ed ON ed.approval_request_id = ar.id
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ar.request_type = 'proposal_follow_up_draft_review';
-- Must be ar_before + 1

-- I.8 New approval_request fields and payload linkage
SELECT id, request_type, status, payload
FROM approval_requests
WHERE id = :new_approval_request_id;
-- request_type = 'proposal_follow_up_draft_review'
-- status = 'pending'
-- payload->>'draft_id' = new_draft_id
-- payload->>'commitment_id' = new_commitment_id
-- HARD STOP if status != 'pending'

-- I.9 New IDs differ from all old IDs
-- new_proposal_event_id    != b39fefe3-0639-494e-b84e-9093564a17ec  CONFIRM
-- new_commitment_id        != 827e62ca-41c0-43da-9f02-6100a8eb52ce  CONFIRM
-- new_draft_id             != 97e59aa8-5906-44f0-ad6a-bb3f23517500  CONFIRM
-- new_approval_request_id  != 1afaff3b-665c-47ec-84fa-d9395520d88e  CONFIRM

-- I.10 Old objects unchanged
SELECT id, commitment_status FROM proposal_follow_up_commitments
WHERE id = '827e62ca-41c0-43da-9f02-6100a8eb52ce';
-- commitment_status still 'open'

SELECT id, status FROM email_drafts
WHERE id = '97e59aa8-5906-44f0-ad6a-bb3f23517500';
-- status still 'approved'

SELECT id, status FROM approval_requests
WHERE id = '1afaff3b-665c-47ec-84fa-d9395520d88e';
-- status still 'approved'

-- I.11 Send counts unchanged
SELECT COUNT(*) FROM email_sends;
-- Must equal email_sends_before

SELECT COUNT(*) FROM campaign_email_sends;
-- Must equal campaign_email_sends_before

-- I.12 Gates still false
SELECT key, value FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled');
-- Both must still be false
```

---

## J. Risk Controls / Hard Stops

| # | Condition | Action |
|---|-----------|--------|
| 1 | Production ref `kxrplupzbsmujjznzhpy` is active during write | HARD STOP — relink to staging first |
| 2 | Staging ref `smbausuyetlgxflyhmfg` not confirmed via CLI/project metadata | HARD STOP |
| 3 | `current_setting('app.settings.project_ref', true)` alone used as sole ref verification | HARD STOP — also verify via Supabase CLI or project metadata |
| 4 | Schema uncertainty: any required column identified differently than this plan | HARD STOP — re-inspect before writing SQL |
| 5 | `approval_requests.email_draft_id` referenced in execution SQL | HARD STOP — column does not exist |
| 6 | `email_drafts.from_email` referenced in execution SQL | HARD STOP — column does not exist; use `sender_identity_id` |
| 7 | Any concrete INSERT or UPDATE SQL attempted before pre-write checks pass | HARD STOP |
| 8 | `tenant_id` or `workspace_id` not confirmed for all inserted rows | HARD STOP |
| 9 | `approval_request.payload.draft_id` key name not confirmed as authoritative | HARD STOP |
| 10 | `email_drafts.approval_request_id` back-link column not confirmed | HARD STOP |
| 11 | `proposal_follow_up_commitments.draft_id` update path not confirmed | HARD STOP |
| 12 | Repository insert/update pattern conflicts with planned SQL | HARD STOP — use repository pattern as source of truth |
| 13 | Open proposal count (proposal_status IN ('sent','viewed')) != 0 before write | HARD STOP |
| 14 | Lead d4e24f9f not found or contact email != mgervasio@321swipe.com | HARD STOP |
| 15 | Contact do_not_contact = true or status != active | HARD STOP |
| 16 | Sender noreply@321swipe.com missing, is_verified != true, or status != active | HARD STOP |
| 17 | Either gate (`email_sending_enabled` or `campaign_sending_enabled`) is true | HARD STOP |
| 18 | Step 4 UPDATE updates 0 rows (commitment.draft_id already set — unexpected) | HARD STOP — investigate before proceeding |
| 19 | Step 6 UPDATE updates 0 rows | HARD STOP — rollback |
| 20 | Any RETURNING ID is null | HARD STOP — rollback |
| 21 | Any send count changes after write | HARD STOP — investigate immediately |
| 22 | More than one new row created for any object type | HARD STOP — rollback |
| 23 | Old objects modified or reused | HARD STOP |
| 24 | New draft status != pending_approval after transaction | HARD STOP |
| 25 | New approval_request status != pending after transaction | HARD STOP |
| 26 | New draft sent_at IS NOT NULL after transaction | HARD STOP |
| 27 | Any send occurs | HARD STOP |
| 28 | Any draft approval is performed during object creation | HARD STOP |
| 29 | Slice 5 is attempted | HARD STOP |

---

## K. Evidence Template

```
Phase 3V Slice 4M — Test Object Creation Execution Evidence
============================================================

-- INSPECTION SOURCES --
migrations inspected:            [list files confirmed]
repository files inspected:      [list files confirmed]
staging SELECT queries run:      [none / or list if applicable]

-- ENVIRONMENT --
staging ref (via CLI):           smbausuyetlgxflyhmfg — CONFIRMED
production excluded:             YES — kxrplupzbsmujjznzhpy not linked
relink performed:                [YES/NO; prior ref was kxrplupzbsmujjznzhpy]
relink cleanup verified:         [YES/NO if applicable]

-- SENDER --
sender noreply@321swipe.com:     [is_verified=true, status=active, is_default=true]
sender_identity_id:              [uuid used in draft insert]

-- GATES BEFORE --
email_sending_enabled:           false
campaign_sending_enabled:        false

-- SEND BASELINES --
email_sends before:              [count]
campaign_email_sends before:     [count]
open proposal count before:      0 (proposal_status IN ('sent','viewed'))

-- OLD IDS EXCLUDED (not reused) --
old proposal_event:              b39fefe3-0639-494e-b84e-9093564a17ec
old commitment:                  827e62ca-41c0-43da-9f02-6100a8eb52ce
old draft:                       97e59aa8-5906-44f0-ad6a-bb3f23517500
old approval_request:            1afaff3b-665c-47ec-84fa-d9395520d88e

-- BEFORE COUNTS --
proposal_events (lead):          [pe_before]
commitments (lead):              [pfuc_before]
future_follow_up drafts (lead):  [draft_before]
AR proposal_follow_up (lead):    [ar_before]

-- NEW OBJECT IDs --
new proposal_event_id:           [uuid]
new commitment_id:               [uuid]
new draft_id:                    [uuid]
new approval_request_id:         [uuid]

-- AFTER COUNTS --
proposal_events (lead):          [pe_after = pe_before + 1]
commitments (lead):              [pfuc_after = pfuc_before + 1]
future_follow_up drafts (lead):  [draft_after = draft_before + 1]
AR proposal_follow_up (lead):    [ar_after = ar_before + 1]

-- LINKAGE VERIFICATION --
new draft.status:                pending_approval
new draft.sent_at:               null
new draft.approval_request_id:   [must equal new_approval_request_id]
new draft.subject_id:            [must equal new_commitment_id]
new commitment.draft_id:         [must equal new_draft_id]
new ar.status:                   pending
new ar.payload.draft_id:         [must equal new_draft_id]
new ar.payload.commitment_id:    [must equal new_commitment_id]

-- GATES AFTER --
email_sending_enabled:           false
campaign_sending_enabled:        false

-- SEND COUNTS AFTER --
email_sends after:               [must equal before]
campaign_email_sends after:      [must equal before]

-- FINAL CHECKS --
no send:                         CONFIRMED
no approval performed:           CONFIRMED
no Slice 5:                      CONFIRMED
old objects unchanged:           CONFIRMED
```

---

## L. Final Decision

**READY FOR CODEX REVIEW**

Schema inspection found sufficient evidence from migration files and repository code to plan the future write safely. The operation order, required columns, and all linkage patterns are confirmed.

- **No write executed.**
- **No app actions performed.**
- **No approval performed.**
- **No send.**
- **No gates changed.**
- **Nothing committed.**
- **Nothing pushed.**
- **Slice 5 remains BLOCKED.**

Codex review required before any execution is authorized.
