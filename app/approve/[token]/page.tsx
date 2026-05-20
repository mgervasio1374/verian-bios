import { getReviewPageData } from './actions'
import { ReviewForm } from './ReviewForm'
import { AlertTriangle, CheckCircle2, XCircle, FileText, ExternalLink, Lightbulb } from 'lucide-react'
import * as emailQualityRepo from '@/modules/messaging/repositories/email-quality.repo'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function ApprovalReviewPage({ params }: PageProps) {
  const { token } = await params
  const result = await getReviewPageData(token)

  if (!result.success) {
    return <ErrorState message={result.error} />
  }

  const data = result.data

  // Load quality review if we have a draft ID
  const qualityReview = data.draftId && data.tenantId
    ? await emailQualityRepo.getEmailQualityReview(data.draftId, data.tenantId).catch(() => null)
    : null

  if (data.status === 'approved') {
    return (
      <StatusState
        icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
        title="Already Approved"
        message="This proposal has been approved and the customer email has been sent."
      />
    )
  }

  if (data.status === 'rejected') {
    return (
      <StatusState
        icon={<XCircle className="h-12 w-12 text-destructive" />}
        title="Already Rejected"
        message="This proposal has been rejected."
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                321 Swipe · Proposal Review
              </p>
              <h1 className="text-xl font-bold">Review Merchant Proposal</h1>
              {data.leadName && (
                <p className="text-sm text-muted-foreground mt-0.5">{data.leadName}</p>
              )}
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium shrink-0">
              Awaiting Review
            </span>
          </div>

          {/* Prospect summary */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t pt-4">
            {data.companyName && (
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium">{data.companyName}</p>
              </div>
            )}
            {data.toEmail && (
              <div>
                <p className="text-xs text-muted-foreground">Recipient</p>
                <p className="font-medium">{data.toName ?? data.toEmail}</p>
                <p className="text-xs text-muted-foreground">{data.toEmail}</p>
              </div>
            )}
            {data.source && (
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="font-medium capitalize">{data.source.replace(/_/g, ' ')}</p>
              </div>
            )}
            {data.expiresAt && (
              <div>
                <p className="text-xs text-muted-foreground">Link expires</p>
                <p className="font-medium">
                  {new Date(data.expiresAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Analysis + Pricing Card */}
        {data.analysis && (
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Statement Analysis</h2>
              <ConfidenceBadge confidence={data.analysis.confidence} />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <AnalysisRow
                label="Current Processor"
                value={data.analysis.processor_name ?? 'Not yet identified'}
                dim={!data.analysis.processor_name}
              />
              <AnalysisRow label="Monthly Volume"  value="Pending review" dim />
              <AnalysisRow label="Total Fees"      value="Pending review" dim />
              <AnalysisRow label="Effective Rate"  value="Pending review" dim />
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Proposed 321 Swipe Pricing
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <AnalysisRow label="Model"          value="Interchange-Plus" />
                <AnalysisRow label="Processing Markup" value={`${data.analysis.proposed_basis_pts} bps (${(data.analysis.proposed_basis_pts / 100).toFixed(2)}%)`} />
                <AnalysisRow label="Per Transaction" value={`$${(data.analysis.proposed_per_txn / 100).toFixed(2)}`} />
                <AnalysisRow label="Monthly Fee"    value={`$${data.analysis.proposed_monthly_fee.toFixed(2)}`} />
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
              Savings estimate pending — will be confirmed after full statement review during the scheduled call.
            </div>
          </div>
        )}

        {/* PDF Proposal download */}
        {data.proposalPdfUrl && (
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Proposal Package PDF</p>
                <p className="text-xs text-muted-foreground">Click to open — attach this to the customer email</p>
              </div>
            </div>
            <a
              href={data.proposalPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              Open PDF
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Email Quality Review */}
        {qualityReview ? (
          <div className={`rounded-xl border shadow-sm p-5 space-y-3 ${
            qualityReview.status === 'blocked'        ? 'border-red-300 bg-red-50' :
            qualityReview.status === 'needs_revision' ? 'border-amber-200 bg-amber-50' :
            'border-green-200 bg-green-50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Email Quality Review</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${
                  qualityReview.status === 'blocked' ? 'text-red-700' :
                  qualityReview.status === 'needs_revision' ? 'text-amber-700' :
                  'text-green-700'
                }`}>{Math.round(qualityReview.overall_score)}/100</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  qualityReview.status === 'blocked'        ? 'bg-red-100 text-red-800' :
                  qualityReview.status === 'needs_revision' ? 'bg-amber-100 text-amber-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {qualityReview.status === 'pass' ? 'Pass' :
                   qualityReview.status === 'needs_revision' ? 'Needs Revision' :
                   'Rewrite Recommended'}
                </span>
              </div>
            </div>

            {qualityReview.status === 'blocked' && (
              <div className="flex items-start gap-2 text-sm text-red-800 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Verian recommends rewriting this email before sending. Review the weaknesses below.
              </div>
            )}

            {qualityReview.review_summary && (
              <p className="text-xs text-muted-foreground">{qualityReview.review_summary}</p>
            )}

            {((qualityReview.weaknesses as string[]).length > 0 || (qualityReview.risk_flags as string[]).length > 0) && (
              <div className="space-y-1.5">
                {(qualityReview.risk_flags as string[]).map((flag, i) => (
                  <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                    <span className="shrink-0">⚠</span>{flag}
                  </p>
                ))}
                {(qualityReview.weaknesses as string[]).slice(0, 4).map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <span className="shrink-0">·</span>{w}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border shadow-sm p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Lightbulb className="h-4 w-4 shrink-0" />
            Email quality review not available for this draft.
          </div>
        )}

        {/* Editable review form */}
        <ReviewForm
          token={token}
          initialSubject={data.subject}
          initialBodyText={data.bodyText}
          initialBodyHtml={data.bodyHtml ?? ''}
          hasPdf={!!data.proposalPdfUrl}
        />
      </div>
    </div>
  )
}

// ---- Sub-components ----

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const isPlaceholder = confidence === 'placeholder'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
      isPlaceholder
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700'
    }`}>
      {isPlaceholder ? 'Preliminary' : confidence}
    </span>
  )
}

function AnalysisRow({
  label,
  value,
  dim = false,
}: {
  label: string
  value: string
  dim?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium text-sm ${dim ? 'text-muted-foreground italic' : ''}`}>{value}</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3 bg-white rounded-xl border shadow-sm p-8">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h1 className="text-lg font-semibold">Link Unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          If you believe this is an error, contact your administrator.
        </p>
      </div>
    </div>
  )
}

function StatusState({
  icon, title, message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3 bg-white rounded-xl border shadow-sm p-8">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
