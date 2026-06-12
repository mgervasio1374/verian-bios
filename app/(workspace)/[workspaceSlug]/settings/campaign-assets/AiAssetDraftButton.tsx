'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generateAiDraftAction } from './actions'

const CAMPAIGN_TYPE_OPTIONS = Object.entries(CAMPAIGN_TYPE).map(([, v]) => ({
  label: v.replace(/_/g, ' '),
  value: v,
}))

interface Props {
  workspaceSlug: string
}

export function AiAssetDraftButton({ workspaceSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [campaignType, setCampaignType] = useState<string>(CAMPAIGN_TYPE.INITIAL_CONTACT)
  const [promptBrief,  setPromptBrief]  = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [warning,      setWarning]      = useState<string | null>(null)

  function handleGenerate() {
    if (!promptBrief.trim()) {
      setError('Please enter a prompt brief describing the asset.')
      return
    }
    setError(null)
    setWarning(null)

    startTransition(async () => {
      const result = await generateAiDraftAction(workspaceSlug, { campaignType, promptBrief })

      if (result.blocked) {
        const reason = result.blockReason ?? ''
        const message =
          reason === 'llm_not_configured'
            ? "AI drafting isn't configured. Set LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL_NAME."
            : reason === 'llm_bad_output'
              ? 'The model returned unusable output. Try rephrasing the brief.'
              : reason.startsWith('llm_error')
                ? `AI request failed — ${reason.replace(/^llm_error:\s*/, '')}`
                : result.error ?? 'AI generation blocked.'
        setError(message)
        return
      }

      if (result.preflightWarning) {
        setWarning('Budget approaching limit. Draft created.')
      }

      if (result.assetId) {
        router.push(`/${workspaceSlug}/settings/campaign-assets/${result.assetId}`)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Generate AI Draft</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}
        {warning && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            {warning}
          </div>
        )}

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
          <span className="font-medium">Prompt Brief</span>
          <textarea
            value={promptBrief}
            onChange={(e) => setPromptBrief(e.target.value)}
            rows={3}
            className="rounded border px-2 py-1.5 text-xs"
            placeholder="Describe the tone, key message, and target audience for this asset…"
          />
          <span className="text-muted-foreground">
            Describe the email: audience, offer, tone, call to action.
          </span>
        </label>

        <button
          onClick={handleGenerate}
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Generating…' : 'Generate with AI'}
        </button>

        <p className="text-xs text-muted-foreground">
          AI-generated drafts start as <strong>Draft</strong> and require human review before activation.
        </p>
      </CardContent>
    </Card>
  )
}
