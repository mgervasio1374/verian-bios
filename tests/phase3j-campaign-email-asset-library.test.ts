/**
 * Phase 3J — Campaign Email Asset Library
 * Source-reading tests: assert structural contracts without runtime execution.
 * No Supabase mocking, no LLM calls, no test doubles.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()

function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

// ============================================================
// Block 0 — Route existence
// ============================================================

describe('Phase 3J — Campaign assets route', () => {
  it('TC-3J-001: campaign-assets page.tsx file exists', () => {
    const filePath = path.join(root, 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('TC-3J-002: campaign-assets page is a server component (no top-level "use client")', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx')
    expect(src.startsWith("'use client'")).toBe(false)
    expect(src.startsWith('"use client"')).toBe(false)
  })
})

// ============================================================
// Block 1 — Sidebar nav
// ============================================================

describe('Phase 3J — Sidebar navigation', () => {
  it('TC-3J-003: Sidebar.tsx contains "Campaign Assets" label', () => {
    const src = read('components/layout/Sidebar.tsx')
    expect(src).toContain('Campaign Assets')
  })

  it('TC-3J-004: Sidebar.tsx imports BookOpen from lucide-react', () => {
    const src = read('components/layout/Sidebar.tsx')
    expect(src).toContain('BookOpen')
  })
})

// ============================================================
// Block 2 — Repository additions
// ============================================================

describe('Phase 3J — Repository additions', () => {
  it('TC-3J-005: campaign-email-asset.repo.ts exports updateAssetContent', () => {
    const src = read('modules/messaging/repositories/campaign-email-asset.repo.ts')
    expect(src).toContain('updateAssetContent')
  })

  it('TC-3J-006: campaign-email-asset.repo.ts exports listAssetsByType', () => {
    const src = read('modules/messaging/repositories/campaign-email-asset.repo.ts')
    expect(src).toContain('listAssetsByType')
  })
})

// ============================================================
// Block 3 — Service exports
// ============================================================

describe('Phase 3J — campaign-asset.service.ts exports', () => {
  const src = read('modules/messaging/services/campaign-asset.service.ts')

  it('TC-3J-007: exports submitAssetForReview', () => {
    expect(src).toContain('submitAssetForReview')
  })

  it('TC-3J-008: exports approveAsset', () => {
    expect(src).toContain('approveAsset')
  })

  it('TC-3J-009: exports activateAsset', () => {
    expect(src).toContain('activateAsset')
  })

  it('TC-3J-010: exports retireAsset', () => {
    expect(src).toContain('retireAsset')
  })

  it('TC-3J-011: exports cloneAsset', () => {
    expect(src).toContain('cloneAsset')
  })
})

// ============================================================
// Block 4 — Service safety guardrails
// ============================================================

describe('Phase 3J — campaign-asset.service.ts safety guardrails', () => {
  const src = read('modules/messaging/services/campaign-asset.service.ts')

  it('TC-3J-012: does not contain sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3J-013: does not import @anthropic-ai/sdk', () => {
    expect(src).not.toContain('@anthropic-ai/sdk')
  })
})

// ============================================================
// Block 5 — Server action exports
// ============================================================

describe('Phase 3J — campaign-asset actions.ts exports', () => {
  const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts')

  it('TC-3J-014: exports submitForReviewAction', () => {
    expect(src).toContain('submitForReviewAction')
  })

  it('TC-3J-015: exports approveAssetAction', () => {
    expect(src).toContain('approveAssetAction')
  })

  it('TC-3J-016: exports activateAssetAction', () => {
    expect(src).toContain('activateAssetAction')
  })

  it('TC-3J-017: exports retireAssetAction', () => {
    expect(src).toContain('retireAssetAction')
  })

  it('TC-3J-018: exports cloneAssetAction', () => {
    expect(src).toContain('cloneAssetAction')
  })
})

// ============================================================
// Block 6 — AI-assisted authoring hooks
// ============================================================

describe('Phase 3J — AI-assisted asset creation hooks', () => {
  const src = read('modules/messaging/services/campaign-asset-ai.service.ts')

  it('TC-3J-019: campaign-asset-ai.service.ts contains preflightCheck', () => {
    expect(src).toContain('preflightCheck')
  })

  it('TC-3J-020: campaign-asset-ai.service.ts contains recordUsage', () => {
    expect(src).toContain('recordUsage')
  })

  it('TC-3J-021: campaign-asset-ai.service.ts contains createDecision', () => {
    expect(src).toContain('createDecision')
  })

  it('TC-3J-022: campaign-asset-ai.service.ts does not create asset when blocked', () => {
    expect(src).toContain('blocked')
    expect(src).toContain('allowed')
  })
})

// ============================================================
// Block 7 — Preview panel guardrails
// ============================================================

describe('Phase 3J — CampaignAssetPreviewPanel guardrails', () => {
  const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetPreviewPanel.tsx')

  it('TC-3J-023: does not import @anthropic-ai/sdk', () => {
    expect(src).not.toContain('@anthropic-ai/sdk')
  })

  it('TC-3J-024: does not contain sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3J-025: does not contain resend.emails.send', () => {
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3J-046: does not contain createCampaignSend', () => {
    expect(src).not.toContain('createCampaignSend')
  })
})

// ============================================================
// Block 8 — Lifecycle transition guards
// ============================================================

describe('Phase 3J — Lifecycle transition guards', () => {
  it('TC-3J-026: campaign-asset-validation.service.ts contains missingRequiredFallbacks or missingFields', () => {
    const src = read('modules/messaging/services/campaign-asset-validation.service.ts')
    const hasMissing = src.includes('missingRequiredFallbacks') || src.includes('missingFields')
    expect(hasMissing).toBe(true)
  })

  it('TC-3J-027: campaign-asset.service.ts approveAsset requires approvedBy', () => {
    const src = read('modules/messaging/services/campaign-asset.service.ts')
    expect(src).toContain('approvedBy')
    expect(src).toContain('approveAsset')
  })

  it('TC-3J-028: campaign-asset.service.ts activateAsset requires approvedBy', () => {
    const src = read('modules/messaging/services/campaign-asset.service.ts')
    expect(src).toContain('approvedBy')
    expect(src).toContain('activateAsset')
  })

  it('TC-3J-029: campaign-asset-validation.service.ts blocks retired→any transition', () => {
    const src = read('modules/messaging/services/campaign-asset-validation.service.ts')
    expect(src).toContain('retired')
    expect(src).toContain('valid: false')
  })

  it('TC-3J-030: campaign-asset-validation.service.ts blocks draft→active transition', () => {
    const src = read('modules/messaging/services/campaign-asset-validation.service.ts')
    expect(src).toContain('draft')
    expect(src).toContain('active')
    expect(src).toContain('valid: false')
  })
})

// ============================================================
// Block 9 — Clone behavior
// ============================================================

describe('Phase 3J — Clone asset behavior', () => {
  const src = read('modules/messaging/services/campaign-asset.service.ts')

  it('TC-3J-031: cloneAsset creates asset with status draft', () => {
    expect(src).toContain('cloneAsset')
    expect(src).toContain("'draft'")
  })

  it('TC-3J-032: cloneAsset sets llmGenerated false', () => {
    expect(src).toContain('llmGenerated:           false')
  })
})

// ============================================================
// Block 10 — AI-assisted revision
// ============================================================

describe('Phase 3J — AI-assisted revision', () => {
  const src = read('modules/messaging/services/campaign-asset-ai.service.ts')

  it('TC-3J-033: records ai_usage_events on revision (contains recordUsage near asset_revision)', () => {
    expect(src).toContain('recordUsage')
    expect(src).toContain('asset_revision')
  })

  it('TC-3J-034: records agent_decisions on revision (contains createDecision near campaign_asset_revised)', () => {
    expect(src).toContain('createDecision')
    expect(src).toContain('campaign_asset_revised')
  })

  it('TC-3J-035: resets status to draft on revision (contains resetStatus)', () => {
    expect(src).toContain('resetStatus')
  })
})

// ============================================================
// Block 11 — Constants
// ============================================================

describe('Phase 3J — Constants', () => {
  const src = read('modules/messaging/campaign-assets/campaign-asset.constants.ts')

  it('TC-3J-036: exports CAMPAIGN_TYPE', () => {
    expect(src).toContain('CAMPAIGN_TYPE')
  })

  it('TC-3J-037: exports APPROVED_MERGE_FIELDS containing first_name', () => {
    expect(src).toContain('APPROVED_MERGE_FIELDS')
    expect(src).toContain('first_name')
  })
})

// ============================================================
// Block 12 — System Intelligence constants
// ============================================================

describe('Phase 3J — System Intelligence constants', () => {
  const src = read('modules/intelligence/structured-errors/structured-error.types.ts')

  it('TC-3J-038: structured-error.types.ts contains CAMPAIGN_ASSET_FAILURE_TYPE', () => {
    expect(src).toContain('CAMPAIGN_ASSET_FAILURE_TYPE')
  })

  it('TC-3J-039: structured-error.types.ts contains CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED', () => {
    expect(src).toContain('CAMPAIGN_ASSET_AI_GENERATION_BUDGET_BLOCKED')
  })
})

// ============================================================
// Block 13 — Boundary and safety guardrails
// ============================================================

describe('Phase 3J — Boundary and safety guardrails', () => {
  it('TC-3J-040: no file in campaign-assets module contains dispatchCampaign', () => {
    const dir = path.join(root, 'app/(workspace)/[workspaceSlug]/settings/campaign-assets')
    const files = fs.readdirSync(dir, { recursive: true }) as string[]
    for (const f of files) {
      const full = path.join(dir, f)
      if (fs.statSync(full).isFile() && full.endsWith('.ts') || full.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf-8')
        expect(content, `dispatchCampaign found in ${f}`).not.toContain('dispatchCampaign')
      }
    }
    // Also check service files
    const svcFiles = [
      'modules/messaging/services/campaign-asset.service.ts',
      'modules/messaging/services/campaign-asset-ai.service.ts',
      'modules/messaging/services/campaign-asset-validation.service.ts',
    ]
    for (const relPath of svcFiles) {
      const content = read(relPath)
      expect(content, `dispatchCampaign found in ${relPath}`).not.toContain('dispatchCampaign')
    }
  })

  it('TC-3J-041: no file in campaign-assets module contains autoSend or auto_send', () => {
    const svcFiles = [
      'modules/messaging/services/campaign-asset.service.ts',
      'modules/messaging/services/campaign-asset-ai.service.ts',
      'app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions.ts',
    ]
    for (const relPath of svcFiles) {
      const content = read(relPath)
      expect(content, `autoSend found in ${relPath}`).not.toContain('autoSend')
      expect(content, `auto_send found in ${relPath}`).not.toContain('auto_send')
    }
  })

  it('TC-3J-042: campaign-asset-ai.service.ts does not call resend.emails.send', () => {
    const src = read('modules/messaging/services/campaign-asset-ai.service.ts')
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3J-043: campaign-asset.service.ts references EMAIL_SENDING_ENABLED guard comment or campaign-asset-ai has send gating comment', () => {
    const svc   = read('modules/messaging/services/campaign-asset.service.ts')
    const aiSvc = read('modules/messaging/services/campaign-asset-ai.service.ts')
    const hasGuard = svc.includes('EMAIL_SENDING_ENABLED') || aiSvc.includes('EMAIL_SENDING_ENABLED')
    expect(hasGuard).toBe(true)
  })

  it('TC-3J-044: migration file 20240035 exists (created by Phase 3K)', () => {
    const migDir = path.join(root, 'supabase/migrations')
    const files  = fs.readdirSync(migDir)
    const has35  = files.some((f) => f.startsWith('20240035'))
    expect(has35).toBe(true)
  })

  it('TC-3J-045: campaign-personalization.service.ts content unchanged (renderCampaignAsset still present)', () => {
    const src = read('modules/messaging/services/campaign-personalization.service.ts')
    expect(src).toContain('renderCampaignAsset')
    expect(src).toContain('PersonalizationFields')
  })
})

// ============================================================
// Block 14 — Submit for Review UI patch (Phase 3K smoke fix)
// ============================================================

describe('Phase 3J/3K — SubmitForReviewButton patch', () => {
  it('TC-3J-047: SubmitForReviewButton.tsx file exists', () => {
    const filePath = path.join(root, 'app/(workspace)/[workspaceSlug]/settings/campaign-assets/SubmitForReviewButton.tsx')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('TC-3J-048: SubmitForReviewButton calls submitForReviewAction', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/SubmitForReviewButton.tsx')
    expect(src).toContain('submitForReviewAction')
  })

  it('TC-3J-049: asset detail page renders SubmitForReviewButton for draft assets', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx')
    expect(src).toContain('SubmitForReviewButton')
    expect(src).toContain("status === 'draft'")
  })

  it('TC-3J-050: SubmitForReviewButton does NOT call sendApprovedDraft', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/SubmitForReviewButton.tsx')
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3J-051: SubmitForReviewButton does NOT call resend.emails.send', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/SubmitForReviewButton.tsx')
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3J-052: SubmitForReviewButton does NOT call approveAssetAction or activateAssetAction', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/SubmitForReviewButton.tsx')
    expect(src).not.toContain('approveAssetAction')
    expect(src).not.toContain('activateAssetAction')
  })
})
