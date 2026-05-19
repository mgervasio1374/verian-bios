'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Shield,
  Brain,
  Target,
  Users,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import {
  generateMessageStrategyAction,
  approveMessageStrategyAction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  overrideMessageStrategyAction,
} from '@/modules/messaging/actions/message-strategy.actions'
import type {
  MessageStrategy,
  LeadStrategyInput,
  StatementStrategyInput,
  PartnerStrategyInput,
  ProposalStrategyInput,
  CustomerStrategyInput,
} from '@/modules/messaging/strategy/message-strategy.types'

// ---- Props ----

interface StrategyReviewPanelProps {
  strategy:       MessageStrategy | null
  leadId:         string
  workspaceSlug:  string
  leadInput:      Partial<LeadStrategyInput> & { lead_id: string }
  statementInput: Partial<StatementStrategyInput> & { has_statement_artifact: boolean }
  partnerInput:   Partial<PartnerStrategyInput> & { partner_membership_confirmed: boolean }
  proposalInput:  Partial<ProposalStrategyInput> & { proposal_sent: boolean }
  customerInput:  Partial<CustomerStrategyInput> & { is_existing_customer: boolean }
}

// ---- Status badge ----

function StrategyStatusBadge({ status }: { status: MessageStrategy['status'] }) {
  const map: Record<MessageStrategy['status'], { label: string; cls: string }> = {
    draft:      { label: 'Draft',       cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved:   { label: 'Approved',    cls: 'bg-green-100 text-green-800 border-green-200' },
    in_use:     { label: 'In Use',      cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    superseded: { label: 'Superseded',  cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    error:      { label: 'Blocked',     cls: 'bg-red-100 text-red-800 border-red-200' },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ---- Confidence indicator ----

function ConfidenceBar({ score }: { score: number }) {
  const pct  = Math.round(score * 100)
  const cls  = pct >= 85 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : pct >= 50 ? 'bg-orange-500' : 'bg-red-500'
  const band = pct >= 85 ? 'High' : pct >= 70 ? 'Usable' : pct >= 50 ? 'Low — review required' : 'Insufficient'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-medium tabular-nums">{pct}% — {band}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${cls} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ---- Skill chip ----

function SkillChip({ slug, version, reasoning }: { slug: string; version: number; reasoning?: string }) {
  const [showReason, setShowReason] = useState(false)
  const isCompliance = slug === 'compliance_forbidden_claims'
  return (
    <div className="relative">
      <button
        onClick={() => setShowReason(v => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors
          ${isCompliance
            ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
            : 'bg-muted/60 text-foreground border-transparent hover:bg-muted'}`}
      >
        {slug.replace(/_/g, ' ')}
        <span className="opacity-50">v{version}</span>
        {reasoning && <ChevronDown className={`h-2.5 w-2.5 opacity-50 transition-transform ${showReason ? 'rotate-180' : ''}`} />}
      </button>
      {showReason && reasoning && (
        <div className="absolute top-full left-0 mt-1 z-10 w-64 rounded-md border bg-popover p-2 text-[10px] text-muted-foreground shadow-md">
          {reasoning}
        </div>
      )}
    </div>
  )
}

// ---- Main component ----

export function StrategyReviewPanel({
  strategy,
  leadId,
  leadInput,
  statementInput,
  partnerInput,
  proposalInput,
  customerInput,
}: StrategyReviewPanelProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving,  setIsApproving]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [showReasoning, setShowReasoning] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  function handleGenerate() {
    setError(null)
    setIsGenerating(true)
    startTransition(async () => {
      const result = await generateMessageStrategyAction({
        lead:     { ...leadInput },
        statement:statementInput,
        partner:  partnerInput,
        proposal: proposalInput,
        customer: customerInput,
      })
      setIsGenerating(false)
      if (!result.success) {
        setError(result.errors?.[0]?.message ?? 'Strategy generation failed.')
      } else {
        router.refresh()
      }
    })
  }

  function handleApprove() {
    if (!strategy) return
    setError(null)
    setIsApproving(true)
    startTransition(async () => {
      const result = await approveMessageStrategyAction(strategy.id, leadId)
      setIsApproving(false)
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  // ---- No strategy state ----

  if (!strategy) {
    return (
      <div className="rounded-lg border bg-background p-6 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          Message Strategy
        </p>
        <p className="text-sm text-muted-foreground">
          No strategy has been generated for this lead yet.
        </p>
        {error && (
          <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          {isGenerating ? 'Generating strategy…' : 'Generate Message Strategy'}
        </button>
      </div>
    )
  }

  const skillReasoningMap = Object.fromEntries(
    (strategy.skill_reasoning ?? []).map(sr => [sr.skill_slug, sr.reason])
  )

  const hasCriticalErrors = strategy.invalid_reasons.some(e => e.severity === 'critical')

  return (
    <div className="space-y-4">
      {/* ---- Strategy Panel ---- */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Message Strategy
          </p>
          <div className="flex items-center gap-2">
            {strategy.requires_human_review && strategy.status !== 'approved' && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Requires Review
              </span>
            )}
            <StrategyStatusBadge status={strategy.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Message Type</p>
            <p className="font-medium capitalize">{strategy.message_type.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tone</p>
            <p className="font-medium capitalize">{strategy.tone.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Primary Goal</p>
            <p className="font-medium capitalize">{strategy.primary_goal.replace(/_/g, ' ')}</p>
          </div>
          {strategy.secondary_goal && (
            <div>
              <p className="text-muted-foreground">Secondary Goal</p>
              <p className="font-medium capitalize">{strategy.secondary_goal.replace(/_/g, ' ')}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Length Target</p>
            <p className="font-medium capitalize">{strategy.length_target.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Personalization</p>
            <p className="font-medium capitalize">{strategy.personalization_level.replace(/_/g, ' ')}</p>
          </div>
        </div>

        <ConfidenceBar score={strategy.confidence_score} />

        {/* Reasoning (collapsible) */}
        <div>
          <button
            onClick={() => setShowReasoning(v => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            View strategy reasoning
          </button>
          {showReasoning && (
            <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed bg-muted/30 rounded p-2">
              {strategy.reasoning}
            </p>
          )}
        </div>

        {/* Alternative angles (collapsible) */}
        {strategy.alternative_angles.length > 0 && (
          <div>
            <button
              onClick={() => setShowAlternatives(v => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {showAlternatives ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              What else was considered ({strategy.alternative_angles.length})
            </button>
            {showAlternatives && (
              <div className="mt-2 space-y-1">
                {strategy.alternative_angles.map((alt, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground flex gap-2">
                    <span className="font-medium capitalize text-foreground/70 shrink-0">
                      {(alt.message_type as string).replace(/_/g, ' ')}
                    </span>
                    <span>— {alt.reason_not_selected}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Audience and Positioning Panel ---- */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Audience & Positioning
        </p>
        <div className="space-y-2 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Audience Context</p>
            <p className="text-foreground mt-0.5 leading-relaxed">{strategy.audience_context}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pain Point Hypothesis</p>
            <p className="text-foreground mt-0.5 italic">{strategy.pain_point_hypothesis}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Offer Angle</p>
              <p className="font-medium capitalize">{strategy.offer_angle.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Trust Angle</p>
              <p className="text-foreground">{strategy.trust_angle}</p>
            </div>
          </div>
          {strategy.proof_point && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Proof Point</p>
              <p className="text-foreground">{strategy.proof_point}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CTA Directive</p>
            <p className="text-foreground font-medium">{strategy.cta}</p>
          </div>
        </div>
      </div>

      {/* ---- Skills Panel ---- */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Selected Skills
        </p>
        <div className="flex flex-wrap gap-1.5">
          {strategy.selected_skills.map(s => (
            <SkillChip
              key={s.skill_slug}
              slug={s.skill_slug}
              version={s.skill_version}
              reasoning={skillReasoningMap[s.skill_slug]}
            />
          ))}
        </div>
      </div>

      {/* ---- Compliance Panel ---- */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Compliance & Constraints
        </p>
        <div className="space-y-3">
          {strategy.compliance_notes.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Compliance Notes</p>
              <ul className="space-y-0.5">
                {strategy.compliance_notes.map((note, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground flex gap-1.5">
                    <span className="text-blue-500 shrink-0 mt-0.5">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {strategy.required_inclusions.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Required Inclusions</p>
              <ul className="space-y-0.5">
                {strategy.required_inclusions.map((item, i) => (
                  <li key={i} className="text-[10px] text-green-700 flex gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {strategy.invalid_reasons.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Blocking Issues</p>
              <div className="space-y-1">
                {strategy.invalid_reasons.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono font-semibold">{e.code}</span>
                      {' — '}{e.message}
                      {e.suggested_fix && (
                        <p className="text-red-600 mt-0.5 italic">{e.suggested_fix}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Override Panel ---- */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Controls</p>

        {error && (
          <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          {/* Approve button */}
          {strategy.requires_human_review && strategy.status !== 'approved' && !hasCriticalErrors && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-green-700 text-white px-4 py-2 text-xs font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {isApproving ? 'Approving…' : 'Approve Strategy'}
            </button>
          )}

          {strategy.status === 'approved' && (
            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Strategy approved. Copy generation available in a future phase.
            </div>
          )}

          {/* Regenerate */}
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Override reason (required to save changes)</label>
            <textarea
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Explain why you are modifying this strategy…"
              className="w-full rounded border bg-background px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isGenerating ? 'Regenerating…' : 'Regenerate Strategy'}
          </button>
        </div>

        {/* Override log */}
        {(strategy.override_log ?? []).length > 0 && (
          <div className="border-t pt-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Override History</p>
            {strategy.override_log.map((log, i) => (
              <div key={i} className="text-[10px] text-muted-foreground">
                <span className="font-medium">{new Date(log.overridden_at).toLocaleDateString()}</span>
                {' — '}{log.override_reason}
                {log.affected_fields.length > 0 && (
                  <span className="ml-1 opacity-60">({log.affected_fields.join(', ')})</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
