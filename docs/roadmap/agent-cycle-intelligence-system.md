# Agent Cycle & Intelligence Design System

> Status: v0.1 design (2026-06-23). Operational spec for how Verian agents PRODUCE,
> are GRADED, LEARN, and EVOLVE — and the two feeds (manual + automated) that drive
> learning. Complements `agent-learning-loop-design.md` (principles) and
> `verian-learning-loop-moat` / `verian-agent-platform-horizons` (strategy). This doc
> is the *cycle mechanics* + the *skill-model generalization* + the *slice plan*.

## 1. Thesis

The LLM is a generic starting point. The moat is the **per-tenant learned intelligence**
distilled into agent **skills** over many cycles. An agent should behave like a seasoned
321 Swipe employee, not a freshly-prompted model. The Agent Cycle is the machine that
turns sends + outcomes + human judgment into compounding, inspectable skill.

Two non-negotiables:
- **Glass box.** Every learning step is inspectable: signal → extracted insight →
  proposed delta → human approval → applied version → measured effect. Build glass-first.
- **Distillation, not accumulation.** Skill *count* stays small; skills get *smarter*
  via versions carrying provenance + win-rate. The Skills page is a changelog of an
  employee improving, not a pile of emails.

## 2. The Agent Cycle

```
        ┌──────────►  PRODUCE  ──────────┐
        │   agent generates, injecting     │
        │   its resolved skill(s)          ▼
   EVOLVE                                 GRADE
   skill gets a new version          (a) Quality Review (LLM judge)  = PROXY, fast inner loop
   w/ provenance + win-rate          (b) real outcomes (open/click/   = TRUTH, slow outer loop
   resolver selects best version          reply/meeting/signed)
        ▲                                  │
        └───────────  LEARN  ◄─────────────┘
              distill signals → skill deltas
              (manual feed + automated feed)
```

- **PRODUCE** — each agent resolves its skill(s) and injects them into its prompt /
  decision. Today only Copywriting does this; generalizing it is Slice 2.
- **GRADE** — two graders, deliberately:
  - *Proxy (inner loop):* the **Quality Review** agent — an LLM-as-judge rubric. Fast,
    cheap, runs every draft. A proxy: a model grading a model. Never the source of truth
    for "best."
  - *Truth (outer loop):* real recipient behavior — delivered/opened/clicked/replied,
    and downstream meeting/signed/revenue. Captured by the **Learning Agent** (telemetry)
    and **inbound reply capture** (P3.5). Slow, sparse, but ground truth.
- **LEARN** — distill graded signal into a proposed **skill delta**. Two feeds (§5).
- **EVOLVE** — an approved delta becomes a new skill *version* (provenance + win-rate).
  The resolver selects the active/best version; rollback = repoint the resolver. This is
  where distillation lives: we version, we don't pile.

## 3. Current substrate (code-verified 2026-06-23)

What exists, and what the cycle must bridge:

- **`learned_skills` table** (`20240063`): `tenant_id` (NULL = global tier), `skill_family`,
  `skill_slug`, `skill_version`, `category`, `definition` jsonb, `status`
  (active/draft/retired), `source` (seed/learned/human). Unique on
  `COALESCE(tenant, zeros)+family+slug+version`. Repo:
  `modules/messaging/skills/learned-skill.repo.ts` (get/list/upsert/retire).
- **Static seed (the "21 skills")** — `copywriting-agent.skill-definitions.ts`
  (`SKILL_LIBRARY`, `getAllSkillDefinitions`). The Agent Lab count =
  `seedSkills(static) + learnedSkills(DB rows for family)`.
- **Resolver** — `resolveCopywritingSkill` only (3-tier: tenant DB → global DB → static
  seed). **No generic per-family resolver yet.**
- **The 4 bare agents** (`message_strategy_agent`, `quality_review_agent`,
  `subject_line_agent`, `personalization_agent`) — not in `AGENT_SKILL_FAMILY`; run on
  hardcoded prompts/decision logic with **no skill injection**. Subject Line +
  Personalization are gated/stubbed (no live service file).
- **Learning Agent** (`learning-agent.service.ts`) — reads activity/ET events, computes
  deterministic per-dimension signals (tone/message_type/sequence_position/…), writes
  `learning_snapshots`. **Advisory only — the loop is OPEN** (nothing reads signals back
  into generation).
- **Anti-Pattern Lab** (P1, shipped) — the *only* closed feedback loop today, but
  human-triggered and **copywriting-scoped** (`applyAntiPatternsAction` hardcodes
  `family='copywriting'`, source='learned', append-with-dedup, lineage in
  `anti_pattern_sources`).
- **Reply capture** (P3.5, shipped staging+prod, inert) — will deliver the reply signal
  once inbound transport is wired.

## 4. The skill model (generalized)

Generalize "skills are a copywriting thing" → "every agent has a skill family."

- **Family per agent** via `AGENT_SKILL_FAMILY` (extend from 1 → 5 messaging families).
- **Definition shape** — keep Copywriting's rich shape; add a generic
  `AgentSkillDefinition { skillSlug, skillVersion, category, name, guidance,
  requiredElements[], forbiddenElements[], examples[], antiPatterns[] }` for the new
  families (the `definition` jsonb is already shape-flexible).
- **Three tiers, one resolver** — `resolveAgentSkill(family, tenantId, slug, version)`:
  1. tenant DB row (learned/human override for THIS tenant — the moat),
  2. global DB row (cross-tenant learned default),
  3. static seed module (the authored baseline).
- **Three sources** (`source` column): `seed` (authored baseline), `learned`
  (loop-distilled), `human` (operator-edited). Source drives glass-box badges + gating
  (subtractive `learned` anti-patterns ship lighter than additive positive claims).

Skills per agent are grounded in the agent's job:
- *Message Strategy:* relationship-stage angle, customer-vs-prospect framing, statement
  evidence angle, objection pre-empt, channel constraints.
- *Quality Review:* compliance claim check, single-CTA, personalization presence, length
  band, brand-voice / no-em-dash. (These become the *rubric*.)
- *Subject Line:* specificity over curiosity, length < 50, value/company anchor, no
  clickbait / spam triggers.
- *Personalization:* structured fields only, no fabricated claims, one specific detail,
  natural not templated.

## 4a. Full agent inventory & cycle-classes (mapped 2026-06-23, system live)

The roster is **20 agents / 5 categories**. The critical design point: **not every agent
belongs in the outcome-learning loop.** Three cycle-classes:

- **Class A — Learning agents** (the moat). Full seed → wire → learn, per-tenant,
  outcome-driven. Messaging + the data/intelligence Business-Intel agents.
- **Class B — Governance agents** (seed + human-govern, NEVER outcome-learned). Policy /
  Safety + Execution. Compliance & safety are CONSTANTS by design
  ([[learning-loop-vs-constant-rule]]) — they get authored, versioned, glass-box policy
  "skills" for audit/liability, but must **never auto-drift from outcomes**. Deliberately
  excluded from the automated feed; that exclusion is a guardrail, not an omission.
- **Class C — Internal dev agents** (separate domain). Development. They build the product,
  not customer intelligence — governed by the dev process / operational-twin track, not
  merchant outcomes. Authored standards skills at most; **out of the customer cycle.**

**implState ladder:** `definition_only` → `skeletal` → `stub` → `gated` → `live`. Only
`live`/`gated` agents actually run (and have a consumption point); seeding skills for
`skeletal`/`definition_only` agents is documentary until they're built.

| Agent | Cat | implState | Workflow · step | Class | In the learning cycle? |
|---|---|---|---|---|---|
| Copywriting | msg | live | Email·2 / Seq·2 | A | ✅ only one with skills today (21 seed) |
| Message Strategy | msg | live | Email·1 / Seq·1 | A | ✅ seed pending (Slice 1) |
| Quality Review | msg | live | Email·5 / Seq·5 | A | ✅ it's the GRADER — its skills = the rubric |
| Subject Line | msg | gated | Email·3 | A | ✅ (gated) |
| Personalization | msg | gated | Email·4 | A | ✅ (gated) |
| Lead Scoring | BI | live | Intake·1 | A | ✅ rubric/signals learnable from conversion |
| Company Scoring | BI | live | Intake·2 | A | ✅ |
| Campaign Recommendation | BI | live | — (no workflow) | A | ✅ learnable from campaign performance |
| Learning | BI | live | Learning Loop ⊗ | A* | the LEARN **engine**, not a skill-consumer |
| Sales-Ops Intelligence | BI | skeletal | — | A | not runnable yet |
| **Statement Extraction** | BI | gated | Statement·1 | **A-evidence** | ✅ objective ground truth |
| **Statement Review** | BI | gated | Statement·2 | **A-evidence** | ✅ objective ground truth |
| Prompt Policy | P/S | gated | Governance ⊗ | B | seed policy only — NO auto-learn |
| Risk Classifier | P/S | skeletal | Governance ⊗ | B | seed only |
| Approval Gate | P/S | skeletal | Governance ⊗ | B | seed only |
| Execution Gate | exec | stub | Governance ⊗ | B | gate, no skills |
| Implementation | dev | definition_only | — | C | out of customer loop |
| Code Review | dev | definition_only | — | C | out |
| Architecture Review | dev | definition_only | — | C | out |
| Documentation | dev | definition_only | — | C | out |

(⊗ = cross-cutting workflow, no step order.)

**Three things this surfaces:**
1. **The evidence loop is the highest-value learning target.** Statement Extraction +
   Review work on **objective ground truth** (an extracted figure is verifiably right or
   wrong), unlike messaging's noisy proxy (a reply is weak signal). Per the learning-loop
   doc, the **first POSITIVE closed loop belongs here** — but both are `gated` (default-off)
   and depend on the OCR/extraction path (currently DOMMatrix-blocked on serverless, see
   [[mcm-v2-backlog]] pdf-parse note), so the evidence loop is design-ready but
   infrastructure-gated.
2. **The Learning agent is the engine, not a consumer.** It mines outcomes → signals; it's
   the LEARN stage personified. Closing the loop = wiring ITS output back into the other
   agents' skills (Slice 4), which it doesn't do today (advisory-only).
3. **Governance agents must stay out of the auto-learn feed.** Seed them with authored
   policy profiles (versioned, glass-box for audit — this IS the trust/liability moat), but
   never let outcomes mutate a safety rule. Class B's value is *stability + provenance*, not
   adaptation.

## 5. The two feeds into LEARN

### 5a. Manual feed (human-in-the-loop) — available NOW, zero data dependency

The operator teaches the agent directly. Three mechanisms, all glass-box, all
human-approved before they touch a skill:

- **Anti-Pattern Lab, generalized** (subtractive: "avoid X"). Paste known-bad examples
  → LLM extracts transferable failure patterns with rationale → human approves →
  appended to the family's skill. Today copywriting-only; generalize the family scope.
  Subtractive = lighter gating (can't fabricate a merchant promise).
- **Exemplars** (additive: "do it like this"). Promote a human-edited winner / golden
  example into the family's skill as a few-shot anchor (`copy_exemplars` already exists
  for copywriting; generalize).
- **Direct skill editing.** The operator edits a skill's guidance/rules and saves a new
  `human`-source version. Provenance recorded.

This is the highest-leverage near-term work: it makes the agents materially better with
*no live-send dependency*, and it's the operator turning the review they already do into
durable, compounding knowledge.

### 5b. Automated feed (outcome-driven) — design now, BUILD gated on live volume

Close the Learning Agent loop:
1. **Attribution** — on a graded outcome (open/click/reply/meeting/signed), attribute it
   back to the skill *version* that produced the message. Requires every generation to
   record which (family, slug, version) it injected — a small instrumentation add in the
   PRODUCE step.
2. **Scorecards** — maintain per-skill, per-tenant outcome scorecards (win-rate, sample
   N, confidence tier — the Learning Agent's confidence ladder already exists).
3. **Proposed deltas** — when a skill version under/over-performs with sufficient
   confidence, propose a delta (a new version) into the same human-approval queue the
   manual feed uses. **Human-reviewed first; auto-apply only above a confidence threshold,
   later.**
4. **Regression discipline** — "why is v3 < v2?" needs distribution-not-n=1,
   per-dimension localization, and rollback (resolver repoint). Build it; a naive system
   can't explain *why* it learned.

Critical sequencing: the automated feed is worthless until real outcome VOLUME flows
(live campaigns on the warmed subdomain). Design it now so the PRODUCE-step
instrumentation lands early; build the attribution/scorecard/delta machinery when there's
signal. **Every new generation path must route through the agent + record its skill
version, or it's an un-learnable side channel** (the standing rule — see the rewrite-loop
caution in `verian-learning-loop-moat`).

## 6. Glass box & the Agent Lab as cockpit

The Agent Lab is the operator's window into the cycle: per-agent skills (with source
badges + versions), runs/decisions/traces, guardrails, and — as this builds out — the
learning changelog (proposed deltas, approvals, win-rate per version). The "external
product" later gets a *visibility dial* that redacts mechanism but keeps result, so
customers/competitors can't lift the distilled knowledge. Build glass-first internally to
perfect it.

## 7. Phased slice plan

| # | Slice | Tag | Gated on | Notes |
|---|---|---|---|---|
| 1 | **Seed** starter skills + generalize skill model (families, generic shape, seed registry, generic resolver plumbing) | `mcm-v2-seed-agent-skills-v1` | — | substrate + visibility; no behavior change; no migration |
| 2 | **Wire** `resolveAgentSkill` injection into live agents (Message Strategy, then Quality Review) | `…-skill-injection-v1` | Slice 1 | makes seeds real + learnable; records injected version (5b instrumentation) |
| 3 | **Manual feed** — generalize Anti-Pattern Lab + exemplars to all agents | `…-manual-intelligence-feed-v1` | Slice 2 | the human teaching loop; high value, no data dep |
| 4 | **Automated feed** — outcome→skill attribution, scorecards, proposed deltas | `…-outcome-learning-loop-v1` | Slice 2 + **live send volume** | design-ready now; build at first campaign |

**Seeding scope by class** (Slice 1 generalizes the model; *which* agents get seeded, in order):
- **Class A first, runnable-with-a-consumption-point only:** the 4 bare messaging agents
  (Slice 1 as spec'd), then the live BI agents (Lead Scoring, Company Scoring, Campaign
  Recommendation) — Slice 1b. The `gated` evidence agents (Statement Extraction/Review)
  seed alongside but their loop is infra-gated (OCR/DOMMatrix).
- **Class B as policy seed** (separate slice, separate gating): authored policy profiles for
  Prompt Policy / Risk Classifier / Approval Gate — human-governed, NO auto-learn wiring.
- **Class C deferred:** dev agents are `definition_only` and belong to the operational-twin
  track — author standards skills only if/when they go operational; **not** part of the
  customer cycle. (The operational-twin north-star doc is off-limits; this doc only notes
  the boundary.)
- Skeletal/definition_only agents (Sales-Ops, Risk Classifier, Approval Gate, dev ×4,
  Execution) seed as documentation at most until they're built to `gated`+.

Beyond: Subject Line / Personalization service build-out (ungate them); reply-text
ingestion as a learning signal (P4); the evidence-loop closed cycle (Statement agents, once
OCR is unblocked — the first objective positive loop); cross-agent "council" review for
high-stakes deltas (see horizons doc).

## 8. Open decisions

1. **Wire order** — ✅ DECIDED 2026-06-23: **Quality Review first.** Its skills become the
   live grading rubric (defines what "good" means in the GRADE stage) and it gates every
   draft — highest leverage. Message Strategy second.
   ◦ **Seed scope** — ✅ DECIDED 2026-06-23: **all Class A + Class B policy** in the seed
   pass (messaging + live BI + gated evidence + governance policy profiles). Class C
   deferred. Governance seeds are source='seed', flagged non-learnable.
2. **Manual-feed primitive** — lead with generalized Anti-Pattern Lab (subtractive, safe)
   vs exemplars (additive) vs free editing. Rec: Anti-Pattern Lab first (proven, gated
   light), exemplars second.
3. **Auto-apply threshold** — what confidence + sample N earns auto-apply of a learned
   delta (vs always-human). Defer until scorecards exist; default always-human first.
4. **Definition shape** — keep per-family rich shapes vs one generic shape. Rec: generic
   shape for the 4 new families now; revisit if a family needs richer structure.

## 9. Grounding (file references)

- skills table/repo: `supabase/migrations/20240063_learned_skills.sql`,
  `modules/messaging/skills/learned-skill.repo.ts`
- copywriting seed/resolver: `modules/messaging/copywriting/copywriting-agent.skill-definitions.ts`,
  `copywriting-skill.resolver.ts`
- registry: `modules/intelligence/agent-roster.ts`,
  `modules/intelligence/agent-workflows.ts` (`AGENT_SKILL_FAMILY`)
- profile/cockpit: `app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/page.tsx`
- learning agent: `modules/messaging/learning-agent/learning-agent.service.ts`, `…signals.ts`
- anti-pattern lab: `modules/messaging/learning/anti-pattern-lab.actions.ts`,
  `anti-pattern-extraction.service.ts`, `anti_pattern_sources` table
- reply capture (P3.5): `app/api/webhooks/inbound-email/route.ts`,
  `modules/messaging/inbound/*`
