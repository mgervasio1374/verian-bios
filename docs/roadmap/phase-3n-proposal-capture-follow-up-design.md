# Phase 3N — Proposal Capture & Follow-Up Commitment Design

**Status:** Design only — awaiting authorization  
**Created:** 2026-05-30  
**Revised:** 2026-05-30 (Codex review, rev 2)  
**Predecessor:** Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage (locked `e33b130`)  
**Migration reserved:** `20240038` (plan only — no file created, no file applied)

---

## 1. Executive Summary

Phase 3N introduces a **proposal-capture layer** that allows Verian to record when a proposal has been sent to a contact — even when the proposal originates outside of Verian (e.g., via Outlook, manual email, or a third-party tool). Once a proposal is captured, Verian creates a **follow-up commitment**: a structured record of who needs to follow up, when, and through what schedule.

Phase 3N establishes the data model, capture surface, matching logic, human-review workflow, and follow-up scheduling rules. It does **not** enable automated outbound sending. It does not require LLM processing for proposal capture. It does not touch production until a separate explicit authorization step.

The primary deliverable is an auditable, workspace-scoped proposal event log that can be enriched by future phases (calendar scheduling in Phase 4, automated follow-up messaging in a later Phase 3 slice).

---

## 2. Problem Statement

Verian tracks lead workflow, email drafts, campaign assignments, and AI-generated outreach. However, one of the highest-value events in a sales cycle — **sending a proposal** — frequently happens outside Verian via Outlook, Gmail, or manual processes. Once that event leaves Verian's view:

- Follow-up scheduling is manual and unreliable
- Proposal status is unknown inside the CRM
- Verian cannot trigger recommitment workflows
- Proposal-level analytics (open rate, follow-up lag, close rate correlation) are impossible
- Operators cannot know which leads have open proposals and which have gone dark

This visibility gap is the root cause of proposal follow-up inconsistency. Phase 3N closes that gap by providing a lightweight, multi-channel proposal capture surface and converting each captured proposal into a structured follow-up commitment.

---

## 3. Phase 3N Objectives

| # | Objective |
|---|-----------|
| 1 | Define and migrate the `proposal_events` table (reserved as migration `20240038`) |
| 2 | Define and migrate the `proposal_captures` table for raw inbound capture records |
| 3 | Define and migrate the `proposal_follow_up_commitments` table |
| 4 | Provide a filtered query (not a separate table) for the human-review inbox over `proposal_captures` |
| 5 | Build a manual mark-as-sent UI flow on the lead detail page |
| 6 | Design the BCC/forward capture ingestion endpoint (no live receive yet — API shape only) |
| 7 | Build the human review UI for unmatched captures |
| 8 | Implement follow-up commitment creation from a captured proposal event |
| 9 | Implement follow-up schedule rules (deterministic, no LLM required) |
| 10 | Establish the capture match confidence scoring model |
| 11 | Audit-log every proposal event and capture action |
| 12 | All data is workspace- and tenant-scoped with RLS enforcement |

---

## 4. Non-Goals

| Item | Reason |
|------|--------|
| Live email sending for follow-up | `EMAIL_SENDING_ENABLED` remains disabled; follow-up messages drafted, not sent |
| Automated follow-up trigger | Phase 4+ — this phase creates the commitment, not the trigger |
| AI/LLM proposal parsing | Deterministic parsing first; AI parsing explicitly gated and budgeted in a future slice |
| Microsoft Graph / Outlook live sync | Future enhancement — API shape reserved but not implemented |
| Proposal document generation | Out of scope for capture layer |
| Payment or e-signature integration | Out of scope |
| Production migrations | Migration 20240038 applied to local and staging first; production requires explicit separate authorization |
| Automatic proposal amount parsing | Optional metadata only; no required field |
| Multi-proposal/revision tracking per lead | MVP: one open proposal per lead at a time; multi-proposal support is Phase 4+ |

---

## 5. User Stories

### Operator — Manual Capture
- As an operator, I want to mark a proposal as sent directly on the lead detail page so that Verian tracks it even though I sent the proposal via Outlook.
- As an operator, I want to record the approximate date the proposal was sent, even if it was yesterday.
- As an operator, I want Verian to automatically create a follow-up reminder after I record a proposal.

### Operator — Review Inbox
- As an operator, I want to see all unmatched inbound proposal captures so I can manually match them to the correct lead.
- As an operator, I want to dismiss or flag captures that are spam or cannot be matched.

### Operator — Follow-Up
- As an operator, I want to see a list of open proposals that have not been followed up within the scheduled window.
- As an operator, I want to mark a proposal as accepted, rejected, or expired.

### Workspace Admin — Visibility
- As a workspace admin, I want to configure how many days after a proposal is sent the first follow-up commitment triggers.
- As a workspace admin, I want to see a summary of all proposals sent this month and their current status.

### Platform Admin — Safety
- As a platform admin, I want all proposal capture records to be scoped to a tenant and workspace so there is no cross-tenant data bleed.

---

## 6. Proposed Data Model

> **Migration `20240038` is reserved in plan only.**  
> No migration file is created during this design step.  
> No migration is applied during this design step.

### Verian CRM Entity Relationships (Relevant to Proposal Model)

Before defining the tables, it is important to understand how Verian's existing CRM entities relate to each other, since the design references several of them:

| Entity | Table | Key Fields | Notes |
|--------|-------|-----------|-------|
| Lead | `leads` | `id`, `name`, `company_id`, `contact_id`, `workspace_id`, `tenant_id` | Primary sales target; has FK to `companies` and optionally `contacts` |
| Company | `companies` | `id`, `name`, `domain`, `workspace_id`, `tenant_id` | The target business; **`domain` lives here**, not on `accounts` |
| Contact | `contacts` | `id`, `first_name`, `last_name`, `email`, `company_id`, `workspace_id`, `tenant_id` | Individual person; has FK to `companies`; no direct FK to `leads` or `accounts` |
| Account | `accounts` | `id`, `name`, `company_id`, `workspace_id`, `tenant_id` | CRM account entity (contracts, revenue, renewals); linked to `companies` via `company_id`; **has no `domain` field** |
| Opportunity | `opportunities` | `id`, `name`, `lead_id`, `company_id`, `account_id`, `stage`, `value`, `workspace_id`, `tenant_id` | Sales pipeline record; FK to `leads`, `companies`, `accounts` |

**Domain matching uses `companies.domain`** — `accounts` has no `domain` field and must not be used for domain-based matching. When the design refers to matching a captured proposal to a company by domain, it always means `companies.domain`.

**`company_id` vs. `account_id` in the proposal model:** `proposal_events` uses `company_id` (FK to `companies`) as the primary company reference because company is the entity that owns a domain. `account_id` is retained as an **optional future field** for cases where a proposal is explicitly associated with a CRM account (e.g., a renewal proposal on an existing contract). In Phase 3N, `account_id` on `proposal_events` is nullable and not populated by the capture pipeline — it is reserved for future explicit assignment.

### 6.1 `proposal_events`

Core record representing a single proposal sent to a contact.

```sql
-- Migration 20240038 (reserved — not created yet)
CREATE TABLE proposal_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES contacts(id) ON DELETE SET NULL,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,
  account_id            uuid REFERENCES accounts(id) ON DELETE SET NULL, -- optional; Phase 3N always NULL; reserved for future

  -- Who sent and when
  sender_user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  proposal_sent_at      timestamptz NOT NULL,

  -- Proposal identity
  proposal_reference    text,           -- human-readable ref / deal name
  proposal_amount       numeric(14,2),  -- optional
  proposal_currency     text DEFAULT 'USD',
  estimated_savings     numeric(14,2),  -- optional; savings/ROI figure for proposal
  opportunity_id        uuid REFERENCES opportunities(id) ON DELETE SET NULL, -- optional; links to existing opportunity

  -- Status lifecycle
  proposal_status       text NOT NULL DEFAULT 'sent'
                          CHECK (proposal_status IN ('sent','viewed','accepted','rejected','expired','withdrawn')),

  -- Capture metadata
  capture_source        text NOT NULL
                          CHECK (capture_source IN ('manual','bcc_ingest','forward_ingest','outlook_sync','api')),
  capture_id            uuid REFERENCES proposal_captures(id) ON DELETE SET NULL,

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_proposal_events_tenant_workspace ON proposal_events (tenant_id, workspace_id);
CREATE INDEX idx_proposal_events_lead_id ON proposal_events (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_proposal_events_company_id ON proposal_events (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_proposal_events_proposal_status ON proposal_events (proposal_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposal_events_sent_at ON proposal_events (proposal_sent_at DESC);
```

### 6.2 `proposal_captures`

Raw inbound capture record, prior to matching/confirmation. Exists even for unmatched captures. Includes soft-delete (`deleted_at`) and attachment metadata fields.

```sql
CREATE TABLE proposal_captures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid REFERENCES workspaces(id) ON DELETE SET NULL,

  -- Inbound data
  capture_source        text NOT NULL
                          CHECK (capture_source IN ('manual','bcc_ingest','forward_ingest','outlook_sync','api')),
  raw_sender_email      text,
  raw_recipient_email   text,
  raw_subject           text,
  raw_body_excerpt      text,         -- first 500 chars only — no full body stored
  raw_received_at       timestamptz,
  raw_message_id        text,         -- email Message-ID header for dedup (scoped to tenant)

  -- Attachment metadata (binary content never stored)
  attachments_count     integer NOT NULL DEFAULT 0,
  attachment_names      text[],       -- filenames only, e.g. ['proposal_acme.pdf']

  -- Matching results
  match_status          text NOT NULL DEFAULT 'pending'
                          CHECK (match_status IN ('pending','matched','unmatched','dismissed','manual_override')),
  matched_lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  matched_contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  matched_company_id    uuid REFERENCES companies(id) ON DELETE SET NULL,
  matched_by_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  matched_at            timestamptz,
  capture_confidence    integer CHECK (capture_confidence BETWEEN 0 AND 100),

  -- Review state
  reviewed_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  review_notes          text,

  -- Resolved event
  resolved_event_id     uuid REFERENCES proposal_events(id) ON DELETE SET NULL,

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz   -- soft-delete; used by inbox query to exclude dismissed/purged records
);

CREATE INDEX idx_proposal_captures_tenant_status ON proposal_captures (tenant_id, match_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposal_captures_workspace ON proposal_captures (workspace_id) WHERE workspace_id IS NOT NULL;
-- Tenant-scoped uniqueness: prevents duplicate ingest of the same email per tenant
-- Global uniqueness is intentionally avoided to prevent cross-tenant collision risk
CREATE UNIQUE INDEX idx_proposal_captures_tenant_message_id
  ON proposal_captures (tenant_id, raw_message_id)
  WHERE raw_message_id IS NOT NULL;
```

**Why tenant-scoped uniqueness (not global):** A global unique index on `raw_message_id` alone would create a cross-tenant collision risk — if two different tenants receive a forwarded email with the same Message-ID, the second insert would fail. Scoping to `(tenant_id, raw_message_id)` safely deduplicates within a tenant while allowing independent ingest across tenants.

**Why not workspace-scoped:** A single ingest event arrives before workspace routing is resolved. The workspace is determined during the matching pipeline. Scoping only to tenant at dedup time is correct; workspace is assigned after matching.

### 6.3 `proposal_follow_up_commitments`

Scheduled follow-up obligation created after a proposal event is confirmed.

```sql
CREATE TABLE proposal_follow_up_commitments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  proposal_event_id     uuid NOT NULL REFERENCES proposal_events(id) ON DELETE CASCADE,
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Schedule
  follow_up_due_at      timestamptz NOT NULL,
  follow_up_sequence    integer NOT NULL DEFAULT 1,   -- 1st, 2nd, 3rd follow-up in the cadence
  schedule_rule_key     text NOT NULL,                -- e.g. 'standard_3_5_10'

  -- Status
  commitment_status     text NOT NULL DEFAULT 'open'
                          CHECK (commitment_status IN ('open','completed','skipped','proposal_closed')),
  completed_at          timestamptz,
  completed_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  completion_notes      text,

  -- Draft linkage (reserved — future phase wires sending)
  -- calendar_event_id is NOT in Phase 3N; Phase 4 may add it via a later migration
  draft_id              uuid REFERENCES email_drafts(id) ON DELETE SET NULL,

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_commitments_tenant_workspace ON proposal_follow_up_commitments (tenant_id, workspace_id);
CREATE INDEX idx_proposal_commitments_due_at ON proposal_follow_up_commitments (follow_up_due_at)
  WHERE commitment_status = 'open';
CREATE INDEX idx_proposal_commitments_lead ON proposal_follow_up_commitments (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_proposal_commitments_event ON proposal_follow_up_commitments (proposal_event_id);
```

### 6.4 Proposal Capture Inbox (Query, Not Table)

The human-review inbox is implemented as a filtered server-side query over `proposal_captures`, not as a separate table or view. This avoids view sync issues and keeps the inbox consistent with the live `proposal_captures` state.

```typescript
// Server-side query (proposal-capture.repo.ts)
async function getPendingCapturesForWorkspace(
  tenantId: string,
  workspaceId: string
): Promise<ProposalCaptureRow[]> {
  return supabase
    .from('proposal_captures')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('match_status', ['pending', 'unmatched'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
}
```

> **Decision:** Use `proposal_captures` with the `(tenant_id, match_status) WHERE deleted_at IS NULL` index as the primary inbox query. A database view is not required for Phase 3N.

---

## 7. Proposal Event Model

### Status Lifecycle

```
sent → viewed → accepted
              → rejected
              → expired
              → withdrawn
```

- `sent`: Proposal dispatched; follow-up commitments created.
- `viewed`: Optional — recorded if future tracking pixel / Outlook read-receipt is available.
- `accepted`: Operator marks accepted; follow-up commitments auto-closed.
- `rejected`: Operator marks rejected; follow-up commitments auto-closed.
- `expired`: System or operator marks proposal lapsed; commitments closed.
- `withdrawn`: Proposal retracted before decision; commitments closed.

### One Open Proposal Per Lead — MVP Decision

**Phase 3N enforces a maximum of one open proposal per lead at any time.** "Open" means `proposal_status IN ('sent', 'viewed')` and `deleted_at IS NULL`.

- The "Record Proposal Sent" UI is blocked when an open proposal already exists for the lead.
- The server action `createManualProposalCaptureAction` checks for an existing open proposal and returns `{ ok: false, reason: 'open_proposal_exists' }` if found.
- Operator must close the existing proposal (mark as accepted, rejected, or expired) before recording a new one.

Multi-proposal and revision tracking (e.g., v2, v3 of a proposal, concurrent proposals for different contacts at the same company) are deferred to Phase 4 or later. See Section 28.

### Immutability Rules

- `proposal_sent_at` is immutable after creation.
- `capture_source` is immutable after creation.
- Status transitions are append-only; the `proposal_status` column records the current state. A `proposal_status_history` table (Phase 4+) would record full history.
- `deleted_at` soft-deletes — no hard deletes.

---

## 8. Capture Methods

| Method | Trigger | Automation Level | LLM Required | Phase 3N Scope |
|--------|---------|-----------------|-------------|----------------|
| Manual mark-as-sent | Operator clicks UI button on lead page | None — operator-driven | No | Yes — full UI |
| BCC ingestion | Operator BCCs `{workspaceSlug}@capture.verian.app` | Webhook receive → parse → match | No (deterministic) | API shape only — no live receive |
| Forward-to-Verian | Operator forwards existing email to capture address | Same as BCC | No (deterministic) | API shape only |
| Outlook sync | Microsoft Graph webhook push | Automated → queue → match | Optional (future) | Reserved — not implemented |
| API push | External system POSTs a capture record | API → parse → match | No | Reserved — shape defined |

**Phase 3N implements fully:** Manual mark-as-sent, human review inbox, follow-up commitment creation.  
**Phase 3N defines the API shape for:** BCC/forward ingest endpoint, Outlook sync schema, API push.  
**Phase 3N does not implement live email receiving.**

---

## 9. Manual Capture Flow

### User Journey

1. Operator is on the Lead Detail page (`/[workspaceSlug]/leads/[id]`).
2. A new **"Record Proposal Sent"** card/section is visible if the lead has no open proposal event (`proposal_status IN ('sent','viewed')`).
3. Operator clicks "Record Proposal Sent."
4. A modal or inline form opens with fields:
   - **Proposal sent date** (required; defaults to today; datepicker; cannot be future)
   - **Proposal reference / deal name** (optional; free text)
   - **Proposal amount** (optional; numeric)
   - **Estimated savings** (optional; numeric)
   - **Notes** (optional; free text)
5. Operator submits.
6. Server action creates:
   - `proposal_captures` row with `capture_source = 'manual'`, `match_status = 'matched'`, `capture_confidence = 100`, `attachments_count = 0`
   - `proposal_events` row linked to the lead/company/workspace/tenant
   - `proposal_follow_up_commitments` rows per the workspace follow-up schedule rule
7. Lead detail page revalidates; a **Proposal Status** card appears showing `sent` status and the next follow-up due date.

### Blocked States

- If a `proposal_events` row already exists for this lead with `proposal_status IN ('sent','viewed')` and `deleted_at IS NULL`, the "Record Proposal Sent" button is replaced with the Proposal Status card.
- Operator may close the existing proposal (accepted/rejected/expired) before recording a new one.

### Server Action: `createManualProposalCaptureAction`

```typescript
// Boundary checks (all enforced):
// 1. ctx.tenantId match — lead.tenant_id === ctx.tenantId
// 2. ctx.workspaceId match — lead.workspace_id === ctx.workspaceId
// 3. proposal_sent_at is not in the future
// 4. No open proposal_event already exists for this lead (status IN ('sent','viewed'))
// Returns: { ok: true, proposalEventId, commitmentCount } | { ok: false, reason }
// reason values: 'lead_not_found' | 'workspace_mismatch' | 'future_date' | 'open_proposal_exists'
```

---

## 10. BCC / Forward Capture Flow

> **Phase 3N scope:** API shape only — no live email receive infrastructure implemented.

### Capture Address Format

The capture address format is standardized as:

```
{workspaceSlug}@capture.verian.app
```

Examples:
- `acme-solar@capture.verian.app`
- `riverview-energy@capture.verian.app`

**Why this format:** The workspace slug prefix is the first routing key that identifies which workspace the capture belongs to before any lead/contact matching begins. This allows the ingest handler to scope the matching pipeline to the correct workspace immediately, reducing false matches across workspaces in multi-workspace tenants. The `capture.verian.app` subdomain is isolated from the primary sending domain (`verian.app`) to prevent any interaction with outbound email reputation.

### Conceptual Architecture

```
Operator sends proposal email in Outlook
   └── BCCs: acme-solar@capture.verian.app
         └── Email arrives at ingest MX
               (future: SendGrid Inbound Parse / Postmark / custom MX)
               └── POST /api/webhooks/proposal-capture
                     └── Webhook handler:
                           1. Verify HMAC signature
                           2. Extract workspace slug from To address prefix
                           3. Look up workspace by slug; verify tenant ownership
                           4. Parse From/Subject/Date headers
                           5. Extract first 500 chars of body (no full storage)
                           6. Deduplicate by (tenant_id, Message-ID)
                           7. Create proposal_captures row with match_status = 'pending'
                           8. Trigger match pipeline (see Section 12)
                           9. If confidence ≥ 85 → auto-match → create proposal_event
                          10. If confidence < 85 → route to inbox (Section 14)
```

### Ingest Endpoint Shape (reserved for Phase 3N implementation)

```
POST /api/webhooks/proposal-capture
Headers:
  X-Capture-Signature: HMAC-SHA256 of payload with PROPOSAL_CAPTURE_WEBHOOK_SECRET
Body: {
  source: 'bcc_ingest' | 'forward_ingest'
  from_email: string
  to_emails: string[]         -- first entry contains workspace slug
  cc_emails: string[]
  subject: string
  body_excerpt: string        -- first 500 chars — truncated by caller
  message_id: string          -- email Message-ID header
  received_at: string         -- ISO8601
  attachments_count: number   -- count only — binary content never received or stored
  attachment_names: string[]  -- filenames only, e.g. ['proposal_acme.pdf']
}
```

### Unknown Workspace Routing

- If the workspace slug prefix in the To address does not match any workspace in the tenant identified by the HMAC key: create `proposal_captures` row with `workspace_id = NULL` and `match_status = 'unmatched'`.
- These appear in the platform-admin-level unmatched inbox (future scope — not in Phase 3N UI).

---

## 11. Email Parsing and Matching Strategy

All matching in Phase 3N is **deterministic** — no LLM required.

### Parse Priority (in order)

1. **Recipient email exact match** — recipient email against `contacts.email` in the workspace
2. **Company domain match** — recipient email domain against `companies.domain` in the workspace
3. **Sender email match** — sender email against `users.email` to identify the Verian user who sent
4. **Subject line token extraction** — extract proper nouns, company names using a simple word-split (no NLP)
5. **Prior capture correlation** — check if a prior capture exists with matching `(tenant_id, raw_message_id)` for dedup

### Match Fields Used

| Field | Source | Match Target | Notes |
|-------|--------|-------------|-------|
| Recipient email | `raw_recipient_email` | `contacts.email` (exact, case-insensitive) | Primary contact match |
| Recipient domain | Parsed from `raw_recipient_email` | `companies.domain` (exact, case-insensitive) | Company match — uses `companies.domain`, NOT `accounts.domain` |
| Sender email | `raw_sender_email` | `users.email` (exact) | Identifies the Verian operator who sent |
| Subject tokens | Tokenized `raw_subject` | `companies.name`, `leads.name` (contains, case-insensitive, ≥ 4 chars) | Low-confidence only |
| Message-ID | `raw_message_id` | `(tenant_id, raw_message_id)` unique index | Dedup — not a match signal |

---

## 12. Lead / Contact / Company Matching Rules

Matching executes in a priority waterfall. First rule that produces a confident match wins. **Note:** matching resolves to leads and companies — not to `accounts`, which in Verian is a contract/revenue entity without a domain field.

### Rule 1: Exact Contact Email Match

```
IF contacts.email = raw_recipient_email (case-insensitive)
  AND contacts.tenant_id = ingest_tenant_id
  AND contacts.workspace_id = resolved_workspace_id
THEN
  match_status = 'matched'
  capture_confidence = 95
  matched_contact_id = contacts.id
  matched_company_id = contacts.company_id
  matched_lead_id = most-recent active lead where leads.contact_id = contacts.id
                    (NULL if no linked lead — capture still recorded)
```

### Rule 2: Exact Company Domain Match

```
IF companies.domain = domain_of(raw_recipient_email) (case-insensitive)
  AND companies.tenant_id = ingest_tenant_id
  AND companies.workspace_id = resolved_workspace_id
THEN
  match_status = 'matched' (if company is unambiguous)
  capture_confidence = 80
  matched_company_id = companies.id
  matched_lead_id = most-recent active lead where leads.company_id = companies.id
                    (NULL if multiple leads — human review resolves)
```

### Rule 3: Subject Token Match (company or lead name)

```
IF raw_subject contains companies.name OR leads.name (case-insensitive, ≥ 4 chars)
  AND scoped to resolved_workspace_id
THEN
  capture_confidence = 60 (below auto-match threshold of 85)
  → route to inbox for human review with suggested match
```

### Rule 4: No Match

```
IF none of the above produce confidence ≥ 50
THEN
  match_status = 'unmatched'
  capture_confidence = 0–49
  → route to inbox with no suggestion
```

---

## 13. Confidence Scoring for Capture Matches

| Scenario | Score | Auto-match? |
|----------|-------|-------------|
| Exact contact email match | 95 | Yes (≥ 85) |
| Exact company domain + sender is known Verian user | 90 | Yes |
| Exact company domain, sender unknown | 80 | Yes |
| Subject token match (company/lead name, unambiguous) | 65 | No — inbox |
| Subject token match only | 60 | No — inbox |
| No structured match at all | 0–30 | No — inbox |
| Manual capture | 100 | Always (no pipeline needed) |

**Auto-match threshold:** confidence ≥ 85 → create `proposal_event` automatically.  
**Review threshold:** confidence 40–84 → route to inbox with suggested match.  
**Dismiss threshold:** confidence < 40 → route to inbox with no suggestion; likely spam.

---

## 14. Human Review / Unmatched Proposal Inbox

### Route

`/[workspaceSlug]/settings/proposal-inbox`

### Page Behavior

- Queries `proposal_captures` filtered by `match_status IN ('pending', 'unmatched')` and `deleted_at IS NULL`, scoped to the workspace.
- Each row shows:
  - Raw sender email
  - Raw recipient email(s)
  - Subject (truncated to 80 chars)
  - Attachment count (if > 0)
  - Received at date
  - Confidence score + suggested match (if any)
  - Actions: **Match to Lead**, **Dismiss**, **Flag as Spam**
- "Match to Lead" opens a search picker — operator selects the correct lead.
- On match: creates `proposal_event` + `proposal_follow_up_commitments`, marks capture as `manual_override`.
- On dismiss: soft-deletes the capture (`deleted_at = now()`); no proposal event created.

### Sidebar Nav Entry

Add "Proposal Inbox" with an `Inbox` icon to the Settings section of the sidebar, adjacent to Campaign Queue.

---

## 15. Follow-Up Commitment Creation

When a `proposal_event` is confirmed (via manual capture or auto-match), the system creates one or more `proposal_follow_up_commitments` rows, one per scheduled follow-up interval.

### Creation Logic (server-side, non-LLM)

```typescript
async function createFollowUpCommitments(
  proposalEvent: ProposalEvent,
  scheduleRuleKey: string,
  ctx: RequestContext
): Promise<void> {
  const rule = getFollowUpScheduleRule(scheduleRuleKey)
  const commitments = rule.intervals.map((daysOffset, index) => ({
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    proposal_event_id: proposalEvent.id,
    lead_id: proposalEvent.lead_id,
    assigned_to_user_id: proposalEvent.sender_user_id,
    follow_up_due_at: addDays(new Date(proposalEvent.proposal_sent_at), daysOffset),
    follow_up_sequence: index + 1,
    schedule_rule_key: scheduleRuleKey,
    commitment_status: 'open',
  }))
  // Insert all in a single call (Supabase batch insert)
}
```

**Weekend/timezone note:** `addDays` operates on calendar days in UTC. Phase 3N does not adjust for weekends or local business hours. Timezone-aware scheduling is deferred to Phase 4.

### Auto-Close Trigger

When a `proposal_event` transitions to `accepted`, `rejected`, `expired`, or `withdrawn`:
- All open `proposal_follow_up_commitments` for this event are updated to `commitment_status = 'proposal_closed'`.
- No sending is triggered.
- This update is atomic with the status transition (same server action transaction).

---

## 16. Follow-Up Schedule Rules

Rules are defined in code as a registry (no DB table required in Phase 3N — rules are static). The registry is a pure TypeScript module with no external dependencies.

### Built-In Rules

#### `standard_3_5_10`

Standard sales follow-up cadence: follow up at day 3, day 5, day 10 after proposal sent.

```typescript
{
  key: 'standard_3_5_10',
  label: 'Standard (3, 5, 10 days)',
  intervals: [3, 5, 10],  // days after proposal_sent_at (UTC calendar days)
}
```

#### `aggressive_2_4_7`

Faster cadence for high-value deals.

```typescript
{
  key: 'aggressive_2_4_7',
  label: 'Aggressive (2, 4, 7 days)',
  intervals: [2, 4, 7],
}
```

#### `light_5_14`

Lighter cadence for lower-urgency proposals.

```typescript
{
  key: 'light_5_14',
  label: 'Light (5, 14 days)',
  intervals: [5, 14],
}
```

#### `single_7`

One-touch follow-up only.

```typescript
{
  key: 'single_7',
  label: 'Single follow-up (7 days)',
  intervals: [7],
}
```

### Workspace Default Rule

For Phase 3N, the default schedule rule is `standard_3_5_10` hardcoded. Configurable workspace default (`workspace_settings.default_proposal_schedule_rule`) is deferred to a future slice.

---

## 17. Relationship to Phase 3M Campaign Work Queue

Phase 3M introduced:
- `campaign_assignments` → `email_drafts.campaign_assignment_id` FK linkage
- `getCampaignWorkQueue` — database-only read; lists assigned campaign assignments with draft readiness
- `createDraftFromAssignmentAction` — creates an email draft from a campaign assignment

Phase 3N **does not modify** any Phase 3M table or logic. The relationship is:

| Dimension | Phase 3M | Phase 3N |
|-----------|----------|----------|
| Event type | Campaign outreach assignment | Proposal sent event |
| Data model | `campaign_assignments` | `proposal_events` |
| Trigger | Operator assigns campaign asset to lead | Operator marks proposal sent (or BCC ingest) |
| Draft creation | `createDraftFromAssignmentAction` | Reserved — future phase; no sending in 3N |
| Follow-up | None (draft is the follow-up) | `proposal_follow_up_commitments` created |
| LLM | None | None (deterministic only in 3N) |

Future phases may surface both campaign assignments and open proposal follow-up commitments in a unified operator work queue.

---

## 18. Relationship to Future Phase 4 — Calendar Scheduling

Phase 4 is expected to introduce calendar-based scheduling (potentially Microsoft Graph or Google Calendar integration). Phase 3N is designed to be Phase 4–compatible:

- `proposal_follow_up_commitments.follow_up_due_at` is a plain `timestamptz` — a calendar event can be created from this field without schema changes to existing rows.
- **`calendar_event_id` is not in Phase 3N.** Phase 4 may add `calendar_event_id` to `proposal_follow_up_commitments` through a later dedicated migration. No Phase 3N column, index, or code references this field.
- `proposal_events` is designed to accept a `viewed_at` field (future: read-receipt or calendar event confirm), but this column is not added in Phase 3N.
- No Phase 3N table locks scheduling concepts out. The design intentionally avoids premature FK columns that would require backfill.

---

## 19. Permissions and Workspace/Tenant Safety

### Row-Level Security (RLS) Rules

All new tables must have RLS enabled. Policy examples below use a safe UUID-to-text comparison. **Final RLS syntax must match the existing project policy conventions** — verify against an existing table's policy in a migration before implementing.

```sql
-- proposal_events
ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_events_tenant_isolation ON proposal_events
  USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- proposal_captures
ALTER TABLE proposal_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_captures_tenant_isolation ON proposal_captures
  USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- proposal_follow_up_commitments
ALTER TABLE proposal_follow_up_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_commitments_tenant_isolation ON proposal_follow_up_commitments
  USING (tenant_id::text = auth.jwt() ->> 'tenant_id');
```

**Why `tenant_id::text = auth.jwt() ->> 'tenant_id'`:** `auth.jwt() ->> 'tenant_id'` returns `text`; `tenant_id` is `uuid`. A direct comparison `tenant_id = auth.jwt() ->> 'tenant_id'` fails with a type mismatch in PostgreSQL without an implicit cast. Casting `tenant_id::text` on the left side is the safe cross-version form.

### Service Role Access

Service role bypasses RLS (as designed for all tables). All server actions must use `createSupabaseServiceClient()` only within authenticated, context-verified server actions — never in client-side code.

### Workspace Boundary Enforcement (server actions)

Every server action in Phase 3N must:
1. Call `buildRequestContext(supabase)` — establishes `tenantId`, `workspaceId`, `userId`
2. Verify that any `lead_id` passed as input belongs to `ctx.workspaceId` before writing
3. Return `{ ok: false, reason: 'lead_not_found' }` (not `unauthorized`) on any boundary violation — avoids leaking workspace structure
4. Never populate `company_id` from user-supplied input directly — always re-derive from the validated lead record

### Workspace Isolation on Ingest

For BCC/forward ingest:
- The `{workspaceSlug}@capture.verian.app` To address prefix identifies the workspace.
- The ingest handler looks up the workspace by slug and verifies it belongs to the tenant identified by the HMAC signing key.
- If no workspace match: create `proposal_captures` row with `workspace_id = NULL` and `match_status = 'unmatched'`.

---

## 20. Audit Logging Requirements

All proposal-related write operations must emit an `activity_event` (via `activityEventService.recordActivity`) with the following event types:

| Event Type | Trigger |
|-----------|---------|
| `proposal_sent_recorded` | Manual capture confirmed |
| `proposal_capture_ingested` | BCC/forward webhook received |
| `proposal_capture_matched` | Auto-match resolved |
| `proposal_capture_reviewed` | Human review action (match/dismiss) |
| `proposal_status_updated` | Status transition (accepted/rejected/etc.) |
| `proposal_follow_up_created` | Commitment row created |
| `proposal_follow_up_completed` | Commitment marked complete |
| `proposal_follow_up_skipped` | Commitment skipped by operator |

Audit events are fire-and-forget (non-fatal `.catch(() => null)`) — consistent with the existing Phase 3C+ pattern.

`types/agent.ts` must be extended with these event type constants before the Phase 3N implementation commit.

---

## 21. Token/LLM Usage Policy

Phase 3N uses **zero LLM tokens** for its core capture and matching pipeline.

| Operation | LLM? | Reason |
|-----------|------|--------|
| Manual capture form submit | No | Pure CRUD |
| BCC ingest parsing | No | Header parsing is deterministic |
| Confidence scoring | No | Rule-based lookup table |
| Lead/contact/company matching | No | SQL exact + domain match |
| Follow-up commitment creation | No | Arithmetic on sent_at + rule intervals |
| Human review matching UI | No | Operator-driven |
| Proposal status update | No | State machine |

**Future AI gate (not in Phase 3N):**  
If a future slice adds AI-assisted subject line parsing or contact disambiguation, it must:
1. Be gated behind a separate feature flag (e.g., `PROPOSAL_AI_PARSING_ENABLED`)
2. Use the existing AI usage tracking infrastructure (`agent_decision_logs`, `ai_usage_events`)
3. Be budget-enforced via the existing token guardrail pattern
4. Be covered by a token-conservation test suite analogous to Phase 3M TC-3M-080–088

---

## 22. Email Sending Safety Policy

Phase 3N does **not** send any email, automated or otherwise.

| Guardrail | State |
|-----------|-------|
| `EMAIL_SENDING_ENABLED` | Disabled — no change |
| `CAMPAIGN_SENDING_ENABLED` | Disabled — no change |
| Follow-up commitments | Create draft (future) — never auto-send in Phase 3N |
| Proposal capture webhook | Ingest only — no reply, no auto-response |
| Human review inbox | Display only — no send action |

Any future phase that adds automated follow-up sending must:
1. Receive explicit separate authorization
2. Implement a gated kill switch analogous to `EMAIL_SENDING_ENABLED`
3. Be smoke-tested on staging before any production rollout

---

## 23. Migration Plan (Reserved Only)

> **Migration `20240038` is reserved in the design only. No migration file exists yet.**  
> **No migration file is created during this design step.**  
> **No migration is applied during this design step.**

| Migration | Tables | Status |
|-----------|--------|--------|
| `20240038_phase3n_proposal_capture.sql` | `proposal_events`, `proposal_captures`, `proposal_follow_up_commitments` | Reserved — file does not exist |

The migration file will be created only after Phase 3N implementation is explicitly authorized.

**Application sequence (when authorized):**
1. Apply `20240038` to **local** → verify schema with `supabase db diff`
2. Apply `20240038` to **staging** (`smbausuyetlgxflyhmfg`) → smoke test UI and API shape
3. Apply `20240038` to **production** only after explicit separate authorization step

**Production migration catch-up note:** Production Supabase (`kxrplupzbsmujjznzhpy`) is currently at migration `20240034`. Migrations `20240035`, `20240036`, `20240037` have not been applied to production. The next production migration batch must be applied in strict order: 20240035 → 20240036 → 20240037 → 20240038. Each step requires verification before proceeding to the next.

Next available migration after Phase 3N: `20240039`.

---

## 24. Test Plan

### Test File

`tests/phase3n-proposal-capture.test.ts`

### Test Type Distinction

Phase 3N tests are organized into three tiers:

| Tier | Pattern | Purpose |
|------|---------|---------|
| **Source-reading tests** | `fs.readFileSync` + `toContain` | Verify file structure, exports, guardrails (LLM, sending, scope creep) |
| **Pure function tests** | Direct import + Vitest `expect` | Exercise confidence scoring, interval math, matching rules, dedup logic |
| **Server-action boundary tests** | Source-reading (actions are server-only; not imported in tests) | Verify boundary check presence, correct reason codes |

Pure function tests can import rule registry and scoring functions directly — they have no Supabase dependency and require no mocking.

### Test Categories

| Category | TC Range | Tier | Description |
|----------|----------|------|-------------|
| Migration DDL | TC-3N-001–006 | Source | `20240038` reserves correct tables, columns, indexes, RLS policies |
| Data model shape | TC-3N-007–015 | Source | All required columns present in proposed DDL |
| Server action exports | TC-3N-016–022 | Source | All required server actions exported from correct file |
| Manual capture — boundary checks | TC-3N-023–030 | Source | Tenant, workspace, future-date guard, open-proposal guard all present |
| Confidence scoring — pure | TC-3N-031–038 | Pure fn | Rule-based scoring returns correct score for each scenario; exact contact → 95; domain → 80; subject token → 60; no match → 0 |
| Confidence scoring — ambiguous | TC-3N-039–042 | Pure fn | Multiple companies with same domain → confidence capped at 65; routed to inbox |
| Matching rules — dedup | TC-3N-043–046 | Pure fn | Duplicate Message-ID within same tenant rejected; different tenant allowed |
| Matching rules — pipeline | TC-3N-047–055 | Pure fn | Waterfall order: contact email checked before domain; domain before subject |
| Open-proposal blocking | TC-3N-056–060 | Pure fn | `hasOpenProposalForLead` returns true for 'sent','viewed'; false for 'accepted','rejected','expired','withdrawn' |
| Follow-up interval math | TC-3N-061–068 | Pure fn | `standard_3_5_10` → 3 commitments at correct offsets from proposal_sent_at; correct `follow_up_sequence` values |
| Follow-up interval math — edge | TC-3N-069–073 | Pure fn | `addDays` with month boundary; leap year; end of year; `aggressive_2_4_7` intervals correct; `single_7` creates exactly 1 commitment |
| Schedule rules registry | TC-3N-074–079 | Pure fn | All 4 built-in rules present; intervals sorted ascending; no rule produces zero intervals |
| Auto-close on status transition | TC-3N-080–083 | Source | `updateProposalStatusAction` closes all open commitments when status → accepted/rejected/expired/withdrawn |
| Human review inbox page | TC-3N-084–090 | Source | Route exists; pending/unmatched filtered by deleted_at IS NULL; match/dismiss actions present |
| Lead detail page integration | TC-3N-091–097 | Source | Proposal Status card renders; "Record Proposal Sent" blocked when open proposal exists |
| Sidebar navigation | TC-3N-098–100 | Source | Proposal Inbox nav entry present in sidebar with Inbox icon |
| Permissions / tenant isolation | TC-3N-101–107 | Source | All server actions call buildRequestContext; boundary violation returns reason not 'unauthorized'; company_id re-derived from lead, not user input |
| Audit logging | TC-3N-108–113 | Source | All write actions emit activity event; all event type constants defined in types/agent.ts |
| Token/LLM guardrail | TC-3N-114–120 | Source | No LLM SDK imports in any Phase 3N file; no AI generation calls; no completion calls; no AI usage functions |
| No-send guardrail | TC-3N-121–124 | Source | No `resend.emails.send` calls; no `sendApprovedDraft` calls; `EMAIL_SENDING_ENABLED` not enabled |
| BCC ingest API shape | TC-3N-125–130 | Source | Webhook endpoint shape matches spec; HMAC verification present; dedup by (tenant_id, Message-ID) |
| Workspace isolation on ingest | TC-3N-131–135 | Source | Workspace identified by slug prefix; unknown slug routes to unmatched with workspace_id null |
| No scope creep | TC-3N-136–140 | Source | No Phase 3O features; no auto-send; no calendar_event_id in Phase 3N tables |

**Target:** 140 tests, all passing before Phase 3N implementation commit.

---

## 25. QA Checklist

### Design-Only Phase (Current)

- [x] Migration `20240038` is reserved in the design only — **no migration file exists yet**
- [x] No code has been written for Phase 3N
- [x] No migrations have been applied to any environment
- [x] Production is untouched
- [x] Vercel settings are unchanged
- [x] `EMAIL_SENDING_ENABLED` remains disabled
- [x] `CAMPAIGN_SENDING_ENABLED` remains disabled

### Pre-Commit (After Implementation Is Authorized)

- [ ] All 140 Phase 3N tests pass (`npx vitest run tests/phase3n-proposal-capture.test.ts`)
- [ ] TypeScript compiles with zero new errors (`npx tsc --noEmit`)
- [ ] No new pre-existing test file errors introduced
- [ ] `git status --short` shows only Phase 3N files (no unintended changes)
- [ ] Migration `20240038` exists in `supabase/migrations/` but has **not been applied** to any environment at commit time
- [ ] No Phase 3M, 3L, 3K, or earlier files modified

### Post-Apply Local (After Migration Applied Locally)

- [ ] `supabase db diff` shows only the three new tables and their indexes/policies
- [ ] Local app loads without errors on `/[workspaceSlug]/leads/[id]`
- [ ] "Record Proposal Sent" UI renders on lead page with no open proposal
- [ ] Submitting the form creates `proposal_events` row, `proposal_captures` row, commitment rows
- [ ] Lead page shows Proposal Status card after submission
- [ ] "Record Proposal Sent" is hidden when an open proposal event exists for the lead

### Staging Smoke Test (After Migration Applied to Staging)

- [ ] Apply `20240038` to staging (`smbausuyetlgxflyhmfg`) — verify no errors
- [ ] Log in as `staging@verian.internal`
- [ ] Navigate to a lead → Record Proposal Sent → confirm creation
- [ ] Navigate to Proposal Inbox → confirm empty state
- [ ] Navigate to `/settings/campaign-queue` → confirm Phase 3M queue still works
- [ ] Confirm no email sent during any action

### Safety Verification

- [ ] `EMAIL_SENDING_ENABLED` = false (unchanged)
- [ ] `CAMPAIGN_SENDING_ENABLED` = false (unchanged)
- [ ] No `resend.emails.send()` call in any Phase 3N file
- [ ] No LLM SDK import in any Phase 3N file
- [ ] No `openai.chat.completions.create()` or equivalent in any Phase 3N file

---

## 26. Rollout Plan

| Step | Action | Environment | Authorization Required |
|------|--------|-------------|----------------------|
| 1 | Design review + approval | — | Yes — this document |
| 2 | Implementation plan created | — | Yes — after design approval |
| 3 | Code implementation | Local | Implicit — per plan |
| 4 | Create and apply migration `20240038` | Local | Implicit |
| 5 | Run 140 tests locally | Local | Implicit |
| 6 | Commit Phase 3N implementation | Local | Explicit push approval |
| 7 | Push to origin/master | origin | Explicit |
| 8 | Apply migration `20240038` | Staging | Explicit — separate prompt |
| 9 | Staging smoke test | Staging | Implicit |
| 10 | Apply migrations 20240035–20240038 to production | Production | Explicit — separate prompt |
| 11 | Deploy to production | Production | Explicit — separate prompt |
| 12 | Production smoke test | Production | Implicit |
| 13 | Lock tag + docs update | — | Explicit |

---

## 27. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| BCC ingest not implemented → operators frustrated | Medium | Medium | Phase 3N ships the API shape as a documented endpoint; manual capture covers the gap immediately |
| Confidence scoring too aggressive → false auto-matches | Low | High | Auto-match threshold set high (85); all borderline captures route to human review |
| Stale open proposal blocking new ones | Low | Medium | Operator can close existing proposal before recording a new one; UI clearly explains the block |
| Production migration catch-up (035→036→037→038 all at once) | Low | Medium | Run in order with verification between each; test rollback on staging first |
| Follow-up commitment accumulation (many intervals × many proposals) | Low | Low | Intervals per rule capped at 3; delete cascade from proposal_events on hard delete |
| `workspace_id = null` ingest records accumulate | Low | Low | Platform admin inbox cleanup deferred to future; dismiss action soft-deletes |
| Phase 3N adds LLM scope-creep during implementation | Low | High | TC-3N-114–120 guardrail tests enforce no LLM imports or calls |
| RLS policy type mismatch (uuid vs text) | Low | High | Use `tenant_id::text = auth.jwt() ->> 'tenant_id'` per updated policy examples; verify against an existing migration pattern before implementing |
| Weekend/timezone mismatch in follow-up dates | Low | Low | Phase 3N uses UTC calendar days; timezone-aware scheduling deferred to Phase 4; users informed via UI |
| Duplicate capture records from BCC + forward of same email | Low | Low | `(tenant_id, raw_message_id)` unique index deduplicates; the second insert fails gracefully with a constraint error handled in the webhook |

---

## 28. Future Enhancements

| Enhancement | Phase |
|-------------|-------|
| Automated follow-up draft creation from open commitment | Phase 3O or 3P |
| Calendar event creation from `follow_up_due_at` | Phase 4 — via `calendar_event_id` on `proposal_follow_up_commitments` in a dedicated migration |
| Live BCC/forward ingest via SendGrid Inbound Parse or Postmark | Phase 3O+ |
| Microsoft Graph Outlook sync | Phase 4+ |
| AI-assisted contact disambiguation (gated behind `PROPOSAL_AI_PARSING_ENABLED`) | Phase 3O+ |
| Proposal status history table (`proposal_status_history`) | Phase 4+ |
| Proposal analytics dashboard (sent, accepted, rejection rate, avg time to close) | Phase 3P+ |
| `workspace_settings.default_proposal_schedule_rule` configurable via UI | Phase 3O |
| Proposal-level email open tracking (pixel) | Phase 4+ |
| Multi-proposal / revision tracking (v2, v3 of same proposal; concurrent proposals per company) | Phase 4+ |
| Timezone-aware follow-up scheduling | Phase 4 |
| Weekend-skip follow-up scheduling | Phase 4 |

---

## 29. Open Questions

| # | Question | Owner | Priority |
|---|----------|-------|----------|
| 1 | Should follow-up schedule rule be configurable per workspace in Phase 3N, or always use default `standard_3_5_10`? | Product | Medium — Phase 3N defaults to `standard_3_5_10` hardcoded |
| 2 | Should `proposal_amount` be required or optional? If optional, should the UI nudge the operator to fill it? | Product | Low — currently optional |
| 3 | Should a "viewed" status be recordable manually, or only via future tracking pixel? | Product | Low — currently only future tracking |
| 4 | Should `proposal_follow_up_commitments` be surfaced in the Campaign Work Queue, or a separate Proposal Queue view? | Product | Medium |
| 5 | Is the ingest webhook MVP using SendGrid Inbound Parse, Postmark Inbound, or a custom MX? | Engineering | High — blocks Phase 3N BCC implementation |
| 6 | Should production migrations 20240035–20240037 be applied as a batch before Phase 3N production deploy? | Engineering | High — required before production rollout |
| 7 | Should proposal events be visible in the LeadActivityTimeline (Phase 3F), or only in a dedicated Proposal section? | Product | Medium |
| 8 | Should `opportunity_id` be settable via the manual capture form, or populated only programmatically? | Product | Low — optional field; UI decision deferred |
| 9 | Is `estimated_savings` the right terminology, or should it be `projected_roi` or `savings_amount`? | Product | Low — field is optional; label can be adjusted |

> **Resolved (Codex rev 2):** One open proposal per lead at a time is the Phase 3N MVP decision. Multi-proposal/revision tracking is Phase 4+. This was an open question in rev 1 — it is now a decided constraint enforced by the server action and documented in Section 7.

---

## 30. Recommended Implementation Slices

Phase 3N is recommended to be implemented in the following sequence. Each slice is independently committable.

### Slice 1 — Data Model Only
- Write migration `20240038` (tables, indexes, RLS — using `tenant_id::text = auth.jwt() ->> 'tenant_id'`)
- Extend `types/database.ts` with `proposal_events`, `proposal_captures`, `proposal_follow_up_commitments` Row/Insert/Update types
- Write repository functions: `createProposalEvent`, `getOpenProposalEventForLead`, `createProposalCapture`, `createFollowUpCommitments`, `getPendingCapturesForWorkspace`
- Write pure function: `hasOpenProposalForLead(events: ProposalEventRow[]): boolean`
- Write source-reading tests for migration DDL and type presence (TC-3N-001–015)

### Slice 2 — Confidence Scoring, Matching Rules, Schedule Registry
- Write `modules/proposals/lib/confidence-scoring.ts` — pure functions, no Supabase dependency
- Write `modules/proposals/lib/schedule-rules.ts` — rule registry, pure `getFollowUpScheduleRule(key)`
- Write `modules/proposals/lib/date-math.ts` — `addDays(date, days): Date` (UTC calendar days)
- Write pure function tests (TC-3N-031–083) — these can run without Supabase

### Slice 3 — Manual Capture Server Action
- Write `createManualProposalCaptureAction` with all boundary checks
- Write `updateProposalStatusAction` (accepted/rejected/expired/withdrawn) with commitment auto-close
- Write source-reading tests for actions (TC-3N-016–030, TC-3N-080–083)

### Slice 4 — Lead Detail Page UI
- Add "Record Proposal Sent" card to lead detail page
- Add Proposal Status card (visible when open proposal exists)
- Reuse existing `useTransition` + `router.refresh()` pattern
- Write tests TC-3N-091–097

### Slice 5 — Proposal Inbox UI
- New page `/[workspaceSlug]/settings/proposal-inbox`
- Sidebar nav entry (TC-3N-098–100)
- `matchCaptureToLeadAction`, `dismissCaptureAction`
- Write tests TC-3N-084–090, TC-3N-101–113

### Slice 6 — BCC/Forward Ingest API Shape
- Write `POST /api/webhooks/proposal-capture` route (returns 501 Not Implemented until ingest infrastructure is provisioned)
- Write HMAC verification utility
- Write ingest parsing functions (deterministic, no LLM)
- Write tests TC-3N-114–140

### Slice 7 — Polish and Lock
- Run full 140-test suite
- TypeScript compile check
- Update `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md`
- Commit, tag, push

---

*Phase 3N design revised (rev 2, Codex review). Awaiting authorization to proceed to implementation plan.*
