# Phase 3B-1 — Human Handoff & Follow-Up Accountability Engine

**Status:** Roadmap — not built  
**Requires team approval before activation**  
**All runtime controls seed as disabled (`value=false`)**

---

## Business Problem

Verian captures structured intake from 321 Swipe's web properties, generates proposals, and
routes leads through an approval workflow. Once a salesperson takes over — replies in Outlook,
books a call, attends a meeting — Verian loses visibility entirely unless the human manually
updates the CRM.

This creates predictable pipeline leakage:

- A prospect replies positively. The rep replies in Outlook. Verian never sees it.
- A call is completed. The rep intends to follow up the next morning. A busier day arrives. Nothing happens.
- A hot lead waits 5–7 days. The window closes. The prospect signs elsewhere.

No individual failure is obvious. The aggregate effect is significant and invisible.

---

## Feature Objective

Detect follow-up obligations that arise from human activity (email replies, meetings, calls),
track whether those obligations are completed within a reasonable window, and create
accountability tasks or escalations when they are not.

Verian should not replace the human. It should ensure the human's commitments are not forgotten.

---

## Why This Matters to Verian

321 Swipe's sales cycle is short. A merchant who submits a statement is often actively shopping
rates. The highest-value window is the 24–48 hours immediately following first contact or proposal
delivery.

If Verian generates qualified interest but cannot track whether a follow-through occurs, it
provides only partial value. The goal is end-to-end accountability: from the first form submission
through the close or disqualification.

---

## How Human Handoff Creates Pipeline Leakage

```
[Prospect submits statement]
        ↓
[Verian: intake → proposal → approval → send]     ← Verian has full visibility
        ↓
[Rep replies in Outlook / books call in calendar]  ← Visibility drops to zero
        ↓
[Call happens, rep says "I'll send the contract tomorrow"]
        ↓
[Contract is not sent]                             ← Verian has no signal
        ↓
[Lead goes cold — no one notices for a week]
```

The handoff moment is where qualified leads most often die.

---

## Intended Future Workflow

When activated, this module will:

1. **Detect handoff** — Identify when a Verian-generated proposal email receives a reply, or
   when a meeting is created with a known prospect contact.

2. **Create a follow-up obligation** — Record that a follow-up is expected within a defined
   window (e.g., 24 hours after a replied email, 4 hours after a completed meeting).

3. **Monitor completion** — Check whether the follow-up occurred (outbound email sent,
   CRM stage updated, task marked complete).

4. **Escalate if missed** — If the window passes without a follow-up signal, create an
   escalation notification. Depending on configuration, this may also update the lead's
   follow-up risk flag.

5. **Log all events** — Record all obligations, completions, and escalations as
   `activity_events` for reporting and agent scoring.

---

## What Verian Will Monitor (Future)

| Signal | Source | Purpose |
|---|---|---|
| Outbound emails sent by reps | Microsoft Graph / Outlook | Detect prospect replies |
| Inbound replies from prospects | Microsoft Graph / Outlook | Trigger follow-up obligation |
| Calendar events with prospect contacts | Microsoft Graph / Calendar | Detect meeting completions |
| Meeting organizer identity | Microsoft Graph | Attribute meeting to rep |
| CRM stage updates | Verian internal | Confirm follow-up happened in CRM |

Monitoring will be **read-only and scoped to business accounts only**. No personal email,
personal calendar, or personal device data will be accessed.

---

## What Verian Will NOT Monitor

The following are explicitly out of scope and must never be implemented without separate
board-level approval:

- Personal email accounts (Gmail, personal Outlook)
- Message body content (only metadata: sender, recipient, timestamp, thread ID)
- Call recordings or transcripts (unless separately authorized)
- Personal calendar events (only events with known prospect email addresses)
- Location data, device data, or browser activity
- Communication between employees that does not involve a known prospect contact
- Any data from personal devices

---

## Privacy and Team Trust Principles

This feature is designed to help reps, not surveil them.

**Guiding principles:**

1. **Opt-in org-wide, not per-person.** The admin enables this for the whole workspace;
   no individual rep is singled out.

2. **Transparency first.** Every rep will be informed exactly what is monitored, how it
   is used, and what triggers an escalation. There are no hidden signals.

3. **Context-driven, not punitive.** Missed follow-up obligations surface in dashboards
   as process gaps, not performance violations. The purpose is to catch things that slip,
   not to hold individuals accountable in a disciplinary sense.

4. **Minimum necessary data only.** Only email metadata (not body content) and
   calendar event participants are used. No content, no sentiment analysis.

5. **Reps can view their own obligations.** All obligations created for a rep are visible
   to that rep in their Verian workspace. No hidden scoring.

6. **Escalations go to workspace admins, not HR.** Escalation means a notification
   to a sales manager, not a personnel record.

---

## Admin Enable/Disable Controls

All controls seed as `value=false` (disabled). Each control must be explicitly enabled by
a workspace admin or platform admin before any monitoring begins.

| Control Key | Default | Purpose |
|---|---|---|
| `outlook_monitoring_enabled` | `false` | Gate for all Outlook/email signal ingestion |
| `calendar_monitoring_enabled` | `false` | Gate for calendar event monitoring |
| `follow_up_accountability_enabled` | `false` | Gate for obligation creation and tracking |
| `follow_up_auto_task_creation_enabled` | `false` | Gate for auto-creating CRM tasks from obligations |
| `follow_up_escalations_enabled` | `false` | Gate for sending escalation notifications |

The controls are evaluated in dependency order. Enabling `follow_up_accountability_enabled`
without also enabling `outlook_monitoring_enabled` or `calendar_monitoring_enabled` will
produce obligations but no signals to resolve them.

Recommended activation sequence:
1. Enable `outlook_monitoring_enabled` → verify signal ingestion in dev
2. Enable `calendar_monitoring_enabled` → verify calendar events land correctly
3. Enable `follow_up_accountability_enabled` → verify obligations are created
4. Enable `follow_up_auto_task_creation_enabled` → verify CRM tasks appear
5. Enable `follow_up_escalations_enabled` last → verify escalations route correctly

---

## Future Microsoft Graph Architecture

> This section describes intended architecture. Nothing in this section has been built.

### Permissions required (future)

Microsoft Graph OAuth2 scopes that will be requested:

| Scope | Purpose |
|---|---|
| `Mail.Read` (delegated) | Read email metadata for emails sent/received by enrolled accounts |
| `Calendars.Read` (delegated) | Read calendar events for enrolled accounts |
| `offline_access` | Maintain token refresh for background sync |

All scopes are **delegated** (acting as the signed-in user), not application-level.
No admin-consent-only scopes will be requested without explicit legal/compliance review.

### Authentication flow (future)

1. Admin authorizes the Verian integration in their Microsoft 365 tenant
2. Each rep explicitly connects their Outlook account from their Verian profile settings
3. Verian stores a refresh token per user (encrypted at rest, scoped per tenant)
4. Background sync polls Graph API at configurable intervals (default: every 15 minutes)

### Data retention (future)

- Email metadata (sender, recipient, thread ID, timestamp): retained for 90 days
- Calendar event metadata (participants, start/end time): retained for 90 days
- Message body content: **never stored**
- Obligation records: retained for 1 year for pipeline reporting

---

## Follow-Up Obligation Examples

| Trigger | Obligation Created | Window |
|---|---|---|
| Prospect replies to proposal email | Send follow-up email or update CRM stage | 24 hours |
| Meeting with prospect completed | Send recap / next-step email or update CRM | 4 hours |
| Rep sends proposal manually in Outlook (bypassing Verian) | Detect and link to lead; monitor for reply | 48 hours |
| No contact after statement review scheduled | Reminder to reschedule | 48 hours |

---

## Escalation Examples

| Situation | Escalation Action |
|---|---|
| Follow-up obligation missed after 24h | Workspace admin notified; lead flagged `follow_up_at_risk` |
| Obligation missed after 48h | Second notification; lead priority escalated to `critical` |
| Meeting completed with no follow-up after 8h | Immediate manager notification |
| 3+ obligations missed by same rep in 7 days | Workspace admin receives weekly digest |

Escalation thresholds are configurable per tenant. Defaults are conservative.

---

## Approval Requirements Before Activation

The following approvals are required before this feature can be activated in any production
tenant, in this order:

1. **Legal/compliance review** — Confirm that read-only email metadata monitoring is
   permissible under applicable data protection regulations for the tenant's jurisdiction.

2. **Employee disclosure** — All reps whose accounts will be monitored must receive a
   written disclosure explaining what is monitored, how it is used, and how to opt out.

3. **Admin sign-off** — A workspace admin must explicitly enable each control key
   after the above two steps are complete.

4. **Technical review** — The Microsoft Graph OAuth app registration must be reviewed
   and approved by 321 Swipe's Microsoft 365 admin before any token exchange occurs.

No activation can proceed based solely on technical readiness. All four steps are required.

---

## Recommended Team-Facing Explanation

The following is draft language for communicating this feature to the 321 Swipe team
when it becomes active. It should be reviewed and approved before distribution.

---

> **321 Swipe Sales Team — Follow-Up Accountability: What It Is and What It Isn't**
>
> Verian will soon be able to see when a prospect replies to one of your emails or when
> a meeting you scheduled with a prospect is completed. When that happens, Verian will
> create a follow-up task as a reminder that the ball is in your court.
>
> **What Verian sees:** Who sent an email, who received it, and when. Whether a calendar
> event with a prospect contact occurred. Nothing else.
>
> **What Verian does not see:** The content of your emails. Your personal calendar.
> Anything that isn't directly related to a Verian-tracked prospect.
>
> **What happens if you miss a follow-up:** Your sales manager receives a heads-up.
> That's it. This isn't a disciplinary tool — it's a safety net for leads that genuinely
> slip through the cracks when everyone is busy.
>
> **You can see your own obligations** any time in your Verian workspace.
>
> Questions? Ask your manager or reply to this message.

---

## Implementation Notes for Future Builder

When this phase is implemented:

- Tables needed: `outlook_connections`, `outlook_sync_state`, `interaction_events`,
  `follow_up_obligations`, `follow_up_escalations`
- The `activity_events` table already has event types for Outlook and calendar signals
  (added in Phase 3A) — use these as the behavioral event stream
- The `system_controls` table already contains all five control keys (seeded disabled)
- The `SystemControlKey` and `ActivityEventType` TypeScript constants already include
  all required keys — services should import from `modules/intelligence/types.agent.ts`
- Microsoft Graph webhook registration should go through a new `/api/webhooks/microsoft`
  route — do not reuse the existing Resend webhook endpoint
- All Graph API calls must go through a dedicated `lib/microsoft/graph-client.ts` module
  that enforces token scoping and rate limiting
- Obligation windows should be configurable per tenant via `system_controls`, not hardcoded

---

*Document created: Phase 3B-1 planning. Not for external distribution.*
