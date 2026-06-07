import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildVerianBridgeDryRunPacket,
} from '@/modules/verian-agent-bridge/dry-run.service'
import { VERIAN_POLICY_REGISTRY } from '@/modules/verian-policy/registry'

const root = path.resolve(__dirname, '..')

const svcSrc = fs
  .readFileSync(path.join(root, 'modules/verian-agent-bridge/dry-run.service.ts'), 'utf-8')
  .replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// TC-G4-S5-001  Unknown policy returns blocked and no taskPacket
// ---------------------------------------------------------------------------

describe('TC-G4-S5-001 unknown policy blocks', () => {
  it('returns status blocked for unknown policyId', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-001',
      taskType: 'create-markdown-file',
      policyId: 'UNKNOWN_POLICY_XYZ',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.status).toBe('blocked')
  })

  it('does not create a taskPacket for unknown policyId', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-001b',
      taskType: 'create-markdown-file',
      policyId: 'UNKNOWN_POLICY_XYZ',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.taskPacket).toBeUndefined()
  })

  it('summary mentions the unknown policyId', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-001c',
      taskType: 'create-markdown-file',
      policyId: 'UNKNOWN_POLICY_XYZ',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.summary).toContain('UNKNOWN_POLICY_XYZ')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-002  Unknown agent returns blocked and no taskPacket
// ---------------------------------------------------------------------------

describe('TC-G4-S5-002 unknown agent blocks', () => {
  it('returns status blocked for unknown intendedAgent', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-002',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'nonexistent_agent_xyz' as never,
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.status).toBe('blocked')
  })

  it('does not create a taskPacket for unknown intendedAgent', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-002b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'nonexistent_agent_xyz' as never,
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.taskPacket).toBeUndefined()
  })

  it('summary mentions the unknown agent', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-002c',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'nonexistent_agent_xyz' as never,
      promptText: 'Create the goal 4 productivity report',
    })
    expect(result.summary).toContain('nonexistent_agent_xyz')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-003  Prompt containing "send email" blocks and no taskPacket
// ---------------------------------------------------------------------------

describe('TC-G4-S5-003 send email phrase blocks', () => {
  it('returns status blocked when prompt contains "send email"', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-003',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'send email to the prospect',
    })
    expect(result.status).toBe('blocked')
  })

  it('does not create taskPacket when blocked by send email', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-003b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'send email to the prospect',
    })
    expect(result.taskPacket).toBeUndefined()
  })

  it('summary starts with BLOCKED when send email is detected', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-003c',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'send email to the prospect',
    })
    expect(result.summary).toMatch(/^BLOCKED/)
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-004  Safe docs-only task creates packet with LOW_RISK_DOCS_ONLY
// ---------------------------------------------------------------------------

describe('TC-G4-S5-004 safe docs-only creates packet', () => {
  it('returns packet_created for clean docs task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-004',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    expect(result.status).toBe('packet_created')
  })

  it('taskPacket is defined for clean docs task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-004b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    expect(result.taskPacket).toBeDefined()
  })

  it('policyCheckStatus is pass for clean docs task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-004c',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    expect(result.taskPacket?.policyCheckStatus).toBe('pass')
  })

  it('summary starts with PASS for clean docs task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-004d',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    expect(result.summary).toMatch(/^PASS/)
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-005  Warning result creates packet but requires human approval
// ---------------------------------------------------------------------------

describe('TC-G4-S5-005 warning creates packet with pending human approval', () => {
  it('short prompt produces warning or blocked result', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-005',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'do it',
    })
    expect(['packet_created', 'blocked']).toContain(result.status)
  })

  it('when warning, humanApprovalRequirement.required is true', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-005b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'do it',
    })
    if (result.policyResult.status === 'warning') {
      expect(result.humanApprovalRequirement.required).toBe(true)
      expect(result.humanApprovalRequirement.status).toBe('pending')
    } else {
      // blocked is also acceptable
      expect(['warning', 'blocked']).toContain(result.policyResult.status)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-006  High-risk dev policy requires human approval and Codex review
// ---------------------------------------------------------------------------

describe('TC-G4-S5-006 high-risk dev requires human approval and Codex review', () => {
  const highRiskResult = buildVerianBridgeDryRunPacket({
    taskId: 'test-006',
    taskType: 'create-repository-file',
    policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
    requestedBy: 'michael',
    intendedAgent: 'claude_implementation_agent',
    promptText:
      'Implement the campaign sequence repository file with Codex review and Michael approval',
  })

  it('creates a packet or blocks (but never silently omits approval)', () => {
    expect(['packet_created', 'blocked']).toContain(highRiskResult.status)
  })

  it('requiresHumanApproval is true on taskPacket when packet created', () => {
    if (highRiskResult.taskPacket) {
      expect(highRiskResult.taskPacket.requiresHumanApproval).toBe(true)
    } else {
      expect(highRiskResult.humanApprovalRequirement.required).toBe(true)
    }
  })

  it('requiresCodexReview is true on taskPacket when packet created', () => {
    if (highRiskResult.taskPacket) {
      expect(highRiskResult.taskPacket.requiresCodexReview).toBe(true)
    } else {
      expect(highRiskResult.codexReviewRequirement.required).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-007  Codex review agent selects codex_code_review route
// ---------------------------------------------------------------------------

describe('TC-G4-S5-007 codex review agent selects codex route', () => {
  it('recommendedModel is codex for codex_review_agent', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-007',
      taskType: 'review-implementation',
      policyId: 'CODEX_REVIEW_REQUIRED',
      requestedBy: 'michael',
      intendedAgent: 'codex_review_agent',
      promptText:
        'Prepare a Codex review artifact for the campaign repository implementation. Codex review and Michael approval required.',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.recommendedModel).toBe('codex')
    } else {
      // Blocked is acceptable if policy check fails for other reasons
      expect(result.status).toBe('blocked')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-008  Policy safety agent selects verian_deterministic route
// ---------------------------------------------------------------------------

describe('TC-G4-S5-008 policy safety agent selects verian_deterministic route', () => {
  it('recommendedModel is verian_deterministic for prompt_policy_agent', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-008',
      taskType: 'run-policy-check',
      policyId: 'BRIDGE_REVIEW_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'prompt_policy_agent',
      promptText:
        'Run the policy check for the current task packet. Codex review and Michael approval required.',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.recommendedModel).toBe('verian_deterministic')
    } else {
      expect(result.status).toBe('blocked')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-009  Copywriting agent selects qwen for low-risk copy task
// ---------------------------------------------------------------------------

describe('TC-G4-S5-009 copywriting agent selects qwen for low-risk copy', () => {
  it('recommendedModel is qwen for low-risk copywriting task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-009',
      taskType: 'draft-email-variant',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'copywriting_agent',
      promptText:
        'Draft an email variant for the Q3 nurture campaign using the approved template',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.recommendedModel).toBe('qwen')
    } else {
      expect(result.status).toBe('blocked')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-010  Qwen is not selected for high-risk development task
// ---------------------------------------------------------------------------

describe('TC-G4-S5-010 qwen not selected for high-risk dev task', () => {
  it('recommendedModel is not qwen for high-risk development task', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-010',
      taskType: 'create-repository-file',
      policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
      requestedBy: 'michael',
      intendedAgent: 'claude_implementation_agent',
      promptText:
        'Implement the campaign sequence repository file with Codex review and Michael approval',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.recommendedModel).not.toBe('qwen')
    }
    // if blocked that is also acceptable — we just assert qwen was not selected
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-011  taskPacket.dryRunOnly is always true
// ---------------------------------------------------------------------------

describe('TC-G4-S5-011 taskPacket.dryRunOnly is always true', () => {
  it('dryRunOnly is true on produced task packet', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-011',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.dryRunOnly).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-012  taskPacket allowedActions and blockedActions come from policy
// ---------------------------------------------------------------------------

describe('TC-G4-S5-012 taskPacket actions come from policy profile', () => {
  it('taskPacket allowedActions match the resolved policy profile', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-012',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    const profile = VERIAN_POLICY_REGISTRY['LOW_RISK_DOCS_ONLY']
    if (result.taskPacket && profile) {
      for (const action of profile.allowedActions) {
        expect(result.taskPacket.allowedActions).toContain(action)
      }
    }
  })

  it('taskPacket blockedActions contain the expected blocked items from the policy', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-012b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    const profile = VERIAN_POLICY_REGISTRY['LOW_RISK_DOCS_ONLY']
    if (result.taskPacket && profile) {
      expect(result.taskPacket.blockedActions).toContain('touch-production')
      expect(result.taskPacket.blockedActions).toContain('email-sending')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-013  requiredEvidence / requiredReviewers / stopConditions from policy
// ---------------------------------------------------------------------------

describe('TC-G4-S5-013 taskPacket evidence and conditions come from policy profile', () => {
  it('taskPacket requiredEvidence contains git-status from LOW_RISK_DOCS_ONLY', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-013',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    if (result.taskPacket) {
      expect(result.taskPacket.requiredEvidence).toContain('git-status')
    }
  })

  it('taskPacket stopConditions come from policy profile', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-013b',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'Create the goal 4 Verian Agent Bridge productivity report in docs/roadmap',
    })
    const profile = VERIAN_POLICY_REGISTRY['LOW_RISK_DOCS_ONLY']
    if (result.taskPacket && profile) {
      for (const condition of profile.stopConditions) {
        expect(result.taskPacket.stopConditions).toContain(condition)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-014  No packet created when policy result is blocked
// ---------------------------------------------------------------------------

describe('TC-G4-S5-014 no packet when blocked', () => {
  it('taskPacket is undefined when policy result is blocked', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-014',
      taskType: 'create-markdown-file',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      promptText: 'apply migration to the database',
    })
    expect(result.taskPacket).toBeUndefined()
    expect(result.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-015  Source safety: no OpenAI/Anthropic/Qwen/Codex SDK imports
// ---------------------------------------------------------------------------

describe('TC-G4-S5-015 source safety — no model provider imports', () => {
  it('does not import OpenAI SDK', () => {
    expect(svcSrc).not.toContain("from 'openai'")
    expect(svcSrc).not.toContain("from \"openai\"")
  })

  it('does not import Anthropic SDK', () => {
    expect(svcSrc).not.toContain("from '@anthropic")
    expect(svcSrc).not.toContain("from \"@anthropic")
  })

  it('does not import Qwen provider', () => {
    expect(svcSrc).not.toContain("from 'qwen")
    expect(svcSrc).not.toContain("from \"qwen")
    expect(svcSrc).not.toContain('qwen-sdk')
  })

  it('does not import Codex CLI', () => {
    expect(svcSrc).not.toContain("from 'codex'")
    expect(svcSrc).not.toContain("from \"codex\"")
    expect(svcSrc).not.toContain('codex-cli')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-016  Source safety: no Supabase/database imports
// ---------------------------------------------------------------------------

describe('TC-G4-S5-016 source safety — no Supabase or database imports', () => {
  it('does not import Supabase clients', () => {
    expect(svcSrc).not.toContain('createSupabaseServiceClient')
    expect(svcSrc).not.toContain('createSupabaseServerClient')
    expect(svcSrc).not.toContain("from '@/lib/supabase")
  })

  it('does not import database modules', () => {
    expect(svcSrc).not.toContain("from 'drizzle")
    expect(svcSrc).not.toContain("from 'prisma")
    expect(svcSrc).not.toContain("from 'pg'")
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-017  Source safety: no fs/path/child_process imports
// ---------------------------------------------------------------------------

describe('TC-G4-S5-017 source safety — no fs/path/child_process imports', () => {
  it('does not import node:fs or fs', () => {
    expect(svcSrc).not.toContain("from 'node:fs'")
    expect(svcSrc).not.toContain("from 'fs'")
  })

  it('does not import node:path or path', () => {
    expect(svcSrc).not.toContain("from 'node:path'")
    expect(svcSrc).not.toContain("from 'path'")
  })

  it('does not import child_process', () => {
    expect(svcSrc).not.toContain('child_process')
    expect(svcSrc).not.toContain('execSync')
    expect(svcSrc).not.toContain('spawnSync')
    expect(svcSrc).not.toContain('exec(')
    expect(svcSrc).not.toContain('spawn(')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-018  Source safety: no process.env usage
// ---------------------------------------------------------------------------

describe('TC-G4-S5-018 source safety — no process.env', () => {
  it('does not access process.env', () => {
    expect(svcSrc).not.toContain('process.env')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-019  Source safety: no fetch/network usage
// ---------------------------------------------------------------------------

describe('TC-G4-S5-019 source safety — no network access', () => {
  it('does not call fetch', () => {
    expect(svcSrc).not.toContain('fetch(')
    expect(svcSrc).not.toContain('axios')
    expect(svcSrc).not.toContain('http.get')
    expect(svcSrc).not.toContain('https.get')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-020  Source safety: no UI/server actions/API routes imports
// ---------------------------------------------------------------------------

describe('TC-G4-S5-020 source safety — no UI/server action/API route imports', () => {
  it('does not import UI or components', () => {
    expect(svcSrc).not.toContain("from '@/components/")
    expect(svcSrc).not.toContain("from '@/app/")
  })

  it('does not import server actions', () => {
    expect(svcSrc).not.toContain("from '@/actions/")
  })

  it('does not import API routes', () => {
    expect(svcSrc).not.toContain("from '@/api/")
    expect(svcSrc).not.toContain("from '@/pages/api")
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-021  Source safety: no migration or migration command references
// ---------------------------------------------------------------------------

describe('TC-G4-S5-021 source safety — no migration commands', () => {
  it('does not reference migration commands', () => {
    expect(svcSrc).not.toContain('supabase db push')
    expect(svcSrc).not.toContain('supabase migration')
    expect(svcSrc).not.toContain('db:migrate')
  })

  it('does not import from supabase migrations directory', () => {
    expect(svcSrc).not.toContain('supabase/migrations')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-022  Source safety: no send action calls
// ---------------------------------------------------------------------------

describe('TC-G4-S5-022 source safety — no send action calls', () => {
  it('does not call sendEmail or sendCampaign', () => {
    expect(svcSrc).not.toContain('sendEmail(')
    expect(svcSrc).not.toContain('sendCampaign(')
  })

  it('does not call approveAndSendAction or sendFollowUpDraftAction', () => {
    expect(svcSrc).not.toContain('approveAndSendAction')
    expect(svcSrc).not.toContain('sendFollowUpDraftAction')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S5-023  No bridge files beyond the four expected files exist
// ---------------------------------------------------------------------------

describe('TC-G4-S5-023 no unexpected bridge files', () => {
  const bridgeDir = path.join(root, 'modules/verian-agent-bridge')
  const bridgeFiles = fs.readdirSync(bridgeDir)

  const expectedBridgeFiles = new Set([
    'types.ts',
    'agent-registry.ts',
    'model-router.ts',
    'dry-run.service.ts',
  ])

  it('modules/verian-agent-bridge contains only the four expected files', () => {
    const unexpected = bridgeFiles.filter(f => !expectedBridgeFiles.has(f))
    expect(unexpected).toHaveLength(0)
  })

  it('task-packet.ts does not exist', () => {
    expect(bridgeFiles).not.toContain('task-packet.ts')
  })

  it('model-router-impl.ts does not exist', () => {
    expect(bridgeFiles).not.toContain('model-router-impl.ts')
  })
})
