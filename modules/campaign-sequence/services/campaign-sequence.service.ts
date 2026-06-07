import {
  getCampaignSequenceById,
  listCampaignSequencesForType,
  getDefaultCampaignSequenceForType,
} from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import type { CampaignSequenceRow } from '@/modules/campaign-sequence/types'

export async function fetchCampaignSequenceById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow | null> {
  return getCampaignSequenceById(id, tenantId, workspaceId)
}

export async function fetchCampaignSequencesForType(
  campaignTypeId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow[]> {
  return listCampaignSequencesForType(campaignTypeId, tenantId, workspaceId)
}

export async function fetchDefaultCampaignSequenceForType(
  campaignTypeId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow | null> {
  return getDefaultCampaignSequenceForType(campaignTypeId, tenantId, workspaceId)
}
