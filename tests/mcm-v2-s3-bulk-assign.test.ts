// MCM v2 — Slice S3: bulk-assign campaign to selected companies' contacts
// TC-S3-01 through TC-S3-07
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const SERVICE = 'modules/messaging/services/campaign-assignment.service.ts'
const ACTIONS = 'modules/messaging/actions/campaign-assignment.actions.ts'
const PAGE    = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'
const TABLE   = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'

// ---------------------------------------------------------------------------
// TC-S3-01: activation emits are awaited — fire-and-forget IIFE pattern gone
// (same failure mode as Issue 008: Vercel freezes after the action returns)
// ---------------------------------------------------------------------------

describe('TC-S3-01: campaign.assignment_activated emits are awaited (source-read)', () => {
  const service = read(SERVICE)

  it('no fire-and-forget IIFE remains in the service', () => {
    expect(service).not.toContain(';(async () => {')
    expect(service).not.toContain('})().catch(() => null)')
  })

  it('create path awaits emitAssignmentActivated (non-fatal catch preserved; V2 added startsAt arg)', () => {
    expect(service).toContain(
      'await emitAssignmentActivated(row.id, row.campaign_sequence_id!, input.tenantId, input.workspaceId, row.starts_at ?? null).catch(() => null)'
    )
  })

  it('approve path awaits emitAssignmentActivated (non-fatal catch preserved)', () => {
    const approveIdx = service.indexOf('export async function approveProposedAssignment')
    expect(approveIdx).toBeGreaterThan(-1)
    const body = service.slice(approveIdx)
    expect(body).toContain('await emitAssignmentActivated(')
    expect(body).toContain(').catch(() => null)')
  })
})

// ---------------------------------------------------------------------------
// TC-S3-02: bulkAssignCampaignToCompanies — validation + cap
// ---------------------------------------------------------------------------

describe('TC-S3-02: bulk service validation (source-read)', () => {
  const service = read(SERVICE)

  it('exports bulkAssignCampaignToCompanies with the tally return type', () => {
    expect(service).toContain('export async function bulkAssignCampaignToCompanies')
    expect(service).toContain('Promise<BulkAssignTally>')
    for (const key of [
      'created',
      'skippedDuplicate',
      'skippedNoEmail',
      'skippedDoNotContact',
      'companiesWithNoContacts',
      'failed',
    ]) {
      expect(service).toContain(key)
    }
  })

  it('rejects an empty company list', () => {
    const idx  = service.indexOf('export async function bulkAssignCampaignToCompanies')
    const body = service.slice(idx, idx + 600)
    expect(body).toContain('companyIds.length === 0')
  })

  it('caps the batch at 100 with the friendly error', () => {
    expect(service).toContain('MAX_BULK_ASSIGN_COMPANIES = 100')
    expect(service).toContain('Assign at most ${MAX_BULK_ASSIGN_COMPANIES} companies at a time.')
  })
})

// ---------------------------------------------------------------------------
// TC-S3-03: server-side sequence/type resolution — no client-provided slug
// ---------------------------------------------------------------------------

describe('TC-S3-03: bulk service resolves the campaign type server-side (source-read)', () => {
  const service = read(SERVICE)
  const idx     = service.indexOf('export async function bulkAssignCampaignToCompanies')
  const body    = service.slice(idx, service.indexOf('// ---- approveProposedAssignment ----'))

  it('loads the sequence via getCampaignSequenceById scoped to tenant/workspace', () => {
    expect(body).toContain('getCampaignSequenceById(input.campaignSequenceId, input.tenantId, input.workspaceId)')
  })

  it('resolves the type slug via getCampaignTypeById and rejects if unresolvable', () => {
    expect(body).toContain('getCampaignTypeById(sequence.campaign_type_id')
    expect(body).toContain('Could not resolve the campaign type for this sequence.')
  })

  it('passes the resolved slug (not a client value) to createCampaignAssignment', () => {
    expect(body).toContain('campaignType:          campaignType.slug')
  })

  it('BulkAssignInput has no campaignType field — only the sequence id crosses the boundary', () => {
    const inputIdx  = service.indexOf('export interface BulkAssignInput')
    const inputBody = service.slice(inputIdx, service.indexOf('export interface BulkAssignTally'))
    expect(inputBody).not.toContain('campaignType')
    expect(inputBody).toContain('campaignSequenceId')
  })
})

// ---------------------------------------------------------------------------
// TC-S3-04: per-contact fan-out — contact-scoped, skip rules, batch resilience
// ---------------------------------------------------------------------------

describe('TC-S3-04: bulk service fan-out behavior (source-read)', () => {
  const service = read(SERVICE)
  const idx     = service.indexOf('export async function bulkAssignCampaignToCompanies')
  const body    = service.slice(idx, service.indexOf('// ---- approveProposedAssignment ----'))

  it('lists contacts per company via the crm contact repo', () => {
    expect(service).toContain("from '@/modules/crm/repositories/contact.repo'")
    expect(body).toContain('listContacts')
    expect(body).toContain('companyId')
  })

  it('tallies companies with no contacts', () => {
    expect(body).toContain('companiesWithNoContacts++')
  })

  it('skips contacts without email and do-not-contact contacts', () => {
    expect(body).toContain('!contact.email')
    expect(body).toContain('skippedNoEmail++')
    expect(body).toContain('contact.do_not_contact')
    expect(body).toContain('skippedDoNotContact++')
  })

  it('creates contact-scoped assignments — contactId set, no leadId', () => {
    expect(body).toContain('contactId:             contact.id')
    expect(body).not.toContain('leadId')
  })

  it('passes autoApproveFirstTouch and MANUAL source through', () => {
    expect(body).toContain('autoApproveFirstTouch: input.autoApproveFirstTouch')
    expect(body).toContain('ASSIGNMENT_SOURCE.MANUAL')
  })

  it('counts duplicates separately (contact-scoped dedup makes re-runs safe)', () => {
    expect(body).toContain("result.reason === 'duplicate'")
    expect(body).toContain('skippedDuplicate++')
  })

  it('wraps each contact in try/catch so one failure does not abort the batch', () => {
    expect(body).toContain('try {')
    expect(body).toContain('} catch {')
    expect(body).toContain('tally.failed++')
  })
})

// ---------------------------------------------------------------------------
// TC-S3-05: action — permission, validation, revalidation
// ---------------------------------------------------------------------------

describe('TC-S3-05: bulkAssignCampaignAction (source-read)', () => {
  const actions = read(ACTIONS)
  const idx     = actions.indexOf('export async function bulkAssignCampaignAction')
  const body    = actions.slice(idx, idx + 1500)

  it('exports bulkAssignCampaignAction returning ActionResult<BulkAssignTally>', () => {
    expect(idx).toBeGreaterThan(-1)
    expect(body).toContain('ActionResult<BulkAssignTally>')
  })

  it('uses the same permission as createManualAssignmentAction (crm.leads.view)', () => {
    expect(body).toContain("requirePermission(ctx, 'crm.leads.view')")
  })

  it('validates non-empty companies and sequence id', () => {
    expect(body).toContain('companyIds.length === 0')
    expect(body).toContain('Select at least one company.')
    expect(body).toContain('!campaignSequenceId')
  })

  it('revalidates the companies page', () => {
    expect(body).toContain("revalidatePath('/[workspaceSlug]/companies', 'page')")
  })
})

// ---------------------------------------------------------------------------
// TC-S3-06: companies page — sequence picker data + maxDuration
// ---------------------------------------------------------------------------

describe('TC-S3-06: companies page loads picker data (source-read)', () => {
  const page = read(PAGE)

  it('loads manual sequences and campaign types (Slice 10 pattern)', () => {
    expect(page).toContain('listManualSequencesForWorkspace(ctx.tenantId, ctx.workspaceId)')
    expect(page).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId })')
    expect(page).toContain('typeSlugById')
    expect(page).toContain('campaignTypeSlug')
  })

  it('passes sequences to CompaniesTable', () => {
    expect(page).toContain('sequences={sequences}')
  })

  it('sets maxDuration = 60 for bulk fan-out headroom', () => {
    expect(page).toContain('export const maxDuration = 60')
  })
})

// ---------------------------------------------------------------------------
// TC-S3-07: CompaniesTable — assign button, panel, pre-approved checkbox
// ---------------------------------------------------------------------------

describe('TC-S3-07: CompaniesTable assign-campaign UI (source-read)', () => {
  const table = read(TABLE)

  it('toolbar has the Assign campaign button toggling the panel', () => {
    expect(table).toContain('Assign campaign')
    expect(table).toContain('setShowAssignPanel')
  })

  it('panel has a sequence select showing name + type slug', () => {
    expect(table).toContain('Choose sequence…')
    expect(table).toContain('{s.name} ({s.campaignTypeSlug})')
  })

  it('shows a hint linking to campaign-sequences settings when no sequences exist', () => {
    expect(table).toContain('sequences.length === 0')
    expect(table).toContain('/settings/campaign-sequences')
  })

  it('has the pre-approved checkbox with helper text driving autoApproveFirstTouch', () => {
    expect(table).toContain('Pre-approved — skip first-touch approval')
    expect(table).toContain('All steps send automatically on schedule once sending is enabled.')
    expect(table).toContain('setPreApproved')
  })

  it('confirms via window.confirm with count, sequence name, and pre-approved flag', () => {
    const idx  = table.indexOf('function handleBulkAssign')
    const body = table.slice(idx, idx + 2500)
    expect(body).toContain('window.confirm')
    expect(body).toContain('sequence.name')
    expect(body).toContain('preApproved')
  })

  it('calls bulkAssignCampaignAction and renders the tally inline (V2 added startsAt)', () => {
    expect(table).toContain('bulkAssignCampaignAction(ids, assignSequenceId, preApproved, undefined, startsAt)')
    expect(table).toContain('Created ${t.created} assignment')
    expect(table).toContain('skippedDuplicate')
    expect(table).toContain('skippedNoEmail')
  })

  it('clears selection and refreshes on success', () => {
    const idx  = table.indexOf('function handleBulkAssign')
    const body = table.slice(idx, idx + 3000)
    expect(body).toContain('setSelectedIds(new Set())')
    expect(body).toContain('router.refresh()')
  })
})
