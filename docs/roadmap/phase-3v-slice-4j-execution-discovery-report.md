# Phase 3V Slice 4J — Execution Discovery Report

**Status:** Discovery complete — preferred application path identified; one additional prerequisite required
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4J — [Test Object Readiness Plan](phase-3v-slice-4j-test-object-readiness-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ Slice 4J execution discovery found the preferred application path. It does NOT create the test object. No writes, no drafts, no approvals, no sends occurred.**

---

## A. Purpose

Slice 4J execution discovery identifies the safest existing application/service/action path for creating exactly one controlled internal test object in staging. It does not create the test object, does not create drafts or approvals, does not send, and does not authorize Slice 5.

---

## B. Candidate Existing Application Paths

### Path 1 — `createManualProposalCaptureAction` (Phase 3N)

**File:** `modules/proposals/actions/manual-proposal-capture.actions.ts`

| Property | Detail |
|----------|--------|
| Function | `createManualProposalCaptureAction(input)` |
| Permission | `crm.leads.view` |
| Required inputs | `leadId`, `proposalSentAt` |
| Optional inputs | `contactId`, `proposalReference`, `proposalAmount`, `proposalCurrency`, `scheduleRuleKey` |
| What it creates | `proposal_capture` → `proposal_event` → `proposal_follow_up_commitments` (one per rule interval) |
| Record count control | `scheduleRuleKey = 'single_7'` creates exactly 1 commitment (7-day follow-up) |
| Side effects | Creates proposal event and commitments; emits audit events |
| Avoids sending | ✓ Yes |
| Constrainable to `[TEST ONLY]` | Via `proposalReference` (e.g., `[TEST ONLY]`) |
| **Critical gap** | Requires a `leadId` whose contact has `email = mgervasio@321swipe.com` — **no such lead/contact exists in staging** |
| Slice 4J safe | ✓ Yes, after prerequisite resolved |

### Path 2 — `generateFollowUpDraftAction({ commitmentId })` (Phase 3S)

**File:** `modules/proposals/actions/proposal-follow-up-draft.actions.ts`

| Property | Detail |
|----------|--------|
| Function | `generateFollowUpDraftAction({ commitmentId })` |
| Permission | `crm.leads.edit` |
| Required inputs | `commitmentId` (server-side context provides tenant/workspace) |
| What it creates | One `email_drafts` row with `source_type = 'future_follow_up'`, `subject_type = 'proposal_follow_up_commitment'`, `status = 'pending_approval'` |
| `to_email` source | `contact.email` from the lead linked to the commitment — **must be `mgervasio@321swipe.com`** |
| Sender source | Default sender identity — confirmed as `noreply@321swipe.com` (active, default, verified) ✓ |
| Creates approval_request | ✓ Yes — creates `approval_request` with `request_type = 'proposal_follow_up_draft_review'` |
| Avoids sending | ✓ Yes — creates `pending_approval` draft only |
| `[TEST ONLY]` in subject | Must be ensured by the template or subject override — **requires verification** |
| Slice 4J safe | ✓ Yes, after prerequisite resolved |

### Path 3 — `approveRequestAction(approvalId)` (workflow)

**File:** `modules/workflow/actions/approval.actions.ts`

| Property | Detail |
|----------|--------|
| Function | `approveRequestAction(approvalId)` |
| Permission | `crm.companies.view` (HRB_PERMISSION) |
| Required inputs | `approvalId` (from the generated draft's `approval_request_id`) |
| What it creates | Sets `approval_requests.status = 'approved'`; syncs draft to `status = 'approved'` |
| Avoids sending | ✓ Yes — approval does not trigger send |
| Slice 4J safe | ✓ Yes |

---

## C. Preferred Execution Path

**Path: Existing application/service/action path is the correct approach — one additional prerequisite required.**

The full 5-step path uses only existing actions:

```
Step 0 (prerequisite): Create test contact + test lead in staging
  → contact: email = mgervasio@321swipe.com, do_not_contact = false
  → lead: linked to that contact, workflow_enabled = true
  → tenant: 10000000-...-0001, workspace: 20000000-...-0001
  → via staging app UI or a narrow approved DB write sub-plan

Step 1: createManualProposalCaptureAction({
  leadId: <test_lead_id>,
  proposalSentAt: '<ISO timestamp>',
  proposalReference: '[TEST ONLY]',
  scheduleRuleKey: 'single_7'  ← creates exactly 1 commitment (7-day interval)
})
  → creates: 1 proposal_follow_up_commitment
  → permission: crm.leads.view (confirmed for staging@verian.internal)

Step 2: generateFollowUpDraftAction({ commitmentId: <new_commitment_id> })
  → creates: 1 email_draft with source_type='future_follow_up'
  → to_email will be mgervasio@321swipe.com (from test contact)
  → sender will be noreply@321swipe.com (staging default, verified)
  → creates: 1 approval_request with request_type='proposal_follow_up_draft_review'
  → permission: crm.leads.edit (confirmed for staging@verian.internal via Platform Admin)

Step 3: Verify draft subject contains [TEST ONLY]
  → The subject is generated from template email_proposal_follow_up
  → Template renders using lead/contact merge vars
  → Must confirm staging template includes [TEST ONLY] marker or accept rendered subject
  → If template does not include [TEST ONLY], consider updating the draft subject manually
    via staging app before approval (if app supports it) or via a narrow approved DB update

Step 4: approveRequestAction(approvalId)
  → approves the approval_request and transitions draft to status='approved'
  → permission: crm.companies.view (confirmed for staging@verian.internal via Platform Admin)

Step 5: SELECT-only post-creation verification
  → pfc_count = 1, ff_drafts = 1, draft.status = 'approved', email_sends unchanged
```

---

## D. Required Inputs for Future Execution

| Input | Value | Source |
|-------|-------|--------|
| Tenant ID | `10000000-0000-0000-0000-000000000001` | Confirmed from staging DB ✓ |
| Workspace ID | `20000000-0000-0000-0000-000000000001` | Confirmed from staging DB ✓ |
| Workspace slug | `main` | Confirmed ✓ |
| Operator user | `staging@verian.internal` | Confirmed — Platform Admin ✓ |
| Operator user ID | `a76d71ca-fe31-4314-8698-212714919d28` | Confirmed ✓ |
| Recipient email | `mgervasio@321swipe.com` | Confirmed — no forwarding ✓ |
| Sender | `noreply@321swipe.com` | Active, default, verified in staging ✓ |
| Subject marker | `[TEST ONLY]` | Required in draft subject |
| Test window | June 5, 2026, 12:00 AM–1:00 AM ET | Confirmed ✓ |
| Test lead ID | **TBD** — requires Step 0 (create test lead with `mgervasio@321swipe.com` contact) | Prerequisite |
| Test contact ID | **TBD** — requires Step 0 | Prerequisite |
| `scheduleRuleKey` | `'single_7'` | Creates exactly 1 commitment ✓ |
| `proposalReference` | `'[TEST ONLY]'` | For identification |
| `proposalSentAt` | Within test window | To be set at execution time |

---

## E. Safety and Stop Conditions for Execution

All hard stops from the Slice 4J readiness plan carry forward:

| Condition | Action |
|-----------|--------|
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Dirty git tree | Stop |
| `noreply@321swipe.com` missing/inactive/not verified | **Hard stop** |
| Tenant `email_sending_enabled = false` override missing | **Hard stop** |
| `EMAIL_SENDING_ENABLED` is `true` | **Hard stop** |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Recipient ≠ `mgervasio@321swipe.com` | **Hard stop** |
| Subject lacks `[TEST ONLY]` | Stop — verify before approving |
| More than 1 commitment/draft/approval created | Stop |
| Any send proposed | **Hard stop** |
| `sendFollowUpDraftAction` called | **Hard stop** |
| `EMAIL_SENDING_ENABLED` modified to `true` | **Hard stop** |

---

## F. Gaps / Blockers Before Execution

| # | Gap | Resolution required |
|---|-----|-------------------|
| **1** | **No test contact/lead with `email = mgervasio@321swipe.com` exists in staging** (3 existing leads all have external contact emails) | **Must resolve first.** Either: (a) create via staging app UI (if contact creation is accessible to `staging@verian.internal`), or (b) prepare a narrow approved DB write sub-plan for contact + lead creation. This is a prerequisite for Step 1. |
| 2 | Draft subject `[TEST ONLY]` marker not confirmed | Verify the staging `email_proposal_follow_up` template renders a `[TEST ONLY]` marker, OR plan a draft subject update step before approval. |
| 3 | `proposalSentAt` exact timestamp | Set at execution time within the June 5, 2026 test window. |

---

## G. Recommended Next Step

**The preferred path is: existing application actions (Steps 0–4 above).**

However, Step 0 (creating a test contact + lead in staging) is a prerequisite. Two options:

**Option A (preferred):** Operator creates the test contact + lead via the staging app UI (`staging@verian.internal` should have `crm.leads.view` and `crm.leads.edit` — sufficient to create contacts/leads). This avoids any additional raw DB writes.

**Option B:** If the staging app UI does not support contact/lead creation easily, prepare a narrow approved DB write sub-plan (similar to Slice 4I-C/4I-D) for:
- `INSERT INTO contacts (tenant_id, workspace_id, first_name, last_name, email, do_not_contact) VALUES (...)`
- `INSERT INTO leads (tenant_id, workspace_id, contact_id, name, stage, workflow_enabled) VALUES (...)`

**After Step 0 is complete:** Prepare the Slice 4J execution prompt covering Steps 1–5.

---

## H. Final Decision

- No writes occurred ✓
- No drafts created ✓
- No approvals created ✓
- No sends occurred ✓
- **Slice 4J execution readiness:** READY to proceed once Step 0 (test contact/lead with `mgervasio@321swipe.com`) is resolved
- **Slice 5 remains BLOCKED** — test object not yet created; Slice 4K evidence recollection still required
