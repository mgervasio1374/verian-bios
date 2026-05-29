import Link from 'next/link'
import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignAssetStatusBadge } from './CampaignAssetStatusBadge'
import { CampaignAssetPreviewPanel } from './CampaignAssetPreviewPanel'
import { CampaignAssetPerformancePlaceholder } from './CampaignAssetPerformancePlaceholder'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

interface Props {
  asset:         CampaignEmailAssetRow
  workspaceSlug: string
}

export function CampaignAssetDetail({ asset, workspaceSlug }: Props) {
  const fields   = (asset.personalization_fields as string[]) ?? []
  const required = (asset.required_fields as string[]) ?? []
  const fallbacks = (asset.fallback_values as Record<string, string>) ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{asset.asset_name}</h1>
            <CampaignAssetStatusBadge status={asset.status} />
            {asset.llm_generated && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">AI</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {asset.campaign_type.replace(/_/g, ' ')} · Updated {new Date(asset.updated_at).toLocaleDateString()}
          </p>
        </div>
        <Link
          href={`/${workspaceSlug}/settings/campaign-assets`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to library
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Templates</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
              <p className="rounded bg-muted px-3 py-2 text-sm font-mono">{asset.subject_template}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Body HTML</p>
              <pre className="rounded bg-muted px-3 py-2 text-xs whitespace-pre-wrap overflow-x-auto">{asset.body_template_html}</pre>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Body Text</p>
              <pre className="rounded bg-muted px-3 py-2 text-xs whitespace-pre-wrap">{asset.body_template_text}</pre>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Field Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Personalization Fields ({fields.length})</p>
                <div className="flex flex-wrap gap-1">
                  {fields.map((f) => (
                    <code key={f} className="rounded bg-muted px-1.5 py-0.5 text-xs">{`{{${f}}}`}</code>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Required Fields ({required.length})</p>
                <div className="flex flex-wrap gap-1">
                  {required.map((f) => (
                    <code key={f} className="rounded bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">{`{{${f}}}`}</code>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Fallback Values</p>
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {Object.entries(fallbacks).map(([k, v]) => (
                      <tr key={k}>
                        <td className="py-1 pr-3 font-mono text-muted-foreground">{`{{${k}}}`}</td>
                        <td className="py-1">{v || <span className="text-muted-foreground italic">empty</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {asset.approved_by && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Approval</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Approved by <span className="font-medium text-foreground">{asset.approved_by}</span>
                  {asset.approved_at && (
                    <> on {new Date(asset.approved_at).toLocaleDateString()}</>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CampaignAssetPreviewPanel asset={asset} initialFields={{}} />
      <CampaignAssetPerformancePlaceholder />
    </div>
  )
}
