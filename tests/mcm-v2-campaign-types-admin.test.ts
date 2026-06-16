// mcm-v2 — Campaign Types admin CRUD (A2). Management service + actions + page +
// sidebar + active-filter wiring. TC-A2-01..08

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { slugifyCampaignTypeName } from '@/modules/campaign-sequence/services/campaign-type-management.service'

const ROOT = join(__dirname, '..')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }

const MGMT    = 'modules/campaign-sequence/services/campaign-type-management.service.ts'
const ACTIONS = 'modules/campaign-sequence/actions/campaign-type.actions.ts'
const PAGE    = 'app/(workspace)/[workspaceSlug]/settings/campaign-types/page.tsx'
const LIST    = 'app/(workspace)/[workspaceSlug]/settings/campaign-types/CampaignTypeList.tsx'
const FORM    = 'app/(workspace)/[workspaceSlug]/settings/campaign-types/NewCampaignTypeForm.tsx'
const READ_SVC = 'modules/campaign-sequence/services/campaign-type.service.ts'

describe('TC-A2-01: management service exports the writes + slugify, all gated', () => {
  const src = read(MGMT)
  it('exports the four functions', () => {
    expect(src).toContain('export function slugifyCampaignTypeName')
    expect(src).toContain('export async function createCampaignType')
    expect(src).toContain('export async function updateCampaignTypeDetails')
    expect(src).toContain('export async function setCampaignTypeStatus')
  })
  it('each write references the manage_templates gate', () => {
    const gates = (src.match(/requirePermission\(ctx, 'messaging\.manage_templates'\)/g) ?? []).length
    expect(gates).toBeGreaterThanOrEqual(3)
  })
})

describe('TC-A2-02: slugifyCampaignTypeName behavioral', () => {
  it('normalizes names to slugs', () => {
    expect(slugifyCampaignTypeName('Check In')).toBe('check_in')
    expect(slugifyCampaignTypeName('Proposal — Follow Up!')).toBe('proposal_follow_up')
    expect(slugifyCampaignTypeName('  Reactivation  ')).toBe('reactivation')
    expect(slugifyCampaignTypeName('')).toBe('')
    expect(slugifyCampaignTypeName('!!!')).toBe('')
  })
})

describe('TC-A2-03: create sets active + derives slug; update is name/desc only; status sets {status}', () => {
  const src = read(MGMT)
  it('create derives slug + active status', () => {
    expect(src).toContain('slugifyCampaignTypeName(name)')
    expect(src).toContain("status:            'active'")
  })
  it('update writes name + description, not slug/status', () => {
    const start = src.indexOf('export async function updateCampaignTypeDetails')
    const end   = src.indexOf('export async function setCampaignTypeStatus')
    const body  = src.slice(start, end)
    expect(body).toContain('name:')
    expect(body).toContain('description:')
    expect(body).not.toContain('slug:')
    expect(body).not.toContain('status:')
  })
  it('setCampaignTypeStatus writes { status }', () => {
    const start = src.indexOf('export async function setCampaignTypeStatus')
    const body  = src.slice(start)
    expect(body).toContain('{ status }')
  })
})

describe('TC-A2-04: actions export three actions + ActionResult + revalidate + friendly unique error', () => {
  const src = read(ACTIONS)
  it('exports the three actions', () => {
    expect(src).toContain('export async function createCampaignTypeAction')
    expect(src).toContain('export async function updateCampaignTypeAction')
    expect(src).toContain('export async function setCampaignTypeStatusAction')
  })
  it('ActionResult + revalidate + friendly error', () => {
    expect(src).toContain('export type ActionResult')
    expect(src).toContain("'/[workspaceSlug]/settings/campaign-types'")
    expect(src).toContain('revalidatePath(')
    expect(src).toContain('A campaign type with that name already exists.')
    expect(src).toContain('uq_campaign_types_active_slug')
  })
})

describe('TC-A2-05: page renders form + list; slug shown read-only', () => {
  it('page wires the children', () => {
    const src = read(PAGE)
    expect(src).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId })')
    expect(src).toContain('<NewCampaignTypeForm')
    expect(src).toContain('<CampaignTypeList')
  })
  it('list edit shows the slug read-only/disabled', () => {
    const list = read(LIST)
    expect(list).toMatch(/readOnly[\s\S]{0,40}disabled|disabled[\s\S]{0,40}readOnly/)
    expect(list).toContain('value={t.slug}')
  })
  it('new-form previews an auto-derived, read-only slug', () => {
    const form = read(FORM)
    expect(form).toContain('readOnly')
    expect(form).toContain('previewSlug')
  })
})

describe('TC-A2-06: sidebar links to campaign-types', () => {
  it('nav link present', () => {
    expect(read('components/layout/Sidebar.tsx')).toContain('/settings/campaign-types')
  })
})

describe('TC-A2-07: author pickers filter to active; resolution reads do not', () => {
  it('the three author sites pass status: active', () => {
    const detail = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx')
    const list   = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx')
    const seq    = read('app/(workspace)/[workspaceSlug]/settings/campaign-sequences/page.tsx')
    expect((detail.match(/status: 'active'/g) ?? []).length).toBeGreaterThanOrEqual(2) // both branches
    expect(list).toContain("status: 'active'")
    expect(seq).toContain("status: 'active'")
  })
  it('resolution reads are NOT over-filtered (no status arg)', () => {
    const companies = read('app/(workspace)/[workspaceSlug]/companies/page.tsx')
    const lead      = read('app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx')
    expect(companies).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId })')
    expect(lead).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId })')
  })
})

describe('TC-A2-08: the read-only campaign-type.service stays write-free', () => {
  it('no create/update/delete exports + no direct mutations', () => {
    const src = read(READ_SVC)
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+(create|update|delete|insert)/i)
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
  })
})
