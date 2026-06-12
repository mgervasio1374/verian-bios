'use client'

// W3: progressive disclosure for the two authoring forms — exactly one of
// the AI card / manual builder is open at a time, both closed by default.
// Edit mode is NOT routed through here: SequenceList renders its own
// SequenceBuilder instance with the edit prop.

import { useState } from 'react'
import { GenerateAiSequenceCard } from './GenerateAiSequenceCard'
import { SequenceBuilder } from './SequenceBuilder'
import type { CampaignTypeRow } from '@/modules/campaign-sequence/types'
import type { Database } from '@/types/database'

type SenderIdentityRow  = Database['public']['Tables']['sender_identities']['Row']
type CampaignEmailAsset = Database['public']['Tables']['campaign_email_assets']['Row']

interface Props {
  workspaceSlug:    string
  campaignTypes:    CampaignTypeRow[]
  senderIdentities: SenderIdentityRow[]
  assets:           CampaignEmailAsset[]
}

export function AuthoringPanels({ workspaceSlug, campaignTypes, senderIdentities, assets }: Props) {
  const [open, setOpen] = useState<'ai' | 'manual' | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(open === 'ai' ? null : 'ai')}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          Generate sequence with AI
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === 'manual' ? null : 'manual')}
          className="rounded border px-4 py-2 text-sm hover:bg-accent/40"
        >
          Build manually
        </button>
      </div>

      {open === 'ai' && (
        <GenerateAiSequenceCard
          campaignTypes={campaignTypes}
          senderIdentities={senderIdentities}
        />
      )}

      {open === 'manual' && (
        <SequenceBuilder
          workspaceSlug={workspaceSlug}
          campaignTypes={campaignTypes}
          senderIdentities={senderIdentities}
          assets={assets}
        />
      )}
    </div>
  )
}
