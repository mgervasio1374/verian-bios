import {
  getCampaignTypeById,
  listCampaignTypes,
} from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import type {
  CampaignTypeRow,
  ListCampaignTypesOptions,
} from '@/modules/campaign-sequence/types'

export async function fetchCampaignTypeById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignTypeRow | null> {
  return getCampaignTypeById(id, tenantId, workspaceId)
}

export async function fetchCampaignTypes(
  opts: ListCampaignTypesOptions,
): Promise<CampaignTypeRow[]> {
  return listCampaignTypes(opts)
}
