'use client'

// Preview is in-memory only — no DB writes, no LLM, no Resend, no campaign_email_sends writes.
// renderCampaignAsset is a pure synchronous function; no network or DB calls occur here.

import { useState } from 'react'
import type { Database } from '@/types/database'
import type { PersonalizationFields } from '@/modules/messaging/services/campaign-personalization.service'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import { extractMergeFields } from '@/modules/messaging/services/campaign-asset-validation.service'
import { APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

interface Props {
  asset:         CampaignEmailAssetRow
  initialFields: PersonalizationFields
}

export function CampaignAssetPreviewPanel({ asset, initialFields }: Props) {
  const [fields, setFields] = useState<PersonalizationFields>(initialFields)

  const allMergeFields = [
    ...extractMergeFields(asset.subject_template),
    ...extractMergeFields(asset.body_template_html),
    ...extractMergeFields(asset.body_template_text),
  ]
  const uniqueFields = [...new Set(allMergeFields)]

  const result = renderCampaignAsset(
    {
      subjectTemplate:  asset.subject_template,
      bodyTemplateHtml: asset.body_template_html,
      bodyTemplateText: asset.body_template_text,
      requiredFields:   (asset.required_fields as string[]) ?? [],
      fallbackValues:   (asset.fallback_values as Record<string, string>) ?? {},
    },
    fields
  )

  const unknownFields = uniqueFields.filter((f) => !(f in APPROVED_MERGE_FIELDS))

  function setField(name: string, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {uniqueFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Enter test values or select a lead above to preview personalization.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {uniqueFields.map((f) => (
              <label key={f} className="flex flex-col gap-0.5 text-xs">
                <span className="font-medium text-muted-foreground">{`{{${f}}}`}</span>
                <input
                  type="text"
                  value={(fields[f] as string) ?? ''}
                  onChange={(e) => setField(f, e.target.value)}
                  placeholder={APPROVED_MERGE_FIELDS[f]?.fallback ?? ''}
                  className="rounded border px-2 py-1 text-xs"
                />
              </label>
            ))}
          </div>
        )}

        {result.missingRequiredFields.length > 0 && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            Missing required fields: {result.missingRequiredFields.join(', ')}
          </div>
        )}

        {unknownFields.length > 0 && (
          <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
            Unknown fields (not in approved library): {unknownFields.join(', ')}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
            <p className="rounded bg-muted px-3 py-2 text-sm">{result.renderedSubject}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Body (Text)</p>
            <pre className="rounded bg-muted px-3 py-2 text-xs whitespace-pre-wrap">{result.renderedBodyText}</pre>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Body (HTML)</p>
            <div
              className="rounded bg-muted px-3 py-2 text-xs"
              dangerouslySetInnerHTML={{ __html: result.renderedBodyHtml }}
            />
          </div>
        </div>

        {Object.keys(result.personalizationSnapshot).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Resolved fields</summary>
            <table className="mt-1 w-full">
              <tbody>
                {Object.entries(result.personalizationSnapshot).map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-3 font-mono text-muted-foreground">{`{{${k}}}`}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
