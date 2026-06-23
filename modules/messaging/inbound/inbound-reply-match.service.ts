import { createSupabaseServiceClient } from '@/lib/supabase/service'

// MCM v2 — Inbound reply matching (P3.5). Correlate a captured reply back to the
// originating outbound send, then to its draft → contact / lead / assignment.
// Resolves tenant/workspace even when unmatched (via the reply-to sender identity)
// so the reply can still be persisted and forwarded. Best-effort: any DB failure
// degrades to 'unmatched' / null rather than throwing.

export interface InboundMatchInput {
  from: string
  to?: string | null
  inReplyTo?: string | null
  references?: string | null
}

export interface InboundMatchResult {
  tenantId: string | null
  workspaceId: string | null
  matchStatus: 'matched' | 'unmatched'
  matchedEmailSendId: string | null
  matchedContactId: string | null
  matchedLeadId: string | null
  matchedAssignmentId: string | null
}

interface MatchedSend {
  id: string
  tenant_id: string
  workspace_id: string | null
  draft_id: string | null
}

const UNMATCHED: InboundMatchResult = {
  tenantId: null,
  workspaceId: null,
  matchStatus: 'unmatched',
  matchedEmailSendId: null,
  matchedContactId: null,
  matchedLeadId: null,
  matchedAssignmentId: null,
}

// Pull candidate provider message ids out of In-Reply-To + References, stripping
// the angle-bracket framing mail clients add (<id> → id).
function candidateMessageIds(inReplyTo?: string | null, references?: string | null): string[] {
  const raw = [inReplyTo ?? '', ...(references ?? '').split(/\s+/)]
  const cleaned = raw
    .map(s => s.trim().replace(/^<|>$/g, '').trim())
    .filter(Boolean)
  return [...new Set(cleaned)]
}

export async function matchInboundReply(input: InboundMatchInput): Promise<InboundMatchResult> {
  const supabase = createSupabaseServiceClient()

  // (a) Thread headers → the originating send by resend_message_id.
  const candidates = candidateMessageIds(input.inReplyTo, input.references)
  let send: MatchedSend | null = null

  if (candidates.length > 0) {
    const { data } = await supabase
      .from('email_sends')
      .select('id, tenant_id, workspace_id, draft_id')
      .in('resend_message_id', candidates)
      .limit(1)
      .maybeSingle()
    send = (data as MatchedSend | null) ?? null
  }

  // (b) Fallback → most-recent send to this address (case-insensitive).
  if (!send && input.from) {
    const { data } = await supabase
      .from('email_sends')
      .select('id, tenant_id, workspace_id, draft_id')
      .ilike('to_email', input.from)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    send = (data as MatchedSend | null) ?? null
  }

  if (send) {
    let contactId: string | null = null
    let leadId: string | null = null
    let assignmentId: string | null = null

    if (send.draft_id) {
      const { data: draft } = await supabase
        .from('email_drafts')
        .select('contact_id, lead_id, campaign_assignment_id')
        .eq('id', send.draft_id)
        .maybeSingle()
      const d = draft as { contact_id: string | null; lead_id: string | null; campaign_assignment_id: string | null } | null
      contactId = d?.contact_id ?? null
      leadId = d?.lead_id ?? null
      assignmentId = d?.campaign_assignment_id ?? null
    }

    return {
      tenantId: send.tenant_id,
      workspaceId: send.workspace_id,
      matchStatus: 'matched',
      matchedEmailSendId: send.id,
      matchedContactId: contactId,
      matchedLeadId: leadId,
      matchedAssignmentId: assignmentId,
    }
  }

  // Unmatched — still resolve the tenant via the reply-to sender identity so the
  // reply can be logged + forwarded for that tenant's team.
  if (input.to) {
    const { data: identity } = await supabase
      .from('sender_identities')
      .select('tenant_id')
      .ilike('email', input.to)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    const tenantId = (identity as { tenant_id: string } | null)?.tenant_id ?? null
    if (tenantId) {
      return { ...UNMATCHED, tenantId }
    }
  }

  return { ...UNMATCHED }
}
