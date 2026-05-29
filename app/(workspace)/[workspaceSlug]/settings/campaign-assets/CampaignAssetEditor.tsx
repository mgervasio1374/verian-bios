'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetTemplateContent } from '@/modules/messaging/campaign-assets/campaign-asset.types'
import { CAMPAIGN_TYPE, APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { validateAssetTemplate, extractMergeFields } from '@/modules/messaging/services/campaign-asset-validation.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createHumanAssetAction, updateAssetContentAction } from './actions'

interface Props {
  workspaceSlug: string
  assetId?:      string
  initial?: {
    assetName:     string
    campaignType:  string
  } & AssetTemplateContent
}

const CAMPAIGN_TYPE_OPTIONS = Object.entries(CAMPAIGN_TYPE).map(([, v]) => ({
  label: v.replace(/_/g, ' '),
  value: v,
}))

export function CampaignAssetEditor({ workspaceSlug, assetId, initial }: Props) {
  const router      = useRouter()
  const [pending, startTransition] = useTransition()

  const [assetName,     setAssetName]     = useState(initial?.assetName ?? '')
  const [campaignType,  setCampaignType]  = useState(initial?.campaignType ?? CAMPAIGN_TYPE.INITIAL_CONTACT)
  const [subject,       setSubject]       = useState(initial?.subjectTemplate ?? '')
  const [bodyHtml,      setBodyHtml]      = useState(initial?.bodyTemplateHtml ?? '')
  const [bodyText,      setBodyText]      = useState(initial?.bodyTemplateText ?? '')
  const [reqFields,     setReqFields]     = useState(initial?.requiredFields.join(', ') ?? '')
  const [fallbacksRaw,  setFallbacksRaw]  = useState(
    Object.entries(initial?.fallbackValues ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
  )
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [serverError,       setServerError]       = useState<string | null>(null)

  function buildContent(): AssetTemplateContent & { assetName: string; campaignType: string } {
    const personalizationFields = [
      ...extractMergeFields(subject),
      ...extractMergeFields(bodyHtml),
      ...extractMergeFields(bodyText),
    ].filter((v, i, a) => a.indexOf(v) === i)

    const requiredFields = reqFields.split(',').map((s) => s.trim()).filter(Boolean)

    const fallbackValues: Record<string, string> = {}
    for (const line of fallbacksRaw.split('\n')) {
      const idx = line.indexOf('=')
      if (idx > 0) {
        const k = line.slice(0, idx).trim()
        const v = line.slice(idx + 1).trim()
        if (k) fallbackValues[k] = v
      }
    }
    // Fill in defaults from APPROVED_MERGE_FIELDS for any missing fields
    for (const f of personalizationFields) {
      if (!(f in fallbackValues) && f in APPROVED_MERGE_FIELDS) {
        fallbackValues[f] = APPROVED_MERGE_FIELDS[f].fallback
      }
    }

    return {
      assetName,
      campaignType,
      subjectTemplate:       subject,
      bodyTemplateHtml:      bodyHtml,
      bodyTemplateText:      bodyText,
      personalizationFields,
      requiredFields,
      fallbackValues,
    }
  }

  function handleSave() {
    const content = buildContent()
    const validation = validateAssetTemplate(content)
    if (!validation.valid) {
      setValidationErrors(validation.errors)
      return
    }
    setValidationErrors([])
    setServerError(null)

    startTransition(async () => {
      try {
        if (assetId) {
          await updateAssetContentAction(workspaceSlug, assetId, content)
          router.refresh()
        } else {
          const result = await createHumanAssetAction(workspaceSlug, content)
          router.push(`/${workspaceSlug}/settings/campaign-assets/${result.assetId}`)
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{assetId ? 'Edit Asset' : 'New Campaign Asset'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(validationErrors.length > 0 || serverError) && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 space-y-1">
            {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
            {serverError && <p>{serverError}</p>}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Asset Name</span>
          <input
            type="text"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="e.g. Initial Contact — HVAC Q3"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Campaign Type</span>
          <select
            value={campaignType}
            onChange={(e) => setCampaignType(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            {CAMPAIGN_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Subject Template</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm font-mono"
            placeholder="{{first_name}}, quick question about {{company_name}}"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Body HTML</span>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={6}
            className="rounded border px-2 py-1.5 text-xs font-mono"
            placeholder="<p>Hi {{first_name}},</p>"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Body Text</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={4}
            className="rounded border px-2 py-1.5 text-xs font-mono"
            placeholder="Hi {{first_name}},"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Required Fields (comma-separated)</span>
          <input
            type="text"
            value={reqFields}
            onChange={(e) => setReqFields(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm font-mono"
            placeholder="first_name, company_name"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Fallback Values (one per line: field=value)</span>
          <textarea
            value={fallbacksRaw}
            onChange={(e) => setFallbacksRaw(e.target.value)}
            rows={4}
            className="rounded border px-2 py-1.5 text-xs font-mono"
            placeholder="sender_name=The Verian Team&#10;cta_text=Learn More"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={pending}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : assetId ? 'Save Changes' : 'Create Asset'}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
