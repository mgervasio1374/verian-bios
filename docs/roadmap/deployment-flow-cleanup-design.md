# Deployment Flow Cleanup — Design Document

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before any settings changes

---

## 1. Current Deployment Behavior

### Observed State (discovered during Phase 3C.2 staging validation)

| Vercel Project | URL | Branch Trigger |
|----------------|-----|----------------|
| `verian-bios-staging` | `https://verian-bios-staging.vercel.app` | `master` (auto) |
| `verian-bios` | `https://verian-bios.vercel.app` | `master` (auto) |

Both Vercel projects are connected to the `master` branch. Any push to `origin/master` — including routine staging validation pushes — triggers an automatic deployment for both projects simultaneously.

### What "deploy" means here

A Vercel deployment builds and serves the Next.js application only. It does **not**:
- Apply Supabase migrations
- modify database schema or data
- touch production Supabase secrets
- call any external API (except at runtime, when a user makes a request)

Production Supabase (`kxrplupzbsmujjznzhpy`) has never been touched by any Vercel deployment and cannot be affected by one.

### What is in the repo that governs this

There is **no `vercel.json`** in the repository. The branch-to-project connections are configured entirely in the Vercel dashboard. No code change is needed to modify the deployment trigger — only a Vercel settings change.

### Current migration state (all environments)

Migrations `001–031` are applied to all three environments. The Vercel deployment does not apply migrations; migrations are applied explicitly via the Supabase CLI.

---

## 2. Risk Created by the Shared Master Trigger

### The concrete problem

When a staging validation push happens (e.g., after implementing Phase 3C.2), both Vercel projects deploy. This means:

- The production Vercel project (`verian-bios`) receives every commit that was validated only on staging.
- A commit that passes staging smoke testing does not necessarily pass production-level validation (e.g., production Supabase migration applied, production secrets rotated, production RLS confirmed).
- If a future phase introduces a bug in the Next.js app code that is visible only under production Supabase schema, the production Vercel project would serve broken app code before the bug was caught.

### Risk classification

| Risk Type | Severity | Notes |
|-----------|----------|-------|
| Broken production app code served to end users | Medium | App serves broken UI but no data loss |
| Production Supabase data corruption from a deploy | None | Vercel deployments cannot modify Supabase |
| Production secrets leaked by a deploy | None | Secrets are env vars in Vercel dashboard, not in git |
| Production migration applied accidentally by a deploy | None | Migrations require explicit Supabase CLI command |
| Loss of staging / production separation visibility | Low | Team may lose clarity on which commits are "production-ready" |

### Current mitigating factors

- This project is in early-phase development; production has no live user traffic.
- Supabase production is the actual data boundary and is separately guarded.
- Every push to master already passes `npx vitest run` (903 tests) and `npx next build`.
- The staging smoke test is performed before every merge to master.

### Why this still warrants cleanup

The risk increases as the project matures. Once the production Supabase project has real data and real users, pushing staging-validated commits directly to the production Vercel project without a separate production approval step becomes a meaningful operational risk. Fixing the deploy flow before that milestone is lower-effort and lower-risk than fixing it after.

---

## 3. Desired Deployment Model

The desired end state separates deployment intent:

- **Staging deploys automatically** on every push to `master`. Staging is the continuous integration target.
- **Production deploys explicitly and intentionally**, decoupled from the staging push trigger.
- **Production Supabase migrations** remain separately controlled via the Supabase CLI, always requiring explicit user action.
- **No code changes required** in the repository to implement the deployment model change.

---

## 4. Options

### Option A — Accept the shared trigger (document it explicitly)

**What changes:** Nothing in Vercel. Update `05_ACTIVE_GUARDRAILS.md` to formally document this as an accepted, deliberate behavior rather than a risk.

**How it works:**
- Both projects continue to auto-deploy on every `master` push.
- The accepted principle is: Vercel deployments are safe because they cannot touch Supabase. Production Supabase remains the guarded boundary.
- Team discipline (code review, test suite, staging smoke) is the deployment gate.

**Pros:**
- Zero friction. No settings to change.
- No new workflow steps.
- Already the current state.

**Cons:**
- Every staging validation push deploys production app code without a separate production sign-off step.
- As production traffic grows, this creates user-visible risk on every staging commit.
- Makes it harder to stage a "production-ready" cut separately from in-progress staging work.

**Verdict:** Acceptable for zero-traffic production. Becomes a liability once real users are on the production URL.

---

### Option B — Production deploys from a dedicated `production` branch

**What changes:**
1. Create a `production` git branch from the current `master` commit.
2. In the Vercel dashboard, change `verian-bios` project's git branch from `master` to `production`.
3. From this point: staging auto-deploys from `master`; production deploys only when `production` is updated.
4. To deploy to production: merge (or fast-forward) `master` → `production` after production-level validation.

**How it works:**
```
master (continuous) → staging auto-deploys
production branch (gated) → production auto-deploys
```

**Pros:**
- Standard branch-based deployment model used by most teams.
- Clear separation: `master` is the staging target; `production` is the production target.
- Easy to create a specific production cut at any commit.
- No manual CLI steps needed at deploy time — just a merge.

**Cons:**
- Requires a new git branch to maintain.
- Every production deploy requires an explicit `git merge master → production` + push step.
- Slightly more git workflow overhead.

**Verdict:** Robust and scalable. Best option if production traffic is expected soon.

---

### Option C — Disable automatic git deploys on the production Vercel project (manual deploys only)

**What changes:**
1. In the Vercel dashboard for `verian-bios`: disable automatic git deploys (disconnect from git or set to "No" for auto-deploy).
2. Production deploys are triggered manually via `vercel --prod` (Vercel CLI) or the Vercel dashboard "Redeploy" / "Deploy" button.
3. Staging (`verian-bios-staging`) continues to auto-deploy from `master` unchanged.

**How it works:**
```
master push → staging auto-deploys (unchanged)
             → production: no automatic deploy

To deploy production:
  vercel --prod   (or Vercel dashboard manual trigger)
```

**Pros:**
- Single setting change in the Vercel dashboard. No git workflow change.
- Production deploys are always explicit and intentional.
- No new branch to maintain.
- Vercel CLI is already available in the environment.

**Cons:**
- Production deploys require running a CLI command (small extra step vs. merge).
- If the Vercel CLI is not installed or the token expires, production deploy requires the dashboard.
- No automatic rollback if `vercel --prod` is run on the wrong commit — though the dashboard supports one-click rollback to any prior deployment.

**Verdict:** Lowest-friction separation. Best option for a solo developer or small team where production deploys are infrequent and intentional.

---

### Option D — Vercel preview environments (separate staging environment per PR)

**What changes:** Use Vercel's built-in preview deployments for staging validation instead of the current dedicated staging project. The `verian-bios-staging` project would be retired.

**How it works:**
- Every branch/PR gets an auto-generated preview URL (e.g., `verian-bios-git-feature-branch.vercel.app`).
- `master` deploys only to `verian-bios` (production).
- Staging validation is done on the per-commit preview URL before merging to `master`.

**Pros:**
- Closer to a standard Vercel workflow.
- Eliminates the dedicated staging project and its Supabase staging project cost.

**Cons:**
- Requires setting up a separate preview Supabase environment or using production Supabase for previews (unsafe).
- The staging Supabase project (`smbausuyetlgxflyhmfg`) would need to be decommissioned or repurposed.
- More complex to set up; incompatible with the current staging foundation.
- Overkill at this stage.

**Verdict:** Not recommended. Adds complexity and breaks the established staging environment.

---

## 5. Recommended Option

**Recommendation: Option C — Disable automatic git deploys on the production Vercel project.**

### Rationale

| Factor | Assessment |
|--------|------------|
| Friction | Minimal — one Vercel dashboard setting change, no git workflow change |
| Risk at change time | None — disabling auto-deploy does not affect the current production deployment |
| Production safety | High — every production deploy becomes a deliberate, explicit CLI or dashboard action |
| Staging continuity | Unchanged — staging continues to auto-deploy from master as it does today |
| Rollback capability | Full — Vercel dashboard supports instant rollback to any prior deployment |
| Future scalability | Good — can migrate to Option B later if team grows and branch-based workflow becomes preferable |

Option B is also valid and is the natural upgrade if a team with multiple developers joins the project. Option C is easier to implement now and achieves the same separation goal.

### Resulting workflow after Option C

| Event | Staging | Production |
|-------|---------|------------|
| Push to `origin/master` | Auto-deploys | No deploy |
| Staging smoke passes | (already deployed) | Run `vercel --prod` to deploy |
| Supabase migration needed | Apply to staging via CLI | Apply to production via CLI separately |
| Emergency rollback | Push a revert to master | Vercel dashboard → Deployments → Redeploy prior deployment |

---

## 6. What Should Not Change Yet

The following must not be changed until this design is approved and an implementation plan is followed:

- **Vercel project settings** — no changes to either Vercel project's git connection or auto-deploy setting
- **Production Supabase** — remains untouched
- **Staging Supabase** — remains untouched
- **`origin/master`** — no pushes, no new commits, no tags
- **`docs/ai-context/05_ACTIVE_GUARDRAILS.md`** — guardrails remain as written
- **Any Next.js app code** — this is an infrastructure-only change

---

## 7. Verification Checklist

After the selected option is implemented, verify all of the following before declaring Track A complete:

### For Option C (recommended)

- [ ] Vercel dashboard: `verian-bios` project shows auto-deploy as disabled (or git disconnected)
- [ ] Push a test commit to `origin/master` — only `verian-bios-staging` deploys, not `verian-bios`
- [ ] `verian-bios-staging` deployment URL is reachable and loads the workspace correctly after the test push
- [ ] `verian-bios` deployment URL continues to serve the last manually deployed commit (not the test push)
- [ ] Vercel CLI `vercel --prod` from the project root targets the correct `verian-bios` project
- [ ] Manual deploy via `vercel --prod` successfully deploys to `verian-bios.vercel.app`
- [ ] Production URL remains accessible and shows the deployed commit

### For Option B (if chosen instead)

- [ ] `production` branch exists and is at the current `master` HEAD
- [ ] Vercel dashboard: `verian-bios` project is connected to `production` branch instead of `master`
- [ ] Push to `master` deploys only `verian-bios-staging`
- [ ] Push or merge to `production` deploys only `verian-bios`
- [ ] Both environments are accessible and functional after the branch change
- [ ] `docs/ai-context/` files updated to reflect the new branch model

---

## 8. Rollback / Safety Considerations

### If Option C is implemented and something goes wrong

| Scenario | Recovery |
|----------|----------|
| Production site goes down after disabling auto-deploy | Vercel dashboard → Deployments → Redeploy the last known-good deployment (one click) |
| `vercel --prod` deploys wrong commit | Vercel dashboard → Deployments → Instant rollback to prior deployment |
| Vercel CLI token expired | Use Vercel dashboard manual deploy or re-authenticate |
| Re-enable auto-deploy needed urgently | Vercel dashboard → Project Settings → Git → re-enable auto-deploy on master |

### If Option B is implemented and something goes wrong

| Scenario | Recovery |
|----------|----------|
| Wrong branch deployed to production | Vercel dashboard rollback, or reset `production` branch to the correct commit |
| `production` branch diverges from `master` | Merge or fast-forward to reconcile; no data risk |
| Both projects deploy from wrong branch | Restore correct branch settings in Vercel dashboard |

### What is never at risk

The following cannot be affected by any Vercel project setting change:
- Production Supabase data
- Staging Supabase data
- Database migrations
- Environment variable values (managed in Vercel dashboard, not in git)
- Git history on any branch

---

## 9. Open Questions

| # | Question | Relevant To |
|---|----------|-------------|
| Q1 | Is `verian-bios.vercel.app` currently serving live users, or is it still pre-launch? | Urgency of fix; if pre-launch, current shared trigger is tolerable for longer |
| Q2 | Is the Vercel CLI authenticated for this project? (`vercel ls` from the project root) | Required to verify Option C's manual deploy path before committing to it |
| Q3 | Does the project use any Vercel environment variables that differ between staging and production? | Relevant to ensuring a production deploy picks up the correct env vars |
| Q4 | Should the production Vercel project remain on `verian-bios.vercel.app` or be pointed to a custom domain before launch? | Separate from deploy flow; may affect rollback UX |
| Q5 | Is there a preference for Option B (branch-based) over Option C (manual deploy) if a team member will join later? | Affects the upgrade path |

---

## 10. Approval Checkpoint

This document must be reviewed and approved before any Vercel settings changes are made.

**Required approvals before implementation:**

- [ ] User confirms the recommended option (C or B) or selects an alternative
- [ ] User confirms the verification checklist is sufficient
- [ ] User confirms open questions Q1–Q5 are resolved or accepted as out-of-scope
- [ ] User explicitly authorizes the Vercel dashboard settings change

**Implementation sequence (after approval):**

1. Change one Vercel setting (Option C: disable auto-deploy on `verian-bios`; or Option B: change branch)
2. Run verification checklist
3. Update `docs/ai-context/00_CURRENT_STATUS.md` and `05_ACTIVE_GUARDRAILS.md` to reflect the new deployment model
4. Commit documentation update
5. Push

**This document will be superseded by an implementation plan once an option is approved.**
