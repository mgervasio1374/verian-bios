# 06 — Git Milestones

## Current Branch

`master`

## Tags

| Tag | Milestone |
|-----|-----------|
| `phase-3b-copywriting-agent-v1` | Copywriting Agent Foundation locked |
| `phase-3b-message-strategy-agent-v1` | Message Strategy Agent Foundation locked |
| `phase-3b-revenue-learning-engine-foundation-v1` | Phase 3B Foundation initial tag |
| `phase-3b-revenue-learning-engine-foundation-v1.1` | Phase 3B Foundation final tag (all commits included) |
| `phase-4-statement-workflow-complete` | Phase 4 statement approval workflow complete |

## Commit Log (Most Recent First)

| SHA | Message | Group |
|-----|---------|-------|
| `5765c7a` | Docs: add Phase 3B1 follow-up accountability roadmap | Phase 3B Docs |
| `5edf9c2` | Phase 3A: add artifacts document module | Phase 3A |
| `11bc621` | Phase 3A: enhance CRM workspace and intelligence UI | Phase 3A |
| `4521edb` | Phase 3A: add agent monitor and system controls UI | Phase 3A |
| `94406d2` | Phase 4: enhance statement approval workflow | Phase 4 |
| `6870099` | Phase 3A: add email quality and rewrite loop foundation | Phase 3A |
| `487a479` | Tooling: add Vitest test scripts | Tooling |
| `3f0367a` | Phase 3A: add intelligence infrastructure | Phase 3A |
| `5968ba2` | Phase 3B: implement Message Strategy Agent foundation | Phase 3B |
| `40e56b1` | Phase 3B: implement Copywriting Agent foundation | Phase 3B |
| `e55965b` | Polish statement proposal email copy | Phase 4 |
| `b50665d` | Add statement analysis PDF proposal package | Phase 4 |

## What Each Group Contains

### Phase 3A: Intelligence Infrastructure (`3f0367a`)
- `supabase/migrations/20240016_phase3a_intelligence_tables.sql`
- `supabase/migrations/20240017_phase3a_rls_indexes_seed.sql`
- `types/database.ts` — full schema regeneration
- `modules/intelligence/repositories/` — agent-run, agent-run-step, activity-event, company-score, guardrail-event, system-control, recommendation repos
- `modules/intelligence/services/` — agent-run-logging, activity-event, system-control, guardrail, company-scoring, recommendation-generation, recommendation-reconciliation, recommendation-completion services
- `modules/intelligence/types.agent.ts` — agent types including activity event types

### Tooling: Vitest (`487a479`)
- `package.json` — Vitest scripts and devDependencies
- `vitest.config.ts` — test framework configuration

### Phase 3A: Email Quality + Rewrite Loop (`6870099`)
- `supabase/migrations/20240018_phase3b1_follow_up_controls_seed.sql` and related
- Email quality foundation tables and services

### Phase 3B: Message Strategy Agent (`5968ba2`)
- `supabase/migrations/20240022_phase3b_message_strategies.sql`
- `modules/messaging/strategy/` — all strategy agent files
- `modules/messaging/repositories/message-strategy.repo.ts`
- `modules/messaging/actions/message-strategy.actions.ts`
- `app/(workspace)/[workspaceSlug]/message-workspace/` — workspace UI
- `tests/message-strategy.test.ts` + 30 fixtures

### Phase 3B: Copywriting Agent (`40e56b1`)
- `supabase/migrations/20240023_phase3b_message_versions.sql`
- `modules/messaging/copywriting/` — all copywriting agent files
- `modules/messaging/repositories/message-version.repo.ts`
- `modules/messaging/actions/copywriting-agent.actions.ts`
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`
- Extended `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`
- `tests/copywriting-agent.test.ts` + 35 fixtures
- `modules/intelligence/types.agent.ts` — added `MESSAGE_VERSIONS_GENERATED`

## QA Verification Log

| Date | Tests | Build | Notes |
|------|-------|-------|-------|
| 2026-05-19 | 141/141 passed | PASSED | Final QA before Phase 3B commit sequence |

## Migrations Sequence

| Migration | Contents |
|-----------|----------|
| `20240016` | Phase 3A intelligence tables |
| `20240017` | Phase 3A RLS, indexes, seed |
| `20240018` | Phase 3B1 follow-up controls seed |
| `20240022` | Phase 3B message_strategies table |
| `20240023` | Phase 3B message_versions table |
