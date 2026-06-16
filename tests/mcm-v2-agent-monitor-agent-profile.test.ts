/**
 * mcm-v2 — Agent Monitor per-agent profile page.
 *
 * Roster rows click through to a profile page (nested under the static agent/
 * segment) showing the agent's metadata, windowed aggregate, and recent runs
 * (each linking to the existing run-trace page). Source-read tier. TC-AMAP-01..09
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const PROFILE_PAGE  = 'app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/page.tsx'
const ROSTER_SECTION = 'app/(workspace)/[workspaceSlug]/settings/agent-monitor/AgentRosterSection.tsx'
const ACTIONS        = 'modules/intelligence/actions/agent-monitor.actions.ts'

describe('mcm-v2 agent-monitor profile page', () => {
  it('TC-AMAP-01: profile page exists at the nested agent/[agentKey] path', () => {
    expect(() => readSrc(PROFILE_PAGE)).not.toThrow()
  })

  it('TC-AMAP-02: profile page gates crm.companies.view', () => {
    expect(readSrc(PROFILE_PAGE)).toContain("requirePermission(ctx, 'crm.companies.view')")
  })

  it('TC-AMAP-03: profile page calls getAgentProfileData and notFound() on null', () => {
    const src = readSrc(PROFILE_PAGE)
    expect(src).toContain('getAgentProfileData(ctx.tenantId, agentKey')
    expect(src).toContain('if (!profile) notFound()')
  })

  it('TC-AMAP-04: getAgentProfileData resolves the row from getAgentRosterData by key', () => {
    const src = readSrc(ACTIONS)
    expect(src).toContain('export async function getAgentProfileData')
    const fnStart = src.indexOf('export async function getAgentProfileData')
    const fnBody = src.slice(fnStart, fnStart + 1200)
    expect(fnBody).toContain('getAgentRosterData(tenantId, windowDays)')
    expect(fnBody).toContain('rows.find(r => r.key === agentKey)')
    expect(fnBody).toContain('if (!row) return null')
  })

  it('TC-AMAP-05: getAgentProfileData fetches runs via listAgentRuns per telemetry name', () => {
    const src = readSrc(ACTIONS)
    const fnStart = src.indexOf('export async function getAgentProfileData')
    const fnBody = src.slice(fnStart, fnStart + 1200)
    expect(fnBody).toContain('row.telemetryNames.map(n => agentRunRepo.listAgentRuns(tenantId, { agentName: n, limit: 25 })')
  })

  it('TC-AMAP-06: AgentProfileData return type is exported with row/recentRuns/windowDays', () => {
    const src = readSrc(ACTIONS)
    const ifaceStart = src.indexOf('export interface AgentProfileData')
    expect(ifaceStart).toBeGreaterThan(-1)
    const ifaceBody = src.slice(ifaceStart, ifaceStart + 200)
    expect(ifaceBody).toContain('row:')
    expect(ifaceBody).toContain('recentRuns:')
    expect(ifaceBody).toContain('windowDays:')
  })

  it('TC-AMAP-07: AgentRosterSection takes workspaceSlug and links the label to the profile route', () => {
    const src = readSrc(ROSTER_SECTION)
    expect(src).toContain('workspaceSlug: string')
    expect(src).toContain('/settings/agent-monitor/agent/${r.key}')
    expect(src).toContain("import Link from 'next/link'")
  })

  it('TC-AMAP-08: profile page handles the uninstrumented (empty-telemetry) case', () => {
    const src = readSrc(PROFILE_PAGE)
    // Conditional on hasTelemetry + explanatory copy (not a blank page / 404).
    expect(src).toContain('hasTelemetry')
    expect(src).toContain('registered but not yet instrumented')
  })

  it('TC-AMAP-09: recent-run rows link to the existing trace route', () => {
    const src = readSrc(PROFILE_PAGE)
    expect(src).toContain('/settings/agent-monitor/${run.id}')
  })
})
