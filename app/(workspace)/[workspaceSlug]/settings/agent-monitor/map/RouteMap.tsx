'use client'

// Curated transit-style overview of the agent layer. Neutral "stations" (agents,
// step groups, and non-agent steps like CRM/Approval/Send) with colored workflow
// routes converging on the shared approval→send spine. Route colors come from
// colorByWorkflow (sourced from WORKFLOWS) — never re-hardcoded here. Presentational
// only; shares AgentCatalog's selected legend state for route highlighting.

interface Props {
  selected:        string | null
  colorByWorkflow: Record<string, string>
}

// Only these workflows have a drawn route line. Cross-cutting flows (governance,
// learning) have no polyline, so selecting them leaves all routes at full opacity.
const ROUTE_KEYS = ['intake', 'email', 'sequence', 'statement'] as const

const ROUTES: Record<(typeof ROUTE_KEYS)[number], string> = {
  intake:    '144,86 173,86',
  email:     '292,86 538,86 538,140 567,140 567,262 567,312 361,312 361,327',
  sequence:  '384,102 384,158 444,174 509,174',
  statement: '144,278 468,278 490,278 490,190 509,190',
}

interface Station { x: number; y: number; w: number; h: number; label: string }

const STATIONS: Station[] = [
  { x: 40,  y: 70,  w: 104, h: 32, label: 'Web intake' },
  { x: 40,  y: 262, w: 104, h: 32, label: 'Manual ingest' },
  { x: 176, y: 70,  w: 124, h: 32, label: 'Leads & companies' },
  { x: 176, y: 262, w: 140, h: 32, label: 'Extraction + review' },
  { x: 324, y: 70,  w: 120, h: 32, label: 'Message strategy' },
  { x: 348, y: 262, w: 120, h: 32, label: 'Proposal' },
  { x: 324, y: 150, w: 120, h: 32, label: 'Scheduler' },
  { x: 476, y: 70,  w: 124, h: 32, label: 'Copywriting + QA' },
  { x: 512, y: 150, w: 110, h: 32, label: 'Approval' },
  { x: 512, y: 262, w: 110, h: 32, label: 'Send' },
  { x: 296, y: 330, w: 130, h: 32, label: 'Learning' },
]

export function RouteMap({ selected, colorByWorkflow }: Props) {
  // A route dims to 0.2 only when a DIFFERENT route workflow is selected.
  const dimOthers = selected != null && (ROUTE_KEYS as readonly string[]).includes(selected)

  return (
    <svg viewBox="0 0 680 372" role="img" className="w-full h-auto rounded-lg border" style={{ maxWidth: 680 }}>
      <title>Agent layer route map</title>
      <desc>
        Transit-style overview of the agent layer: lead intake and statement analysis feed message
        strategy, copywriting and QA, converging on the shared approval and send steps.
      </desc>

      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,5 L0,10" fill="none" stroke="context-stroke" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Routes first, stations on top */}
      {ROUTE_KEYS.map(key => (
        <polyline
          key={key}
          points={ROUTES[key]}
          fill="none"
          stroke={colorByWorkflow[key]}
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          opacity={dimOthers && selected !== key ? 0.2 : 1}
        />
      ))}

      {STATIONS.map(s => (
        <g key={s.label}>
          <rect
            x={s.x} y={s.y} width={s.w} height={s.h} rx="4"
            className="c-gray" strokeWidth="0.5"
          />
          <text x={s.x + s.w / 2} y={s.y + s.h / 2} className="t" textAnchor="middle" dominantBaseline="central">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
