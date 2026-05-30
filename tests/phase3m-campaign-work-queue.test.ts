import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// Migration DDL (TC-3M-001 – TC-3M-005)
// ---------------------------------------------------------------------------

describe('TC-3M Migration DDL', () => {
  const migration = read('supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql')

  it('TC-3M-001: migration adds campaign_assignment_id column', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS campaign_assignment_id')
  })

  it('TC-3M-002: migration references campaign_assignments table', () => {
    expect(migration).toContain('REFERENCES campaign_assignments(id)')
  })

  it('TC-3M-003: migration uses ON DELETE SET NULL', () => {
    expect(migration).toContain('ON DELETE SET NULL')
  })

  it('TC-3M-004: migration creates partial index', () => {
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_assignment_id')
  })

  it('TC-3M-005: partial index filters NULL values', () => {
    expect(migration).toContain('WHERE campaign_assignment_id IS NOT NULL')
  })
})

// ---------------------------------------------------------------------------
// campaign-queue.service.ts (TC-3M-006 – TC-3M-013)
// ---------------------------------------------------------------------------

describe('TC-3M campaign-queue.service.ts', () => {
  const src = read('modules/messaging/services/campaign-queue.service.ts')

  it('TC-3M-006: exports getCampaignWorkQueue', () => {
    expect(src).toContain('export async function getCampaignWorkQueue')
  })

  it('TC-3M-007: imports createSupabaseServiceClient', () => {
    expect(src).toContain('createSupabaseServiceClient')
  })

  it('TC-3M-008: does not import @anthropic-ai/sdk', () => {
    expect(src).not.toContain('@anthropic-ai/sdk')
  })

  it('TC-3M-009: does not import resend', () => {
    expect(src).not.toContain("from '@/lib/resend")
    expect(src).not.toContain("from 'resend'")
  })

  it('TC-3M-010: does not call sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-011: does not write to campaign_email_sends', () => {
    expect(src).not.toContain('campaign_email_sends')
  })

  it('TC-3M-012: contains no insert/update/delete writes', () => {
    expect(src).not.toContain(".insert(")
    expect(src).not.toContain(".update(")
    expect(src).not.toContain(".delete(")
  })

  it('TC-3M-013: exports DraftReadiness type and CampaignQueueEntry interface', () => {
    expect(src).toContain('export type DraftReadiness')
    expect(src).toContain('export interface CampaignQueueEntry')
  })
})

// ---------------------------------------------------------------------------
// email-draft.repo.ts extensions (TC-3M-014 – TC-3M-018)
// ---------------------------------------------------------------------------

describe('TC-3M email-draft.repo.ts extensions', () => {
  const src = read('modules/messaging/repositories/email-draft.repo.ts')

  it('TC-3M-014: exports getDraftsLinkedToAssignment', () => {
    expect(src).toContain('export async function getDraftsLinkedToAssignment')
  })

  it('TC-3M-015: CreateEmailDraftInput contains campaignAssignmentId', () => {
    expect(src).toContain('campaignAssignmentId')
  })

  it('TC-3M-016: createEmailDraft insert includes campaign_assignment_id', () => {
    expect(src).toContain('campaign_assignment_id')
  })

  it('TC-3M-017: getDraftsLinkedToAssignment queries by campaign_assignment_id', () => {
    expect(src).toContain(".eq('campaign_assignment_id', assignmentId)")
  })

  it('TC-3M-018: getDraftsLinkedToAssignment selects id, status, lead_id, created_at, source_type', () => {
    expect(src).toContain("'id, status, lead_id, created_at, source_type'")
  })
})

// ---------------------------------------------------------------------------
// campaign-assignment-draft.actions.ts (TC-3M-019 – TC-3M-026)
// ---------------------------------------------------------------------------

describe('TC-3M campaign-assignment-draft.actions.ts', () => {
  const src = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')

  it('TC-3M-019: file starts with use server directive', () => {
    expect(src.trimStart()).toMatch(/^'use server'/)
  })

  it('TC-3M-020: exports createDraftFromAssignmentAction', () => {
    expect(src).toContain('export async function createDraftFromAssignmentAction')
  })

  it('TC-3M-021: imports revalidatePath', () => {
    expect(src).toContain('revalidatePath')
  })

  it('TC-3M-022: does not call sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-023: does not call resend.emails.send', () => {
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3M-024: does not write to campaign_email_sends', () => {
    expect(src).not.toContain('campaign_email_sends')
  })

  it('TC-3M-025: calls createDraftFromAsset', () => {
    expect(src).toContain('createDraftFromAsset')
  })

  it('TC-3M-026: calls revalidatePath twice', () => {
    const matches = src.match(/revalidatePath/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Assignment-linked draft creation (TC-3M-027 – TC-3M-032)
// ---------------------------------------------------------------------------

describe('TC-3M assignment-linked draft creation', () => {
  const src = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')

  it('TC-3M-027: validates assignment_status is assigned', () => {
    expect(src).toContain("assignment_not_active")
  })

  it('TC-3M-028: resolves asset from assignment or falls back to active asset', () => {
    expect(src).toContain('no_active_asset_for_campaign_type')
  })

  it('TC-3M-029: passes campaignAssignmentId to createDraftFromAsset', () => {
    expect(src).toContain('campaignAssignmentId: assignmentId')
  })

  it('TC-3M-030: returns pending_draft_exists reason when blocked (propagated from service)', () => {
    expect(src).toContain('if (!result.ok) return result')
  })

  it('TC-3M-031: emits CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT activity event', () => {
    expect(src).toContain('CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT')
  })

  it('TC-3M-032: event emission is non-fatal', () => {
    expect(src).toContain('.catch(() => null)')
  })
})

// ---------------------------------------------------------------------------
// CreateDraftFromAssignmentCard (TC-3M-033 – TC-3M-039)
// ---------------------------------------------------------------------------

describe('TC-3M CreateDraftFromAssignmentCard', () => {
  const src = read('app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx')

  it('TC-3M-033: file starts with use client directive', () => {
    expect(src.trimStart()).toMatch(/^'use client'/)
  })

  it('TC-3M-034: imports createDraftFromAssignmentAction', () => {
    expect(src).toContain('createDraftFromAssignmentAction')
  })

  it('TC-3M-035: does not call sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-036: does not import resend', () => {
    expect(src).not.toContain('resend')
  })

  it('TC-3M-037: returns null when hasActiveDraft is true', () => {
    expect(src).toContain('if (hasActiveDraft) return null')
  })

  it('TC-3M-038: uses useTransition', () => {
    expect(src).toContain('useTransition')
  })

  it('TC-3M-039: calls router.refresh() on success', () => {
    expect(src).toContain('router.refresh()')
  })
})

// ---------------------------------------------------------------------------
// Campaign Queue page (TC-3M-040 – TC-3M-045)
// ---------------------------------------------------------------------------

describe('TC-3M campaign-queue page', () => {
  const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx')

  it('TC-3M-040: page file does not contain use client', () => {
    expect(src).not.toContain("'use client'")
  })

  it('TC-3M-041: imports getCampaignWorkQueue', () => {
    expect(src).toContain('getCampaignWorkQueue')
  })

  it('TC-3M-042: imports buildRequestContext', () => {
    expect(src).toContain('buildRequestContext')
  })

  it('TC-3M-043: page renders read-only table (no form actions)', () => {
    expect(src).not.toContain('createDraftFromAssignmentAction')
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-044: does not call sendApprovedDraft', () => {
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-045: uses DraftReadiness type', () => {
    expect(src).toContain('DraftReadiness')
  })
})

// ---------------------------------------------------------------------------
// Sidebar navigation (TC-3M-046 – TC-3M-048)
// ---------------------------------------------------------------------------

describe('TC-3M sidebar navigation', () => {
  const src = read('components/layout/Sidebar.tsx')

  it('TC-3M-046: imports ListTodo from lucide-react', () => {
    expect(src).toContain('ListTodo')
  })

  it('TC-3M-047: includes Campaign Queue label', () => {
    expect(src).toContain('Campaign Queue')
  })

  it('TC-3M-048: Campaign Queue href contains campaign-queue', () => {
    expect(src).toContain('campaign-queue')
  })
})

// ---------------------------------------------------------------------------
// Lead detail page integration (TC-3M-049 – TC-3M-053)
// ---------------------------------------------------------------------------

describe('TC-3M lead detail page integration', () => {
  const src = read('app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx')

  it('TC-3M-049: imports CreateDraftFromAssignmentCard', () => {
    expect(src).toContain("import { CreateDraftFromAssignmentCard }")
  })

  it('TC-3M-050: calls getDraftsLinkedToAssignment', () => {
    expect(src).toContain('getDraftsLinkedToAssignment')
  })

  it('TC-3M-051: renders CreateDraftFromAssignmentCard', () => {
    expect(src).toContain('<CreateDraftFromAssignmentCard')
  })

  it('TC-3M-052: CreateDraftFromAssignmentCard appears before CreateDraftFromAssetCard in JSX', () => {
    const assignmentCardIdx = src.indexOf('<CreateDraftFromAssignmentCard')
    const assetCardIdx      = src.indexOf('<CreateDraftFromAssetCard')
    expect(assignmentCardIdx).toBeGreaterThan(-1)
    expect(assetCardIdx).toBeGreaterThan(-1)
    expect(assignmentCardIdx).toBeLessThan(assetCardIdx)
  })

  it('TC-3M-053: passes linkedDraftsByAssignmentId to CampaignAssignmentCard', () => {
    expect(src).toContain('linkedDraftsByAssignmentId')
  })
})

// ---------------------------------------------------------------------------
// CampaignAssignmentCard linked draft (TC-3M-054 – TC-3M-057)
// ---------------------------------------------------------------------------

describe('TC-3M CampaignAssignmentCard linked draft', () => {
  const src = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')

  it('TC-3M-054: accepts linkedDraftsByAssignmentId prop', () => {
    expect(src).toContain('linkedDraftsByAssignmentId')
  })

  it('TC-3M-055: renders Draft in progress indicator', () => {
    expect(src).toContain('Draft in progress')
  })

  it('TC-3M-056: no new send action buttons introduced', () => {
    expect(src).not.toContain('sendApprovedDraft')
    expect(src).not.toContain('resend')
  })

  it('TC-3M-057: existing action buttons (Approve, Reject, Retire) still present', () => {
    expect(src).toContain('Approve')
    expect(src).toContain('Reject')
    expect(src).toContain('Retire')
  })
})

// ---------------------------------------------------------------------------
// Assignment auto-complete wiring (TC-3M-058 – TC-3M-061)
// ---------------------------------------------------------------------------

describe('TC-3M assignment auto-complete wiring', () => {
  const src = read('modules/messaging/services/email-send.service.ts')

  it('TC-3M-058: imports campaign-assignment.service', () => {
    expect(src).toContain('campaign-assignment.service')
  })

  it('TC-3M-059: calls completeCampaignAssignment', () => {
    expect(src).toContain('completeCampaignAssignment')
  })

  it('TC-3M-060: call is guarded by draft.campaign_assignment_id', () => {
    expect(src).toContain('draft.campaign_assignment_id')
  })

  it('TC-3M-061: call is non-fatal with .catch(() => null)', () => {
    expect(src).toContain('.catch(() => null)')
  })
})

// ---------------------------------------------------------------------------
// Phase 3K compatibility (TC-3M-062 – TC-3M-065)
// ---------------------------------------------------------------------------

describe('TC-3M Phase 3K compatibility', () => {
  it('TC-3M-062: campaign-asset-draft.service.ts still exports createDraftFromAsset', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toContain('export async function createDraftFromAsset')
  })

  it('TC-3M-063: CreateDraftFromAssetCard still exists as general path', () => {
    const src = read('app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssetCard.tsx')
    expect(src).toContain('export function CreateDraftFromAssetCard')
  })

  it('TC-3M-064: source_type campaign_asset_render still written in campaign-asset-draft.service.ts', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toContain('CAMPAIGN_ASSET_RENDER')
  })

  it('TC-3M-065: getPendingDraftForLead duplicate guard still present in email-draft.repo.ts', () => {
    const src = read('modules/messaging/repositories/email-draft.repo.ts')
    expect(src).toContain('export async function getPendingDraftForLead')
  })
})

// ---------------------------------------------------------------------------
// Phase 3L compatibility (TC-3M-066 – TC-3M-069)
// ---------------------------------------------------------------------------

describe('TC-3M Phase 3L compatibility', () => {
  it('TC-3M-066: campaign-assignment.service.ts still exports completeCampaignAssignment', () => {
    const src = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(src).toContain('export async function completeCampaignAssignment')
  })

  it('TC-3M-067: campaign-assignment.service.ts does not call sendApprovedDraft', () => {
    const src = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3M-068: campaign-assignment.service.ts does not import resend', () => {
    const src = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(src).not.toContain('resend')
  })

  it('TC-3M-069: campaign_email_sends not referenced in Phase 3M action file', () => {
    const src = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')
    expect(src).not.toContain('campaign_email_sends')
  })
})

// ---------------------------------------------------------------------------
// No Phase 3N scope-creep (TC-3M-070 – TC-3M-073)
// ---------------------------------------------------------------------------

describe('TC-3M no Phase 3N scope-creep', () => {
  const phase3mFiles = [
    'modules/messaging/services/campaign-queue.service.ts',
    'modules/messaging/actions/campaign-assignment-draft.actions.ts',
    'app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx',
    'app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx',
  ]

  it('TC-3M-070: no scheduleCampaign in Phase 3M files', () => {
    for (const f of phase3mFiles) {
      expect(read(f)).not.toContain('scheduleCampaign')
    }
  })

  it('TC-3M-071: no executeCampaign in Phase 3M files', () => {
    for (const f of phase3mFiles) {
      expect(read(f)).not.toContain('executeCampaign')
    }
  })

  it('TC-3M-072: no bulkSend in Phase 3M files', () => {
    for (const f of phase3mFiles) {
      expect(read(f)).not.toContain('bulkSend')
    }
  })

  it('TC-3M-073: no autoSend in Phase 3M files', () => {
    for (const f of phase3mFiles) {
      expect(read(f)).not.toContain('autoSend')
    }
  })
})

// ---------------------------------------------------------------------------
// Codex review fixes (TC-3M-074 – TC-3M-079)
// ---------------------------------------------------------------------------

describe('TC-3M Codex review fixes', () => {
  const actionSrc = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')
  const repoSrc   = read('modules/messaging/repositories/email-draft.repo.ts')
  const pageSrc   = read('app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx')

  it('TC-3M-074: action validates workspace_id boundary', () => {
    expect(actionSrc).toContain('assignment.workspace_id !== ctx.workspaceId')
  })

  it('TC-3M-075: action imports and calls getBlockingDraftForLead for approved-draft guard', () => {
    expect(actionSrc).toContain('getBlockingDraftForLead')
    expect(actionSrc).toContain('pending_draft_exists')
  })

  it('TC-3M-076: action returns asset_not_active when pinned asset has wrong status', () => {
    expect(actionSrc).toContain('asset_not_active')
  })

  it('TC-3M-077: action returns asset_type_mismatch when pinned asset campaign_type differs', () => {
    expect(actionSrc).toContain('asset_type_mismatch')
  })

  it('TC-3M-078: campaign queue page renders visible error state (not silent catch)', () => {
    expect(pageSrc).not.toContain('.catch(() => [])')
    expect(pageSrc).toContain('queueError')
    expect(pageSrc).toContain('Failed to load campaign queue')
  })

  it('TC-3M-079: email-draft.repo.ts exports getBlockingDraftForLead checking approved status', () => {
    expect(repoSrc).toContain('export async function getBlockingDraftForLead')
    expect(repoSrc).toContain("'approved'")
  })
})

// ---------------------------------------------------------------------------
// Token / cost guardrail — no LLM path introduced by Phase 3M (TC-3M-080 – TC-3M-088)
// ---------------------------------------------------------------------------

describe('TC-3M token/cost guardrail — no LLM path', () => {
  const phase3mTokenFiles = [
    'modules/messaging/actions/campaign-assignment-draft.actions.ts',
    'modules/messaging/services/campaign-asset-draft.service.ts',
    'modules/messaging/services/campaign-queue.service.ts',
    'app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx',
    'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx',
  ]

  it('TC-3M-080: no LLM provider SDK imports in any Phase 3M file', () => {
    for (const f of phase3mTokenFiles) {
      const src = read(f)
      expect(src, `${f} imports openai`).not.toContain("from 'openai'")
      expect(src, `${f} imports openai (double-quoted)`).not.toContain('from "openai"')
      expect(src, `${f} imports @anthropic-ai/sdk`).not.toContain("from '@anthropic-ai/sdk'")
      expect(src, `${f} imports @anthropic-ai/sdk (double-quoted)`).not.toContain('from "@anthropic-ai/sdk"')
      expect(src, `${f} imports anthropic`).not.toContain("from 'anthropic'")
      expect(src, `${f} imports anthropic (double-quoted)`).not.toContain('from "anthropic"')
    }
  })

  it('TC-3M-081: no direct LLM completion call patterns in Phase 3M files', () => {
    for (const f of phase3mTokenFiles) {
      const src = read(f)
      expect(src, `${f} uses chat.completions`).not.toContain('chat.completions')
      expect(src, `${f} uses responses.create`).not.toContain('responses.create')
      expect(src, `${f} uses messages.create`).not.toContain('messages.create')
    }
  })

  it('TC-3M-082: no AI usage preflight or recording calls in Phase 3M files', () => {
    for (const f of phase3mTokenFiles) {
      const src = read(f)
      expect(src, `${f} calls preflightCheck`).not.toContain('preflightCheck')
      expect(src, `${f} calls recordUsage`).not.toContain('recordUsage')
      expect(src, `${f} calls generateAiAssetDraft`).not.toContain('generateAiAssetDraft')
    }
  })

  it('TC-3M-083: no LLM generation or rewrite-loop calls in Phase 3M files', () => {
    for (const f of phase3mTokenFiles) {
      const src = read(f)
      expect(src, `${f} calls generateMessageVersions`).not.toContain('generateMessageVersions')
      expect(src, `${f} calls rewriteLoop`).not.toContain('rewriteLoop')
      expect(src, `${f} calls rewriteEmail`).not.toContain('rewriteEmail')
      expect(src, `${f} calls runRewriteLoop`).not.toContain('runRewriteLoop')
    }
  })

  it('TC-3M-084: campaign-asset-draft.service.ts uses renderCampaignAsset — local merge, no LLM', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toContain('renderCampaignAsset')
    expect(src).not.toContain("from '@anthropic-ai/sdk'")
    expect(src).not.toContain("from 'openai'")
  })

  it('TC-3M-085: campaign-asset-draft.service.ts sets generatedByAi to false', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toMatch(/generatedByAi:\s+false/)
  })

  it('TC-3M-086: campaign-assignment-draft.actions.ts delegates to createDraftFromAsset not an LLM generator', () => {
    const src = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')
    expect(src).toContain('createDraftFromAsset')
    expect(src).not.toContain('generateAiAssetDraft')
    expect(src).not.toContain('generateMessageVersions')
    expect(src).not.toContain('preflightCheck')
  })

  it('TC-3M-087: campaign-queue.service.ts contains no send-path calls or sending flag mutations', () => {
    const src = read('modules/messaging/services/campaign-queue.service.ts')
    expect(src).not.toContain('sendApprovedDraft')
    expect(src).not.toContain('resend.emails.send')
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
  })

  it('TC-3M-088: campaign-queue page contains no send-path calls or sending flag mutations', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx')
    expect(src).not.toContain('sendApprovedDraft')
    expect(src).not.toContain('resend.emails.send')
    expect(src).not.toContain('sendEmail')
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
  })
})

// ---------------------------------------------------------------------------
// Pinned asset workspace boundary (TC-3M-089 – TC-3M-090)
// ---------------------------------------------------------------------------

describe('TC-3M pinned asset workspace boundary', () => {
  const src = read('modules/messaging/actions/campaign-assignment-draft.actions.ts')

  it('TC-3M-089: action explicitly validates asset.workspace_id against ctx.workspaceId for pinned assets', () => {
    // Must contain the guard — test would fail if the line is removed
    expect(src).toContain('asset.workspace_id !== ctx.workspaceId')
  })

  it('TC-3M-090: pinned asset workspace check occurs before createDraftFromAsset is called', () => {
    const guardIdx  = src.indexOf('asset.workspace_id !== ctx.workspaceId')
    const callIdx   = src.indexOf('createDraftFromAsset(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    // Guard must appear before the service call
    expect(guardIdx).toBeLessThan(callIdx)
  })
})
