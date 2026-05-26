# Deployment Flow Cleanup — Option C Implementation Plan

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before touching Vercel settings
**Design doc:** `docs/roadmap/deployment-flow-cleanup-design.md`
**Approved option:** Option C — disable automatic Git deploys on the production Vercel project

---

## 1. Objective

Prevent the `verian-bios` production Vercel project from auto-deploying on every push to `origin/master`, while leaving the `verian-bios-staging` project's auto-deploy behavior unchanged.

After this change:

| Event | `verian-bios-staging` | `verian-bios` (production) |
|-------|-----------------------|---------------------------|
| Push to `origin/master` | Auto-deploys | No automatic deploy |
| Manual `vercel --prod` | N/A | Deploys to production |
| Vercel dashboard manual trigger | N/A | Deploys to production |

No code, migrations, or Supabase changes are required. This is a Vercel dashboard settings change only.

---

## 2. Current Confirmed Deployment Behavior

Established during Phase 3C.2 staging validation (2026-05-26):

| Vercel Project | URL | Auto-deploy trigger | Status |
|----------------|-----|---------------------|--------|
| `verian-bios-staging` | `https://verian-bios-staging.vercel.app` | `master` branch push | Active |
| `verian-bios` | `https://verian-bios.vercel.app` | `master` branch push | Active — **this must be changed** |

Both projects are connected to `master` in the Vercel dashboard. There is no `vercel.json` in the repository. No file in the repo governs this — the setting lives entirely in the Vercel dashboard.

Current deployed commit on both projects: `b5ab433` (Phase 3C.2 implementation) or later.

---

## 3. Exact Vercel Setting to Change

**Project:** `verian-bios` (production)
**Setting location:** Vercel Dashboard → Project `verian-bios` → Settings → Git
**Setting name:** "Connected Git Repository" / "Production Branch" auto-deploy
**Change:** Disable automatic deployments triggered by Git pushes to `master`

Two equivalent approaches in the Vercel dashboard:

**Approach C1 — Disconnect Git integration entirely:**
- Remove the Git repository connection from the `verian-bios` project.
- Result: No automatic deploys ever. All deploys are manual (CLI or dashboard).
- Manual deploy path: `vercel --prod` (deploys the current local build) or Vercel dashboard "Deploy" button using a specific commit.

**Approach C2 — Use "Ignored Build Step" to always skip auto-deploy:**
- In Vercel project settings, set the "Ignored Build Step" command to `exit 1`.
- Result: Every push triggers a build attempt but the build is immediately cancelled.
- Manual deploy path: Still works via `vercel --prod` or dashboard redeploy of a specific deployment.
- Note: This is a workaround, not a clean setting. C1 is preferred.

**Recommended approach: C1 — disconnect Git integration on `verian-bios`.**

The `verian-bios-staging` project's Git connection to `master` must not be changed.

---

## 4. Step-by-Step Implementation Sequence

```
Step 1  Pre-change verification
        Confirm current git state (clean, HEAD at bdd6b00)
        Confirm current Vercel deployment state for both projects
        Confirm staging is currently auto-deploying from master

Step 2  Change Vercel setting
        Open Vercel dashboard → verian-bios project → Settings → Git
        Disconnect Git repository (Approach C1)
        Save / confirm the change

Step 3  Verify the setting was saved
        Confirm the verian-bios project no longer shows a connected Git repo
        Confirm the verian-bios-staging project still shows master as connected

Step 4  Test push
        Make a minimal documentation-only commit (1 line change to a docs file)
        Push to origin/master
        Observe: verian-bios-staging deploys; verian-bios does not

Step 5  Confirm staging still works
        After the test push deploys to staging, confirm staging URL is reachable

Step 6  Confirm production did not auto-deploy
        Vercel dashboard: verian-bios shows no new deployment triggered by the test push

Step 7  Manual production deploy test
        Run: vercel --prod
        Confirm production URL serves the deployed commit

Step 8  Revert the test commit (if made on a docs-only file)
        Or keep the test commit if it is a valid documentation improvement

Step 9  Update documentation
        Update docs/ai-context/00_CURRENT_STATUS.md
        Update docs/ai-context/05_ACTIVE_GUARDRAILS.md
        Commit and push the documentation update

Step 10 Final lock
        Declare Track A complete
```

---

## 5. Pre-Change Verification

Run these before touching any Vercel setting:

```
git status --short
```
Expected: empty output (working tree clean)

```
git log --oneline -3
```
Expected: HEAD is `bdd6b00 Docs: add deployment flow cleanup design`

```
git rev-parse HEAD
```
Expected: `bdd6b00...` (full SHA confirming correct commit)

Vercel dashboard checks (manual, no CLI needed):
- Open `https://vercel.com` → Project `verian-bios-staging` → Settings → Git
  - Confirm: Connected to `mgervasio1374/verian-bios`, branch `master`
- Open `https://vercel.com` → Project `verian-bios` → Settings → Git
  - Confirm: Connected to `mgervasio1374/verian-bios`, branch `master` (this is what will change)
- Note the currently deployed commit SHA for `verian-bios` (for rollback reference)

---

## 6. Vercel Dashboard Steps (Option C1)

These steps are for guidance. Do not execute until this plan is approved.

1. Log in to `https://vercel.com` with the account that owns both projects.
2. Navigate to the `verian-bios` project (not `verian-bios-staging`).
3. Click **Settings** in the top navigation.
4. Click **Git** in the left sidebar.
5. Under "Connected Git Repository", click **Disconnect** (or the equivalent button to remove the Git connection).
6. Confirm the disconnection when prompted.
7. Verify: the Git section now shows no connected repository (or shows "Not connected").
8. Do **not** touch the `verian-bios-staging` project settings.

After saving, the `verian-bios` project will no longer receive automatic deployments from Git pushes. Existing deployments remain live and the production URL (`verian-bios.vercel.app`) continues to serve the last deployed commit.

---

## 7. CLI Verification Steps

After the dashboard change, verify using the Vercel CLI:

```
vercel ls
```
Expected: lists both `verian-bios` and `verian-bios-staging` projects with their deployment history.

```
vercel project ls
```
Expected: both projects listed; no error.

To confirm the `verian-bios` project is the target for `vercel --prod`:
```
vercel project
```
Or navigate to the project root and confirm `.vercel/project.json` targets `verian-bios` (if a local link exists).

If no local project link exists, link it:
```
vercel link
```
Follow prompts to select `verian-bios`. This creates `.vercel/project.json` locally (not committed to git unless `.vercel/` is in the repo — check `.gitignore` first).

---

## 8. Test Push Strategy

After the Vercel setting change, validate with a minimal test push.

**What to push:** A single-line documentation edit — for example, adding a "Track A implementation in progress" note to `docs/ai-context/00_CURRENT_STATUS.md`, or adding a blank line to any docs file. This produces a real push to `origin/master` without affecting code.

**Why a real push is needed:** The Vercel auto-deploy trigger fires on GitHub webhook events. The only reliable way to confirm the production project no longer auto-deploys is to observe a real push event and confirm no deployment appears in the `verian-bios` Vercel dashboard.

**What to watch for:**
- Vercel dashboard: `verian-bios-staging` shows a new deployment triggered by the push (expected).
- Vercel dashboard: `verian-bios` shows no new deployment (expected — confirms the change worked).

**Timing:** Vercel deployments typically appear within 30–60 seconds of the push. Wait at least 2 minutes before declaring no deployment occurred.

---

## 9. How to Confirm Staging Still Auto-Deploys

After the test push:

1. Open Vercel dashboard → `verian-bios-staging` → Deployments tab.
2. Confirm a new deployment is listed with the SHA of the test push commit.
3. Confirm the deployment status is "Ready" (or "Building" if still in progress).
4. Confirm the staging URL (`https://verian-bios-staging.vercel.app`) is reachable.

Optional CLI check:
```
vercel ls verian-bios-staging
```
Expected: most recent deployment corresponds to the test push commit.

---

## 10. How to Confirm Production Did Not Auto-Deploy

After the test push:

1. Open Vercel dashboard → `verian-bios` → Deployments tab.
2. Wait 2 minutes after the push.
3. Confirm: no new deployment appears with the test push commit SHA.
4. Confirm: the most recent `verian-bios` deployment is still the last manually-deployed or auto-deployed commit from before the setting change.

Optional: note the "Last deployment" timestamp in the dashboard — it should not have updated since the test push.

---

## 11. How to Manually Deploy Production After the Change

Once auto-deploy is disabled, production deploys must be triggered explicitly. Two methods:

### Method A — Vercel CLI (`vercel --prod`)

From the project root with a clean working tree at the intended commit:

```
git checkout master          # ensure correct branch
git pull origin master       # ensure latest commit is local
vercel --prod                # deploys to verian-bios production
```

The CLI will build from the local project and deploy to the production URL. The deployed commit will match the local HEAD.

If prompted to link a project, select `verian-bios`.

### Method B — Vercel Dashboard manual deploy

1. Open Vercel dashboard → `verian-bios` → Deployments tab.
2. Find the target deployment (e.g., the most recent staging-verified commit).
3. Click the `...` menu → **Redeploy** (or "Promote to Production" if using preview deployments).
4. Confirm.

Method B is useful for redeploying a prior commit without running the CLI.

### Method C — Vercel Dashboard "Deploy" from a specific Git commit

If the Git repository is disconnected (Approach C1), this option may not be available. Use Method A or B.

---

## 12. Rollback Plan

### Rollback scenario: change caused unexpected issues

If the Vercel setting change causes unexpected problems (e.g., the production project stops serving requests), rollback immediately:

1. Open Vercel dashboard → `verian-bios` → Settings → Git.
2. Reconnect the Git repository to `master`.
3. Trigger a manual redeploy from the last known-good commit.
4. Confirm production URL is serving correctly.
5. No code change, no git revert required — this is a dashboard settings change only.

### Rollback scenario: test push accidentally deployed to production

If the test push somehow triggered a production deploy (indicating the setting change did not take effect):

1. Open Vercel dashboard → `verian-bios` → Deployments tab.
2. Find the deployment immediately prior to the test push.
3. Click `...` → **Promote to Production** to restore the prior version.
4. Then re-confirm the disconnect setting is saved correctly.

### Rollback scenario: staging auto-deploy broke

If staging stops auto-deploying after the change (indicating wrong project was disconnected):

1. Open Vercel dashboard → `verian-bios-staging` → Settings → Git.
2. Reconnect to `mgervasio1374/verian-bios`, branch `master`.
3. Trigger a manual redeploy on staging to restore continuous deployment.

---

## 13. Risks

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Wrong Vercel project disconnected (`verian-bios-staging` instead of `verian-bios`) | Low | Medium | Pre-change verification: confirm which project is which before touching settings. Tab titles and project slugs are clearly labeled in the Vercel dashboard. |
| Production URL goes offline after disconnect | Very low | Medium | Existing deployments remain live regardless of Git connection state. Disconnect only affects future auto-deploys, not the currently served deployment. |
| `vercel --prod` targets wrong project | Low | Low | Verify with `vercel project` before running `--prod`. The CLI confirms the linked project before deploying. |
| Test push accidentally triggers production deploy | Very low | Low | This would mean the setting change did not take effect — rollback by re-checking the disconnect setting. No data at risk. |
| Staging deployment breaks during test push | Very low | Low | Staging is the CI target; any break would be visible immediately and reversible by reverting the test commit. |

No risk in this plan can affect production Supabase, database data, or test results.

---

## 14. What Must Not Be Changed

| Item | Status |
|------|--------|
| `verian-bios-staging` Vercel project Git settings | Must not change — staging must continue to auto-deploy from master |
| Production Supabase | Must not be touched |
| Staging Supabase | Must not be touched |
| Any Next.js app code | Must not change — this is infrastructure only |
| Database migrations | Must not create or apply any |
| `origin/master` branch history | Must not rebase, force-push, or reset |
| Phase 3A–3C.2 locked modules | Must not modify |
| Phase 3C.3 | Must not start |
| Git tags | Must not create or push new tags |

---

## 15. Documentation Files to Update After Verification

After the test push confirms the setting change worked and production is verified via manual deploy, update:

| File | Change |
|------|--------|
| `docs/ai-context/00_CURRENT_STATUS.md` | Update deployment behavior description; note production Vercel no longer auto-deploys from master; note manual deploy path |
| `docs/ai-context/05_ACTIVE_GUARDRAILS.md` | Update "Deployment Guardrails" section to reflect the new model; remove or revise the advisory recommendation (Track A was completed); add note on manual deploy requirement for production |
| `docs/ai-context/06_GIT_MILESTONES.md` | Add Track A completion to the QA verification log |

These updates should be committed and pushed as a single documentation commit after implementation is verified, separate from the test push.

---

## 16. Final Approval Checkpoint Before Touching Vercel Settings

This plan must be reviewed and approved before any Vercel dashboard changes are made.

**Required approvals:**

- [ ] User approves this implementation plan
- [ ] User confirms pre-change verification will be run first
- [ ] User confirms Approach C1 (full Git disconnect) over Approach C2 (ignored build step)
- [ ] User confirms the test push strategy is acceptable
- [ ] User authorizes the Vercel dashboard settings change

**Not required (already approved):**
- Option C was approved as the design choice in the Track A design document
- No code, migration, or Supabase changes are in scope

**Sequence after approval:**

```
Approve this plan
  → Run pre-change verification (git status, Vercel dashboard check)
  → Change Vercel setting (disconnect Git on verian-bios)
  → Run CLI verification
  → Make and push test commit
  → Observe: staging deploys, production does not
  → Run manual vercel --prod to confirm production deploy path works
  → Update documentation files
  → Commit and push documentation
  → Declare Track A complete
```
