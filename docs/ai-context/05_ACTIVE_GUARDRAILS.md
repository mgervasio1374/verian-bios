# 05 — Active Guardrails

These boundaries are active and must be preserved by all future Claude sessions unless explicitly overridden by the user in a new approved scope.

## Hard Stops — Do Not Do These

| Guardrail | Reason |
|-----------|--------|
| Do not begin Human Review / Approval Bridge code implementation before design is approved | Design must be produced and user-approved before any bridge code is written |
| Do not build the Learning Agent | Not scoped — future work only |
| Do not add external LLM calls to the Copywriting Agent v1 | Deterministic generation is a locked decision; LLM adapter is planned for a future version |
| Do not wire email sending | Sending is a separate downstream step not owned by any v1 agent |
| Do not create `email_drafts` from `message_versions` | No email_drafts table exists in v1 scope |
| Do not create `approval_requests` from `message_versions` | Approval flow is separate; not owned by the Copywriting Agent |
| Do not approve messages for sending from the Copywriting Agent | Human approval is always required |
| Do not add best-version ranking inside the Copywriting Agent | Ranking belongs to the Quality Review Agent |
| Do not add quality scores inside the Copywriting Agent | Quality scoring belongs to the Quality Review Agent |
| Do not add response likelihood scores inside the Copywriting Agent | Response prediction is out of scope for v1 |
| Do not generate `body_html` in Copywriting Agent v1 | body_html is always null; this is enforced at type, validator, and repo levels |
| Do not modify Phase 3A services unless explicitly scoped | Phase 3A is locked |
| Do not create shallow synonym rewrites | Version differentiation must be substantive across 8 measured dimensions |
| Do not skip compliance validation | All versions must pass compliance before being stored |
| Do not skip the differentiation validator | Pairwise differentiation is required — minimum 2 dimensions must differ between any two versions |

## Quality Review Agent Hard Stops

These remain in force now that QRA is implemented. The QRA is evaluation-only and must stay that way.

| Guardrail | Reason |
|-----------|--------|
| QRA must not write or rewrite copy | QRA is evaluation-only; it produces quality_review records, not copy |
| QRA must not modify `message_version` content | Read-only consumer; versions are immutable from QRA's perspective |
| QRA must not modify `message_strategy` records | Read-only consumer; strategy decisions belong to the Message Strategy Agent |
| QRA must not approve messages for sending | Human approval is always required |
| QRA must not create `email_drafts` | Not in v1 scope |
| QRA must not create `approval_requests` | Not in v1 scope |
| QRA must not call external LLMs in v1 | Scoring must be deterministic; LLM-assisted scoring requires a separately approved design |
| QRA must not learn from outcomes or update skills | Learning Agent is future work |
| QRA recommendation (`is_recommended`) is advisory | It marks the strongest version; it does not approve or send |
| QRA must not proceed beyond QRA implementation | Do not begin approval/send bridge or Learning Agent without explicit scope |

## Process Guardrails

| Guardrail | Reason |
|-----------|--------|
| Do not write code before producing a recovery summary | Claude must confirm current state before coding after compaction |
| Do not commit without explicit user approval | User controls all git operations |
| Do not run `git add` or `git commit` without being asked | Staging and committing are always user-directed |
| Do not start a new phase without approved design | Every phase must go through design → approval → implementation; Human Review / Approval Bridge is next |
| Do not modify Message Strategy Agent files unless explicitly scoped and reported | The agent is locked; changes require user approval and must be reported |

## Architecture Guardrails

| Guardrail | Principle |
|-----------|-----------|
| Strategy controls copy | The Message Strategy Agent owns all strategic decisions; the Copywriting Agent executes them |
| Quality Review Agent scores later | No scoring, ranking, or filtering happens inside the Copywriting Agent |
| Human approval and sending are separate | No agent in v1 sends a message or marks one as approved-for-send |
| Agents are strictly layered | Each agent consumes only the output of the agent directly before it |

## Guardrail Change Protocol

If a user explicitly approves removing or modifying a guardrail:
1. Update this file to reflect the change.
2. Note the date and reason.
3. Do not treat verbal approval in a single message as permanent — confirm with the user that the file should be updated before updating it.
