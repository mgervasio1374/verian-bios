import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '..')

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n')
}

const rqPath = 'modules/verian-agent-bridge/review-queue/types.ts'
const alPath = 'modules/verian-agent-bridge/audit-ledger/types.ts'
const rqSrc = read(rqPath)
const alSrc = read(alPath)
const bothSrc = [rqSrc, alSrc]

// ---------------------------------------------------------------------------
// TC-G5-S3-001  Expected Goal 5 files only
// ---------------------------------------------------------------------------

describe('TC-G5-S3-001 expected Goal 5 files only', () => {
  it('required type files exist and no implementation files exist', () => {
    expect(exists(rqPath)).toBe(true)
    expect(exists(alPath)).toBe(true)

    // Slice 10 implementation files now legitimately exist. UI remains not created.
    const notExpected = [
      'app/(workspace)/[workspaceSlug]/agent-bridge/review-queue/page.tsx',
    ]
    for (const f of notExpected) {
      expect(exists(f)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-002  Type-only imports
// ---------------------------------------------------------------------------

describe('TC-G5-S3-002 type-only imports', () => {
  it('both files use only type imports and contain no provider or DB SDK references', () => {
    const forbidden = [
      'import { ',
      'import * ',
      'require(',
      "from '@/lib/supabase",
      "from '@supabase",
      "from 'pg'",
      "from 'drizzle'",
      "from '@prisma'",
      "from 'openai'",
      "from '@anthropic'",
      'qwen-sdk',
      'codex-cli',
    ]
    for (const src of bothSrc) {
      for (const pattern of forbidden) {
        expect(src).not.toContain(pattern)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-003  No runtime implementation
// ---------------------------------------------------------------------------

describe('TC-G5-S3-003 no runtime implementation', () => {
  it('both files contain no runtime constructs, model calls, or side effects', () => {
    const forbidden = [
      'export const',
      'export function',
      'class ',
      'async ',
      'fetch(',
      'process.env',
      'child_process',
      'execSync',
      'spawnSync',
      'readFile',
      'writeFile',
      'createSupabase',
      'prisma.',
    ]
    for (const src of bothSrc) {
      for (const pattern of forbidden) {
        expect(src).not.toContain(pattern)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-004  Review queue state coverage
// ---------------------------------------------------------------------------

describe('TC-G5-S3-004 review queue state coverage', () => {
  it('review queue types contain all 9 required queue states', () => {
    const states = [
      'draft_packet',
      'pending_policy_review',
      'blocked_by_policy',
      'waiting_human_approval',
      'waiting_codex_review',
      'revision_requested',
      'approved_for_manual_handoff',
      'denied',
      'archived',
    ]
    for (const state of states) {
      expect(rqSrc).toContain(state)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-005  Initial state tightening
// ---------------------------------------------------------------------------

describe('TC-G5-S3-005 initial state tightening', () => {
  it('VerianBridgeReviewQueueInitialState is exported and used on initialState field', () => {
    expect(rqSrc).toContain('export type VerianBridgeReviewQueueInitialState')
    expect(rqSrc).toContain('readonly initialState: VerianBridgeReviewQueueInitialState')
    // initialState must no longer be typed as the full queue state union
    expect(rqSrc).not.toContain('readonly initialState: VerianBridgeReviewQueueState')
    // The two permitted initial states are present in the new type
    expect(
      rqSrc.slice(rqSrc.indexOf('VerianBridgeReviewQueueInitialState'), rqSrc.indexOf('VerianBridgeReviewQueueAction'))
    ).toContain('draft_packet')
    expect(
      rqSrc.slice(rqSrc.indexOf('VerianBridgeReviewQueueInitialState'), rqSrc.indexOf('VerianBridgeReviewQueueAction'))
    ).toContain('pending_policy_review')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-006  Review queue action coverage
// ---------------------------------------------------------------------------

describe('TC-G5-S3-006 review queue action coverage', () => {
  it('review queue types contain all 6 required approval actions', () => {
    const actions = [
      'approve_for_manual_handoff',
      'deny',
      'request_revision',
      'mark_codex_review_received',
      'archive',
      'reopen_for_review',
    ]
    for (const action of actions) {
      expect(rqSrc).toContain(action)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-007  Manual handoff safety literals
// ---------------------------------------------------------------------------

describe('TC-G5-S3-007 manual handoff safety literals', () => {
  it('VerianBridgeManualHandoffApproval carries required safety literals', () => {
    expect(rqSrc).toContain("readonly approvedBy: 'michael'")
    expect(rqSrc).toContain('readonly executionAuthorized: false')
    expect(rqSrc).toContain('readonly dryRunOnly: true')
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-008  Audit event type coverage
// ---------------------------------------------------------------------------

describe('TC-G5-S3-008 audit event type coverage', () => {
  it('audit ledger types contain all 12 required audit event types', () => {
    const events = [
      'packet_created',
      'policy_check_passed',
      'policy_check_warning',
      'policy_check_blocked',
      'human_approval_requested',
      'human_approved',
      'human_denied',
      'revision_requested',
      'codex_review_required',
      'codex_review_received',
      'manual_handoff_prepared',
      'packet_archived',
    ]
    for (const event of events) {
      expect(alSrc).toContain(event)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-009  Audit actor coverage
// ---------------------------------------------------------------------------

describe('TC-G5-S3-009 audit actor coverage', () => {
  it('audit ledger types define all required audit actors', () => {
    const actorBody = alSrc.slice(
      alSrc.indexOf('VerianBridgeAuditActor'),
      alSrc.indexOf('VerianBridgeAuditRecordId'),
    )
    expect(actorBody).toContain("'michael'")
    expect(actorBody).toContain("'system'")
    expect(actorBody).toContain("'agent'")
    expect(actorBody).toContain("'codex'")
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-010  Audit ledger rule coverage
// ---------------------------------------------------------------------------

describe('TC-G5-S3-010 audit ledger rule coverage', () => {
  it('audit ledger types contain all 9 required ledger rules', () => {
    const rules = [
      'append_only',
      'no_silent_mutation',
      'preserve_policy_check_result',
      'preserve_actor',
      'preserve_timestamp',
      'preserve_denials',
      'preserve_revision_requests',
      'preserve_codex_artifacts',
      'dry_run_only',
    ]
    for (const rule of rules) {
      expect(alSrc).toContain(rule)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-011  dryRunOnly protections
// ---------------------------------------------------------------------------

describe('TC-G5-S3-011 dryRunOnly protections', () => {
  it('both files carry multiple dryRunOnly: true literals on object types', () => {
    const rqCount = (rqSrc.match(/readonly dryRunOnly: true/g) ?? []).length
    const alCount = (alSrc.match(/readonly dryRunOnly: true/g) ?? []).length
    expect(rqCount).toBeGreaterThanOrEqual(3)
    expect(alCount).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// TC-G5-S3-012  No DB/UI/service/repo files created
// ---------------------------------------------------------------------------

describe('TC-G5-S3-012 no DB/UI/service/repo files created', () => {
  it('only allowed Goal 5 files exist — no implementation created', () => {
    const rqDir = path.join(root, 'modules/verian-agent-bridge/review-queue')
    const alDir = path.join(root, 'modules/verian-agent-bridge/audit-ledger')
    // Slice 10 added repo, service, and reviewer-authorization to these directories.
    expect(fs.readdirSync(rqDir).sort()).toEqual([
      'review-queue.repo.ts',
      'review-queue.service.ts',
      'reviewer-authorization.ts',
      'types.ts',
    ])
    expect(fs.readdirSync(alDir).sort()).toEqual([
      'audit-ledger.repo.ts',
      'audit-ledger.service.ts',
      'types.ts',
    ])
    expect(
      exists('tests/goal5-agent-bridge-review-queue-audit-types.test.ts')
    ).toBe(true)
  })
})
