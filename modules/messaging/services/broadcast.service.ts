import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildSystemContext } from '@/lib/auth/context'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { createDraftFromAsset } from '@/modules/messaging/services/campaign-asset-draft.service'
import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'
import { checkEmailSuppression } from '@/modules/messaging/repositories/suppression.repo'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

// One-time broadcasts — a single email to a large cohort, dripped at whatever
// the velocity governor currently allows.
//
// The scheduling model is a priority queue over one shared daily allowance.
// Campaign assignments are priority 1 and are dispatched first; a broadcast is
// priority 2 and consumes only what is left. That means a dated campaign
// inserted mid-blast automatically takes precedence without anything having to
// detect the pivot: the campaigns simply eat the allowance first.
//
// Explicit queueing exists on top of that for the case the automatic yield does
// not cover. A blast to the whole book can run for weeks; if a fall expo campaign
// launches in September, the operator wants the blast to stop entirely rather
// than trickle alongside, and to resume afterwards without re-selecting the
// cohort. A queued broadcast keeps its materialized recipient list and its
// position, and waits out a grace period once campaigns finish so the same
// merchant is not emailed twice in two days.

// Pure scheduling logic lives in broadcast.scheduling so it is testable without
// the Resend/Supabase chain. Re-exported here so callers have one import site.
export {
  BROADCAST_PRIORITY,
  CAMPAIGN_PRIORITY,
  toDateKey,
  addDaysKey,
  evaluateResume,
  broadcastAllowance,
  evaluateSendTiming,
  localMinutesOfDay,
} from './broadcast.scheduling'
export type {
  BroadcastStatus, ResumeDecision, BroadcastSchedule, SendTimingVerdict,
} from './broadcast.scheduling'

import {
  toDateKey,
  evaluateResume,
  evaluateSendTiming,
  BROADCAST_PRIORITY,
  type BroadcastStatus,
  type ResumeDecision,
} from './broadcast.scheduling'

export interface Broadcast {
  id:                   string
  tenantId:             string
  workspaceId:          string
  name:                 string
  campaignEmailAssetId: string
  status:               BroadcastStatus
  priority:             number
  gracePeriodDays:      number
  resumeAfter:          string | null
  totalRecipients:      number
  sentCount:            number
  startsAt:             string | null
  sendWindowStart:      string
  sendWindowEnd:        string
  timeZone:             string
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function toBroadcast(row: Record<string, unknown>): Broadcast {
  return {
    id:                   row.id as string,
    tenantId:             row.tenant_id as string,
    workspaceId:          row.workspace_id as string,
    name:                 row.name as string,
    campaignEmailAssetId: row.campaign_email_asset_id as string,
    status:               row.status as BroadcastStatus,
    priority:             Number(row.priority ?? BROADCAST_PRIORITY),
    gracePeriodDays:      Number(row.grace_period_days ?? 7),
    resumeAfter:          (row.resume_after as string | null) ?? null,
    totalRecipients:      Number(row.total_recipients ?? 0),
    sentCount:            Number(row.sent_count ?? 0),
    startsAt:             (row.starts_at as string | null) ?? null,
    sendWindowStart:      (row.send_window_start as string | null) ?? '09:00',
    sendWindowEnd:        (row.send_window_end   as string | null) ?? '17:00',
    timeZone:             (row.time_zone         as string | null) ?? 'America/New_York',
  }
}

export async function getActiveOrQueuedBroadcast(
  tenantId: string, workspaceId: string,
): Promise<Broadcast | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'queued'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getActiveOrQueuedBroadcast: ${error.message}`)
  return data ? toBroadcast(data as unknown as Record<string, unknown>) : null
}

export async function listBroadcasts(
  tenantId: string, workspaceId: string, limit = 25,
): Promise<Broadcast[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listBroadcasts: ${error.message}`)
  return (data ?? []).map(r => toBroadcast(r as unknown as Record<string, unknown>))
}

export async function getBroadcastById(id: string, tenantId: string): Promise<Broadcast | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('broadcasts').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`getBroadcastById: ${error.message}`)
  return data ? toBroadcast(data as unknown as Record<string, unknown>) : null
}

/** Live campaign assignments, i.e. whatever holds priority over a broadcast. */
export async function countActiveCampaignAssignments(
  tenantId: string, workspaceId: string,
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('campaign_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('assignment_status', ['proposed', 'assigned'])
  if (error) throw new Error(`countActiveCampaignAssignments: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateBroadcastInput {
  tenantId:               string
  workspaceId:            string
  name:                   string
  campaignEmailAssetId:   string
  companyIds:             string[]
  gracePeriodDays?:       number
  includeFormerCustomers?: boolean
  createdBy?:             string | null
  /** Earliest instant sending may begin. Null starts on the next tick. */
  startsAt?:              string | null
  sendWindowStart?:       string
  sendWindowEnd?:         string
  timeZone?:              string
}

export interface CreateBroadcastResult {
  broadcastId:      string
  totalRecipients:  number
  skippedNoEmail:   number
  skippedDoNotContact: number
  skippedSuppressed:   number
  skippedCustomers:    number
  skippedFormerCustomers: number
  skippedDuplicateEmail:  number
}

/**
 * Materialize the cohort now, one row per address.
 *
 * Every exclusion the campaign path applies is applied here too. A broadcast is
 * the single largest send the system can make, so it is the worst possible place
 * to discover that suppression was only enforced downstream.
 */
export async function createBroadcast(input: CreateBroadcastInput): Promise<CreateBroadcastResult> {
  const supabase = createSupabaseServiceClient()

  const { data: broadcastRow, error: insertError } = await supabase
    .from('broadcasts')
    .insert({
      tenant_id:               input.tenantId,
      workspace_id:            input.workspaceId,
      name:                    input.name,
      campaign_email_asset_id: input.campaignEmailAssetId,
      status:                  'draft',
      priority:                BROADCAST_PRIORITY,
      grace_period_days:       input.gracePeriodDays ?? 7,
      created_by:              input.createdBy ?? null,
      starts_at:               input.startsAt ?? null,
      send_window_start:       input.sendWindowStart ?? '09:00',
      send_window_end:         input.sendWindowEnd   ?? '17:00',
      time_zone:               input.timeZone        ?? 'America/New_York',
    })
    .select()
    .single()
  if (insertError) throw new Error(`createBroadcast: ${insertError.message}`)

  const broadcastId = broadcastRow.id as string
  const result: CreateBroadcastResult = {
    broadcastId,
    totalRecipients: 0,
    skippedNoEmail: 0, skippedDoNotContact: 0, skippedSuppressed: 0,
    skippedCustomers: 0, skippedFormerCustomers: 0, skippedDuplicateEmail: 0,
  }

  // Company status, to apply the same cold-campaign exclusions. Chunked rather
  // than truncated: a missing entry reads as "no status", which would silently
  // let customers and former customers through on any cohort past the cutoff.
  const statusById = new Map<string, string | null>()
  for (let i = 0; i < input.companyIds.length; i += 500) {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, customer_status')
      .eq('tenant_id', input.tenantId)
      .in('id', input.companyIds.slice(i, i + 500))
    if (error) throw new Error(`createBroadcast company status: ${error.message}`)
    for (const c of companies ?? []) {
      statusById.set(c.id as string, c.customer_status as string | null)
    }
  }

  const seenEmails = new Set<string>()
  const rows: Array<Record<string, unknown>> = []

  for (const companyId of input.companyIds) {
    const status = statusById.get(companyId)
    if (status === 'customer') { result.skippedCustomers++; continue }
    if (status === 'former_customer' && !input.includeFormerCustomers) {
      result.skippedFormerCustomers++
      continue
    }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, do_not_contact, company_id')
      .eq('tenant_id', input.tenantId)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    for (const contact of contacts ?? []) {
      const email = (contact.email as string | null)?.trim()
      if (!email) { result.skippedNoEmail++; continue }
      if (contact.do_not_contact) { result.skippedDoNotContact++; continue }

      const key = email.toLowerCase()
      if (seenEmails.has(key)) { result.skippedDuplicateEmail++; continue }

      const suppression = await checkEmailSuppression(input.tenantId, email).catch(() => ({ blocked: false }))
      if (suppression.blocked) { result.skippedSuppressed++; continue }

      // The draft builder is lead-based, so a recipient needs one.
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('tenant_id', input.tenantId)
        .eq('contact_id', contact.id as string)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

      seenEmails.add(key)
      rows.push({
        broadcast_id: broadcastId,
        tenant_id:    input.tenantId,
        lead_id:      lead?.id ?? null,
        contact_id:   contact.id,
        company_id:   companyId,
        email,
        status:       lead?.id ? 'pending' : 'skipped',
        skip_reason:  lead?.id ? null : 'no_lead_record',
      })
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('broadcast_recipients')
      .upsert(rows.slice(i, i + 500), { onConflict: 'broadcast_id,email', ignoreDuplicates: true })
    if (error) throw new Error(`createBroadcast recipients: ${error.message}`)
  }

  result.totalRecipients = rows.filter(r => r.status === 'pending').length
  await supabase
    .from('broadcasts')
    .update({ total_recipients: result.totalRecipients, updated_at: new Date().toISOString() })
    .eq('id', broadcastId)

  return result
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function setStatus(
  id: string, tenantId: string, status: BroadcastStatus, extra: Record<string, unknown> = {},
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('broadcasts')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`broadcast setStatus: ${error.message}`)
}

export async function startBroadcast(id: string, tenantId: string): Promise<void> {
  await setStatus(id, tenantId, 'active', { started_at: new Date().toISOString(), resume_after: null })
}

/** Pause without losing the cohort or the position. */
export async function queueBroadcast(id: string, tenantId: string): Promise<void> {
  await setStatus(id, tenantId, 'queued', { queued_at: new Date().toISOString(), resume_after: null })
  await recordActivity({
    tenantId,
    eventType:    ActivityEventType.BROADCAST_QUEUED,
    eventSource:  'broadcast',
    entityType:   'broadcast',
    entityId:     id,
    eventSummary: 'Broadcast queued behind a campaign',
  }).catch(() => {})
}

export async function terminateBroadcast(id: string, tenantId: string): Promise<void> {
  await setStatus(id, tenantId, 'terminated', { terminated_at: new Date().toISOString() })
  await recordActivity({
    tenantId,
    eventType:    ActivityEventType.BROADCAST_TERMINATED,
    eventSource:  'broadcast',
    entityType:   'broadcast',
    entityId:     id,
    eventSummary: 'Broadcast terminated; remaining recipients will not be emailed',
  }).catch(() => {})
}

/**
 * Move a queued broadcast toward resuming. Called each dispatch tick.
 * Returns the decision taken so the caller can log it.
 */
export async function resumeQueuedBroadcast(
  tenantId: string, workspaceId: string, now: Date = new Date(),
): Promise<ResumeDecision | { action: 'none' }> {
  const broadcast = await getActiveOrQueuedBroadcast(tenantId, workspaceId)
  if (!broadcast || broadcast.status !== 'queued') return { action: 'none' }

  const activeCampaignCount = await countActiveCampaignAssignments(tenantId, workspaceId)
  const decision = evaluateResume({ broadcast, activeCampaignCount, today: toDateKey(now) })

  if (decision.action === 'start_grace') {
    await setStatus(broadcast.id, tenantId, 'queued', { resume_after: decision.resumeAfter })
  } else if (decision.action === 'resume') {
    await startBroadcast(broadcast.id, tenantId)
  } else if (decision.reason === 'campaigns_active' && broadcast.resumeAfter) {
    // A new campaign started during the grace window. Void the accrued grace so
    // the full period is served after this campaign finishes too.
    await setStatus(broadcast.id, tenantId, 'queued', { resume_after: null })
  }
  return decision
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface BroadcastDispatchResult {
  broadcastId?: string
  sent:         number
  failed:       number
  skipped:      number
  completed:    boolean
  reason?:      string
}

/**
 * Send up to `limit` pending recipients of the active broadcast.
 *
 * `limit` is whatever the velocity governor has left after campaigns, which is
 * how priority is actually enforced. Every send still passes through
 * sendApprovedDraft, so suppression, do-not-contact, the recipient guard and the
 * kill switch all apply exactly as they do for campaign mail.
 */
export async function dispatchBroadcast(
  tenantId: string, workspaceId: string, limit: number, now: Date = new Date(),
): Promise<BroadcastDispatchResult> {
  if (limit <= 0) return { sent: 0, failed: 0, skipped: 0, completed: false, reason: 'no_allowance' }

  const broadcast = await getActiveOrQueuedBroadcast(tenantId, workspaceId)
  if (!broadcast) return { sent: 0, failed: 0, skipped: 0, completed: false, reason: 'no_broadcast' }
  if (broadcast.status !== 'active') {
    return { sent: 0, failed: 0, skipped: 0, completed: false, reason: `status_${broadcast.status}` }
  }

  // Start time and daily business-hours window. Checked before any recipient is
  // read so an out-of-hours tick is a cheap no-op, and so nothing can be marked
  // sent outside the window.
  const timing = evaluateSendTiming({
    startsAt:        broadcast.startsAt,
    sendWindowStart: broadcast.sendWindowStart,
    sendWindowEnd:   broadcast.sendWindowEnd,
    timeZone:        broadcast.timeZone,
  }, now)
  if (!timing.canSend) {
    return {
      broadcastId: broadcast.id,
      sent: 0, failed: 0, skipped: 0, completed: false,
      reason: timing.reason,
    }
  }

  const supabase = createSupabaseServiceClient()
  const { data: recipients, error } = await supabase
    .from('broadcast_recipients')
    .select('*')
    .eq('broadcast_id', broadcast.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`dispatchBroadcast: ${error.message}`)

  if (!recipients || recipients.length === 0) {
    await setStatus(broadcast.id, tenantId, 'completed', { completed_at: new Date().toISOString() })
    await recordActivity({
      tenantId,
      eventType:    ActivityEventType.BROADCAST_COMPLETED,
      eventSource:  'broadcast',
      entityType:   'broadcast',
      entityId:     broadcast.id,
      eventSummary: `Broadcast "${broadcast.name}" finished: ${broadcast.sentCount} sent`,
    }).catch(() => {})
    return { broadcastId: broadcast.id, sent: 0, failed: 0, skipped: 0, completed: true }
  }

  const ctx = buildSystemContext(tenantId, workspaceId)
  let sent = 0, failed = 0, skipped = 0

  for (const r of recipients) {
    const recipientId = r.id as string
    const leadId      = r.lead_id as string | null
    if (!leadId) {
      await supabase.from('broadcast_recipients')
        .update({ status: 'skipped', skip_reason: 'no_lead_record' }).eq('id', recipientId)
      skipped++
      continue
    }

    try {
      const draft = await createDraftFromAsset({
        tenantId,
        workspaceId,
        assetId:     broadcast.campaignEmailAssetId,
        leadId,
        requestedBy: 'system',
      })
      if (!draft.ok) {
        await supabase.from('broadcast_recipients')
          .update({ status: 'failed', skip_reason: draft.reason }).eq('id', recipientId)
        failed++
        continue
      }

      // Auto-approve: the operator approved the whole cohort when they started
      // the broadcast. Resolved directly through the repo, matching the campaign
      // auto-send path — no permission check, no first-touch handler.
      await approvalRepo.resolveApprovalRequest(
        draft.approvalRequestId, tenantId, null, 'approved',
        { auto_approved: true, reason: 'broadcast_send', broadcast_id: broadcast.id },
      )
      await emailDraftRepo.updateDraftStatus(draft.draftId, {
        status:          'approved',
        approvedAt:      new Date().toISOString(),
        approvedBy:      null,
        ifCurrentStatus: 'draft',
      })

      const result = await sendApprovedDraft(ctx, draft.draftId)
      if (result.ok) {
        await supabase.from('broadcast_recipients').update({
          status: 'sent', email_draft_id: draft.draftId,
          email_send_id: result.sendId, sent_at: new Date().toISOString(),
        }).eq('id', recipientId)
        sent++
      } else {
        await supabase.from('broadcast_recipients').update({
          status: 'failed', email_draft_id: draft.draftId, skip_reason: result.reason,
        }).eq('id', recipientId)
        failed++
      }
    } catch (err) {
      await supabase.from('broadcast_recipients').update({
        status: 'failed', skip_reason: err instanceof Error ? err.message : 'unknown_error',
      }).eq('id', recipientId)
      failed++
    }
  }

  if (sent > 0) {
    await supabase.from('broadcasts')
      .update({ sent_count: broadcast.sentCount + sent, updated_at: new Date().toISOString() })
      .eq('id', broadcast.id)
  }

  return { broadcastId: broadcast.id, sent, failed, skipped, completed: false }
}
