import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

// ---------------------------------------------------------------------------
// Migration DDL (TC-3L-001 – TC-3L-005)
// ---------------------------------------------------------------------------

describe('TC-3L Migration DDL', () => {
  const migration = read('supabase/migrations/20240036_phase3l_campaign_assignments.sql')

  it('TC-3L-001: migration creates campaign_assignments table', () => {
    expect(migration).toContain('CREATE TABLE campaign_assignments')
  })

  it('TC-3L-002: migration includes lead-scoped unique index', () => {
    expect(migration).toContain('uq_active_assignment_lead_type')
  })

  it('TC-3L-003: migration includes contact-only unique index', () => {
    expect(migration).toContain('uq_active_assignment_contact_type')
  })

  it('TC-3L-004: migration includes chk_target_non_null constraint', () => {
    expect(migration).toContain('chk_target_non_null')
  })

  it('TC-3L-005: migration includes chk_confidence_range constraint', () => {
    expect(migration).toContain('chk_confidence_range')
  })
})

// ---------------------------------------------------------------------------
// Type definitions (TC-3L-006 – TC-3L-011)
// ---------------------------------------------------------------------------

describe('TC-3L Type definitions', () => {
  const types = read('modules/messaging/types/campaign-assignment.types.ts')

  it('TC-3L-006: types file exports ASSIGNMENT_STATUS', () => {
    expect(types).toContain('ASSIGNMENT_STATUS')
  })

  it('TC-3L-007: types file exports ASSIGNMENT_SOURCE', () => {
    expect(types).toContain('ASSIGNMENT_SOURCE')
  })

  it('TC-3L-008: types file defines CampaignAssignment interface', () => {
    expect(types).toContain('CampaignAssignment')
  })

  it('TC-3L-009: types file defines AssignmentStatus type', () => {
    expect(types).toContain('AssignmentStatus')
  })

  it('TC-3L-010: types file defines AssignmentSource type', () => {
    expect(types).toContain('AssignmentSource')
  })

  it('TC-3L-011: types file defines CreateAssignmentResult type', () => {
    expect(types).toContain('CreateAssignmentResult')
  })
})

// ---------------------------------------------------------------------------
// Constants (TC-3L-012 – TC-3L-015)
// ---------------------------------------------------------------------------

describe('TC-3L Constants', () => {
  const types = read('modules/messaging/types/campaign-assignment.types.ts')

  it('TC-3L-012: ASSIGNMENT_STATUS includes proposed', () => {
    expect(types).toContain("'proposed'")
  })

  it('TC-3L-013: ASSIGNMENT_STATUS includes assigned', () => {
    expect(types).toContain("'assigned'")
  })

  it('TC-3L-014: ASSIGNMENT_SOURCE includes manual', () => {
    expect(types).toContain("'manual'")
  })

  it('TC-3L-015: VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT is exported', () => {
    expect(types).toContain('VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT')
  })
})

// ---------------------------------------------------------------------------
// Repository functions (TC-3L-016 – TC-3L-020)
// ---------------------------------------------------------------------------

describe('TC-3L Repository functions', () => {
  const repo = read('modules/messaging/repositories/campaign-assignment.repo.ts')

  it('TC-3L-016: repo exports getCampaignAssignmentsForLead', () => {
    expect(repo).toContain('getCampaignAssignmentsForLead')
  })

  it('TC-3L-017: repo exports getCampaignAssignmentsForAsset', () => {
    expect(repo).toContain('getCampaignAssignmentsForAsset')
  })

  it('TC-3L-018: repo exports getProposedAssignments', () => {
    expect(repo).toContain('getProposedAssignments')
  })

  it('TC-3L-019: repo exports getActiveDuplicateAssignment', () => {
    expect(repo).toContain('getActiveDuplicateAssignment')
  })

  it('TC-3L-020: repo exports insertCampaignAssignment and updateAssignmentStatus', () => {
    expect(repo).toContain('insertCampaignAssignment')
    expect(repo).toContain('updateAssignmentStatus')
  })
})

// ---------------------------------------------------------------------------
// Service — createCampaignAssignment (TC-3L-021 – TC-3L-028)
// ---------------------------------------------------------------------------

describe('TC-3L Service createCampaignAssignment', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('TC-3L-021: service calls getActiveDuplicateAssignment for duplicate check', () => {
    expect(service).toContain('getActiveDuplicateAssignment')
  })

  it('TC-3L-022: service uses proposed status for agent_suggested source', () => {
    expect(service).toContain("'proposed'")
    expect(service).toContain('AGENT_SUGGESTED')
  })

  it('TC-3L-023: service builds eligibility_snapshot', () => {
    expect(service).toContain('eligibility_snapshot')
  })

  it('TC-3L-024: service validates campaign type against VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT', () => {
    expect(service).toContain('VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT')
  })

  it('TC-3L-025: service emits CAMPAIGN_ASSIGNED activity event', () => {
    expect(service).toContain('CAMPAIGN_ASSIGNED')
  })

  it('TC-3L-026: service emits CAMPAIGN_ASSIGNMENT_PROPOSED activity event', () => {
    expect(service).toContain('CAMPAIGN_ASSIGNMENT_PROPOSED')
  })

  it('TC-3L-027: service validates at least one of leadId or contactId', () => {
    expect(service).toContain('leadId')
    expect(service).toContain('contactId')
  })

  it('TC-3L-028: service exports createCampaignAssignment', () => {
    expect(service).toContain('createCampaignAssignment')
  })
})

// ---------------------------------------------------------------------------
// Service — approve/reject/retire transitions (TC-3L-029 – TC-3L-034)
// ---------------------------------------------------------------------------

describe('TC-3L Service transitions', () => {
  const service = read('modules/messaging/services/campaign-assignment.service.ts')

  it('TC-3L-029: service exports approveProposedAssignment', () => {
    expect(service).toContain('approveProposedAssignment')
  })

  it('TC-3L-030: service exports rejectProposedAssignment', () => {
    expect(service).toContain('rejectProposedAssignment')
  })

  it('TC-3L-031: service exports retireCampaignAssignment', () => {
    expect(service).toContain('retireCampaignAssignment')
  })

  it('TC-3L-032: service emits CAMPAIGN_ASSIGNMENT_APPROVED event', () => {
    expect(service).toContain('CAMPAIGN_ASSIGNMENT_APPROVED')
  })

  it('TC-3L-033: service emits CAMPAIGN_ASSIGNMENT_REJECTED event', () => {
    expect(service).toContain('CAMPAIGN_ASSIGNMENT_REJECTED')
  })

  it('TC-3L-034: service emits CAMPAIGN_ASSIGNMENT_RETIRED event and sets retired_at', () => {
    expect(service).toContain('CAMPAIGN_ASSIGNMENT_RETIRED')
    expect(service).toContain('retired_at')
  })
})

// ---------------------------------------------------------------------------
// Server actions (TC-3L-035 – TC-3L-040)
// ---------------------------------------------------------------------------

describe('TC-3L Server actions', () => {
  const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')

  it('TC-3L-035: actions file has use server directive', () => {
    expect(actions).toContain("'use server'")
  })

  it('TC-3L-036: actions exports createManualAssignmentAction', () => {
    expect(actions).toContain('createManualAssignmentAction')
  })

  it('TC-3L-037: actions exports approveProposedAssignmentAction', () => {
    expect(actions).toContain('approveProposedAssignmentAction')
  })

  it('TC-3L-038: actions exports rejectProposedAssignmentAction', () => {
    expect(actions).toContain('rejectProposedAssignmentAction')
  })

  it('TC-3L-039: actions exports retireCampaignAssignmentAction', () => {
    expect(actions).toContain('retireCampaignAssignmentAction')
  })

  it('TC-3L-040: actions call revalidatePath on success', () => {
    expect(actions).toContain('revalidatePath')
  })
})

// ---------------------------------------------------------------------------
// UI — CampaignAssignmentCard (TC-3L-041 – TC-3L-046)
// ---------------------------------------------------------------------------

describe('TC-3L UI CampaignAssignmentCard', () => {
  const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')

  it('TC-3L-041: CampaignAssignmentCard is use client', () => {
    expect(card).toContain("'use client'")
  })

  it('TC-3L-042: card uses useTransition for action calls', () => {
    expect(card).toContain('useTransition')
  })

  it('TC-3L-043: card calls createManualAssignmentAction', () => {
    expect(card).toContain('createManualAssignmentAction')
  })

  it('TC-3L-044: card shows empty state when no active assignment', () => {
    expect(card).toContain('No active campaign assignment')
  })

  it('TC-3L-045: card shows campaign type dropdown with CAMPAIGN_TYPE values', () => {
    expect(card).toContain('CAMPAIGN_TYPE')
    expect(card).toContain('CAMPAIGN_OPTIONS')
  })

  it('TC-3L-046: card shows assignment history accordion', () => {
    expect(card).toContain('history')
    expect(card).toContain('historicalAssignments')
  })
})

// ---------------------------------------------------------------------------
// UI — Approve/Reject buttons for proposed (TC-3L-047 – TC-3L-050)
// ---------------------------------------------------------------------------

describe('TC-3L UI Approve/Reject buttons', () => {
  const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')

  it('TC-3L-047: card renders Approve button for proposed assignments', () => {
    expect(card).toContain('Approve')
    expect(card).toContain("'proposed'")
  })

  it('TC-3L-048: card calls approveProposedAssignmentAction', () => {
    expect(card).toContain('approveProposedAssignmentAction')
  })

  it('TC-3L-049: card renders Reject button for proposed assignments', () => {
    expect(card).toContain('Reject')
    expect(card).toContain('rejectProposedAssignmentAction')
  })

  it('TC-3L-050: card renders Stop sequence button for assigned/paused assignments (replaces Retire footgun)', () => {
    expect(card).toContain('Stop sequence')
    expect(card).toContain('stopCampaignSequenceAction')
    expect(card).not.toContain('retireCampaignAssignmentAction')
  })
})

// ---------------------------------------------------------------------------
// Safety — no sendApprovedDraft (TC-3L-051 – TC-3L-053)
// ---------------------------------------------------------------------------

describe('TC-3L Safety no sendApprovedDraft', () => {
  it('TC-3L-051: service does not contain sendApprovedDraft', () => {
    const service = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(service).not.toContain('sendApprovedDraft')
  })

  it('TC-3L-052: actions does not contain sendApprovedDraft', () => {
    const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')
    expect(actions).not.toContain('sendApprovedDraft')
  })

  it('TC-3L-053: CampaignAssignmentCard does not contain sendApprovedDraft', () => {
    const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')
    expect(card).not.toContain('sendApprovedDraft')
  })
})

// ---------------------------------------------------------------------------
// Safety — no resend import (TC-3L-054 – TC-3L-056)
// ---------------------------------------------------------------------------

describe('TC-3L Safety no resend', () => {
  it('TC-3L-054: service does not import resend', () => {
    const service = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(service).not.toContain("from 'resend'")
    expect(service).not.toContain('resend.emails.send')
  })

  it('TC-3L-055: actions does not import resend', () => {
    const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')
    expect(actions).not.toContain("from 'resend'")
    expect(actions).not.toContain('resend.emails.send')
  })

  it('TC-3L-056: CampaignAssignmentCard does not import resend', () => {
    const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')
    expect(card).not.toContain("from 'resend'")
    expect(card).not.toContain('resend.emails.send')
  })
})

// ---------------------------------------------------------------------------
// Safety — no campaign_email_sends write (TC-3L-057 – TC-3L-058)
// ---------------------------------------------------------------------------

describe('TC-3L Safety no campaign_email_sends', () => {
  it('TC-3L-057: service does not write campaign_email_sends', () => {
    const service = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(service).not.toContain('campaign_email_sends')
  })

  it('TC-3L-058: actions does not write campaign_email_sends', () => {
    const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')
    expect(actions).not.toContain('campaign_email_sends')
  })
})

// ---------------------------------------------------------------------------
// Safety — no auto-draft creation (TC-3L-059 – TC-3L-060)
// ---------------------------------------------------------------------------

describe('TC-3L Safety no auto-draft', () => {
  it('TC-3L-059: service does not call createEmailDraft or generateManualCampaignDraft', () => {
    const service = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(service).not.toContain('createEmailDraft')
    expect(service).not.toContain('generateManualCampaignDraft')
  })

  it('TC-3L-060: actions does not call generateManualCampaignDraftAction', () => {
    const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')
    expect(actions).not.toContain('generateManualCampaignDraftAction')
  })
})

// ---------------------------------------------------------------------------
// Phase 3K compatibility (TC-3L-061 – TC-3L-063)
// ---------------------------------------------------------------------------

describe('TC-3L Phase 3K compatibility', () => {
  it('TC-3L-061: manual-campaign-draft.service.ts does not import from campaign-assignment', () => {
    const service = read('modules/messaging/services/manual-campaign-draft.service.ts')
    expect(service).not.toContain('campaign-assignment')
  })

  it('TC-3L-062: manual-campaign-draft.actions.ts does not import from campaign-assignment', () => {
    const actions = read('modules/messaging/actions/manual-campaign-draft.actions.ts')
    expect(actions).not.toContain('campaign-assignment')
  })

  it('TC-3L-063: CampaignAssignmentCard does not contain CreateDraftFromAssetCard or draft creation', () => {
    const card = read('app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx')
    expect(card).not.toContain('CreateDraftFromAssetCard')
    expect(card).not.toContain('generateManualCampaignDraftAction')
  })
})

// ---------------------------------------------------------------------------
// No Phase 3M / scope-creep guardrails (TC-3L-064 – TC-3L-065)
// ---------------------------------------------------------------------------

describe('TC-3L No Phase 3M scope-creep', () => {
  it('TC-3L-064: service does not contain scheduleCampaign or executeCampaign', () => {
    const service = read('modules/messaging/services/campaign-assignment.service.ts')
    expect(service).not.toContain('scheduleCampaign')
    expect(service).not.toContain('executeCampaign')
  })

  it('TC-3L-065: actions does not contain scheduleCampaign or executeCampaign', () => {
    const actions = read('modules/messaging/actions/campaign-assignment.actions.ts')
    expect(actions).not.toContain('scheduleCampaign')
    expect(actions).not.toContain('executeCampaign')
  })
})
