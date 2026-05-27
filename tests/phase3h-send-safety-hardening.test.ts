/**
 * Phase 3H — Send Safety Hardening
 * Source-reading tests: assert structural contracts without runtime execution.
 * No Supabase mocking, no Resend API calls, no test doubles.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()

function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

// ============================================================
// Block 0 — EMAIL_SENDING_ENABLED gate in send service
// ============================================================

describe('Phase 3H — Gate 0: EMAIL_SENDING_ENABLED in email-send.service.ts', () => {
  const src = read('modules/messaging/services/email-send.service.ts')

  it('TC-3H-001: imports system-control repo', () => {
    expect(src).toContain('system-control.repo')
  })

  it('TC-3H-002: references EMAIL_SENDING_ENABLED system control key', () => {
    expect(src).toContain('SystemControlKey.EMAIL_SENDING_ENABLED')
  })

  it('TC-3H-003: returns sending_disabled_by_system_control reason', () => {
    expect(src).toContain('sending_disabled_by_system_control')
  })

  it('TC-3H-004: calls getBooleanControl', () => {
    expect(src).toContain('getBooleanControl(')
  })
})

// ============================================================
// Block 1 — Gate ordering
// ============================================================

describe('Phase 3H — Gate ordering in email-send.service.ts', () => {
  const src = read('modules/messaging/services/email-send.service.ts')

  it('TC-3H-005: requirePermission appears before getBooleanControl', () => {
    const permIdx = src.indexOf('requirePermission(')
    const gateIdx = src.indexOf('getBooleanControl(')
    expect(permIdx).toBeGreaterThanOrEqual(0)
    expect(gateIdx).toBeGreaterThanOrEqual(0)
    expect(permIdx).toBeLessThan(gateIdx)
  })

  it('TC-3H-006: getBooleanControl appears before getEmailDraftForSending', () => {
    const gateIdx  = src.indexOf('getBooleanControl(')
    const fetchIdx = src.indexOf('getEmailDraftForSending(')
    expect(gateIdx).toBeGreaterThanOrEqual(0)
    expect(fetchIdx).toBeGreaterThanOrEqual(0)
    expect(gateIdx).toBeLessThan(fetchIdx)
  })
})

// ============================================================
// Block 2 — Activity events for all sends
// ============================================================

describe('Phase 3H — ET_SEND_* emitted for all sends', () => {
  const src = read('modules/messaging/services/email-send.service.ts')

  it('TC-3H-007: ET_SEND_INITIATED not inside a phase3bMeta !== null guard', () => {
    // The old guard was: if (phase3bMeta !== null) { ... ET_SEND_INITIATED ...}
    // Phase 3H removes it — the event emission is now unconditional.
    // Verify no guarded block contains ET_SEND_INITIATED.
    const guardedPattern = /if\s*\(\s*phase3bMeta\s*!==\s*null\s*\)[^}]*ET_SEND_INITIATED/s
    expect(guardedPattern.test(src)).toBe(false)
  })

  it('TC-3H-008: ET_SEND_SUCCEEDED not inside a phase3bMeta !== null guard', () => {
    const guardedPattern = /if\s*\(\s*phase3bMeta\s*!==\s*null\s*\)[^}]*ET_SEND_SUCCEEDED/s
    expect(guardedPattern.test(src)).toBe(false)
  })

  it('TC-3H-009: ET_SEND_FAILED not inside a phase3bMeta !== null guard', () => {
    const guardedPattern = /if\s*\(\s*phase3bMeta\s*!==\s*null\s*\)[^}]*ET_SEND_FAILED/s
    expect(guardedPattern.test(src)).toBe(false)
  })

  it('TC-3H-010: Phase 3A send_path label present in source', () => {
    expect(src).toContain('phase_3a_template')
  })
})

// ============================================================
// Block 3 — failure_reason column
// ============================================================

describe('Phase 3H — failure_reason typed column', () => {
  it('TC-3H-011: migration SQL adds failure_reason column', () => {
    const sql = read('supabase/migrations/20240033_phase3h_email_send_hardening.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS failure_reason text')
  })

  it('TC-3H-012: database.ts types failure_reason as string | null in email_sends Row', () => {
    const db = read('types/database.ts')
    expect(db).toContain('failure_reason: string | null')
  })

  it('TC-3H-013: send service writes failureReason on failure path', () => {
    const src = read('modules/messaging/services/email-send.service.ts')
    expect(src).toContain('failureReason: errorMessage')
  })
})

// ============================================================
// Block 4 — triggered_by column
// ============================================================

describe('Phase 3H — triggered_by typed column', () => {
  it('TC-3H-014: migration SQL adds triggered_by column', () => {
    const sql = read('supabase/migrations/20240033_phase3h_email_send_hardening.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS triggered_by   text')
  })

  it('TC-3H-015: database.ts types triggered_by as string | null in email_sends Row', () => {
    const db = read('types/database.ts')
    expect(db).toContain('triggered_by: string | null')
  })

  it('TC-3H-016: email-send.repo.ts CreateEmailSendInput contains triggeredBy', () => {
    const repo = read('modules/messaging/repositories/email-send.repo.ts')
    expect(repo).toContain('triggeredBy')
  })

  it('TC-3H-017: send service passes ctx.userId as triggeredBy', () => {
    const src = read('modules/messaging/services/email-send.service.ts')
    expect(src).toContain('triggeredBy:      ctx.userId')
  })
})

// ============================================================
// Block 5 — WEBHOOK_FAILURE_TYPE constants
// ============================================================

describe('Phase 3H — WEBHOOK_FAILURE_TYPE in structured-error.types.ts', () => {
  const src = read('modules/intelligence/structured-errors/structured-error.types.ts')

  it('TC-3H-018: WEBHOOK_FAILURE_TYPE constant block is exported', () => {
    expect(src).toContain('WEBHOOK_FAILURE_TYPE')
  })

  it('TC-3H-019: EMAIL_PERMANENT_BOUNCE constant is defined', () => {
    expect(src).toContain('EMAIL_PERMANENT_BOUNCE')
  })

  it('TC-3H-020: EMAIL_COMPLAINT_RECEIVED constant is defined', () => {
    expect(src).toContain('EMAIL_COMPLAINT_RECEIVED')
  })

  it('TC-3H-021: EMAIL_DELIVERY_DELAYED constant is defined', () => {
    expect(src).toContain('EMAIL_DELIVERY_DELAYED')
  })
})

// ============================================================
// Block 6 — Permanent bounce structured error
// ============================================================

describe('Phase 3H — EMAIL_PERMANENT_BOUNCE structured error in route.ts', () => {
  const src = read('app/api/webhooks/resend/route.ts')

  it('TC-3H-022: route.ts references EMAIL_PERMANENT_BOUNCE', () => {
    expect(src).toContain('WEBHOOK_FAILURE_TYPE.EMAIL_PERMANENT_BOUNCE')
  })

  it('TC-3H-023: bounce block checks for hard bounce_type', () => {
    expect(src).toContain('bounce_type')
    expect(src).toContain("=== 'hard'")
  })

  it('TC-3H-024: bounce structured error uses SE_SEVERITY.ERROR', () => {
    // Find the bounce block and verify severity is ERROR
    const bounceIdx = src.indexOf('EMAIL_PERMANENT_BOUNCE')
    const errorIdx  = src.indexOf('SE_SEVERITY.ERROR', bounceIdx)
    expect(bounceIdx).toBeGreaterThanOrEqual(0)
    expect(errorIdx).toBeGreaterThanOrEqual(0)
  })

  it('TC-3H-025: bounce error creation is non-fatal (.catch present near bounce block)', () => {
    const bounceIdx = src.indexOf('EMAIL_PERMANENT_BOUNCE')
    const catchIdx  = src.indexOf('.catch(', bounceIdx)
    expect(bounceIdx).toBeGreaterThanOrEqual(0)
    expect(catchIdx).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================
// Block 7 — Complaint structured error
// ============================================================

describe('Phase 3H — EMAIL_COMPLAINT_RECEIVED structured error in route.ts', () => {
  const src = read('app/api/webhooks/resend/route.ts')

  it('TC-3H-026: route.ts references EMAIL_COMPLAINT_RECEIVED', () => {
    expect(src).toContain('WEBHOOK_FAILURE_TYPE.EMAIL_COMPLAINT_RECEIVED')
  })

  it('TC-3H-027: complaint structured error uses SE_SEVERITY.CRITICAL', () => {
    const complaintIdx = src.indexOf('EMAIL_COMPLAINT_RECEIVED')
    const criticalIdx  = src.indexOf('SE_SEVERITY.CRITICAL', complaintIdx)
    expect(complaintIdx).toBeGreaterThanOrEqual(0)
    expect(criticalIdx).toBeGreaterThanOrEqual(0)
  })

  it('TC-3H-028: auto-unsubscribe block appears before complaint structured error', () => {
    const unsubIdx    = src.indexOf("from('unsubscribes')")
    const complaintIdx = src.indexOf('EMAIL_COMPLAINT_RECEIVED')
    expect(unsubIdx).toBeGreaterThanOrEqual(0)
    expect(complaintIdx).toBeGreaterThanOrEqual(0)
    expect(unsubIdx).toBeLessThan(complaintIdx)
  })

  it('TC-3H-029: complaint error creation is non-fatal', () => {
    const complaintIdx = src.indexOf('EMAIL_COMPLAINT_RECEIVED')
    const catchIdx     = src.indexOf('.catch(', complaintIdx)
    expect(complaintIdx).toBeGreaterThanOrEqual(0)
    expect(catchIdx).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================
// Block 8 — Delivery delay structured error
// ============================================================

describe('Phase 3H — EMAIL_DELIVERY_DELAYED structured error in route.ts', () => {
  const src = read('app/api/webhooks/resend/route.ts')

  it('TC-3H-030: route.ts references EMAIL_DELIVERY_DELAYED', () => {
    expect(src).toContain('WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED')
  })

  it('TC-3H-031: delivery delay structured error uses SE_SEVERITY.WARNING', () => {
    const delayIdx   = src.indexOf('EMAIL_DELIVERY_DELAYED')
    const warningIdx = src.indexOf('SE_SEVERITY.WARNING', delayIdx)
    expect(delayIdx).toBeGreaterThanOrEqual(0)
    expect(warningIdx).toBeGreaterThanOrEqual(0)
  })

  it('TC-3H-032: idempotency check-before-insert present for delivery delay', () => {
    // Verify the maybeSingle() check-before-insert pattern is near the delay block
    const delayIdx    = src.indexOf('EMAIL_DELIVERY_DELAYED')
    const maybeSingle = src.indexOf('maybeSingle()', delayIdx - 500)
    expect(delayIdx).toBeGreaterThanOrEqual(0)
    expect(maybeSingle).toBeGreaterThanOrEqual(0)
    // maybeSingle should appear close to EMAIL_DELIVERY_DELAYED
    expect(Math.abs(maybeSingle - delayIdx)).toBeLessThan(800)
  })

  it('TC-3H-033: delivery delay error creation is non-fatal', () => {
    const delayIdx = src.indexOf('EMAIL_DELIVERY_DELAYED')
    const catchIdx = src.indexOf('.catch(', delayIdx)
    expect(delayIdx).toBeGreaterThanOrEqual(0)
    expect(catchIdx).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================
// Block 9 — Safety guardrails
// ============================================================

describe('Phase 3H — Safety guardrails', () => {
  it('TC-3H-034: no resend.emails.send call in structured-error types or repo', () => {
    const types = read('modules/intelligence/structured-errors/structured-error.types.ts')
    const repo  = read('modules/intelligence/structured-errors/structured-error.repo.ts')
    expect(types).not.toContain('resend.emails.send')
    expect(repo).not.toContain('resend.emails.send')
  })

  it('TC-3H-035: webhook handler still returns received: true (200 OK preserved)', () => {
    const src = read('app/api/webhooks/resend/route.ts')
    expect(src).toContain('{ received: true }')
  })
})
