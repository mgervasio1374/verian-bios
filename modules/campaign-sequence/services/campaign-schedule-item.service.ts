import {
  getCampaignScheduleItemById,
  listCampaignScheduleItems,
  listCampaignScheduleItemsForAssignment,
  listCampaignScheduleItemsForSequence,
} from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import type {
  CampaignScheduleItemRow,
  ListCampaignScheduleItemsOptions,
} from '@/modules/campaign-sequence/types'

export async function fetchCampaignScheduleItemById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow | null> {
  return getCampaignScheduleItemById(id, tenantId, workspaceId)
}

export async function fetchCampaignScheduleItems(
  opts: ListCampaignScheduleItemsOptions,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItems(opts)
}

export async function fetchCampaignScheduleItemsForAssignment(
  campaignAssignmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItemsForAssignment(campaignAssignmentId, tenantId, workspaceId)
}

export async function fetchCampaignScheduleItemsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  return listCampaignScheduleItemsForSequence(campaignSequenceId, tenantId, workspaceId)
}
