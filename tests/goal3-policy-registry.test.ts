import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n')
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}

const regPath = 'modules/verian-policy/registry.ts'
const typesPath = 'modules/verian-policy/types.ts'
const regSrc = read(regPath)
const typesSrc = read(typesPath)

// ---------------------------------------------------------------------------
// TC-G3-S4-001  File existence
// ---------------------------------------------------------------------------

describe('TC-G3-S4-001 file existence', () => {
  it('modules/verian-policy/registry.ts exists', () => {
    expect(exists(regPath)).toBe(true)
  })

  it('modules/verian-policy/types.ts exists', () => {
    expect(exists(typesPath)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-002  Registry exports
// ---------------------------------------------------------------------------

describe('TC-G3-S4-002 registry exports', () => {
  it('exports VERIAN_POLICY_PROFILES', () => {
    expect(regSrc).toContain('export const VERIAN_POLICY_PROFILES')
  })

  it('exports VERIAN_POLICY_REGISTRY', () => {
    expect(regSrc).toContain('export const VERIAN_POLICY_REGISTRY')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-003  Required profile IDs
// ---------------------------------------------------------------------------

describe('TC-G3-S4-003 required profile IDs', () => {
  it('includes LOW_RISK_DOCS_ONLY', () => {
    expect(regSrc).toContain('LOW_RISK_DOCS_ONLY')
  })

  it('includes LOW_RISK_UI_POLISH_NO_DATA', () => {
    expect(regSrc).toContain('LOW_RISK_UI_POLISH_NO_DATA')
  })

  it('includes MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    expect(regSrc).toContain('MEDIUM_RISK_BACKEND_NO_MIGRATION')
  })

  it('includes HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION', () => {
    expect(regSrc).toContain('HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION')
  })

  it('includes MIGRATION_DESIGN_ONLY', () => {
    expect(regSrc).toContain('MIGRATION_DESIGN_ONLY')
  })

  it('includes STAGING_VERIFICATION_ONLY', () => {
    expect(regSrc).toContain('STAGING_VERIFICATION_ONLY')
  })

  it('includes CODEX_REVIEW_REQUIRED', () => {
    expect(regSrc).toContain('CODEX_REVIEW_REQUIRED')
  })

  it('includes BRIDGE_REVIEW_ONLY', () => {
    expect(regSrc).toContain('BRIDGE_REVIEW_ONLY')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-004  Required profile fields
// ---------------------------------------------------------------------------

describe('TC-G3-S4-004 required profile fields', () => {
  it('uses policyId field', () => {
    expect(regSrc).toContain('policyId:')
  })

  it('uses name field', () => {
    expect(regSrc).toContain('name:')
  })

  it('uses description field', () => {
    expect(regSrc).toContain('description:')
  })

  it('uses riskLevel field', () => {
    expect(regSrc).toContain('riskLevel:')
  })

  it('uses allowedActions field', () => {
    expect(regSrc).toContain('allowedActions:')
  })

  it('uses blockedActions field', () => {
    expect(regSrc).toContain('blockedActions:')
  })

  it('uses requiredChecks field', () => {
    expect(regSrc).toContain('requiredChecks:')
  })

  it('uses requiredEvidence field', () => {
    expect(regSrc).toContain('requiredEvidence:')
  })

  it('uses requiredReviewers field', () => {
    expect(regSrc).toContain('requiredReviewers:')
  })

  it('uses requiresCodexReview field', () => {
    expect(regSrc).toContain('requiresCodexReview:')
  })

  it('uses requiresHumanApproval field', () => {
    expect(regSrc).toContain('requiresHumanApproval:')
  })

  it('uses requiresProductivityReport field', () => {
    expect(regSrc).toContain('requiresProductivityReport:')
  })

  it('uses stopConditions field', () => {
    expect(regSrc).toContain('stopConditions:')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-005  Core blocked actions present
// ---------------------------------------------------------------------------

describe('TC-G3-S4-005 core blocked actions present', () => {
  it("blocks 'touch-production'", () => {
    expect(regSrc).toContain("'touch-production'")
  })

  it("blocks 'email-sending'", () => {
    expect(regSrc).toContain("'email-sending'")
  })

  it("blocks 'campaign-sending'", () => {
    expect(regSrc).toContain("'campaign-sending'")
  })

  it("blocks 'apply-migration'", () => {
    expect(regSrc).toContain("'apply-migration'")
  })

  it("blocks 'automation-background-jobs'", () => {
    expect(regSrc).toContain("'automation-background-jobs'")
  })

  it("blocks 'change-vercel-settings'", () => {
    expect(regSrc).toContain("'change-vercel-settings'")
  })

  it("blocks 'change-env-vars'", () => {
    expect(regSrc).toContain("'change-env-vars'")
  })

  it("blocks 'change-supabase-config'", () => {
    expect(regSrc).toContain("'change-supabase-config'")
  })

  it("blocks 'change-system-controls'", () => {
    expect(regSrc).toContain("'change-system-controls'")
  })

  it("blocks 'enable-EMAIL_SENDING_ENABLED'", () => {
    expect(regSrc).toContain("'enable-EMAIL_SENDING_ENABLED'")
  })

  it("blocks 'enable-CAMPAIGN_SENDING_ENABLED'", () => {
    expect(regSrc).toContain("'enable-CAMPAIGN_SENDING_ENABLED'")
  })

  it("blocks 'call-sendFollowUpDraftAction'", () => {
    expect(regSrc).toContain("'call-sendFollowUpDraftAction'")
  })

  it("blocks 'call-approveRequestAction'", () => {
    expect(regSrc).toContain("'call-approveRequestAction'")
  })

  it("blocks 'call-approveAndSendAction'", () => {
    expect(regSrc).toContain("'call-approveAndSendAction'")
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-006  Bridge review policy blocks bridge execution
// ---------------------------------------------------------------------------

describe('TC-G3-S4-006 bridge review policy blocks bridge execution', () => {
  const bridgeBody = () =>
    regSrc.slice(
      regSrc.indexOf('const BRIDGE_REVIEW_ONLY'),
      regSrc.indexOf('export const VERIAN_POLICY_PROFILES'),
    )

  it("BRIDGE_REVIEW_ONLY blocks 'implement-bridge-code'", () => {
    expect(bridgeBody()).toContain("'implement-bridge-code'")
  })

  it("BRIDGE_REVIEW_ONLY blocks 'route-prompts-between-models'", () => {
    expect(bridgeBody()).toContain("'route-prompts-between-models'")
  })

  it("BRIDGE_REVIEW_ONLY blocks 'automate-model-handoffs'", () => {
    expect(bridgeBody()).toContain("'automate-model-handoffs'")
  })

  it("BRIDGE_REVIEW_ONLY blocks 'execute-bridge-action'", () => {
    expect(bridgeBody()).toContain("'execute-bridge-action'")
  })

  it("BRIDGE_REVIEW_ONLY blocks 'create-bridge-infrastructure'", () => {
    expect(bridgeBody()).toContain("'create-bridge-infrastructure'")
  })

  it("BRIDGE_REVIEW_ONLY requires 'policy-tests-exist' as a check", () => {
    expect(bridgeBody()).toContain("'policy-tests-exist'")
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-007  High-risk policies require Codex and human approval
// ---------------------------------------------------------------------------

describe('TC-G3-S4-007 high-risk policies require Codex and human approval', () => {
  it('HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION requires Codex review and human approval', () => {
    const body = regSrc.slice(
      regSrc.indexOf('const HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION'),
      regSrc.indexOf('const MIGRATION_DESIGN_ONLY'),
    )
    expect(body).toContain('requiresCodexReview: true')
    expect(body).toContain('requiresHumanApproval: true')
  })

  it('HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION lists codex and michael as reviewers', () => {
    const body = regSrc.slice(
      regSrc.indexOf('const HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION'),
      regSrc.indexOf('const MIGRATION_DESIGN_ONLY'),
    )
    expect(body).toContain("'codex'")
    expect(body).toContain("'michael'")
  })

  it('CODEX_REVIEW_REQUIRED requires Codex review and human approval', () => {
    const body = regSrc.slice(
      regSrc.indexOf('const CODEX_REVIEW_REQUIRED'),
      regSrc.indexOf('const BRIDGE_REVIEW_ONLY'),
    )
    expect(body).toContain('requiresCodexReview: true')
    expect(body).toContain('requiresHumanApproval: true')
  })

  it('BRIDGE_REVIEW_ONLY requires Codex review and human approval', () => {
    const body = regSrc.slice(
      regSrc.indexOf('const BRIDGE_REVIEW_ONLY'),
      regSrc.indexOf('export const VERIAN_POLICY_PROFILES'),
    )
    expect(body).toContain('requiresCodexReview: true')
    expect(body).toContain('requiresHumanApproval: true')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-008  Registry has no disallowed imports
// ---------------------------------------------------------------------------

describe('TC-G3-S4-008 registry has no disallowed imports', () => {
  it("imports type-only from @/modules/verian-policy/types", () => {
    expect(regSrc).toContain("from '@/modules/verian-policy/types'")
  })

  it('does not import Supabase clients', () => {
    expect(regSrc).not.toContain('createSupabaseServiceClient')
    expect(regSrc).not.toContain('createSupabaseServerClient')
    expect(regSrc).not.toContain("from '@/lib/supabase")
  })

  it('does not import application modules (services, repos, actions, components)', () => {
    expect(regSrc).not.toContain("from '@/lib/")
    expect(regSrc).not.toContain("from '@/app/")
    expect(regSrc).not.toContain("from '@/actions/")
    expect(regSrc).not.toContain("from '@/components/")
  })

  it('does not import automation or background job modules', () => {
    expect(regSrc).not.toContain('inngest')
    expect(regSrc).not.toContain('enqueueEvent')
  })

  it('does not import bridge modules', () => {
    expect(regSrc).not.toContain("from '@/modules/verian-bridge")
    expect(regSrc).not.toContain("from '@/modules/agent-bridge")
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-009  Types file has no runtime behavior
// ---------------------------------------------------------------------------

describe('TC-G3-S4-009 types file has no runtime behavior', () => {
  it('contains export type declarations', () => {
    expect(typesSrc).toContain('export type')
  })

  it('does not contain export const', () => {
    expect(typesSrc).not.toContain('export const')
  })

  it('does not contain export function or export class', () => {
    expect(typesSrc).not.toContain('export function')
    expect(typesSrc).not.toContain('export class')
  })

  it('has no import statements', () => {
    expect(typesSrc).not.toContain('import {')
    expect(typesSrc).not.toContain('import type')
  })

  it('does not reference Supabase or external application modules', () => {
    expect(typesSrc).not.toContain('supabase')
    expect(typesSrc).not.toContain("from '@/")
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-010  No checker or service file
// ---------------------------------------------------------------------------

describe('TC-G3-S4-010 no checker or service file', () => {
  it('modules/verian-policy/checker.ts does not exist', () => {
    expect(exists('modules/verian-policy/checker.ts')).toBe(false)
  })

  it('modules/verian-policy/service.ts does not exist', () => {
    expect(exists('modules/verian-policy/service.ts')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-011  No bridge directories exist
// ---------------------------------------------------------------------------

describe('TC-G3-S4-011 no bridge directories exist', () => {
  it('modules/verian-bridge does not exist', () => {
    expect(exists('modules/verian-bridge')).toBe(false)
  })

  it('modules/verian-agent-bridge does not exist', () => {
    expect(exists('modules/verian-agent-bridge')).toBe(false)
  })

  it('modules/agent-bridge does not exist', () => {
    expect(exists('modules/agent-bridge')).toBe(false)
  })

  it('modules/bridge does not exist', () => {
    expect(exists('modules/bridge')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S4-012  No policy layer migrations
// ---------------------------------------------------------------------------

describe('TC-G3-S4-012 no policy layer migrations', () => {
  const migDir = path.join(root, 'supabase/migrations')

  it('no migration file name contains verian_policy', () => {
    const files = fs.readdirSync(migDir)
    expect(files.filter(f => f.includes('verian_policy'))).toHaveLength(0)
  })

  it('no migration file name contains policy_registry or policy_profile', () => {
    const files = fs.readdirSync(migDir)
    expect(
      files.filter(f => f.includes('policy_registry') || f.includes('policy_profile')),
    ).toHaveLength(0)
  })

  it('no migration file name contains agent_bridge', () => {
    const files = fs.readdirSync(migDir)
    expect(files.filter(f => f.includes('agent_bridge'))).toHaveLength(0)
  })
})
