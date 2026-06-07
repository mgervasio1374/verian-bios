# Goal 3 Productivity Report — Verian Policy Layer

## Executive Summary

Goal 3 created the reusable Verian Policy Layer — the foundational safety infrastructure required before the Verian Agent Bridge can be designed or implemented. The policy layer consists of typed policy profiles, a static registry of eight reusable profiles, a deterministic prompt policy checker, and a comprehensive test suite covering 107 tests. The layer replaces repetitive ad-hoc guardrails in individual prompts with a structured, testable, reusable policy enforcement mechanism that future agent-routing infrastructure can call programmatically.

## Goal Outcome

**Met.** All six planned slices were completed and pushed. The policy layer exists, is fully tested, and has passed Codex review. The checker is usable now. The bridge design can begin as a design-only next goal.

## Slices Completed

| Slice | Commit | Deliverable |
|---|---|---|
| Goal 3 Slice 1 | `a963b32` | Verian policy layer design document (`docs/roadmap/goal-3-verian-policy-layer-design.md`) |
| Goal 3 Slice 2 | `a42c430` | Policy profile type definitions (`modules/verian-policy/types.ts`) |
| Goal 3 Slice 3 | `1c73f6d` | Static policy profile registry (`modules/verian-policy/registry.ts`) |
| Goal 3 Slice 4 | `1c70e2e` | Source-reading policy registry tests (`tests/goal3-policy-registry.test.ts`) |
| Goal 3 Slice 5 | `25e88d1` | Prompt policy checker design document (`docs/roadmap/goal-3-slice-5-prompt-policy-checker-design.md`) |
| Goal 3 Slice 6 | `0cce2b9` | Deterministic prompt policy checker + checker tests (`modules/verian-policy/checker.ts`, `tests/goal3-policy-checker.test.ts`) |

## What Changed

### Policy design document (Slice 1)
Established the eight policy profiles, blocked action catalog, required evidence catalog, bridge dependency model, and six implementation slices. Documented explicitly what the bridge must not do before the policy layer exists.

### Policy profile types (Slice 2)
Created eight exported TypeScript types with no runtime behavior and no imports: `VerianPolicyRiskLevel`, `VerianPolicyAction`, `VerianPolicyEvidenceRequirement`, `VerianPolicyReviewer`, `VerianPolicyProfileId`, `VerianPolicyProfile`, `VerianPolicyValidationIssue`, `VerianPolicyValidationResult`. Types are the stable contract that the registry, checker, and future bridge depend on.

### Static policy profile registry (Slice 3)
Created eight fully-specified `VerianPolicyProfile` objects covering the full risk spectrum: `LOW_RISK_DOCS_ONLY`, `LOW_RISK_UI_POLISH_NO_DATA`, `MEDIUM_RISK_BACKEND_NO_MIGRATION`, `HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION`, `MIGRATION_DESIGN_ONLY`, `STAGING_VERIFICATION_ONLY`, `CODEX_REVIEW_REQUIRED`, and `BRIDGE_REVIEW_ONLY`. Each profile specifies allowed actions, blocked actions (including 14 always-blocked items spread across all profiles), required checks, required evidence, required reviewers, Codex review flag, human approval flag, productivity report flag, and stop conditions. Exported as `VERIAN_POLICY_PROFILES` (ordered array) and `VERIAN_POLICY_REGISTRY` (keyed record).

### Source-reading policy registry tests (Slice 4)
Created 68 source-reading tests across 12 describe blocks (TC-G3-S4-001 through TC-G3-S4-012). Tests verify file existence, registry exports, all eight profile IDs, all required profile fields, all 14 always-blocked actions, bridge review blocking specifics, high-risk Codex and human approval requirements, disallowed imports, types-file runtime behavior constraints, the absence of a service file, the absence of bridge directories, and the absence of policy migration files.

### Prompt policy checker design (Slice 5)
Created a 19-section design document specifying the checker's input/output contract, violation categories, detection strategy, blocked phrase examples, bridge dependency model, test strategy, risks, and stop conditions. The design explicitly deferred implementation to Slice 6.

### Deterministic prompt policy checker implementation (Slice 6)
Created `modules/verian-policy/checker.ts` — a pure string-processing module exporting `checkVerianPromptPolicy`. The checker: resolves the policy profile from the registry; warns on ambiguous/empty prompts; scans combined prompt text against five phrase-to-action maps (sending, production, migration, automation, bridge); applies a subsumption filter to prevent double-reporting when a specific phrase subsumes a generic one; evaluates each effective action against the profile's blocked and allowed lists via RESTRICTED_TOKENS; warns when required reviewer language is absent; warns when required evidence is missing; and returns a structured `VerianPromptPolicyCheckResult` with `policyId`, `status`, `issues`, and `summary`. Created `tests/goal3-policy-checker.test.ts` with 39 behavioral and source-reading tests. Updated `tests/goal3-policy-registry.test.ts` to reflect that `checker.ts` now exists (stale absence assertion fixed).

## What Is Now Usable / Testable

**Reusable policy profiles.** Any prompt, tool, or future bridge component can select a named policy from `VERIAN_POLICY_REGISTRY` by ID without duplicating guardrail logic.

**Policy registry.** `VERIAN_POLICY_PROFILES` and `VERIAN_POLICY_REGISTRY` are stable exports. Any future module that needs to enumerate profiles or look one up by ID can import from `modules/verian-policy/registry.ts` without touching Supabase, services, repositories, or UI.

**Source-reading policy tests.** 68 tests that verify the registry's structural guarantees without any Supabase connections, mocking, or behavioral execution. These tests survive addition of new files because they use `toContain` assertions rather than exact-count assertions.

**Deterministic prompt policy checker.** `checkVerianPromptPolicy` is callable today in tests or in a future bridge integration. It requires no model calls, no network access, no shell commands, and no runtime system access — pure string processing only.

**Pass/warning/blocked result behavior.** The three-state result allows callers to gate on status without parsing unstructured text. `blocked` → stop; `warning` → require human review before proceeding; `pass` → may proceed subject to additional policy requirements.

**Migration-specific phrase handling.** The subsumption and RESTRICTED_TOKENS logic correctly resolves migration-token ambiguity: `run staging migration apply` passes under `STAGING_VERIFICATION_ONLY` only; `create migration file` passes under `MIGRATION_DESIGN_ONLY` only; `apply migration to production` always blocks regardless of profile.

**High-risk reviewer warnings.** Prompts under `HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION`, `CODEX_REVIEW_REQUIRED`, or `BRIDGE_REVIEW_ONLY` that do not reference Codex or human approval receive structured warning issues, making it impossible to miss a required review in a compliant workflow.

**Evidence warnings.** When `evidenceProvided` is supplied, the checker compares it against `requiredEvidence` and emits a structured warning for each missing item, supporting auditable pre-work checklists.

## Evidence and Tests

| Evidence | Result |
|---|---|
| Policy registry tests (TC-G3-S4-001 – TC-G3-S4-012) | **68/68 PASS** |
| Policy checker tests (TC-G3-S6-001 – TC-G3-S6-016) | **39/39 PASS** |
| Combined policy tests | **107/107 PASS** |
| Codex review — Slice 6 | **PASS** (one non-blocking note: `changedFiles` accepted but not yet used for file-scope enforcement; no blocking issues) |
| TypeScript | 7 pre-existing errors only — no new errors introduced in any Goal 3 slice |
| Working tree at push | Clean |
| Temp files | None |
| Tags at HEAD | None |

## Safety Boundaries Preserved

| Boundary | Status |
|---|---|
| Production | Untouched across all 6 slices |
| Staging/dev remote | Untouched |
| Migrations created | None |
| Migrations applied | None |
| DB write commands | None |
| Email/campaign sending | None |
| Automation/background jobs | None |
| Bridge implementation | Not started |
| Goal 4 | Not started |
| Tags | None created |
| Vercel settings | Unchanged |
| Supabase config | Unchanged |
| Environment variables | Unchanged |
| System controls | Unchanged |
| EMAIL_SENDING_ENABLED | Remains disabled |
| CAMPAIGN_SENDING_ENABLED | Remains disabled |

## Known Limitations

**Checker is deterministic text matching only.** The initial implementation uses explicit phrase-to-action maps and `includes()` matching. It does not perform semantic analysis, intent inference, or model-assisted review. Prompts that avoid the listed phrases but describe the same blocked action will not be caught.

**Checker is a safety assistant, not a perfect security system.** A `pass` result means no listed phrase was detected — it does not certify that the prompt is safe or that no blocked action was described in an unlisted way. Human approval, Codex review, tests, and runtime feature gates remain required.

**`changedFiles` is accepted but not yet used.** The input field is accepted for forward compatibility but no file-scope enforcement logic exists yet. Future versions should map changed file paths to allowed/blocked action categories. This was flagged in the Codex review as a non-blocking note.

**Future phrase variants need to be added as prompts evolve.** The initial phrase list was designed to catch obvious violations. As real prompts are checked against the system, new evasive or ambiguous phrasings will be discovered and the phrase maps will need updating.

**Checker does not replace human approval, Codex review, tests, or runtime gates.** These remain required by the policy profiles regardless of checker result. The checker's role is to catch obvious violations before work begins, not to certify compliance.

## Business / Process Impact

**Policy profiles reduce repetitive prompt guardrails.** Instead of repeating the same 14 always-blocked constraints in every prompt, a caller supplies a policy ID. All guardrails encoded in that profile are automatically applied by the checker without restating them.

**Checker enables safer prompt shortening.** Prompts that select a policy ID and pass the checker do not need to enumerate every blocked action. The checker handles detection; the policy profile encodes the constraints; only the intent needs to be stated.

**Future Verian Agent Bridge can call the checker before routing.** The bridge design document specifies that the bridge must call `checkVerianPromptPolicy` with the full prompt text and policy ID before routing any prompt to a model. If `status: 'blocked'` is returned, the bridge must not route the prompt. This is already the designed dependency.

**Supports the target of reducing repetitive orchestration by approximately 50%.** By centralizing guardrail logic in the policy layer rather than repeating it in each prompt, the total per-prompt overhead decreases substantially. The exact reduction will be measurable once the bridge is operational and routing real prompts.

## Remaining Blockers Before Bridge

1. **Explicit approval to start Goal 4 is required.** The bridge design must not begin until Michael approves the Goal 3 report and authorizes Goal 4.

2. **Bridge design must use policy profiles and checker.** Any bridge design that does not reference `VERIAN_POLICY_REGISTRY` and `checkVerianPromptPolicy` as required inputs violates the dependency specified in the design documents.

3. **Bridge must not route prompts without a policy check.** Routing a prompt without first calling the checker and receiving `status: 'pass'` or handling `status: 'warning'` with human review is a breach of the safety model.

4. **Bridge must preserve human approval and Codex review gates.** A `pass` result from the checker does not substitute for `requiresHumanApproval: true` or `requiresCodexReview: true` on the selected profile. The bridge must surface these as additional required steps.

5. **No autonomous execution for high-risk work.** Profiles with `requiresHumanApproval: true` require explicit human sign-off before any action is taken, regardless of checker status. This constraint must be enforced architecturally in the bridge, not delegated to the checker.

## Recommended Next Goal

**Goal 4 — Verian Agent Bridge MVP Design**

Goal 4 should begin as a design-only goal — one or more design documents specifying the bridge architecture, prompt routing protocol, policy integration points, and safety gates — with no bridge implementation, no model routing, and no automation in Goal 4 itself.

Suggested Goal 4 Slice 1 deliverable: a bridge design document at `docs/roadmap/goal-4-verian-agent-bridge-design.md` covering: bridge purpose and scope, prompt routing protocol, policy integration (how the bridge calls the checker), reviewer and approval gates, blocked status handling, warning status handling, pass status handling, bridge stop conditions, non-responsibilities, and the implementation slice plan for Goal 5 or later.

## Stop Conditions for Next Goal

Work on Goal 4 must stop before any of the following:

- Model-to-model routing or automation of any kind
- Shell command execution from bridge code
- DB writes or migration commands
- Production or staging touch
- Email or campaign sending
- Automation or background job creation
- Any proposal to bypass the checker result
- Any weakening of human approval or Codex review gates
- Any implementation of bridge infrastructure before the design document is approved
- Any action not explicitly permitted by a named policy profile from `VERIAN_POLICY_REGISTRY`
