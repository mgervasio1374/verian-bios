# Phase 3G — Agent Operations Readiness & Control Map
## Design Document v1.0

**Status:** Proposed — awaiting user approval before implementation planning begins
**Depends on:** Phase 3F complete and production-deployed (`f43f797`, tag `phase-3f-workflow-execution-visibility-v1`)
**Next migration available:** `20240033`
**Author:** AI context recovery — 2026-05-27

---

## Purpose

This document is not a conventional implementation phase. It is a **control map** — a structured audit of the current agent landscape, the gaps between where the system is and where it needs to be before live automated sending can safely expand, and a proposed roadmap of the discrete phases that will close those gaps.

Phase 3G defines the safe operating model. No agent sends a real email without clearing every gate described here.

---

## 1. Agent Inventory

### 1.1 Agents That Exist and Run Code

| Agent | Location | Trigger | LLM? | Writes to |
|-------|----------|---------|------|-----------|
| Lead Scoring Pipeline | `modules/intelligence/services/fit-score.service.ts`, `urgency-score.service.ts` | `lead.created` event (Inngest: `on-lead-created.ts`) | No — rule-based | `fit_scores`, `urgency_scores` |
| Recommendation Generator (lead) | `modules/intelligence/services/recommendation.service.ts` | After scoring, inside `on-lead-created.ts` | No — rule-based | `agent_recommendations` |
| Auto-Draft Creator | `modules/messaging/services/email-draft.service.ts` `createLeadEmailDraft()` | After recommendation, inside `on-lead-created.ts` | No — template-based | `email_drafts`, `approval_requests` |
| Message Strategy Agent | `modules/messaging/strategy/` | Manual trigger from message workspace | Yes | `message_strategies` |
| Copywriting Agent | `modules/messaging/copywriting/` | After message strategy, in message workspace | Yes | `message_versions` |
| Quality Review Agent (QRA) | `modules/messaging/quality-review/` | After version generation, in message workspace | Yes (rubric scoring) | `quality_reviews` |
| Human Review Bridge (HRB) | `modules/messaging/human-review/` | Operator action in message workspace | No — human gate | `message_versions`, `activity_events` |
| Send Bridge (SEB) | `modules/messaging/send-bridge/` | After HRB approval, operator clicks "Create Email Draft" | No | `email_drafts`, `approval_requests` |
| Email Quality Reviewer | `modules/messaging/services/email-quality.service.ts` | After draft creation | No — rubric-based | `email_quality_reviews` |
| Learning Agent | `modules/messaging/learning-agent/` | Daily cron 06:00 UTC + manual button | No — statistical | `learning_snapshots` (advisory) |
| System Intelligence Rec Generator | `modules/intelligence/system-recommendation/` | Manual button (System Intelligence page) | No — threshold-based | `agent_recommendations` |
| Data Import Pipeline | `modules/imports/` | Operator uploads file | No | `import_batches`, `import_rows`, then `companies`, `contacts`, `leads` |
| Outbox Dispatcher | `inngest/functions/dispatch-outbox.ts` | Cron `*/30 * * * *` | No | `workflow_events_outbox` (marks dispatched) |
| SEB Reconciler | `inngest/functions/reconcile-send-bridge-stuck-drafts.ts` | Cron `*/15 * * * *` | No | `email_drafts` (State C auto-fix only) |

### 1.2 Agents That Are Referenced but Not Yet Built

| Agent | Why Needed | Status |
|-------|-----------|--------|
| Campaign Assignment Agent | Assigns leads to multi-email sequences | Not started. No `campaigns` table exists. |
| Follow-up Scheduling Agent | Schedules the next contact after an email send/non-reply | Not started. No follow-up logic anywhere in codebase. |
| Reply Detection Agent | Detects when a lead replies, pauses campaign | Not started. Resend webhook has no `email.replied` event mapping. |
| Email Throttle Controller | Enforces per-tenant or per-campaign send rate limits | Partially started: `rate-limit.service.ts` exists but per-campaign limits are not implemented. |

### 1.3 What Each Agent Is Allowed to Do

| Agent | Allowed Actions |
|-------|----------------|
| Lead Scoring Pipeline | Read lead/contact/company data; write fit/urgency score rows; emit scoring activity event |
| Recommendation Generator | Read scores; write recommendation row (supersedes prior pending row for same subject); emit recommendation activity event |
| Auto-Draft Creator | Read lead/contact/template/sender; write `email_drafts` + `approval_requests`; supersede prior pending drafts; emit activity event |
| Message Strategy Agent | Read lead/company context; call external LLM; write `message_strategies` |
| Copywriting Agent | Read strategy; call external LLM; write `message_versions` |
| QRA | Read versions + send history; score rubric (may call LLM); write `quality_reviews` |
| HRB | Read versions/quality reviews; operator updates version status; write HRB activity events |
| SEB | Read approved version; write `email_drafts` + `approval_requests`; supersede pending drafts |
| Email Quality Reviewer | Read draft; score rubric; write `email_quality_reviews` |
| Learning Agent | Read activity events + versions; write `learning_snapshots` (advisory=true enforced at DB level); emit LA activity event |
| System Intelligence Generator | Read error counts + health metrics; write `agent_recommendations`; dedup against pending recs |
| Data Import Pipeline | Read uploaded file; write `import_batches` + `import_rows`; on commit: write `companies`, `contacts`, `leads` |

### 1.4 What Each Agent Is NOT Allowed to Do

| Agent | Prohibited Actions |
|-------|-------------------|
| All agents | Send emails autonomously. All sends must go through `sendApprovedDraft()` with explicit human trigger. |
| All agents | Bypass `requirePermission()` checks. |
| All agents | Write across tenants. Every query must include `.eq('tenant_id', tenantId)`. |
| All agents | Modify production Supabase outside of defined repo functions. |
| Learning Agent | Take automated action based on signals. Advisory only — no sends, no draft modifications, no recommendation writes. |
| System Intelligence Generator | Auto-resolve errors or auto-send based on recommendations. Advisory only. |
| QRA | Send emails directly. May recommend a version; human must still approve and trigger send. |
| Auto-Draft Creator | Send emails. Creates `email_drafts` in `pending_approval` status only. |
| SEB | Auto-send. Creates `email_drafts` in `pending_approval` status only. Approval is auto-resolved by HRB approval — but send is still a separate manual action. |
| Outbox Dispatcher | Create new outbox events. Only dispatches what is already queued. |
| SEB Reconciler | Fix State A or B stuck drafts (report-only). May only auto-fix State C (approved Phase 3B draft with unsuperseded pending siblings). |

---

## 2. Decision Lifecycle

The following maps every major decision point in the current system and identifies which are automated, which require human input, and which are not yet implemented.

### 2.1 Lead Selection
**Current state:** Leads enter via three paths:
1. Manual creation (UI form → `leadService.createLead()`)
2. Bulk import (CSV/XLSX → import pipeline → `leads` rows with `status='imported_unreviewed'`, `workflow_enabled=false`)
3. Statement submission (Phase 4 — separate flow)

**Gap:** No campaign assignment. All leads are independent. No mechanism to enroll a lead in a multi-step outreach sequence. No lead-to-campaign mapping table exists.

### 2.2 Lead Scoring
**Current state:** Automatic on `lead.created` (Inngest: `on-lead-created.ts`). Manual re-score via button on lead detail page. Rule-based — no LLM.

**Gap:** Re-scoring does not trigger a new recommendation or draft. Scoring and recommendation generation are coupled only at lead creation. If a lead's data changes (stage, value, priority), scores update but the recommendation does not automatically regenerate.

### 2.3 Recommendation Generation
**Current state:** Automatic on `lead.created` (inside `on-lead-created.ts`, after scoring). On-demand via System Intelligence page for system-level recs. Rule-based — no LLM.

**Gap:** Lead-level recommendation regeneration is not wired to scoring updates. If a lead moves stages, the old recommendation persists as "pending" until superseded by a new one.

### 2.4 Message Strategy
**Current state:** Manual trigger from message workspace (`/message-workspace/[leadId]`). Generates a strategy using the Message Strategy Agent (LLM-powered). Results stored in `message_strategies`.

**Gap:** Message strategy is **not called** by `on-lead-created.ts`. The auto-draft path uses template slugs directly. The Phase 3B pipeline (Message Strategy → Copywriting → QRA → HRB → SEB) is a **parallel disconnected path** from the automatic draft creation path. These two paths are never integrated.

> **Critical architectural gap:** A lead created today may receive an automatically-generated template draft (Phase 3A path) OR a Phase 3B LLM-generated draft (if an operator manually runs the Phase 3B pipeline). There is no single unified draft creation lifecycle.

### 2.5 Draft Creation
**Current state:** Two disconnected paths:

| Path | Trigger | LLM? | Draft type |
|------|---------|------|-----------|
| Auto (Phase 3A) | `on-lead-created.ts` | No — template | `email_drafts` via template slug |
| Phase 3B | Operator runs Message Workspace → SEB | Yes — Copywriting Agent | `email_drafts` via approved `message_version` |

**Gap:** The auto path bypasses all Phase 3B intelligence. The Phase 3B path requires manual operator steps. Neither path knows about the other.

### 2.6 Rewrite / Version Generation
**Current state:** Copywriting Agent generates versions. QRA scores + ranks them. Operator selects best version via HRB. Rewrite is a Phase 3B manual flow only.

**Gap:** No automatic rewrite on quality failure. If the auto-path draft scores poorly in email quality review, there is no trigger to request a rewrite. The rewrite loop requires operator intervention.

### 2.7 Quality Review
**Current state:** `email-quality.service.ts` scores a draft after creation (rubric-based). QRA (`quality-review/`) scores versions in the Phase 3B path. Both write to separate tables (`email_quality_reviews` vs `quality_reviews`).

**Gap:** Two quality review systems with different data models, different tables, and different display surfaces. They are not unified. The auto-path draft gets `email_quality_reviews`; the Phase 3B path versions get `quality_reviews`. The lead detail page renders `email_quality_reviews` (auto-path); the message workspace renders `quality_reviews` (Phase 3B path).

### 2.8 Human Approval
**Current state:**
- Auto-path: `approval_requests` created with `status='pending'` by `email-draft.service.ts`. Operator approves via send action (or HRB actions in the message workspace).
- Phase 3B path: HRB provides approve/reject/select/regenerate/return-to-strategy actions.

**Gap:** The auto-path approval workflow is thin — there is no dedicated approval UI on the lead detail page other than the send button. There is no "reject this draft and request a rewrite" action on the lead detail page itself. Rejection requires navigating to the message workspace.

### 2.9 Send Readiness
**Current state:** `sendApprovedDraft()` enforces 8 gates before calling Resend:
1. Permission: `messaging.send_emails`
2. Draft ownership (tenant + workspace)
3. **Dual status gate:** `draft.status='approved'` AND `approval_request.status='approved'`
4. Idempotency (block if `email_sends` row already exists for this draft)
5. Recipient validation (email present, `do_not_contact=false`)
6. Suppression: unsubscribes + suppression_rules (email + domain)
7. Rate limit
8. Sender identity exists

**Gap:** There is no check for `workflow_enabled` at send time. A lead could have `workflow_enabled=false` and still receive a send if an operator manually triggers it. The `workflow_enabled` flag gates the cron-driven dispatch, not manual sends. Whether this is intentional or a gap needs to be clarified.

### 2.10 Send Execution
**Current state:** `sendApprovedDraft()` calls Resend SDK. Creates `email_sends` record. Emits `ET_SEND_INITIATED` + `ET_SEND_SUCCEEDED` (or `ET_SEND_FAILED`). All non-fatal.

**Gap:** `email_sends` has no `lead_id` column. Attribution from send → lead requires `email_sends.draft_id → email_drafts.lead_id`. Any analytics query linking sends to leads requires a join through `email_drafts`.

### 2.11 Webhook Confirmation
**Current state:** Resend webhook handler at `/api/webhooks/resend` processes: delivered, bounced, complained, failed, opened, clicked. Emits `ET_EMAIL_DELIVERED`, etc. Deduplicates via `provider_event_id`. Updates `email_sends.status`. Complaint → auto-unsubscribe.

**Gap:** `email.delivery_delayed` is log-only — no activity event emitted. No structured error created for repeated delays. No re-queue or retry triggered for `email.failed`.

### 2.12 Follow-up Scheduling
**Current state:** **Not implemented.** No follow-up logic exists anywhere in the codebase. There is no table for scheduled follow-ups, no cron for triggering them, and no agent that plans a follow-up based on non-reply, bounce, or delivery confirmation.

**Gap:** This is the largest missing capability in the current system. After a lead receives an email:
- If delivered + no reply: no next action is scheduled
- If bounced: no alternative is attempted
- If opened but no reply: no follow-up is created
- If complained: unsubscribe happens, but no other action

---

## 3. Human Approval Gates

### 3.1 Gates That Currently Require Human Action

| Gate | Mechanism | Required by law / safety |
|------|-----------|--------------------------|
| Email draft approval | Operator clicks send (or approves via HRB) | Yes — critical |
| Version selection (Phase 3B) | HRB: operator selects which version to send | Yes |
| Version approval (Phase 3B) | HRB: approve specific version | Yes |
| Acknowledge risk + approve | HRB: override high-risk version with explicit acknowledgement | Yes |
| System error resolution | System Intelligence: Resolve / Investigate / Ignore | Operational |
| Import commit approval | Import batch: Approve & Commit button | Yes — data integrity |

### 3.2 Steps That Are Currently Automatic

| Step | Agent | Risk level |
|------|-------|-----------|
| Lead scoring | Lead Scoring Pipeline | Low — read-only + score persistence |
| Recommendation generation | Recommendation Generator | Low — advisory only |
| Auto-draft creation | Auto-Draft Creator | Medium — creates pending_approval draft |
| Email quality review | Email Quality Reviewer | Low — read-only assessment |
| SEB reconciliation (State C only) | SEB Reconciler | Low — supersedes stuck siblings only |
| Learning agent run (scheduled) | Learning Agent | Low — advisory snapshots only |
| Outbox dispatch | Outbox Dispatcher | Low — only dispatches queued events |

### 3.3 Steps That Must Never Be Automatic in v1

| Step | Reason |
|------|--------|
| Send execution | Uncontrolled sending would violate CAN-SPAM, GDPR, and user trust |
| Bulk send | No mechanism for per-lead review at scale |
| Follow-up scheduling | No campaign assignment or cadence model yet defined |
| Complaint handling (beyond unsubscribe) | Manual escalation required |
| Error auto-resolution | Silent auto-resolution could mask real issues |
| Version selection for send | Human must verify content before sending |
| Reply handling | No reply detection mechanism exists |
| Suppression list modifications (other than complaint auto-unsubscribe) | Manual approval required |

---

## 4. Email Engine Redesign Boundary

### 4.1 What Is Broken or Weak

| Issue | Location | Severity |
|-------|----------|---------|
| Two disconnected draft creation paths (auto template vs. Phase 3B LLM) | `email-draft.service.ts` + `on-lead-created.ts` vs. message workspace | High |
| No campaign concept or multi-email sequence model | Entire codebase | High |
| No follow-up scheduling | Entire codebase | High |
| No reply detection | Webhook handler + codebase | High |
| `email_sends` has no `lead_id` column | `email_sends` schema | Medium — analytics workaround in place |
| Template-to-recommendation rule mapping hardcoded in service | `email-draft.service.ts` | Medium |
| Auto-path approval request is auto-resolved by SEB (draft immediately `approved`) | `send-bridge.service.ts` | Medium — intentional but creates dual send paths |
| No per-campaign rate limiting | `rate-limit.service.ts` | Medium |
| `email.delivery_delayed` produces no structured error or activity event | Webhook handler | Low |
| `sendApprovedDraft` does not check `workflow_enabled` | `email-send.service.ts` | Needs clarification |
| Quality review split across two tables with different data models | `email_quality_reviews` (auto) vs `quality_reviews` (Phase 3B) | Medium |

### 4.2 What Should Be Redesigned (Future, Not Phase 3G)

The following items are out of scope for Phase 3G. They require dedicated phases:
- Unified draft creation pipeline (merge auto-path and Phase 3B path)
- Campaign data model (`campaigns`, `campaign_assignments`, `campaign_steps` tables)
- Follow-up scheduler (Inngest cron + campaign cadence engine)
- Reply detection (email header parsing or Resend reply webhooks)
- `email_sends.lead_id` column addition (migration `20240033` candidate)
- Unified quality review data model
- Campaign-aware rate limiting

### 4.3 Phase 3G Does NOT Implement the Redesign

Phase 3G defines the boundaries, identifies the gaps, and proposes the decomposed work. It does not implement any of the above. Each item becomes a future phase after Phase 3G is approved and locked.

---

## 5. Campaign Assignment Model

### 5.1 Current State

No campaign model exists. Key facts:
- No `campaigns` table in the schema
- No `campaign_assignments` table
- No campaign-level sequence tracking
- Each `email_drafts` row is independent
- Each `workflow_runs` row is for a single event (e.g., `lead.created`), not a multi-step sequence
- The Learning Agent computes signals across all sends but does not influence campaign cadence

### 5.2 Proposed Model (Design, Not Implementation)

A future campaign assignment model should define:

**Campaign:** A named outreach sequence with ordered steps (Step 1: initial email, Step 2: follow-up after 3 days, Step 3: second follow-up after 7 days, etc.).

**Campaign Assignment:** A lead enrolled in a campaign at a specific step, with a current status (active / paused / completed / failed).

**Cadence:** The delay between steps, pause conditions, and completion conditions.

**What stops a campaign:**
- Lead replies → pause, mark for human review
- Lead unsubscribes / complaint → stop immediately, mark do_not_contact
- Lead bounces (permanent) → stop, mark email invalid
- Operator manually disables workflow (`workflow_enabled=false`) → pause
- Operator explicitly cancels campaign assignment
- Lead stage changes to closed_won or closed_lost → stop

**What does NOT stop a campaign automatically (v1):**
- Lead opens email (track only)
- Lead clicks link (track only, notify operator)
- No reply after delivery (triggers follow-up, not stop)

### 5.3 Campaign Safety Constraints

- No campaign can send more than one email per lead per 24 hours
- No campaign step can auto-send; every step must go through the human approval gate
- Campaign enrollment must be operator-approved (not auto-enrolled on lead creation)
- Every campaign step pause/stop must emit an activity event with reason

---

## 6. Resend Readiness

### 6.1 Current State

| Item | Status |
|------|--------|
| Resend SDK integrated | Yes |
| Webhook handler live | Yes |
| Signature verification | Yes (`RESEND_WEBHOOK_SECRET`) |
| Event types handled | delivered, bounced, complained, failed, opened, clicked |
| `RESEND_API_KEY` on staging | Dummy value — sending disabled |
| `RESEND_API_KEY` on production | Real key — sends would go out if `sendApprovedDraft()` is triggered |
| Suppression list | Yes — `unsubscribes` + `suppression_rules` tables |
| Rate limiting | Yes — `rate-limit.service.ts` (per-recipient) |
| Global kill switch | `SystemControlKey.EMAIL_SENDING_ENABLED` exists (must verify it is checked in `sendApprovedDraft`) |
| Unsubscribe link in emails | Needs verification — not confirmed in template rendering |
| Test flow for end-to-end send | Not yet run |
| Complaint auto-unsubscribe | Yes |

### 6.2 Required Before Enabling Live Sending

The following must be true before any real email is sent to a real lead:

| Requirement | Owner | Status |
|-------------|-------|--------|
| `RESEND_API_KEY` configured (production) | Infrastructure | Done — real key exists |
| `RESEND_WEBHOOK_SECRET` configured (production) | Infrastructure | Needs verification |
| All 6 webhook event types emit activity events | `route.ts` | Done for delivered/bounced/complained/failed/opened/clicked |
| `email.delivery_delayed` creates structured error after N delays | `route.ts` | Not done |
| Unsubscribe link present in every outgoing email | Template layer | Needs verification |
| Suppression check covers all suppression types | `email-send.service.ts` | Needs verification |
| Global kill switch (`EMAIL_SENDING_ENABLED`) verified to gate `sendApprovedDraft` | `email-send.service.ts` | Needs verification |
| Per-send audit trail: reason, operator, lead, draft, version | `email_sends` + `activity_events` | Partially done (Phase 3B attribution) |
| End-to-end test: create lead → score → draft → approve → send → webhook → confirm | Manual + staging | Not run |
| Staging smoke test with real Resend test key | Staging | Not done |

### 6.3 Required Webhook Events (All Must Be Handled)

| Event | Current handling | Gap |
|-------|-----------------|-----|
| `email.delivered` | Status update + ET_EMAIL_DELIVERED | None |
| `email.bounced` | Status update + ET_EMAIL_BOUNCED | No structured error created |
| `email.complained` | Status update + ET_EMAIL_COMPLAINED + auto-unsubscribe | No alert to operator beyond System Intelligence |
| `email.failed` | Status update + ET_EMAIL_DELIVERY_FAILED | No retry trigger, no structured error |
| `email.opened` | ET_EMAIL_OPENED (no status change) | None |
| `email.clicked` | ET_EMAIL_CLICKED (no status change) | None |
| `email.delivery_delayed` | Log-only | No activity event, no structured error, no alert |

---

## 7. Observability and Audit Trail

### 7.1 What Must Be Logged (Currently Missing or Incomplete)

| Decision | Current logging | Gap |
|----------|----------------|-----|
| Why a specific template was selected for a lead | None — `createLeadEmailDraft` logs the template slug but not the reasoning | Agent decision log needed |
| Why a specific recommendation was generated | `agent_recommendations.reasoning` field exists | Good |
| Why scoring produced a specific score | `fit_scores.reasoning` + `urgency_scores.reasoning` exist | Good |
| Which version was selected and why | `HRB_ACTION_SELECTED` activity event exists | Good |
| Why a send was blocked by a safety gate | `email_sends.status='failed'` but no reason stored | Need failure reason field |
| Which operator approved which draft | `approval_requests.approved_by` + `approval_requests.decided_at` | Good |
| Which operator triggered a manual send | `email_sends` has no `triggered_by` field | Gap |
| Why a structured error was created | `automation_failures.context` JSONB | Good |
| Whether `EMAIL_SENDING_ENABLED` was checked at send time | Not logged | Gap |

### 7.2 What Should Be Visible on Lead Detail

Currently visible (Phase 3F):
- Workflow activity timeline (18 event types)
- Email draft history
- Workflow errors panel (linked automation_failures)
- Current draft + quality review
- Scores + recommendation

Missing from lead detail:
- Agent decision log (why did the auto-path pick this template? what recommendation rule matched?)
- All historical recommendations (not just pending/accepted)
- Campaign membership (not applicable yet — no campaign model)
- Follow-up schedule (not applicable yet)
- Send rate / throttle state

### 7.3 What Should Be Visible in System Intelligence

Currently visible:
- Open and investigating structured errors
- System recommendations
- Error detail page with full `automation_failures` metadata

Missing:
- Per-lead send rate (how many emails sent to this lead this week?)
- Global send volume dashboard
- Webhook health (delivery rates, bounce rates, complaint rates)
- Agent run log (what agents ran in the last 24h, success/failure counts)

### 7.4 What Should Be Visible in Analytics

Currently visible (Phase 3D):
- Lead Pipeline (by stage, counts)
- Email Performance (30-day send/delivery/bounce/complaint rates)
- Strategy Performance (learning signal table)

Missing:
- Per-campaign performance (not applicable yet)
- Follow-up effectiveness (not applicable yet)
- Time-to-send (draft created → sent)
- Approval rate (drafts created vs. drafts sent)
- Send volume over time (trend chart)

---

## 8. Safety Model

### 8.1 Implemented Safety Controls

| Control | Implementation |
|---------|---------------|
| No uncontrolled sending | `sendApprovedDraft()` — 8 mandatory gates; cannot be bypassed by any agent |
| No silent retries | Outbox dispatcher has 5-attempt max; final failure creates structured error |
| No bulk sends | No bulk send pathway exists; every send is per-draft per-lead |
| Tenant isolation | `.eq('tenant_id', tenantId)` on all queries in all repos |
| Suppression list | `unsubscribes` + `suppression_rules` checked at send time |
| Complaint auto-unsubscribe | Webhook handler upserts unsubscribe on `email.complained` |
| Idempotent sends | `email_sends` unique constraint prevents duplicate sends for same draft |
| Dual status gate | Draft AND approval request must both be `approved` |
| Global kill switch | `SystemControlKey.EMAIL_SENDING_ENABLED` (must verify enforcement in send path) |
| Structured error logging | `automation_failures` captures all workflow and outbox failures |
| Advisory-only learning | `learning_snapshots.advisory = true` enforced at DB constraint level |

### 8.2 Safety Controls That Need Verification or Strengthening

| Control | Current state | Required action |
|---------|--------------|-----------------|
| `EMAIL_SENDING_ENABLED` enforcement | Exists in `system_controls` table; unclear if checked in `sendApprovedDraft` | Verify and add check if missing |
| Unsubscribe link in outgoing emails | Unclear — not visible in template rendering | Verify template system includes required link |
| Per-tenant send rate limit | `rate-limit.service.ts` exists; per-campaign limit unclear | Define and test limit values |
| Send failure reason logging | `email_sends.status='failed'` but reason not stored | Add `failure_reason` field |
| `workflow_enabled` check at send time | Not present in `sendApprovedDraft()` | Decide: should `workflow_enabled=false` block manual sends? |
| Operator attribution on send | No `triggered_by` on `email_sends` | Add field for auditability |
| Bounce handling after send | `email.bounced` updates status but no structured error or alert | Create structured error on permanent bounce |
| Complaint alert path | Auto-unsubscribe happens but no operator alert | Emit structured error with severity `error` on complaint |

### 8.3 Controls That Must Be Added Before Live Sending

| Control | Phase |
|---------|-------|
| `EMAIL_SENDING_ENABLED` enforcement verified and tested | Phase 3H |
| Unsubscribe link confirmed in all outgoing emails | Phase 3H |
| Permanent bounce creates structured error (severity `error`) | Phase 3H |
| Complaint creates structured error (severity `critical`) | Phase 3H |
| Send failure reason stored on `email_sends` | Phase 3H |
| End-to-end send test on staging with real Resend test key | Phase 3H |

---

## 9. Proposed Roadmap After Phase 3G

Phase 3G is this document. The following phases close the gaps identified above. Each requires a standard Design → Implementation Plan → Code → QA sequence.

### Phase 3H — Send Safety Hardening

**Scope:** Close the Resend readiness gaps identified in Sections 6 and 8. No new features — safety-only.

**Deliverables:**
- Verify and enforce `EMAIL_SENDING_ENABLED` system control in `sendApprovedDraft()`
- Add `failure_reason` column to `email_sends` (migration `20240033`)
- Add `triggered_by` column to `email_sends` (same migration)
- Permanent bounce (`email.bounced` with bounce type `permanent`) → create structured error severity `error`
- Complaint (`email.complained`) → create structured error severity `critical`
- `email.delivery_delayed` after N events → create structured error severity `warning`
- Verify unsubscribe link presence in email templates
- End-to-end staging smoke test with real Resend test key (staging only; production sending remains off)

**Migration:** `20240033` — `ALTER TABLE email_sends ADD COLUMN failure_reason text, ADD COLUMN triggered_by text`

**Gate:** Does not enable live production sending. Staging-only verification.

### Phase 3I — Agent Decision Log

**Scope:** Persist why each agent made each decision, visible on the lead detail page and System Intelligence.

**Deliverables:**
- New `agent_decisions` table (migration `20240034`): `id, tenant_id, lead_id, agent_name, decision_type, input_snapshot JSONB, output_snapshot JSONB, reasoning text, created_at`
- Write decision log entries from: auto-draft creation (template selected, rule matched), recommendation generation (rule matched, score inputs), scoring (dimension breakdown captured in existing fields but add decision row)
- Lead detail page: "Agent Decision History" panel (read-only, shows recent decisions)
- System Intelligence: link from structured error to triggering agent decision

**Migration:** `20240034`

### Phase 3J — Email Engine Unified Draft Path

**Scope:** Merge the auto-path and Phase 3B path into a single unified draft creation lifecycle.

**Deliverables:**
- Remove direct template-slug mapping from `on-lead-created.ts` auto-path
- Route auto-path through Message Strategy Agent → Copywriting Agent → QRA → HRB
- Unified draft creation: one entry point, one approval flow, one send path
- This is the largest and most complex phase — may need to be split into 3J.1 / 3J.2

**Migration:** None anticipated (schema exists)

### Phase 3K — Campaign Assignment Model

**Scope:** Define and implement the campaign data model. Assign leads to campaigns. Track cadence.

**Deliverables:**
- New tables: `campaigns`, `campaign_assignments`, `campaign_steps` (migration `20240035`)
- Campaign creation UI (basic: name + steps + delay config)
- Lead enrollment: operator assigns lead to campaign
- Cadence engine: Inngest cron that checks for due campaign steps and creates next draft
- Campaign stop conditions: reply, unsubscribe, complaint, `workflow_enabled=false`, stage closed

**Migration:** `20240035`

### Phase 3L — Follow-up Scheduling

**Scope:** After a send, schedule the next contact if no reply within N days.

**Deliverables:**
- Follow-up event type in `activity_events`
- Inngest cron: check for sent leads with no reply after configurable days (default: 3 days)
- Follow-up draft creation: same pipeline as Phase 3J unified path
- Operator notification: follow-up draft created, requires approval

**Dependency:** Requires Phase 3J (unified draft path) and Phase 3K (campaign model)

### Phase 3M — Live Pilot

**Scope:** Enable real Resend sending for a single tenant on production for a controlled pilot.

**Deliverables:**
- `EMAIL_SENDING_ENABLED` turned on for pilot tenant only (via `system_controls` row)
- Pilot monitoring dashboard (webhook delivery rates, bounce rates, complaint rates)
- Operator alert channel for complaints and permanent bounces
- Go/no-go criteria defined before pilot begins
- Rollback procedure documented

**Gate:** Phase 3H, 3I, 3J, 3K must all be complete before this phase.

---

## 10. Recommended Pause Milestone

**Milestone: System Verified for Controlled Live Sending**

This milestone is the checkpoint where automated sending may begin on production for real leads. It is only reached when ALL of the following are true:

### Technical gates (all must be ✓)

| Gate | Phase |
|------|-------|
| `EMAIL_SENDING_ENABLED` enforcement verified in `sendApprovedDraft()` | 3H |
| Permanent bounce → structured error (severity `error`) | 3H |
| Complaint → structured error (severity `critical`) | 3H |
| `email_sends.failure_reason` populated on failed sends | 3H |
| `email_sends.triggered_by` populated on all sends | 3H |
| Unsubscribe link confirmed in all outgoing emails | 3H |
| End-to-end staging test with real Resend test key passed | 3H |
| Agent Decision Log live and visible on lead detail | 3I |
| All agent decisions persisted with input/output snapshots | 3I |
| Unified draft creation path (Phase 3B pipeline, not template slugs) | 3J |
| Campaign assignment model live (basic) | 3K |
| Campaign stop conditions enforced (unsubscribe, complaint, bounce) | 3K |

### Operational gates (all must be ✓)

| Gate | Owner |
|------|-------|
| Operator designated as pilot contact (receives complaint/bounce alerts) | User |
| Suppression list verified for pilot leads | User |
| Pilot tenant identified and configured | User |
| Go/no-go criteria agreed before enabling `EMAIL_SENDING_ENABLED` | User |
| Rollback procedure documented and tested | User |

### What is still manual at this milestone

- Every email send must be manually triggered by an operator
- Every campaign step requires operator approval
- Follow-up scheduling is advisory until Phase 3L is complete
- No bulk sends without operator review

---

## Scope Summary

### In-Scope for Phase 3G

- This design document
- Codebase audit (completed above)
- Gap identification (completed above)
- Proposed roadmap phases 3H → 3M
- Safety model verification checklist
- Recommended pause milestone definition

### Out-of-Scope for Phase 3G

- Any code changes
- Any migrations
- Any Resend configuration changes
- Any production changes
- Implementation of any of the roadmap phases

### Risks

| Risk | Severity | Mitigation |
|------|---------|-----------|
| Two disconnected draft paths create inconsistent lead state | High | Phase 3J unification must happen before live pilot |
| `EMAIL_SENDING_ENABLED` not actually enforced in send path | High | Phase 3H verification is the first step |
| No unsubscribe link in emails would violate CAN-SPAM | Critical | Phase 3H verification; block send path if absent |
| No follow-up logic means campaign cadence cannot run | High | Phase 3L required before campaign launch |
| No reply detection means complaints could arrive before detection | High | Complaint structured error (Phase 3H) provides operator visibility; proactive monitoring required |
| Agent decision log missing means agent errors are hard to diagnose | Medium | Phase 3I closes this |
| Staging never tested with real Resend key | High | Phase 3H end-to-end test required |

### Guardrails for Implementation Phases

| Guardrail | Applies to |
|-----------|-----------|
| No send path changes without `EMAIL_SENDING_ENABLED` check verified first | Phase 3H |
| No campaign model without unified draft path | Phase 3K depends on 3J |
| No live pilot without all Phase 3H + 3I + 3J + 3K gates | Phase 3M |
| All new tables must have `tenant_id` + RLS | All phases |
| All new agent decisions must be logged to `agent_decisions` | All phases after 3I |
| No bulk send mechanism — ever without explicit per-send approval | All phases |
| Advisory-only learning signals — no auto-action from Learning Agent | Ongoing |
| Every migration is sequential and auditable | All phases |

---

## Exact Next Prompt (if this design is approved)

```
Begin Phase 3G implementation planning only.

Current confirmed state:
- Phase 3F is complete, locked, production-deployed, documented, and pushed
- Phase 3G design document approved: docs/roadmap/phase-3g-agent-operations-readiness-design.md
- Tests baseline: 1048/1048
- Next migration available: 20240033

Task:
Produce the Phase 3G implementation plan only.

Phase 3G scope is:
- This design document is the deliverable. There is no Phase 3G code implementation.
- Phase 3G produces: the design document + the prioritized roadmap of phases 3H → 3M
- Phase 3G does NOT produce code, migrations, or production changes.

Implementation plan should include:
1. Phase 3H scope and estimated test count (send safety hardening)
2. Phase 3I scope and estimated test count (agent decision log)
3. Phase 3J scope and estimated test count (unified draft path)
4. Phase 3K scope and estimated test count (campaign assignment model)
5. Phase 3L scope and estimated test count (follow-up scheduling)
6. Phase 3M scope and go/no-go criteria (live pilot)
7. Dependencies between phases
8. Suggested first implementation phase (3H) and next prompt for beginning it

Hard constraints:
- Do not write implementation code.
- Do not create migrations.
- Do not modify production.
- Do not deploy.
- Planning document only.
- Do not commit yet.
```

---

*Phase 3G Design Document v1.0 — 2026-05-27*
