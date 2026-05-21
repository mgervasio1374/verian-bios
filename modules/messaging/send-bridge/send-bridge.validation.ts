// ============================================================
// Phase 3B — Send / Email Draft Bridge Validation
// Pure functions only — no I/O, no async, no side effects.
// All inputs must be pre-loaded by the service layer.
// ============================================================

import type {
  SendBridgeVersion,
  SendBridgeStrategy,
  SendBridgeContact,
  SendBridgeSenderIdentity,
  ExistingDraftCheck,
  DraftCreationEligibilityResult,
} from './send-bridge.types'
import { SEB_ERROR_CODES } from './send-bridge.types'

// ---- Helpers ----

export function isVersionApproved(version: SendBridgeVersion): boolean {
  return version.approval_status === 'approved'
}

export function isStrategyActive(strategy: SendBridgeStrategy): boolean {
  return ['draft', 'approved', 'in_use'].includes(strategy.status)
}

export function hasDraftInProgress(existingDraft: ExistingDraftCheck | null): boolean {
  if (!existingDraft) return false
  return !['superseded', 'rejected'].includes(existingDraft.status)
}

// ---- Main pure validation function ----
// Evaluates all 14 gate conditions in order. Returns on first failure.
// Does not perform any I/O. All inputs must be pre-loaded by the caller.
//
// Check order (matches design Section 19):
//  1  SEB_013 — tenant mismatch
//  2  SEB_002 — version rejected (specific subset of SEB_001)
//  3  SEB_003 — version superseded (specific subset of SEB_001)
//  4  SEB_001 — version not approved (catch-all for remaining non-approved states)
//  5  SEB_008 — strategy not active
//  6  SEB_004 — no contact linked to lead
//  7  SEB_005 — contact email missing
//  8  SEB_006 — do_not_contact
//  9  SEB_007 — email suppressed
// 10  SEB_012 — no sender identity
// 11  SEB_009 — subject_line or body_text empty
// 12  SEB_010 — body_html non-null
// 13  SEB_011 — active duplicate draft for this version
// 14  SEB_014 — permission denied (checked at action layer, passed in for testability)

export function validateDraftCreationEligibility(params: {
  version:           SendBridgeVersion
  strategy:          SendBridgeStrategy
  lead:              { contact_id: string | null }
  contact:           SendBridgeContact | null
  senderIdentity:    SendBridgeSenderIdentity | null
  existingDraft:     ExistingDraftCheck | null
  suppressionResult: { blocked: boolean; reason?: string }
  hasPermission:     boolean
  requestTenantId:   string
}): DraftCreationEligibilityResult {
  const {
    version,
    strategy,
    lead,
    contact,
    senderIdentity,
    existingDraft,
    suppressionResult,
    hasPermission,
    requestTenantId,
  } = params

  // Gate 1 — SEB_013: Tenant mismatch
  if (version.tenant_id !== requestTenantId) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.TENANT_MISMATCH,
      errorMessage: 'Tenant mismatch between version and request context.',
    }
  }

  // Gate 2 — SEB_002: Version is rejected (check before generic SEB_001)
  if (version.approval_status === 'rejected') {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.VERSION_REJECTED,
      errorMessage: 'Cannot create a draft from a rejected version.',
    }
  }

  // Gate 3 — SEB_003: Version is superseded (check before generic SEB_001)
  if (version.approval_status === 'superseded') {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.VERSION_SUPERSEDED,
      errorMessage: 'This version has been superseded and is no longer available.',
    }
  }

  // Gate 4 — SEB_001: Version not approved (pending, selected, or any other non-approved state)
  if (version.approval_status !== 'approved') {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.VERSION_NOT_APPROVED,
      errorMessage: 'Version must be approved via the Human Review Bridge before creating a draft.',
    }
  }

  // Gate 5 — SEB_008: Strategy not active
  if (!isStrategyActive(strategy)) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.STRATEGY_NOT_ACTIVE,
      errorMessage: 'The message strategy has been superseded or is in error state.',
    }
  }

  // Gate 6 — SEB_004: No contact linked to lead
  if (!lead.contact_id) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.CONTACT_NOT_LINKED,
      errorMessage: 'No contact is linked to this lead. Link a contact in the CRM first.',
    }
  }

  // Gate 7 — SEB_005: Contact email missing
  if (!contact || !contact.email) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.CONTACT_EMAIL_MISSING,
      errorMessage: 'The contact has no email address. Add one in the CRM first.',
    }
  }

  // Gate 8 — SEB_006: do_not_contact
  if (contact.do_not_contact) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.CONTACT_DO_NOT_CONTACT,
      errorMessage: 'This contact is marked Do Not Contact.',
    }
  }

  // Gate 9 — SEB_007: Email suppressed or unsubscribed
  if (suppressionResult.blocked) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.EMAIL_SUPPRESSED,
      errorMessage: "This contact's email is suppressed or unsubscribed.",
    }
  }

  // Gate 10 — SEB_012: No default sender identity
  if (!senderIdentity) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.SENDER_IDENTITY_MISSING,
      errorMessage: 'No default sender identity is configured for this workspace.',
    }
  }

  // Gate 11 — SEB_009: Version content missing (subject_line or body_text)
  if (!version.subject_line || !version.body_text) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.VERSION_CONTENT_MISSING,
      errorMessage: 'Version is missing subject line or body text.',
    }
  }

  // Gate 12 — SEB_010: body_html is non-null (Phase 3B invariant violation)
  if (version.body_html !== null) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.BODY_HTML_POPULATED,
      errorMessage: 'Phase 3B v1 invariant violated: body_html must be null.',
    }
  }

  // Gate 13 — SEB_011: Active duplicate draft for this version
  if (hasDraftInProgress(existingDraft)) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.DUPLICATE_DRAFT,
      errorMessage: 'A draft already exists for this version. View the existing draft.',
    }
  }

  // Gate 14 — SEB_014: Permission denied
  if (!hasPermission) {
    return {
      allowed:      false,
      error:        SEB_ERROR_CODES.PERMISSION_DENIED,
      errorMessage: 'You do not have permission to create email drafts.',
    }
  }

  return { allowed: true, error: null, errorMessage: null }
}
