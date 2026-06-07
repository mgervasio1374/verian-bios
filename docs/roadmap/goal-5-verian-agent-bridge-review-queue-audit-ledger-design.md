# Goal 5 Design — Verian Agent Bridge Review Queue and Audit Ledger

---

## 1. Executive Summary

Goal 5 designs the review and audit layer for Verian Agent Bridge dry-run task packets. When a `buildVerianBridgeDryRunPacket()` call produces a `VerianBridgeTaskPacket`, that packet currently exists only in memory. Goal 5 defines how such packets are persisted, surfaced for review, approved, denied, revised, and audited — without enabling any execution, model API calls, autonomous routing, sending, or DB writes until each implementation slice is explicitly authorized.

This document is design-only. No queue implementation, migration, UI, service, repository, type file, or server action is created in this slice.

---

## 2. Why This Follows Goal 4

Goal 4 created the foundation:
- `buildVerianBridgeDryRunPacket()` produces policy-checked, structured, dry-run task packets.
- The packet includes agent, route, risk level, policy check status, allowed/blocked actions, evidence requirements, approval requirements, and `dryRunOnly: true`.

Goal 4 cannot answer: what happens to a packet once it exists? It lives only in memory. There is no persistent queue, no review UI, no approval trail, and no audit ledger.

Goal 5 answers those questions at the design level. It defines the shape of a review queue, the states a packet can move through, the audit events that must be captured, and the rules that keep human approval and Codex review gates enforced throughout the lifecycle.

**Goal 5 must not enable execution or model calls.** Even a fully-implemented Goal 5 review queue only surfaces packets for human review and records human decisions — it does not route prompts to models or execute approved actions. Execution authorization requires a dedicated future goal with its own policy review, Codex review, and Michael approval.

---

## 3. Measurable Goal

Goal 5 Slice 1 is complete when:

- A design document exists at `docs/roadmap/goal-5-verian-agent-bridge-review-queue-audit-ledger-design.md`.
- Queue states are defined.
- Audit record requirements are defined.
- Approval, denial, and revision behavior is defined.
- Human approval and Codex review gates are explicitly preserved.
- Stop conditions for Goal 5 are defined.
- No implementation is created — no types, no services, no repositories, no migrations, no UI, no server actions, no API routes.

---

## 4. Core Operating Principle

```
Agents suggest.
Verian validates.
Humans approve high-risk actions.
Audit records preserve accountability.
Nothing executes without explicit authorization.
```

The review queue is a surface for human decision-making, not a trigger for autonomous action. Every state transition produces an audit record. No state transition executes anything.

---

## 5. Review Queue Purpose

The future Verian Agent Bridge Review Queue is the place where dry-run task packets are surfaced for human inspection and decision. It provides:

- **Visibility:** Michael can see all pending dry-run packets in one place.
- **Filtering and sorting:** by risk level, policy profile, agent, model route, approval status.
- **Inspection:** full packet detail including prompt summary, evidence requirements, stop conditions, policy check result, agent recommendation, model recommendation, and Codex review status.
- **Action surface:** approve for manual handoff, deny, request revision, mark Codex review received, archive.
- **Audit trail linkage:** every packet in the queue is linked to its full audit history.

The review queue is a display and decision layer only. It does not:
- call any model
- route any prompt
- execute any command
- write to the production database beyond the queue/audit tables themselves
- send any email or campaign
- create any background job

---

## 6. Explicit Non-Responsibilities

The review queue must never:

| Prohibited behavior | Why |
|---|---|
| Call models | No live model routing exists until explicitly authorized |
| Route prompts to models | Execution authorization has not been granted |
| Execute commands | No shell access, no command runner |
| Write to production | Production remains untouched |
| Apply migrations | Migrations require dedicated design, approval, and implementation slices |
| Send emails | `EMAIL_SENDING_ENABLED` remains disabled |
| Start campaigns | `CAMPAIGN_SENDING_ENABLED` remains disabled |
| Create background jobs | No automation authorized |
| Auto-approve packets | Human approval must be explicit |
| Bypass Michael approval | Human gate is non-negotiable |
| Bypass Codex review | Codex gate applies to applicable policies |
| Bypass `checkVerianPromptPolicy` | Policy check must precede any packet creation |

---

## 7. Proposed Future Files

The following files are anticipated for future Goal 5 implementation slices. **None are created in this slice.**

| Future file | Purpose |
|---|---|
| `modules/verian-agent-bridge/review-queue/types.ts` | Queue item type, state enum, approval action types |
| `modules/verian-agent-bridge/review-queue/review-queue.service.ts` | Queue read model — list, filter, get by ID |
| `modules/verian-agent-bridge/audit-ledger/types.ts` | Audit event type, audit record type |
| `modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts` | Append-only audit write and read repository |
| `modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts` | Audit event creation orchestration |
| `app/(workspace)/[workspaceSlug]/agent-bridge/review-queue/page.tsx` | Review queue UI — list view |
| `tests/goal5-agent-bridge-review-queue.test.ts` | Source-reading and behavioral tests for queue service |
| `tests/goal5-agent-bridge-audit-ledger.test.ts` | Source-reading and behavioral tests for audit ledger |
| Future migration file | Only after explicit migration design approval in a dedicated slice |

---

## 8. Proposed Queue State Model

A `VerianBridgeReviewQueueItem` moves through the following states. **None of these states execute anything.**

| State | Meaning |
|---|---|
| `draft_packet` | Packet produced by `buildVerianBridgeDryRunPacket()` but not yet submitted to the queue |
| `pending_policy_review` | Packet submitted; policy check result is being surfaced |
| `blocked_by_policy` | Policy check returned `blocked`; packet cannot proceed |
| `waiting_human_approval` | Policy check passed or warned; packet is awaiting Michael's decision |
| `waiting_codex_review` | Applicable policy requires Codex review; waiting for Codex artifact |
| `revision_requested` | Michael has requested changes to the prompt or task definition |
| `approved_for_manual_handoff` | Michael has approved the packet; it may now be used as context for a manual Claude/Codex session |
| `denied` | Michael has denied the packet; no further action |
| `archived` | Packet is closed and preserved in audit history only |

**State transition rules:**
- `blocked_by_policy` → no further progress; can only be archived.
- `waiting_codex_review` → must receive Codex artifact before moving to `waiting_human_approval` for applicable policies.
- `approved_for_manual_handoff` → does not trigger any execution. It is a record that Michael has reviewed and approved the packet for use as a manual handoff context.
- `denied` → audit record must capture reason.
- All transitions produce audit events.

---

## 9. Proposed Approval Actions

Future user-facing actions in the review queue:

| Action | Effect |
|---|---|
| **Approve for manual handoff** | Moves packet to `approved_for_manual_handoff`; logs approval audit event; does not execute |
| **Deny** | Moves packet to `denied`; logs denial audit event with reason |
| **Request revision** | Moves packet to `revision_requested`; logs revision request audit event with requested changes |
| **Mark Codex review received** | Records Codex review artifact; moves packet from `waiting_codex_review` to `waiting_human_approval` |
| **Archive** | Moves packet to `archived`; audit record preserved; no deletion |
| **Reopen for review** | Returns `denied` or `archived` packet to `waiting_human_approval` for reconsideration |

**"Approve for manual handoff" does not mean execute.** It means Michael has reviewed the packet and authorized it to be used as the context for a manual Claude/Codex/GPT session. No model is called. No command is executed. No automation is triggered.

---

## 10. Proposed Audit Event Types

Every audit event produces a record. Future event types:

| Event type | When it fires |
|---|---|
| `packet_created` | `buildVerianBridgeDryRunPacket()` produces a packet |
| `policy_check_passed` | Policy checker returns `pass` |
| `policy_check_warning` | Policy checker returns `warning` |
| `policy_check_blocked` | Policy checker returns `blocked` |
| `human_approval_requested` | Packet moves to `waiting_human_approval` |
| `human_approved` | Michael approves a packet |
| `human_denied` | Michael denies a packet |
| `revision_requested` | Michael requests revision of a packet |
| `codex_review_required` | Packet moves to `waiting_codex_review` |
| `codex_review_received` | Codex review artifact is linked |
| `manual_handoff_prepared` | Packet is in `approved_for_manual_handoff` state |
| `packet_archived` | Packet is archived |

---

## 11. Proposed Audit Record Shape

Conceptual type — design only. No type file is created in this slice.

```typescript
type VerianBridgeAuditRecord = {
  id: string
  taskId: string
  packetId: string
  policyId: VerianPolicyProfileId
  eventType: string
  actor: 'michael' | 'system' | 'agent' | 'codex'
  previousState?: string
  nextState?: string
  summary: string
  evidence?: string[]
  createdAt: string
  dryRunOnly: true
}
```

**Key constraints:**
- `dryRunOnly: true` — audit records exist only within the dry-run boundary until execution is explicitly authorized.
- `createdAt` — immutable. Records are never backdated.
- `actor` — every record attributes an actor. No anonymous state changes.
- `evidence` — optional array of linked evidence items (Codex artifact IDs, approval record IDs, policy check result IDs).

---

## 12. Proposed Review Queue Item Shape

Conceptual type — design only. No type file is created in this slice.

```typescript
type VerianBridgeReviewQueueItem = {
  packetId: string
  taskId: string
  goalId?: string
  sliceId?: string
  title: string
  policyId: VerianPolicyProfileId
  agentId: string
  recommendedModel: string
  riskLevel: 'low' | 'medium' | 'high'
  status: string
  policyCheckStatus: 'pass' | 'warning' | 'blocked'
  requiresHumanApproval: boolean
  requiresCodexReview: boolean
  requiredEvidence: string[]
  stopConditions: string[]
  createdAt: string
  updatedAt: string
  dryRunOnly: true
}
```

**Key constraints:**
- `dryRunOnly: true` — same boundary as the originating `VerianBridgeTaskPacket`.
- `status` — matches the queue state model above.
- `stopConditions` — surfaced directly from the originating packet; always visible to the reviewer.
- `requiredEvidence` — surfaced directly from the policy profile; never hidden.

---

## 13. Human Approval Rules

| Rule | Detail |
|---|---|
| Warnings require Michael approval | Any `policy_check_warning` result must gate on Michael's explicit decision |
| High-risk packets require Michael approval | `riskLevel: 'high'` always requires human approval regardless of other conditions |
| Human approval must be explicit | No auto-approval, no model-delegated approval, no time-based auto-approval |
| No model can approve its own output | Qwen, Claude, GPT, and Codex cannot approve packets they produced or reviewed |
| Approval must be logged | Every approval produces a `human_approved` audit event with actor, timestamp, and packet reference |
| Approval does not equal execution | `approved_for_manual_handoff` authorizes a manual handoff context only; no automated action follows |

---

## 14. Codex Review Rules

| Rule | Detail |
|---|---|
| Applicable policies must surface Codex review requirement | Any policy with `requiresCodexReview: true` moves the packet to `waiting_codex_review` before human approval |
| Codex review must be linked before handoff | Missing Codex review artifact blocks `approved_for_manual_handoff` for applicable policies |
| Codex review cannot auto-apply changes | Codex output is an artifact linked to the audit record, not an automated change |
| Missing Codex review blocks handoff | No bypass; Michael cannot approve for handoff if required Codex review is absent |

---

## 15. Audit Ledger Rules

| Rule | Detail |
|---|---|
| Append-only preferred | Audit records should not be mutated after creation; corrections should be new records |
| No silent mutation of prior approval decisions | Overwriting or deleting approval records is prohibited |
| State changes must create audit records | Every state transition in the queue model produces a corresponding audit event |
| Policy check result must be preserved | The `policyCheckStatus`, issues list, and summary must be captured at packet creation time |
| Prompt summary or prompt hash must be preserved | The audit record must allow future verification that the approved prompt matches the executed prompt |
| Actor and timestamp must be preserved | Who acted and when must be immutable in the audit record |
| Denials and revision requests must remain visible | Closed or archived packets retain their full audit history; no records are deleted |

---

## 16. Future UI Design Requirements

A future review queue UI page at `app/(workspace)/[workspaceSlug]/agent-bridge/review-queue/page.tsx` should surface the following for each queue item:

**List view per item:**
- Task title
- Risk badge (low / medium / high)
- Policy profile ID
- Agent ID
- Recommended model
- Policy check status badge (pass / warning / blocked)
- Current queue status
- Created/updated timestamps
- Action buttons (Approve, Deny, Request Revision, Archive)

**Detail view per item:**
- All list view fields
- Prompt summary
- Required evidence checklist
- Stop conditions list
- Approval/Codex review requirements
- Full audit history panel (chronological event list)

**No UI is created in this slice.** All UI decisions are subject to further design and Michael approval before implementation begins.

---

## 17. Future Database Design Considerations

Future DB tables (conceptual — no tables or migrations are created in this slice):

| Table | Purpose |
|---|---|
| `bridge_task_packets` | Persisted dry-run task packets with full packet fields |
| `bridge_review_queue_items` | Queue items derived from packets; tracks current state and timestamps |
| `bridge_audit_events` | Append-only audit event log; one row per event |
| `bridge_codex_reviews` | Codex review artifacts linked to packets and queue items |

**Key design considerations:**
- `bridge_audit_events` must be append-only at the application level; no `UPDATE` or `DELETE` on existing rows.
- `bridge_task_packets` should store the full `VerianBridgeTaskPacket` shape including `dryRunOnly: true`.
- `bridge_review_queue_items.status` must be the authoritative source of queue state.
- `bridge_codex_reviews` links to both the packet and the audit event that recorded the review receipt.

No tables, schemas, or migrations are created in this slice or in Goal 5 until a dedicated migration design slice is approved and implemented.

---

## 18. Safety Boundaries

Goal 5 design and all future Goal 5 implementation slices must preserve:

| Boundary | Requirement |
|---|---|
| No model API calls | No live model routing until explicitly authorized in a future goal |
| No external model calls | Qwen, Claude, GPT, Codex remain routing metadata only |
| No prompt sending | No prompt is dispatched to any provider |
| No executable routing | Route selection remains deterministic and metadata-only |
| No bridge execution | Approved-for-handoff does not trigger execution |
| No DB writes | Until migration design is approved and implemented in a dedicated slice |
| No production/staging touch | Both environments remain untouched |
| No email/campaign sending | `EMAIL_SENDING_ENABLED` and `CAMPAIGN_SENDING_ENABLED` remain disabled |
| No automation/background jobs | No Inngest, no queues, no workers |

---

## 19. Risks

| Risk | Mitigation |
|---|---|
| Queue approval mistaken for execution permission | "Approved for manual handoff" state must be clearly labeled; no execution logic follows approval |
| Audit records mutated instead of appended | Application-level append-only enforcement; no UPDATE/DELETE in audit repo |
| Codex review skipped | Missing Codex artifact blocks handoff state for applicable policies |
| Human approval weakened | Approval gate is enforced in service logic, not UI logic; cannot be bypassed via UI workaround |
| `dryRunOnly` bypassed | Source-reading tests assert `dryRunOnly: true` on all packets and queue items |
| Prompt policy checker bypassed | `checkVerianPromptPolicy` called in `buildVerianBridgeDryRunPacket()` before any queue submission |
| Premature DB/UI implementation | No implementation begins without dedicated design slice approval |
| Model provider integration added too early | Provider integration requires its own goal, design slices, Codex review, and Michael approval |

---

## 20. Suggested Goal 5 Slice Roadmap

| Slice | Deliverable | Risk |
|---|---|---|
| Slice 1 | Review queue / audit ledger design document (this slice) | LOW |
| Slice 2 | Review queue and audit ledger type definitions only — no runtime behavior | LOW |
| Slice 3 | Audit ledger migration design only — SQL file committed, not applied | MEDIUM |
| Slice 4 | Codex review of design and types before any implementation | LOW |
| Slice 5 | Append-only audit repository implementation — only after migration approval | MEDIUM |
| Slice 6 | Review queue read model / service — no execution, no writes | MEDIUM |
| Slice 7 | Review queue UI — display and action surface only | MEDIUM |
| Slice 8 | Goal 5 productivity report | LOW |

No implementation slice begins until Michael approves the design and Codex reviews the type definitions.

---

## 21. Recommended Next Step

After this design document is committed and pushed, proceed with Goal 5 Slice 2 (review queue and audit ledger type definitions only) only if Michael approves.

Slice 2 scope:
- `modules/verian-agent-bridge/review-queue/types.ts` — queue item type, state type, approval action type
- `modules/verian-agent-bridge/audit-ledger/types.ts` — audit event type, audit record type
- Type-only files: no runtime objects, no functions, no classes, no side effects
- No migration, no service, no repository, no UI
- No code beyond the two type files

---

## 22. Stop Conditions

Stop immediately in any future Goal 5 slice if:

- Execution is added (any form of automated action following approval)
- Live model API calls are added without explicit authorization
- Prompt sending is added
- DB writes are attempted without a dedicated approved migration implementation slice
- Production or staging environment is touched
- Email or campaign sending is added or enabled
- Automation or background jobs are introduced
- Human approval gates are weakened, delegated to a model, or bypassed
- Codex review gates are weakened or bypassed for applicable policies
- `checkVerianPromptPolicy` is skipped or bypassed at any point in the packet creation flow

---

*Goal 5 Slice 1 complete. Design document committed. No implementation created. Awaiting Michael approval before Slice 2 type definitions.*
