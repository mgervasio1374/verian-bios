'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Brain,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Shield,
  Star,
  BarChart2,
  Flag,
} from 'lucide-react'
import {
  generateMessageVersionsAction,
  selectMessageVersionAction,
  rejectMessageVersionAction,
} from '@/modules/messaging/actions/copywriting-agent.actions'
import { runQualityReviewAction } from '@/modules/messaging/actions/quality-review-agent.actions'
import type { MessageVersion } from '@/modules/messaging/copywriting/copywriting-agent.types'
import type { QualityReview } from '@/modules/messaging/quality-review/quality-review-agent.types'

// ---- Props ----

interface GeneratedVersionsPanelProps {
  versions:           MessageVersion[]
  strategyId:         string | null
  leadId:             string
  workspaceSlug:      string
  canGenerate:        boolean
  blockedReason:      string | null
  qualityReviews?:    QualityReview[]
  onRunQualityReview?:() => void
}

// ---- Quality score badge ----

function QualityScoreBadge({ score, band }: { score: number; band: string }) {
  const colorMap: Record<string, string> = {
    excellent:    'bg-green-100 text-green-800 border-green-200',
    strong:       'bg-blue-100 text-blue-800 border-blue-200',
    usable:       'bg-amber-100 text-amber-800 border-amber-200',
    needs_review: 'bg-orange-100 text-orange-800 border-orange-200',
    do_not_use:   'bg-red-100 text-red-800 border-red-200',
  }
  const cls = colorMap[band] ?? colorMap.needs_review
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <BarChart2 className="h-2.5 w-2.5" />
      {score} · {band.replace(/_/g, ' ')}
    </span>
  )
}

// ---- Recommended badge ----

function RecommendedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-green-50 border-green-300 px-2 py-0.5 text-[10px] font-semibold text-green-800">
      <Star className="h-2.5 w-2.5 fill-green-600 text-green-600" />
      Recommended
    </span>
  )
}

// ---- Quality review panel ----

function QualityReviewPanel({ review }: { review: QualityReview }) {
  const [showFlags,     setShowFlags]     = useState(false)
  const [showStrengths, setShowStrengths] = useState(false)
  const [showWeaknesses,setShowWeaknesses]= useState(false)

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-muted space-y-2">
      {/* Score + recommendation badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <QualityScoreBadge score={review.compositeScore} band={review.scoreBand} />
        {review.isRecommended && <RecommendedBadge />}
        <span className="text-[10px] text-muted-foreground">Rank #{review.rankPosition}</span>
      </div>

      {/* Human review notes */}
      {review.humanReviewNotes && (
        <p className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2">
          {review.humanReviewNotes}
        </p>
      )}

      {/* Risk flags (expandable) */}
      {review.riskFlags.length > 0 && (
        <div>
          <button
            onClick={() => setShowFlags(v => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Flag className="h-2.5 w-2.5" />
            {showFlags ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            {review.riskFlags.length} risk flag{review.riskFlags.length !== 1 ? 's' : ''}
          </button>
          {showFlags && (
            <ul className="mt-1 space-y-1 pl-2">
              {review.riskFlags.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px]">
                  <span className={`font-mono font-semibold ${f.severity === 'critical' ? 'text-red-700' : f.severity === 'high' ? 'text-orange-700' : f.severity === 'medium' ? 'text-amber-700' : 'text-muted-foreground'}`}>
                    {f.code}
                  </span>
                  <span className="text-muted-foreground">{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Strengths (collapsible) */}
      {review.strengths.length > 0 && (
        <div>
          <button
            onClick={() => setShowStrengths(v => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showStrengths ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            {review.strengths.length} strength{review.strengths.length !== 1 ? 's' : ''}
          </button>
          {showStrengths && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {review.strengths.map((s, i) => (
                <li key={i} className="text-[10px] text-green-700">+ {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Weaknesses (collapsible) */}
      {review.weaknesses.length > 0 && (
        <div>
          <button
            onClick={() => setShowWeaknesses(v => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showWeaknesses ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            {review.weaknesses.length} weakness{review.weaknesses.length !== 1 ? 'es' : ''}
          </button>
          {showWeaknesses && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {review.weaknesses.map((w, i) => (
                <li key={i} className="text-[10px] text-amber-700">— {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Approval status badge ----

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: 'Pending',   cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    selected:   { label: 'Selected',  cls: 'bg-green-100 text-green-800 border-green-200' },
    rejected:   { label: 'Rejected',  cls: 'bg-red-100 text-red-800 border-red-200' },
    approved:   { label: 'Approved',  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    superseded: { label: 'Superseded',cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  }
  const { label, cls } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ---- Skill chip ----

function SkillChip({ slug }: { slug: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted/60 border border-transparent px-2 py-0.5 text-[10px] font-medium">
      {slug.replace(/_/g, ' ')}
    </span>
  )
}

// ---- Single version card ----

function VersionCard({
  version,
  leadId,
  workspaceSlug,
  onStatusChange,
  qualityReview,
}: {
  version:        MessageVersion
  leadId:         string
  workspaceSlug:  string
  onStatusChange: () => void
  qualityReview?: QualityReview
}) {
  const [showBody,    setShowBody]    = useState(false)
  const [showNotes,   setShowNotes]   = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [, startTransition]           = useTransition()

  function handleSelect() {
    setError(null)
    setIsSelecting(true)
    startTransition(async () => {
      const result = await selectMessageVersionAction(version.id, leadId, workspaceSlug)
      setIsSelecting(false)
      if (!result.success) {
        setError(result.error ?? 'Select failed.')
      } else {
        onStatusChange()
      }
    })
  }

  function handleReject() {
    setError(null)
    setIsRejecting(true)
    startTransition(async () => {
      const result = await rejectMessageVersionAction(version.id, leadId, workspaceSlug)
      setIsRejecting(false)
      if (!result.success) {
        setError(result.error ?? 'Reject failed.')
      } else {
        onStatusChange()
      }
    })
  }

  const isSuperseded = version.approvalStatus === 'superseded'
  const isPending    = version.approvalStatus === 'pending'

  return (
    <div className={`rounded-lg border bg-background p-4 space-y-3 ${isSuperseded ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">
            v{version.versionNumber} — {version.versionLabel}
          </span>
          <span className="text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
            {version.strategyAngle.replace(/_/g, ' ')}
          </span>
        </div>
        <ApprovalBadge status={version.approvalStatus} />
      </div>

      {/* Subject line */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Subject</p>
        <p className="text-sm font-medium">{version.subjectLine}</p>
      </div>

      {/* Preview text */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Preview</p>
        <p className="text-xs text-muted-foreground italic">{version.previewText}</p>
      </div>

      {/* Body text (collapsible) */}
      <div>
        <button
          onClick={() => setShowBody(v => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showBody ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showBody ? 'Hide body' : 'View body'}
        </button>
        {showBody && (
          <pre className="mt-2 text-xs whitespace-pre-wrap font-sans text-foreground bg-muted/20 rounded p-2 leading-relaxed">
            {version.bodyText}
          </pre>
        )}
      </div>

      {/* Personalization */}
      {(version.personalizationUsed.length > 0 || version.personalizationGaps.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {version.personalizationUsed.map(p => (
            <span key={p} className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
              {p.replace(/_/g, ' ')}
            </span>
          ))}
          {version.personalizationGaps.map(g => (
            <span key={g} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              {g.split(':')[0]}
            </span>
          ))}
        </div>
      )}

      {/* Skills */}
      <div className="flex flex-wrap gap-1">
        {version.selectedSkills.map(s => (
          <SkillChip key={s.skill_slug} slug={s.skill_slug} />
        ))}
      </div>

      {/* Generation notes */}
      {version.generationNotes && (
        <div>
          <button
            onClick={() => setShowNotes(v => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Why this version?
          </button>
          {showNotes && (
            <p className="mt-1 text-[10px] text-muted-foreground bg-muted/20 rounded p-2">
              {version.generationNotes}
            </p>
          )}
        </div>
      )}

      {/* Quality Review Panel */}
      {qualityReview && <QualityReviewPanel review={qualityReview} />}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Controls */}
      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSelect}
            disabled={isSelecting}
            className="flex items-center gap-1.5 rounded-md bg-green-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSelecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {isSelecting ? 'Selecting…' : 'Select'}
          </button>
          <button
            onClick={handleReject}
            disabled={isRejecting}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            {isRejecting ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            disabled
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-50"
            title="Approval workflow coming in a future phase"
          >
            <Shield className="h-3 w-3" />
            Approve &amp; Send
          </button>
        </div>
      )}

      {version.approvalStatus === 'selected' && (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Selected as preferred candidate. Approval workflow coming in a future phase.
        </div>
      )}
    </div>
  )
}

// ---- Main panel ----

export function GeneratedVersionsPanel({
  versions,
  strategyId,
  leadId,
  workspaceSlug,
  canGenerate,
  blockedReason,
  qualityReviews = [],
  onRunQualityReview,
}: GeneratedVersionsPanelProps) {
  const router = useRouter()
  const [isGenerating,      setIsGenerating]      = useState(false)
  const [isRunningQR,       setIsRunningQR]        = useState(false)
  const [error,             setError]              = useState<string | null>(null)
  const [qrError,           setQrError]            = useState<string | null>(null)
  const [, startTransition]                        = useTransition()
  const activeVersions = versions.filter(v => v.approvalStatus !== 'superseded')

  // Build a map of versionId → QualityReview for quick lookup
  const reviewsByVersionId = new Map<string, QualityReview>()
  for (const review of qualityReviews) {
    if (!review.supersededAt) {
      reviewsByVersionId.set(review.versionId, review)
    }
  }

  function handleRunQualityReview() {
    if (!strategyId) return
    setQrError(null)
    setIsRunningQR(true)
    startTransition(async () => {
      const result = await runQualityReviewAction(strategyId, leadId, workspaceSlug)
      setIsRunningQR(false)
      if (!result.success) {
        setQrError(result.error ?? 'Quality review failed.')
      } else {
        onRunQualityReview?.()
        router.refresh()
      }
    })
  }

  function handleGenerate(forceRegenerate = false) {
    if (!strategyId) return
    setError(null)
    setIsGenerating(true)
    startTransition(async () => {
      const result = await generateMessageVersionsAction(strategyId, leadId, workspaceSlug, forceRegenerate)
      setIsGenerating(false)
      if (!result.success) {
        setError(result.errors?.[0]?.message ?? 'Generation failed.')
      } else {
        router.refresh()
      }
    })
  }

  function handleStatusChange() {
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          Generated Versions
        </p>
        <div className="flex items-center gap-2">
          {activeVersions.length > 0 && (
            <>
              <button
                onClick={handleRunQualityReview}
                disabled={isRunningQR || !strategyId || activeVersions.length === 0}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Run quality review on all versions"
              >
                {isRunningQR ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart2 className="h-3 w-3" />}
                {isRunningQR ? 'Reviewing…' : 'Quality Review'}
              </button>
              <button
                onClick={() => handleGenerate(true)}
                disabled={isGenerating || !canGenerate}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={!canGenerate ? (blockedReason ?? 'Cannot regenerate') : 'Regenerate versions'}
              >
                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Regenerate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generation error */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Quality review error */}
      {qrError && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Quality review failed: {qrError}
        </div>
      )}

      {/* No versions state */}
      {activeVersions.length === 0 && (
        <div className="rounded-lg border bg-background p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            No message versions have been generated for this strategy yet.
          </p>

          {!canGenerate && blockedReason && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {blockedReason}
            </div>
          )}

          <button
            onClick={() => handleGenerate(false)}
            disabled={isGenerating || !canGenerate || !strategyId}
            className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!canGenerate ? (blockedReason ?? 'Cannot generate') : 'Generate message versions'}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {isGenerating ? 'Generating versions…' : 'Generate Message Versions'}
          </button>
        </div>
      )}

      {/* Version cards */}
      {activeVersions.length > 0 && (
        <div className="space-y-3">
          {activeVersions.map(v => (
            <VersionCard
              key={v.id}
              version={v}
              leadId={leadId}
              workspaceSlug={workspaceSlug}
              onStatusChange={handleStatusChange}
              qualityReview={reviewsByVersionId.get(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
