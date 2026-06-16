// mcm-v2 — Company Activity panel on the company detail page. Mirrors the
// LeadActivityTimeline structure (source-read) and verifies the component renders
// event labels / empty state by invoking it directly (pure function, node env).
// TC-CAP-01..04

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { CompanyActivityTimeline } from '@/app/(workspace)/[workspaceSlug]/companies/[id]/CompanyActivityTimeline'

const COMPONENT = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyActivityTimeline.tsx'
const PAGE      = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

// Collect all string leaves from a React element tree.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(node: any): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && node.props) {
    const children = node.props.children
    return textOf(children)
  }
  return ''
}

// Render the component (it's a plain server component fn) to a React element and
// flatten its text. createElement avoids JSX-in-test transform concerns.
function renderText(events: unknown[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = CompanyActivityTimeline({ events: events as any })
  return textOf(el)
}

describe('TC-CAP-01: component mirrors LeadActivityTimeline structure', () => {
  const src = read(COMPONENT)
  it('is a server component with the shared labels/colors + relative-time', () => {
    expect(src).not.toContain("'use client'")
    expect(src).toContain('EVENT_LABELS')
    expect(src).toContain('OUTCOME_COLORS')
    expect(src).toContain('formatRelativeTime')
    expect(src).toContain('ActivityEventRow')
  })
  it('uses the Company Activity title + empty-state copy', () => {
    expect(src).toContain('Company Activity')
    expect(src).toContain('No activity recorded yet for this company.')
  })
})

describe('TC-CAP-02: empty state renders the company-specific copy', () => {
  it('renders the empty message when there are no events', () => {
    const text = renderText([])
    expect(text).toContain('No activity recorded yet for this company.')
  })
})

describe('TC-CAP-03: events render their human labels + summary', () => {
  it('maps event_type to a label and shows the summary', () => {
    const events = [
      { id: 'a', event_type: 'ET_SEND_SUCCEEDED', event_summary: 'to merchant@biz.com', occurred_at: new Date().toISOString() },
      { id: 'b', event_type: 'QUALITY_REVIEW_COMPLETED', event_summary: null, occurred_at: new Date().toISOString() },
    ]
    const text = renderText(events)
    expect(text).toContain('Email sent')
    expect(text).toContain('to merchant@biz.com')
    expect(text).toContain('Quality review completed')
    expect(text).not.toContain('No activity recorded')
  })
})

describe('TC-CAP-04: page wires the panel + 2-col layout without dropping cards', () => {
  const page = read(PAGE)
  it('loads company activity and renders the timeline in a right rail', () => {
    expect(page).toContain('listCompanyActivityEvents')
    expect(page).toContain('<CompanyActivityTimeline events={activityEvents}')
    expect(page).toContain('xl:grid-cols-3')
    expect(page).toContain('xl:col-span-2')
  })
  it('keeps the prior cards/forms intact', () => {
    expect(page).toContain('Company Details')
    expect(page).toContain('Savings Analysis')
    expect(page).toContain('<GenerateSavingsAnalysisForm')
    expect(page).toContain('<IngestStatementForm')
    expect(page).toContain('Documents')
  })
})
