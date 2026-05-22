# 05 — Active Guardrails

These boundaries are active and must be preserved by all future Claude sessions unless explicitly overridden by the user in a new approved scope.

## Hard Stops — Do Not Do These

| Guardrail | Reason |
|-----------|--------|
| Do not begin Learning Agent code before design is approved | The Learning Agent requires its own design document and implementation plan before any code is written |
| Do not build the Learning Agent | Not scoped — future work only |
| Do not add external LLM calls to the Copywriting Agent v1 | Deterministic generation is a locked decision; LLM adapter is planned for a future version |
| Do not auto-send email from the Send Bridge | The bridge stops at `email_draft.status = 'approved'`; sending requires a separate explicit human action |
| Do not call `sendApprovedDraftAction` from the Send Bridge | The bridge creates the draft; the reviewer calls send independently |
| Do not insert into `email_sends` from the Send Bridge | `email_sends` is created only by the Phase 3A send flow |
| Do not create `email_drafts` from the Copywriting Agent | Draft creation belongs to the Send Bridge |
| Do not create `approval_requests` from the Copywriting Agent or HRB | Approval request creation belongs to the Send Bridge |
| Do not approve messages for sending from the Copywriting Agent | Human approval is always required |
| Do not add best-version ranking inside the Copywriting Agent | Ranking belongs to the Quality Review Agent |
| Do not add quality scores inside the Copywriting Agent | Quality scoring belongs to the Quality Review Agent |
| Do not add response likelihood scores inside the Copywriting Agent | Response prediction is out of scope for v1 |
| Do not generate `body_html` in Copywriting Agent v1 | body_html is always null; this is enforced at type, validator, and repo levels |
| Do not modify Phase 3A services unless explicitly scoped | Phase 3A is locked |
| Do not create shallow synonym rewrites | Version differentiation must be substantive across 8 measured dimensions |
| Do not skip compliance validation | All versions must pass compliance before being stored |
| Do not skip the differentiation validator | Pairwise differentiation is required — minimum 2 dimensions must differ between any two versions |

## Event Tracking Hard Stops

These remain in force now that Event Tracking is implemented. The layer is observation-only and must stay that way.

| Guardrail | Reason |
|-----------|--------|
| ET must not update QRA scores, HRB decisions, or strategy weights | Observation only; learning belongs to the Learning Agent |
| ET must not send email or call Resend API | Event tracking observes; it does not initiate |
| ET must not insert into `email_sends` | Inserts come only from the Phase 3A send flow |
| ET must not modify generated message copy (`body_text`, `subject_line`) | Copy is immutable |
| ET must not auto-suppress on bounce | Only complaint auto-unsubscribe exists (existing Phase 3A behavior) |
| ET must not create new DB tables or migrations | All data in existing `email_sends.metadata` and `activity_events` jsonb |
| ET must not trigger the Learning Agent | Future work |
| ET activity event failures must never block sends | All ET calls wrapped in `.catch(() => {})` |
| ET must not emit Phase 3B activity events for Phase 3A template sends | `isPhase3bSend()` gate enforces this separation |
| ET must not emit an activity event for `email.delivery_delayed` | Log-only in v1 |
| ET duplicate webhook must not produce duplicate activity events | Phase 3B block runs only after the `23505` idempotency guard passes |

## Send / Email Draft Bridge Hard Stops

These remain in force now that the Send Bridge is implemented. The bridge is a state-management translation layer and must stay that way.

| Guardrail | Reason |
|-----------|--------|
| SEB must not call Resend API | Draft creation is not sending |
| SEB must not insert into `email_sends` | Created only by Phase 3A send flow |
| SEB must not call `sendApprovedDraftAction` | Reviewer calls send independently after draft is created |
| SEB must not auto-send on draft creation | No-auto-send is a locked principle; three distinct human clicks are required |
| SEB must not modify `message_version` content or `approval_status` | Version is immutable from the bridge |
| SEB must not modify QRA records | QRA is read-only from the bridge |
| SEB must not modify HRB approval/rejection logic | HRB state is immutable from the bridge |
| SEB must not rewrite `body_text`, `subject_line`, or `body_html` | Copy is copied verbatim from the `message_version` |
| SEB must not create new DB tables or migrations | All provenance stored in existing `ai_generation_metadata` jsonb column |
| SEB must not call external LLMs | No AI in the bridge |
| SEB must not trigger the Learning Agent | Future work |
| SEB validation must run before any DB write | All 14 SEB gates pass before the first INSERT |
| SEB supersede must run last | `supersedePendingDraftsForLead` runs after all other writes succeed |

## Human Review / Approval Bridge Hard Stops

These remain in force now that HRB is implemented. The bridge is a state-management layer only and must stay that way.

| Guardrail | Reason |
|-----------|--------|
| HRB must not send email | Sending is owned by the Phase 3A send flow |
| HRB must not create `email_drafts` | Draft creation belongs to the Send Bridge |
| HRB must not create `approval_requests` | Approval request creation belongs to the Send Bridge |
| HRB must not write or rewrite copy | Bridge is a state-management layer only |
| HRB must not modify `body_text` or `subject_line` | Original generated copy is immutable |
| HRB must not modify QRA scores or rankings | QRA records are read-only from bridge |
| HRB must not modify `message_strategy` fields | Strategy is read-only from bridge |
| HRB must not call external LLMs | No AI in the bridge |
| HRB must not trigger Learning Agent | Future work |
| HRB critical risk block is unconditional | No override path for critical risk flags in v1 |
| HRB must enforce one-approved-per-strategy | HRB_018 blocks second approval; no replacement workflow in v1 |
| HRB must stop at `approved` message_version | No email_draft, no send; handoff is `approved` status only |

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
| Do not start a new phase without approved design | Every phase must go through design → approval → implementation plan → approval → code; Learning Agent Design is next |
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
