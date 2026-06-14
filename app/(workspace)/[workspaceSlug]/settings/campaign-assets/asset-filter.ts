import type { Database } from '@/types/database'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

export interface AssetFilter {
  campaignType?: string // '' = all
  search?:       string // case-insensitive substring of asset_name
}

// Pure list filter shared by the client component and its tests.
export function filterAssets<T extends Pick<CampaignEmailAssetRow, 'asset_name' | 'campaign_type'>>(
  assets: T[],
  filter: AssetFilter,
): T[] {
  const type   = filter.campaignType?.trim() ?? ''
  const search = filter.search?.trim().toLowerCase() ?? ''

  return assets.filter(a => {
    if (type && a.campaign_type !== type) return false
    if (search && !(a.asset_name ?? '').toLowerCase().includes(search)) return false
    return true
  })
}
