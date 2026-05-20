'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, ShieldAlert,
  Lightbulb, ChevronDown, ChevronUp, RefreshCw, TrendingUp,
} from 'lucide-react'
import { reviewEmailDraftQualityAction } from '@/modules/messaging/actions/email-quality.actions'
import { runEmailRewriteLoopAction } from '@/modules/messaging/actions/email-rewrite-loop.actions'
import { applyBestRewriteToDraftAction } from '@/modules/messaging/actions/apply-email-rewrite.actions'
import type { EmailQualityReviewRow } from '@/modules/messaging/repositories/email-quality.repo'

// ---- Config ----

const STATUS_CONFIG = {
  pass:           { label: 'Pass',                 icon: CheckCircle2,  color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  needs_revision: { label: 'Needs Revision',       icon: AlertTriangle, color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  blocked:        { label: 'Rewrite Recommended',  icon: XCircle,       color: 'text-red-700',    bg: 'bg-red-50 border-red-200'    },
}

const LOOP_STATUS_CONFIG: Record<string, { label: string; color: string; explanation: (delta: number | null, best: number | null) => string }> = {
  passed_threshold: {
    label: 'Passed threshold',
    color: 'text-green-700',
    explanation: (_, best) => `Best rewrite reached the 85 quality threshold (${best}/100).`,
  },
  improved_but_below_threshold: {
    label: 'Improved but below 85',
    color: 'text-amber-700',
    explanation: (delta, best) =>
      `Best rewrite improved the email by +${delta ?? 0} points but did not reach the 85 quality threshold (${best}/100). Human review is required before sending.`,
  },
  no_improvement: {
    label: 'No meaningful improvement',
    color: 'text-muted-foreground',
    explanation: () => 'Rewrite loop could not improve this draft. Human rewrite recommended.',
  },
  blocked_risk: {
    label: 'Stopped — new risk detected',
    color: 'text-red-700',
    explanation: () => 'Loop stopped because the rewrite introduced new risk flags. Manual review required.',
  },
  needs_human_review: {
    label: 'Human review required',
    color: 'text-amber-700',
    explanation: (delta, best) =>
      delta && delta > 0
        ? `Best rewrite improved the email by +${delta} points (${best}/100). Human review recommended before sending.`
        : 'Rewrite loop could not improve this draft. Human rewrite recommended.',
  },
}

const DIMENSION_LABELS: Record<string, string> = {
  subject_score:         'Subject',
  opening_score:         'Opening',
  personalization_score: 'Personalization',
  value_clarity_score:   'Value Clarity',
  cta_score:             'CTA',
  trust_score:           'Trust',
  brevity_score:         'Brevity',
  spam_risk_score:       'Spam Risk',
  brand_fit_score:       'Brand Fit',
  human_tone_score:      'Human Tone',
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-100 text-green-800'
    : score >= 55 ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-800'
  return (
    <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ${color}`}>
      {score}
    </span>
  )
}

// ---- Props ----

interface BestVersionData {
  subject:       string
  bodyText:      string
  versionNumber: number
  score:         number
}

interface EmailQualityCardProps {
  emailDraftId:  string
  initialReview: EmailQualityReviewRow | null
  bestVersion?:  BestVersionData | null
}

// ---- Component ----

export function EmailQualityCard({ emailDraftId, initialReview, bestVersion: initialBest }: EmailQualityCardProps) {
  const router = useRouter()
  const [review, setReview]             = useState<EmailQualityReviewRow | null>(initialReview)
  const [bestVersion, setBestVersion]   = useState<BestVersionData | null>(initialBest ?? null)
  const [error, setError]               = useState<string | null>(null)
  const [loopError, setLoopError]       = useState<string | null>(null)
  const [showOrigRewrite, setShowOrigRewrite] = useState(false)
  const [showBestVersion, setShowBestVersion] = useState(false)
  const [reviewLoading, setReviewLoading]     = useState(false)
  const [loopLoading, setLoopLoading]         = useState(false)
  const [applyLoading, setApplyLoading]         = useState(false)
  const [applyError, setApplyError]             = useState<string | null>(null)
  const [applySuccess, setApplySuccess]         = useState(false)
  const [dupSkipped, setDupSkipped]             = useState<number>(0)
  const [, startTransition]               = useTransition()

  function handleReview() {
    setError(null)
    setReviewLoading(true)
    startTransition(async () => {
      const result = await reviewEmailDraftQualityAction(emailDraftId)
      setReviewLoading(false)
      if (result.success) {
        setReview(result.data)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleRunLoop() {
    setLoopError(null)
    setLoopLoading(true)
    startTransition(async () => {
      const result = await runEmailRewriteLoopAction(emailDraftId)
      setLoopLoading(false)
      if (result.success) {
        const d = result.data
        // Update client state immediately with full data — no flash of empty content
        setBestVersion({
          subject:       d.bestVersionSubject ?? '',
          bodyText:      d.bestVersionBody    ?? '',
          versionNumber: d.bestVersionNumber,
          score:         d.bestScore,
        })
        // Also update the quality review row fields so loop summary re-renders
        setReview(prev => prev ? {
          ...prev,
          best_version_score:  d.bestScore,
          best_version_number: d.bestVersionNumber,
          rewrite_loop_status: d.status,
          rewrite_iterations:  d.iterations,
        } : prev)
        setDupSkipped(d.duplicatesSkipped ?? 0)
        router.refresh()
      } else {
        setLoopError(result.error)
      }
    })
  }

  function handleApplyRewrite() {
    setApplyError(null)
    setApplySuccess(false)
    setApplyLoading(true)
    startTransition(async () => {
      const result = await applyBestRewriteToDraftAction(emailDraftId)
      setApplyLoading(false)
      if (result.success) {
        setApplySuccess(true)
        router.refresh()
      } else {
        setApplyError(result.error)
      }
    })
  }

  // ---- No review yet ----
  if (!review) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Email quality has not been reviewed yet.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={handleReview}
          disabled={reviewLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                     hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
          {reviewLoading ? 'Reviewing…' : 'Review Email Quality'}
        </button>
      </div>
    )
  }

  // ---- Review exists ----
  const overallScore = Math.round(review.overall_score)
  const status       = (review.status ?? 'needs_revision') as keyof typeof STATUS_CONFIG
  const statusCfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.needs_revision
  const StatusIcon   = statusCfg.icon

  const strengths  = (review.strengths  ?? []) as string[]
  const weaknesses = (review.weaknesses ?? []) as string[]
  const riskFlags  = (review.risk_flags ?? []) as string[]

  const dimensions = [
    { key: 'subject_score',         score: review.subject_score },
    { key: 'opening_score',         score: review.opening_score },
    { key: 'personalization_score', score: review.personalization_score },
    { key: 'value_clarity_score',   score: review.value_clarity_score },
    { key: 'cta_score',             score: review.cta_score },
    { key: 'trust_score',           score: review.trust_score },
    { key: 'brevity_score',         score: review.brevity_score },
    { key: 'spam_risk_score',       score: review.spam_risk_score },
    { key: 'brand_fit_score',       score: review.brand_fit_score },
    { key: 'human_tone_score',      score: review.human_tone_score },
  ].filter(d => d.score != null) as { key: string; score: number }[]

  // Loop summary fields from the DB row
  const bestScore        = review.best_version_score != null ? Math.round(Number(review.best_version_score)) : null
  const loopIterations   = review.rewrite_iterations ?? 0
  const loopStatus       = review.rewrite_loop_status as string | null
  const loopStatusCfg    = loopStatus ? LOOP_STATUS_CONFIG[loopStatus] : null
  const loopRan          = loopStatus !== null && loopIterations > 0
  const delta            = bestScore != null ? bestScore - overallScore : null
  // Suggested rewrite score (from the quality review itself, scored without recursion)
  const suggestedScore   = review.suggested_overall_score != null ? Math.round(Number(review.suggested_overall_score)) : null
  const suggestedWeaknesses = (review.suggested_weaknesses ?? []) as string[]
  const suggestedRiskFlags  = (review.suggested_risk_flags  ?? []) as string[]

  return (
    <div className="space-y-3">

      {/* Original score header */}
      <div className={`flex items-start gap-3 rounded-lg border p-3 ${statusCfg.bg}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusIcon className={`h-4 w-4 shrink-0 ${statusCfg.color}`} />
            <span className={`text-sm font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`text-lg font-bold tabular-nums ${statusCfg.color}`}>
              {overallScore}/100
            </span>
          </div>
          {review.review_summary && (
            <p className="text-xs mt-1 text-muted-foreground">{review.review_summary}</p>
          )}
        </div>
        <button
          onClick={handleReview}
          disabled={reviewLoading}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
          title="Re-run quality review"
        >
          {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '↻'}
        </button>
      </div>

      {/* Rewrite loop summary */}
      {loopRan && bestScore != null && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Rewrite Scores
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground text-xs">Original</span>
            <ScorePill score={overallScore} />
            {suggestedScore != null && (
              <>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-muted-foreground text-xs">Suggestion</span>
                <ScorePill score={suggestedScore} />
              </>
            )}
            <span className="text-muted-foreground text-xs">→</span>
            <span className="text-muted-foreground text-xs">Best</span>
            <ScorePill score={bestScore} />
            {delta != null && delta > 0 && (
              <span className="text-xs font-medium text-green-700">+{delta}</span>
            )}
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground">
              {loopIterations} new version{loopIterations !== 1 ? 's' : ''}
              {dupSkipped > 0 && ` · ${dupSkipped} duplicate${dupSkipped !== 1 ? 's' : ''} skipped`}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Target: <span className="font-medium">85/100</span>
          </div>
          {loopStatusCfg && (
            <p className={`text-xs ${loopStatusCfg.color}`}>
              {loopStatusCfg.explanation(delta, bestScore)}
            </p>
          )}
        </div>
      )}

      {/* Dimension scores */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {dimensions.map(d => (
          <div key={d.key} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{DIMENSION_LABELS[d.key] ?? d.key}</span>
            <ScorePill score={Math.round(d.score)} />
          </div>
        ))}
      </div>

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div className="space-y-1">
          {riskFlags.map((flag, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issues to fix</p>
          <ul className="space-y-0.5">
            {weaknesses.slice(0, 5).map((w, i) => (
              <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                <span className="shrink-0">·</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strengths</p>
          <ul className="space-y-0.5">
            {strengths.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs text-green-800 flex items-start gap-1.5">
                <span className="shrink-0">✓</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Best rewrite version (from loop) */}
      {bestVersion && bestVersion.bodyText && bestVersion.score > overallScore && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowBestVersion(!showBestVersion)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-1.5 flex-wrap">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Best rewrite</span>
              <span className="text-muted-foreground">
                v{bestVersion.versionNumber} · {bestVersion.score}/100
                {delta != null && delta > 0 && ` (+${delta})`}
              </span>
              {bestVersion.score >= 85
                ? <span className="text-green-700 font-medium">Passed threshold</span>
                : <span className="text-amber-700">Below 85</span>
              }
            </span>
            {showBestVersion ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showBestVersion && (
            <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
              {bestVersion.subject && (
                <div className="pt-2 space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject</p>
                  <p className="text-xs font-medium">{bestVersion.subject}</p>
                </div>
              )}
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Body</p>
                <pre className="text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed">
                  {bestVersion.bodyText}
                </pre>
              </div>

              {/* Apply Best Rewrite action */}
              <div className="border-t pt-2 space-y-1.5">
                {applySuccess && (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Best rewrite applied to draft.
                  </p>
                )}
                {applyError && (
                  <div className="flex items-start gap-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{applyError}</span>
                  </div>
                )}
                <button
                  onClick={handleApplyRewrite}
                  disabled={applyLoading || applySuccess || reviewLoading || loopLoading}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                             hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applyLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <TrendingUp className="h-3.5 w-3.5" />
                  }
                  {applyLoading
                    ? 'Applying…'
                    : applySuccess
                    ? 'Applied'
                    : bestVersion.score >= 85
                    ? 'Apply Best Rewrite'
                    : 'Apply Best Rewrite Anyway'
                  }
                </button>
                <p className="text-[10px] text-muted-foreground">
                  {bestVersion.score >= 85
                    ? 'This version passed the quality threshold.'
                    : 'This version is improved, but still below the 85 threshold. Review before applying.'}
                  {' '}No email is sent.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Original suggested rewrite (collapsible) */}
      {(review.suggested_subject || review.suggested_body) && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowOrigRewrite(!showOrigRewrite)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-1.5 flex-wrap">
              <span>Quality suggestion</span>
              {suggestedScore != null && (
                <>
                  <ScorePill score={suggestedScore} />
                  {suggestedScore - overallScore > 0 && (
                    <span className="text-green-700 font-medium">+{suggestedScore - overallScore}</span>
                  )}
                  {suggestedScore >= 85
                    ? <span className="text-green-700">Passed threshold</span>
                    : <span className="text-amber-700">Below 85</span>
                  }
                </>
              )}
            </span>
            {showOrigRewrite ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showOrigRewrite && (
            <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
              {/* Suggested score summary */}
              {suggestedScore != null && (
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <ScorePill score={suggestedScore} />
                  <span className="text-xs text-muted-foreground">
                    vs original {overallScore}/100
                    {suggestedScore - overallScore > 0
                      ? <span className="text-green-700 ml-1">(+{suggestedScore - overallScore})</span>
                      : suggestedScore - overallScore < 0
                      ? <span className="text-red-700 ml-1">({suggestedScore - overallScore})</span>
                      : <span className="text-muted-foreground ml-1">(no change)</span>
                    }
                  </span>
                </div>
              )}
              {/* Suggested weaknesses (top 2) */}
              {suggestedWeaknesses.length > 0 && (
                <ul className="space-y-0.5">
                  {suggestedWeaknesses.slice(0, 2).map((w, i) => (
                    <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                      <span className="shrink-0">·</span>{w}
                    </li>
                  ))}
                </ul>
              )}
              {/* Suggested risk flags */}
              {suggestedRiskFlags.length > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{suggestedRiskFlags[0]}</span>
                </div>
              )}
              {review.suggested_subject && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject</p>
                  <p className="text-xs font-medium">{review.suggested_subject}</p>
                </div>
              )}
              {review.suggested_body && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Body</p>
                  <pre className="text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed">
                    {review.suggested_body}
                  </pre>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground border-t pt-2">
                Starting point only — edit before use. The Best Rewrite panel may have a higher score.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rewrite loop controls */}
      <div className="border-t pt-2 flex flex-col gap-1.5">
        {loopError && (
          <div className="flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{loopError}</span>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={handleRunLoop}
          disabled={loopLoading || reviewLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                     hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed w-fit"
        >
          {loopLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />
          }
          {loopLoading
            ? 'Running rewrite loop…'
            : loopRan ? 'Re-run Rewrite Loop' : 'Run Rewrite Loop'
          }
        </button>
      </div>

    </div>
  )
}
