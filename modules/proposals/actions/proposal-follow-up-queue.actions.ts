'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getProposalFollowUpQueueForWorkspace } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import type { ProposalFollowUpQueueResponse } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import type { ListProposalFollowUpQueueOptions } from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface GetProposalFollowUpQueueActionInput {
  due?: 'overdue' | 'today' | 'upcoming' | 'all'
  followUpSequence?: number
  proposalStatus?: string | string[]
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Input sanitization — applied before any value reaches the service layer.
// Prevents accidental huge ranges, negative offsets, or invalid filter values.
// ---------------------------------------------------------------------------

const LIMIT_MAX = 100
const LIMIT_MIN = 1
const FOLLOW_UP_SEQUENCE_MIN = 1
const FOLLOW_UP_SEQUENCE_MAX = 20

function sanitizeDueFilter(
  value: unknown
): 'overdue' | 'today' | 'upcoming' | 'all' | undefined {
  if (value === 'overdue' || value === 'today' || value === 'upcoming' || value === 'all') {
    return value
  }
  return undefined
}

// Clamps to [LIMIT_MIN, LIMIT_MAX]. Returns undefined for invalid/non-integer values,
// letting the service/repository default of 100 remain authoritative.
function sanitizeLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < LIMIT_MIN) return undefined
  return Math.min(n, LIMIT_MAX)
}

// Returns undefined for negative, non-integer, or non-finite values,
// letting the service/repository default of 0 remain authoritative.
function sanitizeOffset(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined
  return n
}

// Out-of-range values are dropped (returned as undefined), not clamped,
// to avoid querying with an unintended sequence number.
function sanitizeFollowUpSequence(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  if (
    !Number.isFinite(n) ||
    !Number.isInteger(n) ||
    n < FOLLOW_UP_SEQUENCE_MIN ||
    n > FOLLOW_UP_SEQUENCE_MAX
  ) return undefined
  return n
}

// Trims strings and removes empties. Returns undefined if result is empty.
function sanitizeProposalStatusFilter(
  value: unknown
): string | string[] | undefined {
  if (value === undefined || value === null) return undefined
  const values = Array.isArray(value) ? value : [value]
  const cleaned = values
    .filter((v): v is string => typeof v === 'string')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  if (cleaned.length === 0) return undefined
  return cleaned.length === 1 ? cleaned[0] : cleaned
}

function sanitizeFollowUpQueueInput(
  input: GetProposalFollowUpQueueActionInput | undefined
): ListProposalFollowUpQueueOptions {
  const sanitized: ListProposalFollowUpQueueOptions = {}

  const due = sanitizeDueFilter(input?.due)
  if (due !== undefined) sanitized.due = due

  const seq = sanitizeFollowUpSequence(input?.followUpSequence)
  if (seq !== undefined) sanitized.followUpSequence = seq

  const status = sanitizeProposalStatusFilter(input?.proposalStatus)
  if (status !== undefined) sanitized.proposalStatus = status

  const limit = sanitizeLimit(input?.limit)
  if (limit !== undefined) sanitized.limit = limit

  const offset = sanitizeOffset(input?.offset)
  if (offset !== undefined) sanitized.offset = offset

  return sanitized
}

// ---------------------------------------------------------------------------
// Read-only server action
// ---------------------------------------------------------------------------

export async function getProposalFollowUpQueueAction(
  input?: GetProposalFollowUpQueueActionInput
): Promise<ActionResult<ProposalFollowUpQueueResponse>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const sanitized = sanitizeFollowUpQueueInput(input)
    const result = await getProposalFollowUpQueueForWorkspace(ctx.tenantId, ctx.workspaceId, sanitized)

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: {
        items:          result.items,
        summary:        result.summary,
        appliedFilters: result.appliedFilters,
        generatedAt:    result.generatedAt,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
