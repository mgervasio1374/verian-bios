'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  IMPL_VARIANT, IMPL_LABEL, CATEGORY_LABEL, CATEGORY_ORDER,
} from '../agent-roster-format'
import type { AgentImplState, AgentRosterCategory } from '@/modules/intelligence/agent-roster'

interface WorkflowChip {
  workflowKey:   string
  label:         string
  color:         string
  step?:         number
  crossCutting?: boolean
}

interface AgentCard {
  key:            string
  label:          string
  category:       AgentRosterCategory
  implState:      AgentImplState
  responsibility: string
  workflows:      WorkflowChip[]
  skillCount:     number
  skillFamily:    string | null
}

interface LegendItem {
  key:          string
  label:        string
  color:        string
  crossCutting: boolean
}

interface Props {
  agents:        AgentCard[]
  workspaceSlug: string
  workflows:     LegendItem[]
}

export function AgentCatalog({ agents, workspaceSlug, workflows }: Props) {
  // Legend-highlight: clicking a workflow dims non-matching, non-cross-cutting cards.
  const [selected, setSelected] = useState<string | null>(null)

  function isHighlighted(card: AgentCard): boolean {
    if (!selected) return true
    if (card.workflows.some(w => w.crossCutting)) return true // cross-cutting always lit
    return card.workflows.some(w => w.workflowKey === selected)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        href={`/${workspaceSlug}/settings/agent-monitor`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Agent Monitor
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Agent Map</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every agent in the layer, grouped by category, tagged with the workflow it serves.
          Click a workflow below to highlight its agents.
        </p>
      </div>

      {/* Workflow legend */}
      <div className="flex flex-wrap items-center gap-2">
        {workflows.map(w => {
          const active = selected === w.key
          return (
            <button
              key={w.key}
              type="button"
              onClick={() => setSelected(active ? null : w.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-accent text-accent-foreground border-accent-foreground/30' : 'text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
              {w.label}{w.crossCutting ? ' (cross-cutting)' : ''}
            </button>
          )
        })}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50 shrink-0" />
          all outbound / advisory
        </span>
      </div>

      {/* Catalog grouped by category */}
      {CATEGORY_ORDER.map(cat => {
        const catAgents = agents.filter(a => a.category === cat)
        if (catAgents.length === 0) return null
        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="text-sm">{CATEGORY_LABEL[cat]} ({catAgents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {catAgents.map(a => {
                  const lit = isHighlighted(a)
                  const profileHref = `/${workspaceSlug}/settings/agent-monitor/agent/${a.key}`
                  return (
                    <div
                      key={a.key}
                      className={`rounded-lg border p-3 transition-opacity ${lit ? 'opacity-100' : 'opacity-40'}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{a.label}</span>
                        <Badge variant={IMPL_VARIANT[a.implState]} className="text-xs">{IMPL_LABEL[a.implState]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.responsibility}</p>

                      {/* Workflow chips */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {a.workflows.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground italic">not in an operational workflow</span>
                        ) : (
                          a.workflows.map(w => (
                            <span
                              key={w.workflowKey}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                              {w.label}{w.crossCutting ? '' : ` · step ${w.step}`}
                            </span>
                          ))
                        )}
                      </div>

                      {/* Links: skills + traces, both into the agent profile */}
                      <div className="flex items-center gap-3 mt-2.5">
                        <Link href={profileHref} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                          <Sparkles className="h-3 w-3" />
                          {a.skillCount > 0 ? `${a.skillCount} skill${a.skillCount === 1 ? '' : 's'}` : 'no skills yet'}
                        </Link>
                        <Link href={profileHref} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                          <Activity className="h-3 w-3" />
                          Traces
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
