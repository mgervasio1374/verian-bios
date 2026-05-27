# Phase 3C.4 — Workflow & Outbox Error Emission: Final QA Lock Report

**Date:** 2026-05-26
**Status:** LOCKED
**Lock tag:** `phase-3c4-workflow-outbox-error-emission-v1`
**Tagged commit:** `f465795` — Phase 3C.4: implement workflow and outbox error emission

---

## 1. Phase Name and Status

**Phase 3C.4 — Workflow & Outbox Error Emission**
Status: **Complete and locked**

---

## 2. Lock Tag

`phase-3c4-workflow-outbox-error-emission-v1` → `f465795`

Pushed to origin on 2026-05-26.

---

## 3. Tagged Commit

| SHA | Message |
|-----|---------|
| `f465795` | Phase 3C.4: implement workflow and outbox error emission |

---

## 4. Scope Completed

Added structured error emission from two workflow failure paths:

- **`WORKFLOW_FAILURE_TYPE` constants** — `WORKFLOW_RUN_FAILED` and `OUTBOX_EVENT_DISPATCH_FAILED` added to `structured-error.types.ts`; additive only, no existing constants modified
- **`failWorkflowRun()` emission** — when a workflow run transitions to `failed` status, a structured error row is written to `automation_failures` with `severity: 'error'`, `module: 'workflow_runs'`, `workflow_run_id` populated; non-fatal (`.catch(() => {})`)
- **`dispatchPendingEvents()` emission** — when an outbox event exhausts all 5 dispatch attempts, a structured error row is written with `severity: 'error'`, `module: 'event_dispatch_queue'`, `context: { event_id, event_type, attempts: 5 }`; guarded by `event.attempts + 1 >= 5` to emit only on the final attempt; non-fatal
- **No new migrations** — `automation_failures` already had `workflow_run_id` and `context` jsonb columns from Phase 3C.1 migration `20240028`
- **No new UI** — workflow failures now appear automatically in the Critical & Open Errors table on the System Intelligence page; existing Resolve / Investigate / Ignore actions apply
- **No new routes** — route count unchanged from Phase 3C.3 (32 routes)
- **25 new tests** — 9 describe blocks covering constants, service source assertions, guardrails, tenant isolation, outbox idempotency, and cross-phase preservation

---

## 5. Files Modified

| File | Change |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.types.ts` | +`WORKFLOW_FAILURE_TYPE` constant object and `WorkflowFailureType` type (additive) |
| `modules/workflow/services/workflow-run.service.ts` | +2 imports; `_ctx` renamed to `ctx`; non-fatal `createStructuredError` call added in `failWorkflowRun` |
| `modules/workflow/services/event-dispatch.service.ts` | +2 imports; guarded non-fatal `createStructuredError` call added in `dispatchPendingEvents` catch block |
| `tests/phase3c-system-intelligence.test.ts` | +25 tests appended across 9 describe blocks (Phase 3C.4 section) |

---

## 6. Tests Result

```
npx vitest run --reporter=verbose
Tests:  955/955 passed (10 test files)
Duration: 832ms
```

| Baseline | Count |
|----------|-------|
| Before Phase 3C.4 | 930/930 |
| New tests added | 25 |
| After Phase 3C.4 | **955/955** ✓ |

---

## 7. Build Result

```
npx next build
✓ Compiled successfully in 4.2s
✓ TypeScript: Finished in 8.7s — clean
✓ 32 routes compiled and optimized
```

---

## 8. Staging Deployment Validation

| Item | Result |
|------|--------|
| `verian-bios-staging` deployment for `f465795` | Ready ✓ |
| Staging URL `https://verian-bios-staging.vercel.app` | Live ✓ |

---

## 9. Manual Smoke Result

| Check | Result |
|-------|--------|
| Login | Works ✓ |
| Workspace loads | ✓ |
| `/main/settings/system-intelligence` loads | ✓ |
| Critical & Open Errors section loads | ✓ |
| Workflow Health section loads | ✓ |
| Generate Recommendations button still works | ✓ |
| No visible runtime errors | ✓ |

Note: No new UI was added in Phase 3C.4. All checks confirm existing UI is unaffected.

---

## 10. Production Non-Deployment Result

| Item | Result |
|------|--------|
| `verian-bios` production deployment for `f465795` | Did NOT trigger ✓ |
| Production URL `https://verian-bios.vercel.app` | Live ✓ |

Production Vercel continues to be Git-disconnected (Track A complete, 2026-05-26). No auto-deploy triggered on master push.

---

## 11. Migration Status

No migrations created. Phase 3C.4 uses only existing columns on `automation_failures` (created in Phase 3C.1, migration `20240028`). No new columns, no schema changes. Next available migration number: `20240032`.

---

## 12. Production Status

| Item | State |
|------|-------|
| Production Supabase | Untouched — no migrations applied |
| Production Vercel | Git-disconnected — no auto-deploy from master |
| Production URL | Live — serving last manual deployment |

---

## 13. Vercel Deployment Model Confirmation

| Environment | Deployment Trigger |
|-------------|-------------------|
| `verian-bios-staging` | Auto-deploys from `origin/master` — unchanged since Track A |
| `verian-bios` (production) | Manual/explicit only — `vercel --prod` or Vercel dashboard trigger |

---

## 14. Guardrails Preserved

| Guardrail | How preserved |
|-----------|---------------|
| No Resend calls | No email or send imports in any modified file; confirmed by Block 2 and Block 3 test assertions |
| No external LLMs | No LLM imports in any modified file; confirmed by Block 9 test assertions |
| No new DB tables or migrations | Writes to existing `automation_failures` table only |
| Non-fatal emission | Both `failWorkflowRun` and `dispatchPendingEvents` emissions wrapped in `.catch(() => {})` |
| Phase 3A behavior preserved | `failWorkflowRun` and `dispatchPendingEvents` return values and existing side effects unchanged |
| Outbox emits on final attempt only | Guard `event.attempts + 1 >= 5` prevents duplicate errors on retries 1–4 |
| All writes are tenant-scoped | `ctx.tenantId` (workflow) and `event.tenant_id` (outbox) on all `createStructuredError` calls |
| Phase 3C.2 / 3C.3 unchanged | `resolveErrorAction`, `listPendingSystemRecs`, and `page.tsx` server component confirmed by Block 8 |
| Production Vercel manual-only | Staging auto-deployed `f465795`; production did not — verified in smoke |
| No new routes | 32 routes confirmed — unchanged from Phase 3C.3 |

---

## 15. Final Conclusion

**Phase 3C.4 is locked.**

- Tag: `phase-3c4-workflow-outbox-error-emission-v1` → `f465795`
- Tests: 955/955 passed
- Build: clean
- Staging deployment: verified Ready
- Manual smoke: passed
- Production: untouched, no auto-deploy triggered
- Migrations: none created

**Phase 3C.5 has not started.**
