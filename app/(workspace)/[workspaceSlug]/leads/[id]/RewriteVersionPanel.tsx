'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, TrendingUp, CheckCircle2, AlertTriangle, Loader2, Star, Sparkles } from 'lucide-react'
import { applyEmailDraftVersionAction } from '@/modules/messaging/actions/apply-email-rewrite.actions'
import { promoteVersionToExemplarAction } from '@/modules/messaging/actions/copy-exemplar.actions'
import { EDITABLE_EMAIL_DRAFT_STATUSES } from '@/modules/messaging/constants/email-draft-status'
import type { EmailDraftVersionRow } from '@/modules/messaging/repositories/email-draft-version.repo'

// ---- Helpers ----

function ScorePill({ score }: { score: number }) {
  const cls = score >= 85 ? 'bg-green-100 text-green-800'
    : score >= 70 ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-800'
  return (
    <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ${cls}`}>
      {score}
    </span>
  )
}

function ThresholdBadge({ score }: { score: number }) {
  return score >= 85
    ? <span className="text-[10px] text-green-700 font-medium">Passed ≥85</span>
    : <span className="text-[10px] text-amber-700">Below 85</span>
}

// ---- Props ----

interface RewriteVersionPanelProps {
  emailDraftId:   string
  draftStatus:    string
  versions:       EmailDraftVersionRow[]
  bestVersionId:  string | null
  originalScore:  number | null
  suggestedScore: number | null
  reviewToken:    string | null
  workspaceSlug:  string
}

// ---- Component ----

export function RewriteVersionPanel({
  emailDraftId,
  draftStatus,
  versions,
  bestVersionId,
  originalScore,
  suggestedScore,
  reviewToken,
  workspaceSlug,
}: RewriteVersionPanelProps) {
  const router = useRouter()
  const [expandedId, setExpandedId]          = useState<string | null>(null)
  const [applyingId, setApplyingId]          = useState<string | null>(null)
  const [errors, setErrors]                  = useState<Record<string, string>>({})
  const [appliedId, setAppliedId]            = useState<string | null>(null)
  const [savingExemplarId, setSavingExemplarId] = useState<string | null>(null)
  const [savedExemplarId, setSavedExemplarId]   = useState<string | null>(null)
  const [exemplarErrors, setExemplarErrors]     = useState<Record<string, string>>({})
  const [, startTransition]                  = useTransition()

  const canApply = (EDITABLE_EMAIL_DRAFT_STATUSES as readonly string[]).includes(draftStatus)

  // Derive best score for comparison
  const bestVersion  = bestVersionId ? versions.find(v => v.id === bestVersionId) : null
  const bestScore    = bestVersion?.quality_score != null ? Math.round(Number(bestVersion.quality_score)) : null

  function handleApply(versionId: string) {
    setErrors(prev => ({ ...prev, [versionId]: '' }))
    setApplyingId(versionId)
    startTransition(async () => {
      const result = await applyEmailDraftVersionAction(emailDraftId, versionId)
      setApplyingId(null)
      if (result.success) {
        setAppliedId(versionId)
        router.refresh()
      } else {
        setErrors(prev => ({ ...prev, [versionId]: result.error }))
      }
    })
  }

  function handleSaveExemplar(versionId: string) {
    setExemplarErrors(prev => ({ ...prev, [versionId]: '' }))
    setSavingExemplarId(versionId)
    startTransition(async () => {
      const result = await promoteVersionToExemplarAction(versionId)
      setSavingExemplarId(null)
      if (result.success) {
        setSavedExemplarId(versionId)
      } else {
        setExemplarErrors(prev => ({ ...prev, [versionId]: result.error }))
      }
    })
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rewrite Versions
        </p>
        <p className="text-xs text-muted-foreground">
          No rewrite versions yet. Run the Rewrite Loop from the Email Quality section.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Score comparison */}
      <div className="rounded-lg border bg-muted/30 px-3 py-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Score Comparison
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Original</span>
            {originalScore != null ? <ScorePill score={originalScore} /> : <span className="text-muted-foreground">—</span>}
          </div>
          {suggestedScore != null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Suggestion</span>
              <ScorePill score={suggestedScore} />
            </div>
          )}
          {bestScore != null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Best rewrite</span>
              <ScorePill score={bestScore} />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Target</span>
            <span className="text-xs font-medium text-green-700">85</span>
          </div>
        </div>
      </div>

      {/* Version list */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/20 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Version Options
          </p>
          <p className="text-[10px] text-muted-foreground">
            Best is selected by score. Human review decides final copy.
            {versions.length > 5 && ' Version history may include prior re-runs.'}
          </p>
        </div>
        <div className="divide-y">
          {versions.map(v => {
            const score       = v.quality_score != null ? Math.round(Number(v.quality_score)) : null
            const isBest      = v.id === bestVersionId
            const isOriginal  = v.version_type === 'original'
            const isExpanded  = expandedId === v.id
            const isApplying  = applyingId === v.id
            const isApplied   = appliedId === v.id
            const vError      = errors[v.id]
            const delta       = score != null && originalScore != null ? score - originalScore : null

            return (
              <div key={v.id} className={isBest ? 'bg-green-50/50' : ''}>
                {/* Version row header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
                    v{v.version_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">
                        {isOriginal
                          ? 'Original Draft'
                          : ((v.metadata as Record<string, unknown>)?.strategy_label as string | undefined)
                            ?? v.rewrite_reason
                            ?? 'Rewrite'
                        }
                      </span>
                      {isBest && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                          <Star className="h-2.5 w-2.5" />
                          Best
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{v.subject}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {score != null && <ScorePill score={score} />}
                    {delta != null && !isOriginal && delta > 0 && (
                      <span className="text-[10px] text-green-700 font-medium">+{delta}</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                    {score != null && (
                      <div className="pt-2 flex items-center gap-2 flex-wrap">
                        <ScorePill score={score} />
                        <ThresholdBadge score={score} />
                        {delta != null && !isOriginal && (
                          <span className={`text-xs font-medium ${delta > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>
                            {delta > 0 ? `+${delta}` : delta} vs original
                          </span>
                        )}
                      </div>
                    )}

                    {/* Strategy context */}
                    {(() => {
                      const meta = v.metadata as Record<string, unknown>
                      const purpose  = typeof meta?.strategy_purpose  === 'string' ? meta.strategy_purpose  : null
                      const relCtx   = typeof meta?.relationship_context === 'string' ? meta.relationship_context : null
                      return (purpose || relCtx) ? (
                        <div className="space-y-0.5">
                          {purpose && (
                            <p className="text-[10px] text-muted-foreground italic">{purpose}</p>
                          )}
                          {relCtx && (
                            <p className="text-[10px] text-muted-foreground">
                              Context: <span className="font-medium">{relCtx.replace(/_/g, ' ')}</span>
                            </p>
                          )}
                        </div>
                      ) : null
                    })()}

                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Subject</p>
                      <p className="text-xs font-medium">{v.subject}</p>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Body</p>
                      <pre className="text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed max-h-48 overflow-y-auto">
                        {v.body_text}
                      </pre>
                    </div>

                    {vError && (
                      <div className="flex items-start gap-1.5 text-xs text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{vError}</span>
                      </div>
                    )}

                    {isApplied && (
                      <div className="flex items-center gap-1.5 text-xs text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Version applied to draft.
                      </div>
                    )}

                    {!isOriginal && canApply && !isApplied && (
                      <button
                        onClick={() => handleApply(v.id)}
                        disabled={isApplying || applyingId !== null}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                                   hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isApplying
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <TrendingUp className="h-3.5 w-3.5" />
                        }
                        {isApplying
                          ? 'Applying…'
                          : score != null && score >= 85
                          ? 'Apply This Version'
                          : 'Apply This Version Anyway'
                        }
                      </button>
                    )}

                    {!isOriginal && canApply && !isApplied && score != null && (
                      <p className="text-[10px] text-muted-foreground">
                        {score >= 85
                          ? 'This version passed the quality threshold.'
                          : 'This version is improved, but still below the 85 threshold. Review before applying.'}
                        {' '}No email is sent.
                      </p>
                    )}

                    {isOriginal && (
                      <p className="text-[10px] text-muted-foreground">
                        This is the original draft. Apply a rewrite version to update it.
                      </p>
                    )}

                    {/* Save as exemplar — captures this copy as house voice for
                        future rewrites. Permission is enforced by the action. */}
                    <div className="border-t pt-2 space-y-1">
                      {savedExemplarId === v.id ? (
                        <div className="flex items-center gap-1.5 text-xs text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Saved as a voice exemplar.
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSaveExemplar(v.id)}
                          disabled={savingExemplarId === v.id}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                                     hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingExemplarId === v.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Sparkles className="h-3.5 w-3.5" />
                          }
                          {savingExemplarId === v.id ? 'Saving…' : 'Save as exemplar'}
                        </button>
                      )}
                      {exemplarErrors[v.id] && (
                        <div className="flex items-start gap-1.5 text-xs text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{exemplarErrors[v.id]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Approval link */}
      {reviewToken ? (
        <a
          href={`/approve/${reviewToken}`}
          className="flex items-center justify-between rounded-lg border bg-amber-50 border-amber-200 px-3 py-2.5 text-xs"
        >
          <span className="text-amber-800 font-medium">Pending review</span>
          <span className="text-blue-600 hover:text-blue-800 font-medium">
            Review and approve email →
          </span>
        </a>
      ) : draftStatus === 'pending_approval' ? (
        <a
          href={`/${workspaceSlug}/inbox`}
          className="flex items-center justify-between rounded-lg border bg-amber-50 border-amber-200 px-3 py-2.5 text-xs"
        >
          <span className="text-amber-800 font-medium">Pending review</span>
          <span className="text-blue-600 hover:text-blue-800 font-medium">
            Open approval inbox →
          </span>
        </a>
      ) : null}
    </div>
  )
}
