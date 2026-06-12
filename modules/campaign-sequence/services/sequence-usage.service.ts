// MCM v2 Slice V1 — usage probes driving the sequence/asset edit-delete rule table:
//   active     -> edit/delete locked ("stop the campaign first")
//   historical -> limited edit (no step removal), archive instead of delete
//   unused     -> full edit + hard delete
//
// Read-only probes. No sends, no schedule writes, no assignment mutations.

import {
  countActiveAssignmentsForSequence,
  countActiveAssignmentsForSequences,
  getAssignmentCountsBySequence,
} from '@/modules/messaging/repositories/campaign-assignment.repo'
import { hasScheduleItemsForSequence } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { listStepsReferencingAsset } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { getDraftsBySourceAsset } from '@/modules/messaging/repositories/email-draft.repo'
import { listCampaignSequenceStepsForSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { listManualSequencesForWorkspace } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { listAssetsForWorkspace } from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { looksLikeAiPrompt } from '@/modules/campaign-sequence/prompt-leak-guard'

export interface SequenceUsage {
  active:     number
  total:      number // assignments of any status referencing the sequence
  historical: boolean
}

export type SequenceUsageState = 'active' | 'historical' | 'unused'

export function usageState(usage: SequenceUsage): SequenceUsageState {
  if (usage.active > 0) return 'active'
  if (usage.historical) return 'historical'
  return 'unused'
}

export async function sequenceUsage(
  sequenceId:  string,
  tenantId:    string,
  workspaceId: string,
): Promise<SequenceUsage> {
  const active = await countActiveAssignmentsForSequence(sequenceId, tenantId, workspaceId)
  const counts = await getAssignmentCountsBySequence(tenantId, workspaceId)
  const total  = counts.get(sequenceId)?.total ?? 0

  // Schedule items only exist downstream of assignments, but probe both per
  // the rule table — historical means ANY reference.
  const historical =
    total > 0 ||
    (await hasScheduleItemsForSequence(sequenceId, tenantId, workspaceId))

  return { active, total, historical }
}

// Bulk variant for the sequence list page: one assignments fetch, plus a
// schedule-item existence probe only for sequences with zero assignments.
export async function sequenceUsageForWorkspace(
  tenantId:    string,
  workspaceId: string,
  sequenceIds: string[],
): Promise<Map<string, SequenceUsage>> {
  const counts = await getAssignmentCountsBySequence(tenantId, workspaceId)
  const result = new Map<string, SequenceUsage>()

  for (const id of sequenceIds) {
    const entry = counts.get(id) ?? { active: 0, total: 0 }
    const historical =
      entry.total > 0 || (await hasScheduleItemsForSequence(id, tenantId, workspaceId))
    result.set(id, { active: entry.active, total: entry.total, historical })
  }
  return result
}

export interface AssetUsage {
  activeAssignments: number   // sequences with an ACTIVE assignment reference this asset -> locked
  referencedBySteps: boolean  // any sequence step links it
  referencedByDrafts: boolean // any email_drafts.source_asset_id links it
}

export async function assetUsage(
  assetId:     string,
  tenantId:    string,
  workspaceId: string,
): Promise<AssetUsage> {
  const steps       = await listStepsReferencingAsset(assetId, tenantId)
  const sequenceIds = [...new Set(steps.map(s => s.campaign_sequence_id))]

  const [activeAssignments, drafts] = await Promise.all([
    countActiveAssignmentsForSequences(sequenceIds, tenantId, workspaceId),
    getDraftsBySourceAsset(tenantId, assetId, 1),
  ])

  return {
    activeAssignments,
    referencedBySteps:  steps.length > 0,
    referencedByDrafts: drafts.length > 0,
  }
}

// Sequence ids (manual, non-archived) referencing at least one asset whose
// body trips the prompt-leak heuristic. Used by the bulk-assign panel warning.
export async function sequencesWithPromptRisk(
  tenantId:    string,
  workspaceId: string,
): Promise<Set<string>> {
  const [sequences, assets] = await Promise.all([
    listManualSequencesForWorkspace(tenantId, workspaceId),
    listAssetsForWorkspace(tenantId, workspaceId),
  ])

  const riskyAssetIds = new Set(
    assets
      .filter(a => looksLikeAiPrompt(a.body_template_text ?? a.body_template_html ?? ''))
      .map(a => a.id),
  )
  if (riskyAssetIds.size === 0) return new Set()

  const risky = new Set<string>()
  for (const sequence of sequences) {
    const steps = await listCampaignSequenceStepsForSequence(sequence.id, tenantId, workspaceId)
    if (steps.some(s => s.campaign_email_asset_id && riskyAssetIds.has(s.campaign_email_asset_id))) {
      risky.add(sequence.id)
    }
  }
  return risky
}
