# Agent Platform — Horizons (exploratory, for later review)

Status: EXPLORATORY. Not a build plan — a deliberately bold map of where the agent platform
could go, captured so we can revisit, design, and implement selectively. Companion to the
near-term [[agent-learning-loop-design]] and adjacent to (do not edit) the operational-twin
north star. Author: architect + user, 2026-06-16.

Framing rule: think big here, build small there. Everything below is grounded in a primitive we
already have, so it's a horizon, not science fiction.

---

## 0. The organizing thesis — what survives when code is free

Assume the bold premise: within ~2–3 years, an AGI can regenerate software like this in a day
(stack setup and testing aside). If true, **the code is not the moat.** Survival accrues to what
*cannot* be regenerated. Ranked by durability:

1. **Proprietary, compounding data** — the outcome history and the per-company learned skills.
   Anyone can copy the code; nobody can copy the 50,000 real merchant interactions that trained
   it. *Must compound (distillation), not merely accumulate* — that's the whole learning-loop
   thesis. **This is the moat.**
2. **Trust / liability position** — being the accountable system-of-record. People and regulators
   pay for *someone to be responsible*. The branded savings certificate is already a trust
   artifact; the agent-trust layer (§2) extends it. Liability is a feature, not a risk, when you
   are the holder of record.
3. **Distribution / relationships** — the ISO channel, the merchant book, network effects. AGI
   doesn't write you a relationship.
4. **Scalability** — table stakes, not a moat. AGI makes everyone scalable.
5. **Proprietary software** — *least* durable. Treat code as ephemeral scaffolding.

**Strategic consequence:** over-invest in (1) data and (2) trust/evidence; under-invest in code
cleverness; move *fast* to capture the data + trust position while it is still scarce. Roadmap
priority should fall out of this ranking. ("What systems survive and why?" — they survive on
data, accountability, and distribution; not on the software, which becomes free.)

---

## 1. From silos to a society of agents (group thought, not isolated tools)

Today the agents are advisory and largely siloed (copywriting, quality-review/grader,
learning-agent, statement-extraction, proposal-review). The horizon: **a society of agents** with
roles, a shared memory, and structured disagreement — because the goal is the judgment of a
seasoned *team*, not one tool.

- **Shared blackboard / common memory.** The per-company learned nomenclature (the learning loop's
  output) becomes a shared substrate every agent reads and writes. Knowledge compounds across
  agents, not just within one.
- **Structured debate + consensus.** Borrow the proven multi-agent patterns: propose → adversarially
  critique → judge/vote. High-stakes calls (e.g. "are these statement numbers trustworthy?") go to
  a **council** — extraction agent + plausibility agent + a skeptic — that must agree.
- **Weighted by trust.** Not one-agent-one-vote: weight each agent's voice by its track record
  (§2 reputation). A seasoned agent's dissent counts more.
- **Group thought across time** — the learning loop already *is* collective intelligence across
  history; the council makes it collective across *agents* in the moment.
- The redesigned **Agent Map** becomes the org chart + live collaboration view of this society
  (the glass box at the team level).

## 2. Agent trust architecture — the Agent Passport

Trust between agents (and between agents and humans/regulators) needs **identity, capability,
provenance, and reputation** — a verifiable **passport** per agent:

- **Identity & version** — who/what this agent is, which version, issued by whom.
- **Capability scopes** — what it is allowed to do (already implicit in `AGENT_ROSTER` +
  `enforceAgentAction`). The passport makes scopes explicit and *delegable*: an agent can grant a
  scoped, time-boxed capability to another — which the **goal5 bridge grant/maintain/revoke**
  system is already a primitive for.
- **Provenance** — every action signed and attributable (who/what produced this draft, this
  number, this proposal). This is the *liability* substrate from §0.2 — auditable accountability.
- **Reputation** — the agent's historical grade / win-rate / accuracy (the learning loop already
  computes this). Reputation feeds the weighted council (§1) and the human's trust dial.

The passport turns the implicit roster + grants we already have into explicit, signed,
reputationed credentials. External version: a customer or regulator can *verify the agent* that
produced a proposal — trust as a product surface.

## 3. Modeling architecture — agents act on a world-model (the twin)

The coherent architecture under all of this is a **learned world-model** of the sales domain: a
twin of each merchant (processing profile, savings, objection history) and of the sales process
itself. Agents don't act on raw rows — they act on the twin; the learning loop *trains* the twin.
The Grader + Learning Agent + skills are the embryonic world-model already. (Ties to the existing
operational-twin north star.)

## 4. A field guide of AI techniques to evaluate (not all at once)

- **Immune-system architecture** (Email × Biology) — the Anti-Pattern Lab as *immune memory*: spam
  patterns = pathogens, antiPatterns = antibodies, the corpus = acquired immunity. A living defense
  that recognizes and rejects bad-copy + deliverability threats and keeps learning new ones.
- **Evolutionary copy optimization** (Email × Biology) — copy variants as a population, outcomes as
  fitness; mutate/crossbreed winning elements. The rewrite loop is proto-this.
- **Bandits / RL** — explore/exploit for send-time, angle, sequence selection once outcome signal
  exists. Spend attention where it converts.
- **Causal / uplift modeling** — which elements *cause* replies, not merely correlate. The
  regression-attribution in the learning-loop doc (§4.2a) is proto-causal; make it first-class.
- **Merchant simulator / self-play** — an agent that simulates merchant objections to *pre-test*
  copy before sending. Cheap pre-outcome signal; stress-tests claims.
- **Uncertainty quantification + abstention** — agents that know when they don't know (calibration).
  Essential for trust/liability: a confident wrong number is the dangerous failure.
- **Per-company knowledge graph** — the learned nomenclature as a graph of merchant types,
  objections, winning angles; retrieval-grounded generation.

## 5. Method — cross-domain design reviews (the thought-experiment practice)

Make the user's instinct a *recurring method*: periodically force a cross-domain lens to surface
unasked questions. Examples that already paid off above:

- **Email × Biology** → immune system, evolution, ecology (deliverability = ecosystem health; your
  sending domain is an organism whose reputation is its immune fitness).
- **Analysis × Physics** → signal/noise & **entropy** (the selection funnel is entropy reduction —
  we can literally measure the information content of the corpus); **phase transitions** (adoption
  tipping points); **conservation** (attention is conserved — you can only capture engagement, not
  create it); **least action** (the shortest path to a reply).

These aren't decoration — each suggests real instrumentation (measure corpus entropy; model
adoption as a phase transition; budget attention as a conserved quantity). Schedule one cross-domain
review per phase; harvest the questions.

---

## 6. On the short window

If §0's premise holds, the window to build an un-copyable position is short and the sales cycle may
compress. That argues for: (a) capture proprietary outcome data *now*; (b) establish the
trust/evidence/liability position *now*; (c) keep the code lean and replaceable on purpose. The
durable asset is not the artifact — it's the *accumulated judgment and accountability* the artifact
captured. Someone has to think up the story; the software is just its current sentence.

---

## Near-term on-ramps (where horizons touch the current roadmap)

- Agent Passport ← extend `AGENT_ROSTER` + `enforceAgentAction` + goal5 bridge grants into signed,
  reputationed credentials. (Reputation = the learning loop's win-rates.)
- Society of agents ← the council/consensus pattern on the existing advisory agents; shared memory
  = the learning loop's per-company skills.
- Immune system ← literally the Anti-Pattern Lab (P1 of the learning-loop doc).
- World-model ← the Grader + Learning Agent + skills, made explicit.
- Defensibility ← prioritize data-moat + evidence/trust work over replaceable code.
