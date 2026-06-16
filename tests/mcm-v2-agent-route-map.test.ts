// mcm-v2 — Agent route-map SVG (1b). Source-read: routes per workflow, colors from
// colorByWorkflow (not re-hardcoded), arrow marker, selected-route highlight, and
// AgentCatalog wiring. TC-ARM-01..07

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'map')
const routeMap = readFileSync(join(DIR, 'RouteMap.tsx'), 'utf8')
const catalog  = readFileSync(join(DIR, 'AgentCatalog.tsx'), 'utf8')

describe('TC-ARM-01: defines a polyline route for each non-cross-cutting workflow', () => {
  it('intake/email/sequence/statement routes present', () => {
    for (const key of ['intake', 'email', 'sequence', 'statement']) {
      expect(routeMap).toContain(`${key}:`)
    }
    expect(routeMap).toContain('<polyline')
  })
})

describe('TC-ARM-02: route stroke colors resolve from colorByWorkflow (not re-hardcoded)', () => {
  it('uses stroke={colorByWorkflow[...]}', () => {
    expect(routeMap).toContain('stroke={colorByWorkflow[key]}')
  })
  it('does not hardcode the workflow hex colors in the SVG', () => {
    expect(routeMap).not.toContain('#378ADD')
    expect(routeMap).not.toContain('#1D9E75')
    expect(routeMap).not.toContain('#7F77DD')
    expect(routeMap).not.toContain('#D85A30')
  })
})

describe('TC-ARM-03: exact route geometry', () => {
  it('email + statement polylines match the curated points', () => {
    expect(routeMap).toContain('292,86 538,86 538,140 567,140 567,262 567,312 361,312 361,327')
    expect(routeMap).toContain('144,278 468,278 490,278 490,190 509,190')
    expect(routeMap).toContain('144,86 173,86')          // intake
    expect(routeMap).toContain('384,102 384,158 444,174 509,174') // sequence
  })
})

describe('TC-ARM-04: includes the arrow marker', () => {
  it('marker def + marker-end usage', () => {
    expect(routeMap).toContain('<marker id="arrow"')
    expect(routeMap).toContain('markerEnd="url(#arrow)"')
  })
})

describe('TC-ARM-05: selected route is lit, the others dim to 0.2', () => {
  it('opacity reduced for non-selected routes', () => {
    expect(routeMap).toContain('opacity={dimOthers && selected !== key ? 0.2 : 1}')
    // dimOthers is true only when a ROUTE workflow is selected → cross-cutting/null leave all lit
    expect(routeMap).toContain('ROUTE_KEYS')
  })
})

describe('TC-ARM-06: stations use neutral c-gray + class="t" labels (dark-mode safe)', () => {
  it('no workflow hex on stations', () => {
    expect(routeMap).toContain('className="c-gray"')
    expect(routeMap).toContain('className="t"')
  })
  it('viewBox is the curated canvas', () => {
    expect(routeMap).toContain('viewBox="0 0 680 372"')
  })
})

describe('TC-ARM-07: AgentCatalog renders RouteMap with selected + colorByWorkflow from workflows', () => {
  it('imports + renders RouteMap', () => {
    expect(catalog).toContain("import { RouteMap } from './RouteMap'")
    expect(catalog).toContain('<RouteMap selected={selected}')
    expect(catalog).toContain('Object.fromEntries(workflows.map(w => [w.key, w.color]))')
  })
  it('adds the caption under the map', () => {
    expect(catalog).toContain('Stations group related agents; see the catalog below for every agent.')
  })
})
