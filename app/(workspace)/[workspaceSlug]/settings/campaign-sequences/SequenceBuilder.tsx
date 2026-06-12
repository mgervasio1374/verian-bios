'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createManualSequenceAction, updateManualSequenceAction } from '@/modules/campaign-sequence/actions/sequence-authoring.actions'
import { looksLikeAiPrompt } from '@/modules/campaign-sequence/prompt-leak-guard'
import type { CampaignTypeRow } from '@/modules/campaign-sequence/types'
import type { Database } from '@/types/database'

type SenderIdentityRow   = Database['public']['Tables']['sender_identities']['Row']
type CampaignEmailAsset  = Database['public']['Tables']['campaign_email_assets']['Row']

interface StepState {
  id?:                    string // set for existing steps in edit mode
  day_offset:             number | ''
  campaignEmailAssetId:   string
}

// V1 edit mode: pre-fills the builder from an existing sequence. Step removal
// is only offered when the sequence has never been used (allowStepRemoval).
export interface SequenceEditState {
  sequenceId:       string
  name:             string
  senderIdentityId: string | null
  steps:            { id: string; day_offset: number; campaignEmailAssetId: string }[]
  allowStepRemoval: boolean
}

interface Props {
  workspaceSlug:    string
  campaignTypes:    CampaignTypeRow[]
  senderIdentities: SenderIdentityRow[]
  assets:           CampaignEmailAsset[]
  edit?:            SequenceEditState
  onDone?:          () => void
}

const emptyStep = (): StepState => ({ day_offset: 0, campaignEmailAssetId: '' })

export function SequenceBuilder({ campaignTypes, senderIdentities, assets, edit, onDone }: Props) {
  const [pending, startTransition] = useTransition()

  const [name,             setName]             = useState(edit?.name ?? '')
  const [campaignTypeId,   setCampaignTypeId]   = useState('')
  const [senderIdentityId, setSenderIdentityId] = useState(edit?.senderIdentityId ?? '')
  const [steps,            setSteps]            = useState<StepState[]>(
    edit ? edit.steps.map(s => ({ ...s })) : [emptyStep()],
  )
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [serverError,      setServerError]      = useState<string | null>(null)
  const [successId,        setSuccessId]        = useState<string | null>(null)

  // Prompt-leak heuristic (warning only, never blocks): manual mode sends
  // asset content literally, so a prompt-shaped body would leak verbatim.
  function assetPromptWarning(assetId: string): boolean {
    if (!assetId) return false
    const asset = assets.find(a => a.id === assetId)
    if (!asset) return false
    return looksLikeAiPrompt(asset.body_template_text ?? asset.body_template_html ?? '')
  }

  const selectedTypeSlug = campaignTypes.find(t => t.id === campaignTypeId)?.slug ?? null
  const filteredAssets   = assets.filter(a => !selectedTypeSlug || a.campaign_type === selectedTypeSlug)

  function updateStep(idx: number, patch: Partial<StepState>) {
    setSteps(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function addStep() {
    if (steps.length >= 5) return
    setSteps(prev => [...prev, emptyStep()])
  }

  function removeStep(idx: number) {
    if (steps.length <= 1) return
    // In edit mode, existing steps are only removable for never-used sequences;
    // unsaved (new) steps can always be removed client-side.
    const step = steps[idx]
    if (edit && step.id && !edit.allowStepRemoval) return
    setSteps(prev => prev.filter((_, i) => i !== idx))
  }

  function canRemoveStep(step: StepState): boolean {
    if (steps.length <= 1) return false
    if (!edit) return true
    return !step.id || edit.allowStepRemoval
  }

  function handleSave() {
    setValidationErrors([])
    setServerError(null)
    setSuccessId(null)

    startTransition(async () => {
      try {
        if (edit) {
          const result = await updateManualSequenceAction(edit.sequenceId, {
            name,
            senderIdentityId: senderIdentityId || null,
            steps: steps.map((s, i) => ({
              id:                   s.id,
              step_number:          i + 1,
              day_offset:           typeof s.day_offset === 'number' ? s.day_offset : 0,
              campaignEmailAssetId: s.campaignEmailAssetId,
            })),
          })

          if (!result.ok) {
            if (result.errors?.length) {
              setValidationErrors(result.errors)
            } else {
              setServerError(result.error ?? 'Failed to update sequence.')
            }
            return
          }

          onDone?.()
          return
        }

        const result = await createManualSequenceAction({
          name,
          campaignTypeId,
          senderIdentityId: senderIdentityId || null,
          steps: steps.map((s, i) => ({
            step_number:          i + 1,
            day_offset:           typeof s.day_offset === 'number' ? s.day_offset : 0,
            campaignEmailAssetId: s.campaignEmailAssetId,
            is_recurring:         false,
          })),
        })

        if (!result.ok) {
          if (result.errors?.length) {
            setValidationErrors(result.errors)
          } else {
            setServerError(result.error ?? 'Failed to create sequence.')
          }
          return
        }

        setSuccessId(result.sequenceId ?? null)
        setName('')
        setCampaignTypeId('')
        setSenderIdentityId('')
        setSteps([emptyStep()])
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{edit ? 'Edit Sequence' : 'Create New Manual Sequence'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {successId && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            Sequence created successfully. ID: {successId}
          </div>
        )}

        {(validationErrors.length > 0 || serverError) && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 space-y-1">
            {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
            {serverError && <p>{serverError}</p>}
          </div>
        )}

        {/* Sequence Name */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Sequence Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="e.g. Initial Outreach — 5 Touch"
          />
        </label>

        {/* Campaign Type — fixed once created; hidden in edit mode */}
        {!edit && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Campaign Type</span>
            <select
              value={campaignTypeId}
              onChange={e => setCampaignTypeId(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Select campaign type…</option>
              {campaignTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Sender Identity */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Sender Identity</span>
          <select
            value={senderIdentityId}
            onChange={e => setSenderIdentityId(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Workspace default</option>
            {senderIdentities.map(s => (
              <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
            ))}
          </select>
        </label>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Steps ({steps.length}/5)</span>
            {steps.length < 5 && (
              <button
                type="button"
                onClick={addStep}
                className="text-xs text-primary hover:underline"
              >
                + Add Step
              </button>
            )}
          </div>

          {steps.map((step, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[auto_1fr_2fr_auto] gap-3 items-start rounded border p-3 bg-muted/20"
            >
              <div className="pt-2 text-sm font-medium text-muted-foreground">
                {idx + 1}
              </div>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Day Offset</span>
                <input
                  type="number"
                  min={0}
                  value={step.day_offset}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value, 10)
                    updateStep(idx, { day_offset: val === '' ? '' : (isNaN(val as number) ? '' : val as number) })
                  }}
                  className="rounded border px-2 py-1 text-sm w-full"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Email Asset</span>
                <select
                  value={step.campaignEmailAssetId}
                  onChange={e => updateStep(idx, { campaignEmailAssetId: e.target.value })}
                  className="rounded border px-2 py-1 text-sm w-full"
                >
                  <option value="">Select asset…</option>
                  {filteredAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.asset_name}</option>
                  ))}
                </select>
                {assetPromptWarning(step.campaignEmailAssetId) && (
                  <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    This asset looks like an AI prompt, not finished email copy — it will be sent literally.
                  </span>
                )}
              </label>

              {canRemoveStep(step) && (
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="mt-5 text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={pending}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : edit ? 'Save Changes' : 'Create Sequence'}
          </button>
          {edit && (
            <button
              type="button"
              onClick={() => onDone?.()}
              disabled={pending}
              className="rounded border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
