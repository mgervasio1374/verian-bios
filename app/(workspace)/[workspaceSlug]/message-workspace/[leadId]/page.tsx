import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as strategySvc from '@/modules/messaging/strategy/message-strategy.service'
import * as copySvc from '@/modules/messaging/copywriting/copywriting-agent.service'
import * as qraSvc from '@/modules/messaging/quality-review/quality-review-agent.service'
import * as sendBridgeSvc from '@/modules/messaging/send-bridge/send-bridge.service'
import * as emailSendRepo from '@/modules/messaging/repositories/email-send.repo'
import { StrategyReviewPanel } from './StrategyReviewPanel'
import { GeneratedVersionsPanel } from './GeneratedVersionsPanel'
import { DraftSourceBadge } from '@/components/messaging/DraftSourceBadge'

interface PageProps {
  params: Promise<{ workspaceSlug: string; leadId: string }>
}

export default async function MessageWorkspacePage({ params }: PageProps) {
  const { workspaceSlug, leadId } = await params
  const supabase  = await createSupabaseServerClient()
  const ctx       = await buildRequestContext(supabase)

  // Load lead — only columns that exist in the leads table
  const { data: lead } = await supabase
    .from('leads')
    .select('id, stage, source, company_id, contact_id, created_at')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()

  if (!lead) notFound()

  const { data: contact } = lead.contact_id
    ? await supabase.from('contacts').select('first_name, last_name, email').eq('id', lead.contact_id).maybeSingle()
    : { data: null }

  const { data: company } = lead.company_id
    ? await supabase.from('companies').select('id, name, industry, website').eq('id', lead.company_id).maybeSingle()
    : { data: null }

  // Statement status — check artifacts linked to this lead
  const { data: artifacts } = await supabase
    .from('artifacts')
    .select('id, artifact_type, created_at')
    .eq('lead_id', leadId)
    .eq('tenant_id', ctx.tenantId)
    .limit(5)

  const hasStatement = (artifacts ?? []).some(a =>
    (a.artifact_type ?? '').toLowerCase().includes('statement') ||
    (a.artifact_type ?? '').toLowerCase().includes('processing')
  )

  // Load active strategy and history
  const strategies = await strategySvc.listStrategiesForLead(leadId, ctx.tenantId).catch(() => [])

  const activeStrategy = strategies.find(s =>
    s.status === 'draft' || s.status === 'approved' || s.status === 'in_use'
  ) ?? null
  const historyStrategies = strategies.filter(s => s.status === 'superseded' || s.status === 'error')

  // Load message versions and generation gate check
  const messageVersions = activeStrategy
    ? await copySvc.listMessageVersionsForStrategy(activeStrategy.id, ctx.tenantId).catch(() => [])
    : []

  const generateGate = activeStrategy
    ? await copySvc.canGenerateMessageVersions(activeStrategy.id, ctx.tenantId).catch(() => ({ allowed: false, reason: 'Error checking generation status.' }))
    : { allowed: false, reason: 'No active strategy — generate a strategy first.' }

  const qualityReviews = activeStrategy
    ? await qraSvc.listQualityReviewsForStrategy(activeStrategy.id, ctx.tenantId).catch(() => [])
    : []

  // Load draft status for all approved versions (Send Bridge UI)
  const draftStatusByVersionId = new Map<string, { draftId: string; status: string }>()
  const approvedVersions = messageVersions.filter(v => v.approvalStatus === 'approved')
  if (approvedVersions.length > 0) {
    for (const version of approvedVersions) {
      const draftStatus = await sendBridgeSvc.getDraftStatusForVersion(version.id, ctx.tenantId).catch(() => null)
      if (draftStatus) {
        draftStatusByVersionId.set(version.id, draftStatus)
      }
    }
  }

  // Load send delivery status for sent draft versions (Event Tracking UI)
  const sendStatusByDraftId = new Map<string, { sendId: string; sendStatus: string }>()
  for (const [, draftStatus] of draftStatusByVersionId) {
    if (draftStatus.status === 'sent') {
      const sendStatus = await emailSendRepo.getSendStatusForDraft(draftStatus.draftId, ctx.tenantId)
        .catch(() => null)
      if (sendStatus) {
        sendStatusByDraftId.set(draftStatus.draftId, sendStatus)
      }
    }
  }

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
    : null
  const companyName = company?.name ?? null

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Message Workspace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contactName ?? 'Unknown contact'}{companyName ? ` · ${companyName}` : ''}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Lead: {leadId.slice(0, 8)}…
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-6">
        {/* Left: Lead context */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead Context</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Contact</p>
                <p className="font-medium">{contactName ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Company</p>
                <p className="font-medium">{companyName ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium">{lead.source ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Stage</p>
                <p className="font-medium">{lead.stage ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Industry</p>
                <p className="font-medium">{company?.industry ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Statement</p>
                <p className={`font-medium ${hasStatement ? 'text-green-700' : 'text-muted-foreground'}`}>
                  {hasStatement ? 'On file' : 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Generated versions panel */}
          <GeneratedVersionsPanel
            versions={messageVersions}
            strategyId={activeStrategy?.id ?? null}
            leadId={leadId}
            workspaceSlug={workspaceSlug}
            canGenerate={generateGate.allowed}
            blockedReason={generateGate.allowed ? null : (generateGate.reason ?? null)}
            qualityReviews={qualityReviews}
            draftStatusByVersionId={draftStatusByVersionId}
            sendStatusByDraftId={sendStatusByDraftId}
            contactName={contactName}
            contactEmail={contact?.email ?? null}
          />

          {/* Draft source badges for approved version drafts */}
          {approvedVersions.length > 0 && (
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft Sources</p>
              <div className="space-y-1">
                {approvedVersions.map((v) => {
                  const ds = draftStatusByVersionId.get(v.id)
                  if (!ds) return null
                  return (
                    <div key={v.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{v.versionLabel ?? v.id.slice(0, 8)}</span>
                      <DraftSourceBadge sourceType="ai_strategy_copywriting" workspaceSlug={workspaceSlug} />
                      <span className="capitalize">{ds.status}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* History */}
          {historyStrategies.length > 0 && (
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Strategy History ({historyStrategies.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {historyStrategies.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{s.message_type.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Strategy panel */}
        <StrategyReviewPanel
          strategy={activeStrategy}
          leadId={leadId}
          workspaceSlug={workspaceSlug}
          leadInput={{
            lead_id:         leadId,
            contact_name:    contactName,
            company_name:    companyName,
            lead_source:     lead.source,
            lead_stage:      lead.stage,
            lead_score:      null,
            industry_segment:company?.industry ?? null,
            opted_out:       false,
          }}
          statementInput={{ has_statement_artifact: hasStatement }}
          partnerInput={{ partner_membership_confirmed: false }}
          proposalInput={{ proposal_sent: false }}
          customerInput={{ is_existing_customer: false }}
        />
      </div>
    </div>
  )
}
