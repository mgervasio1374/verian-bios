import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { CampaignAssetList } from './CampaignAssetList'
import { AiAssetDraftButton } from './AiAssetDraftButton'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function CampaignAssetsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  const assets   = await assetRepo.listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaign Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage reusable email templates for campaign automation.
          </p>
        </div>
        <Link
          href={`/${workspaceSlug}/settings/campaign-assets/new`}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          New Asset
        </Link>
      </div>

      {/* Campaign terminology reference */}
      <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign Terminology</p>
        <div className="grid gap-2 sm:grid-cols-2 text-xs text-foreground">
          <div>
            <span className="font-semibold">Campaign Type</span>
            <span className="text-muted-foreground"> — A named sequence template (e.g. "Initial Contact"). Defines the intent, number of touchpoints, and send cadence.</span>
          </div>
          <div>
            <span className="font-semibold">Campaign Asset</span>
            <span className="text-muted-foreground"> — A specific email template (subject + body) for one step in a sequence. Reusable across multiple campaign types.</span>
          </div>
          <div>
            <span className="font-semibold">Campaign Sequence</span>
            <span className="text-muted-foreground"> — The ordered steps within a Campaign Type. Each step references an asset and has a send timing (Day 0, Day 3, etc.).</span>
          </div>
          <div>
            <span className="font-semibold">Campaign Assignment</span>
            <span className="text-muted-foreground"> — Assigning a Campaign Type to a specific lead or contact. Creates the scheduled send plan for that recipient.</span>
          </div>
          <div>
            <span className="font-semibold">Email Draft</span>
            <span className="text-muted-foreground"> — A generated email for a recipient at a specific step, created from an asset template. Requires approval before sending.</span>
          </div>
          <div>
            <span className="font-semibold">Approval Request</span>
            <span className="text-muted-foreground"> — A record requesting operator review of one or more Email Drafts before they are sent.</span>
          </div>
          <div>
            <span className="font-semibold">Send Event</span>
            <span className="text-muted-foreground"> — A logged record of an email being sent: recipient, timestamp, campaign step, asset used, and outcome.</span>
          </div>
        </div>
      </div>

      {/* Campaign Sequence Planning */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign Sequence Planning</p>
          <p className="text-xs text-muted-foreground mt-1">
            Configuration foundation — defines how outreach sequences are structured. Sending remains disabled pending the 25-email test protocol.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Sequence model */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Sequence Model</p>
            <div className="space-y-1.5 text-xs">
              {[
                ['Campaign Type',          'Named sequence template (e.g. "Initial Contact"). Defines intent and cadence.'],
                ['Sequence Name',          'Label for the ordered touch plan within a Campaign Type.'],
                ['Number of Touches',      'Total planned outreach steps before stopping.'],
                ['Day Offsets',            'Days after campaign start for each touch (configurable per type).'],
                ['Stop Condition',         'Customer replies or responds — outreach halts immediately.'],
                ['System Response Trigger','Status transition or operator alert after customer reply.'],
                ['Approval Required',      'All drafts require operator approval before any send.'],
              ].map(([term, desc]) => (
                <div key={term}>
                  <span className="font-semibold text-foreground">{term}</span>
                  <span className="text-muted-foreground"> — {desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Default cadence */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Default Cadence <span className="font-normal text-muted-foreground">(configurable per Campaign Type)</span></p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-3 font-medium text-muted-foreground">Touch</th>
                  <th className="text-left py-1 font-medium text-muted-foreground">Day Offset</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Touch 1', 'Day 1'],
                  ['Touch 2', 'Day 3'],
                  ['Touch 3', 'Day 7'],
                  ['Touch 4', 'Day 14'],
                  ['Touch 5', 'Day 31'],
                  ['Touch 6', 'Day 91'],
                  ['Touch 7+', 'Every 90 days until response'],
                ].map(([touch, offset]) => (
                  <tr key={touch} className="border-b last:border-0">
                    <td className="py-1 pr-3 text-foreground">{touch}</td>
                    <td className="py-1 text-muted-foreground">{offset}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground pt-1">
              Outreach continues until the customer responds. Response triggers a stop condition and status transition.
            </p>
          </div>
        </div>
      </div>

      <CampaignAssetList assets={assets} workspaceSlug={workspaceSlug} />

      <AiAssetDraftButton workspaceSlug={workspaceSlug} />
    </div>
  )
}
