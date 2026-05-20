# 07 — Next Steps

## Approved Next Phase

**Phase 3B Quality Review Agent — Design & Test Cases**

Status: **Not started.** Design only. No code until design is approved.

## What the Quality Review Agent Should Do

The Quality Review Agent evaluates the `message_version[]` candidates produced by the Copywriting Agent and produces a `quality_review` for each version.

It should score each version across these dimensions:

| Dimension | Description |
|-----------|-------------|
| Strategic fit | Does the copy match the strategy's intent, message type, and skill? |
| Compliance confidence | How confident are we that no compliance issues remain? |
| CTA clarity | Is the call to action clear, specific, and achievable? |
| Specificity / personalization quality | Does the copy feel specific to this lead, or is it generic? |
| Tone fit | Does the tone match the strategy's specified tone? |
| Differentiation quality | Does this version offer a genuinely different angle, not just a synonym rewrite? |
| Subject/body consistency | Does the subject line accurately reflect the body's content and CTA? |
| Risk flags | Are there any red flags that a human reviewer should note? |

It should also produce:

- **Recommended version ranking** — which version is best for this lead and why
- **Reasoning** — a human-readable explanation of the ranking decision

## What the Quality Review Agent Should NOT Do in v1

- Send messages
- Approve messages for sending
- Override the strategy
- Modify message versions
- Call external LLMs (unless explicitly approved in design)

## Design Requirements for Next Session

Before implementation begins, the design session should produce:

1. **Phase 3B Quality Review Agent — Design & Test Cases** document covering:
   - Input schema (what fields it reads from `message_version` and `message_strategy`)
   - Output schema (`quality_review` row structure)
   - Scoring methodology for each dimension (how scores are calculated deterministically in v1)
   - Ranking algorithm
   - Edge cases (single version, all versions flagged, no clear winner)
   - Test case inventory (at minimum 20 fixture scenarios)

2. Approval of the design document before any code is written.

3. **Phase 3B Quality Review Agent — Implementation Plan** covering the step-by-step file creation sequence.

4. Approval of the implementation plan before coding begins.

## After Quality Review Agent

Once the Quality Review Agent is implemented and QA-verified:

- Human approval flow can be extended to use quality review rankings
- Body HTML generation can be scoped as a separate sub-task
- Learning Agent design can begin

## Process Reminder

The standard design → approval → implementation → QA → commit sequence must be followed:

1. Design & Test Cases document — presented, reviewed, locked
2. Implementation Plan — presented, reviewed, locked
3. Code implementation — executed per plan, with guardrail correction pass if needed
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag, push
6. Update `docs/ai-context/` files
