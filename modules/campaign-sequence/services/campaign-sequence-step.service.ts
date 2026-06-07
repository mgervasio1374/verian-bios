import {
  getCampaignSequenceStepById,
  listCampaignSequenceStepsForSequence,
} from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import type { CampaignSequenceStepRow } from '@/modules/campaign-sequence/types'

export async function fetchCampaignSequenceStepById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceStepRow | null> {
  return getCampaignSequenceStepById(id, tenantId, workspaceId)
}

export async function fetchCampaignSequenceStepsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceStepRow[]> {
  return listCampaignSequenceStepsForSequence(campaignSequenceId, tenantId, workspaceId)
}
