# Agent Sweep — Audit of the 15 Defined Agents

_Prepared during the agent-uplift sweep. Read-only audit + first targeted fixes.
No gates flipped, no agent activated. All 15 remain `dryRunOnly: true`._

## Headline finding (read this first)

The **governance substrate is well-designed but largely DECLARED-ONLY, not runtime-enforced.**
The registry (`modules/verian-agent-bridge/agent-registry.ts`) gives every agent a
`dryRunOnly: true` literal, `allowedActions`/`blockedActions`, a `BASE_BLOCKED` list
(send-email, db-write, apply-migration, …), and required-approval flags. But:

- The dry-run flag and blocked-action lists are **type-level / declarative**. No runtime
  guard validates that an agent never calls a blocked action.
- The guardrail service (`modules/intelligence/services/guardrail.service.ts`) exists but
  is **not wired into the agent execution path**.
- The execution-gate agent is **"safe by absence"** — it returns `executionAuthorized: false`,
  but nothing downstream checks that flag because no execution path exists yet.

This is **safe today** (there is no executor to misbehave), and it matches the report's
"human-gated, staged autonomy" thesis. But the product's core pitch — "nothing runs without
passing gates" — is currently enforced by *architecture (absence)*, not by *code*. Building
the runtime enforcement harness is the single most important governance investment, and it's
a **decision-level** item (it touches the safety-critical path), not a targeted fix.

## Per-agent status

| # | Agent | Category | State | Notes |
|---|-------|----------|-------|-------|
| 1 | Copywriting | Messaging | **Substantive (rule-based)** | Phase-3B path is deterministic rules, *not* LLM — the report's "fast model + escalation + 85 threshold" is aspirational here (the LLM lives in the separate `generateAiAssetDraft`/V3 path). Records 0 tokens. Weak required-inclusion matching. |
| 2 | Quality review | Messaging | **Substantive** | 8 deterministic dimensions + 25 risk flags. No minimum recommendation threshold (can "recommend" a Needs-Review draft). CTA-clarity doesn't check the strategy's prescribed CTA. Prior-angle context never loaded. |
| 3 | Subject line | Messaging | **Substantive (pure fn)** | Deterministic; no personalization tracking; silent fallback on unknown angle. |
| 4 | Personalization | Messaging | **Substantive (pure fn)** | Token substitution; no HTML escaping; missing-required-field is informational only. |
| 5 | Lead scoring | Business-intel | **Substantive, naive** | Hard-coded thresholds, **0 tests** (now seeded). Garbage-input holes — **fixed this pass**. |
| 6 | Company scoring | Business-intel | **Substantive, naive** | Hard-coded weights, **0 tests**. Same threshold/edge-case class as lead scoring. |
| 7 | Campaign recommendation | Business-intel | **Substantive, naive** | 6 sequential first-match rules; hard-coded thresholds; **0 tests**. |
| 8 | Sales-ops intelligence | Business-intel | **Skeletal** | Registered only — no service/action. Needs schema + MVP aggregation. |
| 9 | Prompt policy | Policy/safety | **Substantive** | Real deterministic checker (`verian-policy/checker.ts`), has tests. Brittle substring phrase-matching; presence-only evidence check. |
| 10 | Risk classifier | Policy/safety | **Skeletal** | Registered only. **Blocks the approval gate** (which depends on a risk signal). |
| 11 | Approval gate | Policy/safety | **Skeletal** | Registered only — no approval-record tracking, no authenticated-approver check. |
| 12 | Implementation | Development | **Definition-only** | Descriptor only; no file-I/O / git orchestration. |
| 13 | Code review (Codex) | Development | **Definition + storage repo** | Append-only artifact repo exists; no review synthesis. |
| 14 | Architecture review | Development | **Definition-only** | Descriptor only. |
| 15 | Documentation | Development | **Definition-only** | Descriptor only. |
| — | Execution gate | Execution | **Stub (safe by absence)** | `executionAuthorized: false` hardcoded; `hold-packet-for-authorization` declared but never called. |

**Tally:** 4 messaging + prompt-policy + 3 BI-scoring = ~6 substantive (all naive, mostly
untested) · 3 skeletal (sales-ops, risk-classifier, approval-gate) · 4 development definition-only
· 1 execution stub.

## What's safe to fix autonomously (no migration, no scope/gate change, testable)

1. **Scoring edge-case hardening + first test coverage** — lead/urgency (done), company scoring (next). Pure-function robustness; zero behavior change for valid data.
2. **Quality-review recommendation threshold** — don't surface a sub-"Usable" draft as the recommendation; return `no_recommendation` with a reason. (More conservative = gate-aligned.)
3. **Required-inclusion matching** in the copy compliance check — currently matches only the first word of a requirement (a real hole in a *compliance* check). Tighten with the 35 approved fixtures as the guard. (Higher-care: tightening a compliance matcher; do with fixtures green.)
4. **Subject/personalization** — personalization tracking, HTML escaping. Additive.

## What needs YOUR decision (out of autonomous scope)

- **Runtime governance-enforcement harness** — make the declared contracts actually enforced at call time. Safety-critical-path architecture; the headline finding.
- **Implementing the skeletal agents** (sales-ops, risk-classifier, approval-gate) — new services + likely new tables (**migrations are base-blocked** and out of autonomous scope), and a product decision on scope.
- **Wiring real LLM into the Phase-3B messaging agents** — changes cost/behavior; needs a model + budget decision.
- **Activating any agent** (dry-run → live) — explicit owner approval by design.

## This pass — first targeted fix (committed locally, not pushed)

`fit-score.service.ts` + `urgency-score.service.ts`: normalize `estimated_value` (finite & positive
only — negative/NaN no longer inflate completeness or value); require a *parseable* close date
(unparseable dates no longer leak `NaN` into score/confidence); clamp `created_at` age to ≥0.
First test suite added (`tests/agent-lead-urgency-scoring.test.ts`, 10 tests) locking the dimension
math and the hardening. No behavior change for valid inputs.
