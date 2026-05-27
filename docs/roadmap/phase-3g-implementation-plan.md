# Phase 3G — Agent Operations Readiness & Control Map
## Implementation Plan v1.0

**Status:** Proposed — awaiting user approval before any work begins
**Design document:** `docs/roadmap/phase-3g-agent-operations-readiness-design.md`
**Depends on:** Phase 3F complete and production-deployed (`f43f797`, `phase-3f-workflow-execution-visibility-v1`)
**Tests baseline:** 1048/1048
**Next migration available:** `20240033`
**Date:** 2026-05-27

---

## Section 1 — Phase 3G Deliverable Scope

### 1.1 Confirmation: Phase 3G Has No Code Implementation

Phase 3G is a **planning and control-map phase only**. It produces documentation. It does not produce:

- Source code changes
- Database migrations
- Supabase schema changes
- Vercel deployments
- API routes
- UI components
- Server actions
- Test suites (beyond documentation-verification tests if any)

### 1.2 Phase 3G Deliverables

| Deliverable | File | Status |
|-------------|------|--------|
| Design document (Agent Inventory, Decision Lifecycle, Gaps, Roadmap 3H–3M, Pause Milestone) | `docs/roadmap/phase-3g-agent-operations-readiness-design.md` | Created — awaiting approval |
| Implementation plan (this document) | `docs/roadmap/phase-3g-implementation-plan.md` | This document |
| AI context documentation update | `docs/ai-context/00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` | After approval |

### 1.3 No Migration Required

Phase 3G requires no database migration. No schema changes. `20240033` remains available for Phase 3H.

---

## Section 2 — Source Code Findings (Pre-Planning Audit)

The following were discovered by reading source code before writing this plan. They are inputs to Phase 3H scope, not Phase 3G deliverables.

### 2.1 `EMAIL_SENDING_ENABLED` Kill Switch Is Not Enforced

**File:** `modules/messaging/services/email-send.service.ts`
**Finding:** `sendApprovedDraft()` enforces 8 gates before calling Resend. None of them check `SystemControlKey.EMAIL_SENDING_ENABLED`. The kill switch exists in the `system_controls` table but is never read inside the send path.

**Impact:** If production sending is accidentally enabled or triggered, there is no system-level kill switch that would stop it. The 8 gates (permission, approval, suppression, rate limit) are the only protection.

**Required action (Phase 3H):** Add gate 0 to `sendApprovedDraft()` — read `system_controls` for `EMAIL_SENDING_ENABLED` and return `{ ok: false, reason: 'sending_disabled_by_system_control' }` if not enabled.

### 2.2 Phase 3A Sends Emit No Activity Events

**File:** `modules/messaging/services/email-send.service.ts`, lines 176–194, 238–257, 272–289
**Finding:** `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` are only emitted when `phase3bMeta !== null` — i.e., only for Phase 3B Send Bridge drafts. The auto-path (template-based drafts created by `on-lead-created.ts`) produces `email_sends` rows with no activity events.

**Impact:** If a lead receives an auto-path draft and the operator sends it, there is no `ET_SEND_INITIATED` or `ET_SEND_SUCCEEDED` event in the activity timeline. The lead detail page Workflow Activity section will show no send events for auto-path sends.

**Required action (Phase 3H):** Emit `ET_SEND_INITIATED` and `ET_SEND_SUCCEEDED` (or `ET_SEND_FAILED`) for ALL sends, not just Phase 3B sends. The `lead_id` is available via `draft.lead_id` (or derivable from draft).

### 2.3 Send Failure Reason Is JSONB-Only

**File:** `modules/messaging/services/email-send.service.ts`, line 265–269
**Finding:** On send failure, `errorMessage` is written to `email_sends.metadata.error` (JSONB) and `updateEmailSend` is called with `status: 'failed'`. There is no typed `failure_reason` column on `email_sends`.

**Impact:** Querying for send failures by reason requires JSONB path queries. Structured reporting is harder.

**Required action (Phase 3H, optional):** Add `failure_reason text` column to `email_sends` (migration `20240033`). Populate it from `errorMessage` on the failure path.

### 2.4 `triggered_by` Is JSONB-Only

**File:** `modules/messaging/services/email-send.service.ts`, lines 142–148
**Finding:** `ctx.userId` is stored as `metadata.send_initiated_by` in JSONB. There is no typed `triggered_by` column on `email_sends`.

**Impact:** Querying for who sent each email requires JSONB extraction. Audit trail is harder to surface.

**Required action (Phase 3H):** Add `triggered_by text` column to `email_sends` (migration `20240033`). Populate from `ctx.userId`.

### 2.5 Suppression Check Uses Draft's `to_email`, Not Contact's Current Email

**File:** `modules/messaging/services/email-send.service.ts`, lines 111–114
**Finding:** This is intentional and correct — suppression is checked against the address the email will actually be sent to, not the contact's current email (which may have changed since draft creation). No action required.

### 2.6 Non-Production Fallback Sender

**File:** `modules/messaging/services/email-send.service.ts`, lines 128–132
**Finding:** In non-production environments (`NODE_ENV !== 'production'`), the sender falls back to `onboarding@resend.dev` (Resend's shared test address) if no sender identity is configured. In production, `null` is returned → `no_sender_identity_configured` error. This is a correct guard.

---

## Section 3 — Phase 3G Completion Criteria

Phase 3G is complete when all of the following are true:

| Criterion | Check |
|-----------|-------|
| Design document reviewed and gaps confirmed correct | User approval |
| Source code audit findings (Section 2) accepted as Phase 3H scope | User approval |
| Roadmap 3H → 3M structure accepted | User approval |
| Phase 3H as the first implementation phase accepted | User approval |
| Recommended pause milestone ("System Verified for Controlled Live Sending") accepted | User approval |
| Implementation plan (this document) accepted | User approval |
| AI context documentation updated to record Phase 3G | After approval |
| Phase 3G commits pushed to origin/master | After approval |
| Phase 3G lock tag created and pushed | After approval |
| No code has been implemented | Continuously enforced |

---

## Section 4 — Phase 3H Proposed Scope (Send Safety Hardening)

Phase 3H is the **first implementation phase** after Phase 3G. It has no new features — it is purely safety hardening for the email send path. All changes are self-contained in the send service, webhook handler, and one migration.

### 4.1 Gate 0: Enforce `EMAIL_SENDING_ENABLED` in `sendApprovedDraft`

**File:** `modules/messaging/services/email-send.service.ts`
**What:** Read `system_controls` for `EMAIL_SENDING_ENABLED` before gate 1. Return early with `{ ok: false, reason: 'sending_disabled_by_system_control' }` if not enabled.
**Why:** The kill switch is decorative today. This makes it real.
**System control repo:** `modules/intelligence/repositories/system-control.repo.ts` — function already exists; import and call it.

### 4.2 Emit Activity Events for All Sends (Not Just Phase 3B)

**File:** `modules/messaging/services/email-send.service.ts`
**What:** Move `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` emission outside the `if (phase3bMeta !== null)` guard. Derive `lead_id` from the draft record (column already exists: `email_drafts.lead_id`).
**Why:** Auto-path sends leave no trace in the activity timeline. After Phase 3F, the Workflow Activity panel on the lead detail page will be silent for auto-path sends until this is fixed.

### 4.3 Migration `20240033` — Add Typed Columns to `email_sends`

```sql
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS triggered_by   text;
```

**Populate at write time:**
- `failure_reason` — set from `errorMessage` in the failure path
- `triggered_by` — set from `ctx.userId` in the success and failure paths

**Types/database.ts:** Add `failure_reason: string | null` and `triggered_by: string | null` to `email_sends` Row/Insert/Update.

### 4.4 Bounce Structured Error

**File:** `app/api/webhooks/resend/route.ts`
**What:** On `email.bounced` with bounce type `permanent` (check `event.data.type === 'permanent'` in payload), call `structuredErrorRepo.createStructuredError()` with:
- `failureType: 'EMAIL_PERMANENT_BOUNCE'`
- `severity: 'error'`
- `module: 'resend_webhook'`
- `context: { emailSendId, toEmail, bounceType }`
- `tenantId`, `workspaceId` from `email_sends` row

**Why:** Permanent bounces indicate the contact's email address is invalid. This should be visible in System Intelligence so operators can investigate and update the contact record.

### 4.5 Complaint Structured Error

**File:** `app/api/webhooks/resend/route.ts`
**What:** On `email.complained`, after auto-unsubscribe, call `structuredErrorRepo.createStructuredError()` with:
- `failureType: 'EMAIL_COMPLAINT_RECEIVED'`
- `severity: 'critical'`
- `module: 'resend_webhook'`
- `context: { emailSendId, toEmail }`
- `tenantId`, `workspaceId` from `email_sends` row

**Why:** Complaints require immediate operator review. `critical` severity surfaces them at the top of the System Intelligence error list.

### 4.6 Delivery Delay Structured Error (Threshold-Based)

**File:** `app/api/webhooks/resend/route.ts`
**What:** On `email.delivery_delayed`, call `structuredErrorRepo.createStructuredError()` with:
- `failureType: 'EMAIL_DELIVERY_DELAYED'`
- `severity: 'warning'`
- `module: 'resend_webhook'`
- `context: { emailSendId, toEmail }`

**Note:** Resend may send multiple `email.delivery_delayed` events for the same send. Idempotency guard: only create the structured error once per `email_send_id` (check `automation_failures WHERE context->>'emailSendId' = ? AND failure_type = 'EMAIL_DELIVERY_DELAYED'`). OR use `correlation_id = emailSendId` and check before insert.

**Why:** Delivery delays that persist indicate deliverability problems. Currently log-only and completely invisible to operators.

### 4.7 New `FAILURE_TYPE` Constants

**File:** `modules/intelligence/structured-errors/structured-error.types.ts`
**What:** Add to `WEBHOOK_FAILURE_TYPE` (or create new const block):
```typescript
export const WEBHOOK_FAILURE_TYPE = {
  EMAIL_PERMANENT_BOUNCE:    'EMAIL_PERMANENT_BOUNCE',
  EMAIL_COMPLAINT_RECEIVED:  'EMAIL_COMPLAINT_RECEIVED',
  EMAIL_DELIVERY_DELAYED:    'EMAIL_DELIVERY_DELAYED',
} as const
```

### 4.8 Verify Unsubscribe Link in Email Templates

**What:** Read the template rendering path in `email-draft.service.ts` and confirm that all outgoing emails include a CAN-SPAM-compliant unsubscribe mechanism (link or header). If absent, add it.
**Scope:** Read-only investigation during design → add in implementation if missing.

### 4.9 Staging End-to-End Test Plan (Not Automated — Manual Checklist)

Phase 3H does not run real sends to real leads in production. The staging verification plan:

1. Enable `EMAIL_SENDING_ENABLED` for staging tenant in `system_controls` table
2. Create a test lead with a real (controlled) test email address
3. Run auto-path: confirm `ET_SEND_INITIATED` appears in Workflow Activity timeline
4. Approve draft → send → confirm `ET_SEND_SUCCEEDED` in timeline
5. Simulate bounce via Resend test event → confirm `EMAIL_PERMANENT_BOUNCE` in System Intelligence
6. Simulate complaint via Resend test event → confirm `EMAIL_COMPLAINT_RECEIVED` in System Intelligence (severity `critical`)
7. Simulate delivery delay via Resend test event → confirm `EMAIL_DELIVERY_DELAYED` structured error
8. Disable `EMAIL_SENDING_ENABLED` → attempt send → confirm `sending_disabled_by_system_control` error
9. Confirm `failure_reason` and `triggered_by` populated on `email_sends` rows
10. Confirm auto-unsubscribe still fires on complaint (regression check)

This checklist becomes the Phase 3H staging smoke test (10 items).

### 4.10 Phase 3H File Manifest

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/20240033_phase3h_email_send_hardening.sql` | New | `failure_reason`, `triggered_by` columns |
| `types/database.ts` | Modified | Add new columns to `email_sends` Row/Insert/Update |
| `modules/messaging/services/email-send.service.ts` | Modified | Gate 0 (`EMAIL_SENDING_ENABLED`); emit ET_ events for all sends; populate `failure_reason` + `triggered_by` |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Modified | Add `WEBHOOK_FAILURE_TYPE` constants |
| `app/api/webhooks/resend/route.ts` | Modified | Bounce + complaint + delay → structured errors |
| `tests/phase3h-send-safety-hardening.test.ts` | New | Source-reading tests (see Section 6) |

### 4.11 Phase 3H Guardrails

- Gate 0 (`EMAIL_SENDING_ENABLED`) must be the **first** check — before any DB reads
- `EMAIL_SENDING_ENABLED` defaults to **false** on all new tenants — opt-in, not opt-out
- Structured errors for bounce/complaint are non-fatal — webhook still returns 200 OK
- Phase 3A send activity events use `leadId` from `draft.lead_id` — must not be null before emit
- No `triggered_by` field on the draft or approval — use `ctx.userId` from the send service context only
- Do not add a new route for the end-to-end test; use existing staging data

---

## Section 5 — Phases 3I–3M Roadmap Summary

### Phase 3I — Agent Decision Log

**Theme:** Persist agent reasoning so every decision is auditable and visible.

**Core deliverable:** New `agent_decisions` table (migration `20240034`):
```
id uuid PK
tenant_id uuid NOT NULL (FK tenants)
lead_id uuid (nullable — system-level decisions may not have a lead)
agent_name text NOT NULL  -- e.g., 'auto_draft_creator', 'recommendation_generator'
decision_type text NOT NULL  -- e.g., 'template_selected', 'rule_matched'
input_snapshot jsonb  -- key inputs at decision time
output_snapshot jsonb  -- what the agent produced
reasoning text  -- human-readable explanation
created_at timestamptz DEFAULT now()
```

**Write sites:**
- `email-draft.service.ts` `createLeadEmailDraft()` — log template selected + recommendation rule matched
- `recommendation.service.ts` `generateRecommendation()` — log rule matched + score inputs used
- Future: Message Strategy Agent, Copywriting Agent, QRA (Phase 3J+)

**Read sites:**
- Lead detail page: new "Agent Decisions" panel (Phase 3I UI addition)
- System Intelligence: link from automation failure to triggering decision

**Migration:** `20240034`

**Phase 3H must be complete first** (end-to-end send verified, kill switch live).

### Phase 3J — Unified Draft Creation Path

**Theme:** Eliminate the two disconnected draft paths (auto-template vs. Phase 3B LLM). One unified pipeline.

**Current gap:** `on-lead-created.ts` creates template-based drafts directly. Message Workspace runs the Phase 3B pipeline (Message Strategy → Copywriting → QRA → HRB → SEB) independently. These are never connected.

**Proposed unified flow:**
```
lead.created event
  → on-lead-created.ts
  → Score lead
  → Generate recommendation
  → Enqueue draft creation job (do not create draft inline)
  → Draft creation job:
      → Message Strategy Agent → generate strategy
      → Copywriting Agent → generate versions
      → QRA → score + rank
      → Create HRB approval request (operator must select version)
      → HRB approval → SEB → email_draft created (pending_approval)
      → Operator sends
```

**This is the largest change.** It removes the direct template-slug path and routes everything through Phase 3B intelligence. It requires careful migration of existing auto-path drafts (or coexistence period).

**Dependencies:** Phase 3I complete (agent decision log must capture new decision points).

**Migration:** None anticipated — schema exists. May need migration if template-slug logic is stored in DB.

**Estimated effort:** High — this phase may need to be split into 3J.1 (decouple auto-path from `on-lead-created`) and 3J.2 (route through Phase 3B pipeline).

### Phase 3K — Campaign Assignment Model

**Theme:** Assign leads to named multi-email sequences with cadence and stop conditions.

**New tables (migration `20240035`):**
- `campaigns` — name, description, status, tenant_id, step count, cadence config
- `campaign_assignments` — lead_id, campaign_id, current_step, status (active/paused/completed/failed), enrolled_by, enrolled_at
- `campaign_steps` — campaign_id, step_number, delay_days, draft_template or strategy_hint, subject_override

**Campaign engine (Inngest cron):** Daily check for due campaign steps → enqueue draft creation → operator approval required before send.

**Stop conditions (all must pause or stop the assignment):**
- `email.complained` → stop (critical)
- `email.bounced` (permanent) → stop (contact invalid)
- Lead `do_not_contact = true` → stop
- `workflow_enabled = false` → pause (can resume)
- Operator manually pauses or cancels assignment
- Lead stage changes to `closed_won` or `closed_lost` → stop (complete or cancel)
- Lead replies (future — Phase 3L reply detection) → pause for human review

**Dependencies:** Phase 3J (unified draft path) must be complete — campaigns use the same draft creation pipeline.

### Phase 3L — Follow-up Scheduling

**Theme:** After a send, schedule the next contact if no reply within N days.

**New events/tables:** `follow_up_schedules` (or extend `campaign_steps` with `scheduled_at` tracking); `activity_events` type `FOLLOWUP_SCHEDULED`, `FOLLOWUP_TRIGGERED`, `FOLLOWUP_CANCELLED`.

**Inngest function:** Check for `email_sends` with `status='delivered'` and no subsequent reply signal within `delay_days` → trigger next campaign step draft creation.

**Reply detection problem:** Resend does not provide a reply webhook. Reply detection requires one of:
- Inbox monitoring via a dedicated reply-catch email address (e.g., `reply+{token}@reply.example.com`)
- IMAP polling (high complexity)
- Operator manual marking in the UI (simplest v1)
- Third-party reply detection service

**v1 recommendation:** Operator manually marks "replied" on the lead detail page. This is a single checkbox or button, not a full inbox integration. Follow-ups are scheduled automatically but can be cancelled when the operator marks the lead as having replied.

**Dependencies:** Phase 3K (campaign assignment model) required.

### Phase 3M — Live Pilot

**Theme:** Enable real Resend sending for one tenant on production for a controlled pilot.

**Gate requirements (all must be satisfied before enabling):**
- Phase 3H: kill switch verified, bounce/complaint structured errors live
- Phase 3I: agent decision log live and visible
- Phase 3J: unified draft path live (no auto-template sends)
- Phase 3K: campaign assignment model live, stop conditions enforced
- Operator designated as pilot contact
- Suppression list verified for pilot leads
- Unsubscribe link confirmed in all outgoing emails
- Go/no-go criteria agreed before enabling `EMAIL_SENDING_ENABLED`

**Enabling mechanism:** Set `system_controls` row `key='EMAIL_SENDING_ENABLED', value=true` for the pilot tenant only. Other tenants remain `false`.

**Rollback:** Set `EMAIL_SENDING_ENABLED` back to `false`. No code change required (this is the point of Phase 3H gate 0).

**Monitoring:** Webhook delivery rates, bounce rates, complaint rates visible in System Intelligence + Analytics.

---

## Section 6 — Test Expectations

### 6.1 Phase 3G Tests

Phase 3G is documentation-only. No test suite is required for the design document or implementation plan. If any test is written, it would be a documentation-existence test (confirm files exist and contain key phrases). This is optional and not recommended — the commit is the verification.

**Estimated test count for Phase 3G: 0 new tests.**
**Tests remain at baseline: 1048/1048.**

### 6.2 Phase 3H Estimated Test Categories

Phase 3H is source-code changes with clear boundaries. Tests follow the source-reading pattern used in all prior phases.

| Block | Category | Estimated tests |
|-------|----------|----------------|
| 0 | `EMAIL_SENDING_ENABLED` gate: `send.service.ts` contains system control read + early return | 3 |
| 1 | Activity events for all sends: `ET_SEND_INITIATED` emitted outside `if (phase3bMeta !== null)` | 3 |
| 2 | `failure_reason` populated on send failure path | 2 |
| 3 | `triggered_by` populated from `ctx.userId` | 2 |
| 4 | Bounce structured error: `EMAIL_PERMANENT_BOUNCE` created in webhook handler | 3 |
| 5 | Complaint structured error: `EMAIL_COMPLAINT_RECEIVED` created, severity `critical` | 3 |
| 6 | Delivery delay structured error: `EMAIL_DELIVERY_DELAYED` created, idempotency guard | 3 |
| 7 | New failure type constants in `structured-error.types.ts` | 2 |
| 8 | Migration SQL: new columns exist (`failure_reason`, `triggered_by`) | 2 |
| 9 | Guardrails: no Resend calls in structured error creation; no auto-send in bounce handler | 3 |

**Estimated Phase 3H test count: ~26 new tests → baseline would reach ~1074/1074**

### 6.3 Phase 3I–3K Estimated Test Counts

| Phase | Estimated new tests | Cumulative |
|-------|-------------------|-----------|
| 3H | ~26 | ~1074 |
| 3I | ~18 (decision log repo, write sites, UI panel structure) | ~1092 |
| 3J | ~30 (unified draft path, on-lead-created changes, Phase 3B routing) | ~1122 |
| 3K | ~35 (campaign model, assignment logic, stop conditions, cron guard) | ~1157 |
| 3L | ~20 (follow-up scheduling, manual reply marking) | ~1177 |
| 3M | ~8 (pilot gate verification, kill switch toggle, monitoring queries) | ~1185 |

---

## Section 7 — Risks and Guardrails

### 7.1 Risks

| Risk | Severity | Phase |
|------|---------|-------|
| `EMAIL_SENDING_ENABLED` not enforced → uncontrolled production sending possible today | Critical | Phase 3H must fix this first |
| No unsubscribe link in emails → CAN-SPAM violation on first real send | Critical | Phase 3H must verify this |
| Phase 3A sends leave no activity trace → operators cannot see auto-path send events | High | Phase 3H |
| Complaint produces no structured error → operator has no alert path | High | Phase 3H |
| Two disconnected draft paths → campaign assignment impossible until unified | High | Phase 3J must precede 3K |
| No reply detection → follow-up cannot auto-pause on reply | Medium | Phase 3L manual workaround |
| Agent decision log absent → debugging agent errors requires DB queries | Medium | Phase 3I |
| Phase 3M live pilot risks (deliverability, complaint rate) if 3H/3I/3J/3K incomplete | Critical | 3M gate enforces all prior phases |

### 7.2 Guardrails (Apply to All Phases 3H–3M)

| Guardrail | Reason |
|-----------|--------|
| No live production sending until Phase 3H gate 0 is verified and tested | Kill switch must be real before any expansion |
| No campaign model before unified draft path (3J) | Campaigns require one entry point, not two |
| No live pilot (3M) before all 3H/3I/3J/3K gates satisfied | Every gate exists for a reason |
| No auto-send in any phase — human approval mandatory at every step | Core safety model |
| Every new table must include `tenant_id` and RLS | Tenant isolation is non-negotiable |
| All new agent decisions must be logged after Phase 3I ships | Audit trail must be complete before live sending |
| `EMAIL_SENDING_ENABLED` defaults to `false` for all tenants | Opt-in, not opt-out |
| Structured error creation in webhook handler is always non-fatal | Webhook must return 200 OK even if error logging fails |
| Migrations must be sequential and auditable | `20240033`, `20240034`, `20240035` — no gaps, no reuse |
| Advisory-only learning snapshots — no automated action from Learning Agent | Enforced at DB constraint level (`advisory = true`) |

---

## Section 8 — Final Recommendation

### 8.1 Phase 3G Is Ready to Commit as Documentation Only

Both Phase 3G documents are complete:
- `docs/roadmap/phase-3g-agent-operations-readiness-design.md` — design + gaps + roadmap
- `docs/roadmap/phase-3g-implementation-plan.md` — this document

No code has been touched. Tests remain at 1048/1048. Build will pass. Working tree has only these two untracked files.

Phase 3G should be committed, tagged, and pushed as documentation before Phase 3H begins.

**Suggested commit message:** `Docs: add Phase 3G agent operations readiness design and plan`
**Suggested lock tag:** `phase-3g-agent-operations-readiness-v1`

### 8.2 Exact Next Prompt — Commit Phase 3G Docs

```
Proceed with committing the Phase 3G documentation only.

Current state:
- Phase 3G design and implementation plan are complete
- No source code was changed
- Tests remain at 1048/1048
- Build passes

Expected new files:
- docs/roadmap/phase-3g-agent-operations-readiness-design.md
- docs/roadmap/phase-3g-implementation-plan.md

Hard constraints:
- Do not modify source code.
- Do not create migrations.
- Do not modify production.
- Do not start Phase 3H.
- Commit documentation only.
- Do not push yet.

Before commit, run:
  git status --short
  git diff --stat
  npx vitest run
  npx next build

Confirm:
- only the 2 new docs files are untracked
- tests pass: 1048/1048
- build passes
- no source code changed

Stage only:
  git add docs/roadmap/phase-3g-agent-operations-readiness-design.md
  git add docs/roadmap/phase-3g-implementation-plan.md

Commit with:
  git commit -m "Docs: add Phase 3G agent operations readiness design and plan"

After commit, run:
  git status --short
  git log --oneline -5

Report commit hash, files committed, test result, build result.
Do not push.
```

### 8.3 Exact Later Prompt — Begin Phase 3H Design Only

After Phase 3G is committed, tagged, documented, and pushed:

```
Begin Phase 3H design document only.

Current confirmed state:
- Phase 3G is complete, locked, documented, and pushed.
- Phase 3G design: docs/roadmap/phase-3g-agent-operations-readiness-design.md
- Phase 3G plan: docs/roadmap/phase-3g-implementation-plan.md
- Tests baseline: [current count]/[current count]
- Next migration available: 20240033

Phase 3H theme: Send Safety Hardening

Key findings from Phase 3G source audit:
1. EMAIL_SENDING_ENABLED is NOT checked in sendApprovedDraft() — kill switch is decorative.
2. Phase 3A sends emit no ET_ activity events (only Phase 3B sends do).
3. email_sends has no typed failure_reason or triggered_by columns.
4. Bounce (permanent) produces no structured error.
5. Complaint produces no structured error.
6. Delivery delay is log-only (no activity event, no structured error).

Phase 3H scope (from implementation plan Section 4):
- Gate 0: enforce EMAIL_SENDING_ENABLED in sendApprovedDraft
- Emit ET_ events for all sends (not just Phase 3B)
- Migration 20240033: add failure_reason + triggered_by to email_sends
- Bounce → EMAIL_PERMANENT_BOUNCE structured error (severity: error)
- Complaint → EMAIL_COMPLAINT_RECEIVED structured error (severity: critical)
- Delivery delay → EMAIL_DELIVERY_DELAYED structured error (severity: warning, idempotent)
- Add WEBHOOK_FAILURE_TYPE constants
- Verify unsubscribe link in email templates
- Staging end-to-end test plan (10-item manual checklist)

Task:
Produce the Phase 3H design document and test cases only.

Hard constraints:
- Do not write implementation code.
- Do not create migrations.
- Do not apply migrations.
- Do not modify production.
- Do not deploy.
- Do not create commits.
- Design document only.
```

---

## Ordered Steps for Phase 3G Completion

1. User reviews and approves this plan
2. Commit Phase 3G docs (see Section 8.2 prompt)
3. Push commit to origin/master
4. Create and push lock tag `phase-3g-agent-operations-readiness-v1`
5. Update AI context docs to record Phase 3G completion
6. Commit and push AI context docs
7. Begin Phase 3H design (see Section 8.3 prompt) — only after explicit user approval

---

*Phase 3G Implementation Plan v1.0 — 2026-05-27*
