// #24 asset editor Save→library + Cancel, and #27 self-service account settings.
// vitest is node (no DOM renderer) → UI is source-read; the pure password
// validator is unit-tested behaviorally.
//
// TC-AUX-01..06

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validatePasswordChange } from '@/app/(workspace)/[workspaceSlug]/settings/account/password-validation'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const EDITOR  = 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetEditor.tsx'
const FORM    = 'app/(workspace)/[workspaceSlug]/settings/account/AccountSettingsForm.tsx'
const PAGE    = 'app/(workspace)/[workspaceSlug]/settings/account/page.tsx'
const SIDEBAR = 'components/layout/Sidebar.tsx'

// ---------------------------------------------------------------------------
// TC-AUX-01: #24 asset editor — Save returns to library
// ---------------------------------------------------------------------------

describe('TC-AUX-01: asset editor edit-save returns to the library (source-read)', () => {
  const src = read(EDITOR)

  it('the edit-save branch navigates to the library, not router.refresh()', () => {
    expect(src).toContain('await updateAssetContentAction(workspaceSlug, assetId, content)')
    expect(src).toContain('router.push(`/${workspaceSlug}/settings/campaign-assets`)')
    expect(src).not.toContain('router.refresh()')
  })

  it('the create branch still lands on the new asset detail', () => {
    expect(src).toContain('router.push(`/${workspaceSlug}/settings/campaign-assets/${result.assetId}`)')
  })
})

// ---------------------------------------------------------------------------
// TC-AUX-02: #24 asset editor — Cancel control
// ---------------------------------------------------------------------------

describe('TC-AUX-02: asset editor Cancel returns without saving (source-read)', () => {
  const src = read(EDITOR)

  it('handleCancel routes to the library and does not save', () => {
    const idx  = src.indexOf('function handleCancel')
    const body = src.slice(idx, idx + 220)
    expect(idx).toBeGreaterThan(-1)
    expect(body).toContain('router.push(`/${workspaceSlug}/settings/campaign-assets`)')
    expect(body).not.toContain('updateAssetContentAction')
    expect(body).not.toContain('createHumanAssetAction')
  })

  it('a Cancel button is wired to handleCancel and disabled while pending', () => {
    expect(src).toContain('onClick={handleCancel}')
    // the Cancel button carries disabled={pending}
    const btnIdx = src.indexOf('onClick={handleCancel}')
    expect(src.slice(btnIdx, btnIdx + 160)).toContain('disabled={pending}')
    expect(src).toContain('>\n            Cancel\n          </button>')
  })
})

// ---------------------------------------------------------------------------
// TC-AUX-03: #27 password validation (behavioral)
// ---------------------------------------------------------------------------

describe('TC-AUX-03: validatePasswordChange (behavioral)', () => {
  it('too-short new password → error', () => {
    const r = validatePasswordChange('short', 'short')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('at least 8')
  })

  it('mismatch → error', () => {
    const r = validatePasswordChange('longenough1', 'longenough2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('do not match')
  })

  it('valid (≥8 + match) → ok', () => {
    expect(validatePasswordChange('longenough1', 'longenough1')).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// TC-AUX-04: #27 ChangePasswordForm flow (source-read)
// ---------------------------------------------------------------------------

describe('TC-AUX-04: ChangePasswordForm re-auth-then-update flow (source-read)', () => {
  const src = read(FORM)

  it('validates before any auth call (guard returns before startTransition)', () => {
    const validateIdx = src.indexOf('validatePasswordChange(newPassword, confirm)')
    const transitionIdx = src.indexOf('startTransition(async () => {', validateIdx)
    expect(validateIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeLessThan(transitionIdx)
    expect(src).toContain('if (!validation.ok)')
  })

  it('re-authenticates with the current password BEFORE updating it', () => {
    const reauthIdx = src.indexOf('signInWithPassword({ email, password: current })')
    const updateIdx = src.indexOf('updateUser({ password: newPassword })')
    expect(reauthIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(reauthIdx).toBeLessThan(updateIdx)
    expect(src).toContain('Current password is incorrect.')
    expect(src).toContain('Password updated')
  })

  it('the profile section saves the display name via updateUser data.full_name', () => {
    expect(src).toContain('updateUser({ data: { full_name: fullName.trim() } })')
    expect(src).toContain('readOnly') // email is read-only
  })
})

// ---------------------------------------------------------------------------
// TC-AUX-05: #27 account page loads the user
// ---------------------------------------------------------------------------

describe('TC-AUX-05: account page server component (source-read)', () => {
  const src = read(PAGE)

  it('loads the current user and passes email + full_name to the form', () => {
    expect(src).toContain('supabase.auth.getUser()')
    expect(src).toContain('user?.email')
    expect(src).toContain('user_metadata?.full_name')
    expect(src).toContain('<AccountSettingsForm')
    expect(src).toContain('email={email}')
    expect(src).toContain('initialFullName={fullName}')
  })
})

// ---------------------------------------------------------------------------
// TC-AUX-06: #27 Sidebar Account entry
// ---------------------------------------------------------------------------

describe('TC-AUX-06: Sidebar Account entry under ADMIN (source-read)', () => {
  const src = read(SIDEBAR)

  it('adds an Account nav item to /settings/account with the UserCircle icon', () => {
    expect(src).toContain("label: 'Account'")
    expect(src).toContain('/settings/account')
    expect(src).toContain('UserCircle')
  })
})
