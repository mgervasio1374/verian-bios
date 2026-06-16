// mcm-v2 — Agent Map catalog. WORKFLOWS integrity + page/catalog source-reads.
// TC-AMC-01..10

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { WORKFLOWS, workflowsForAgent } from '@/modules/intelligence/agent-workflows'
import { AGENT_ROSTER } from '@/modules/intelligence/agent-roster'

const rosterKeys = new Set(AGENT_ROSTER.map(a => a.key))

describe('TC-AMC-01: every workflow agentKey exists in AGENT_ROSTER', () => {
  it('no typos / stale keys', () => {
    for (const wf of WORKFLOWS) {
      for (const key of wf.agentKeys) {
        expect(rosterKeys.has(key), `${wf.key}: ${key}`).toBe(true)
      }
    }
  })
})

describe('TC-AMC-02: workflowsForAgent(copywriting_agent) → email + sequence at step 2', () => {
  it('both flows, step 2', () => {
    const wfs = workflowsForAgent('copywriting_agent')
    const email = wfs.find(w => w.workflowKey === 'email')
    const seq   = wfs.find(w => w.workflowKey === 'sequence')
    expect(email?.step).toBe(2)
    expect(seq?.step).toBe(2)
  })
})

describe('TC-AMC-03: a cross-cutting agent returns its workflow with no step', () => {
  it('learning_agent → learning, crossCutting, no step', () => {
    const wfs = workflowsForAgent('learning_agent')
    const learning = wfs.find(w => w.workflowKey === 'learning')
    expect(learning).toBeTruthy()
    expect(learning!.crossCutting).toBe(true)
    expect(learning!.step).toBeUndefined()
  })

  it('governance agents are cross-cutting without a step', () => {
    const wfs = workflowsForAgent('execution_gate_agent')
    expect(wfs.some(w => w.workflowKey === 'governance' && w.crossCutting && w.step === undefined)).toBe(true)
  })
})

describe('TC-AMC-04: an agent in no workflow returns []', () => {
  it('a development agent is not in any operational workflow', () => {
    expect(workflowsForAgent('documentation_agent')).toEqual([])
  })

  it('unknown key → []', () => {
    expect(workflowsForAgent('no_such_agent')).toEqual([])
  })
})

describe('TC-AMC-05: first email agent is step 1', () => {
  it('message_strategy_agent is step 1 in email + sequence', () => {
    const wfs = workflowsForAgent('message_strategy_agent')
    expect(wfs.find(w => w.workflowKey === 'email')?.step).toBe(1)
    expect(wfs.find(w => w.workflowKey === 'sequence')?.step).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Page + catalog source-reads
// ---------------------------------------------------------------------------

const PAGE = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'map', 'page.tsx')
const CATALOG = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'map', 'AgentCatalog.tsx')

describe('TC-AMC-06: map page is gated crm.companies.view + maps over the full roster', () => {
  const src = readFileSync(PAGE, 'utf8')
  it('gated', () => {
    expect(src).toContain("requirePermission(ctx, 'crm.companies.view')")
  })
  it('iterates AGENT_ROSTER (not a hardcoded subset)', () => {
    expect(src).toContain('AGENT_ROSTER.map(')
  })
  it('imports workflowsForAgent + assembles responsibility/skillCount', () => {
    expect(src).toContain('workflowsForAgent')
    expect(src).toContain('responsibility')
    expect(src).toContain('skillCount')
  })
  it('responsibility falls back registry → curated → label', () => {
    expect(src).toContain('REGISTRY[row.key]?.description ?? AGENT_RESPONSIBILITY[row.key] ?? row.label')
  })
  it('loads seed + learned skills', () => {
    expect(src).toContain('getAllSkillDefinitions()')
    expect(src).toContain('listLearnedSkills(ctx.tenantId)')
  })
})

describe('TC-AMC-07: catalog reuses the format helpers + legend/highlight state', () => {
  const src = readFileSync(CATALOG, 'utf8')
  it('imports IMPL/CATEGORY format helpers', () => {
    expect(src).toContain("from '../agent-roster-format'")
    expect(src).toContain('IMPL_VARIANT')
    expect(src).toContain('CATEGORY_ORDER')
  })
  it('has legend-highlight state', () => {
    expect(src).toContain('useState')
    expect(src).toContain('setSelected')
    expect(src).toContain('isHighlighted')
  })
  it('cross-cutting cards stay highlighted', () => {
    expect(src).toContain('w.crossCutting')
  })
})

describe('TC-AMC-08: skills + traces links target the agent profile route', () => {
  const src = readFileSync(CATALOG, 'utf8')
  it('profile href + both link labels', () => {
    expect(src).toContain('/settings/agent-monitor/agent/${a.key}')
    expect(src).toContain('no skills yet')
    expect(src).toContain('Traces')
  })
  it('empty-workflow agents show a muted note', () => {
    expect(src).toContain('not in an operational workflow')
  })
})

describe('TC-AMC-09: agent-monitor page links to the map', () => {
  it('has the View agent map link', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'page.tsx'),
      'utf8',
    )
    expect(src).toContain('/settings/agent-monitor/map')
    expect(src).toContain('View agent map')
  })
})

describe('TC-AMC-10: workflow colors are defined per spec', () => {
  it('intake/email/sequence/statement carry their hex colors', () => {
    const byKey = Object.fromEntries(WORKFLOWS.map(w => [w.key, w.color]))
    expect(byKey.intake).toBe('#378ADD')
    expect(byKey.email).toBe('#1D9E75')
    expect(byKey.sequence).toBe('#7F77DD')
    expect(byKey.statement).toBe('#D85A30')
    expect(WORKFLOWS.find(w => w.key === 'governance')?.crossCutting).toBe(true)
    expect(WORKFLOWS.find(w => w.key === 'learning')?.crossCutting).toBe(true)
  })
})
