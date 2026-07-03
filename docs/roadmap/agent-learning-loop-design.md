# Agent Learning Loop — Design Document (v0.2 DRAFT)

Status: DRAFT for review. Author: architect + user, 2026-06-16. Not yet sliced.
v0.2 adds: expanded Grader (§4.2) incl. regression attribution (§4.2a), outcome capture &
BCC channel grounded in what's actually wired (§4.4), and the existing Learning Agent /
Resend-webhook / proposal-capture substrate. "Agent Monitor" is being renamed **Agent Lab**
(label only; route stays `/settings/agent-monitor`).
Scope: the copywriting agent first, but the model generalizes to the evidence agents
(statement extraction / proposal review). This doc defines *how an agent learns*, not a
single feature.

Related: [[verian-learning-loop-moat]], [[verian-evidence-layer-strategy]],
[[verian-proposal-review-agent-layer]], [[learning-loop-vs-constant-rule]].

---

## 1. The problem this solves

Today the Copywriting agent's "Skills" page shows 20 rows, all tagged **seed**. Each row
is a *structured rubric* (toneRules, messagingRules, requiredElements, forbiddenElements,
ctaGuidance, complianceNotes, examples, antiPatterns) — NOT an email. But two things are
true and both are problems:

1. **Nothing is learned yet.** Every skill is a hand-written seed. The rewrite path now
   *reads* skills (slice 3b) but nothing *writes* them except a human in the editor. The
   loop is **open**.
2. **The value can never come from accumulation.** A bigger pile of rubrics — or a bigger
   pile of example emails — is not intelligence. If the design were "store every generated
   email," then at 1k / 50k emails you'd have noise, not a moat. (For the record, the system
   does NOT do this: generated emails are never stored as skills; the separate `copy_exemplars`
   store is human-promoted and capped at 3 used per generation.)

**The thesis:** value comes from *distillation*, not accumulation. The skill count stays
~20; the skills get smarter. Each improvement is traceable to a signal. A competitor with
the same LLM cannot reproduce our skills without our outcome history. That gap is the moat.

---

## 2. Design principles

1. **Glass box (the clear computer case).** Every learning step is inspectable end to end:
   `input signal → extracted insight → proposed change → human decision → applied version →
   measured effect`. Nothing changes a skill invisibly. Internally we expose *everything*;
   a future external product gets a **visibility dial** (§8) that redacts the mechanism while
   keeping the result. We are building the see-through case now so we can understand and
   perfect the machine.
2. **Distillation, not accumulation.** Learning grows skill *quality* (new versions, sharper
   rules), never row *volume*. 20 skills get smarter; they do not become 20,000.
3. **Selection over volume — the right documents, not all.** ~95% of emails carry no signal
   and are ignored. We learn from the few that carry one (§4.1).
4. **Human-in-the-loop by default.** The agent *proposes* skill deltas; a human *approves*
   them (at least until trust is earned). Approval is itself a recorded signal.
5. **Objective truth first.** Where ground truth is exact (a corrected statement number), the
   loop closes cleanly and fast. Where it's a proxy (email reply/quality score), it's noisy
   and slow. Sequence accordingly (§6).
6. **Reversible and gated.** Every applied change is a new version; rollback = repoint to the
   prior version. All write paths sit behind a system control (default off), reusing the
   existing gating + telemetry substrate.
7. **Subtractive before additive.** "Never do X" (antiPatterns / forbiddenElements) is safer
   to auto-surface than "always do Y" (new positive claims), because it can't fabricate a
   merchant promise. The first loop we close is the subtractive one (§5 + §7).

---

## 3. The unit of value: a skill is an evolving rubric

A skill is a versioned, structured instruction set resolved at generation time
(`resolveCopywritingSkill`: tenant row → global row → static seed). Today it has one version
(seed). The learning loop adds **versions with provenance**:

```
cold_outreach v1 (seed)        — hand-written baseline
cold_outreach v2 (learned)     — antiPattern added from adversarial corpus (§5)
cold_outreach v3 (learned)     — messagingRules sharpened after 14 HVAC replies (§4)
```

Each version carries *why it exists* (the signal that drove it) and *how it performed*
(win-rate / grade delta). The Skills page stops being a list and becomes a **changelog of an
employee getting better**.

---

## 4. The learning loop

```
        ┌─────────────┐   select    ┌──────────────┐  distill   ┌───────────────┐
 events │  SIGNAL      │ ─────────▶  │  INSIGHT      │ ────────▶ │  SKILL DELTA   │
 ─────▶ │  taxonomy    │  (the few)  │  extraction   │  (LLM)    │  (proposed)    │
        └─────────────┘             └──────────────┘            └───────┬───────┘
                                                                         │ human gate
        ┌─────────────┐  measure    ┌──────────────┐  apply             ▼
        │  GRADE/      │ ◀────────── │  GENERATION   │ ◀──────── new skill version (v+1)
        │  WIN-RATE    │   per read  │  (reads skill)│
        └─────────────┘             └──────────────┘
```

### 4.1 Signal selection (the funnel)
Out of every send, classify the signal and keep only the bearing ones:

| Signal | Strength | Source (mostly exists) |
|---|---|---|
| Human **edited the draft** before approving | **Gold** | the diff between generated draft and sent copy |
| Reply / meeting booked / positive reply | Strong | inbound + reply classification |
| Approved as-is | Weak positive | approval events |
| Rejected by reviewer | Negative | approval events |
| Opened + clicked | Weak | Resend webhooks (tracking off by default) |
| Bounced / spam-flagged | Compliance-negative | Resend webhooks |
| **Curated bad email** (junk corpus) | Negative (seeded) | §5 — admin-supplied |
| Sent, no response yet | **None — ignored** | — |

The **human-edit diff is the highest-value signal**: a person literally showing the agent what
was wrong. Most of the loop's early intelligence should come from edits + the adversarial
corpus, because both exist *before* we have reply volume.

### 4.2 The Grader — fast inner-loop signal (already built)
The Grader is the email quality review (`reviewEmailDraftQuality` / the EmailQualityCard) — an
**LLM-as-judge** that scores every draft on **10 dimensions** (subject, opening, personalization,
value_clarity, cta, trust, brevity, spam_risk, brand_fit, human_tone) + overall (0–100) +
`strengths` / `weaknesses` / `risk_flags` + a suggested rewrite. Pass threshold **85**. It
already runs inside the rewrite loop (each candidate graded, best-by-score wins). The
per-dimension scores and weaknesses *are* inspectable reasoning — surfaced directly in the glass
box, no extra work.

In the learning loop it is the **grade per read**: attribute each generation's score to the
**skill version** that produced it, so each version accrues an average grade + a win-rate
distribution. We do **not** build grading from scratch.

**Caveat — it is a proxy, and it grades the model with the model.** It predicts *quality*, not
real replies, and can be circular/biased. So it is the **FAST inner loop** (instant, free, no
waiting for sends); **real outcomes (§4.4) are the SLOW outer loop that should eventually
*calibrate* it.** Trust the Grader to rank candidates and flag regressions now; trust real
outcomes to settle disputes later.

### 4.2a Regression attribution & rollback — "why did v3 score worse than v2?"
A single email's score is **noise**. A version's grade is a **distribution over many reads**. So
`v2=83, v3=78` means something only once v3's *average over N reads* drops below v2's — `n=1` is
LLM variance, not a regression. (Reuse the Learning Agent's existing **confidence tiers** —
insufficient / low / high by sample N; never act on *insufficient*.)

When a real distribution shift is confirmed, the system learns *why* in three steps:
1. **Localize** — the 10 per-dimension Grader scores show *which* dimension dropped (e.g.
   `human_tone` 85→70), not just the overall number.
2. **Attribute** — tie that dimension to the *specific rule changed* in the v2→v3 delta (e.g.
   "the `forbiddenElement` we added made the copy stilted").
3. **Correct or roll back** — the distiller proposes a corrective v4, or recommends **rollback to
   v2**. Rollback is one click (resolver repoints to the prior version). Human-gated.

So **yes — the system can learn *why* a version regressed**, but only because we build
distribution-aware grading + per-dimension localization + delta attribution. A naive "keep the
higher score" system would not. (For *additive/positive* deltas, confirm a Grader regression
against real outcomes before acting; *subtractive* deltas are safe to act on from the Grader
alone.)

### 4.3 Distillation (the new part)
On a cadence (or on demand), the agent reads only the signal-bearing set for a skill and
proposes a **skill delta**: e.g. *"HVAC merchants reply more when the observation references
seasonal cash flow"* → an edit to `cold_outreach.messagingRules` + a new `examples` entry,
saved as v+1 **in proposed state**. Observed failures become `antiPatterns`. A human approves;
approval is logged; the version goes active; future generations resolve it.

### 4.4 Outcome capture — how the system sees responses (wired vs not)

**Wired today (verified in code):**
- **Resend webhook** (`/api/webhooks/resend`) records delivered / bounced / complained / failed /
  opened / clicked into `email_events` (idempotent, signature-verified); updates send status;
  hard-bounce → structured error + stops the sequence; complaint → auto-unsubscribe.
- **Learning Agent** (`learning-agent.signals.ts`, Phase 3B) already turns those events into ~10
  outcome **signals** (send-success, delivery, bounce, complaint, open, click, approval-to-send,
  unknown-outcome…) per **dimension** (tenant / message-type / strategy-angle / score-band /
  qra-recommended / version-label), each with a **confidence tier by sample size**. It is
  **advisory / observe-only — the loop is open.** This is most of the outer-loop machinery
  *already built*; the learning loop should **consume and close** it, not rebuild it.

**The gap (NOT wired):**
- **Replies.** Opens/clicks are captured (when Resend tracking is on); the actual *reply text* is
  not — there is no inbound-email ingestion. The strongest positive signal (a real reply, a
  booked meeting) is currently **invisible** to the system.
- Open/click depend on Resend tracking, which is **off by default**.

**Reply / correspondence capture — BCC (your idea): scaffolded, never wired.** The
`proposal_captures` table (Phase 3N) already anticipates it — `capture_source IN ('manual',
'bcc_ingest','forward_ingest','outlook_sync','api')` — with a full capture → match-to-
lead/contact/company → review pipeline and a "proposal inbox" UI. **But the only live path that
creates captures today is `manual`**; there is no inbound endpoint, and it is scoped to
proposals, not copy-learning. So BCC was *designed into the schema but never connected to a
mailbox.*

**The BCC-for-training channel (recommended build).** Stand up the inbound endpoint the schema
already expects: auto-BCC on outbound (and let a rep BCC their *own* manual emails) to a capture
address (e.g. `verian@321swipe.com`) → an inbound handler creates a capture (`bcc_ingest`) →
matched to the lead/contact → **selectively** flagged "use for training." Uniquely valuable
because it captures the **rep's own human-written winning copy AND the customer's replies** —
real expert copy + real outcomes, entirely outside the automated pipeline. It is literally
watching the seasoned employee work, and it is the cleanest path to a real **reply** signal.
Selective opt-in per thread = "right documents, not all." **Reuse** the existing capture/match
infra; extend it for the learning use case rather than rebuilding.

---

## 5. Negative distillation — the Adversarial Corpus ("Anti-Pattern Lab")

**This is the recommended first build.** It exercises the entire loop end-to-end with a human
gate, needs **zero outcome volume**, and is maximally visible.

**Idea (user's):** feed the agent known-bad emails (junk folder, competitor spam, low-quality
cold outreach). The agent extracts the *failure patterns* and proposes `antiPattern` /
`forbiddenElement` additions to the relevant skill.

**Worked example** — two real junk emails:

> "While reviewing your site, I noticed a few gaps that could potentially be costing you...
> The good news is they're fixable. I've already prepared a quick snapshot... Reply 'OK – SEND'"

> "Your website actually looks good overall, but I did notice a couple of hidden SEO issues...
> Nothing major... Should I share the details?"

Extracted, transferable failure patterns (note: **structure/tactics transfer; domain content
does NOT** — these are SEO spam, we sell payment processing):

- **Manufactured flattery** ("your website looks good overall") — empty rapport.
- **Vague unsubstantiated problem claims** ("a few gaps", "hidden SEO issues") — no specifics,
  no evidence. (Mirrors our existing rule: *no savings claims without calculated data*.)
- **Curiosity-gap / permission-bait CTA** ("Should I share the details?", "Reply OK – SEND") —
  a CTA engineered to extract a reply, not to deliver value.
- **Templated non-personalization** — clearly mass-sent.
- **Thin signature** — first name only, no company/role/credibility.

Each becomes a proposed `antiPattern` on `cold_outreach` (and possibly the global copywriting
family). **Critical guardrail:** the distiller must extract *tactics and structure*, never
import the bad email's *domain claims* — we learn "don't use curiosity-gap CTAs," not anything
about SEO.

**Why it's the right first slice:**
- No dependency on live sends, replies, or warm-up.
- Subtractive (don't-do-X) → safe to apply, can't fabricate a promise (principle 7).
- The most glass-box thing we can build: paste a bad email → watch extraction → see the
  proposed rule with its rationale → approve/reject → see it land in the rubric → see the next
  generation avoid it. The whole moat mechanism, visible, in one screen.
- Doubles as a **spam/deliverability defense**: our own drafts get scored against patterns that
  get emails junked.

**Surface:** an "Anti-Pattern Lab" (likely under the Copywriting agent profile): paste/import N
bad emails → agent returns extracted patterns with rationale + target skill(s) → human approves
each → versioned skill delta. Every step recorded and inspectable.

---

## 6. Domains and sequencing — two loops, one substrate

| | Email copy loop | Evidence loop (statement/proposal) |
|---|---|---|
| Ground truth | **Proxy** (quality score, reply/open) | **Objective** (extracted # vs human-corrected #) |
| Signal latency | Days–weeks, needs volume | Immediate, per document |
| First positive learning | Slow / noisy | Fast / clean |
| Best first move | **Adversarial corpus** (§5, no volume needed) | Close the extraction-accuracy loop |

The evidence loop has the cleaner ground truth (the `extraction_accuracy` capture already
exists — agent's extracted value vs the human's correction is an exact grade), so the first
*positive* (additive) closed loop should live there. The email loop starts with the
subtractive adversarial corpus, then adds human-edit-diff distillation, then reply-driven
learning once send volume exists. Both share the same substrate: versioned skills, signal
events, grade attribution, human-gated deltas, and the glass-box trace.

---

## 7. Data model sketch (reuse-heavy)

Existing (reuse): `learned_skills` (family, slug, version, category, definition jsonb, status,
tenant_id nullable) · `copy_exemplars` · the quality-review tables (per-read grades) ·
`createAgentRun` / `createDecision` telemetry · system-control gating · `AGENT_ROSTER`.

New (sketch — confirm exact shapes at slice time):
- **`learning_signals`** — one row per captured signal: type (edit-diff / reply / rejection /
  adversarial / bounce), source ref (draft id, approval id, corpus item id), skill family+slug,
  payload (the diff, the bad email, the grade), strength, captured_at. The selection funnel
  writes here; ~95% of sends never produce a row.
- **`skill_revisions`** (or reuse `learned_skills` versioning + a provenance column) — proposed
  vs active, the delta, the rationale text, the signal ids that drove it, who approved, win-rate
  snapshot. This is the changelog the Skills page renders.
- **`adversarial_corpus`** — admin-supplied bad emails + extracted patterns + disposition. The
  §5 lab.

No raw outbound emails are ever stored as skills. Signals store *derived* artifacts (a diff, a
grade, an extracted pattern), not a growing email archive.

---

## 8. The glass box — visibility design

Visibility is the product here, not decoration. Surfaces:

1. **Skill lineage view** — per skill, a vertical changelog: v1 seed → v2 (antiPattern from
   corpus item #..) → v3 (messagingRules after 14 replies, +9% reply-rate). Each entry expands
   to: the signals that drove it, the exact delta (diff view), who approved, measured effect.
2. **Live run inspector** — for any generation: which skill+version grounded it, which
   exemplars, the grade it earned, which signal bucket it fell into. (Extends today's "AI
   Rewrite · <slug>" purpose line.)
3. **Anti-Pattern Lab** (§5) — the extraction pipeline shown step by step.
4. **Signal funnel dashboard** — "12,400 sends → 380 signal-bearing → 26 proposed deltas → 9
   approved → +6% avg grade." Makes "selection over volume" literally visible.
5. **Agent Map redesign (open — §10):** today the map shows agents + pathways + skills as a
   catalog. The learning loop suggests re-centering the map on *flows of signal and learning*:
   generation → grade → signal → distillation → version → generation, with live counts on each
   edge. The map becomes the clear case showing the machine running, not a static org chart.

**Visibility dial (future, external):** internal = full mechanism exposed. A market version
would keep the *result* (better copy, a confidence badge) but redact the *mechanism* (the
learned rules, the signal funnel, the lineage) so customers/competitors can't read our access
or lift our distilled knowledge. The dial is a per-surface redaction level, decided later;
building glass-first does not preclude it.

---

## 9. Safety / governance

- Every write path behind a system control (default off), mirroring `learned_skills_enabled`.
- Human approval required to activate any delta (until earned trust; even then, additive
  positive claims stay gated longer than subtractive ones).
- Subtractive-first: antiPatterns/forbiddenElements can ship with lighter gating than new
  positive messagingRules/examples (which could fabricate a claim).
- Reversibility: activation = repoint resolver to a version; rollback is one click.
- Compliance: the distiller must never promote a learned rule that violates the standing
  compliance constants (no savings promises, no unverified processor knowledge). Compliance
  rules are constants, not learnable (see [[learning-loop-vs-constant-rule]]).
- Domain-leak guard (§5): extract tactics/structure from adversarial inputs, never domain
  content.

---

## 10. Open decisions (need user input)

1. **First slice:** Adversarial Corpus / Anti-Pattern Lab (recommended — visible, no volume
   needed, safe) vs evidence-domain extraction-accuracy loop (cleanest positive truth) vs the
   UX lineage reframe first. (Can do Lab + a thin lineage view together.)
2. **Approval model:** every delta human-approved indefinitely, or earn auto-apply for
   subtractive deltas after N clean approvals?
3. **Agent Map:** redesign the map around signal/learning flows now, or after the first loop is
   proven? (User leans: nail the function first, then redesign the map.)
4. **Cadence:** distillation on a schedule (cron) vs on-demand (operator clicks "learn from
   recent signals") vs both.
5. **Scope of the corpus:** per-tenant only, or a shared global adversarial corpus that seeds
   antiPatterns for every tenant's copywriting family?

---

## 11. Phased build (straw man — reorder per §10.1)

- **P0 — Lineage reframe (thin):** Skills page shows version + provenance + (placeholder)
  win-rate. Makes the glass box real before there's much to show. Cheap.
- **P1 — Anti-Pattern Lab (§5):** adversarial corpus → extraction → human-gated antiPattern
  deltas → versioned skills the rewrite loop already consumes. The first closed loop.
- **P2 — Human-edit-diff distillation:** capture draft→sent diffs as gold signals; propose
  deltas from them. First outcome-driven (but volume-light) positive learning.
- **P3 — Evidence loop:** close the statement extraction-accuracy loop (objective truth);
  per-tenant/per-processor learned extraction skills.
- **P3.5 — BCC / inbound capture:** wire the inbound endpoint the `proposal_captures` schema
  already expects (`bcc_ingest`), reusing the capture→match pipeline; selective "use for training"
  flag. Unlocks the **reply** signal and captures rep-written winning copy. Can run early (it's
  independent of the distillation phases) and is the prerequisite for P4.
- **P4 — Reply-driven learning:** once reply capture (P3.5) + send volume exist, attribute
  replies/bounces to skill versions via the existing Learning Agent; win-rate becomes real;
  consider auto-apply for subtractive deltas.
- **P5 — Agent Map redesign:** re-center the map on signal/learning flows with live edge counts.

---

## Appendix — what already exists (so we build deltas, not greenfield)

- `resolveCopywritingSkill` (tenant→global→seed) + `learned_skills` store + 3a editor + 3b
  consumption in the rewrite loop (`generateLlmRewriteCandidates`).
- `copy_exemplars` (human-promoted, capped few-shot) + "Save as exemplar" surface.
- Email quality review = a 10-dimension grader, already producing per-draft grades (§4.2).
- **Learning Agent** (`learning-agent.signals.ts`) — outcome signals per dimension w/ confidence
  tiers, advisory/observe-only. Most of the outer-loop machinery, already built (§4.4).
- **Resend webhook** (`/api/webhooks/resend`) → `email_events` (delivery/bounce/complaint/open/
  click), idempotent + signed. The outcome event source.
- **`proposal_captures` + "proposal inbox"** (Phase 3N) — capture → match → review pipeline that
  already anticipates `bcc_ingest`; today only `manual` is wired (§4.4). The BCC foundation.
- `extraction_accuracy` capture in the statement extraction agent (objective grade substrate).
- **Agent Lab** (renamed from Agent Monitor; route stays `/settings/agent-monitor`) + Agent Map +
  `AGENT_ROSTER` + `createAgentRun`/`createDecision` telemetry + system-control gating (the
  visibility + safety substrate to extend).
