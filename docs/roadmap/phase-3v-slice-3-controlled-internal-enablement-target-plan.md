# Phase 3V Slice 3 — Controlled Internal Enablement Target Plan

**Status:** Planning only — no enablement, no sending, no execution
**Created:** 2026-06-03
**Predecessor:** Phase 3V Slice 2 — [Preflight Checklist](phase-3v-slice-2-controlled-enablement-preflight-checklist.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ Slice 3 selects the target and defines the guardrails. It does NOT enable EMAIL_SENDING_ENABLED. It does NOT send emails. It does NOT authorize Slice 4 execution. All target fields are placeholders until Codex reviews and a separate Slice 4 execution prompt is explicitly approved.**

---

## A. Purpose

Phase 3V Slice 3 selects and documents the first safe internal enablement target for approved draft sending. It bridges the Slice 2 preflight checklist to a future Slice 4 execution step by defining the exact environment, recipient, draft, scope, and guardrails before anything is enabled.

Slice 3 is a planning/target-selection slice only. Completing it does not authorize actual email sending.

---

## B. Non-Goals

Slice 3 does NOT:

- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Enable production sending
- Add campaign sending
- Add automation or background jobs
- Modify code
- Modify migrations
- Modify provider configuration
- Modify environment variables
- Modify Vercel or Supabase settings

---

## C. Current Foundation

| Component | Status |
|-----------|--------|
| Phase 3T approved send UI | `SendFollowUpDraftButton` + `sendFollowUpDraftAction` — locked |
| Phase 3U send reliability hardening | `sendApprovedDraft`, `getBlockingSendForDraft`, `'provider_accepted'` — locked |
| Phase 3V Slice 1 readiness plan | Committed `dce3a2d` |
| Phase 3V Slice 2 preflight checklist | Committed `9b5cc20`, Codex PASS |
| `EMAIL_SENDING_ENABLED` | **Disabled** — required system control gate for delivery |
| `CAMPAIGN_SENDING_ENABLED` | **Disabled** — not part of Phase 3V; out of scope |
| `sendFollowUpDraftAction` input | `{ commitmentId }` — draftId derived server-side |
| `getBlockingSendForDraft` | Blocks `queued`, `sent`, `provider_accepted`, `failed+resend_message_id` |
| `'provider_accepted'` | Application-guarded; DB index not extended |

---

## D. Target Environment Decision

**The first enablement target must be non-production unless explicitly documented otherwise below.**

| Field | Requirement |
|-------|-------------|
| Environment type | Staging or local/dev only |
| Recipient | Internal 321 Swipe–owned recipient only |
| Tenant/workspace | One known staging tenant/workspace only |
| Draft | One known approved draft only |
| Commitment | One known proposal follow-up commitment only |

### Scope warning

> **If `verifiedScope = null`, the system control update is platform/global and affects ALL tenants with no per-tenant override.**
>
> Do not proceed with a null/global scope unless the impact across all tenants is explicitly understood and accepted. Prefer a specific staging `tenantId` override if available to limit blast radius to a single tenant.

---

## E. Exact Target Record Requirements

The following placeholders must be filled in before any Slice 4 execution prompt is written. They must be completed, reviewed, and Codex-approved at this slice. No execution may begin with blank fields.

```
Environment name:          ___________________
Environment type:          staging / local / dev  (circle one — must NOT be production)
Supabase project ref:      ___________________
Tenant ID:                 ___________________
Workspace ID:              ___________________
verifiedScope:             ___________________  (null = global; tenantId = per-tenant override)
Scope blast radius:        ___________________  (how many tenants affected by this scope)
Internal recipient email:  ___________________  (must be @321swipe.com or equivalent internal)
Draft ID:                  ___________________
Commitment ID:             ___________________
Sender identity ID:        ___________________
Sender email/domain:       ___________________
Provider:                  Resend
Provider key type:         staging/non-production
Expected provider result:  delivered to internal recipient
Operator (executes):       ___________________
Reviewer (approves):       ___________________
Planned test window:       ___________________
Rollback owner:            ___________________
```

**Slice 3 may define these fields but must not execute anything against them.**

---

## F. Recipient Safety Rules

The test recipient must satisfy all of the following:

- [ ] Recipient is internal and controlled by 321 Swipe
- [ ] No customer, prospect, vendor, or external recipient
- [ ] No distribution list
- [ ] No alias that forwards externally
- [ ] No production customer address
- [ ] No real campaign audience
- [ ] Exactly one recipient — not a list
- [ ] Recipient email domain is verified as internal: `___________________`

> **STOP if any condition above cannot be confirmed.** A single unintended external forward invalidates this test.

---

## G. Draft Readiness Requirements

The selected draft must satisfy all of the following before Slice 4 execution:

- [ ] `email_drafts.status = 'approved'`
- [ ] `email_drafts.approval_request_id` linked and its `approval_requests.status = 'approved'`
- [ ] Draft is linked to a proposal follow-up commitment (`subject_type = 'proposal_follow_up_commitment'`)
- [ ] `subject_id` matches the target commitment ID
- [ ] `source_type = 'future_follow_up'`
- [ ] Draft is associated with the correct tenant/workspace
- [ ] `campaign_assignment_id IS NULL`
- [ ] `superseded_at IS NULL`
- [ ] `deleted_at IS NULL`
- [ ] `getBlockingSendForDraft(draftId, tenantId)` returns `null` (no prior send record)
- [ ] `checkDraftSendReadiness` passes with no blocked reasons
- [ ] Subject contains `[TEST ONLY]` or equivalent internal marker
- [ ] Body contains no sensitive data
- [ ] `to_email` matches the internal test recipient
- [ ] Draft content is safe and clearly identifiable as an internal test

---

## H. Provider / Sender Requirements

- [ ] Sender domain is configured only in the selected staging environment
- [ ] Provider (Resend) API key is staging/non-production — **not the production key**
- [ ] Provider sandbox/test behavior understood if Resend has a test mode
- [ ] Sender identity row exists in staging DB and is verified (`is_verified = true`)
- [ ] Sender identity ID: `___________________`
- [ ] Sender email/domain: `___________________`
- [ ] No production sender activation in this test
- [ ] No bulk or campaign provider path used
- [ ] Provider dashboard accessible to verify delivery outcome

---

## I. System Control Requirements

| Requirement | Detail |
|-------------|--------|
| `EMAIL_SENDING_ENABLED` gate | Must be `false` before test; set to `true` only after all checks pass; reset to `false` immediately after test |
| `CAMPAIGN_SENDING_ENABLED` | Not part of Slice 3; must remain `false` |
| Update mechanism | `setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, true, verifiedScope)` — **boolean** `true`, not string `'true'` |
| Verification mechanism | `getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)` — must return `true` after enable, `false` after rollback |
| `setIsEnabled` | Not the runtime delivery gate — do not use for controlled enablement |
| String values | Never use `'true'` or `'false'` as strings |
| Ambiguous scope | Never proceed if `verifiedScope` is ambiguous or could affect unintended tenants |
| Rollback | `setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)` — boolean `false` |

---

## J. Manual Execution Outline for Future Slice 4 Only

> **⚠️ NOT TO BE RUN IN SLICE 3. This outline is for documentation and Codex review of the planned execution sequence. Slice 4 must be a separate explicit execution prompt.**

```
1.  Verify clean git state (git status --short)
2.  Verify target environment (not production)
3.  Verify target tenant/workspace IDs
4.  Verify internal recipient — confirm not external
5.  Verify draft ID, commitment ID, and draft readiness
6.  Run getBlockingSendForDraft — must return null
7.  Verify sender identity and provider key (staging only)
8.  Verify EMAIL_SENDING_ENABLED = false before proceeding
9.  Enable: setControlValue(EMAIL_SENDING_ENABLED, true, verifiedScope)
10. Verify: getBooleanControl(EMAIL_SENDING_ENABLED, verifiedTenantId) === true
11. Navigate to /proposal-follow-ups in staging UI as test user
12. Locate commitment row with approved draft
13. Click "Send Email" → confirm dialog → click "Confirm"
14. Observe UI: expect "Sent" state after success
15. Verify email_sends.status = 'sent' and resend_message_id set
16. Verify email_drafts.status = 'sent'
17. Confirm internal recipient received email
18. Verify ET_SEND_SUCCEEDED in activity events
19. Disable: setControlValue(EMAIL_SENDING_ENABLED, false, verifiedScope)
20. Verify: getBooleanControl(EMAIL_SENDING_ENABLED, verifiedTenantId) === false
21. Record all outcomes, IDs, and timestamps
```

If step 14 or later fails or produces unexpected results, **immediately execute step 19** before investigating.

---

## K. Stop Conditions

Any of the following must halt execution immediately. Slice 4 cannot proceed if any applies:

| Condition | Action |
|-----------|--------|
| Working tree is dirty | Stop — clean git state first |
| Wrong environment / unclear environment | Stop — confirm environment |
| Production environment selected without explicit separate approval | **Hard stop** |
| Recipient is not internal | **Hard stop** |
| Recipient forwards externally | **Hard stop** |
| More than one recipient | Stop |
| Draft not approved | Stop |
| Draft not linked to expected commitment | Stop |
| Tenant/workspace mismatch | Stop |
| `verifiedScope` is null or unexpected | Stop — confirm blast radius |
| `getBooleanControl` does not confirm intended scope | Stop |
| Provider/sender is unclear or production | Stop |
| `getBlockingSendForDraft` returns non-null | Stop — do not retry without reconciliation |
| Prior `'sent'` row exists for draft | Stop — email may already have been delivered |
| `email_sends.resend_message_id` set on any row for draft | Stop — do not retry |
| Migration/config/code changes appear in diff | Stop |
| `CAMPAIGN_SENDING_ENABLED` involved in any way | **Hard stop** |
| Automation or background job proposed | **Hard stop** |
| Uncertainty about blast radius of verifiedScope | Stop |
| Rollback owner not identified | Stop |
| Any Slice 2 checklist item still unchecked | Stop |

---

## L. Evidence Required Before Future Slice 4 Execution

The Slice 4 execution prompt must include all of the following. A Slice 4 prompt without this evidence must be rejected:

```
Environment:               ___________________
Tenant ID:                 ___________________
Workspace ID:              ___________________
Internal recipient:        ___________________
Commitment ID:             ___________________
Draft ID:                  ___________________
Sender/provider:           ___________________
Current git status:        (paste git status --short output)
origin/master commit:      ___________________
Phase 3U tag verified:     phase-3u-send-reliability-hardening-v1 → b472b72...
System control current:    EMAIL_SENDING_ENABLED = false (paste getBooleanControl result)
verifiedScope:             ___________________
Blocking-send result:      getBlockingSendForDraft = null (paste result)
Readiness result:          checkDraftSendReadiness = ready: true (paste result)
Rollback command:          setControlValue(EMAIL_SENDING_ENABLED, false, [scope])
Rollback owner:            ___________________
Operator:                  ___________________
Reviewer:                  ___________________
```

---

## M. Rollback Plan

If anything goes wrong at any step:

1. **Immediately**: `setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)` — boolean `false`
2. **Verify**: `getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)` must return `false`
3. Preserve all `email_sends` rows — they are audit records; do not delete
4. Do not manually mutate `email_drafts.status` without a separate recovery plan
5. If `email_sends.status = 'provider_accepted'`: do not retry; inspect `resend_message_id` and provider dashboard
6. If `email_sends.status = 'failed'` with `resend_message_id` set: do not retry; provider may have sent
7. If timeout/no-ID: stop; investigate before any retry
8. Record provider response, timestamps, and any error messages
9. Inspect `activity_events` for `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, or `ET_SEND_FAILED`
10. Document findings before escalating or retrying anything

---

## N. Observability Plan

After a future Slice 4 execution, the following evidence must be captured:

| Observable | Expected value |
|------------|---------------|
| `email_sends.status` | `'sent'` |
| `email_sends.resend_message_id` | Non-null — matches provider dashboard |
| `email_drafts.status` | `'sent'` |
| `email_drafts.sent_at` | Non-null timestamp |
| `ET_SEND_INITIATED` event | Present in `activity_events` |
| `ET_SEND_SUCCEEDED` event | Present in `activity_events` |
| Provider dashboard | Shows delivered message with matching `resend_message_id` |
| Internal recipient inbox | Email received and identifiable as test |
| `campaign_email_sends` | No row created |
| Background jobs | None scheduled |
| `commitment_status` | Unchanged (`'open'`) — no auto-complete |
| `proposal_status` | Unchanged |
| `EMAIL_SENDING_ENABLED` after test | `false` (re-disabled) |

---

## O. Required Codex Review Before Execution

Before any Slice 4 execution prompt is written:

1. The completed Slice 3 target fields (Section E) must be filled in
2. The recipient safety rules (Section F) must all be confirmed `[x]`
3. The draft readiness requirements (Section G) must all be confirmed `[x]`
4. This entire Slice 3 document must receive a Codex PASS review
5. No Slice 4 execution prompt may reference this document without those conditions met

**Codex review of Slice 3 is a hard gate before execution.**

---

## P. Final Slice 3 Decision Gate

- Slice 3 is **complete** when this target plan document is committed and Codex-reviewed
- Slice 3 does **not** authorize enabling `EMAIL_SENDING_ENABLED`
- Slice 3 does **not** authorize sending any emails
- Slice 4 must be a **separate execution prompt**, written only after:
  - All Slice 2 checklist items are green
  - All Slice 3 target fields are filled in
  - Codex has reviewed and approved this Slice 3 plan
  - Explicit operator approval is given for Slice 4 specifically

> **No email may be sent until Slice 4 is explicitly authorized as a separate step. Completing this document is not that authorization.**
