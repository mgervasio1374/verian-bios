# Phase 3R — Controlled Proposal Follow-Up Mutations Lock Report

**Status:** Implementation complete — lock report only
**Created:** 2026-06-02
**Predecessor:** Phase 3Q locked read-only follow-up queue (`phase-3q-proposal-follow-up-work-queue-v1`)
**origin/master at report time:** `c471bf260323a457135cedeace964f55f0e3d53d`

---

## 1. Purpose

Phase 3R implemented controlled write mutations for the proposal follow-up queue: Complete, Skip, and Reschedule. Each path runs through a layered stack (UI → Action → Service/Audit → Repository) with permission enforcement at the action layer, activity_events audit at the service layer, and tenant/workspace scoping with race guards at the repository layer.

This document is a lock report only. It does not create a tag, apply a production migration, or make code changes.

---

## 2. Final Implemented Paths

### Complete

```
CompleteFollowUpButton (UI — 'use client')
    ↓
completeFollowUpCommitmentAction ('use server', requirePermission crm.leads.edit)
    ↓
completeFollowUpCommitmentForWorkspace (service — recordActivityEvent PROPOSAL_FOLLOW_UP_COMPLETED)
    ↓
completeFollowUpCommitment (repository — fetch-before-write, race guard, commitment_status = 'completed')
```

### Skip

```
SkipFollowUpButton (UI — 'use client')
    ↓
skipFollowUpCommitmentAction ('use server', requirePermission crm.leads.edit)
    ↓
skipFollowUpCommitmentForWorkspace (service — recordActivityEvent PROPOSAL_FOLLOW_UP_SKIPPED)
    ↓
skipFollowUpCommitment (repository — fetch-before-write, race guard, commitment_status = 'skipped')
```

### Reschedule

```
RescheduleFollowUpButton (UI — 'use client', datetime-local → ISO conversion)
    ↓
rescheduleFollowUpCommitmentAction ('use server', requirePermission crm.leads.edit, date validation)
    ↓
rescheduleFollowUpCommitmentForWorkspace (service — recordActivityEvent PROPOSAL_FOLLOW_UP_RESCHEDULED)
    ↓
rescheduleFollowUpCommitment (repository — fetch-before-write, dual race guard, follow_up_due_at updated in place)
```

---

## 3. User-Facing Queue Changes

The Proposal Follow-Up Queue page (`/[workspaceSlug]/proposal-follow-ups`) now includes row-level controls in the action column:

| Control | Visibility | Behavior |
|---------|-----------|---------|
| **View →** | Always (all users who can load the queue) | Links to proposal event detail |
| **Mark Complete** | `crm.leads.edit` only | Opens confirmation → marks as completed |
| **Skip** | `crm.leads.edit` only | Opens confirmation + optional reason → marks as skipped |
| **Reschedule** | `crm.leads.edit` only | Opens date/time picker → updates `follow_up_due_at` in place |

Mutation controls are hidden (not rendered) for users without `crm.leads.edit`. The server page derives `canMutate = hasPermission(ctx, 'crm.leads.edit')` and wraps the mutation controls in a conditional block. UI visibility is a convenience layer — server actions remain the authoritative enforcement boundary.

---

## 4. Permission Model

| Operation | Permission | Enforced at |
|-----------|-----------|-------------|
| Read queue | `crm.leads.view` | Server action |
| Complete commitment | `crm.leads.edit` | Server action + UI conditional |
| Skip commitment | `crm.leads.edit` | Server action + UI conditional |
| Reschedule commitment | `crm.leads.edit` | Server action + UI conditional |

No new permission strings were added. `crm.leads.edit` is the existing write permission for all Phase 3R mutations.

---

## 5. Audit Model

Each mutation records to `activity_events` via `recordActivityEvent` at the **service layer only**. The repository does not write audit events. Actions do not write audit events.

| Event type | First caller |
|-----------|-------------|
| `PROPOSAL_FOLLOW_UP_COMPLETED` | `completeFollowUpCommitmentForWorkspace` |
| `PROPOSAL_FOLLOW_UP_SKIPPED` | `skipFollowUpCommitmentForWorkspace` |
| `PROPOSAL_FOLLOW_UP_RESCHEDULED` | `rescheduleFollowUpCommitmentForWorkspace` — first caller of this new constant |

**Audit failure behavior:** If the repository mutation succeeds but `recordActivityEvent` throws, the service returns `{ ok: false, error: 'audit_failed' }` without rolling back the already-written commitment row. This matches the project's partial-success pattern. Full transactional rollback is deferred unless a demonstrated need arises.

**Reschedule audit includes `previous_follow_up_due_at`:** captured from the fetch step before update, returned alongside the updated row from the repository, and forwarded to the audit event so the event records the value that was actually superseded.

---

## 6. Data Model

### Complete — no migration required

Uses existing `proposal_follow_up_commitments` columns from migration 20240038:

| Field | Written value |
|-------|--------------|
| `commitment_status` | `'completed'` |
| `completed_at` | `now()` |
| `completed_by_user_id` | `actorUserId` |
| `completion_notes` | optional, trimmed, whitespace → null |
| `updated_at` | `now()` |

### Skip — requires migration 20240039

Three new columns added by migration 20240039:

| Field | Written value |
|-------|--------------|
| `commitment_status` | `'skipped'` |
| `skipped_at` | `now()` |
| `skipped_by_user_id` | `actorUserId` |
| `skipped_reason` | optional, trimmed, whitespace → null |
| `updated_at` | `now()` |

### Reschedule — Option A, no migration required

Updates existing `follow_up_due_at` in place. `commitment_status` stays `'open'`. No new columns. Reschedule history lives exclusively in `activity_events`.

| Field | Written value |
|-------|--------------|
| `follow_up_due_at` | `nextFollowUpDueAt` (ISO string, normalized by action) |
| `updated_at` | `now()` |

---

## 7. Race / Consistency Guards

All three mutations use a **fetch-before-write** pattern scoped by `(id, tenant_id, workspace_id)`. The update predicate includes the following guards:

| Mutation | Race guard predicates |
|----------|-----------------------|
| Complete | `commitment_status = 'open'` |
| Skip | `commitment_status = 'open'` |
| Reschedule | `commitment_status = 'open'` **+** `follow_up_due_at = previousFollowUpDueAt` |

The Reschedule second predicate (`follow_up_due_at = previousFollowUpDueAt`) guards against concurrent reschedule-vs-reschedule races, ensuring `previousFollowUpDueAt` in the service return value is the value that was actually superseded — not a stale pre-fetch value.

If the guarded update returns no row (race lost), all three mutations throw `ProposalFollowUpMutationError('not_open', ...)`, which the service maps to `{ ok: false, error: 'not_open' }`.

---

## 8. Sending / Automation Exclusions

Phase 3R did **not** add:

- Email sending of any kind
- Campaign sending
- Resend API calls
- Inngest event enqueueing or background jobs
- LLM / AI provider calls (OpenAI, Anthropic, Claude)
- Email draft generation
- `email_drafts` table writes
- Proposal status mutation behavior
- Follow-up send controls
- `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` usage

These remain disabled and are deferred to Phase 3S (draft generation) and Phase 3T (approved send path) respectively, each requiring their own design documents, Codex reviews, and `EMAIL_SENDING_ENABLED` decision records before any implementation.

---

## 9. Environment / Migration Status

| Environment | Migration 20240039 | Status |
|-------------|-------------------|--------|
| Repository | Committed and pushed | `7cf0a04` |
| Local (Docker) | Applied and verified | 3 columns + FK confirmed |
| Remote-dev (`kxrplupzbsmujjznzhpy.supabase.co`) | Applied and verified | 3 columns + FK confirmed |
| **Production** | **Not applied** | **Requires separate explicit approval** |

**Production status:** Unchanged. No production Supabase changes, no Vercel production env changes. The Skip backend (repository, service, action) and Skip UI are deployed to origin/master, but Skip is gated behind migration 20240039 columns that do not yet exist in production. The Complete and Reschedule paths do not require migration 20240039 and are independently usable in any environment where the Phase 3R code is deployed.

---

## 10. Test Status

**Focused Phase 3N–3R suite:** 995 / 995 passing

Test files added or extended in Phase 3R:

| File | Tests |
|------|-------|
| `tests/phase3r-proposal-follow-up-mutations.test.ts` | 354 tests (TC-3R-001–353) |
| `tests/phase3q-proposal-follow-up-queue-ui.test.ts` | Extended with TC-3Q-131–135 |

**`npx tsc --noEmit`:** Fails only on two known pre-existing unrelated files:
- `tests/phase3h-send-safety-hardening.test.ts` — regex flag targeting issue (pre-Phase 3R)
- `tests/quality-review-agent.test.ts` — duplicate property issue (pre-Phase 3R)

No new TypeScript errors were introduced by Phase 3R.

---

## 11. Known Notes / Future Polish

1. **Context double-build:** The queue page calls `buildRequestContext` twice — once inside `getProposalFollowUpQueueAction` (for read permission) and once for `canMutate` (for mutation permission). Acceptable for current scale. A future enhancement could have the queue action return permission metadata in its response to eliminate the second context build.

2. **Production migration:** Production migration 20240039 application is a separate decision requiring explicit approval. Until it is applied, the Skip UI should not be represented as production-ready. Complete and Reschedule are independently usable in production without migration 20240039.

3. **Action input defensiveness:** All three actions assume they are called with a well-formed input object. Defensive defaulting (e.g., `input ?? {}`) could be added in a future polish pass without behavioral change.

4. **Compact action menu:** The row action column contains View + up to 3 mutation controls. A future UI polish pass could introduce a compact action menu or popover for density reduction, if suitable primitives are added to the project.

---

## 12. Phase 3R Implementation Commits

```
c471bf2  Phase 3R: polish follow-up queue mutation controls
8bfb58a  Phase 3R: add reschedule follow-up UI control
0988c68  Phase 3R: add reschedule follow-up action
9a73647  Phase 3R: add reschedule follow-up service audit
e1dfdd8  Phase 3R: add reschedule follow-up repository mutation
c9ac5b6  Docs: add Phase 3R reschedule implementation checkpoint
2fba4ec  Phase 3R: add skip follow-up UI control
c5b59ae  Docs: add Phase 3R skip UI migration readiness checkpoint
370a69a  Phase 3R: add skip follow-up action
3e925a7  Phase 3R: add skip follow-up service audit
08ffa9c  Phase 3R: add skip follow-up repository mutation
7cf0a04  Phase 3R: add follow-up skip fields migration
c9c13d8  Phase 3R: add complete follow-up UI control
e158f47  Phase 3R: add complete follow-up action
c30734e  Phase 3R: add complete follow-up service audit
fafec95  Fix Phase 3R complete mutation open-status guard
560337e  Phase 3R: add complete follow-up repository mutation
5528768  Docs: polish Phase 3R implementation plan
979a37b  Docs: add Phase 3R implementation plan
286a633  Docs: add Phase 3R controlled follow-up mutation design
```

---

## 13. Recommended Next Decisions

The following are options, not directives. Each requires separate explicit instruction before any action is taken.

| Option | Description | Prerequisite |
|--------|-------------|-------------|
| **A** | Create and push Phase 3R lock tag (`phase-3r-controlled-mutations-v1`) | Codex review of this lock report |
| **B** | Start production migration 20240039 approval/application process | Separate operator decision; allows Skip in production |
| **C** | Start Phase 3S follow-up draft generation design | Phase 3R lock confirmed; separate design document required |
| **D** | Start Reopen implementation checkpoint | Only if Reopen is still desired; decision from Phase 3R implementation plan open question 2 |
| **E** | Defer all of the above | No action required; Phase 3R stands as complete on local/remote-dev |

**Phase 3R is complete as documented.** No further code changes are implied by this report.
