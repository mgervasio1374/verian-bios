/**
 * Phase 3W Slice 2 — Company Edit Controls: Workspace Scoping Tests
 *
 * Verifies that:
 * - companyRepo.getCompany and updateCompany filter by workspace_id
 * - companyService passes ctx.workspaceId into all repo get/update/delete calls
 * - updateCompanyFromDialogAction is implemented (typed variant)
 * - updateCompanySchema includes status and address_line2
 * - CompanyEditDialog component exists
 *
 * Pattern: source-reading tier (fs.readFileSync + text assertions)
 * No Supabase mocking. No LLM calls. No sends.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { updateCompanySchema } from '../schemas/company.schema'

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n')
}

const COMPANY_REPO    = 'modules/crm/repositories/company.repo.ts'
const COMPANY_SERVICE = 'modules/crm/services/company.service.ts'
const COMPANY_ACTIONS = 'modules/crm/actions/company.actions.ts'
const COMPANY_SCHEMA  = 'schemas/company.schema.ts'
const EDIT_DIALOG     = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'

// ---------------------------------------------------------------------------
// TC-3W-S2-001: Repository — getCompany filters by workspace_id
// ---------------------------------------------------------------------------

describe('TC-3W-S2-001: companyRepo.getCompany includes workspace_id filter', () => {
  it('getCompany signature includes workspaceId parameter', () => {
    const src = readSrc(COMPANY_REPO)
    expect(src).toContain('getCompany(id: string, tenantId: string, workspaceId: string)')
  })

  it('getCompany query chain includes .eq(workspace_id) filter', () => {
    const src = readSrc(COMPANY_REPO)
    // Verify the workspace_id eq filter is present in getCompany
    // The filter must appear between the function definition and the .single() call
    const getCompanyBlock = src.slice(
      src.indexOf('export async function getCompany'),
      src.indexOf('export async function createCompany')
    )
    expect(getCompanyBlock).toContain(".eq('workspace_id', workspaceId)")
  })

  it('getCompany still filters by tenant_id and deleted_at', () => {
    const src = readSrc(COMPANY_REPO)
    const getCompanyBlock = src.slice(
      src.indexOf('export async function getCompany'),
      src.indexOf('export async function createCompany')
    )
    expect(getCompanyBlock).toContain(".eq('tenant_id', tenantId)")
    expect(getCompanyBlock).toContain(".is('deleted_at', null)")
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-002: Repository — updateCompany filters by workspace_id
// ---------------------------------------------------------------------------

describe('TC-3W-S2-002: companyRepo.updateCompany includes workspace_id filter', () => {
  it('updateCompany signature includes workspaceId parameter', () => {
    const src = readSrc(COMPANY_REPO)
    expect(src).toContain('workspaceId: string,\n  data: CompanyUpdate')
  })

  it('updateCompany query chain includes .eq(workspace_id) filter', () => {
    const src = readSrc(COMPANY_REPO)
    const updateBlock = src.slice(
      src.indexOf('export async function updateCompany'),
      src.indexOf('export async function countCompanies')
    )
    expect(updateBlock).toContain(".eq('workspace_id', workspaceId)")
  })

  it('updateCompany still filters by tenant_id and deleted_at', () => {
    const src = readSrc(COMPANY_REPO)
    const updateBlock = src.slice(
      src.indexOf('export async function updateCompany'),
      src.indexOf('export async function countCompanies')
    )
    expect(updateBlock).toContain(".eq('tenant_id', tenantId)")
    expect(updateBlock).toContain(".is('deleted_at', null)")
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-003: Service — passes ctx.workspaceId to repository calls
// ---------------------------------------------------------------------------

describe('TC-3W-S2-003: companyService passes ctx.workspaceId into repo calls', () => {
  it('service getCompany passes ctx.workspaceId as third argument to repo', () => {
    const src = readSrc(COMPANY_SERVICE)
    expect(src).toContain('companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)')
  })

  it('service updateCompany passes ctx.workspaceId as third argument to repo', () => {
    const src = readSrc(COMPANY_SERVICE)
    expect(src).toContain('companyRepo.updateCompany(id, ctx.tenantId, ctx.workspaceId,')
  })

  it('service deleteCompany also passes ctx.workspaceId to repo getCompany (existence check)', () => {
    const src = readSrc(COMPANY_SERVICE)
    // deleteCompany calls getCompany for existence check — must use workspace scope too
    const deleteBlock = src.slice(
      src.indexOf('export async function deleteCompany'),
      src.indexOf('export async function countCompanies')
    )
    expect(deleteBlock).toContain('companyRepo.getCompany(id, ctx.tenantId, ctx.workspaceId)')
  })

  it('service getCompany throws NotFoundError when repo returns null (cross-workspace safe failure)', () => {
    const src = readSrc(COMPANY_SERVICE)
    const getBlock = src.slice(
      src.indexOf('export async function getCompany'),
      src.indexOf('export async function createCompany')
    )
    expect(getBlock).toContain('throw new NotFoundError')
  })

  it('service preserves crm.companies.edit permission check for updateCompany', () => {
    const src = readSrc(COMPANY_SERVICE)
    const updateBlock = src.slice(
      src.indexOf('export async function updateCompany'),
      src.indexOf('export async function deleteCompany')
    )
    expect(updateBlock).toContain("requirePermission(ctx, 'crm.companies.edit')")
  })

  it('service preserves company.updated workflow event enqueue', () => {
    const src = readSrc(COMPANY_SERVICE)
    const updateBlock = src.slice(
      src.indexOf('export async function updateCompany'),
      src.indexOf('export async function deleteCompany')
    )
    expect(updateBlock).toContain("enqueueEvent(ctx, 'company.updated'")
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-004: Schema — status and address_line2 added
// ---------------------------------------------------------------------------

describe('TC-3W-S2-004: company schema includes status and address_line2', () => {
  it('createCompanySchema source includes status field', () => {
    const src = readSrc(COMPANY_SCHEMA)
    expect(src).toContain('status')
    expect(src).toContain("z.enum(['active', 'inactive', 'prospect', 'churned'])")
  })

  it('createCompanySchema source includes address_line2 field', () => {
    const src = readSrc(COMPANY_SCHEMA)
    expect(src).toContain('address_line2')
  })

  it('updateCompanySchema (partial) accepts valid status value at runtime', () => {
    const result = updateCompanySchema.safeParse({ status: 'active' })
    expect(result.success).toBe(true)
  })

  it('updateCompanySchema rejects invalid status value at runtime', () => {
    const result = updateCompanySchema.safeParse({ status: 'unknown_status' })
    expect(result.success).toBe(false)
  })

  it('updateCompanySchema accepts address_line2 at runtime', () => {
    const result = updateCompanySchema.safeParse({ address_line2: 'Suite 400' })
    expect(result.success).toBe(true)
  })

  it('updateCompanySchema accepts null address_line2 at runtime', () => {
    const result = updateCompanySchema.safeParse({ address_line2: null })
    expect(result.success).toBe(true)
  })

  it('updateCompanySchema allows status to be omitted (optional)', () => {
    const result = updateCompanySchema.safeParse({ name: 'Acme Corp' })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-005: Actions — typed updateCompanyFromDialogAction exists
// ---------------------------------------------------------------------------

describe('TC-3W-S2-005: updateCompanyFromDialogAction implemented in actions', () => {
  it('updateCompanyFromDialogAction is exported from company.actions.ts', () => {
    const src = readSrc(COMPANY_ACTIONS)
    expect(src).toContain('export async function updateCompanyFromDialogAction')
  })

  it('updateCompanyFromDialogAction takes id and typed input object', () => {
    const src = readSrc(COMPANY_ACTIONS)
    expect(src).toContain('updateCompanyFromDialogAction(\n  id: string,')
  })

  it('updateCompanyFromDialogAction calls companyService.updateCompany', () => {
    const src = readSrc(COMPANY_ACTIONS)
    const block = src.slice(src.indexOf('export async function updateCompanyFromDialogAction'), src.indexOf('export async function deleteCompanyAction'))
    expect(block).toContain('companyService.updateCompany(ctx, id,')
  })

  it('updateCompanyFromDialogAction revalidates list page', () => {
    const src = readSrc(COMPANY_ACTIONS)
    const block = src.slice(src.indexOf('export async function updateCompanyFromDialogAction'), src.indexOf('export async function deleteCompanyAction'))
    expect(block).toContain("revalidatePath('/[workspaceSlug]/companies'")
  })

  it('updateCompanyFromDialogAction revalidates detail page', () => {
    const src = readSrc(COMPANY_ACTIONS)
    const block = src.slice(src.indexOf('export async function updateCompanyFromDialogAction'), src.indexOf('export async function deleteCompanyAction'))
    expect(block).toContain("revalidatePath('/[workspaceSlug]/companies/[id]'")
  })

  it('original updateCompanyAction (FormData variant) is preserved', () => {
    const src = readSrc(COMPANY_ACTIONS)
    expect(src).toContain('export async function updateCompanyAction(')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-006: UI — CompanyEditDialog exists and uses correct action
// ---------------------------------------------------------------------------

describe('TC-3W-S2-006: CompanyEditDialog component exists and is wired correctly', () => {
  it('CompanyEditDialog.tsx file exists', () => {
    const filePath = path.join(ROOT, EDIT_DIALOG)
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('CompanyEditDialog is a client component', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).toMatch(/^'use client'/)
  })

  it('CompanyEditDialog calls updateCompanyFromDialogAction', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).toContain('updateCompanyFromDialogAction')
  })

  it('CompanyEditDialog includes status field', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).toContain('status')
    expect(src).toContain('STATUS_OPTIONS')
  })

  it('CompanyEditDialog includes address_line2 field', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).toContain('address_line2')
  })

  it('CompanyEditDialog does not import or reference send/approval actions', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).not.toContain('sendFollowUpDraft')
    expect(src).not.toContain('approveRequest')
    expect(src).not.toContain('approveAndSend')
    expect(src).not.toContain('campaign')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-007: Detail page — imports and renders CompanyEditDialog
// ---------------------------------------------------------------------------

describe('TC-3W-S2-007: company detail page renders CompanyEditDialog', () => {
  it('page.tsx imports CompanyEditDialog', () => {
    const src = readSrc(DETAIL_PAGE)
    expect(src).toContain("import { CompanyEditDialog } from './CompanyEditDialog'")
  })

  it('page.tsx renders <CompanyEditDialog company={company} />', () => {
    const src = readSrc(DETAIL_PAGE)
    expect(src).toContain('<CompanyEditDialog company={company}')
  })
})

// ---------------------------------------------------------------------------
// TC-3W-S2-008: Safety boundary — no send/gate/migration code introduced
// ---------------------------------------------------------------------------

describe('TC-3W-S2-008: Slice 2 safety boundary — no send/gate/migration code', () => {
  it('CompanyEditDialog does not reference EMAIL_SENDING_ENABLED', () => {
    const src = readSrc(EDIT_DIALOG)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('company.actions.ts updateCompanyFromDialogAction does not call send actions', () => {
    const src = readSrc(COMPANY_ACTIONS)
    const block = src.slice(src.indexOf('export async function updateCompanyFromDialogAction'), src.indexOf('export async function deleteCompanyAction'))
    expect(block).not.toContain('sendFollowUpDraft')
    expect(block).not.toContain('approveAndSend')
    expect(block).not.toContain('approveRequest')
  })

  it('company.service.ts updateCompany does not reference system_controls', () => {
    const src = readSrc(COMPANY_SERVICE)
    const updateBlock = src.slice(
      src.indexOf('export async function updateCompany'),
      src.indexOf('export async function deleteCompany')
    )
    expect(updateBlock).not.toContain('system_controls')
    expect(updateBlock).not.toContain('EMAIL_SENDING')
  })
})
