# Phase 3X Slice 2 — Product Workflow Acceleration Plan

## Metadata

| Field | Value |
|---|---|
| Phase | 3X Slice 2 |
| Title | Product Workflow Acceleration |
| Risk level | MEDIUM overall (logo, contacts, operations read-only, campaign config UI) |
| High-risk isolation | Campaign sending, background jobs, schema changes, permissions — design-only or stop-for-approval |
| Status | PLAN — Codex review required before implementation |
| Prerequisite | Phase 3X Slice 1 closeout: PASS WITH NOTES (`3ad0324`) |
| Blocked | Slice 5 remains BLOCKED |

---

## 1. Executive Summary

Phase 3X Slice 1 corrected the brand identity and delivered baseline usability improvements: official logo, brand tokens, vertical leads layout, contacts company context, Operations snapshot, and campaign terminology. The system is now recognizably Verian.

Slice 2 must move Verian closer to real operational use. The operator has identified four specific gaps from the Slice 1 browser verification:

1. Sidebar logo is too small and adjacent text should be removed.
2. Add Contact modal lacks a Company field.
3. Operations page lacks a production/scheduling visibility component.
4. Campaign Assets lacks configurable sequence settings.

This slice addresses all four gaps within the existing risk-based workflow: larger bundles for low/medium-risk UI and read-only work; strict stop-for-approval for sending, automation, permissions, and schema changes.

Agents should ultimately use configured campaign rules rather than hardcoded behavior embedded in prompt instructions. This slice begins establishing that configuration surface without enabling actual sending.

---

## 2. Implementation Bundle

### A. Sidebar Logo Sizing Correction

**Risk:** LOW

**Scope:**
- Increase the rendered size of the official Verian logo in the sidebar. Current `h-7` is too small; operator wants executive-grade presence.
- Remove any adjacent "Verian BIOS" text label displayed beside the logo.
- Preserve official logo proportions (`w-auto object-contain` pattern).
- Keep the sidebar clean. No additional branding elements.

**Constraints:**
- Do not swap the logo asset. Use `public/brand/verian-logo.png` only.
- Do not recreate or generate a substitute logo.
- Do not modify the sidebar's structural layout beyond the logo block.

**Acceptance:**
- Logo is visibly larger and clearly readable in the sidebar without adjacent text.
- No overflow or layout breakage in collapsed/expanded sidebar states.

---

### B. Add Contact — Company Assignment

**Risk:** LOW to MEDIUM (depends on existing UI scaffolding)

**Scope:**
- Add a Company selector to the Add Contact modal (`AddContactDialog`).
- Use the existing `companies` table and `company_id` FK on `contacts` — these already exist.
- Company should be optional, not required, unless the operator specifies otherwise (see Open Questions).
- The selector should list workspace companies from the existing `listCompanies` or equivalent read query.
- On submission, pass the selected `company_id` to the existing contact create action.

**Constraints:**
- Do not add migration if the FK column already exists on `contacts`. Confirm before writing any migration.
- If a migration is required for any reason, stop and request operator approval before proceeding.
- Contact creation must remain the existing safe UI flow only — no new server actions beyond what is needed to pass `company_id`.

**Acceptance:**
- Add Contact modal includes a Company field (optional selector).
- Saved contacts appear with company context on the Contacts page.
- No migration introduced unless operator approves.

---

### C. Operations — Production Schedule Visibility v1

**Risk:** MEDIUM (read-only data display; no automation)

**Scope:**
- Extend the Operations page with a visible production schedule / status component.
- This is a read-only visibility layer. No sending. No scheduling execution. No background jobs.

**Production states to visualize (where existing data supports them):**

| State | Description |
|---|---|
| Planned | Campaign assignment exists, no draft yet |
| Draft Needed | Due for draft generation, none queued |
| Draft Ready | Draft exists, not yet submitted for approval |
| Awaiting Approval | Approval request exists, status pending |
| Approved | Approval granted, not yet scheduled/sent |
| Scheduled | Approved and in send queue (if queue data exists) |
| Sent | Send event recorded |
| Blocked | Blocked by missing data, DNC flag, or system gate |
| Stopped / Responded | Customer replied; outreach halted |

**Data sources (read-only, existing repos only):**
- `approval_requests` WHERE `status = 'pending'` (already used in Operations Snapshot)
- `email_drafts` WHERE `status IN ('draft','ready')` if repo function exists
- Proposal follow-up queue (already used)
- Lead pipeline (already used)
- Campaign assignments if existing repo supports it

**Constraints:**
- Do not import approval mutation actions.
- Do not add `<form>` elements with submit actions in this section.
- Do not add `.insert()`, `.update()`, `.upsert()`, `.delete()` calls.
- Do not add background jobs or scheduled functions.
- Do not change system controls or environment gates.
- If a required data source does not have a safe read-only repo function, surface a placeholder section labeled "Scheduled" with a note "Data not yet available" rather than adding an unsafe query.

**Acceptance:**
- Operations page shows at least a production status summary with labeled state groups.
- All data is read-only.
- No approval or send mutations introduced.

---

### D. Campaign Assets — Configuration Design Surface v1

**Risk:** MEDIUM (UI configuration display; stop if persistence requires schema)

**Scope:**
- Expand Campaign Assets beyond the terminology panel into a configurable planning UI.
- Define and display the campaign sequence concept visually.
- If existing campaign type / sequence tables support read/write, expose a lightweight configuration form.
- If persistence requires schema changes, stop and produce a migration/design request before writing any form submission.

**Sequence model to define and display:**

| Field | Description |
|---|---|
| Campaign Type | Named template (e.g., "Initial Contact") |
| Sequence Name | Label for the ordered touch plan |
| Number of Touches | Total planned outreach steps |
| Day Offsets | Days after campaign start for each touch |
| Stop Condition | Customer replies / responds |
| System Response Trigger | Status transition or alert after customer reply |
| Approval Required | All drafts require approval before any send |

**Default cadence example (configurable, not hardcoded):**

| Touch | Day Offset |
|---|---|
| Touch 1 | Day 1 |
| Touch 2 | Day 3 |
| Touch 3 | Day 7 |
| Touch 4 | Day 14 |
| Touch 5 | Day 31 |
| Touch 6 | Day 91 |
| Touch 7+ | Every 90 days until response |

**Constraints:**
- Do not enable EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED.
- Do not implement actual campaign send dispatch.
- Do not add background jobs or automatic scheduling execution.
- If sequence configuration requires new schema, stop for operator approval before writing the migration.
- This surface should begin structuring the model that agents will eventually read from, rather than relying on hardcoded agent-prompt behavior.

**Acceptance:**
- Campaign Assets page shows a sequence configuration UI or planning panel.
- Default cadence concept is visible and labeled as configurable.
- No sending enabled. No schema changes without approval.

---

## 3. High-Risk Items Excluded from Implementation

The following are excluded from Slice 2 implementation. They are defined here for future planning but must not be built until operator explicitly approves a dedicated design slice:

| Item | Reason |
|---|---|
| Actual campaign send dispatch | Requires 25-email test protocol, kill switch, audit logs, and operator approval |
| Background scheduling jobs | Requires infrastructure review and kill switch design |
| Automatic scheduling execution | Dependent on send dispatch approval |
| Response detection automation | Requires inbound processing design |
| Campaign type schema changes | Stop for operator approval if required |
| Permissions / RLS / user management | Separate high-risk design slice |
| System-control changes | Operator-controlled only |
| EMAIL_SENDING_ENABLED / CAMPAIGN_SENDING_ENABLED | Operator-controlled only |
| 25-email test send protocol | Defined in Phase 3X acceleration plan; not yet unlocked |
| Any production database write beyond existing safe UI flows | Stop and confirm |

---

## 4. High-Risk Design Subsection (Design Only — No Implementation)

### Phase 3X Slice 3 or Phase 3Y — Campaign Sequence Engine and Controlled Sending Design

This section is a design placeholder only. No code should be written from this section until the operator explicitly approves a dedicated implementation slice.

**Design topics:**

- **Campaign sequence schema** — tables for `campaign_types`, `campaign_sequences`, `campaign_steps`, `campaign_assignments`, with FKs and constraints
- **Email cadence rules** — day-offset logic, per-type overrides, default fallback cadence
- **Evergreen outreach logic** — continuation rule after Day 91; every 90 days until stop condition
- **Customer response stop conditions** — inbound reply detection; how the system marks a campaign assignment as responded/stopped
- **Approval workflow** — draft generation → approval request → approved → queued for send
- **Schedule generation** — when and how drafts are generated relative to assignment date
- **Send queue** — safe, audited send execution; one-at-a-time or batched under kill switch
- **Audit logs** — every send event logged with recipient, timestamp, campaign step, asset, outcome
- **Internal allowlisted test recipients** — required before any production send; 25-email test protocol
- **Kill switch / stop conditions** — system-control gate; operator can halt all outbound at any time
- **System-control gates** — `EMAIL_SENDING_ENABLED`, `CAMPAIGN_SENDING_ENABLED`; both off until test protocol complete

---

## 5. Operations Scheduling Concept

The Operations page should evolve to show production states as a work queue, not just a count summary. The intended progression:

**Current (Slice 1):** Four count-summary cards — follow-ups, open proposals, pending approvals, lead pipeline.

**Slice 2 target:** Production status table or grouped list showing where each active item sits in its lifecycle state (Planned → Draft Needed → Draft Ready → Awaiting Approval → Approved → Scheduled → Sent → Blocked / Stopped).

**Slice 3+ target:** Operator can take lightweight inline actions (e.g., mark as blocked, navigate to draft, view send history) without leaving the Operations view.

**Never in Operations:**
- Send dispatch
- Approval mutation forms
- System-control changes
- Campaign automation execution

---

## 6. Campaign Cadence Concept

The default outreach sequence the operator described:

| Touch | Day Offset | Notes |
|---|---|---|
| 1 | Day 1 | Initial contact |
| 2 | Day 3 | Early follow-up |
| 3 | Day 7 | One week |
| 4 | Day 14 | Two weeks |
| 5 | Day 31 | One month |
| 6 | Day 91 | Three months |
| 7+ | Every 90 days | Until response or stop |

**Stop condition:** Customer replies or responds. System should detect the response and mark the assignment as responded/stopped.

**System response trigger:** After a customer reply is detected, the system should transition the contact or lead status and optionally alert the operator.

**Configuration principle:** This cadence should become configurable per campaign type. Agents should read configured campaign rules rather than relying on hardcoded behavior embedded in prompt instructions. Hardcoded cadence in agent prompts is a transitional state only.

---

## 7. Testing Plan

All tests use the source-reading tier (fs.readFileSync + text assertions). No Supabase mocking. No LLM calls. No sends.

| Test ID | Description |
|---|---|
| TC-3X-S2-001 | Sidebar logo element uses larger size class (not `h-7`) |
| TC-3X-S2-002 | Sidebar does NOT contain "Verian BIOS" text adjacent to logo |
| TC-3X-S2-003 | Sidebar still references `/brand/verian-logo.png` |
| TC-3X-S2-004 | AddContactDialog contains company selector or company field reference |
| TC-3X-S2-005 | AddContactDialog does not import send/approval actions |
| TC-3X-S2-006 | Operations page contains production state labels (Planned, Draft, Approval, etc.) |
| TC-3X-S2-007 | Operations page does NOT contain `.insert(`, `.update(`, `.delete(`, `.upsert(` |
| TC-3X-S2-008 | Operations page does NOT contain `<form` mutation controls |
| TC-3X-S2-009 | Campaign Assets page contains sequence/cadence terminology |
| TC-3X-S2-010 | Campaign Assets page does NOT reference EMAIL_SENDING_ENABLED or CAMPAIGN_SENDING_ENABLED |
| TC-3X-S2-011 | No prohibited patterns (approveRequestAction, approveAndSendAction, sendFollowUpDraftAction) in changed UI files |
| TC-3X-S2-012 | Full Vitest — no new test failures beyond pre-existing |
| TC-3X-S2-013 | TypeScript — no new errors beyond pre-existing |

**Known pre-existing failures (do not regress):**
- TC-3K-030 in `tests/phase3k-unified-draft-send-path.test.ts` (spacing assertion, unrelated)
- TS errors in `tests/phase3h-send-safety-hardening.test.ts` (regex flag, unrelated)
- TS errors in `tests/quality-review-agent.test.ts` (duplicate object keys, unrelated)

---

## 8. Manual Verification Checklist

After deployment, the operator should verify:

- [ ] Sidebar logo is visibly larger than Slice 1; no adjacent "Verian BIOS" text
- [ ] Sidebar logo does not overflow or break layout
- [ ] Add Contact modal includes a Company field (optional)
- [ ] Saved contact appears with company context on Contacts page
- [ ] Contacts page still shows Company context from Slice 1
- [ ] Operations page shows production schedule/status section
- [ ] Operations page remains read-only (no send, no approval forms)
- [ ] Campaign Assets shows sequence/cadence configuration surface
- [ ] No send controls added anywhere
- [ ] No system controls modified
- [ ] No emails sent
- [ ] No campaign automation enabled

---

## 9. Acceptance Criteria

| Criterion | Required |
|---|---|
| Sidebar logo is larger; no adjacent product name text | Yes |
| Add Contact includes Company assignment | Yes |
| Contacts page preserves company context from Slice 1 | Yes |
| Operations shows production state visibility (read-only) | Yes |
| Campaign Assets shows sequence/cadence configuration panel | Yes |
| No high-risk sending/automation/permissions behavior introduced | Yes |
| No schema migration introduced unless operator approves | Yes |
| All Slice 2 source-reading tests pass | Yes |
| Full Vitest ≥ 2836/2837 (no new failures) | Yes |
| TypeScript clean (no new errors) | Yes |
| Codex review returns PASS or PASS WITH NOTES before implementation | Yes |
| Manual UI verification by operator after deployment | Yes |
| Slice 5 remains BLOCKED | Yes |

---

## 10. Open Questions

| Question | Options | Default Assumption |
|---|---|---|
| Is Company required or optional on Add Contact? | Required / Optional / Conditional | Optional unless operator specifies |
| Should Operations production schedule live on /operations only, or also the dashboard? | /operations only / both | /operations only for Slice 2; dashboard in a later slice |
| Should campaign sequence config be stored now if existing table supports it, or design-only until schema is approved? | Store if safe / design-only | Design-only unless existing table is confirmed safe; stop for approval if migration needed |
| Should the default cadence be exactly 1, 3, 7, 14, 31, 91, every 90 days, or configurable per campaign type from day one? | Fixed default / configurable from day one | Configurable per campaign type; fixed default as starting value |

---

## Commit Strategy

1. Documentation commit (this plan): `Docs: add Phase 3X Slice 2 product workflow acceleration plan`
2. Implementation commit (after Codex PASS): `Phase 3X Slice 2: product workflow acceleration`
3. No tag creation.
4. No push until operator confirms each step.
5. Slice 5 remains BLOCKED throughout.
