import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { checkVerianPromptPolicy } from '@/modules/verian-policy/checker'
import { VERIAN_POLICY_PROFILES, VERIAN_POLICY_REGISTRY } from '@/modules/verian-policy/registry'

const root = path.resolve(__dirname, '..')

const checkerSrc = fs
  .readFileSync(path.join(root, 'modules/verian-policy/checker.ts'), 'utf-8')
  .replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// TC-G3-S6-001  Unknown policy blocks
// ---------------------------------------------------------------------------

describe('TC-G3-S6-001 unknown policy blocks', () => {
  it('returns status blocked for an unknown policyId', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'UNKNOWN_POLICY_XYZ',
      promptText: 'Create a markdown file',
    })
    expect(result.status).toBe('blocked')
  })

  it('includes an issue referencing the unknown policyId', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'UNKNOWN_POLICY_XYZ',
      promptText: 'Create a markdown file',
    })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].message).toContain('UNKNOWN_POLICY_XYZ')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-002  Ambiguous or empty prompt warns
// ---------------------------------------------------------------------------

describe('TC-G3-S6-002 ambiguous or empty prompt warns', () => {
  it('empty promptText produces a warning or blocked result', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: '',
    })
    expect(['warning', 'blocked']).toContain(result.status)
  })

  it('very short promptText is flagged with a warning issue', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'do it',
    })
    const ambiguousIssue = result.issues.find(i => i.message.toLowerCase().includes('short'))
    expect(ambiguousIssue).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-003  Safe docs-only prompt passes
// ---------------------------------------------------------------------------

describe('TC-G3-S6-003 safe docs-only prompt passes', () => {
  it('returns status pass for a clean docs prompt under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'Create the goal 2 productivity report markdown file in docs/roadmap',
    })
    expect(result.status).toBe('pass')
  })

  it('summary starts with PASS for a clean docs prompt', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'Create the goal 2 productivity report markdown file in docs/roadmap',
    })
    expect(result.summary).toMatch(/^PASS/)
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-004  Sending phrases block
// ---------------------------------------------------------------------------

describe('TC-G3-S6-004 sending phrases block', () => {
  it('"send email" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'send email to user',
    })
    expect(result.status).toBe('blocked')
  })

  it('"send campaign" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'send campaign to tenant',
    })
    expect(result.status).toBe('blocked')
  })

  it('"approveAndSendAction" phrase blocks under MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
      promptText: 'call approveAndSendAction to trigger the send flow',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-005  Enable sending flags block under all current profiles
// ---------------------------------------------------------------------------

describe('TC-G3-S6-005 enable sending flags block under all current profiles', () => {
  it('"enable EMAIL_SENDING_ENABLED" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'enable EMAIL_SENDING_ENABLED in system controls',
    })
    expect(result.status).toBe('blocked')
  })

  it('"enable EMAIL_SENDING_ENABLED" blocks under MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
      promptText: 'enable EMAIL_SENDING_ENABLED in system controls',
    })
    expect(result.status).toBe('blocked')
  })

  it('"enable CAMPAIGN_SENDING_ENABLED" blocks under HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
      promptText: 'enable CAMPAIGN_SENDING_ENABLED',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-006  Production phrases block
// ---------------------------------------------------------------------------

describe('TC-G3-S6-006 production phrases block', () => {
  it('"touch production" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'touch production database',
    })
    expect(result.status).toBe('blocked')
  })

  it('"deploy to production" blocks under MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
      promptText: 'deploy to production environment',
    })
    expect(result.status).toBe('blocked')
  })

  it('"production database" blocks under STAGING_VERIFICATION_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'STAGING_VERIFICATION_ONLY',
      promptText: 'run query against the production database',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-007  Generic migration phrases block
// ---------------------------------------------------------------------------

describe('TC-G3-S6-007 generic migration phrases block', () => {
  it('"apply migration" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'apply migration to the database',
    })
    expect(result.status).toBe('blocked')
  })

  it('"apply migration" blocks under MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
      promptText: 'apply migration 20240040',
    })
    expect(result.status).toBe('blocked')
  })

  it('"run migration" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'run migration against the schema',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-008  Staging migration specificity
// ---------------------------------------------------------------------------

describe('TC-G3-S6-008 staging migration specificity', () => {
  it('"run staging migration apply" does not block under STAGING_VERIFICATION_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'STAGING_VERIFICATION_ONLY',
      promptText: 'run staging migration apply for the schema',
    })
    expect(result.status).not.toBe('blocked')
  })

  it('"run staging migration apply" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'run staging migration apply',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-009  Apply migration to production always blocks
// ---------------------------------------------------------------------------

describe('TC-G3-S6-009 apply migration to production always blocks', () => {
  it('"apply migration to production" blocks even under STAGING_VERIFICATION_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'STAGING_VERIFICATION_ONLY',
      promptText: 'apply migration to production after staging passes',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-010  Create migration file specificity
// ---------------------------------------------------------------------------

describe('TC-G3-S6-010 create migration file specificity', () => {
  it('"create migration file" does not block under MIGRATION_DESIGN_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MIGRATION_DESIGN_ONLY',
      promptText: 'create migration file for the new campaign_types table',
    })
    expect(result.status).not.toBe('blocked')
  })

  it('"create migration file" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'create migration file 20240041',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-011  Automation phrases block
// ---------------------------------------------------------------------------

describe('TC-G3-S6-011 automation phrases block', () => {
  it('"create background job" blocks under LOW_RISK_DOCS_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'create background job to process emails',
    })
    expect(result.status).toBe('blocked')
  })

  it('"background job" blocks under MEDIUM_RISK_BACKEND_NO_MIGRATION', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'MEDIUM_RISK_BACKEND_NO_MIGRATION',
      promptText: 'register a background job for processing',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-012  Bridge phrases block
// ---------------------------------------------------------------------------

describe('TC-G3-S6-012 bridge phrases block', () => {
  it('"route prompts between models" blocks under BRIDGE_REVIEW_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'BRIDGE_REVIEW_ONLY',
      promptText: 'route prompts between models via the bridge',
    })
    expect(result.status).toBe('blocked')
  })

  it('"implement bridge" blocks under BRIDGE_REVIEW_ONLY', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'BRIDGE_REVIEW_ONLY',
      promptText: 'implement bridge to connect Claude and Codex',
    })
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-013  High-risk policy reviewer warnings
// ---------------------------------------------------------------------------

describe('TC-G3-S6-013 high-risk policy reviewer warnings', () => {
  it('prompt without Codex mention produces warning under HIGH_RISK_DEV policy', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
      promptText: 'Implement the campaign sequence step repository file',
    })
    const codexWarning = result.issues.find(
      i => i.severity === 'warning' && i.message.toLowerCase().includes('codex'),
    )
    expect(codexWarning).toBeDefined()
  })

  it('prompt without approval mention produces warning under HIGH_RISK_DEV policy', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
      promptText: 'Implement the campaign sequence step repository file',
    })
    const approvalWarning = result.issues.find(
      i => i.severity === 'warning' && i.message.toLowerCase().includes('approval'),
    )
    expect(approvalWarning).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-014  Required evidence warnings
// ---------------------------------------------------------------------------

describe('TC-G3-S6-014 required evidence warnings', () => {
  it('partial evidenceProvided produces missing-evidence warnings', () => {
    const result = checkVerianPromptPolicy({
      policyId: 'LOW_RISK_DOCS_ONLY',
      promptText: 'Create the goal 2 productivity report markdown file in docs/roadmap',
      evidenceProvided: ['git-status'],
    })
    const evidenceWarning = result.issues.find(
      i => i.severity === 'warning' && i.message.toLowerCase().includes('missing'),
    )
    expect(evidenceWarning).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-015  Registry correctness
// ---------------------------------------------------------------------------

describe('TC-G3-S6-015 registry correctness', () => {
  it('VERIAN_POLICY_PROFILES contains exactly 8 profiles', () => {
    expect(VERIAN_POLICY_PROFILES).toHaveLength(8)
  })

  it('every VERIAN_POLICY_PROFILES entry exists in VERIAN_POLICY_REGISTRY', () => {
    for (const profile of VERIAN_POLICY_PROFILES) {
      expect(VERIAN_POLICY_REGISTRY[profile.policyId]).toBeDefined()
      expect(VERIAN_POLICY_REGISTRY[profile.policyId].policyId).toBe(profile.policyId)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G3-S6-016  Checker source safety
// ---------------------------------------------------------------------------

describe('TC-G3-S6-016 checker source safety', () => {
  it('does not import Supabase clients', () => {
    expect(checkerSrc).not.toContain('createSupabaseServiceClient')
    expect(checkerSrc).not.toContain('createSupabaseServerClient')
    expect(checkerSrc).not.toContain("from '@/lib/supabase")
  })

  it('does not import application modules (services, repos, actions, components)', () => {
    expect(checkerSrc).not.toContain("from '@/lib/")
    expect(checkerSrc).not.toContain("from '@/app/")
    expect(checkerSrc).not.toContain("from '@/actions/")
    expect(checkerSrc).not.toContain("from '@/components/")
  })

  it('does not import automation or bridge modules', () => {
    expect(checkerSrc).not.toContain('inngest')
    expect(checkerSrc).not.toContain('enqueueEvent')
    expect(checkerSrc).not.toContain("from '@/modules/verian-bridge")
    expect(checkerSrc).not.toContain("from '@/modules/agent-bridge")
  })

  it('does not call model APIs', () => {
    expect(checkerSrc).not.toContain("from '@anthropic")
    expect(checkerSrc).not.toContain("from 'openai'")
    expect(checkerSrc).not.toContain('chat.completions')
    expect(checkerSrc).not.toContain('messages.create')
  })

  it('does not execute shell commands', () => {
    expect(checkerSrc).not.toContain('exec(')
    expect(checkerSrc).not.toContain('spawn(')
    expect(checkerSrc).not.toContain('execSync(')
  })

  it('does not import fs or path', () => {
    expect(checkerSrc).not.toContain("from 'fs'")
    expect(checkerSrc).not.toContain("from 'node:fs'")
    expect(checkerSrc).not.toContain("from 'path'")
    expect(checkerSrc).not.toContain("from 'node:path'")
  })

  it('does not modify files or inspect live Git state', () => {
    expect(checkerSrc).not.toContain('readFileSync')
    expect(checkerSrc).not.toContain('writeFileSync')
    expect(checkerSrc).not.toContain('git log')
    expect(checkerSrc).not.toContain('git status')
  })
})
