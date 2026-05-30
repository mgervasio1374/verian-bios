import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()

function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(root, relPath))
}

// ─── Block 1: Constants and types (TC-3K-001–005) ───────────────────────────

describe('TC-3K-001–005: Constants and types', () => {
  it('TC-3K-001: draft-source.constants.ts file exists', () => {
    expect(exists('modules/messaging/drafts/draft-source.constants.ts')).toBe(true)
  })

  it('TC-3K-002: DRAFT_SOURCE_TYPE contains campaign_asset_render', () => {
    const src = read('modules/messaging/drafts/draft-source.constants.ts')
    expect(src).toContain('campaign_asset_render')
  })

  it('TC-3K-003: DRAFT_SOURCE_TYPE contains ai_strategy_copywriting', () => {
    const src = read('modules/messaging/drafts/draft-source.constants.ts')
    expect(src).toContain('ai_strategy_copywriting')
  })

  it('TC-3K-004: DRAFT_SOURCE_TYPE contains rule_template', () => {
    const src = read('modules/messaging/drafts/draft-source.constants.ts')
    expect(src).toContain('rule_template')
  })

  it('TC-3K-005: DRAFT_SOURCE_FAILURE_TYPE defined in structured-error.types.ts', () => {
    const src = read('modules/intelligence/structured-errors/structured-error.types.ts')
    expect(src).toContain('DRAFT_SOURCE_FAILURE_TYPE')
  })
})

// ─── Block 2: Migration and data model (TC-3K-006–015) ─────────────────────

describe('TC-3K-006–015: Migration and data model', () => {
  const migFile = 'supabase/migrations/20240035_phase3k_draft_source_provenance.sql'

  it('TC-3K-006: migration 20240035 file exists', () => {
    expect(exists(migFile)).toBe(true)
  })

  it('TC-3K-007: migration adds source_type column', () => {
    const sql = read(migFile)
    expect(sql).toContain('source_type')
  })

  it('TC-3K-008: migration adds source_asset_id column', () => {
    const sql = read(migFile)
    expect(sql).toContain('source_asset_id')
  })

  it('TC-3K-009: migration references campaign_email_assets(id)', () => {
    const sql = read(migFile)
    expect(sql).toContain('campaign_email_assets(id)')
  })

  it('TC-3K-010: migration does NOT create any table', () => {
    const sql = read(migFile)
    expect(sql).not.toContain('CREATE TABLE')
  })

  it('TC-3K-011: types/database.ts email_drafts Row contains source_type', () => {
    const src = read('types/database.ts')
    expect(src).toContain('source_type')
  })

  it('TC-3K-012: types/database.ts email_drafts Row contains source_asset_id', () => {
    const src = read('types/database.ts')
    expect(src).toContain('source_asset_id')
  })

  it('TC-3K-013: email-draft.repo.ts CreateEmailDraftInput includes sourceType', () => {
    const src = read('modules/messaging/repositories/email-draft.repo.ts')
    expect(src).toContain('sourceType')
  })

  it('TC-3K-014: email-draft.repo.ts CreateEmailDraftInput includes sourceAssetId', () => {
    const src = read('modules/messaging/repositories/email-draft.repo.ts')
    expect(src).toContain('sourceAssetId')
  })

  it('TC-3K-015: email-draft.repo.ts createEmailDraft writes source_type and source_asset_id', () => {
    const src = read('modules/messaging/repositories/email-draft.repo.ts')
    expect(src).toContain('source_type:')
    expect(src).toContain('source_asset_id:')
  })
})

// ─── Block 3: Campaign asset render draft service (TC-3K-016–025) ───────────

describe('TC-3K-016–025: Campaign asset render draft path — service', () => {
  const svcFile = 'modules/messaging/services/campaign-asset-draft.service.ts'

  it('TC-3K-016: campaign-asset-draft.service.ts file exists', () => {
    expect(exists(svcFile)).toBe(true)
  })

  it('TC-3K-017: exports createDraftFromAsset function', () => {
    const src = read(svcFile)
    expect(src).toContain('createDraftFromAsset')
  })

  it('TC-3K-018: calls renderCampaignAsset', () => {
    const src = read(svcFile)
    expect(src).toContain('renderCampaignAsset')
  })

  it('TC-3K-019: does NOT import @anthropic-ai/sdk', () => {
    const src = read(svcFile)
    expect(src).not.toContain('@anthropic-ai/sdk')
  })

  it('TC-3K-020: does NOT call sendApprovedDraft', () => {
    const src = read(svcFile)
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3K-021: does NOT call resend.emails.send', () => {
    const src = read(svcFile)
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3K-022: does NOT reference campaign_email_sends', () => {
    const src = read(svcFile)
    expect(src).not.toContain('campaign_email_sends')
  })

  it('TC-3K-023: calls createDecision (agent decision linkage)', () => {
    const src = read(svcFile)
    expect(src).toContain('createDecision')
  })

  it('TC-3K-024: does NOT call recordUsage (no LLM)', () => {
    const src = read(svcFile)
    expect(src).not.toContain('recordUsage')
  })

  it('TC-3K-025: does NOT call preflightCheck (no LLM)', () => {
    const src = read(svcFile)
    expect(src).not.toContain('preflightCheck')
  })
})

// ─── Block 4: Service safety guardrails (TC-3K-026–032) ────────────────────

describe('TC-3K-026–032: Campaign asset render draft path — safety guardrails', () => {
  const svcFile = 'modules/messaging/services/campaign-asset-draft.service.ts'

  it('TC-3K-026: returns ok:false if asset not eligible', () => {
    const src = read(svcFile)
    expect(src).toContain('asset_not_eligible')
  })

  it('TC-3K-027: checks for retired asset status', () => {
    const src = read(svcFile)
    expect(src).toContain("'retired'")
  })

  it('TC-3K-028: returns ok:false if pending draft already exists', () => {
    const src = read(svcFile)
    expect(src).toContain('pending_draft_exists')
  })

  it('TC-3K-029: sets sourceType to CAMPAIGN_ASSET_RENDER', () => {
    const src = read(svcFile)
    expect(src).toContain('DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER')
  })

  it('TC-3K-030: sets sourceAssetId to input.assetId', () => {
    const src = read(svcFile)
    expect(src).toContain('sourceAssetId:    input.assetId')
  })

  it('TC-3K-031: sets generatedByAi to false', () => {
    const src = read(svcFile)
    expect(src).toContain('generatedByAi:    false')
  })

  it('TC-3K-032: creates draft with status pending_approval', () => {
    const src = read(svcFile)
    expect(src).toContain("status:           'pending_approval'")
  })
})

// ─── Block 5: Lifecycle and readiness (TC-3K-033–038) ───────────────────────

describe('TC-3K-033–038: Lifecycle and readiness', () => {
  const svcFile = 'modules/messaging/services/draft-send-readiness.service.ts'

  it('TC-3K-033: draft-send-readiness.service.ts exists and exports checkDraftSendReadiness', () => {
    expect(exists(svcFile)).toBe(true)
    const src = read(svcFile)
    expect(src).toContain('checkDraftSendReadiness')
  })

  it('TC-3K-034: returns blocked reason draft_not_approved', () => {
    const src = read(svcFile)
    expect(src).toContain('draft_not_approved')
  })

  it('TC-3K-035: checks source_asset_retired', () => {
    const src = read(svcFile)
    expect(src).toContain('source_asset_retired')
  })

  it('TC-3K-036: missing_personalization_fields is a warning not a blocker', () => {
    const src = read(svcFile)
    expect(src).toContain('missing_personalization_fields')
    expect(src).toContain('warnings.push')
  })

  it('TC-3K-037: does NOT reference supabase (pure function)', () => {
    const src = read(svcFile)
    expect(src).not.toContain('supabase')
  })

  it('TC-3K-038: uses blockedReasons array', () => {
    const src = read(svcFile)
    expect(src).toContain('blockedReasons')
  })
})

// ─── Block 6: Source type on existing paths (TC-3K-039–049) ────────────────

describe('TC-3K-039–049: Source type on existing paths and AI budget', () => {
  it('TC-3K-039: email-draft.service.ts sets DRAFT_SOURCE_TYPE.RULE_TEMPLATE', () => {
    const src = read('modules/messaging/services/email-draft.service.ts')
    expect(src).toContain('DRAFT_SOURCE_TYPE.RULE_TEMPLATE')
  })

  it('TC-3K-040: send-bridge.service.ts sets DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING', () => {
    const src = read('modules/messaging/send-bridge/send-bridge.service.ts')
    expect(src).toContain('DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING')
  })

  it('TC-3K-041: manual-campaign-draft.service.ts sets DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE', () => {
    const src = read('modules/messaging/services/manual-campaign-draft.service.ts')
    expect(src).toContain('DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE')
  })

  it('TC-3K-042: manual-campaign-draft.service.ts uses CAMPAIGN_TYPE.INITIAL_CONTACT', () => {
    const src = read('modules/messaging/services/manual-campaign-draft.service.ts')
    expect(src).toContain('CAMPAIGN_TYPE.INITIAL_CONTACT')
  })

  it('TC-3K-043: manual-campaign-draft.service.ts does NOT contain legacy key new_lead_outreach', () => {
    const src = read('modules/messaging/services/manual-campaign-draft.service.ts')
    expect(src).not.toContain('new_lead_outreach')
  })

  it('TC-3K-044: campaign-asset-draft.service.ts does NOT call preflightCheck', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).not.toContain('preflightCheck')
  })

  it('TC-3K-045: copywriting-agent.service.ts still calls preflightCheck (unchanged)', () => {
    const src = read('modules/messaging/copywriting/copywriting-agent.service.ts')
    expect(src).toContain('preflightCheck')
  })

  it('TC-3K-046: campaign-asset-draft.service.ts does NOT call recordUsage', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).not.toContain('recordUsage')
  })

  it('TC-3K-047: campaign-asset-draft.service.ts calls createDecision', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toContain('createDecision')
  })

  it('TC-3K-048: campaign-asset-draft.service.ts does NOT reference budget or preflightCheck', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).not.toContain('preflightCheck')
    expect(src).not.toContain('budget')
  })

  it('TC-3K-049: structured-error.types.ts contains DRAFT_AI_BUDGET_BLOCKED', () => {
    const src = read('modules/intelligence/structured-errors/structured-error.types.ts')
    expect(src).toContain('DRAFT_AI_BUDGET_BLOCKED')
  })
})

// ─── Block 7: Safety guardrails (TC-3K-050–058) ─────────────────────────────

describe('TC-3K-050–058: Safety guardrails', () => {
  const draftSvcFile  = 'modules/messaging/services/campaign-asset-draft.service.ts'
  const readinessSvc  = 'modules/messaging/services/draft-send-readiness.service.ts'

  it('TC-3K-050: Phase 3K new files do NOT call resend.emails.send', () => {
    expect(read(draftSvcFile)).not.toContain('resend.emails.send')
    expect(read(readinessSvc)).not.toContain('resend.emails.send')
  })

  it('TC-3K-051: Phase 3K new files do NOT call sendApprovedDraft', () => {
    expect(read(draftSvcFile)).not.toContain('sendApprovedDraft')
    expect(read(readinessSvc)).not.toContain('sendApprovedDraft')
  })

  it('TC-3K-052: campaign-asset-draft.service.ts does NOT reference campaign_email_sends', () => {
    const src = read(draftSvcFile)
    expect(src).not.toContain('campaign_email_sends')
  })

  it('TC-3K-053: no Phase 3K Inngest function file exists', () => {
    expect(exists('modules/messaging/services/campaign-asset-draft.inngest.ts')).toBe(false)
    expect(exists('modules/messaging/functions/campaign-asset-draft.ts')).toBe(false)
  })

  it('TC-3K-054: Phase 3K files do NOT set EMAIL_SENDING_ENABLED', () => {
    expect(read(draftSvcFile)).not.toContain("EMAIL_SENDING_ENABLED = true")
    expect(read(readinessSvc)).not.toContain("EMAIL_SENDING_ENABLED = true")
  })

  it('TC-3K-055: Phase 3K files do NOT contain scheduleCampaign or executeCampaign (Phase 3L guard)', () => {
    expect(read(draftSvcFile)).not.toContain('scheduleCampaign')
    expect(read(draftSvcFile)).not.toContain('executeCampaign')
  })

  it('TC-3K-056: Phase 3K files do NOT contain autoSend or auto_send', () => {
    expect(read(draftSvcFile)).not.toContain('autoSend')
    expect(read(draftSvcFile)).not.toContain('auto_send')
    expect(read(readinessSvc)).not.toContain('autoSend')
    expect(read(readinessSvc)).not.toContain('auto_send')
  })

  it('TC-3K-057: Phase 3K files do NOT contain dispatchCampaign or executeCampaign', () => {
    expect(read(draftSvcFile)).not.toContain('dispatchCampaign')
    expect(read(draftSvcFile)).not.toContain('executeCampaign')
  })

  it('TC-3K-058: Phase 3K files do NOT contain assignCampaign or enrollLead', () => {
    expect(read(draftSvcFile)).not.toContain('assignCampaign')
    expect(read(draftSvcFile)).not.toContain('enrollLead')
  })
})

// ─── Block 8: Lead page blocked-state UI patch (TC-3K-059–066) ──────────────

describe('TC-3K-059–066: Lead page blocked-state Draft from Campaign Asset', () => {
  const leadPage = 'app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx'

  it('TC-3K-059: lead page renders Draft from Campaign Asset card when activeAssets.length > 0 (not gated by !hasActiveDraft)', () => {
    const src = read(leadPage)
    expect(src).toContain('activeAssets.length > 0')
  })

  it('TC-3K-060: lead page shows blocked explanation when hasActiveDraft is true', () => {
    const src = read(leadPage)
    expect(src).toContain('already has a')
    expect(src).toContain('Resolve or supersede')
  })

  it('TC-3K-061: lead page still renders CreateDraftFromAssetCard (import present)', () => {
    const src = read(leadPage)
    expect(src).toContain('CreateDraftFromAssetCard')
  })

  it('TC-3K-062: campaign-asset-draft.service.ts duplicate guard is preserved', () => {
    const src = read('modules/messaging/services/campaign-asset-draft.service.ts')
    expect(src).toContain('pending_draft_exists')
  })

  it('TC-3K-063: lead page does NOT contain sendApprovedDraft', () => {
    const src = read(leadPage)
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-3K-064: lead page does NOT contain resend.emails.send', () => {
    const src = read(leadPage)
    expect(src).not.toContain('resend.emails.send')
  })

  it('TC-3K-065: lead page does NOT contain campaign_email_sends', () => {
    const src = read(leadPage)
    expect(src).not.toContain('campaign_email_sends')
  })

  it('TC-3K-066: lead page does NOT contain dispatchCampaign or executeCampaign', () => {
    const src = read(leadPage)
    expect(src).not.toContain('dispatchCampaign')
    expect(src).not.toContain('executeCampaign')
  })
})

// ─── Block 9: Legacy campaign type compatibility (TC-3K-067–075) ─────────────

describe('TC-3K-067–075: Legacy campaign type mapping compatibility', () => {
  const actionFile = 'modules/messaging/actions/manual-campaign-draft.actions.ts'
  const buttonFile = 'app/(workspace)/[workspaceSlug]/leads/[id]/ManualCampaignDraftButton.tsx'

  it('TC-3K-067: action file contains LEGACY_TO_CANONICAL mapping', () => {
    const src = read(actionFile)
    expect(src).toContain('LEGACY_TO_CANONICAL')
  })

  it('TC-3K-068: action maps new_lead_outreach to initial_contact', () => {
    const src = read(actionFile)
    expect(src).toContain('new_lead_outreach')
    expect(src).toContain('CAMPAIGN_TYPE.INITIAL_CONTACT')
  })

  it('TC-3K-069: action maps statement_review_followup to statement_follow_up', () => {
    const src = read(actionFile)
    expect(src).toContain('statement_review_followup')
    expect(src).toContain('CAMPAIGN_TYPE.STATEMENT_FOLLOW_UP')
  })

  it('TC-3K-070: action maps processing_cost_review to check_in', () => {
    const src = read(actionFile)
    expect(src).toContain('processing_cost_review')
    expect(src).toContain('CAMPAIGN_TYPE.CHECK_IN')
  })

  it('TC-3K-071: action maps home_services_outreach to initial_contact', () => {
    const src = read(actionFile)
    expect(src).toContain('home_services_outreach')
  })

  it('TC-3K-072: action maps reengagement to reactivation', () => {
    const src = read(actionFile)
    expect(src).toContain('reengagement')
    expect(src).toContain('CAMPAIGN_TYPE.REACTIVATION')
  })

  it('TC-3K-073: ManualCampaignDraftButton no longer contains legacy value new_lead_outreach', () => {
    const src = read(buttonFile)
    expect(src).not.toContain('new_lead_outreach')
  })

  it('TC-3K-074: ManualCampaignDraftButton no longer contains legacy value statement_review_followup', () => {
    const src = read(buttonFile)
    expect(src).not.toContain('statement_review_followup')
  })

  it('TC-3K-075: ManualCampaignDraftButton no longer contains legacy value processing_cost_review', () => {
    const src = read(buttonFile)
    expect(src).not.toContain('processing_cost_review')
  })
})
