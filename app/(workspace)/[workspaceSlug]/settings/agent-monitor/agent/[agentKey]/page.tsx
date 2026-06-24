import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getAgentProfileData } from '@/modules/intelligence/actions/agent-monitor.actions'
import { AGENT_SKILL_FAMILY } from '@/modules/intelligence/agent-workflows'
import { getAllSkillDefinitions } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'
import { AGENT_SEED_SKILLS, isNonLearnableFamily } from '@/modules/intelligence/skills/agent-seed-skills'
import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'
import { listLearnedSkills } from '@/modules/messaging/skills/learned-skill.repo'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { CANONICAL_COPYWRITING_SLUGS } from '@/modules/messaging/learning/anti-pattern-extraction.service'
import { listAntiPatternSources } from '@/modules/messaging/learning/anti-pattern-source.repo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ArrowRight, Bot } from 'lucide-react'
import { LearnedSkillEditor } from './LearnedSkillEditor'
import { AntiPatternLab } from './AntiPatternLab'
import {
  IMPL_VARIANT, IMPL_LABEL, CATEGORY_LABEL,
  fmtDate, fmtTokens, fmtCost,
} from '../../agent-roster-format'

interface PageProps {
  params: Promise<{ workspaceSlug: string; agentKey: string }>
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default',
  failed:    'destructive',
  killed:    'destructive',
  running:   'secondary',
  cancelled: 'outline',
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  failed:    'bg-red-500',
  killed:    'bg-red-700',
  running:   'bg-blue-500 animate-pulse',
  cancelled: 'bg-gray-400',
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { workspaceSlug, agentKey } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const profile = await getAgentProfileData(ctx.tenantId, agentKey)
  if (!profile) notFound()

  const { row, recentRuns, windowDays } = profile
  const { agg, hasTelemetry } = row
  const monitorBase = `/${workspaceSlug}/settings/agent-monitor`

  // Skills: the curated seed for this agent's family + this tenant's learned rows.
  // Copywriting keeps its rich static module + compact render; every other Class A/B
  // family loads its starter skills from the generic seed registry. Best-effort.
  const family = AGENT_SKILL_FAMILY[agentKey]
  const isCopywritingFamily = family === 'copywriting'
  const copywritingSeeds = isCopywritingFamily ? getAllSkillDefinitions() : []
  const genericSeeds: AgentSkillDefinition[] =
    !isCopywritingFamily && family && AGENT_SEED_SKILLS[family] ? AGENT_SEED_SKILLS[family]() : []
  const governedFamily = isNonLearnableFamily(family)
  const learnedSkills = family
    ? await listLearnedSkills(ctx.tenantId, { family }).catch(() => [])
    : []
  const totalSkills = copywritingSeeds.length + genericSeeds.length + learnedSkills.length
  // The editor is available only for the editable copywriting family + managers.
  const canManage = hasPermission(ctx, 'messaging.manage_templates')
  const skillsEditable = family === 'copywriting' && canManage
  // Anti-Pattern Lab: copywriting agent + manager + control on (default off).
  const antiPatternLabOn = family === 'copywriting' && canManage
    && await getBooleanControl(SystemControlKey.ANTI_PATTERN_LAB_ENABLED, ctx.tenantId, false).catch(() => false)

  // Learned anti-patterns changelog (glass box) — copywriting + manager; always
  // reviewable regardless of the lab control. Best-effort.
  const antiPatternSources = (family === 'copywriting' && canManage)
    ? await listAntiPatternSources(ctx.tenantId, { family: 'copywriting' }).catch(() => [])
    : []

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back row — both Agent Monitor and Agent Map are reachable without a detour */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={monitorBase} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Agent Monitor
        </Link>
        <span>·</span>
        <Link href={`${monitorBase}/map`} className="hover:text-foreground">
          Agent Map
        </Link>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <Bot className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{row.label}</h1>
          <Badge variant={IMPL_VARIANT[row.implState]} className="text-xs">{IMPL_LABEL[row.implState]}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
          <span>{CATEGORY_LABEL[row.category]}</span>
          <span>·</span>
          <span className="font-mono text-xs">{row.key}</span>
          <span>·</span>
          <span>
            Telemetry:{' '}
            {row.telemetryNames.length > 0
              ? <span className="font-mono text-xs">{row.telemetryNames.join(', ')}</span>
              : <span className="italic">none</span>}
          </span>
        </div>
      </div>

      {/* Aggregate (windowed) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity — last {windowDays} days</CardTitle>
        </CardHeader>
        <CardContent>
          {hasTelemetry ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metric label="Runs"        value={String(agg.runs)} />
              <Metric label="Completed"   value={String(agg.completed)} color="text-green-600" />
              <Metric label="Failed"      value={String(agg.failed)} color={agg.failed > 0 ? 'text-destructive' : undefined} />
              <Metric label="Decisions"   value={String(agg.decisions)} />
              <Metric label="Total tokens" value={fmtTokens(agg.totalTokens)} />
              <Metric label="Cost"        value={fmtCost(agg.costUsd)} />
              <Metric label="Last run"    value={fmtDate(agg.lastRunAt)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This agent is registered but not yet instrumented (state: {IMPL_LABEL[row.implState]}).
              No runs, decisions, or token usage are recorded.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Skills (read-only). #skills anchor lets the Agent Map deep-link here. */}
      <Card id="skills">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Skills</CardTitle>
            <span className="text-xs text-muted-foreground">
              {totalSkills > 0 ? `${totalSkills} total` : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {totalSkills === 0 ? (
            <p className="text-sm text-muted-foreground">No skills defined for this agent yet.</p>
          ) : (
            <div className="divide-y">
              {copywritingSeeds.map(s => (
                <div key={`seed-${s.skillSlug}-${s.skillVersion}`} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0 flex-wrap">
                  <span className="font-mono text-xs">{s.skillSlug}</span>
                  <span className="text-xs text-muted-foreground">v{s.skillVersion}</span>
                  <Badge variant="outline" className="text-xs">{s.category}</Badge>
                  <Badge variant="secondary" className="text-xs">seed</Badge>
                </div>
              ))}
              {genericSeeds.map(s => (
                <div key={`seed-${s.skillSlug}-${s.skillVersion}`} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{s.skillSlug}</span>
                    <span className="text-xs text-muted-foreground">v{s.skillVersion}</span>
                    <Badge variant="outline" className="text-xs">{s.category}</Badge>
                    <Badge variant="secondary" className="text-xs">seed</Badge>
                    {governedFamily && (
                      <Badge variant="outline" className="text-xs">Governed (not auto-learned)</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.guidance}</p>
                  {s.requiredElements.length > 0 && (
                    <p className="text-xs"><span className="font-medium">Required:</span> {s.requiredElements.join('; ')}</p>
                  )}
                  {s.forbiddenElements.length > 0 && (
                    <p className="text-xs"><span className="font-medium">Forbidden:</span> {s.forbiddenElements.join('; ')}</p>
                  )}
                  {s.antiPatterns.length > 0 && (
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Anti-patterns:</span> {s.antiPatterns.join('; ')}</p>
                  )}
                </div>
              ))}
              {learnedSkills.map(s => (
                <div key={`learned-${s.id}`} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0 flex-wrap">
                  <span className="font-mono text-xs">{s.skill_slug}</span>
                  <span className="text-xs text-muted-foreground">v{s.skill_version}</span>
                  <Badge variant="outline" className="text-xs">{s.source}</Badge>
                  <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-xs">{s.status}</Badge>
                </div>
              ))}
            </div>
          )}
          {skillsEditable && (
            <LearnedSkillEditor
              learnedSkills={learnedSkills.map(s => ({
                id:            s.id,
                skill_slug:    s.skill_slug,
                skill_version: s.skill_version,
                category:      s.category,
                status:        s.status,
                source:        s.source,
                definition:    s.definition,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {/* Anti-Pattern Lab (copywriting agent + manager + control on) */}
      {antiPatternLabOn && (
        <AntiPatternLab targetSlugs={[...CANONICAL_COPYWRITING_SLUGS]} />
      )}

      {/* Learned anti-patterns changelog (glass box) — copywriting + manager */}
      {family === 'copywriting' && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Learned anti-patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {antiPatternSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No anti-patterns have been applied yet.</p>
            ) : (
              <div className="space-y-4">
                {[...new Set(antiPatternSources.map(s => s.skill_slug))].map(slug => (
                  <div key={slug}>
                    <p className="text-xs font-semibold font-mono text-muted-foreground mb-1.5">{slug}</p>
                    <div className="divide-y">
                      {antiPatternSources.filter(s => s.skill_slug === slug).map(s => (
                        <div key={s.id} className="py-2 first:pt-0 last:pb-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{s.anti_pattern_rule}</span>
                            {s.confidence && <Badge variant="outline" className="text-xs">{s.confidence}</Badge>}
                            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                              {new Date(s.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {s.source_excerpt && (
                            <p className="text-xs italic text-muted-foreground">“{s.source_excerpt}”</p>
                          )}
                          {s.rationale && (
                            <p className="text-xs text-foreground">{s.rationale}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent runs (most recent 25, NOT window-bounded) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Runs</CardTitle>
            <span className="text-xs text-muted-foreground">most recent {recentRuns.length} (up to 25, all time)</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentRuns.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {hasTelemetry
                ? 'No runs recorded for this agent yet.'
                : 'This agent does not log runs.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                    <th className="px-4 py-2.5 text-left font-medium">Trigger</th>
                    <th className="px-4 py-2.5 text-left font-medium">Started</th>
                    <th className="px-4 py-2.5 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentRuns.map(run => {
                    const subjectLabel = run.subject_id
                      ? `${run.subject_type ?? '—'} · ${run.subject_id.slice(0, 8)}…`
                      : run.subject_type ?? '—'
                    return (
                      <tr key={run.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-gray-400'}`} />
                            <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>{run.status}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono">{run.agent_name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{run.run_type ?? '—'}</td>
                        <td className="px-4 py-2 max-w-[160px] truncate" title={run.subject_id ?? ''}>{subjectLabel}</td>
                        <td className="px-4 py-2 text-muted-foreground">{run.trigger_source ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(run.started_at)}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/${workspaceSlug}/settings/agent-monitor/${run.id}`}
                            className="flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Trace <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  )
}
