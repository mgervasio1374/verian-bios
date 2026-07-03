# Operational Twin — North Star

**Type:** Conceptual thesis / vision (sits *above* the schema and slice work)
**Status:** Not scheduled. North Star only. No code, no schema, no migration implied by this document.
**Audience:** Anyone designing the build-provenance substrate, the operator/support agents, or the orchestration layer.
**Relationship to current work:** This is the "why" above Goal 5 (Verian Agent Bridge / Orchestration Layer) and above the future build-provenance substrate slices. Every design doc that touches recorded reasoning, agent operation, or support orchestration should be consistent with the principles below.
**Last updated:** 2026-06-08

---

## 1. The thesis: state-of-the-world vs. state-of-mind

Every piece of software ever built maintains a **state of the world** — the database. The CRM row, the order status, the queue item, the migration number. It records *what is true*.

What conventional software has never maintained is a **state of mind** — the deliberation that produced those rows: the conversations, meetings, engineering motives, rejected alternatives, and intent behind every decision. A form submission is a decision with its reasoning amputated.

The result is that human-centric software is **causally amnesiac**: it knows *what* is true, never *why* it became true.

The "why" doesn't actually vanish — it lives in **wetware and ephemeral channels** (people's heads, meetings, chat threads). The *organization* is the index. This is why software gets dumber when people leave even though not a line of code changed: the index walked out the door.

> **AI's real advantage is not speed. It is the ability to persist thought.**
> AI-native software can internalize the index — moving institutional memory out of the org chart and into the substrate.

That single shift — adding a durable *state of mind* alongside the *state of the world* — is the foundation of everything below.

## 2. Why this makes software supportable by agents

As a system accumulates dense, machine-generated reasoning, that context exceeds any human's ability to hold or transfer it. The "why" becomes too voluminous and interconnected for a support engineer to learn and pass on human-to-human.

At that point support **must** become agent-mediated: an agent traverses the mind-map and hands the human a conclusion. Human-to-human knowledge transfer (lossy onboarding, tribal knowledge) stops being the support mechanism.

This is the **operational twin**: a support intelligence, born alongside the software, that holds its state of mind and can answer "why does this exist / why did this break / was this intended."

## 3. The operator / support loop

Two distinct agent roles close the loop:

| Role | Responsibility | In Verian today |
|---|---|---|
| **Operator agent** | Runs the tasks humans used to run | The messaging pipeline agents; the Verian Agent Bridge proposing work |
| **Support agent** | Holds the recorded thoughts; gets escalated to | (Not yet built) — reads the substrate, explains the "why" |

The loop:

```
operator acts → records thought → hits an issue → queries support agent
   → support agent traverses the mind-map → returns resolution
   → resolution is recorded as a NEW thought (loop closes)
```

**The loop must close or the support agent goes stale.** Operator failures and support resolutions have to feed back into the substrate, or the mind-map ages into fiction. The Learning Agent is the embryo of this flywheel at the analytics layer; the operator/support loop is the same flywheel at the task layer.

## 4. The two halves of one mind

Support orchestration needs *both* halves, because real incident questions cross the seam between them:

| Half | What it captures | Backing (existing or planned) |
|---|---|---|
| **Runtime thoughts** | What the agents think *as they operate* | `agent_runs`, `agent_decisions`, `activity_events`, bridge **audit ledger** (exists) |
| **Build thoughts** | *Why the system is shaped the way it is* | Build-provenance substrate: `build_events`, `build_decisions`, `build_units`, `build_requirements`, `build_knowledge_snapshots` (planned) |

The two domains join through the existing polymorphic subject reference (`subject_type` / `subject_id`): adding `subject_type = 'build_unit'` lets a runtime incident point directly at the code unit, then traverse to the decision and the originating requirement.

## 5. Architecture layers (recap)

The twin is the runtime substrate pattern, cloned and pointed at a second domain. Five layers, kept separate on purpose:

1. **Capture** — passive recorders (coding-agent session hooks, git hooks). Dumb and fast; never block or fail the work being recorded.
2. **Substrate** — append-only event log + derived knowledge graph. *This is the moat.* Immutable raw record.
3. **Distillation** — incremental, advisory roll-up into queryable knowledge (a "Memory Agent" cloned from the Learning Agent).
4. **Orchestration** — the operator/support runtime (the Verian Agent Bridge).
5. **Accountability** — SLAs, human gates, audit trail.

## 6. Non-negotiable principle: intelligence must not outrun auditability

The seductive end-state — "so intelligent that only AI can support it" — is also the failure mode this project's entire safety culture exists to prevent. A system only agents can understand is an **oracle no human can audit**.

That directly contradicts Verian's design DNA: kill switches, dry-run-only bridges, human approval gates, "michael must approve." Those exist precisely so intelligence never outruns human authority.

Therefore:

- The support agent's job is **not** to replace human comprehension. It is to **make the "why" legible to a human on demand** — translate the mind-map into something a person can verify and overrule.
- The human **exits the rote knowledge-transfer loop** but **stays firmly in the intent and governance loop**.
- Every increase in autonomy must be matched by an increase in explainability. Legibility is a first-class feature, not an afterthought.

> Build the mind. Keep it auditable. That clause is the entire difference between an operational twin and an oracle you become afraid to turn off.

## 7. Design principles (derived)

1. **The moat is distillation, not recording.** Raw thought is high-volume, low-signal — a landfill until structured. Anyone can record; the value is the graph, the dedup, the causality edges, and the retrieval. Budget effort accordingly: the recorder is an afternoon; the distillation is the company.
2. **Capture is decoupled from substrate.** Recording can begin with zero schema (file-based JSONL/markdown via hooks) and be backfilled later. This means capture of in-flight work (e.g., Goal 5) can start *now* without disrupting it.
3. **Capture at the moment of action.** The "why" is free at build/run time and unrecoverable later. Six months on, it is archaeology.
4. **Advisory and append-only, always.** Mirrors the existing substrate: raw records are immutable; derived knowledge is advisory and recomputed. Corrections are new rows.
5. **Reuse the trusted pattern.** Clone the runtime substrate's shape (repos, event-type enums, tenant/workspace scoping, Inngest-scheduled distillation) rather than inventing a new system.

## 8. Relationship to existing work

- **Goal 5 (Agent Bridge)** is the orchestration runtime that will eventually consume this provenance. A bridge **task packet** is already a recorded thought (intent, policy_id, risk, evidence, stop conditions); the **audit ledger** is the append-only thought-stream; the **review queue** is the governance gate.
- The **runtime half of the mind already exists**. The build half is the net-new work.
- The build-provenance schema is **future, deliberate work** that must go through the standard Design → approval → Plan → approval → code gate, and must not interfere with in-flight Goal 5 slices or the migration counter.

## 9. Explicit non-goals / guardrails for any work under this North Star

- No execution, sending, automation, background jobs, or external model calls are implied by this vision.
- No production touch. Production remains a hard stop.
- Build-provenance is internal tooling about Verian's own repo — it would live under a **reserved system tenant**, not in customer RLS paths, and need not cross into production.
- This document creates no schema and reserves no migration number.

## 10. Open questions (to resolve when the build half is scheduled)

- Tenancy model when the twin is generalized beyond Verian's own repo (per-repo vs. per-customer).
- Where the support-agent query surface lives (extend agent-monitor vs. a dedicated "Codebase Memory" view vs. inside the Bridge).
- How "legibility on demand" is concretely specified and tested as a first-class requirement.
- Distillation cadence and cost controls for the Memory Agent.

---

### One-line synthesis

Traditional software is **all world, no mind** — which is exactly why it cannot support itself and needs humans to carry the "why" in their heads. AI-native software adds a **persistent, auditable state of mind** alongside the state of the world. That combination is what makes the software supportable by agents and progressively autonomous — *so long as the mind stays legible to the humans who govern it.*
