'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetTemplateContent } from '@/modules/messaging/campaign-assets/campaign-asset.types'
import { CAMPAIGN_TYPE, APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { validateAssetTemplate, extractMergeFields } from '@/modules/messaging/services/campaign-asset-validation.service'
import { textToHtmlBody } from '@/modules/messaging/campaign-assets/template-html'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createHumanAssetAction, updateAssetContentAction } from './actions'

interface Props {
  workspaceSlug: string
  assetId?:      string
  // DB-backed campaign types (seeded per workspace). When empty, the dropdown
  // falls back to the CAMPAIGN_TYPE constant so a fresh workspace still shows all 8.
  campaignTypes?: { slug: string; name: string }[]
  initial?: {
    assetName:     string
    campaignType:  string
  } & AssetTemplateContent
}

// Fallback options derived from the constant (the canonical 8 + backend source of truth).
const FALLBACK_CAMPAIGN_TYPE_OPTIONS = Object.entries(CAMPAIGN_TYPE).map(([, v]) => ({
  label: v.replace(/_/g, ' '),
  value: v,
}))

export function CampaignAssetEditor({ workspaceSlug, assetId, campaignTypes, initial }: Props) {
  const router      = useRouter()
  const [pending, startTransition] = useTransition()

  // Prefer DB types; fall back to the constant when none are seeded yet.
  const campaignTypeOptions = (campaignTypes && campaignTypes.length > 0)
    ? campaignTypes.map(t => ({ value: t.slug, label: t.name }))
    : FALLBACK_CAMPAIGN_TYPE_OPTIONS

  const [assetName,     setAssetName]     = useState(initial?.assetName ?? '')
  const [campaignType,  setCampaignType]  = useState(initial?.campaignType ?? CAMPAIGN_TYPE.INITIAL_CONTACT)
  const [subject,       setSubject]       = useState(initial?.subjectTemplate ?? '')
  const [bodyHtml,      setBodyHtml]      = useState(initial?.bodyTemplateHtml ?? '')
  const [bodyText,      setBodyText]      = useState(initial?.bodyTemplateText ?? '')
  // V3 plain-text-first: HTML is derived from the text body unless the
  // operator opens the advanced toggle and edits HTML directly. On edit,
  // stored HTML differing from derived-from-text opens the toggle so nothing
  // is silently overwritten.
  const [customHtml,    setCustomHtml]    = useState(() =>
    Boolean(
      initial &&
      initial.bodyTemplateHtml.trim() !== '' &&
      initial.bodyTemplateHtml !== textToHtmlBody(initial.bodyTemplateText)
    )
  )
  const [reqFields,     setReqFields]     = useState(initial?.requiredFields.join(', ') ?? '')
  const [fallbacksRaw,  setFallbacksRaw]  = useState(
    Object.entries(initial?.fallbackValues ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
  )
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [serverError,       setServerError]       = useState<string | null>(null)

  function buildContent(): AssetTemplateContent & { assetName: string; campaignType: string } {
    const effectiveHtml = customHtml ? bodyHtml : textToHtmlBody(bodyText)

    const personalizationFields = [
      ...extractMergeFields(subject),
      ...extractMergeFields(effectiveHtml),
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
      bodyTemplateHtml:      effectiveHtml,
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
          // #24: editing is done — return to the library so the operator sees
          // the saved asset in context (previously a refresh-in-place left them
          // on the form with no confirmation of where they were).
          router.push(`/${workspaceSlug}/settings/campaign-assets`)
        } else {
          const result = await createHumanAssetAction(workspaceSlug, content)
          router.push(`/${workspaceSlug}/settings/campaign-assets/${result.assetId}`)
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  function handleCancel() {
    // Discard edits and return to the library without saving.
    router.push(`/${workspaceSlug}/settings/campaign-assets`)
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
            {campaignTypeOptions.map((o) => (
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
          <span className="font-medium">Email body</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={8}
            className="rounded border px-2 py-1.5 text-xs font-mono"
            placeholder={'Hi {{first_name}},\n\nWrite the email here — blank lines start new paragraphs.'}
          />
          {!customHtml && (
            <span className="text-muted-foreground">
              HTML is generated automatically from this text on save.
            </span>
          )}
        </label>

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={customHtml}
              onChange={(e) => {
                const next = e.target.checked
                setCustomHtml(next)
                // Seed the HTML field from the text body when opening the toggle
                if (next && !bodyHtml.trim()) setBodyHtml(textToHtmlBody(bodyText))
              }}
            />
            <span className="font-medium">Advanced: custom HTML</span>
          </label>

          {customHtml && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">Body HTML</span>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={6}
                className="rounded border px-2 py-1.5 text-xs font-mono"
                placeholder="<p>Hi {{first_name}},</p>"
              />
              <span className="text-muted-foreground">
                Your HTML is saved as-is — it is not derived from the text body.
              </span>
            </label>
          )}
        </div>

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
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="rounded border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
