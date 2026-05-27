import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import * as scoreRepo from '@/modules/intelligence/repositories/score.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailQualityRepo from '@/modules/messaging/repositories/email-quality.repo'
import * as emailDraftVersionRepo from '@/modules/messaging/repositories/email-draft-version.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SendEmailButton } from '@/components/messaging/SendEmailButton'
import { ArrowRight } from 'lucide-react'
import { EmailQualityCard } from './EmailQualityCard'
import { ScoreLeadButton } from './ScoreLeadButton'
import { ManualCampaignDraftButton } from './ManualCampaignDraftButton'
import { RewriteVersionPanel } from './RewriteVersionPanel'
import { WorkflowToggle } from './WorkflowToggle'

interface PageProps {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { workspaceSlug, id } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const lead = await leadService.getLead(ctx, id).catch(() => null)
  if (!lead) notFound()

  const [fitScore, urgencyScore, recommendations, emailDrafts] = await Promise.all([
    scoreRepo.getCurrentFitScore(ctx.tenantId, 'lead', id),
    scoreRepo.getCurrentUrgencyScore(ctx.tenantId, 'lead', id),
    recommendationRepo.getLeadRecommendations(ctx.tenantId, id),
    emailDraftRepo.getLeadEmailDrafts(ctx.tenantId, id),
  ])

  const recommendation  = recommendations[0] ?? null
  const latestDraft     = emailDrafts[0] ?? null
  // An "active" draft is one that still needs human action (not terminal)
  const hasActiveDraft  = ['draft', 'pending_approval', 'approved'].includes(latestDraft?.status ?? '')

  // Load quality review, best version, and full version list for the latest draft
  const qualityReview = latestDraft
    ? await emailQualityRepo.getEmailQualityReview(latestDraft.id, ctx.tenantId).catch(() => null)
    : null

  const [bestVersion, allVersions] = latestDraft
    ? await Promise.all([
        qualityReview?.best_version_id
          ? emailDraftVersionRepo.getBestEmailDraftVersion(latestDraft.id, ctx.tenantId).catch(() => null)
          : Promise.resolve(null),
        emailDraftVersionRepo.listEmailDraftVersions(latestDraft.id, ctx.tenantId).catch(() => []),
      ])
    : [null, []]

  // Resolve a review link for pending drafts. Only fetches if needed.
  const pendingApproval =
    latestDraft?.status === 'pending_approval' && latestDraft.approval_request_id
      ? await approvalRepo.getApprovalById(latestDraft.approval_request_id, ctx.tenantId).catch(() => null)
      : null

  const reviewToken =
    pendingApproval && typeof (pendingApproval.payload as Record<string, unknown>)?.review_token === 'string'
      ? (pendingApproval.payload as Record<string, unknown>).review_token as string
      : null

  const suggestedScore = qualityReview?.suggested_overall_score != null
    ? Math.round(Number(qualityReview.suggested_overall_score))
    : null
  const originalQualityScore = qualityReview?.overall_score != null
    ? Math.round(Number(qualityReview.overall_score))
    : null

  return (
    <div className="space-y-6">

      {/* ---- Narrow upper section ---- */}
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground capitalize">{lead.stage.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground">·</span>
            <PriorityBadge priority={lead.priority} />
            <span className="text-muted-foreground">·</span>
            <Badge variant={lead.status === 'open' ? 'default' : 'secondary'}>{lead.status}</Badge>
          </div>
          <div className="mt-2">
            <WorkflowToggle
              leadId={id}
              initialEnabled={lead.workflow_enabled ?? false}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Lead Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.estimated_value && (
                <Row label="Estimated Value" value={`$${Number(lead.estimated_value).toLocaleString()}`} />
              )}
              {lead.expected_close_date && (
                <Row label="Expected Close" value={new Date(lead.expected_close_date).toLocaleDateString()} />
              )}
              {lead.source && <Row label="Source" value={lead.source} />}
              <Row label="Created" value={new Date(lead.created_at).toLocaleDateString()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Scores</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {fitScore ? (
                <ScoreBar
                  label="Fit Score"
                  score={fitScore.score}
                  confidence={fitScore.confidence ?? undefined}
                  reasoning={fitScore.reasoning ?? undefined}
                  dimensions={fitScore.dimensions as unknown as Record<string, unknown>}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Fit score pending.</p>
              )}
              {urgencyScore ? (
                <ScoreBar
                  label="Urgency Score"
                  score={urgencyScore.score}
                  confidence={urgencyScore.confidence ?? undefined}
                  reasoning={urgencyScore.reasoning ?? undefined}
                  dimensions={urgencyScore.dimensions as unknown as Record<string, unknown>}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Urgency score pending.</p>
              )}
              <div className="border-t pt-3">
                <ScoreLeadButton leadId={id} hasScores={!!(fitScore && urgencyScore)} />
              </div>
            </CardContent>
          </Card>
        </div>

        {recommendation && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recommended Action</CardTitle>
                <PriorityBadge priority={recommendation.priority} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-sm">{recommendation.title}</p>
              <p className="text-sm text-muted-foreground">{recommendation.body}</p>
              {(() => {
                const r = recommendation.raw_output
                const text = r && typeof r === 'object'
                  ? (r as Record<string, unknown>).reasoning
                  : undefined
                return typeof text === 'string' && text ? (
                  <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                    Reasoning: {text}
                  </p>
                ) : null
              })()}
            </CardContent>
          </Card>
        )}

        {!recommendation && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Recommended Action</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Recommendation will appear after scoring completes.</p>
            </CardContent>
          </Card>
        )}

        {/* Generate Outreach Draft — only when no active draft */}
        {!hasActiveDraft && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Generate Outreach Draft</CardTitle></CardHeader>
            <CardContent>
              <ManualCampaignDraftButton
                leadId={id}
                hasExistingDraft={hasActiveDraft}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Email review workspace — two-column on xl ---- */}
      {latestDraft && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] items-start">

          {/* Left: current draft + quality */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Email Draft</CardTitle>
                  <DraftStatusBadge status={latestDraft.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">To</p>
                  <p>{latestDraft.to_name ? `${latestDraft.to_name} <${latestDraft.to_email}>` : latestDraft.to_email}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject</p>
                  <p className="font-medium">{latestDraft.subject}</p>
                </div>
                {latestDraft.body_text && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Body</p>
                    <pre className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {latestDraft.body_text}
                    </pre>
                  </div>
                )}
                {latestDraft.status === 'approved' && (
                  <div className="pt-1">
                    <SendEmailButton
                      draftId={latestDraft.id}
                      toEmail={latestDraft.to_email}
                    />
                  </div>
                )}
                {latestDraft.status === 'sent' && latestDraft.sent_at && (
                  <p className="text-xs text-blue-700 border border-blue-200 bg-blue-50 rounded px-2 py-1">
                    Sent {new Date(latestDraft.sent_at).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Email quality */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Email Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <EmailQualityCard
                  emailDraftId={latestDraft.id}
                  initialReview={qualityReview}
                  bestVersion={bestVersion ? {
                    subject:       bestVersion.subject,
                    bodyText:      bestVersion.body_text,
                    versionNumber: bestVersion.version_number,
                    score:         Number(bestVersion.quality_score ?? 0),
                  } : null}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: rewrite versions panel */}
          <div className="xl:sticky xl:top-6">
            <RewriteVersionPanel
              emailDraftId={latestDraft.id}
              draftStatus={latestDraft.status}
              versions={allVersions}
              bestVersionId={qualityReview?.best_version_id ?? null}
              originalScore={originalQualityScore}
              suggestedScore={suggestedScore}
              reviewToken={reviewToken}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function DraftStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending_approval: { label: 'Pending Review',  className: 'bg-amber-100 text-amber-800' },
    approved:         { label: 'Approved',         className: 'bg-green-100 text-green-800' },
    draft:            { label: 'Draft',            className: 'bg-gray-100 text-gray-600'  },
    sent:             { label: 'Sent',             className: 'bg-blue-100 text-blue-800'  },
    cancelled:        { label: 'Cancelled',        className: 'bg-red-100 text-red-700'    },
  }
  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${className}`}>
      {label}
    </span>
  )
}

function ScoreBar({
  label,
  score,
  confidence,
  reasoning,
  dimensions,
}: {
  label: string
  score: number
  confidence?: number
  reasoning?: string
  dimensions?: Record<string, unknown>
}) {
  const pct = Math.round(score)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {pct}/100
          {confidence !== undefined && (
            <span className="text-muted-foreground ml-1 text-xs">({Math.round(confidence * 100)}% conf)</span>
          )}
        </span>
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {dimensions && (
        <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground pt-1">
          {Object.entries(dimensions).map(([k, v]) => (
            <span key={k}>{k.replace(/_/g, ' ')}: {String(v)}</span>
          ))}
        </div>
      )}
      {reasoning && (
        <p className="text-xs text-muted-foreground pt-0.5">{reasoning}</p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${colors[priority] ?? colors.medium}`}>
      {priority}
    </span>
  )
}
