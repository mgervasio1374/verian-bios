// CRM — Slice U5: manual document upload on the company Documents card
// TC-U5-01 through TC-U5-03
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const ACTIONS     = 'modules/artifacts/actions/company-document.actions.ts'
const FORM        = 'app/(workspace)/[workspaceSlug]/companies/[id]/UploadDocumentForm.tsx'
const DETAIL_PAGE = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'

// ---------------------------------------------------------------------------
// TC-U5-01: action validation + storage path
// ---------------------------------------------------------------------------

describe('TC-U5-01: uploadCompanyDocumentAction validation (source-read)', () => {
  const actions = read(ACTIONS)

  it('uses the statement-route MIME whitelist and 20 MB cap', () => {
    for (const mime of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]) {
      expect(actions).toContain(`'${mime}'`)
    }
    expect(actions).toContain('const MAX_FILE_BYTES = 20 * 1024 * 1024')
    expect(actions).toContain('ALLOWED_MIME_TYPES.has(mimeType)')
    expect(actions).toContain('file.size > MAX_FILE_BYTES')
  })

  it('verifies the company in tenant/workspace scope before uploading', () => {
    expect(actions).toContain('companyService.getCompany(ctx, companyId)')
  })

  it('uses an existing permission rather than inventing one', () => {
    expect(actions).toContain("requirePermission(ctx, 'crm.companies.edit')")
  })

  it('sanitizes the filename (path separators and unsafe chars stripped)', () => {
    expect(actions).toContain('function sanitizeFileName')
    expect(actions).toContain('replace(/[\\\\/]/g')
    expect(actions).toContain('replace(/[^a-zA-Z0-9._-]/g')
  })

  it('uploads to the artifacts bucket under the tenant/company path', () => {
    expect(actions).toContain("const STORAGE_BUCKET = 'artifacts'")
    expect(actions).toContain('`${ctx.tenantId}/companies/${companyId}/${Date.now()}-${sanitizedFileName}`')
    expect(actions).toContain('.upload(storagePath, bytes, { contentType: mimeType, upsert: false })')
  })
})

// ---------------------------------------------------------------------------
// TC-U5-02: records via the existing service, revalidates
// ---------------------------------------------------------------------------

describe('TC-U5-02: artifact record via recordCompanyDocument (source-read)', () => {
  const actions = read(ACTIONS)

  it('imports and calls recordCompanyDocument', () => {
    expect(actions).toContain(
      "import { recordCompanyDocument } from '@/modules/artifacts/services/company-document.service'"
    )
    expect(actions).toContain('recordCompanyDocument({')
  })

  it('uses the existing document type (other), not an invented one', () => {
    expect(actions).toContain("artifactType:  'other'")
  })

  it('does not raw-insert into artifacts', () => {
    expect(actions).not.toContain(".from('artifacts')")
  })

  it('revalidates the company detail page', () => {
    expect(actions).toContain("revalidatePath('/[workspaceSlug]/companies/[id]', 'page')")
  })
})

// ---------------------------------------------------------------------------
// TC-U5-03: form wiring in the Documents card
// ---------------------------------------------------------------------------

describe('TC-U5-03: UploadDocumentForm wiring (source-read)', () => {
  const form = read(FORM)
  const page = read(DETAIL_PAGE)

  it('file input accept mirrors the whitelist', () => {
    expect(form).toContain("'application/pdf'")
    expect(form).toContain("'text/csv'")
    expect(form).toContain('accept={ACCEPT}')
  })

  it('submits FormData to the action with companyId and optional description', () => {
    expect(form).toContain('uploadCompanyDocumentAction(formData)')
    expect(form).toContain("formData.set('companyId', companyId)")
    expect(form).toContain("formData.set('description', description.trim())")
  })

  it('clears and refreshes on success; shows errors inline', () => {
    expect(form).toContain('router.refresh()')
    expect(form).toContain('setError(result.error)')
  })

  it('renders in the Documents card header', () => {
    expect(page).toContain('<UploadDocumentForm companyId={id} />')
  })
})
